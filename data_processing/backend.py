from flask import Flask, request, jsonify
from flask_cors import CORS
from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats, playergamelog, commonplayerinfo
import numpy as np

app = Flask(__name__)
CORS(app)

# ------------------------ PLAYER GAME LOGS ------------------------
# Retrieves the game logs for a specific player in a given season.
def get_player_game_logs(player_id, season='2024'):
    logs = playergamelog.PlayerGameLog(player_id=player_id, season=season)
    df = logs.get_data_frames()[0]
    return df

# Process data and return it in a JSON format
@app.route("/player-games")
def player_games():
    name = request.args.get("name")
    season = request.args.get("season", "2024")

    match = players.find_players_by_full_name(name)
    if not match:
        return jsonify({"error": "Player not found"}), 404

    player_id = match[0]['id']
    df = get_player_game_logs(player_id, season)

    # Base columns
    filtered = df[["GAME_DATE", "MATCHUP", "WL", "PTS", "AST", "REB", "STL", "BLK"]]
    filtered = filtered.sort_values("GAME_DATE")

    # Cleans NaN -> None in data
    filtered = filtered.replace({np.nan: None})
    return jsonify(filtered.to_dict(orient="records"))

# ------------------------ PLAYER SEASONS ------------------------
# Retrieves the seasons a player has played in the NBA.
def get_player_seasons(name):
    match = players.find_players_by_full_name(name)
    if not match:
        return None
    player_id = match[0]['id']
    stats = playercareerstats.PlayerCareerStats(player_id=player_id).get_data_frames()[0]
    seasons = stats["SEASON_ID"].dropna().unique().tolist()
    seasons = sorted(seasons, reverse=True)
    return seasons

# Process data and return it in a JSON format
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
# Retrieves a list of player names based on a query string.
@app.route("/player-suggestions")
def player_suggestions():
    query = request.args.get("query", "").lower()
    if not query:
        return jsonify([])

    # Get all players and active players
    all_players = players.get_players()
    active_player_list = players.get_active_players()

    # Filter players based on the query
    active_players_set = {
        p["full_name"] for p in active_player_list if query in p["full_name"].lower()
    }

    # Limit the number of active players to 10
    active_players = list(active_players_set)[:10]

    # Sort active players alphabetically
    active_players.sort()

    # Filter retired players based on the query and limit to 5
    retired_players = [
        p["full_name"]
        for p in all_players
        if query in p["full_name"].lower() and p["full_name"] not in active_players_set
    ][:5]

    # Return the combined list of active and retired players
    return jsonify(active_players + retired_players)

# ------------------------ PLAYER BIO ------------------------
# Retrieves the bio info of a player.
def get_player_bio(name):
    from nba_api.stats.static import players
    player = players.find_players_by_full_name(name)[0]
    player_id = player["id"]
    
    info = commonplayerinfo.CommonPlayerInfo(player_id)
    bio_data = info.get_normalized_dict()["CommonPlayerInfo"][0]

    portrait_url = f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png"
    team_id = bio_data["TEAM_ID"]
    team_logo_url = f"https://cdn.nba.com/logos/nba/{team_id}/global/L/logo.svg"

    # Return JSON data
    return {
        "name": bio_data["DISPLAY_FIRST_LAST"],
        "team": bio_data["TEAM_NAME"],
        "team_abbr": bio_data["TEAM_ABBREVIATION"],
        "birthdate": bio_data["BIRTHDATE"],
        "height": bio_data["HEIGHT"],
        "weight": bio_data["WEIGHT"],
        "school": bio_data["SCHOOL"],
        "experience": bio_data["SEASON_EXP"],
        "portrait_url": portrait_url,
        "team_logo_url": team_logo_url
    }

# Error checking before sending the request
@app.route("/player-bio")
def player_bio():
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "Missing player name"}), 400
    try:
        return get_player_bio(name)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)