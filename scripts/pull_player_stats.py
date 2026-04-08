"""
pull_player_stats.py — Fetch season-level player stats using nba_api

Pulls LeagueDashPlayerStats for all players in a given season and saves
as a JSON file for the Fantasy Player Tool.

USAGE:
    python pull_player_stats.py                      # Current season
    python pull_player_stats.py --season 2024-25     # Specific season
    python pull_player_stats.py --season 2024-25 --season 2025-26  # Multiple seasons

OUTPUT:
    ../data/player-stats/{season}.json
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

try:
    from nba_api.stats.endpoints import leaguedashplayerstats
except ImportError:
    print("ERROR: nba_api is not installed.")
    print("Run: pip install nba_api")
    sys.exit(1)


def get_current_season():
    now = datetime.now()
    year = now.year
    month = now.month
    if month >= 10:
        start_year = year
    else:
        start_year = year - 1
    end_year = start_year + 1
    return f"{start_year}-{str(end_year)[-2:]}"


def pull_season(season, output_dir, delay=1.5):
    """Pull LeagueDashPlayerStats for a single season and save as JSON."""

    print(f"\n  Pulling player stats for {season}...", flush=True)

    response = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="Totals",
        timeout=120
    )

    rows = response.get_normalized_dict()["LeagueDashPlayerStats"]
    print(f"  Retrieved {len(rows)} players.", flush=True)

    # Keep only the fields we need and rename for clarity
    players = []
    for row in rows:
        players.append({
            "PLAYER_ID": row["PLAYER_ID"],
            "PLAYER_NAME": row["PLAYER_NAME"],
            "TEAM_ABBREVIATION": row["TEAM_ABBREVIATION"],
            "GP": row["GP"],
            "GS": row.get("GS", 0),
            "MIN": row["MIN"],
            "PTS": row["PTS"],
            "REB": row["REB"],
            "AST": row["AST"],
            "STL": row["STL"],
            "BLK": row["BLK"],
            "TOV": row["TOV"],
            "FGM": row["FGM"],
            "FGA": row["FGA"],
            "FG_PCT": row["FG_PCT"],
            "FTM": row["FTM"],
            "FTA": row["FTA"],
            "FT_PCT": row["FT_PCT"],
            "FG3M": row["FG3M"],
            "FG3A": row.get("FG3A", 0),
            "FG3_PCT": row["FG3_PCT"],
            "DD2": row.get("DD2", 0),
            "TD3": row.get("TD3", 0),
        })

    # Sort by PTS descending as a default ordering
    players.sort(key=lambda p: p["PTS"], reverse=True)

    # Save
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{season}.json")
    with open(out_path, "w") as f:
        json.dump(players, f, indent=2)

    print(f"  Saved {len(players)} players to {out_path}")
    time.sleep(delay)
    return len(players)


def main():
    parser = argparse.ArgumentParser(description="Pull NBA player stats for fantasy tool")
    parser.add_argument("--season", type=str, action="append", default=None,
                        help="NBA season(s) to pull (e.g., '2024-25'). Repeatable. Default: current season.")
    parser.add_argument("--delay", type=float, default=1.5,
                        help="Seconds between API calls. Default: 1.5")
    args = parser.parse_args()

    seasons = args.season or [get_current_season()]

    print(f"\n{'='*60}")
    print(f"  NBA Player Stats Pull (Fantasy Tool)")
    print(f"  Seasons: {', '.join(seasons)}")
    print(f"{'='*60}")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    output_dir = os.path.join(project_dir, "data", "player-stats")

    total_players = 0
    for season in seasons:
        try:
            count = pull_season(season, output_dir, args.delay)
            total_players += count
        except Exception as e:
            print(f"  ERROR pulling {season}: {e}")

    print(f"\n{'='*60}")
    print(f"  DONE! Pulled {total_players} player records across {len(seasons)} season(s).")
    print(f"  Output: {output_dir}/")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
