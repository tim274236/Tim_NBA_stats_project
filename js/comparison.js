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
const SEASON = "2025-26";

// Each slot: { playerId, playerName, teamAbbr, courtSvg, shots }
const slots = [null, null, null, null];

// Each slot view mode: "dots" | "hex" | "zones"
const slotViewMode = ["dots", "dots", "dots", "dots"];

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

    // Expand/minimize buttons
    setupExpandButtons();

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
            var headshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/" + player.id + ".png";

            li.innerHTML =
                '<img class="search-headshot" src="' + headshotUrl + '" alt="" onerror="this.style.display=\'none\'">' +
                checkmark +
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
            clearHexMap(slots[i].courtSvg);
            clearZoneOverlay(slots[i].courtSvg);

            slots[i] = null;
            slotViewMode[i] = "dots";

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
                shots: slots[i].shots,
                viewMode: slotViewMode[i]
            });
        }
    }

    // Clear all slots and courts
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (slots[i]) {
            var courtGroup = slots[i].courtSvg.node().__courtGroup;
            courtGroup.select(".shots-layer").selectAll("circle").remove();
            clearHexMap(slots[i].courtSvg);
            clearZoneOverlay(slots[i].courtSvg);
        }
        slots[i] = null;
        slotViewMode[i] = "dots";
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
        slotViewMode[j] = active[j].viewMode || "dots";

        switchSlotView(j, slotViewMode[j], true);
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
        applyFiltersToSlot(i, filters);
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
// ZONE OVERLAY — Opta-style with pink opacity + white separators
// ============================================================

// Single pink color — opacity varies by FG% (higher FG% = more opaque)
var ZONE_PINK = "#d44070";

/**
 * Map FG% (0–1) to opacity (higher shooting = darker pink).
 * Range: 0.15 (very low FG%) to 0.75 (very high FG%)
 */
function getZoneOpacity(fgPct) {
    // Clamp between 20% and 75% FG
    var clamped = Math.max(0.20, Math.min(0.75, fgPct));
    // Map to opacity 0.15 – 0.75
    return 0.15 + (clamped - 0.20) / (0.75 - 0.20) * 0.60;
}

// Court coordinate constants (tenths of feet, basket at origin)
var ZC = {
    THREE_R:    237.5,
    CORNER_X:   220,
    CORNER_Y:   Math.sqrt(237.5 * 237.5 - 220 * 220), // ~89.5
    ARC3_AT_80: Math.sqrt(237.5 * 237.5 - 80 * 80),   // ~223.6
    PAINT_X:    80,
    PAINT_TOP:  137.5,
    BASELINE:   -52,     // True baseline (edge of court)
    SIDELINE:   250,     // Sideline (edge of court)
    COURT_TOP:  418      // Top of visible court
};

// Convert court coords to "x,y" pixel string
function zPt(xCoord, yCoord, scales) {
    return scales.x(xCoord) + "," + scales.y(yCoord);
}

// Sample points along an arc of given radius between two x values
function sampleArc(radius, xStart, xEnd, n, scales) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
        var xc = xStart + (xEnd - xStart) * (i / n);
        var yc = Math.sqrt(radius * radius - xc * xc);
        pts.push(zPt(xc, yc, scales));
    }
    return pts;
}

/**
 * Build SVG path for each zone. Zones fill the entire court edge-to-edge.
 *
 * Layout (matching Opta):
 *   - Corner L/R: sideline to 3PT line, baseline to where arc meets corner line
 *   - 3PT L/C/R: above 3PT arc to court top, split at x=-250, -80, 80, 250
 *   - Mid L/R: between paint and 3PT arc on left/right sides, baseline to arc
 *   - Mid LC/RC: between paint top and 3PT arc, above the paint
 *   - Paint L/R: left/right halves of the paint rectangle
 *   - Restricted: semicircle at basket
 */
function buildZoneShapePath(zoneName, scales) {
    var C = ZC;

    switch (zoneName) {
        // --- CORNERS: sideline to 3PT corner line, baseline to corner-Y ---
        case "Corner L":
            return "M" + zPt(-C.SIDELINE, C.BASELINE, scales) +
                   "L" + zPt(-C.SIDELINE, C.CORNER_Y, scales) +
                   "L" + zPt(-C.CORNER_X, C.CORNER_Y, scales) +
                   "L" + zPt(-C.CORNER_X, C.BASELINE, scales) + "Z";

        case "Corner R":
            return "M" + zPt(C.CORNER_X,  C.BASELINE, scales) +
                   "L" + zPt(C.CORNER_X,  C.CORNER_Y, scales) +
                   "L" + zPt(C.SIDELINE,  C.CORNER_Y, scales) +
                   "L" + zPt(C.SIDELINE,  C.BASELINE, scales) + "Z";

        // --- 3PT ABOVE THE BREAK: above 3PT arc to court top ---
        case "3PT (L)": {
            // Left wing: sideline to x=-80
            var arc3L = sampleArc(237.5, -C.CORNER_X, -80, 25, scales);
            return "M" + zPt(-C.SIDELINE, C.CORNER_Y, scales) +
                   "L" + arc3L.join("L") +
                   "L" + zPt(-80,         C.COURT_TOP, scales) +
                   "L" + zPt(-C.SIDELINE, C.COURT_TOP, scales) + "Z";
        }

        case "3PT (C)": {
            // Center: x=-80 to x=80
            var arc3C = sampleArc(237.5, -80, 80, 35, scales);
            return "M" + zPt(-80, C.ARC3_AT_80, scales) +
                   "L" + arc3C.join("L") +
                   "L" + zPt(80,  C.COURT_TOP, scales) +
                   "L" + zPt(-80, C.COURT_TOP, scales) + "Z";
        }

        case "3PT (R)": {
            // Right wing: x=80 to sideline
            var arc3R = sampleArc(237.5, 80, C.CORNER_X, 25, scales);
            return "M" + zPt(80,         C.ARC3_AT_80, scales) +
                   "L" + arc3R.join("L") +
                   "L" + zPt(C.SIDELINE, C.CORNER_Y, scales) +
                   "L" + zPt(C.SIDELINE, C.COURT_TOP, scales) +
                   "L" + zPt(80,         C.COURT_TOP, scales) + "Z";
        }

        // --- MID-RANGE SIDES: paint edge to 3PT arc, baseline to arc ---
        case "Mid (L)": {
            // Left side: from paint left edge to sideline corner, baseline up to 3PT arc
            var arcML = sampleArc(237.5, -C.CORNER_X, -80, 25, scales);
            return "M" + zPt(-C.CORNER_X, C.BASELINE, scales) +
                   "L" + zPt(-C.CORNER_X, C.CORNER_Y, scales) +
                   "L" + arcML.join("L") +
                   "L" + zPt(-C.PAINT_X,  C.PAINT_TOP, scales) +
                   "L" + zPt(-C.PAINT_X,  C.BASELINE, scales) + "Z";
        }

        case "Mid (R)": {
            // Right side: mirror of Mid (L)
            var arcMR = sampleArc(237.5, 80, C.CORNER_X, 25, scales);
            return "M" + zPt(C.PAINT_X,  C.BASELINE, scales) +
                   "L" + zPt(C.PAINT_X,  C.PAINT_TOP, scales) +
                   "L" + arcMR.join("L") +
                   "L" + zPt(C.CORNER_X, C.CORNER_Y, scales) +
                   "L" + zPt(C.CORNER_X, C.BASELINE, scales) + "Z";
        }

        // --- MID-RANGE CENTER: above paint, below 3PT arc ---
        case "Mid (LC)": {
            var arcLC = sampleArc(237.5, -80, 0, 20, scales);
            return "M" + zPt(-C.PAINT_X, C.PAINT_TOP, scales) +
                   "L" + arcLC.join("L") +
                   "L" + zPt(0, C.PAINT_TOP, scales) + "Z";
        }

        case "Mid (RC)": {
            var arcRC = sampleArc(237.5, 0, 80, 20, scales);
            return "M" + zPt(0,         C.PAINT_TOP, scales) +
                   "L" + arcRC.join("L") +
                   "L" + zPt(C.PAINT_X, C.PAINT_TOP, scales) + "Z";
        }

        // --- PAINT: left/right halves of the key ---
        case "Paint (L)":
            return "M" + zPt(-C.PAINT_X, C.BASELINE, scales) +
                   "L" + zPt(-C.PAINT_X, C.PAINT_TOP, scales) +
                   "L" + zPt(0,          C.PAINT_TOP, scales) +
                   "L" + zPt(0,          C.BASELINE, scales) + "Z";

        case "Paint (R)":
            return "M" + zPt(0,         C.BASELINE, scales) +
                   "L" + zPt(0,         C.PAINT_TOP, scales) +
                   "L" + zPt(C.PAINT_X, C.PAINT_TOP, scales) +
                   "L" + zPt(C.PAINT_X, C.BASELINE, scales) + "Z";

        // --- RESTRICTED AREA: semicircle at basket ---
        case "Restricted": {
            var arcRA = sampleArc(40, -40, 40, 25, scales);
            return "M" + zPt(-40, C.BASELINE, scales) +
                   "L" + arcRA.join("L") +
                   "L" + zPt(40, C.BASELINE, scales) + "Z";
        }

        default:
            return "";
    }
}

/**
 * Build white separator lines between zones.
 * Returns array of {x1,y1,x2,y2} or path strings for arcs.
 */
function drawZoneSeparators(zoneLayer, scales) {
    var C = ZC;
    var lineStyle = { stroke: "#ffffff", strokeWidth: 2, opacity: 0.8 };

    // Helper: draw a straight white line
    function wLine(x1, y1, x2, y2) {
        zoneLayer.append("line")
            .attr("x1", scales.x(x1)).attr("y1", scales.y(y1))
            .attr("x2", scales.x(x2)).attr("y2", scales.y(y2))
            .attr("stroke", lineStyle.stroke)
            .attr("stroke-width", lineStyle.strokeWidth)
            .attr("stroke-opacity", lineStyle.opacity);
    }

    // Helper: draw a white arc path
    function wArc(radius, xStart, xEnd, n) {
        var pts = sampleArc(radius, xStart, xEnd, n, scales);
        zoneLayer.append("path")
            .attr("d", "M" + pts.join("L"))
            .attr("fill", "none")
            .attr("stroke", lineStyle.stroke)
            .attr("stroke-width", lineStyle.strokeWidth)
            .attr("stroke-opacity", lineStyle.opacity);
    }

    // 1. 3PT arc (full visible arc from corner to corner)
    wArc(237.5, -C.CORNER_X, C.CORNER_X, 50);

    // 2. 3PT corner lines (sideline to where arc meets)
    wLine(-C.CORNER_X, C.BASELINE, -C.CORNER_X, C.CORNER_Y);
    wLine(C.CORNER_X,  C.BASELINE, C.CORNER_X,  C.CORNER_Y);

    // 3. Paint rectangle edges
    wLine(-C.PAINT_X, C.BASELINE, -C.PAINT_X, C.PAINT_TOP);
    wLine(C.PAINT_X,  C.BASELINE, C.PAINT_X,  C.PAINT_TOP);
    wLine(-C.PAINT_X, C.PAINT_TOP, C.PAINT_X, C.PAINT_TOP);

    // 4. Paint center divider (vertical line splitting paint L/R)
    wLine(0, C.BASELINE, 0, C.PAINT_TOP);

    // 5. Mid-range center divider (vertical from paint top to 3PT arc at x=0)
    wLine(0, C.PAINT_TOP, 0, 237.5);

    // 6. Restricted area arc
    wArc(40, -40, 40, 25);

    // 7. Vertical lines at x=-80 and x=80 from 3PT arc to court top
    //    (separates 3PT L/C/R above the arc)
    wLine(-80, C.ARC3_AT_80, -80, C.COURT_TOP);
    wLine(80,  C.ARC3_AT_80, 80,  C.COURT_TOP);

    // 8. Sidelines extended up from corner to court top (left & right edges)
    wLine(-C.SIDELINE, C.BASELINE, -C.SIDELINE, C.COURT_TOP);
    wLine(C.SIDELINE,  C.BASELINE, C.SIDELINE,  C.COURT_TOP);

    // 9. Baseline
    wLine(-C.SIDELINE, C.BASELINE, C.SIDELINE, C.BASELINE);
}

// ZONE_DEFS — ordered back-to-front for correct layering
var ZONE_DEFS = [
    {
        name: "Corner L",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Left Corner 3"; },
        labelX: -235, labelY: 15
    },
    {
        name: "Corner R",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Right Corner 3"; },
        labelX: 235, labelY: 15
    },
    {
        name: "3PT (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X < -80; },
        labelX: -175, labelY: 275
    },
    {
        name: "3PT (C)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X >= -80 && s.LOC_X <= 80; },
        labelX: 0, labelY: 320
    },
    {
        name: "3PT (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X > 80; },
        labelX: 175, labelY: 275
    },
    {
        name: "Mid (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X < -80; },
        labelX: -150, labelY: 80
    },
    {
        name: "Mid (LC)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= -80 && s.LOC_X < 0; },
        labelX: -50, labelY: 185
    },
    {
        name: "Mid (RC)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= 0 && s.LOC_X < 80; },
        labelX: 50, labelY: 185
    },
    {
        name: "Mid (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= 80; },
        labelX: 150, labelY: 80
    },
    {
        name: "Paint (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X < 0; },
        labelX: -45, labelY: 80
    },
    {
        name: "Paint (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X >= 0; },
        labelX: 45, labelY: 80
    },
    {
        name: "Restricted",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Restricted Area"; },
        labelX: 0, labelY: 15
    }
];

function plotZoneOverlay(courtSvg, shots) {
    var scales = courtSvg.node().__scales;
    var courtGroup = courtSvg.node().__courtGroup;

    clearZoneOverlay(courtSvg);

    var zoneLayer = courtGroup.append("g")
        .attr("class", "zone-overlay");

    // Pass 1 — draw filled zone shapes with pink + varying opacity
    ZONE_DEFS.forEach(function (zone) {
        var zoneShots = shots.filter(zone.filter);
        if (zoneShots.length < 1) return;

        var made  = zoneShots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var fgPct = made / zoneShots.length;
        var path  = buildZoneShapePath(zone.name, scales);
        if (!path) return;

        zoneLayer.append("path")
            .attr("d", path)
            .attr("fill", ZONE_PINK)
            .attr("fill-opacity", getZoneOpacity(fgPct));
    });

    // Pass 2 — draw white separator lines on top of fills
    drawZoneSeparators(zoneLayer, scales);

    // Pass 3 — draw pill labels on top of everything
    ZONE_DEFS.forEach(function (zone) {
        var zoneShots = shots.filter(zone.filter);
        if (zoneShots.length < 1) return;

        var made  = zoneShots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var fgPct = made / zoneShots.length;
        var px    = scales.x(zone.labelX);
        var py    = scales.y(zone.labelY);

        // Pill background
        var pillW = 60, pillH = 32;
        zoneLayer.append("rect")
            .attr("x", px - pillW / 2)
            .attr("y", py - pillH / 2)
            .attr("width", pillW)
            .attr("height", pillH)
            .attr("rx", 6)
            .attr("fill", ZONE_PINK)
            .attr("fill-opacity", getZoneOpacity(fgPct) + 0.15)
            .attr("stroke", "rgba(255,255,255,0.5)")
            .attr("stroke-width", 1);

        // FG% text
        zoneLayer.append("text")
            .attr("x", px)
            .attr("y", py - 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#ffffff")
            .attr("font-size", "12px")
            .attr("font-weight", "800")
            .attr("font-family", "-apple-system, BlinkMacSystemFont, sans-serif")
            .text(Math.round(fgPct * 100) + "%");

        // Made/Attempted text
        zoneLayer.append("text")
            .attr("x", px)
            .attr("y", py + 11)
            .attr("text-anchor", "middle")
            .attr("fill", "rgba(255,255,255,0.85)")
            .attr("font-size", "8px")
            .attr("font-weight", "600")
            .attr("font-family", "-apple-system, BlinkMacSystemFont, sans-serif")
            .text(made + "/" + zoneShots.length);
    });
}

function clearZoneOverlay(courtSvg) {
    var courtGroup = courtSvg.node().__courtGroup;
    courtGroup.select(".zone-overlay").remove();
}

function updatePanelToggleState(slotIndex) {
    var panel = document.getElementById("panel-" + slotIndex);
    if (!panel) return;

    panel.querySelectorAll(".view-toggle-btn").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === slotViewMode[slotIndex]);
    });
}

function applyFiltersToSlot(slotIndex, filters) {
    if (!slots[slotIndex]) return;

    var filtered = filterShotsData(slots[slotIndex].shots, filters);
    var courtSvg = slots[slotIndex].courtSvg;
    var courtGroup = courtSvg.node().__courtGroup;
    var shotsLayer = courtGroup.select(".shots-layer");

    if (slotViewMode[slotIndex] === "hex") {
        shotsLayer.selectAll("circle").remove();
        clearZoneOverlay(courtSvg);
        clearHexMap(courtSvg);
        plotHexMap(courtSvg, filtered);
        return;
    }

    clearHexMap(courtSvg);

    if (slotViewMode[slotIndex] === "zones") {
        if (shotsLayer.selectAll("circle").size() === 0) {
            plotShotsOnCourt(slotIndex);
        }
        shotsLayer.selectAll("circle").attr("display", "none");
        plotZoneOverlay(courtSvg, filtered);
        return;
    }

    clearZoneOverlay(courtSvg);
    if (shotsLayer.selectAll("circle").size() === 0) {
        plotShotsOnCourt(slotIndex);
    }

    shotsLayer.selectAll(".shot-dot").each(function () {
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

function switchSlotView(slotIndex, mode, forceRerender) {
    if (!slots[slotIndex]) return;
    if (!forceRerender && slotViewMode[slotIndex] === mode) return;

    slotViewMode[slotIndex] = mode;
    applyFiltersToSlot(slotIndex, getCurrentFilters());
    updatePanelToggleState(slotIndex);
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

        function threePointClass(val) {
            if (val >= 35) return "good";
            if (val >= 28) return "avg";
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
            '    <div class="stat-box-value ' + threePointClass(parseFloat(threePct)) + '">' + threePct + '%</div>' +
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
            var headshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/" + slots[i].playerId + ".png";
            header.innerHTML =
                '<img class="panel-headshot" src="' + headshotUrl + '" alt="" onerror="this.style.display=\'none\'">' +
                '<span class="panel-player-name">' + slots[i].playerName + '</span>' +
                '<span class="panel-player-team">' + slots[i].teamAbbr + '</span>' +
                '<div class="panel-view-toggles">' +
                '  <button class="view-toggle-btn' + (slotViewMode[i] === "dots" ? " active" : "") + '" data-slot="' + i + '" data-mode="dots" title="Dot Chart">Dots</button>' +
                '  <button class="view-toggle-btn' + (slotViewMode[i] === "hex" ? " active" : "") + '" data-slot="' + i + '" data-mode="hex" title="Hex Map">Hex</button>' +
                '  <button class="view-toggle-btn' + (slotViewMode[i] === "zones" ? " active" : "") + '" data-slot="' + i + '" data-mode="zones" title="Zone Heat Map">Zones</button>' +
                '</div>';

            panel.querySelectorAll(".view-toggle-btn").forEach(function (btn) {
                btn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    var slot = parseInt(btn.getAttribute("data-slot"));
                    var mode = btn.getAttribute("data-mode");
                    switchSlotView(slot, mode);
                });
            });
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

// ============================================================
// EXPAND / MINIMIZE PANELS
// ============================================================

function setupExpandButtons() {
    document.querySelectorAll(".expand-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var panelIndex = parseInt(btn.getAttribute("data-panel"));
            var panel = document.getElementById("panel-" + panelIndex);
            var grid = document.getElementById("comparison-grid");

            if (panel.classList.contains("expanded")) {
                // Minimize
                panel.classList.remove("expanded");
                grid.classList.remove("has-expanded");
                btn.innerHTML = "&#x26F6;";
                btn.title = "Enlarge";
            } else {
                // First collapse any other expanded panel
                document.querySelectorAll(".court-panel.expanded").forEach(function (p) {
                    p.classList.remove("expanded");
                    p.querySelector(".expand-btn").innerHTML = "&#x26F6;";
                    p.querySelector(".expand-btn").title = "Enlarge";
                });

                // Expand this panel
                panel.classList.add("expanded");
                grid.classList.add("has-expanded");
                btn.innerHTML = "&#x2715;";
                btn.title = "Minimize";
            }
        });
    });
}


// ============================================================
// RE-RENDER ALL COURTS (for hex/dots toggle)
// ============================================================

function rerenderAllCourts() {
    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (!slots[i]) continue;
        switchSlotView(i, slotViewMode[i], true);
    }

    updateAllStats();
}


function updatePlayerTags() {
    var container = document.getElementById("selected-players");
    container.innerHTML = "";

    for (var i = 0; i < MAX_PLAYERS; i++) {
        if (!slots[i]) continue;

        var tag = document.createElement("div");
        tag.className = "player-tag";
        var tagHeadshotUrl = "https://cdn.nba.com/headshots/nba/latest/1040x760/" + slots[i].playerId + ".png";
        tag.innerHTML =
            '<img class="tag-headshot" src="' + tagHeadshotUrl + '" alt="" onerror="this.style.display=\'none\'">' +
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
