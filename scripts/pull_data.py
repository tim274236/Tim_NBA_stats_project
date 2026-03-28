"""
pull_data.py — Fetch real NBA shot chart data using nba_api

This script pulls shot chart data (x,y coordinates for every shot attempt)
for NBA players and saves it as JSON files that the Shot Chart Explorer app
can load directly.

USAGE:
    python pull_data.py                          # All active players, current season
    python pull_data.py --season 2024-25         # Specific season
    python pull_data.py --limit 10               # Only first 10 players (for testing)
    python pull_data.py --top 50                 # Top 50 scorers only
    python pull_data.py --season 2024-25 --top 50 --limit 5

OUTPUT:
    ../data/players.json                         # Player index (id, name, team)
    ../data/shots/{season}/{player_id}.json      # Shot data per player

REQUIREMENTS:
    pip install nba_api
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

# ============================================================
# nba_api imports
# ============================================================
try:
    from nba_api.stats.static import players as static_players
    from nba_api.stats.static import teams as static_teams
    from nba_api.stats.endpoints import shotchartdetail
    from nba_api.stats.endpoints import leagueleaders
except ImportError:
    print("ERROR: nba_api is not installed.")
    print("Run: pip install nba_api")
    sys.exit(1)


def get_current_season():
    """
    Figure out the current NBA season string (e.g., '2024-25').
    The NBA season starts in October, so:
      - If it's Oct-Dec 2024, the season is '2024-25'
      - If it's Jan-Sep 2025, the season is '2024-25'
    """
    now = datetime.now()
    year = now.year
    month = now.month

    if month >= 10:
        # We're in the start of a new season (Oct-Dec)
        start_year = year
    else:
        # We're in the second half of the season (Jan-Sep)
        start_year = year - 1

    end_year = start_year + 1
    return f"{start_year}-{str(end_year)[-2:]}"


def get_team_map():
    """
    Build a dictionary mapping team ID → team info (name, abbreviation).
    Uses the static data bundled with nba_api (no API call needed).
    """
    teams = static_teams.get_teams()
    return {t["id"]: {"name": t["full_name"], "abbreviation": t["abbreviation"]} for t in teams}


def get_top_scorers(season, top_n=50):
    """
    Fetch the top N scorers for a given season from the league leaders endpoint.
    Returns a list of player IDs.
    """
    print(f"  Fetching top {top_n} scorers for {season}...")
    try:
        leaders = leagueleaders.LeagueLeaders(
            season=season,
            stat_category_abbreviation="PTS",
            per_mode48="PerGame"
        )
        data = leaders.get_normalized_dict()["LeagueLeaders"]
        top_ids = [player["PLAYER_ID"] for player in data[:top_n]]
        print(f"  Found {len(top_ids)} players.")
        return top_ids
    except Exception as e:
        print(f"  WARNING: Could not fetch league leaders: {e}")
        print(f"  Falling back to all active players.")
        return None


def get_player_shots(player_id, season, team_id=0):
    """
    Fetch all shot chart data for a single player in a given season.

    Returns a list of shot dictionaries, each containing:
      - LOC_X, LOC_Y (court coordinates, origin at basket)
      - SHOT_MADE_FLAG (1=made, 0=missed)
      - SHOT_TYPE ('2PT Field Goal' or '3PT Field Goal')
      - SHOT_ZONE_BASIC (e.g., 'Restricted Area', 'Mid-Range')
      - SHOT_ZONE_AREA (e.g., 'Left Side', 'Center')
      - SHOT_DISTANCE (in feet)
      - ACTION_TYPE (e.g., 'Layup', 'Jump Shot')
      - PERIOD (quarter: 1-4, 5+ for OT)
      - GAME_DATE
      - And more...
    """
    response = shotchartdetail.ShotChartDetail(
        team_id=team_id,
        player_id=player_id,
        season_nullable=season,
        season_type_all_star="Regular Season",
        context_measure_simple="FGA"
    )

    shots = response.get_normalized_dict()["Shot_Chart_Detail"]
    return shots


def build_players_json(all_players_data, team_map):
    """
    Build the players.json index file from the successfully pulled players.

    Each entry has: id, full_name, first_name, last_name, team_name, team_abbreviation
    """
    players_list = []
    for p in all_players_data:
        entry = {
            "id": p["id"],
            "full_name": p["full_name"],
            "first_name": p["first_name"],
            "last_name": p["last_name"],
            "team_name": p.get("team_name", "Unknown"),
            "team_abbreviation": p.get("team_abbreviation", "UNK"),
            "shot_count": p.get("shot_count", 0)
        }
        players_list.append(entry)

    # Sort by shot count descending (most active shooters first)
    players_list.sort(key=lambda x: x["shot_count"], reverse=True)
    return players_list


def main():
    # ============================================================
    # Parse command-line arguments
    # ============================================================
    parser = argparse.ArgumentParser(description="Pull NBA shot chart data")
    parser.add_argument("--season", type=str, default=None,
                        help="NBA season (e.g., '2024-25'). Default: current season.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max number of players to pull (for testing). Default: all.")
    parser.add_argument("--top", type=int, default=None,
                        help="Only pull the top N scorers (e.g., --top 50). Default: all active.")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Seconds to wait between API calls (be nice to NBA servers). Default: 1.0")
    args = parser.parse_args()

    # Determine the season
    season = args.season or get_current_season()
    print(f"\n{'='*60}")
    print(f"  NBA Shot Chart Data Pull")
    print(f"  Season: {season}")
    print(f"  Delay between requests: {args.delay}s")
    print(f"{'='*60}\n")

    # ============================================================
    # Set up output directories
    # ============================================================
    # Script is in /scripts/, data goes to /data/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    data_dir = os.path.join(project_dir, "data")
    shots_dir = os.path.join(data_dir, "shots", season)

    os.makedirs(shots_dir, exist_ok=True)
    print(f"  Output directory: {shots_dir}")

    # ============================================================
    # Get team info (static, no API call)
    # ============================================================
    team_map = get_team_map()
    print(f"  Loaded {len(team_map)} teams.\n")

    # ============================================================
    # Determine which players to pull
    # ============================================================
    all_active = static_players.get_active_players()
    print(f"  Total active players in database: {len(all_active)}")

    # If --top is specified, get the top scorers list
    top_scorer_ids = None
    if args.top:
        top_scorer_ids = get_top_scorers(season, args.top)

    # Filter to top scorers if we got them
    if top_scorer_ids:
        players_to_pull = [p for p in all_active if p["id"] in top_scorer_ids]
        print(f"  Filtered to {len(players_to_pull)} top scorers.")
    else:
        players_to_pull = all_active

    # Apply --limit
    if args.limit:
        players_to_pull = players_to_pull[:args.limit]
        print(f"  Limited to {args.limit} players (for testing).")

    total = len(players_to_pull)
    print(f"\n  Pulling shot data for {total} players...\n")

    # ============================================================
    # Pull shot data for each player
    # ============================================================
    success_count = 0
    fail_count = 0
    skip_count = 0
    players_data = []  # For building players.json

    for i, player in enumerate(players_to_pull, 1):
        player_id = player["id"]
        player_name = player["full_name"]
        output_file = os.path.join(shots_dir, f"{player_id}.json")

        # Progress indicator
        pct = int((i / total) * 100)
        print(f"  [{i}/{total}] ({pct}%) {player_name}...", end=" ", flush=True)

        try:
            shots = get_player_shots(player_id, season)

            if len(shots) == 0:
                print(f"no shots found, skipping.")
                skip_count += 1
                continue

            # Save the shot data as JSON
            with open(output_file, "w") as f:
                json.dump(shots, f)

            # Extract team info from the first shot record
            team_id = shots[0].get("TEAM_ID", 0)
            team_info = team_map.get(team_id, {"name": "Unknown", "abbreviation": "UNK"})

            # Add to players list
            players_data.append({
                "id": player_id,
                "full_name": player_name,
                "first_name": player["first_name"],
                "last_name": player["last_name"],
                "team_name": team_info["name"],
                "team_abbreviation": team_info["abbreviation"],
                "shot_count": len(shots)
            })

            print(f"{len(shots)} shots saved.")
            success_count += 1

        except Exception as e:
            print(f"ERROR: {e}")
            fail_count += 1

        # Be respectful — wait between API calls
        if i < total:
            time.sleep(args.delay)

    # ============================================================
    # Save players.json index
    # ============================================================
    players_index = build_players_json(players_data, team_map)
    players_file = os.path.join(data_dir, "players.json")

    with open(players_file, "w") as f:
        json.dump(players_index, f, indent=2)

    # ============================================================
    # Summary
    # ============================================================
    print(f"\n{'='*60}")
    print(f"  DONE!")
    print(f"  Season: {season}")
    print(f"  Players pulled: {success_count}")
    print(f"  Players skipped (no shots): {skip_count}")
    print(f"  Errors: {fail_count}")
    print(f"  Players index: {players_file}")
    print(f"  Shot data: {shots_dir}/")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
