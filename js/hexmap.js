/**
 * hexmap.js — Goldsberry-style hexagonal shot map
 *
 * Shared module that renders hex-binned shot data on a court SVG.
 * Uses d3-hexbin plugin for hexagonal binning.
 *
 * Color: FG% per hex → blue (cold) → yellow (avg) → red (hot)
 * Size:  Shot count per hex → small (few) → large (many)
 */

// ============================================================
// CONFIGURATION
// ============================================================

const HEX_CONFIG = {
    radius: 10,            // base hex radius in pixels
    minRadius: 4,          // minimum hex radius (low frequency)
    maxRadius: 12,         // maximum hex radius (high frequency)
    minShots: 2,           // ignore bins with fewer shots than this
    avgFgPct: 0.46,        // league average FG% for color midpoint
    coldColor: "#4488ff",  // below average
    avgColor: "#ffdd44",   // average
    hotColor: "#ff4444",   // above average
    darkBg: "#111111",     // dark court background in hex mode
    darkLine: "#444444",   // court line color in hex mode
};


// ============================================================
// ZONE DEFINITIONS — for FG% overlay labels
// ============================================================

// Each zone: { name, filter(shot), labelX, labelY }
// labelX/labelY are in NBA court coordinates
const SHOT_ZONES = [
    {
        name: "Restricted Area",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Restricted Area"; },
        labelX: 0, labelY: 30
    },
    {
        name: "Paint (L)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X < 0;
        },
        labelX: -60, labelY: 90
    },
    {
        name: "Paint (R)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "In The Paint (Non-RA)" && s.LOC_X >= 0;
        },
        labelX: 60, labelY: 90
    },
    {
        name: "Mid-Range (L)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X < -30;
        },
        labelX: -140, labelY: 120
    },
    {
        name: "Mid-Range (R)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= 30;
        },
        labelX: 140, labelY: 120
    },
    {
        name: "Mid-Range (C)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Mid-Range" && s.LOC_X >= -30 && s.LOC_X < 30;
        },
        labelX: 0, labelY: 170
    },
    {
        name: "3PT (L)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X < -80;
        },
        labelX: -175, labelY: 260
    },
    {
        name: "3PT (C)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X >= -80 && s.LOC_X <= 80;
        },
        labelX: 0, labelY: 310
    },
    {
        name: "3PT (R)",
        filter: function (s) {
            return s.SHOT_ZONE_BASIC === "Above the Break 3" && s.LOC_X > 80;
        },
        labelX: 175, labelY: 260
    },
    {
        name: "Corner 3 (L)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Left Corner 3"; },
        labelX: -230, labelY: 20
    },
    {
        name: "Corner 3 (R)",
        filter: function (s) { return s.SHOT_ZONE_BASIC === "Right Corner 3"; },
        labelX: 230, labelY: 20
    }
];


// ============================================================
// plotHexMap(courtSvg, shots)
//
// Renders a Goldsberry-style hex map on the given court SVG.
// Expects d3-hexbin to be loaded.
// ============================================================

function plotHexMap(courtSvg, shots) {
    var scales = courtSvg.node().__scales;
    var courtGroup = courtSvg.node().__courtGroup;

    // Remove any existing hex layer
    courtGroup.select(".hex-layer").remove();

    // Create hex layer (behind zone labels, on top of court)
    var hexLayer = courtGroup.insert("g", ".shots-layer")
        .attr("class", "hex-layer");

    // Convert shots to pixel coordinates with made/missed info
    var points = shots.map(function (s) {
        return [scales.x(s.LOC_X), scales.y(s.LOC_Y), s.SHOT_MADE_FLAG];
    });

    // Create hexbin generator
    var hexbin = d3.hexbin()
        .x(function (d) { return d[0]; })
        .y(function (d) { return d[1]; })
        .radius(HEX_CONFIG.radius)
        .extent([[0, 0], [500, 470]]);

    // Bin the data
    var bins = hexbin(points);

    // Filter out bins with too few shots
    bins = bins.filter(function (bin) {
        return bin.length >= HEX_CONFIG.minShots;
    });

    if (bins.length === 0) return;

    // Calculate FG% and count for each bin
    bins.forEach(function (bin) {
        var made = 0;
        bin.forEach(function (p) {
            if (p[2] === 1) made++;
        });
        bin.fgPct = made / bin.length;
        bin.count = bin.length;
    });

    // Find max count for size scaling
    var maxCount = d3.max(bins, function (b) { return b.count; });

    // Color scale: FG% → blue (cold) → yellow (avg) → red (hot)
    var colorScale = d3.scaleLinear()
        .domain([0.25, HEX_CONFIG.avgFgPct, 0.65])
        .range([HEX_CONFIG.coldColor, HEX_CONFIG.avgColor, HEX_CONFIG.hotColor])
        .clamp(true);

    // Size scale: count → radius
    var sizeScale = d3.scaleSqrt()
        .domain([HEX_CONFIG.minShots, maxCount])
        .range([HEX_CONFIG.minRadius, HEX_CONFIG.maxRadius])
        .clamp(true);

    // Draw hexagons
    hexLayer.selectAll("path")
        .data(bins)
        .enter()
        .append("path")
        .attr("d", function (d) {
            var r = sizeScale(d.count);
            return hexPath(r);
        })
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        })
        .attr("fill", function (d) {
            return colorScale(d.fgPct);
        })
        .attr("stroke", "rgba(0,0,0,0.3)")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.9);

    // Add zone FG% labels
    addZoneLabels(courtGroup, shots, scales);
}


// ============================================================
// hexPath(radius) — generates a flat-topped hexagon path string
// ============================================================

function hexPath(radius) {
    var points = [];
    for (var i = 0; i < 6; i++) {
        var angle = (Math.PI / 3) * i - Math.PI / 6;
        points.push([
            radius * Math.cos(angle),
            radius * Math.sin(angle)
        ]);
    }
    return "M" + points.map(function (p) { return p[0] + "," + p[1]; }).join("L") + "Z";
}


// ============================================================
// addZoneLabels(courtGroup, shots, scales)
// ============================================================

function addZoneLabels(courtGroup, shots, scales) {
    // Remove existing labels
    courtGroup.select(".zone-labels").remove();

    var labelGroup = courtGroup.append("g")
        .attr("class", "zone-labels");

    SHOT_ZONES.forEach(function (zone) {
        var zoneShots = shots.filter(zone.filter);
        if (zoneShots.length < 5) return; // skip zones with too few shots

        var made = zoneShots.filter(function (s) { return s.SHOT_MADE_FLAG === 1; }).length;
        var pct = Math.round((made / zoneShots.length) * 100);

        var px = scales.x(zone.labelX);
        var py = scales.y(zone.labelY);

        // Background pill
        labelGroup.append("rect")
            .attr("x", px - 22)
            .attr("y", py - 10)
            .attr("width", 44)
            .attr("height", 20)
            .attr("rx", 10)
            .attr("fill", "rgba(0,0,0,0.7)")
            .attr("stroke", "rgba(255,255,255,0.2)")
            .attr("stroke-width", 0.5);

        // Percentage text
        labelGroup.append("text")
            .attr("x", px)
            .attr("y", py + 4)
            .attr("text-anchor", "middle")
            .attr("fill", "#ffffff")
            .attr("font-size", "11px")
            .attr("font-weight", "700")
            .attr("font-family", "-apple-system, BlinkMacSystemFont, sans-serif")
            .text(pct + "%");
    });
}


// ============================================================
// clearHexMap(courtSvg)
// ============================================================

function clearHexMap(courtSvg) {
    var courtGroup = courtSvg.node().__courtGroup;
    courtGroup.select(".hex-layer").remove();
    courtGroup.select(".zone-labels").remove();
}


