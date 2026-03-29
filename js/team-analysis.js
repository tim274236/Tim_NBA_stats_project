/**
 * team-analysis.js — Team Shot Analysis page logic
 *
 * Loads all 30 teams, displays a team selector bar,
 * plots team shots on a court, and shows per-game stats.
 * Game selector allows filtering by specific games.
 */

// ============================================================
// STATE
// ============================================================

var currentSeason = "2025-26";
const AVAILABLE_SEASONS = ["2025-26", "2024-25"];
const MADE_COLOR = "#4ecca3";
const MISSED_COLOR = "#e94560";

var allTeams = [];
var selectedTeam = null;
var teamShots = [];
var teamStats = [];      // per-game stats array
var selectedGameIds = []; // which games are selected (empty = all)
var courtSvg = null;
var hexMode = false;     // dots vs hex toggle


// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    // Draw the court
    courtSvg = drawCourt("team-court");

    // Load teams index
    fetch("data/teams.json")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            allTeams = data;
            buildTeamBar();
            console.log("Loaded " + allTeams.length + " teams.");
        })
        .catch(function (err) {
            console.error("Failed to load teams.json:", err);
        });

    // Game selector buttons
    document.getElementById("select-all-games").addEventListener("click", function () {
        selectAllGames();
    });
    document.getElementById("select-recent-10").addEventListener("click", function () {
        selectRecentGames(10);
    });
    document.getElementById("select-recent-20").addEventListener("click", function () {
        selectRecentGames(20);
    });

    // Game select change
    document.getElementById("game-select").addEventListener("change", function () {
        readSelectedGames();
        applyGameFilter();
    });

    // Collapse toggles
    setupCollapseToggle("team-bar-toggle", "team-bar-content", "team-bar-arrow");
    setupCollapseToggle("game-bar-toggle", "game-bar-content", "game-bar-arrow");

    // Hex toggle
    document.getElementById("hex-toggle").addEventListener("click", function () {
        hexMode = !hexMode;
        var label = document.getElementById("hex-toggle-label");
        var btn = document.getElementById("hex-toggle");
        label.textContent = hexMode ? "Hex" : "Dots";
        btn.classList.toggle("active", hexMode);
        applyGameFilter(); // re-render with current mode
    });

    // Season selector
    buildSeasonSelector();
    document.getElementById("season-select").addEventListener("change", function () {
        currentSeason = this.value;
        if (selectedTeam) {
            loadTeamData(selectedTeam);
        }
    });

    console.log("Team analysis page ready.");
});


// ============================================================
// TEAM BAR
// ============================================================

function buildTeamBar() {
    var bar = document.getElementById("team-bar");
    bar.innerHTML = "";

    allTeams.forEach(function (team) {
        var btn = document.createElement("button");
        btn.className = "team-btn";
        btn.style.setProperty("--team-color", team.primary_color);
        btn.setAttribute("data-team-id", team.id);

        btn.innerHTML =
            '<img class="team-logo" src="https://cdn.nba.com/logos/nba/' + team.id + '/primary/L/logo.svg" alt="' + team.abbreviation + '" onerror="this.style.display=\'none\'">' +
            '<span class="team-abbr">' + team.abbreviation + '</span>';

        btn.addEventListener("click", function () {
            selectTeam(team);
        });

        bar.appendChild(btn);
    });
}


function selectTeam(team) {
    selectedTeam = team;

    // Update button states
    var btns = document.querySelectorAll(".team-btn");
    btns.forEach(function (btn) {
        var tid = parseInt(btn.getAttribute("data-team-id"));
        if (tid === team.id) {
            btn.classList.add("selected");
            btn.classList.remove("dimmed");
        } else {
            btn.classList.remove("selected");
            btn.classList.add("dimmed");
        }
    });

    // Show dashboard, hide empty state
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("dashboard").style.display = "flex";
    document.getElementById("game-selector-bar").style.display = "block";

    // Set team name in stats with logo
    var statsName = document.getElementById("stats-team-name");
    statsName.innerHTML =
        '<img class="stats-team-logo" src="https://cdn.nba.com/logos/nba/' + team.id + '/primary/L/logo.svg" alt="' + team.abbreviation + '" onerror="this.style.display=\'none\'">' +
        '<span>' + team.full_name + '</span>';
    statsName.style.borderBottomColor = team.primary_color;

    // Load team data
    loadTeamData(team);
}


// ============================================================
// LOAD TEAM DATA
// ============================================================

function loadTeamData(team) {
    var shotsUrl = "data/team-shots/" + currentSeason + "/" + team.id + ".json";
    var statsUrl = "data/team-stats/" + currentSeason + "/" + team.id + ".json";

    // Load both in parallel
    Promise.all([
        fetch(shotsUrl).then(function (r) {
            if (!r.ok) throw new Error("No shot data for " + team.full_name);
            return r.json();
        }),
        fetch(statsUrl).then(function (r) {
            if (!r.ok) throw new Error("No stats for " + team.full_name);
            return r.json();
        })
    ])
    .then(function (results) {
        teamShots = results[0];
        teamStats = results[1];

        console.log("Loaded " + teamShots.length + " shots and " + teamStats.length + " games for " + team.full_name);

        // Build game selector
        buildGameSelector();

        // Select all games by default
        selectAllGames();
    })
    .catch(function (err) {
        console.error(err);
        alert("Could not load data for " + team.full_name);
    });
}


// ============================================================
// GAME SELECTOR
// ============================================================

function buildGameSelector() {
    var select = document.getElementById("game-select");
    select.innerHTML = "";

    // Sort games by date (most recent first)
    var sorted = teamStats.slice().sort(function (a, b) {
        return b.game_date.localeCompare(a.game_date);
    });

    sorted.forEach(function (game) {
        var option = document.createElement("option");
        option.value = game.game_id;

        // Format date
        var d = game.game_date;
        var dateStr = d;
        if (d && d.length === 8) {
            dateStr = d.substring(4, 6) + "/" + d.substring(6, 8) + "/" + d.substring(0, 4);
        }

        var wl = game.wl ? " (" + game.wl + ")" : "";
        option.textContent = dateStr + " " + game.matchup + wl + " — " + game.pts + " pts";
        option.selected = true;

        select.appendChild(option);
    });
}


function selectAllGames() {
    var select = document.getElementById("game-select");
    var options = select.options;
    for (var i = 0; i < options.length; i++) {
        options[i].selected = true;
    }
    readSelectedGames();
    applyGameFilter();
}


function selectRecentGames(n) {
    var select = document.getElementById("game-select");
    var options = select.options;
    // Options are sorted most recent first, so select first N
    for (var i = 0; i < options.length; i++) {
        options[i].selected = i < n;
    }
    readSelectedGames();
    applyGameFilter();
}


function readSelectedGames() {
    var select = document.getElementById("game-select");
    selectedGameIds = [];
    var options = select.options;
    for (var i = 0; i < options.length; i++) {
        if (options[i].selected) {
            selectedGameIds.push(options[i].value);
        }
    }
}


// ============================================================
// APPLY GAME FILTER — update court + stats
// ============================================================

function applyGameFilter() {
    // Filter shots to selected games
    var filteredShots;
    if (selectedGameIds.length === 0 || selectedGameIds.length === teamStats.length) {
        filteredShots = teamShots;
    } else {
        var gameSet = new Set(selectedGameIds);
        filteredShots = teamShots.filter(function (s) {
            return gameSet.has(s.GAME_ID);
        });
    }

    // Plot shots on court based on mode
    if (hexMode) {
        // Hide dots, show hex
        var shotsLayer = courtSvg.node().__courtGroup.select(".shots-layer");
        shotsLayer.selectAll("circle").remove();
        plotHexMap(courtSvg, filteredShots);
    } else {
        // Hide hex, show dots
        clearHexMap(courtSvg);
        plotTeamShots(filteredShots);
    }

    // Update stats
    updateStats();

    // Update game count label
    var label = document.getElementById("game-count-label");
    label.textContent = selectedGameIds.length + " of " + teamStats.length + " games selected";
}


// ============================================================
// PLOT SHOTS ON COURT
// ============================================================

function plotTeamShots(shots) {
    var scales = courtSvg.node().__scales;
    var courtGroup = courtSvg.node().__courtGroup;
    var shotsLayer = courtGroup.select(".shots-layer");

    // Clear existing shots
    shotsLayer.selectAll("circle").remove();

    var tooltip = document.getElementById("tooltip");

    shotsLayer.selectAll("circle")
        .data(shots)
        .enter()
        .append("circle")
        .attr("cx", function (d) { return scales.x(d.LOC_X); })
        .attr("cy", function (d) { return scales.y(d.LOC_Y); })
        .attr("r", 2.5)
        .attr("fill", function (d) {
            return d.SHOT_MADE_FLAG === 1 ? MADE_COLOR : MISSED_COLOR;
        })
        .attr("opacity", 0.5)
        .attr("stroke", "none")
        .on("mouseenter", function (event, d) {
            d3.select(this)
                .attr("r", 5)
                .attr("opacity", 1)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1.5);

            var dateStr = d.GAME_DATE || "";
            var formattedDate = dateStr;
            if (dateStr.length === 8) {
                var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                formattedDate = months[parseInt(dateStr.substring(4,6)) - 1] + " " + parseInt(dateStr.substring(6,8)) + ", " + dateStr.substring(0,4);
            }

            var result = d.SHOT_MADE_FLAG === 1 ? "Made" : "Missed";
            var resultClass = d.SHOT_MADE_FLAG === 1 ? "tip-made" : "tip-missed";

            tooltip.innerHTML =
                '<div class="tip-label">' + d.PLAYER_NAME + '</div>' +
                '<div>' + d.ACTION_TYPE + '</div>' +
                '<div>' + d.SHOT_TYPE + ' &bull; ' + d.SHOT_DISTANCE + ' ft</div>' +
                '<div class="' + resultClass + '">' + result + '</div>' +
                '<div style="color:#8892a8; font-size:11px;">' + formattedDate + '</div>';

            tooltip.style.left = (event.clientX + 12) + "px";
            tooltip.style.top = (event.clientY - 10) + "px";
            tooltip.classList.add("visible");
        })
        .on("mousemove", function (event) {
            tooltip.style.left = (event.clientX + 12) + "px";
            tooltip.style.top = (event.clientY - 10) + "px";
        })
        .on("mouseleave", function () {
            d3.select(this)
                .attr("r", 2.5)
                .attr("opacity", 0.5)
                .attr("stroke", "none");
            tooltip.classList.remove("visible");
        });
}


// ============================================================
// UPDATE STATS PANEL
// ============================================================

function updateStats() {
    // Filter team stats to selected games
    var gameSet = new Set(selectedGameIds);
    var filtered = teamStats.filter(function (g) {
        return gameSet.has(g.game_id);
    });

    if (filtered.length === 0) {
        ["stat-ortg","stat-ts","stat-efg","stat-ppg","stat-3par","stat-ast",
         "stat-drtg","stat-stl","stat-blk","stat-dreb","stat-reb","stat-tov","stat-3papg","stat-record"]
            .forEach(function(id) { setStatValue(id, "—", ""); });
        return;
    }

    var numGames = filtered.length;

    // Aggregate stats across selected games
    var totalFGA = 0, totalFGM = 0, total3PA = 0, total3PM = 0;
    var totalPTS = 0, totalFTA = 0, totalOreb = 0, totalTov = 0;
    var totalAst = 0, totalStl = 0, totalBlk = 0, totalDreb = 0, totalReb = 0;
    var totalPlusMinus = 0;
    var wins = 0, losses = 0;

    filtered.forEach(function (g) {
        totalFGA += g.fga;
        totalFGM += g.fgm;
        total3PA += g.three_pa;
        total3PM += g.three_pm;
        totalPTS += g.pts;
        totalFTA += g.fta;
        totalOreb += g.oreb || 0;
        totalTov += g.tov || 0;
        totalAst += g.ast || 0;
        totalStl += g.stl || 0;
        totalBlk += g.blk || 0;
        totalDreb += g.dreb || 0;
        totalReb += g.reb || 0;
        totalPlusMinus += g.plus_minus || 0;

        if (g.wl === "W") wins++;
        if (g.wl === "L") losses++;
    });

    // eFG% = (FGM + 0.5 * 3PM) / FGA
    var efg = totalFGA > 0 ? ((totalFGM + 0.5 * total3PM) / totalFGA * 100) : 0;

    // TS% = PTS / (2 * (FGA + 0.44 * FTA))
    var tsDenom = 2 * (totalFGA + 0.44 * totalFTA);
    var ts = tsDenom > 0 ? (totalPTS / tsDenom * 100) : 0;

    // 3PAr = 3PA / FGA
    var threepar = totalFGA > 0 ? (total3PA / totalFGA * 100) : 0;

    // 3PA per game
    var threepapg = total3PA / numGames;

    // Offensive Rating = PTS / possessions * 100
    var poss = totalFGA - totalOreb + totalTov + 0.44 * totalFTA;
    var ortg = poss > 0 ? (totalPTS / poss * 100) : 0;

    // Defensive Rating = Off Rating - Net Rating
    // Net Rating ≈ Plus/Minus scaled to per-100-possessions
    var drtg = poss > 0 ? (ortg - (totalPlusMinus / poss * 100)) : 0;

    // Points per game
    var ppg = totalPTS / numGames;

    // Per-game defensive stats
    var astpg = totalAst / numGames;
    var stlpg = totalStl / numGames;
    var blkpg = totalBlk / numGames;
    var drebpg = totalDreb / numGames;
    var rebpg = totalReb / numGames;
    var tovpg = totalTov / numGames;

    // Set offensive values
    setStatValue("stat-ortg", ortg.toFixed(1), ratingClass(ortg, 105, 112));
    setStatValue("stat-ts", ts.toFixed(1) + "%", pctClass(ts, 55, 58));
    setStatValue("stat-efg", efg.toFixed(1) + "%", pctClass(efg, 50, 54));
    setStatValue("stat-ppg", ppg.toFixed(1), ratingClass(ppg, 108, 115));
    setStatValue("stat-3par", threepar.toFixed(1) + "%", "");
    setStatValue("stat-ast", astpg.toFixed(1), "");

    // Set defensive values
    setStatValue("stat-drtg", drtg.toFixed(1), drtgClass(drtg, 110, 113));
    setStatValue("stat-stl", stlpg.toFixed(1), ratingClass(stlpg, 7, 8.5));
    setStatValue("stat-blk", blkpg.toFixed(1), ratingClass(blkpg, 4.5, 5.5));
    setStatValue("stat-dreb", drebpg.toFixed(1), "");
    setStatValue("stat-reb", rebpg.toFixed(1), "");
    setStatValue("stat-tov", tovpg.toFixed(1), tovClass(tovpg, 14, 16));
    setStatValue("stat-3papg", threepapg.toFixed(1), "");
    setStatValue("stat-record", wins + "-" + losses, "");
}


function setStatValue(id, value, cssClass) {
    var el = document.getElementById(id);
    el.textContent = value;
    el.className = "stat-card-value";
    if (cssClass) el.classList.add(cssClass);
}


function ratingClass(val, lowThresh, highThresh) {
    if (val >= highThresh) return "good";
    if (val >= lowThresh) return "avg";
    if (val > 0) return "poor";
    return "";
}


function pctClass(val, lowThresh, highThresh) {
    if (val >= highThresh) return "good";
    if (val >= lowThresh) return "avg";
    if (val > 0) return "poor";
    return "";
}


function tovClass(val, lowThresh, highThresh) {
    // Turnovers: lower is better (inverted color)
    if (val <= lowThresh) return "good";
    if (val <= highThresh) return "avg";
    if (val > 0) return "poor";
    return "";
}


function drtgClass(val, lowThresh, highThresh) {
    // Defensive Rating: lower is better (inverted color)
    if (val <= lowThresh) return "good";
    if (val <= highThresh) return "avg";
    if (val > 0) return "poor";
    return "";
}


// ============================================================
// COLLAPSE TOGGLES
// ============================================================

function setupCollapseToggle(toggleId, contentId, arrowId) {
    var toggle = document.getElementById(toggleId);
    var content = document.getElementById(contentId);
    var arrow = document.getElementById(arrowId);

    toggle.addEventListener("click", function () {
        var isCollapsed = content.classList.toggle("collapsed");
        arrow.innerHTML = isCollapsed ? "&#9660;" : "&#9650;";
        toggle.classList.toggle("is-collapsed", isCollapsed);
    });
}


// ============================================================
// SEASON SELECTOR
// ============================================================

function buildSeasonSelector() {
    var select = document.getElementById("season-select");
    select.innerHTML = "";

    AVAILABLE_SEASONS.forEach(function (season) {
        var option = document.createElement("option");
        option.value = season;
        option.textContent = season;
        if (season === currentSeason) option.selected = true;
        select.appendChild(option);
    });
}
