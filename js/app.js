/**
 * app.js — Main application entry point
 *
 * Ties together: court.js, shots.js, search.js, filters.js
 * Handles:
 *   1. Drawing the court
 *   2. Loading player list
 *   3. Setting up search, filters, collapse panels
 *   4. Loading shot data when a player is selected/toggled
 *   5. Populating the stats panel (shooting stats, splits, game log)
 */

// Wait for the page to fully load
document.addEventListener("DOMContentLoaded", function () {

    // --- STEP 1: Draw the court ---
    const courtSvg = drawCourt("court");
    window.courtSvg = courtSvg;

    // --- STEP 2: Set up collapsible panels ---
    setupCollapsiblePanels();

    // --- STEP 3: Set up filters ---
    setupFilters(courtSvg);

    // --- STEP 4: Load players and set up search ---
    loadPlayers().then(function () {
        setupSearch();

        // Set the callback for when a player is selected/toggled
        onPlayerSelected = function (player, action) {
            if (action === "add") {
                addPlayerToChart(player);
            } else if (action === "remove") {
                removePlayerFromChart(player);
            }
        };

        console.log("NBA Shot Chart Explorer loaded. Ready to go.");
    });
});


/**
 * addPlayerToChart(player)
 * Fetches a player's shot data JSON and plots it on the court.
 */
function addPlayerToChart(player) {
    const season = "2025-26";
    const url = "data/shots/" + season + "/" + player.id + ".json";

    fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error("No shot data found for " + player.full_name);
            return response.json();
        })
        .then(function (shots) {
            // Plot the shots on the court
            plotShots(courtSvg, shots, player.id, player.full_name);

            // Apply current filters to the newly added shots
            const filters = getCurrentFilters();
            filterShots(courtSvg, filters);

            // Update the stats panel
            updateStatsPanel();

            console.log("Loaded " + shots.length + " shots for " + player.full_name);
        })
        .catch(function (err) {
            console.error("Error loading shots:", err);
            alert("Could not load shot data for " + player.full_name + ". Make sure the data file exists.");
        });
}


/**
 * removePlayerFromChart(player)
 * Removes a player's shots from the court and updates stats.
 */
function removePlayerFromChart(player) {
    clearShots(courtSvg, player.id);
    updateStatsPanel();
    console.log("Removed " + player.full_name + " from chart.");
}


/**
 * updateStatsPanel()
 * Recalculates and displays stats for all active players on the court.
 * Shows: overall shooting stats, shooting splits by zone, recent game log.
 * Respects current filter state for the stats calculations.
 */
function updateStatsPanel() {
    const active = getActivePlayers();
    const playerIds = Object.keys(active);

    const statsContent = document.getElementById("stats-content");
    const splitsSection = document.getElementById("splits-section");
    const splitsContent = document.getElementById("splits-content");
    const gamelogSection = document.getElementById("gamelog-section");
    const gamelogContent = document.getElementById("gamelog-content");

    // If no players are active, show placeholder
    if (playerIds.length === 0) {
        statsContent.innerHTML = '<p class="stats-placeholder">Search for a player to see their shooting stats</p>';
        splitsSection.style.display = "none";
        gamelogSection.style.display = "none";
        return;
    }

    // Get current filters
    const filters = getCurrentFilters();

    // Build stats HTML for each active player
    let statsHtml = "";

    playerIds.forEach(function (playerId) {
        const playerData = active[playerId];
        const shots = playerData.shots;
        const colors = playerData.colors;

        // Apply filters to get visible shots
        const filtered = filterShotsData(shots, filters);

        // Calculate overall stats
        const total = filtered.length;
        const made = filtered.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        const fgPct = total > 0 ? ((made / total) * 100).toFixed(1) : "0.0";

        // 2PT stats
        const twos = filtered.filter(function (s) { return s.SHOT_TYPE === "2PT Field Goal"; });
        const twosMade = twos.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        const twoPct = twos.length > 0 ? ((twosMade / twos.length) * 100).toFixed(1) : "0.0";

        // 3PT stats
        const threes = filtered.filter(function (s) { return s.SHOT_TYPE === "3PT Field Goal"; });
        const threesMade = threes.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        const threePct = threes.length > 0 ? ((threesMade / threes.length) * 100).toFixed(1) : "0.0";

        // Color-code FG%
        function pctClass(pct) {
            if (pct >= 50) return "good";
            if (pct >= 40) return "avg";
            return "poor";
        }

        statsHtml +=
            '<div class="player-stats-block">' +
            '<div class="stats-section-title" style="color:' + colors.made + ';">' + playerData.playerName + '</div>' +
            '<div class="stat-row"><span class="stat-label">FGA</span><span class="stat-value">' + total + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">FGM</span><span class="stat-value">' + made + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">FG%</span><span class="stat-value ' + pctClass(parseFloat(fgPct)) + '">' + fgPct + '%</span></div>' +
            '<div class="stat-row"><span class="stat-label">2PT</span><span class="stat-value">' + twosMade + '/' + twos.length + ' (' + twoPct + '%)</span></div>' +
            '<div class="stat-row"><span class="stat-label">3PT</span><span class="stat-value">' + threesMade + '/' + threes.length + ' (' + threePct + '%)</span></div>' +
            '<div class="stats-divider"></div>' +
            '</div>';
    });

    statsContent.innerHTML = statsHtml;

    // --- SHOOTING SPLITS BY ZONE ---
    // Show splits for the first active player (or combined if you prefer)
    const firstPlayerId = playerIds[0];
    const firstPlayer = active[firstPlayerId];
    const firstShots = filterShotsData(firstPlayer.shots, filters);

    const zones = {};
    firstShots.forEach(function (s) {
        const zone = s.SHOT_ZONE_BASIC;
        if (!zones[zone]) zones[zone] = { made: 0, total: 0 };
        zones[zone].total++;
        if (s.SHOT_MADE_FLAG === 1) zones[zone].made++;
    });

    let splitsHtml =
        '<table class="splits-table">' +
        '<tr><th>Zone</th><th>FGM/A</th><th>FG%</th></tr>';

    Object.keys(zones).sort().forEach(function (zone) {
        const z = zones[zone];
        const pct = z.total > 0 ? ((z.made / z.total) * 100).toFixed(1) : "0.0";
        splitsHtml +=
            '<tr>' +
            '<td class="zone-name">' + zone + '</td>' +
            '<td>' + z.made + '/' + z.total + '</td>' +
            '<td>' + pct + '%</td>' +
            '</tr>';
    });

    splitsHtml += '</table>';
    splitsContent.innerHTML = splitsHtml;
    splitsSection.style.display = "block";

    // --- GAME LOG ---
    // Group shots by game date for the first active player
    const games = {};
    firstPlayer.shots.forEach(function (s) {
        const gameKey = s.GAME_DATE + "_" + s.GAME_ID;
        if (!games[gameKey]) {
            games[gameKey] = {
                date: s.GAME_DATE,
                htm: s.HTM,
                vtm: s.VTM,
                team: s.TEAM_NAME,
                shots: []
            };
        }
        games[gameKey].shots.push(s);
    });

    // Sort games by date descending (most recent first)
    const sortedGames = Object.values(games).sort(function (a, b) {
        return b.date.localeCompare(a.date);
    });

    // Show last 10 games
    const recentGames = sortedGames.slice(0, 10);

    let gamelogHtml =
        '<table class="gamelog-table">' +
        '<tr><th>Date</th><th>Opp</th><th>FG</th><th>3PT</th></tr>';

    recentGames.forEach(function (game) {
        // Format date
        const d = game.date;
        let dateStr = d;
        if (d && d.length === 8) {
            dateStr = d.substring(4, 6) + "/" + d.substring(6, 8);
        }

        // Figure out opponent
        const teamAbbr = firstPlayer.shots[0].TEAM_NAME;
        // HTM = home team, VTM = visitor team
        const opponent = game.htm === game.team ? game.vtm : game.htm;
        const isHome = game.htm === game.team;
        const oppStr = (isHome ? "vs " : "@ ") + opponent;

        // Calculate FG for this game
        const total = game.shots.length;
        const made = game.shots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;

        // 3PT for this game
        const threes = game.shots.filter(function (s) { return s.SHOT_TYPE === "3PT Field Goal"; });
        const threesMade = threes.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;

        gamelogHtml +=
            '<tr>' +
            '<td class="game-date">' + dateStr + '</td>' +
            '<td class="game-opponent">' + oppStr + '</td>' +
            '<td>' + made + '/' + total + '</td>' +
            '<td>' + threesMade + '/' + threes.length + '</td>' +
            '</tr>';
    });

    gamelogHtml += '</table>';
    gamelogContent.innerHTML = gamelogHtml;
    gamelogSection.style.display = "block";
}


/**
 * filterShotsData(shots, filters)
 * Pure data function — filters an array of shot objects in memory.
 * Used for calculating stats on filtered data.
 * (Different from filterShots() in shots.js which toggles DOM visibility.)
 */
function filterShotsData(shots, filters) {
    return shots.filter(function (s) {
        if (filters.result === "made" && s.SHOT_MADE_FLAG !== 1) return false;
        if (filters.result === "missed" && s.SHOT_MADE_FLAG !== 0) return false;
        if (filters.shotType !== "all" && s.SHOT_TYPE !== filters.shotType) return false;
        if (filters.quarter !== "all" && s.PERIOD !== parseInt(filters.quarter)) return false;
        if (filters.zone !== "all" && s.SHOT_ZONE_BASIC !== filters.zone) return false;
        return true;
    });
}


/**
 * setupCollapsiblePanels()
 * Adds click handlers to collapse/expand the sidebar and stats panel.
 */
function setupCollapsiblePanels() {
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");

    sidebarToggle.addEventListener("click", function () {
        sidebar.classList.toggle("collapsed");
        if (sidebar.classList.contains("collapsed")) {
            sidebarToggle.innerHTML = "&#9654;";
            sidebarToggle.title = "Expand sidebar";
        } else {
            sidebarToggle.innerHTML = "&#9664;";
            sidebarToggle.title = "Collapse sidebar";
        }
    });

    const statsPanel = document.getElementById("stats-panel");
    const statsToggle = document.getElementById("stats-toggle");

    statsToggle.addEventListener("click", function () {
        statsPanel.classList.toggle("collapsed");
        if (statsPanel.classList.contains("collapsed")) {
            statsToggle.innerHTML = "&#9664;";
            statsToggle.title = "Expand stats";
        } else {
            statsToggle.innerHTML = "&#9654;";
            statsToggle.title = "Collapse stats";
        }
    });
}
