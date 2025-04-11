from flask import Flask, request, jsonify
from flask_cors import CORS
from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats, playergamelog
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

# ------------------------ PLAYER STATS ------------------------

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

# ------------------------ PLAYER SEASONS ------------------------

def get_player_seasons(name):
    match = players.find_players_by_full_name(name)
    if not match:
        return None
    player_id = match[0]['id']
    stats = playercareerstats.PlayerCareerStats(player_id=player_id).get_data_frames()[0]
    seasons = stats["SEASON_ID"].dropna().unique().tolist()
    seasons = sorted(seasons, reverse=True)
    return seasons

@app.route("/player-seasons")
def player_seasons():
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "Missing player name"}), 400

    seasons = get_player_seasons(name)
    if not seasons:
        return jsonify({"error": "No seasons found for player"}), 404
    return jsonify(seasons)

# ------------------------ PLAYER AUTOCOMPLETE ------------------------

@app.route("/player-suggestions")
def player_suggestions():
    query = request.args.get("query", "").lower()
    if not query:
        return jsonify([])

    all_players = players.get_players()
    active_players = [
        p["full_name"] for p in players.get_active_players()
        if query in p["full_name"].lower()
    ]
    retired_players = [
        p["full_name"] for p in all_players
        if query in p["full_name"].lower() and p["full_name"] not in active_players
    ]
    return jsonify((active_players + retired_players)[:10])

# ------------------------ GAME LOGS + FILTERS ------------------------

def get_player_game_logs(player_id, season='2024'):
    logs = playergamelog.PlayerGameLog(player_id=player_id, season=season)
    df = logs.get_data_frames()[0]
    return df

@app.route("/player-games")
def player_games():
    name = request.args.get("name")
    season = request.args.get("season", "2024")
    location = request.args.get("location")
    opponent = request.args.get("vs")
    include_consistency = request.args.get("include_consistency", "false").lower() == "true"

    match = players.find_players_by_full_name(name)
    if not match:
        return jsonify({"error": "Player not found"}), 404

    player_id = match[0]['id']
    df = get_player_game_logs(player_id, season)

    # Formats GAME_DATE
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])

    # Applys filters
    if location == "home":
        df = df[df["MATCHUP"].str.contains("vs.")]
    elif location == "away":
        df = df[df["MATCHUP"].str.contains("@")]
    if opponent:
        df = df[df["MATCHUP"].str.contains(opponent.upper())]

    # Base columns
    filtered = df[["GAME_DATE", "MATCHUP", "WL", "PTS", "AST", "REB", "STL", "BLK"]]
    filtered = filtered.sort_values("GAME_DATE")

    # Adds consistency fields
    if include_consistency:
        for stat in ["PTS", "AST", "REB"]:
            filtered[f"{stat}_ROLLING_AVG"] = filtered[stat].rolling(5).mean().round(2)
            filtered[f"{stat}_ROLLING_STD"] = filtered[stat].rolling(5).std().round(2)

    # Cleans NaN → null for frontend
    filtered = filtered.replace({np.nan: None})
    return jsonify(filtered.to_dict(orient="records"))

# ------------------------

if __name__ == "__main__":
    app.run(debug=True)