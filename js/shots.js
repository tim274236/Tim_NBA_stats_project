/**
 * shots.js — Plots shot data on the NBA court SVG using D3.js
 *
 * Main functions:
 *   plotShots(courtSvg, shots, playerId) — add a player's shots to the court
 *   clearShots(courtSvg, playerId)       — remove a specific player's shots
 *   clearAllShots(courtSvg)              — remove all shots from the court
 *   filterShots(courtSvg, filters)       — show/hide shots based on filter criteria
 *
 * Each player gets their own color so multiple players can be shown at once.
 * Shots are color-coded: bright = made, muted = missed.
 */

// ============================================================
// Player color palette — each player gets a unique pair of colors
// [made color, missed color]
// ============================================================
const PLAYER_COLORS = [
    { made: "#4ecca3", missed: "#e94560" },   // green / red (default)
    { made: "#48bfe3", missed: "#f77f00" },   // blue / orange
    { made: "#f0c040", missed: "#9d4edd" },   // yellow / purple
    { made: "#80ed99", missed: "#ff6b6b" },   // light green / coral
    { made: "#72efdd", missed: "#ff9770" },   // teal / peach
    { made: "#b8c0ff", missed: "#fca311" },   // lavender / amber
    { made: "#a0c4ff", missed: "#ef476f" },   // sky blue / pink
    { made: "#caffbf", missed: "#e76f51" },   // mint / burnt orange
];

// Track which players are currently on the court and their color index
// { playerId: { colorIndex, shots, playerName } }
const activePlayers = {};
let nextColorIndex = 0;


/**
 * plotShots(courtSvg, shots, playerId, playerName)
 *
 * Plots all shots for a player on the court.
 *   - courtSvg: the D3 SVG selection returned by drawCourt()
 *   - shots: array of shot objects from nba_api JSON
 *   - playerId: unique player ID (used to group/remove shots)
 *   - playerName: display name for tooltips
 */
function plotShots(courtSvg, shots, playerId, playerName) {

    // If this player is already plotted, remove their old shots first
    if (activePlayers[playerId]) {
        clearShots(courtSvg, playerId);
    }

    // Assign a color to this player
    const colorIndex = nextColorIndex % PLAYER_COLORS.length;
    nextColorIndex++;
    const colors = PLAYER_COLORS[colorIndex];

    // Store in active players
    activePlayers[playerId] = {
        colorIndex: colorIndex,
        shots: shots,
        playerName: playerName,
        colors: colors
    };

    // Get the scales and court group from the SVG (stored by court.js)
    const scales = courtSvg.node().__scales;
    const courtGroup = courtSvg.node().__courtGroup;

    // Find the shots layer (created by court.js)
    const shotsLayer = courtGroup.select(".shots-layer");

    // Create a group for this player's shots
    const playerGroup = shotsLayer.append("g")
        .attr("class", `player-shots player-${playerId}`)
        .attr("data-player-id", playerId);

    // Get the tooltip element
    const tooltip = document.getElementById("tooltip");

    // Plot each shot as a circle
    playerGroup.selectAll("circle")
        .data(shots)
        .enter()
        .append("circle")
        .attr("cx", function (d) { return scales.x(d.LOC_X); })
        .attr("cy", function (d) { return scales.y(d.LOC_Y); })
        .attr("r", 3.5)
        .attr("fill", function (d) {
            return d.SHOT_MADE_FLAG === 1 ? colors.made : colors.missed;
        })
        .attr("opacity", 0.6)
        .attr("stroke", "none")
        .attr("class", function (d) {
            // Add CSS classes for filtering
            let classes = "shot-dot";
            classes += d.SHOT_MADE_FLAG === 1 ? " made" : " missed";
            classes += " period-" + d.PERIOD;
            classes += " type-" + (d.SHOT_TYPE === "3PT Field Goal" ? "3pt" : "2pt");
            return classes;
        })
        // Store all shot data on the element for filtering and tooltips
        .attr("data-zone", function (d) { return d.SHOT_ZONE_BASIC; })
        .attr("data-action", function (d) { return d.ACTION_TYPE; })
        .attr("data-player-id", playerId)

        // --- HOVER TOOLTIP ---
        .on("mouseenter", function (event, d) {
            // Highlight the shot
            d3.select(this)
                .attr("r", 6)
                .attr("opacity", 1)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1.5);

            // Format the game date nicely
            const dateStr = d.GAME_DATE || "";
            let formattedDate = dateStr;
            if (dateStr.length === 8) {
                // Format: 20241022 → Oct 22, 2024
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                formattedDate = months[parseInt(month) - 1] + " " + parseInt(day) + ", " + year;
            }

            // Build tooltip content
            const result = d.SHOT_MADE_FLAG === 1 ? "Made" : "Missed";
            const resultClass = d.SHOT_MADE_FLAG === 1 ? "tip-made" : "tip-missed";

            tooltip.innerHTML =
                '<div class="tip-label">' + playerName + '</div>' +
                '<div>' + d.ACTION_TYPE + '</div>' +
                '<div>' + d.SHOT_TYPE + ' &bull; ' + d.SHOT_DISTANCE + ' ft</div>' +
                '<div class="' + resultClass + '">' + result + '</div>' +
                '<div style="color:#8892a8; font-size:11px;">Q' + d.PERIOD + ' &bull; ' + formattedDate + '</div>';

            // Position tooltip near the mouse
            const courtContainer = document.querySelector(".court-container");
            const rect = courtContainer.getBoundingClientRect();
            tooltip.style.left = (event.clientX - rect.left + 12) + "px";
            tooltip.style.top = (event.clientY - rect.top - 10) + "px";
            tooltip.classList.add("visible");
        })
        .on("mousemove", function (event) {
            const courtContainer = document.querySelector(".court-container");
            const rect = courtContainer.getBoundingClientRect();
            tooltip.style.left = (event.clientX - rect.left + 12) + "px";
            tooltip.style.top = (event.clientY - rect.top - 10) + "px";
        })
        .on("mouseleave", function () {
            // Reset the shot dot
            const d = d3.select(this).datum();
            d3.select(this)
                .attr("r", 3.5)
                .attr("opacity", 0.6)
                .attr("stroke", "none");

            tooltip.classList.remove("visible");
        });

    // Return info about what was plotted (useful for stats)
    return {
        playerId: playerId,
        playerName: playerName,
        totalShots: shots.length,
        colors: colors
    };
}


/**
 * clearShots(courtSvg, playerId)
 * Remove a specific player's shots from the court.
 */
function clearShots(courtSvg, playerId) {
    const courtGroup = courtSvg.node().__courtGroup;
    courtGroup.select(`.player-${playerId}`).remove();
    delete activePlayers[playerId];
}


/**
 * clearAllShots(courtSvg)
 * Remove all shots from the court.
 */
function clearAllShots(courtSvg) {
    const courtGroup = courtSvg.node().__courtGroup;
    courtGroup.select(".shots-layer").selectAll("g").remove();
    Object.keys(activePlayers).forEach(function (id) {
        delete activePlayers[id];
    });
    nextColorIndex = 0;
}


/**
 * filterShots(courtSvg, filters)
 *
 * Show/hide individual shot dots based on filter criteria.
 * Does NOT remove shots — just sets visibility so toggling filters is instant.
 *
 * filters object:
 *   {
 *     result: "all" | "made" | "missed",
 *     shotType: "all" | "2PT Field Goal" | "3PT Field Goal",
 *     quarter: "all" | "1" | "2" | "3" | "4" | "5",
 *     zone: "all" | "Restricted Area" | "Mid-Range" | etc.
 *   }
 */
function filterShots(courtSvg, filters) {
    const courtGroup = courtSvg.node().__courtGroup;

    courtGroup.selectAll(".shot-dot").each(function () {
        const dot = d3.select(this);
        const d = dot.datum();
        let visible = true;

        // Filter by result
        if (filters.result === "made" && d.SHOT_MADE_FLAG !== 1) visible = false;
        if (filters.result === "missed" && d.SHOT_MADE_FLAG !== 0) visible = false;

        // Filter by shot type
        if (filters.shotType !== "all" && d.SHOT_TYPE !== filters.shotType) visible = false;

        // Filter by quarter
        if (filters.quarter !== "all" && d.PERIOD !== parseInt(filters.quarter)) visible = false;

        // Filter by zone
        if (filters.zone !== "all" && d.SHOT_ZONE_BASIC !== filters.zone) visible = false;

        dot.attr("display", visible ? null : "none");
    });
}


/**
 * getActivePlayers()
 * Returns the activePlayers object so other scripts can check who's on the court.
 */
function getActivePlayers() {
    return activePlayers;
}


console.log("shots.js loaded — ready to plot real NBA shot data.");
