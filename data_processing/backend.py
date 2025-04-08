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
    return stats[["SEASON_ID", "PTS", "AST", "REB", "STL", "BLK"]].to_dict(orient="records")

def get_player_seasons(name):
    match = players.find_players_by_full_name(name)
    if not match:
        return None
    player_id = match[0]['id']
    stats = playercareerstats.PlayerCareerStats(player_id=player_id).get_data_frames()[0]
    
    # Extract season IDs (e.g., '2023-24'), ensure uniqueness
    seasons = stats["SEASON_ID"].dropna().unique().tolist()
    seasons = sorted(seasons, reverse=True)  # Most recent first
    return seasons



@app.route("/player-stats")
def player_stats():
    name = request.args.get("name")
    data = get_player_stats(name)
    if not data:
        return jsonify({"error": "Player not found"}), 404
    return jsonify(data)

def get_player_game_logs(player_id, season='2024'):
    logs = playergamelog.PlayerGameLog(player_id=player_id, season=season)
    df = logs.get_data_frames()[0]
    return df

@app.route("/player-games")
def player_games():
    name = request.args.get("name")
    season = request.args.get("season", "2024")  # Default to current season

    match = players.find_players_by_full_name(name)
    if not match:
        return jsonify({"error": "Player not found"}), 404

    player_id = match[0]['id']
    df = get_player_game_logs(player_id, season)

    # Columns/Features of interest
    filtered = df[["GAME_DATE", "MATCHUP", "WL", "PTS", "AST", "REB", "STL", "BLK"]]
    return jsonify(filtered.to_dict(orient="records"))

@app.route("/player-seasons")
def player_seasons():
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "Missing player name"}), 400

    seasons = get_player_seasons(name)
    if not seasons:
        return jsonify({"error": "No seasons found for player"}), 404
    return jsonify(seasons)

@app.route("/player-suggestions")
def player_suggestions():
    query = request.args.get("query", "").lower()
    if not query:
        return jsonify([])  # Return an empty list if no query is provided

    # Get all players
    all_players = players.get_players()

    # Separate active and retired players
    active_players = [
        player["full_name"]
        for player in players.get_active_players()
        if query in player["full_name"].lower()
    ]

    retired_players = [
        player["full_name"]
        for player in all_players
        if query in player["full_name"].lower() and player["full_name"] not in active_players
    ]

    # prio active players
    combined_results = active_players + retired_players
    return jsonify(combined_results[:10])

if __name__ == "__main__":
    app.run(debug=True)
