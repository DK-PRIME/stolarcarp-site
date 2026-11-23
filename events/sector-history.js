(() => {
  "use strict";

  const lake = "lelehivka";
  // Розстановка Фіналу 2026 підтверджена картою і протоколом.
  // Команда C5 не з’явилася, фізичний сектор №25 пустував.
  const final2026Sectors = new Map([
    ["A1", 3], ["A2", 4], ["A3", 5], ["A4", 6], ["A5", 7], ["A6", 8],
    ["B1", 10], ["B2", 11], ["B3", 12], ["B4", 13], ["B5", 14], ["B6", 19],
    ["C1", 21], ["C2", 22], ["C3", 23], ["C4", 24], ["C5", 25], ["C6", 26]
  ]);
  const POINTS = [
    [1, 84.54, 13.14], [2, 80.24, 13.58],
    [3, 74.78, 14.03], [4, 70.30, 14.32],
    [5, 65.73, 14.32], [6, 60.98, 14.62],
    [7, 56.32, 14.32], [8, 51.30, 14.77],
    [9, 47.00, 14.62], [10, 42.79, 14.47],
    [11, 38.49, 15.07], [12, 34.54, 15.07],
    [13, 30.06, 14.77], [14, 25.49, 14.32],
    [15, 20.83, 13.88], [16, 16.80, 13.58],
    [17, 16.80, 66.03], [18, 21.19, 71.16],
    [19, 25.40, 77.40], [20, 29.17, 81.78],
    [21, 36.00, 81.70], [22, 63.22, 81.85],
    [23, 67.79, 82.00], [24, 72.36, 81.85],
    [25, 76.93, 82.00], [26, 81.50, 81.85]
  ];

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(key => [key, canonical(value[key])])
      );
    }

    return value ?? null;
  }

  async function fingerprint(value) {
    if (!window.crypto?.subtle) {
      throw new Error(
        "Для перевірки архіву потрібне HTTPS-з'єднання."
      );
    }

    const bytes = new TextEncoder().encode(
      JSON.stringify(canonical(value))
    );

    const hash = await window.crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return Array.from(
      new Uint8Array(hash),
      byte => byte.toString(16).padStart(2, "0")
    ).join("");
  }

  const clean = value => String(value ?? "").trim();
  const sectorNumber = value => {
    const number = Number(clean(value));
    return Number.isInteger(number) && number >= 1 && number <= POINTS.length
      ? number : null;
  };
  const weightFormat = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 });

  function formatMetric(value, formatter = weightFormat) {
    return value == null ? "—" : formatter.format(value);
  }

  function metric(value) {
    if (typeof value === "boolean" || !clean(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function tournamentAverage(rows) {
    const weights = rows.map(row => metric(row?.totalWeight ?? row?.totalWeightKg));
    return weights.includes(null) ? null : average(weights);
  }

  function summarize(entries) {
    const count = entries.length;
    const data = { count, rating: null, weight: null, fish: null, podium: null, bigFish: null };
    if (count < 3) return data;

    const weights = entries.map(({ row }) => metric(row.totalWeight ?? row.totalWeightKg));
    const comparable = entries.flatMap((entry, index) =>
      entry.average > 0 && weights[index] !== null
        ? [Math.min(2, weights[index] / entry.average - 1)] : []
    );
    const known = values => values.filter(value => value !== null);
    const places = known(entries.map(entry => metric(entry.row.zonePlace))).filter(place => place > 0);
    const bigFish = known(entries.map(({ row }) => metric(row.bigFish ?? row.bigFishKg)));
    const prizes = places.filter(place => place <= 3).length;
    return {
      count,
      rating: comparable.length >= 3 ? average(comparable) * comparable.length / (comparable.length + 2) : null,
      weight: average(known(weights)),
      fish: average(known(entries.map(({ row }) => metric(row.totalCount ?? row.fishCount)))),
      podium: places.length ? prizes / places.length : null,
      prizes,
      knownPlaces: places.length,
      bigFish: bigFish.length ? Math.max(...bigFish) : null
    };
  }

  function drawKey(row) {
    const latin = value => clean(value).toUpperCase()
      .replace(/[АВС]/g, letter => ({ А: "A", В: "B", С: "C" })[letter]);
    const zone = latin(row.drawZone || row.zone);
    const value = latin(row.drawKey || row.drawSector || row.sector).replace(/[\s_-]/g, "");
    const match = /^([ABC]?)(\d+)$/.exec(value);
    if (!match || (zone && match[1] && zone !== match[1])) return "";
    const prefix = match[1] || zone;
    const number = Number(match[2]);
    return /^[ABC]$/.test(prefix) && number > 0 ? prefix + number : "";
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function create({ root, db, year }) {
    const buttons = new Map();
    const stageSectors = new Map();
    const history = [];
    let seasonStages;
    const stageLoads = new Map();
    let selected = sectorNumber(new URLSearchParams(location.search).get("sector")) || 1;
    let pending = false;
    let started = false;
    let limited = false;
    let selectedYear = year;
    let discovering = false;
    const yearSelect = root.querySelector("#sectorHistoryYear");
    const scopedHistory = () => history.filter(entry => !selectedYear || entry.year === selectedYear);
    const period = () => selectedYear ? `за ${selectedYear} рік` : "за всі роки";

    const map = root.querySelector(".sector-map");
    const heading = root.querySelector("[data-sector-heading]");
    const status = root.querySelector("[data-sector-status]");
    const table = root.querySelector("[data-sector-results]");
    const results = table.querySelector("tbody");
    const ranking = root.querySelector("[data-sector-ranking]");
    const coverage = root.querySelector("[data-sector-coverage]");
    const sortButtons = [...ranking.querySelectorAll("[data-sort]")];
    const percent = new Intl.NumberFormat("uk-UA", {
      style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero"
    });
    let sort = "rating";
    let ascending = false;
    let stats = [];

    for (const button of sortButtons) {
      button.addEventListener("click", () => {
        const next = button.dataset.sort;
        ascending = next === sort ? !ascending : next === "number";
        sort = next;
        renderRanking();
      });
    }

    function renderRanking() {
      for (const button of sortButtons) {
        const header = button.closest("th");
        if (button.dataset.sort === sort) {
          header.setAttribute("aria-sort", ascending ? "ascending" : "descending");
        } else {
          header.removeAttribute("aria-sort");
        }
      }

      const sorted = [...stats].sort((a, b) => {
        if (a[sort] == null) return b[sort] == null ? a.number - b.number : 1;
        if (b[sort] == null) return -1;
        return (ascending ? a[sort] - b[sort] : b[sort] - a[sort]) || a.number - b.number;
      });
      ranking.querySelector("tbody").replaceChildren(...sorted.map(stat => {
        const tr = element("tr");
        const sectorCell = element("th");
        sectorCell.scope = "row";
        const button = element("button", "№" + stat.number);
        button.type = "button";
        button.addEventListener("click", () => {
          select(stat.number);
          heading.focus();
          heading.scrollIntoView({ block: "nearest" });
        });
        sectorCell.append(button);
        tr.append(element("td", stat.rank || "—"), sectorCell);
        for (const value of [
          stat.count < 3 ? "Недостатньо даних" : formatMetric(stat.rating, percent),
          formatMetric(stat.weight), formatMetric(stat.fish),
          stat.knownPlaces ? `${stat.prizes} / ${stat.knownPlaces}` : "—",
          formatMetric(stat.bigFish), stat.count
        ]) tr.append(element("td", value));
        return tr;
      }));
    }

    function updateRanking() {
      const entries = scopedHistory();
      const tournaments = new Set(entries.map(entry => entry.tournament));
      coverage.textContent = `Турнірів із прив’язаними результатами ${period()}: ${tournaments.size}.`;
      stats = POINTS.map(([number]) => ({
        number, ...summarize(entries.filter(entry => entry.number === number))
      }));
      const ranked = stats.filter(stat => stat.rating !== null)
        .sort((a, b) => b.rating - a.rating || a.number - b.number);
      ranked.forEach((stat, index) => {
        stat.rank = stat.rating === ranked[index - 1]?.rating ? ranked[index - 1].rank : index + 1;
      });
      renderRanking();
    }

    for (const [number, x, y] of POINTS) {
      const button = element("button", number);
      button.type = "button";
      button.style.left = x + "%";
      button.style.top = y + "%";
      button.setAttribute("aria-label", "Сектор №" + number);
      button.addEventListener("click", () => select(number));
      buttons.set(number, button);
      map.append(button);
    }

    function render() {
      const scoped = scopedHistory();
      const entries = scoped.filter(row => row.number === selected)
        .sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title, "uk"));
      heading.textContent = "Сектор №" + selected;
      for (const [number, button] of buttons) {
        button.setAttribute("aria-pressed", String(number === selected));
        button.classList.toggle("has-results", scoped.some(row => row.number === number));
      }

      const fragments = entries.map(entry => {
        const tr = element("tr");
        const row = entry.row;
        for (const value of [
          entry.year,
          entry.title,
          entry.key || "—",
          row.teamName || row.team || row.participantName || "—",
          formatMetric(metric(row.totalWeight ?? row.totalWeightKg)),
          formatMetric(metric(row.totalCount ?? row.fishCount)),
          formatMetric(metric(row.bigFish ?? row.bigFishKg)),
          entry.place || "—"
        ]) tr.append(element("td", value));
        return tr;
      });
      results.replaceChildren(...fragments);
      table.hidden = !entries.length;
      const count = entries.length ? `Протоколів ${period()}: ${entries.length}.` :
        `Для цього сектора ${period()} результатів немає.`;
      status.textContent = pending ? "Завантажую результати секторів…" :
        count + (limited ? " Частина джерел архіву зараз недоступна." : "");
    }

    async function loadStage(item, year) {
      const rows = item.data.standings;
      const stageLake = clean(item.data.lakeId);
      if (!Array.isArray(rows) || (stageLake && stageLake !== lake)) return;

      const mapping = new Map();
      const empty = new Set();
      if (rows.some(row => row && (!sectorNumber(row.lakeSectorNumber) ||
          !(row.lakeId || stageLake)))) {
        const mapPath = `sectorMaps/${year}/stages/${item.id}`;
        try {
          const snapshot = await db.doc(mapPath).get();
          const data = snapshot.data();
          if (data?.lakeId === lake && data.status === "ready" &&
              data.sourcePath === `seasonResults/${year}/stages/${item.id}` &&
              Array.isArray(data.assignments) &&
              data.sourceSignature === await fingerprint(rows)) {
            for (const number of data.emptyLakeSectors || []) empty.add(sectorNumber(number));
            for (const assignment of data.assignments) {
              if (!assignment) continue;
              const key = drawKey(assignment);
              const number = sectorNumber(assignment.lakeSectorNumber);
              if (key && number) mapping.set(key, number);
            }
          }
        } catch (error) {
          limited = true;
          console.warn("[Sector history] Map:", error);
        }
      }

      const isFinal2026 = year === "2026" && item.id === "season-2026__final";
      if (isFinal2026) {
        for (const [key, number] of final2026Sectors) {
          if (!mapping.has(key)) mapping.set(key, number);
        }
      }
      const wasAbsent = row => isFinal2026 && row && drawKey(row) === "C5";
      const fieldAverage = tournamentAverage(rows.filter(row =>
        !wasAbsent(row) &&
        !empty.has(sectorNumber(row?.lakeSectorNumber) || mapping.get(row && drawKey(row)))
      ));
      const byPhysicalSector = new Map();
      for (const row of rows) {
        if (!row || wasAbsent(row) || (row.lakeId && row.lakeId !== lake)) continue;
        const key = drawKey(row);
        const number = ((row.lakeId || stageLake) === lake && sectorNumber(row.lakeSectorNumber))
          || mapping.get(key);
        if (!number || empty.has(number)) continue;
        if (byPhysicalSector.has(number)) {
          byPhysicalSector.set(number, null);
          continue;
        }
        byPhysicalSector.set(number, {
          number, row, key, title: item.title,
          tournament: `season:${year}:${item.id}`, year, average: fieldAverage,
          place: item.isFinal && row.overallPlace
            ? `${row.overallPlace} загальне`
            : row.zonePlace ? `${row.zonePlace} у зоні` : row.place
        });
      }

      const numbers = new Map();
      const entries = [];
      for (const entry of byPhysicalSector.values()) {
        if (!entry) continue;
        numbers.set(entry.row, entry.number);
        entries.push(entry);
      }
      stageSectors.set(item.id, numbers);
      return entries;
    }

    async function loadHistorical(year) {
      const snap = await db.collection(`historicalSectorResults/${year}/tournaments`)
        .where("status", "==", "ready").get();
      return snap.docs.flatMap(doc => {
        const data = doc.data();
        if (data.lakeId !== lake || !Array.isArray(data.results)) return [];
        const fieldAverage = tournamentAverage(data.results);
        return data.results.flatMap(row => {
          const number = sectorNumber(row?.lakeSectorNumber);
          return number ? [{
            number, row, key: drawKey(row),
            tournament: `history:${year}:${doc.id}`, year, average: fieldAverage,
            title: data.title || "Історичний турнір",
            place: row.place
          }] : [];
        });
      });
    }

    function getStage(item) {
      if (!stageLoads.has(item.id)) stageLoads.set(item.id, loadStage(item, year));
      return stageLoads.get(item.id);
    }

    let historyLoad;
    function load() {
      if (started || discovering) return historyLoad;
      started = true;
      pending = true;
      coverage.textContent = "Завантажую статистику…";
      render();
      historyLoad = Promise.allSettled([
        ...seasonStages.map(getStage),
        loadHistorical(year)
      ]).then(sources => {
        for (const source of sources) {
          if (source.status === "fulfilled") history.push(...(source.value || []));
          else {
            limited = true;
            console.warn("[Sector history] Results:", source.reason);
          }
        }
        pending = false;
        updateRanking();
        render();
      });
      return historyLoad;
    }

    function select(number) {
      selected = number;
      render();
    }

    if (location.hash === "#sector-history") root.open = true;

    root.addEventListener("toggle", () => {
      if (root.open && seasonStages) load();
    });

    return {
      async loadAllYears(initialYear) {
        discovering = true;
        root.open = true;
        coverage.textContent = "Завантажую статистику…";

        const years = new Set(["2026"]);
        if (initialYear) years.add(initialYear);
        const validYear = value => /^(19|20)\d{2}$/.test(value);
        const sources = await Promise.allSettled([
          ...["seasonArchives", "seasonRating", "seasonResults", "historicalSectorResults"]
            .map(name => db.collection(name).get()),
          db.collectionGroup("tournaments").where("lakeId", "==", lake)
            .where("status", "==", "ready").get()
        ]);
        for (const [index, source] of sources.entries()) {
          if (source.status !== "fulfilled") continue;
          source.value.forEach(doc => {
            const candidate = index === 4
              ? (doc.ref.parent.parent?.parent.id === "historicalSectorResults" ? doc.ref.parent.parent.id : "")
              : doc.id;
            if (validYear(candidate)) years.add(candidate);
          });
        }

        const data = await Promise.allSettled([...years].flatMap(year => [
          db.collection(`seasonResults/${year}/stages`).get().then(snapshot =>
            Promise.all(snapshot.docs.map(doc => {
              const data = doc.data();
              return loadStage({
                id: doc.id, data, title: data.stageName || data.title || doc.id,
                isFinal: data.isFinal === true
              }, year);
            }))
          ).then(entries => entries.flatMap(rows => rows || [])),
          loadHistorical(year)
        ]));
        for (const source of data) {
          if (source.status === "fulfilled") history.push(...source.value);
          else limited = true;
        }

        const available = new Set(["2026", ...history.map(entry => entry.year)]);
        for (const option of [...yearSelect.options].slice(2)) option.remove();
        for (const entry of [...available].sort().reverse()) {
          if (entry === "2026") continue;
          const option = element("option", entry);
          option.value = entry;
          yearSelect.append(option);
        }
        const chooseYear = value => {
          selectedYear = available.has(value) ? value : "";
          yearSelect.value = selectedYear;
          updateRanking();
          render();
        };
        chooseYear(initialYear);
        yearSelect.disabled = false;
        yearSelect.addEventListener("change", () => {
          chooseYear(yearSelect.value);
          const url = new URL(location.href);
          if (selectedYear) url.searchParams.set("year", selectedYear);
          else url.searchParams.delete("year");
          window.history.replaceState(null, "", url);
        });
      },
      setStages(stages) {
        seasonStages = stages;
        if (root.open) load();
      },
      async getNumbers(id) {
        const item = seasonStages.find(stage => stage.id === id);
        if (item) await getStage(item);
        return stageSectors.get(id);
      },
      open(number) {
        select(number);
        root.open = true;
        load();
        root.scrollIntoView({ block: "start" });
        buttons.get(number)?.focus({ preventScroll: true });
      }
    };
  }

  window.scSectorHistory = { create, sectorNumber };
})();
