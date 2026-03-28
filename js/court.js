/**
 * court.js — Draws an NBA half-court SVG using D3.js
 *
 * COORDINATE SYSTEM (matches nba_api's ShotChartDetail):
 *   - Origin (0, 0) is at the basket
 *   - X axis: -250 (left) to 250 (right), in TENTHS of feet
 *   - Y axis: -52 (behind basket) to ~470 (half court), in TENTHS of feet
 *   - So X=100 means 10 feet to the right of the basket
 *
 * NBA COURT DIMENSIONS (real feet → tenths of feet in our system):
 *   - Full court: 94ft × 50ft
 *   - Half court: 47ft × 50ft → Y goes 0 to 470, X goes -250 to 250
 *   - Basket is 5.25ft (52.5 tenths) from the baseline
 *   - Three-point line: 23.75ft (237.5 tenths) from basket, 22ft (220 tenths) in corners
 *   - Paint (key): 16ft (160 tenths) wide, 19ft (190 tenths) from baseline
 *   - Free throw line: 19ft (190 tenths) from baseline, 15ft (150 tenths) from basket
 *   - Free throw circle: 6ft (60 tenths) radius
 *   - Restricted area: 4ft (40 tenths) radius arc from basket
 *   - Backboard: 6ft (60 tenths) wide, on the baseline
 *   - Basket (rim): 0.75ft (7.5 tenths) radius
 */

// ============================================================
// drawCourt(containerId)
//
// Call this function with the ID of an HTML element (like a <div>).
// It will create an SVG inside that element and draw the court.
// Returns the D3 SVG selection so you can add shots on top later.
// ============================================================
function drawCourt(containerId) {

    // --- CONFIGURATION ---
    // These control how big the court appears on screen.
    // The court data coordinates range from -250 to 250 (X) and -52 to 470 (Y).
    // We add some padding so the court doesn't touch the edges.

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const courtWidth = 500;   // pixels wide (maps to -250...250 in court coords)
    const courtHeight = 470;  // pixels tall (maps to -52...418 in court coords — we show up to just past half court)

    const width = courtWidth + margin.left + margin.right;
    const height = courtHeight + margin.top + margin.bottom;

    // --- CREATE THE SVG ---
    // Remove any existing SVG first (so we can redraw if needed)
    d3.select(`#${containerId}`).select("svg").remove();

    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)  // Makes it responsive!
        .attr("preserveAspectRatio", "xMidYMid meet")
        .classed("court-svg", true);

    // Create a group element shifted by the margin, so (0,0) in this group
    // corresponds to the top-left of the court drawing area
    const court = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // --- SCALE FUNCTIONS ---
    // These convert from nba_api coordinates to pixel positions.
    //
    // X scale: court coords -250 to 250 → pixels 0 to courtWidth
    // Y scale: court coords -52 to 418 → pixels courtHeight to 0
    //   (Y is flipped because SVG y goes down, but court y goes up)

    const xScale = d3.scaleLinear()
        .domain([-250, 250])
        .range([0, courtWidth]);

    const yScale = d3.scaleLinear()
        .domain([-52, 418])
        .range([courtHeight, 0]);

    // Store scales on the SVG element so other scripts (like shots.js) can use them
    svg.node().__scales = { x: xScale, y: yScale };
    svg.node().__courtGroup = court;

    // --- STYLING ---
    // Court lines are drawn with these styles
    const lineColor = "#333333";
    const lineWidth = 2;
    const courtColor = "#f5e6c8";  // Light wood color for the court floor

    // --- DRAW THE COURT FLOOR ---
    court.append("rect")
        .attr("x", xScale(-250))
        .attr("y", yScale(418))
        .attr("width", xScale(250) - xScale(-250))
        .attr("height", yScale(-52) - yScale(418))
        .attr("fill", courtColor)
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW THE BASKET (HOOP) ---
    // The basket is at (0, 0) in court coordinates
    // It's a small circle representing the rim (radius = 7.5 tenths of a foot)
    court.append("circle")
        .attr("cx", xScale(0))
        .attr("cy", yScale(0))
        .attr("r", Math.abs(xScale(7.5) - xScale(0)))
        .attr("fill", "none")
        .attr("stroke", "#e05d33")
        .attr("stroke-width", 2);

    // --- DRAW THE BACKBOARD ---
    // The backboard is 6ft (60 tenths) wide, sitting at y = -7.5 (just behind the basket)
    court.append("line")
        .attr("x1", xScale(-30))
        .attr("y1", yScale(-7.5))
        .attr("x2", xScale(30))
        .attr("y2", yScale(-7.5))
        .attr("stroke", lineColor)
        .attr("stroke-width", 3);

    // --- DRAW THE PAINT (KEY / LANE) ---
    // The paint is 16ft (160 tenths) wide, extending 19ft (190 tenths) from baseline.
    // Since the basket is 52.5 tenths from the baseline, the paint goes from
    // y = -52.5 (baseline) to y = 137.5 (19ft from baseline = 190 - 52.5)
    // X goes from -80 to 80 (8ft each side of center)
    court.append("rect")
        .attr("x", xScale(-80))
        .attr("y", yScale(137.5))
        .attr("width", xScale(80) - xScale(-80))
        .attr("height", yScale(-47.5) - yScale(137.5))
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW THE FREE THROW CIRCLE (top half — solid) ---
    // The free throw circle has a 6ft (60 tenths) radius, centered at the free throw line
    // Free throw line is at y = 137.5 (same as top of the paint)
    const ftCircleArc = d3.arc()
        .innerRadius(0)
        .outerRadius(Math.abs(xScale(60) - xScale(0)))
        .startAngle(-Math.PI / 2)   // top half of circle
        .endAngle(Math.PI / 2);

    court.append("path")
        .attr("d", ftCircleArc)
        .attr("transform", `translate(${xScale(0)}, ${yScale(137.5)})`)
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW THE FREE THROW CIRCLE (bottom half — dashed) ---
    const ftCircleArcBottom = d3.arc()
        .innerRadius(0)
        .outerRadius(Math.abs(xScale(60) - xScale(0)))
        .startAngle(Math.PI / 2)
        .endAngle(Math.PI * 1.5);

    court.append("path")
        .attr("d", ftCircleArcBottom)
        .attr("transform", `translate(${xScale(0)}, ${yScale(137.5)})`)
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth)
        .attr("stroke-dasharray", "5,5");

    // --- DRAW THE RESTRICTED AREA ARC ---
    // 4ft (40 tenths) radius semicircle around the basket
    // Goes from one side of the paint to the other at the baseline level
    const restrictedArc = d3.arc()
        .innerRadius(0)
        .outerRadius(Math.abs(xScale(40) - xScale(0)))
        .startAngle(-Math.PI / 2)
        .endAngle(Math.PI / 2);

    court.append("path")
        .attr("d", restrictedArc)
        .attr("transform", `translate(${xScale(0)}, ${yScale(0)})`)
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW THE THREE-POINT LINE ---
    // The three-point line is an arc with radius 237.5 tenths (23.75ft) from the basket.
    // In the corners, it becomes straight lines at x = -220 and x = 220 (22ft from center).
    // The arc connects the two corner lines.

    // Corner three-point lines (straight, along the sidelines)
    // Left corner: x = -220, from baseline (y = -47.5) up to where the arc starts
    // Right corner: x = 220, same thing

    // First, figure out where the arc meets the corner lines.
    // The arc has radius 237.5 from center (0,0). At x = 220:
    // y = sqrt(237.5^2 - 220^2) = sqrt(56406.25 - 48400) = sqrt(8006.25) ≈ 89.5
    const threePointRadius = 237.5;
    const cornerThreeX = 220;
    const cornerThreeY = Math.sqrt(threePointRadius * threePointRadius - cornerThreeX * cornerThreeX);

    // Left corner line
    court.append("line")
        .attr("x1", xScale(-cornerThreeX))
        .attr("y1", yScale(-47.5))
        .attr("x2", xScale(-cornerThreeX))
        .attr("y2", yScale(cornerThreeY))
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // Right corner line
    court.append("line")
        .attr("x1", xScale(cornerThreeX))
        .attr("y1", yScale(-47.5))
        .attr("x2", xScale(cornerThreeX))
        .attr("y2", yScale(cornerThreeY))
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // Three-point arc (connects the two corner lines)
    // We need to draw an arc from (-220, cornerThreeY) to (220, cornerThreeY)
    // going over the top (through y = 237.5 at x = 0)
    const threePointArcRadius = Math.abs(xScale(threePointRadius) - xScale(0));

    // Calculate the start and end angles for the arc
    // The arc is centered at (0,0) — the basket position
    // Start angle: the angle from center to (-220, cornerThreeY)
    // In SVG/D3 arc: angle 0 = top, goes clockwise
    const startAngle = -Math.atan2(cornerThreeX, cornerThreeY);  // left side
    const endAngle = Math.atan2(cornerThreeX, cornerThreeY);     // right side

    const threePointArc = d3.arc()
        .innerRadius(threePointArcRadius)
        .outerRadius(threePointArcRadius)
        .startAngle(startAngle)
        .endAngle(endAngle);

    court.append("path")
        .attr("d", threePointArc)
        .attr("transform", `translate(${xScale(0)}, ${yScale(0)})`)
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW THE CENTER COURT ARC ---
    // This is the half-circle at half court (just for visual context)
    // Half court line is at y = 417.5 (47ft - 5.25ft basket offset = 41.75ft = 417.5 tenths)
    // Center circle radius = 6ft = 60 tenths
    const centerCourtArc = d3.arc()
        .innerRadius(0)
        .outerRadius(Math.abs(xScale(60) - xScale(0)))
        .startAngle(Math.PI / 2)
        .endAngle(Math.PI * 1.5);

    court.append("path")
        .attr("d", centerCourtArc)
        .attr("transform", `translate(${xScale(0)}, ${yScale(417.5)})`)
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // Half court line
    court.append("line")
        .attr("x1", xScale(-250))
        .attr("y1", yScale(417.5))
        .attr("x2", xScale(250))
        .attr("y2", yScale(417.5))
        .attr("stroke", lineColor)
        .attr("stroke-width", lineWidth);

    // --- DRAW HASH MARKS ON THE PAINT ---
    // Small tick marks on the sides of the paint (used for free throw rebounding)
    const hashMarkPositions = [
        // y positions (in court coords) for the hash marks along the paint
        // These are at specific distances from the baseline
        { y: 27.5 },   // ~8ft from baseline
        { y: 57.5 },   // ~11ft from baseline
        { y: 87.5 },   // ~14ft from baseline
        { y: 117.5 },  // ~17ft from baseline
    ];

    const hashLength = 10; // how far the hash extends outward from the paint

    hashMarkPositions.forEach(function(mark) {
        // Left side hash marks (outside the paint)
        court.append("line")
            .attr("x1", xScale(-80))
            .attr("y1", yScale(mark.y))
            .attr("x2", xScale(-80 - hashLength))
            .attr("y2", yScale(mark.y))
            .attr("stroke", lineColor)
            .attr("stroke-width", lineWidth);

        // Right side hash marks (outside the paint)
        court.append("line")
            .attr("x1", xScale(80))
            .attr("y1", yScale(mark.y))
            .attr("x2", xScale(80 + hashLength))
            .attr("y2", yScale(mark.y))
            .attr("stroke", lineColor)
            .attr("stroke-width", lineWidth);
    });

    // --- CREATE A GROUP FOR SHOTS ---
    // This is where shots.js will add its circles later
    // We create it now so it's on top of the court lines
    court.append("g").attr("class", "shots-layer");

    // --- RETURN THE SVG ---
    // Other scripts will need this to add shots, tooltips, etc.
    return svg;
}
