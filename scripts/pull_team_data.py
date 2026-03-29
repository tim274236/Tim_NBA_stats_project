"""
pull_team_data.py — Fetch team-level shot chart data and stats using nba_api

Pulls all shots for every NBA team (not individual players) and saves
them as JSON files for the Team Shot Analysis dashboard.

USAGE:
    python pull_team_data.py                      # All 30 teams, current season
    python pull_team_data.py --season 2024-25     # Specific season
    python pull_team_data.py --limit 5            # Only first 5 teams (testing)

OUTPUT:
    ../data/teams.json                            # Team index (id, name, abbr, colors)
    ../data/team-shots/{season}/{team_id}.json    # All shots for each team
    ../data/team-stats/{season}/{team_id}.json    # Per-game stats for each team
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

try:
    from nba_api.stats.static import teams as static_teams
    from nba_api.stats.endpoints import shotchartdetail
    from nba_api.stats.endpoints import teamgamelogs
except ImportError:
    print("ERROR: nba_api is not installed.")
    print("Run: pip install nba_api")
    sys.exit(1)


# NBA team primary and secondary colors (for the logo bar)
TEAM_COLORS = {
    "ATL": {"primary": "#E03A3E", "secondary": "#C1D32F"},
    "BOS": {"primary": "#007A33", "secondary": "#BA9653"},
    "BKN": {"primary": "#000000", "secondary": "#FFFFFF"},
    "CHA": {"primary": "#1D1160", "secondary": "#00788C"},
    "CHI": {"primary": "#CE1141", "secondary": "#000000"},
    "CLE": {"primary": "#860038", "secondary": "#FDBB30"},
    "DAL": {"primary": "#00538C", "secondary": "#002B5E"},
    "DEN": {"primary": "#0E2240", "secondary": "#FEC524"},
    "DET": {"primary": "#C8102E", "secondary": "#1D42BA"},
    "GSW": {"primary": "#1D428A", "secondary": "#FFC72C"},
    "HOU": {"primary": "#CE1141", "secondary": "#000000"},
    "IND": {"primary": "#002D62", "secondary": "#FDBB30"},
    "LAC": {"primary": "#C8102E", "secondary": "#1D428A"},
    "LAL": {"primary": "#552583", "secondary": "#FDB927"},
    "MEM": {"primary": "#5D76A9", "secondary": "#12173F"},
    "MIA": {"primary": "#98002E", "secondary": "#F9A01B"},
    "MIL": {"primary": "#00471B", "secondary": "#EEE1C6"},
    "MIN": {"primary": "#0C2340", "secondary": "#236192"},
    "NOP": {"primary": "#0C2340", "secondary": "#C8102E"},
    "NYK": {"primary": "#006BB6", "secondary": "#F58426"},
    "OKC": {"primary": "#007AC1", "secondary": "#EF6C00"},
    "ORL": {"primary": "#0077C0", "secondary": "#C4CED4"},
    "PHI": {"primary": "#006BB6", "secondary": "#ED174C"},
    "PHX": {"primary": "#1D1160", "secondary": "#E56020"},
    "POR": {"primary": "#E03A3E", "secondary": "#000000"},
    "SAC": {"primary": "#5A2D81", "secondary": "#63727A"},
    "SAS": {"primary": "#C4CED4", "secondary": "#000000"},
    "TOR": {"primary": "#CE1141", "secondary": "#000000"},
    "UTA": {"primary": "#002B5C", "secondary": "#00471B"},
    "WAS": {"primary": "#002B5C", "secondary": "#E31837"},
}


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


def get_team_shots(team_id, season):
    """Fetch all shots for a team in a given season."""
    response = shotchartdetail.ShotChartDetail(
        team_id=team_id,
        player_id=0,  # 0 = all players on the team
        season_nullable=season,
        season_type_all_star="Regular Season",
        context_measure_simple="FGA",
        timeout=60
    )
    shots = response.get_normalized_dict()["Shot_Chart_Detail"]
    return shots


def get_team_game_logs(team_id, season):
    """Fetch game-by-game stats for a team."""
    response = teamgamelogs.TeamGameLogs(
        team_id_nullable=team_id,
        season_nullable=season,
        season_type_nullable="Regular Season",
        timeout=60
    )
    games = response.get_normalized_dict()["TeamGameLogs"]
    return games


def compute_team_stats_from_shots(shots, game_logs):
    """
    Compute team offensive stats from shot data and game logs.

    Returns a dict with overall stats and per-game breakdowns.
    """
    # Group shots by game
    games = {}
    for shot in shots:
        game_id = shot["GAME_ID"]
        if game_id not in games:
            games[game_id] = {
                "game_id": game_id,
                "game_date": shot["GAME_DATE"],
                "htm": shot.get("HTM", ""),
                "vtm": shot.get("VTM", ""),
                "shots": []
            }
        games[game_id]["shots"].append(shot)

    # Build game log lookup for extra stats (FTA, PTS, etc.)
    game_log_map = {}
    for gl in game_logs:
        gid = gl.get("GAME_ID", "")
        game_log_map[gid] = gl

    # Compute per-game stats
    per_game = []
    for game_id, game_data in sorted(games.items(), key=lambda x: x[1]["game_date"]):
        game_shots = game_data["shots"]

        fga = len(game_shots)
        fgm = sum(1 for s in game_shots if s["SHOT_MADE_FLAG"] == 1)
        three_pa = sum(1 for s in game_shots if s["SHOT_TYPE"] == "3PT Field Goal")
        three_pm = sum(1 for s in game_shots if s["SHOT_TYPE"] == "3PT Field Goal" and s["SHOT_MADE_FLAG"] == 1)
        two_pa = fga - three_pa
        two_pm = fgm - three_pm

        # Get extra stats from game logs if available
        gl = game_log_map.get(game_id, {})
        fta = gl.get("FTA", 0)
        ftm = gl.get("FTM", 0)
        pts = gl.get("PTS", two_pm * 2 + three_pm * 3 + ftm)
        oreb = gl.get("OREB", 0)
        dreb = gl.get("DREB", 0)
        reb = gl.get("REB", 0)
        ast = gl.get("AST", 0)
        tov = gl.get("TOV", 0)
        stl = gl.get("STL", 0)
        blk = gl.get("BLK", 0)
        matchup = gl.get("MATCHUP", "")
        wl = gl.get("WL", "")

        # eFG% = (FGM + 0.5 * 3PM) / FGA
        efg_pct = ((fgm + 0.5 * three_pm) / fga * 100) if fga > 0 else 0

        # TS% = PTS / (2 * (FGA + 0.44 * FTA))
        ts_pct = (pts / (2 * (fga + 0.44 * fta)) * 100) if (fga + 0.44 * fta) > 0 else 0

        # 3PAr = 3PA / FGA
        three_par = (three_pa / fga * 100) if fga > 0 else 0

        # Offensive Rating estimate: PTS / possessions * 100
        # Possessions ≈ FGA - OREB + TOV + 0.44 * FTA
        poss = fga - oreb + tov + 0.44 * fta
        off_rating = (pts / poss * 100) if poss > 0 else 0

        # Fast break points not available from shot chart, use game log if present
        # The TeamGameLogs endpoint doesn't have fast break pts directly,
        # so we'll mark it as N/A unless we can get it
        fb_pts = gl.get("PTS_FB", None)

        per_game.append({
            "game_id": game_id,
            "game_date": game_data["game_date"],
            "matchup": matchup,
            "wl": wl,
            "htm": game_data["htm"],
            "vtm": game_data["vtm"],
            "pts": pts,
            "fga": fga,
            "fgm": fgm,
            "fg_pct": round(fgm / fga * 100, 1) if fga > 0 else 0,
            "three_pa": three_pa,
            "three_pm": three_pm,
            "three_pct": round(three_pm / three_pa * 100, 1) if three_pa > 0 else 0,
            "fta": fta,
            "ftm": ftm,
            "efg_pct": round(efg_pct, 1),
            "ts_pct": round(ts_pct, 1),
            "three_par": round(three_par, 1),
            "off_rating": round(off_rating, 1),
            "fb_pts": fb_pts,
            "oreb": oreb,
            "tov": tov,
            "ast": ast,
        })

    return per_game


def main():
    parser = argparse.ArgumentParser(description="Pull NBA team shot chart data")
    parser.add_argument("--season", type=str, default=None,
                        help="NBA season (e.g., '2024-25'). Default: current season.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max number of teams to pull (for testing).")
    parser.add_argument("--delay", type=float, default=1.5,
                        help="Seconds between API calls. Default: 1.5")
    args = parser.parse_args()

    season = args.season or get_current_season()

    print(f"\n{'='*60}")
    print(f"  NBA Team Shot Data Pull")
    print(f"  Season: {season}")
    print(f"{'='*60}\n")

    # Set up directories
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    data_dir = os.path.join(project_dir, "data")
    team_shots_dir = os.path.join(data_dir, "team-shots", season)
    team_stats_dir = os.path.join(data_dir, "team-stats", season)

    os.makedirs(team_shots_dir, exist_ok=True)
    os.makedirs(team_stats_dir, exist_ok=True)

    # Get all 30 teams
    all_teams = static_teams.get_teams()
    all_teams.sort(key=lambda t: t["abbreviation"])

    if args.limit:
        all_teams = all_teams[:args.limit]

    total = len(all_teams)
    print(f"  Pulling data for {total} teams...\n")

    # Build teams.json index
    teams_index = []
    success_count = 0
    fail_count = 0

    for i, team in enumerate(all_teams, 1):
        team_id = team["id"]
        abbr = team["abbreviation"]
        name = team["full_name"]
        colors = TEAM_COLORS.get(abbr, {"primary": "#333333", "secondary": "#666666"})

        pct = int((i / total) * 100)
        print(f"  [{i}/{total}] ({pct}%) {name}...", end=" ", flush=True)

        try:
            # Pull shots
            shots = get_team_shots(team_id, season)
            print(f"{len(shots)} shots...", end=" ", flush=True)

            # Save shots
            shots_file = os.path.join(team_shots_dir, f"{team_id}.json")
            with open(shots_file, "w") as f:
                json.dump(shots, f)

            time.sleep(args.delay)

            # Pull game logs
            game_logs = get_team_game_logs(team_id, season)
            print(f"{len(game_logs)} games...", end=" ", flush=True)

            time.sleep(args.delay)

            # Compute per-game stats
            per_game_stats = compute_team_stats_from_shots(shots, game_logs)

            # Save stats
            stats_file = os.path.join(team_stats_dir, f"{team_id}.json")
            with open(stats_file, "w") as f:
                json.dump(per_game_stats, f, indent=2)

            # Add to index
            teams_index.append({
                "id": team_id,
                "full_name": name,
                "abbreviation": abbr,
                "city": team["city"],
                "nickname": team["nickname"],
                "primary_color": colors["primary"],
                "secondary_color": colors["secondary"],
                "shot_count": len(shots),
                "game_count": len(per_game_stats)
            })

            print("done.")
            success_count += 1

        except Exception as e:
            print(f"ERROR: {e}")
            fail_count += 1

        time.sleep(args.delay)

    # Save teams.json
    teams_index.sort(key=lambda t: t["abbreviation"])
    teams_file = os.path.join(data_dir, "teams.json")
    with open(teams_file, "w") as f:
        json.dump(teams_index, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  DONE!")
    print(f"  Teams pulled: {success_count}")
    print(f"  Errors: {fail_count}")
    print(f"  Teams index: {teams_file}")
    print(f"  Shot data: {team_shots_dir}/")
    print(f"  Stats data: {team_stats_dir}/")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
