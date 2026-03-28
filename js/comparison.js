/**
 * comparison.js — Player Shooting Comparison page logic
 *
 * Manages up to 4 players in a 2x2 grid of court SVGs.
 * Each slot has its own court drawn by court.js.
 * Shots are plotted with consistent green (made) / red (missed) colors.
 * Shared filters apply to all courts simultaneously.
 */

// ============================================================
// STATE
// ============================================================

const MAX_PLAYERS = 4;
const SEASON = "2024-25";

// Each slot: { playerId, playerName, teamAbbr, courtSvg, shots }
const slots = [null, null, null, null];

// All players from players.json
let allPlayers = [];

// Made/missed colors (consistent across all courts)
const MADE_COLOR = "#4ecca3";
const MISSED_COLOR = "#e94560";


// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    // Draw courts in all 4 panels
    for (let i = 0; i < MAX_PLAYERS; i++) {
        drawCourt("court-" + i);
    }

    // Load players list
    fetch("data/players.json")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            allPlayers = data;
            console.log("Loaded " + allPlayers.length + " players.");
        })
        .catch(function (err) {
            console.error("Failed to load players.json:", err);
        });

    // Set up search
    setupComparisonSearch();

    // Set up filters
    setupComparisonFilters();

    // Set up empty panel click handlers
    updateGridDisplay();

    console.log("Comparison page ready.");
});


// ============================================================
// SEARCH
// ============================================================

function setupComparisonSearch() {
    var input = document.getElementById("player-search");
    var dropdown = document.getElementById("search-results");

    input.addEventListener("input", function () {
        var query = input.value.trim().toLowerCase();

        if (query.length < 2) {
            dropdown.style.display = "none";
            return;
        }

        var matches = allPlayers.filter(function (p) {
            return p.full_name.toLowerCase().includes(query);
        }).slice(0, 8);

        if (matches.length === 0) {
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = "";
        matches.forEach(function (player) {
            var li = document.createElement("li");
            var isAdded = slots.some(function (s) { return s && s.playerId === player.id; });
            var checkmark = isAdded ? "&#10003; " : "";
            var addedClass = isAdded ? ' class="already-added"' : "";

            li.innerHTML = checkmark +
                "<span" + addedClass + ">" + player.full_name + "</span>" +
                ' <span class="team-name">' + player.team_abbreviation + "</span>" +
                ' <span class="shot-count">(' + player.shot_count + " shots)</span>";

            li.addEventListener("click", function () {
                if (isAdded) {
                    // Remove the player
                    removePlayer(player.id);
                } else {
                    addPlayer(player);
                }
                input.value = "";
                dropdown.style.display = "none";
            });

            dropdown.appendChild(li);
        });

        dropdown.style.display = "block";
    });

    // Close dropdown on outside click
    document.addEventListener("click", function (e) {
        if (!e.target.closest(".search-wrapper")) {
            dropdown.style.display = "none";
        }
    });

    // Keyboard navigation
    input.addEventListener("keydown", function (e) {
        var items = dropdown.querySelectorAll("li");
        var activeItem = dropdown.querySelector("li.active");
        var index = Array.from(items).indexOf(activeItem);

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (index < items.length - 1) index++;
            items.forEach(function (li) { li.classList.remove("active"); });
            if (items[index]) items[index].classList.add("active");
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (index > 0) index--;
            items.forEach(function (li) { li.classList.remove("active"); });
            if (items[index]) items[index].classList.add("active");
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeItem) activeItem.click();
        } else if (e.key === "Escape") {
            dropdown.style.display = "none";
        }
    });
}


// ============================================================
// ADD / REMOVE PLAYERS
// ============================================================

function addPlayer(player) {
    // Find the first empty slot
    var slotIndex = -1;
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (slots[i] === null) {
            slotIndex = i;
            break;
        }
    }

    if (slotIndex === -1) {
        alert("Maximum 4 players. Remove one first.");
        return;
    }

    // Check not already added
    if (slots.some(function (s) { return s && s.playerId === player.id; })) {
        return;
    }

    // Fetch shot data
    var url = "data/shots/" + SEASON + "/" + player.id + ".json";

    fetch(url)
        .then(function (r) {
            if (!r.ok) throw new Error("No data for " + player.full_name);
            return r.json();
        })
        .then(function (shots) {
            // Get the court SVG for this slot
            var courtContainer = document.getElementById("court-" + slotIndex);
            var courtSvg = d3.select(courtContainer).select("svg");

            // Store slot data
            slots[slotIndex] = {
                playerId: player.id,
                playerName: player.full_name,
                teamAbbr: player.team_abbreviation,
                courtSvg: courtSvg,
                shots: shots
            };

            // Plot shots on this court
            plotShotsOnCourt(slotIndex);

            // Update the display
            updateGridDisplay();
            updateAllStats();

            console.log("Added " + player.full_name + " to slot " + slotIndex + " (" + shots.length + " shots)");
        })
        .catch(function (err) {
            console.error(err);
            alert("Could not load shot data for " + player.full_name);
        });
}


function removePlayer(playerId) {
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (slots[i] && slots[i].playerId === playerId) {
            // Clear shots from court
            var courtGroup = slots[i].courtSvg.node().__courtGroup;
            courtGroup.select(".shots-layer").selectAll("circle").remove();

            slots[i] = null;

            // Compact: shift players to fill gaps
            compactSlots();

            updateGridDisplay();
            updateAllStats();

            console.log("Removed player from slot " + i);
            return;
        }
    }
}


function compactSlots() {
    // Collect active players in order
    var active = [];
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (slots[i] !== null) {
            active.push({
                playerId: slots[i].playerId,
                playerName: slots[i].playerName,
                teamAbbr: slots[i].teamAbbr,
                shots: slots[i].shots
            });
        }
    }

    // Clear all slots and courts
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (slots[i]) {
            var courtGroup = slots[i].courtSvg.node().__courtGroup;
            courtGroup.select(".shots-layer").selectAll("circle").remove();
        }
        slots[i] = null;
    }

    // Re-assign to first N slots
    for (var j = 0; j < active.length; j++) {
        var courtContainer = document.getElementById("court-" + j);
        var courtSvg = d3.select(courtContainer).select("svg");

        slots[j] = {
            playerId: active[j].playerId,
            playerName: active[j].playerName,
            teamAbbr: active[j].teamAbbr,
            courtSvg: courtSvg,
            shots: active[j].shots
        };

        plotShotsOnCourt(j);
    }
}


// ============================================================
// PLOT SHOTS ON A SPECIFIC COURT
// ============================================================

function plotShotsOnCourt(slotIndex) {
    var slot = slots[slotIndex];
    if (!slot) return;

    var courtSvg = slot.courtSvg;
    var scales = courtSvg.node().__scales;
    var courtGroup = courtSvg.node().__courtGroup;
    var shotsLayer = courtGroup.select(".shots-layer");

    // Clear existing shots
    shotsLayer.selectAll("circle").remove();

    var tooltip = document.getElementById("tooltip");

    // Plot shots
    shotsLayer.selectAll("circle")
        .data(slot.shots)
        .enter()
        .append("circle")
        .attr("cx", function (d) { return scales.x(d.LOC_X); })
        .attr("cy", function (d) { return scales.y(d.LOC_Y); })
        .attr("r", 3)
        .attr("fill", function (d) {
            return d.SHOT_MADE_FLAG === 1 ? MADE_COLOR : MISSED_COLOR;
        })
        .attr("opacity", 0.6)
        .attr("stroke", "none")
        .attr("class", function (d) {
            var classes = "shot-dot";
            classes += d.SHOT_MADE_FLAG === 1 ? " made" : " missed";
            classes += " period-" + d.PERIOD;
            classes += " type-" + (d.SHOT_TYPE === "3PT Field Goal" ? "3pt" : "2pt");
            return classes;
        })
        .attr("data-zone", function (d) { return d.SHOT_ZONE_BASIC; })
        // Tooltip events
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
                '<div class="tip-label">' + slot.playerName + '</div>' +
                '<div>' + d.ACTION_TYPE + '</div>' +
                '<div>' + d.SHOT_TYPE + ' &bull; ' + d.SHOT_DISTANCE + ' ft</div>' +
                '<div class="' + resultClass + '">' + result + '</div>' +
                '<div style="color:#8892a8; font-size:11px;">Q' + d.PERIOD + ' &bull; ' + formattedDate + '</div>';

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
                .attr("r", 3)
                .attr("opacity", 0.6)
                .attr("stroke", "none");
            tooltip.classList.remove("visible");
        });
}


// ============================================================
// FILTERS
// ============================================================

function getCurrentFilters() {
    var resultEl = document.querySelector('input[name="result"]:checked');
    var typeEl = document.querySelector('input[name="shottype"]:checked');
    var quarterEl = document.querySelector('input[name="quarter"]:checked');
    var zoneEl = document.getElementById("zone-filter");

    return {
        result: resultEl ? resultEl.value : "all",
        shotType: typeEl ? typeEl.value : "all",
        quarter: quarterEl ? quarterEl.value : "all",
        zone: zoneEl ? zoneEl.value : "all"
    };
}

function applyFiltersToAll() {
    var filters = getCurrentFilters();

    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (!slots[i]) continue;

        var courtGroup = slots[i].courtSvg.node().__courtGroup;

        courtGroup.selectAll(".shot-dot").each(function () {
            var dot = d3.select(this);
            var d = dot.datum();
            var visible = true;

            if (filters.result === "made" && d.SHOT_MADE_FLAG !== 1) visible = false;
            if (filters.result === "missed" && d.SHOT_MADE_FLAG !== 0) visible = false;
            if (filters.shotType !== "all" && d.SHOT_TYPE !== filters.shotType) visible = false;
            if (filters.quarter !== "all" && d.PERIOD !== parseInt(filters.quarter)) visible = false;
            if (filters.zone !== "all" && d.SHOT_ZONE_BASIC !== filters.zone) visible = false;

            dot.attr("display", visible ? null : "none");
        });
    }

    updateAllStats();
}

function setupComparisonFilters() {
    var allRadios = document.querySelectorAll('input[name="result"], input[name="shottype"], input[name="quarter"]');
    allRadios.forEach(function (radio) {
        radio.addEventListener("change", applyFiltersToAll);
    });

    var zoneSelect = document.getElementById("zone-filter");
    if (zoneSelect) {
        zoneSelect.addEventListener("change", applyFiltersToAll);
    }
}


// ============================================================
// FILTER SHOTS DATA (for stats calculation)
// ============================================================

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


// ============================================================
// UPDATE STATS FOR ALL PANELS
// ============================================================

function updateAllStats() {
    var filters = getCurrentFilters();

    for (var i = 0; i < MAX_PLAYERS; i++) {
        var statsEl = document.getElementById("panel-stats-" + i);

        if (!slots[i]) {
            statsEl.innerHTML = "";
            continue;
        }

        var filtered = filterShotsData(slots[i].shots, filters);
        var total = filtered.length;
        var made = filtered.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var fgPct = total > 0 ? ((made / total) * 100).toFixed(1) : "0.0";

        var twos = filtered.filter(function (s) { return s.SHOT_TYPE === "2PT Field Goal"; });
        var twosMade = twos.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var twoPct = twos.length > 0 ? ((twosMade / twos.length) * 100).toFixed(1) : "0.0";

        var threes = filtered.filter(function (s) { return s.SHOT_TYPE === "3PT Field Goal"; });
        var threesMade = threes.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var threePct = threes.length > 0 ? ((threesMade / threes.length) * 100).toFixed(1) : "0.0";

        function pctClass(val) {
            if (val >= 50) return "good";
            if (val >= 40) return "avg";
            return "poor";
        }

        var html =
            '<div class="panel-stats-grid">' +
            '  <div class="stat-box">' +
            '    <div class="stat-box-label">FG%</div>' +
            '    <div class="stat-box-value ' + pctClass(parseFloat(fgPct)) + '">' + fgPct + '%</div>' +
            '    <div class="stat-box-detail">' + made + '/' + total + '</div>' +
            '  </div>' +
            '  <div class="stat-box">' +
            '    <div class="stat-box-label">2PT%</div>' +
            '    <div class="stat-box-value ' + pctClass(parseFloat(twoPct)) + '">' + twoPct + '%</div>' +
            '    <div class="stat-box-detail">' + twosMade + '/' + twos.length + '</div>' +
            '  </div>' +
            '  <div class="stat-box">' +
            '    <div class="stat-box-label">3PT%</div>' +
            '    <div class="stat-box-value ' + pctClass(parseFloat(threePct)) + '">' + threePct + '%</div>' +
            '    <div class="stat-box-detail">' + threesMade + '/' + threes.length + '</div>' +
            '  </div>' +
            '</div>';

        statsEl.innerHTML = html;
    }
}


// ============================================================
// UPDATE GRID DISPLAY
// ============================================================

function updateGridDisplay() {
    var activeCount = slots.filter(function (s) { return s !== null; }).length;
    var grid = document.getElementById("comparison-grid");

    // Update grid class for layout
    grid.className = "comparison-grid players-" + activeCount;

    // Update each panel
    for (var i = 0; i < MAX_PLAYERS; i++) {
        var panel = document.getElementById("panel-" + i);
        var header = document.getElementById("panel-header-" + i);

        if (slots[i]) {
            // Active panel
            panel.classList.add("active");
            panel.classList.remove("empty");
            panel.style.display = "";
            header.innerHTML =
                '<span class="panel-player-name">' + slots[i].playerName + '</span>' +
                '<span class="panel-player-team">' + slots[i].teamAbbr + '</span>';
        } else if (i < activeCount + 1 && activeCount < MAX_PLAYERS && activeCount > 0) {
            // Show one empty "add player" slot
            panel.classList.remove("active");
            panel.classList.add("empty");
            panel.style.display = "";
            header.innerHTML = "";
            document.getElementById("panel-stats-" + i).innerHTML = "";

            // Replace court content with empty label
            var courtEl = document.getElementById("court-" + i);
            // Keep the SVG but show an overlay
            if (!panel.querySelector(".empty-label")) {
                var label = document.createElement("div");
                label.className = "empty-label";
                label.innerHTML = '<span class="plus-icon">+</span>Search to add a player';
                panel.insertBefore(label, courtEl);
            }

            // Click empty panel to focus search
            panel.onclick = function () {
                document.getElementById("player-search").focus();
            };
        } else {
            // Hidden panel
            panel.style.display = "none";
        }

        // Remove empty label from active panels
        if (slots[i]) {
            var existingLabel = panel.querySelector(".empty-label");
            if (existingLabel) existingLabel.remove();
            panel.onclick = null;
        }
    }

    // If no players, show just 1 empty panel
    if (activeCount === 0) {
        var panel0 = document.getElementById("panel-0");
        panel0.style.display = "";
        panel0.classList.add("empty");
        panel0.classList.remove("active");
        document.getElementById("panel-header-0").innerHTML = "";
        document.getElementById("panel-stats-0").innerHTML = "";

        if (!panel0.querySelector(".empty-label")) {
            var label = document.createElement("div");
            label.className = "empty-label";
            label.innerHTML = '<span class="plus-icon">+</span>Search to add a player';
            panel0.insertBefore(label, document.getElementById("court-0"));
        }

        panel0.onclick = function () {
            document.getElementById("player-search").focus();
        };
    }

    // Update player tags
    updatePlayerTags();
}


// ============================================================
// PLAYER TAGS (below search)
// ============================================================

function updatePlayerTags() {
    var container = document.getElementById("selected-players");
    container.innerHTML = "";

    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (!slots[i]) continue;

        var tag = document.createElement("div");
        tag.className = "player-tag";
        tag.innerHTML =
            '<span class="player-tag-name">' + slots[i].playerName + '</span>' +
            '<span class="player-team">' + slots[i].teamAbbr + '</span>' +
            '<button class="player-tag-remove" data-player-id="' + slots[i].playerId + '" title="Remove">&times;</button>';

        tag.querySelector(".player-tag-remove").addEventListener("click", function () {
            var pid = parseInt(this.getAttribute("data-player-id"));
            removePlayer(pid);
        });

        container.appendChild(tag);
    }
}
