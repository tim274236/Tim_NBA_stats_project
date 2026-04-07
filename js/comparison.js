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
// ZONE OVERLAY
// ============================================================

/**
 * Returns a solid color (Red/Yellow/Green) based on FG% thresholds
 * - Red:    < 28%
 * - Yellow: 28–34%
 * - Green:  >= 35%
 */
function getZoneColor(fgPct) {
    var pct = fgPct * 100;
    if (pct >= 35) return "#4ecca3";  // Green
    if (pct >= 28) return "#f0c040";  // Yellow
    return "#e94560";                 // Red
}

// Court coordinate constants (tenths of feet, basket at origin)
var ZC = {
    THREE_R:    237.5,
    CORNER_X:   220,
    CORNER_Y:   Math.sqrt(237.5 * 237.5 - 220 * 220), // ~89.5
    ARC3_AT_80: Math.sqrt(237.5 * 237.5 - 80 * 80),   // ~223.6
    PAINT_X:    80,
    PAINT_TOP:  137.5,
    BASELINE:   -47.5,
    COURT_TOP:  415
};

// Convert court coords to "x,y" pixel string
function zPt(xCoord, yCoord, scales) {
    return scales.x(xCoord) + "," + scales.y(yCoord);
}

// Sample points along the 3PT arc between two x values (court coords)
function sample3PTArc(xStart, xEnd, n, scales) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
        var xc = xStart + (xEnd - xStart) * (i / n);
        var yc = Math.sqrt(237.5 * 237.5 - xc * xc);
        pts.push(zPt(xc, yc, scales));
    }
    return pts;
}

// Sample points along the restricted area arc between two x values
function sampleRestrictedArc(xStart, xEnd, n, scales) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
        var xc = xStart + (xEnd - xStart) * (i / n);
        var yc = Math.sqrt(40 * 40 - xc * xc);
        pts.push(zPt(xc, yc, scales));
    }
    return pts;
}

/**
 * Build SVG path string for the filled court zone shape.
 * Zones are drawn back-to-front: corners → 3PT → mid → paint → restricted.
 */
function buildZoneShapePath(zoneName, scales) {
    var C = ZC;
    var arcCornerL, arcCornerR, arc3L, arc3C, arc3R, arcML, arcLC, arcRC, arcMR, arcRA;

    switch (zoneName) {
        case "Corner L":
            return "M" + zPt(-250,       C.BASELINE, scales) +
                   "L" + zPt(-250,       C.CORNER_Y, scales) +
                   "L" + zPt(-C.CORNER_X, C.CORNER_Y, scales) +
                   "L" + zPt(-C.CORNER_X, C.BASELINE, scales) + "Z";

        case "Corner R":
            return "M" + zPt(C.CORNER_X, C.BASELINE, scales) +
                   "L" + zPt(C.CORNER_X, C.CORNER_Y, scales) +
                   "L" + zPt(250,        C.CORNER_Y, scales) +
                   "L" + zPt(250,        C.BASELINE, scales) + "Z";

        case "3PT (L)":
            // Above the break, left wing: x=-220→-80, above 3PT arc up to court top
            arc3L = sample3PTArc(-C.CORNER_X, -80, 20, scales);
            return "M" + zPt(-C.CORNER_X, C.CORNER_Y,  scales) +
                   "L" + arc3L.join("L") +
                   "L" + zPt(-80,         C.COURT_TOP, scales) +
                   "L" + zPt(-C.CORNER_X, C.COURT_TOP, scales) + "Z";

        case "3PT (C)":
            // Above the break, center: x=-80→80, above 3PT arc
            arc3C = sample3PTArc(-80, 80, 30, scales);
            return "M" + zPt(-80, C.ARC3_AT_80, scales) +
                   "L" + arc3C.join("L") +
                   "L" + zPt(80,  C.COURT_TOP,  scales) +
                   "L" + zPt(-80, C.COURT_TOP,  scales) + "Z";

        case "3PT (R)":
            // Above the break, right wing: x=80→220, above 3PT arc
            arc3R = sample3PTArc(80, C.CORNER_X, 20, scales);
            return "M" + zPt(80,          C.ARC3_AT_80, scales) +
                   "L" + arc3R.join("L") +
                   "L" + zPt(C.CORNER_X,  C.COURT_TOP,  scales) +
                   "L" + zPt(80,          C.COURT_TOP,  scales) + "Z";

        case "Mid (L)":
            // Left side mid-range: x=-220→-80, BASELINE up to 3PT arc
            arcML = sample3PTArc(-C.CORNER_X, -80, 20, scales);
            return "M" + zPt(-C.PAINT_X,  C.BASELINE, scales) +
                   "L" + arcML.slice().reverse().join("L") +
                   "L" + zPt(-C.CORNER_X, C.BASELINE, scales) + "Z";

        case "Mid (LC)":
            // Center-left mid-range: x=-80→0, PAINT_TOP up to 3PT arc
            arcLC = sample3PTArc(-80, 0, 15, scales);
            return "M" + zPt(-C.PAINT_X, C.PAINT_TOP, scales) +
                   "L" + arcLC.join("L") +
                   "L" + zPt(0,          C.PAINT_TOP, scales) + "Z";

        case "Mid (RC)":
            // Center-right mid-range: x=0→80, PAINT_TOP up to 3PT arc
            arcRC = sample3PTArc(0, 80, 15, scales);
            return "M" + zPt(0,         C.PAINT_TOP, scales) +
                   "L" + arcRC.join("L") +
                   "L" + zPt(C.PAINT_X, C.PAINT_TOP, scales) + "Z";

        case "Mid (R)":
            // Right side mid-range: x=80→220, BASELINE up to 3PT arc
            arcMR = sample3PTArc(80, C.CORNER_X, 20, scales);
            return "M" + zPt(C.PAINT_X,  C.BASELINE, scales) +
                   "L" + arcMR.join("L") +
                   "L" + zPt(C.CORNER_X, C.BASELINE, scales) + "Z";

        case "Paint (L)":
            return "M" + zPt(-C.PAINT_X, C.BASELINE,  scales) +
                   "L" + zPt(-C.PAINT_X, C.PAINT_TOP, scales) +
                   "L" + zPt(0,          C.PAINT_TOP, scales) +
                   "L" + zPt(0,          C.BASELINE,  scales) + "Z";

        case "Paint (R)":
            return "M" + zPt(0,          C.BASELINE,  scales) +
                   "L" + zPt(0,          C.PAINT_TOP, scales) +
                   "L" + zPt(C.PAINT_X,  C.PAINT_TOP, scales) +
                   "L" + zPt(C.PAINT_X,  C.BASELINE,  scales) + "Z";

        case "Restricted":
            // Semicircle arc r=40 around basket + rectangle to baseline
            arcRA = sampleRestrictedArc(-40, 40, 20, scales);
            return "M" + zPt(-40, C.BASELINE, scales) +
                   "L" + arcRA.join("L") +
                   "L" + zPt(40, C.BASELINE, scales) + "Z";

        default:
            return "";
    }
}

// ZONE_DEFS — ordered back-to-front for correct layering when drawn
var ZONE_DEFS = [
    {
        name: "Corner L",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Left Corner 3"; },
        labelX: -230, labelY: 10,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Corner R",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Right Corner 3"; },
        labelX: 230, labelY: 10,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "3PT (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X < -80; },
        labelX: -180, labelY: 250,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "3PT (C)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X >= -80 && s.LOC_X <= 80; },
        labelX: 0, labelY: 300,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "3PT (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X > 80; },
        labelX: 180, labelY: 250,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Mid (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X < -80; },
        labelX: -155, labelY: 100,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Mid (LC)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= -80 && s.LOC_X < 0; },
        labelX: -55, labelY: 180,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Mid (RC)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= 0 && s.LOC_X < 80; },
        labelX: 55, labelY: 180,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Mid (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= 80; },
        labelX: 155, labelY: 100,
        pillWidth: 60, pillHeight: 36
    },
    {
        name: "Paint (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X < 0; },
        labelX: -50, labelY: 90,
        pillWidth: 65, pillHeight: 36
    },
    {
        name: "Paint (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X >= 0; },
        labelX: 50, labelY: 90,
        pillWidth: 65, pillHeight: 36
    },
    {
        name: "Restricted",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Restricted Area"; },
        labelX: 0, labelY: 20,
        pillWidth: 70, pillHeight: 36
    }
];

function plotZoneOverlay(courtSvg, shots) {
    var scales = courtSvg.node().__scales;
    var courtGroup = courtSvg.node().__courtGroup;

    clearZoneOverlay(courtSvg);

    var zoneLayer = courtGroup.append("g")
        .attr("class", "zone-overlay");

    // Pass 1 — draw filled zone shapes (back-to-front via ZONE_DEFS order)
    ZONE_DEFS.forEach(function (zone) {
        var zoneShots = shots.filter(zone.filter);
        if (zoneShots.length < 3) return;

        var made  = zoneShots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var fgPct = made / zoneShots.length;
        var color = getZoneColor(fgPct);
        var path  = buildZoneShapePath(zone.name, scales);
        if (!path) return;

        zoneLayer.append("path")
            .attr("d", path)
            .attr("fill", color)
            .attr("fill-opacity", 0.60)
            .attr("stroke", "none");
    });

    // Pass 2 — draw pill labels on top of all fills
    ZONE_DEFS.forEach(function (zone) {
        var zoneShots = shots.filter(zone.filter);
        if (zoneShots.length < 3) return;

        var made      = zoneShots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var fgPct     = made / zoneShots.length;
        var px        = scales.x(zone.labelX);
        var py        = scales.y(zone.labelY);
        var zoneColor = getZoneColor(fgPct);

        zoneLayer.append("rect")
            .attr("x", px - zone.pillWidth / 2)
            .attr("y", py - zone.pillHeight / 2)
            .attr("width",  zone.pillWidth)
            .attr("height", zone.pillHeight)
            .attr("rx", 8)
            .attr("fill", zoneColor)
            .attr("fill-opacity", 0.95)
            .attr("stroke", "rgba(255,255,255,0.4)")
            .attr("stroke-width", 1.5);

        zoneLayer.append("text")
            .attr("x", px)
            .attr("y", py - 3)
            .attr("text-anchor", "middle")
            .attr("fill", "#ffffff")
            .attr("font-size", "13px")
            .attr("font-weight", "800")
            .attr("font-family", "-apple-system, BlinkMacSystemFont, sans-serif")
            .text(Math.round(fgPct * 100) + "%");

        zoneLayer.append("text")
            .attr("x", px)
            .attr("y", py + 12)
            .attr("text-anchor", "middle")
            .attr("fill", "rgba(255,255,255,0.8)")
            .attr("font-size", "9px")
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
