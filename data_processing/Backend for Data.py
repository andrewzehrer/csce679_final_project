from flask import Flask, request, jsonify
from flask_cors import CORS
from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats, playergamelog
import pandas as pd

app = Flask(__name__)
CORS(app)

def get_player_stats(name):
    match = players.find_players_by_full_name(name)
    if not match:
        return None
    player_id = match[0]['id']
    stats = playercareerstats.PlayerCareerStats(player_id=player_id).get_data_frames()[0]
    filtered = stats[["SEASON_ID", "PTS", "AST", "REB", "STL", "BLK"]]
    filtered = filtered.where(pd.notnull(filtered), None)
    return filtered.to_dict(orient="records")

@app.route("/player-stats")
def player_stats():
    name = request.args.get("name")
    data = get_player_stats(name)
    if not data:
        return jsonify({"error": "Player not found"}), 404
    return jsonify(data)

def get_player_game_logs(player_id, season='2023'):
    logs = playergamelog.PlayerGameLog(player_id=player_id, season=season)
    df = logs.get_data_frames()[0]
    return df

@app.route("/player-games")
def player_games():
    name = request.args.get("name")
    season = request.args.get("season", "2023")
    location = request.args.get("location")  # 'home' or 'away'
    opponent = request.args.get("vs")        # Team abbreviation (e.g., 'LAL')
    include_consistency = request.args.get("include_consistency", "false").lower() == "true"

    match = players.find_players_by_full_name(name)
    if not match:
        return jsonify({"error": "Player not found"}), 404

    player_id = match[0]['id']
    df = get_player_game_logs(player_id, season)

    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])

    # Apply home/away filter
    if location == "home":
        df = df[df["MATCHUP"].str.contains("vs.")]
    elif location == "away":
        df = df[df["MATCHUP"].str.contains("@")]

    # Apply opponent filter
    if opponent:
        df = df[df["MATCHUP"].str.contains(opponent.upper())]

    # Select and clean columns
    filtered = df[["GAME_DATE", "MATCHUP", "WL", "PTS", "AST", "REB", "STL", "BLK"]]
    filtered = filtered.sort_values("GAME_DATE")
    filtered = filtered.where(pd.notnull(filtered), None)

    # Adds consistency analysis
    if include_consistency:
        for stat in ["PTS", "AST", "REB"]:
            filtered[f"{stat}_ROLLING_AVG"] = df[stat].rolling(5).mean().round(2)
            filtered[f"{stat}_ROLLING_STD"] = df[stat].rolling(5).std().round(2)
        filtered = filtered.where(pd.notnull(filtered), None)

    return jsonify(filtered.to_dict(orient="records"))

if __name__ == "__main__":
    app.run(debug=True)

