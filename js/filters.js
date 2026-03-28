/**
 * filters.js — Wires up filter controls to show/hide shots on the court
 *
 * Listens to radio buttons and dropdowns in the sidebar,
 * reads the current filter state, and calls filterShots() from shots.js
 * to show/hide individual shot dots.
 *
 * Also exports getCurrentFilters() so other scripts can read the state.
 */


/**
 * getCurrentFilters()
 * Reads all filter controls and returns an object with current values.
 */
function getCurrentFilters() {
    // Shot result: "all", "made", or "missed"
    const resultEl = document.querySelector('input[name="result"]:checked');
    const result = resultEl ? resultEl.value : "all";

    // Shot type: "all", "2PT Field Goal", or "3PT Field Goal"
    const typeEl = document.querySelector('input[name="shottype"]:checked');
    const shotType = typeEl ? typeEl.value : "all";

    // Quarter: "all", "1", "2", "3", "4", "5" (5 = OT)
    const quarterEl = document.querySelector('input[name="quarter"]:checked');
    const quarter = quarterEl ? quarterEl.value : "all";

    // Zone: "all" or a specific zone name
    const zoneEl = document.getElementById("zone-filter");
    const zone = zoneEl ? zoneEl.value : "all";

    return {
        result: result,
        shotType: shotType,
        quarter: quarter,
        zone: zone
    };
}


/**
 * setupFilters(courtSvg)
 * Attaches change listeners to all filter controls.
 * When any filter changes, re-applies all filters to the shots on the court.
 */
function setupFilters(courtSvg) {

    // Collect all filter elements
    const resultRadios = document.querySelectorAll('input[name="result"]');
    const typeRadios = document.querySelectorAll('input[name="shottype"]');
    const quarterRadios = document.querySelectorAll('input[name="quarter"]');
    const zoneSelect = document.getElementById("zone-filter");

    // Single handler that reads current state and applies filters
    function applyFilters() {
        const filters = getCurrentFilters();
        filterShots(courtSvg, filters);

        // Also update stats to reflect filtered data
        if (typeof updateStatsPanel === "function") {
            updateStatsPanel();
        }
    }

    // Attach listeners to all radio buttons
    resultRadios.forEach(function (radio) {
        radio.addEventListener("change", applyFilters);
    });

    typeRadios.forEach(function (radio) {
        radio.addEventListener("change", applyFilters);
    });

    quarterRadios.forEach(function (radio) {
        radio.addEventListener("change", applyFilters);
    });

    // Attach listener to the zone dropdown
    if (zoneSelect) {
        zoneSelect.addEventListener("change", applyFilters);
    }

    console.log("Filters wired up and ready.");
}


/**
 * resetFilters()
 * Resets all filter controls back to "all" and re-applies.
 */
function resetFilters(courtSvg) {
    // Reset radio buttons to "all"
    const allRadios = document.querySelectorAll('input[name="result"][value="all"], input[name="shottype"][value="all"], input[name="quarter"][value="all"]');
    allRadios.forEach(function (radio) {
        radio.checked = true;
    });

    // Reset zone dropdown
    const zoneSelect = document.getElementById("zone-filter");
    if (zoneSelect) zoneSelect.value = "all";

    // Re-apply (show everything)
    const filters = getCurrentFilters();
    filterShots(courtSvg, filters);
}


console.log("filters.js loaded — ready to wire up filter controls.");
