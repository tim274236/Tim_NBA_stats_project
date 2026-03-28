/**
 * search.js — Player search with autocomplete
 *
 * Loads players.json and provides a search-as-you-type dropdown.
 * When a player is selected, calls the onPlayerSelected callback
 * (set by app.js) which loads their shot data and plots it.
 *
 * Supports toggling multiple players on/off on the court.
 */

// Will be populated when players.json is loaded
let allPlayers = [];

// Callback function — set by app.js
// Called with (player) when a player is selected
let onPlayerSelected = null;

// Currently active (toggled on) player IDs
const toggledPlayerIds = new Set();


/**
 * loadPlayers()
 * Fetches players.json and stores the list.
 * Returns a Promise that resolves when loaded.
 */
function loadPlayers() {
    return fetch("data/players.json")
        .then(function (response) {
            if (!response.ok) throw new Error("Could not load players.json");
            return response.json();
        })
        .then(function (data) {
            allPlayers = data;
            console.log("Loaded " + allPlayers.length + " players from players.json");
            return allPlayers;
        })
        .catch(function (err) {
            console.error("Error loading players:", err);
            allPlayers = [];
            return [];
        });
}


/**
 * setupSearch()
 * Attaches event listeners to the search input and dropdown.
 */
function setupSearch() {
    const input = document.getElementById("player-search");
    const dropdown = document.getElementById("search-results");

    // --- As the user types, filter and show matching players ---
    input.addEventListener("input", function () {
        const query = input.value.trim().toLowerCase();

        if (query.length < 2) {
            dropdown.style.display = "none";
            return;
        }

        // Find matching players (by name)
        const matches = allPlayers.filter(function (p) {
            return p.full_name.toLowerCase().includes(query);
        }).slice(0, 8);  // Limit to 8 results

        if (matches.length === 0) {
            dropdown.style.display = "none";
            return;
        }

        // Build dropdown HTML
        dropdown.innerHTML = "";
        matches.forEach(function (player) {
            const li = document.createElement("li");

            // Show checkmark if player is already toggled on
            const isActive = toggledPlayerIds.has(player.id);
            const checkmark = isActive ? "✓ " : "";
            const activeClass = isActive ? ' class="active-player"' : "";

            li.innerHTML = checkmark +
                '<span' + activeClass + '>' + player.full_name + '</span>' +
                ' <span class="team-name">' + player.team_abbreviation + '</span>' +
                ' <span class="shot-count">(' + player.shot_count + ' shots)</span>';

            li.addEventListener("click", function () {
                selectPlayer(player);
                input.value = "";
                dropdown.style.display = "none";
            });

            dropdown.appendChild(li);
        });

        dropdown.style.display = "block";
    });

    // --- Close dropdown when clicking outside ---
    document.addEventListener("click", function (e) {
        if (!e.target.closest(".search-wrapper")) {
            dropdown.style.display = "none";
        }
    });

    // --- Keyboard navigation ---
    input.addEventListener("keydown", function (e) {
        const items = dropdown.querySelectorAll("li");
        const activeItem = dropdown.querySelector("li.active");
        let index = Array.from(items).indexOf(activeItem);

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (index < items.length - 1) index++;
            items.forEach(function (li) { li.classList.remove("active"); });
            if (items[index]) items[index].classList.add("active");
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (index > 0) index--;
            items.forEach(function (li) { li.classList.remove("active"); });
            if (items[index]) items[index].classList.add("active");
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (activeItem) activeItem.click();
        }
        else if (e.key === "Escape") {
            dropdown.style.display = "none";
        }
    });
}


/**
 * selectPlayer(player)
 * Toggles a player on/off. If they're already shown, removes them.
 * If they're not shown, adds them to the court.
 */
function selectPlayer(player) {
    if (toggledPlayerIds.has(player.id)) {
        // Player is already on — remove them
        toggledPlayerIds.delete(player.id);
        if (onPlayerSelected) {
            onPlayerSelected(player, "remove");
        }
    } else {
        // Player is not on — add them
        toggledPlayerIds.add(player.id);
        if (onPlayerSelected) {
            onPlayerSelected(player, "add");
        }
    }

    // Update the selected players display
    updateSelectedPlayersDisplay();
}


/**
 * updateSelectedPlayersDisplay()
 * Shows all currently toggled-on players below the search bar,
 * each with a remove (X) button.
 */
function updateSelectedPlayersDisplay() {
    const container = document.getElementById("selected-player");

    if (toggledPlayerIds.size === 0) {
        container.style.display = "none";
        container.innerHTML = "";
        return;
    }

    container.style.display = "block";
    container.innerHTML = "";

    toggledPlayerIds.forEach(function (playerId) {
        const player = allPlayers.find(function (p) { return p.id === playerId; });
        if (!player) return;

        // Get this player's color from activePlayers (set by shots.js)
        const active = activePlayers[playerId];
        const color = active ? active.colors.made : "#ffffff";

        const tag = document.createElement("div");
        tag.className = "player-tag";
        tag.style.borderLeft = "3px solid " + color;
        tag.innerHTML =
            '<span class="player-tag-name">' + player.full_name + '</span>' +
            ' <span class="player-team">' + player.team_abbreviation + '</span>' +
            '<button class="player-tag-remove" title="Remove ' + player.full_name + '">&times;</button>';

        // Click X to remove
        tag.querySelector(".player-tag-remove").addEventListener("click", function () {
            selectPlayer(player);  // toggle off
        });

        container.appendChild(tag);
    });
}


/**
 * getToggledPlayerIds()
 * Returns the Set of currently active player IDs.
 */
function getToggledPlayerIds() {
    return toggledPlayerIds;
}


console.log("search.js loaded — ready for player search.");
