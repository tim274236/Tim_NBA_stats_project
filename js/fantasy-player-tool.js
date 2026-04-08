/* ============================================================
   fantasy-player-tool.js — Fantasy Player Tool Logic

   Loads season-level player stats, calculates fantasy totals,
   renders a sortable table with collapsible control panels.
   ============================================================ */

(function () {

    // ── Available seasons (newest first) ────────────────────────
    const SEASONS = ["2025-26", "2024-25"];

    // ── Default scoring weights ─────────────────────────────────
    const DEFAULT_SCORING = {
        fgm: 1, fgmi: -1, ftm: 1, ftmi: -1,
        reb: 1, ast: 2, stl: 4, blk: 4, tov: -2, pts: 1
    };

    // ── Column definitions ──────────────────────────────────────
    // key: internal key,  label: header text,  cls: CSS class suffix,
    // get: accessor from a player row,  fmt: formatter,  fantasy: boolean
    const COLUMNS = [
        { key: "rk",       label: "RK",        cls: "rk",      get: (p, i) => i + 1,               fmt: v => v },
        { key: "name",     label: "NAME",      cls: "name",    get: p => p.PLAYER_NAME,             fmt: v => v },
        { key: "team",     label: "TEAM",      cls: "team",    get: p => p.TEAM_ABBREVIATION,       fmt: v => v },
        { key: "pos",      label: "POS",       cls: "pos",     get: p => p.POS || "—",              fmt: v => v },
        { key: "gp",       label: "GP",        cls: "num",     get: p => p.GP,                      fmt: v => v },
        { key: "gs",       label: "GS",        cls: "num",     get: p => p.GS,                      fmt: v => v },
        { key: "min",      label: "MIN",       cls: "num",     get: p => p.MIN,                     fmt: v => typeof v === "number" ? v.toFixed(1) : v },
        { key: "pts",      label: "PTS",       cls: "num",     get: p => p.PTS,                     fmt: v => v },
        { key: "reb",      label: "REB",       cls: "num",     get: p => p.REB,                     fmt: v => v },
        { key: "ast",      label: "AST",       cls: "num",     get: p => p.AST,                     fmt: v => v },
        { key: "blk",      label: "BLK",       cls: "num",     get: p => p.BLK,                     fmt: v => v },
        { key: "stl",      label: "STL",       cls: "num",     get: p => p.STL,                     fmt: v => v },
        { key: "fgPct",    label: "FG%",       cls: "num",     get: p => p.FG_PCT,                  fmt: v => v != null ? (v * 100).toFixed(1) : "—" },
        { key: "ftPct",    label: "FT%",       cls: "num",     get: p => p.FT_PCT,                  fmt: v => v != null ? (v * 100).toFixed(1) : "—" },
        { key: "fg3Pct",   label: "3P%",       cls: "num",     get: p => p.FG3_PCT,                 fmt: v => v != null ? (v * 100).toFixed(1) : "—" },
        { key: "ftm",      label: "FTM",       cls: "num",     get: p => p.FTM,                     fmt: v => v },
        { key: "fg2m",     label: "2PM",       cls: "num",     get: p => p._2PM,                    fmt: v => v },
        { key: "fg3m",     label: "3PM",       cls: "num",     get: p => p.FG3M,                    fmt: v => v },
        { key: "tov",      label: "TOV",       cls: "num",     get: p => p.TOV,                     fmt: v => v },
        { key: "dd2",      label: "DDBL",      cls: "num",     get: p => p.DD2,                     fmt: v => v },
        { key: "td3",      label: "TDBL",      cls: "num",     get: p => p.TD3,                     fmt: v => v },
        { key: "totalF",   label: "Total Fantasy",       cls: "fantasy", get: p => p._TOTAL_FANTASY,  fmt: v => v.toFixed(1), fantasy: true },
        { key: "fppg",     label: "Fantasy PPG",         cls: "fantasy", get: p => p._FANTASY_PPG,    fmt: v => v.toFixed(1), fantasy: true },
    ];

    // ── State ───────────────────────────────────────────────────
    let rawPlayers = [];            // full dataset for current season
    let sortKey = "totalF";         // current sort column
    let sortAsc = false;            // false = descending
    let visibleCols = new Set(COLUMNS.map(c => c.key));
    let scoring = { ...DEFAULT_SCORING };

    // ── DOM refs ────────────────────────────────────────────────
    const seasonSelect     = document.getElementById("season-select");
    const playerCountEl    = document.getElementById("player-count");
    const tableHead        = document.getElementById("table-head");
    const tableBody        = document.getElementById("table-body");
    const loadingEl        = document.getElementById("loading-state");
    const tableContainer   = document.getElementById("table-container");

    // ── Initialise ──────────────────────────────────────────────
    buildSeasonOptions();
    buildScoringInputs();
    buildStatsCheckboxes();
    setupCollapsibles();
    loadSeason(seasonSelect.value);

    // ── Season selector ─────────────────────────────────────────
    function buildSeasonOptions() {
        SEASONS.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            seasonSelect.appendChild(opt);
        });
        seasonSelect.addEventListener("change", () => loadSeason(seasonSelect.value));
    }

    // ── Scoring inputs ──────────────────────────────────────────
    function buildScoringInputs() {
        const grid = document.getElementById("scoring-grid");
        const cats = [
            { key: "fgm",  label: "FGM"  },
            { key: "fgmi", label: "FGMI" },
            { key: "ftm",  label: "FTM"  },
            { key: "ftmi", label: "FTMI" },
            { key: "reb",  label: "REB"  },
            { key: "ast",  label: "AST"  },
            { key: "stl",  label: "STL"  },
            { key: "blk",  label: "BLK"  },
            { key: "tov",  label: "TO"   },
            { key: "pts",  label: "PTS"  },
        ];
        cats.forEach(cat => {
            const item = document.createElement("div");
            item.className = "scoring-item";

            const lbl = document.createElement("label");
            lbl.textContent = cat.label;
            lbl.setAttribute("for", `score-${cat.key}`);

            const inp = document.createElement("input");
            inp.type = "number";
            inp.id = `score-${cat.key}`;
            inp.value = DEFAULT_SCORING[cat.key];
            inp.step = "0.5";
            inp.addEventListener("input", () => {
                scoring[cat.key] = parseFloat(inp.value) || 0;
                recalcAndRender();
            });

            item.appendChild(lbl);
            item.appendChild(inp);
            grid.appendChild(item);
        });
    }

    // ── Stats checkboxes ────────────────────────────────────────
    function buildStatsCheckboxes() {
        const container = document.getElementById("stats-checkboxes");
        COLUMNS.forEach(col => {
            const lbl = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = true;
            cb.dataset.col = col.key;
            cb.addEventListener("change", () => {
                if (cb.checked) visibleCols.add(col.key);
                else visibleCols.delete(col.key);
                renderTable();
            });
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(" " + col.label));
            container.appendChild(lbl);
        });
    }

    // ── Collapsible panels ──────────────────────────────────────
    function setupCollapsibles() {
        document.querySelectorAll(".panel-toggle").forEach(btn => {
            btn.addEventListener("click", () => {
                const body = btn.nextElementSibling;
                const arrow = btn.querySelector(".panel-arrow");
                body.classList.toggle("collapsed");
                arrow.textContent = body.classList.contains("collapsed") ? "\u25BC" : "\u25B2";
            });
        });
    }

    // ── Load season data ────────────────────────────────────────
    async function loadSeason(season) {
        loadingEl.style.display = "flex";
        tableContainer.style.display = "none";

        try {
            const resp = await fetch(`data/player-stats/${season}.json`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            rawPlayers = await resp.json();
            deriveFields();
            recalcFantasy();
            sortPlayers();
            renderTable();
            playerCountEl.textContent = `Showing top ${Math.min(300, rawPlayers.length)} of ${rawPlayers.length} players`;
        } catch (err) {
            tableBody.innerHTML = "";
            playerCountEl.textContent = `Error loading ${season}: ${err.message}`;
        }

        loadingEl.style.display = "none";
        tableContainer.style.display = "block";
    }

    // ── Derive missing fields ───────────────────────────────────
    function deriveFields() {
        rawPlayers.forEach(p => {
            p._FGMI = (p.FGA || 0) - (p.FGM || 0);
            p._FTMI = (p.FTA || 0) - (p.FTM || 0);
            p._2PM  = (p.FGM || 0) - (p.FG3M || 0);
        });
    }

    // ── Recalculate fantasy totals ──────────────────────────────
    function recalcFantasy() {
        rawPlayers.forEach(p => {
            p._TOTAL_FANTASY =
                (p.FGM  || 0) * scoring.fgm +
                (p._FGMI     ) * scoring.fgmi +
                (p.FTM  || 0) * scoring.ftm +
                (p._FTMI     ) * scoring.ftmi +
                (p.REB  || 0) * scoring.reb +
                (p.AST  || 0) * scoring.ast +
                (p.STL  || 0) * scoring.stl +
                (p.BLK  || 0) * scoring.blk +
                (p.TOV  || 0) * scoring.tov +
                (p.PTS  || 0) * scoring.pts;

            p._FANTASY_PPG = p.GP > 0 ? p._TOTAL_FANTASY / p.GP : 0;
        });
    }

    // ── Sort players ────────────────────────────────────────────
    function sortPlayers() {
        const col = COLUMNS.find(c => c.key === sortKey);
        if (!col) return;

        rawPlayers.sort((a, b) => {
            let va = col.get(a, 0);
            let vb = col.get(b, 0);
            // String comparison for text columns
            if (typeof va === "string" && typeof vb === "string") {
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            // Numeric
            va = va || 0;
            vb = vb || 0;
            return sortAsc ? va - vb : vb - va;
        });
    }

    // ── Recalc + sort + render (called on scoring change) ───────
    function recalcAndRender() {
        recalcFantasy();
        sortPlayers();
        renderTable();
    }

    // ── Render table ────────────────────────────────────────────
    function renderTable() {
        const activeCols = COLUMNS.filter(c => visibleCols.has(c.key));

        // Header
        tableHead.innerHTML = "";
        const tr = document.createElement("tr");
        activeCols.forEach(col => {
            const th = document.createElement("th");
            th.className = `col-${col.cls}` + (col.fantasy ? " col-fantasy" : "");
            if (col.key === sortKey) th.classList.add("sorted");
            th.innerHTML = col.label + ` <span class="sort-arrow">${sortKey === col.key ? (sortAsc ? "▲" : "▼") : ""}</span>`;
            th.addEventListener("click", () => {
                if (sortKey === col.key) sortAsc = !sortAsc;
                else { sortKey = col.key; sortAsc = false; }
                sortPlayers();
                renderTable();
            });
            tr.appendChild(th);
        });
        tableHead.appendChild(tr);

        // Body — top 300
        tableBody.innerHTML = "";
        const top300 = rawPlayers.slice(0, 300);
        top300.forEach((player, idx) => {
            const row = document.createElement("tr");
            activeCols.forEach(col => {
                const td = document.createElement("td");
                td.className = `col-${col.cls}` + (col.fantasy ? " col-fantasy" : "");
                const raw = col.get(player, idx);
                td.textContent = col.fmt(raw);
                row.appendChild(td);
            });
            tableBody.appendChild(row);
        });
    }

})();
