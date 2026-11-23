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
    const weights = entries.map(({ row }) => metric(row.totalWeight ?? row.totalWeightKg));
    const comparable = entries.flatMap((entry, index) =>
      entry.average > 0 && weights[index] !== null
        ? [Math.min(2, weights[index] / entry.average - 1)] : []
    );
    const known = values => values.filter(value => value !== null);
    const places = known(entries.map(entry => entry.zonePlace ?? null)).filter(place => place > 0);
    const bigFish = known(entries.map(({ row }) => metric(row.bigFish ?? row.bigFishKg)));
    const prizes = places.filter(place => place <= 3).length;
    return {
      count,
      rating: comparable.length >= 2 ? average(comparable) * comparable.length / (comparable.length + 2) : null,
      weight: average(known(weights)),
      fish: average(known(entries.map(({ row }) => metric(row.totalCount ?? row.fishCount)))),
      podium: places.length ? prizes / places.length : null,
      prizes,
      knownPlaces: places.length,
      bigFish: bigFish.some(weight => weight > 0) ? Math.max(...bigFish) : null
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

  function zonePlaces(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (!row) continue;
      const zone = drawKey(row)[0];
      if (!zone) continue;
      if (!groups.has(zone)) groups.set(zone, []);
      groups.get(zone).push(row);
    }

    const places = new Map();
    const value = (row, primary, alternate) => metric(row[primary] ?? row[alternate]) ?? 0;
    const name = row => clean(row.team || row.teamName || row.participantName);
    for (const group of groups.values()) {
      group.sort((a, b) =>
        value(b, "totalWeight", "totalWeightKg") - value(a, "totalWeight", "totalWeightKg") ||
        value(b, "bigFish", "bigFishKg") - value(a, "bigFish", "bigFishKg") ||
        value(b, "totalCount", "fishCount") - value(a, "totalCount", "fishCount") ||
        name(a).localeCompare(name(b), "uk")
      );
      group.forEach((row, index) => {
        const saved = metric(row.zonePlace);
        places.set(row, Number.isInteger(saved) && saved > 0 && saved <= group.length ? saved : index + 1);
      });
    }
    return places;
  }

  function resultCells(table, values) {
    const headings = table.tHead.rows[0].cells;
    return values.map((value, index) => {
      const cell = element("td", value);
      cell.dataset.label = headings[index].textContent.trim();
      return cell;
    });
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const fishTypes = { carp: "Короп", amur: "Амур", sturgeon: "Осетер" };
  const calendar = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const clock = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  function asDate(value) {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function stageTitle(item) {
    const { data, id } = item;
    const title = clean(item.title || data.stageName || data.title);
    if (item.isFinal || data.isFinal || /(?:^|__)final$/i.test(id)) return "Фінал";
    const technical = /^(?:.*__)?stage[-_\s]*(\d+)$/i;
    const stage = title.match(technical) || clean(data.stageId).match(technical) || id.match(technical);
    return title && !technical.test(title) ? title : stage ? `Етап ${Number(stage[1])}` : "Змагання";
  }

  function individualFish(row) {
    const fish = [];
    for (let index = 1; index <= 6; index++) {
      const slot = row["w" + index];
      const source = [slot?.fish, slot?.weights, slot?.fishKg].find(items => Array.isArray(items) && items.length) || [];
      for (const item of source) {
        const kg = metric(typeof item === "object" ? item?.kg : item);
        if (!kg) continue;
        const type = item?.fishType || item?.type || (item?.isAmur === true ? "amur" : "");
        fish.push({ kg, type: Object.hasOwn(fishTypes, type) ? type : "",
          caughtAt: asDate(item?.caughtAt), slot: "W" + index });
      }
    }
    return fish;
  }

  // Оцінки за фізичними секторами першого етапу: [амур, осетер].
  const firstStageSpecies = {
    2: [4, 3], 3: [2, 2], 4: [2, 0], 5: [4, 0], 6: [2, 1],
    7: [5, 3], 8: [5, 2], 10: [2, 0], 11: [1, 1], 12: [2, 0],
    13: [3, 0], 14: [10, 0], 18: [2, 0], 19: [7, 1], 20: [2, 0],
    21: [4, 0], 22: [2, 0], 23: [1, 0], 24: [3, 1], 25: [3, 4],
    26: [2, 3]
  };

  // Умовний розподіл відомої кількості осетрів за фізичними секторами.
  const modeledSturgeon = {
    "season:2026:season-2026__stage-2": { 2: 1, 7: 1, 13: 1, 21: 2, 23: 1, 25: 2, 26: 1 },
    "season:2026:season-2026__stage-3": { 2: 2, 5: 1, 11: 1, 18: 1, 21: 1, 22: 2, 24: 1, 25: 2 },
    "season:2026:season-2026__final": { 3: 1, 19: 1, 21: 1, 22: 2, 26: 1 }
  };

  function sectorSummary(entries) {
    const weights = [];
    const places = [];
    const counts = { carp: 0, amur: 0, sturgeon: 0 };
    let unknown = 0;
    let estimatedSpecies = false;
    let modeledSpecies = false;
    let weighedFish = 0;
    let fishWeight = 0;
    for (const { row, fish, zonePlace, tournament, number } of entries) {
      const weight = metric(row.totalWeight ?? row.totalWeightKg);
      if (weight !== null) weights.push(weight);
      if (zonePlace > 0) places.push(zonePlace);

      let identified = 0;
      let unverifiedCarp = 0;
      let hasRecordedSturgeon = false;
      for (const type of Object.keys(counts)) {
        const recorded = metric(row[type + "Count"]);
        const individualCount = fish.filter(item => item.type === type).length;
        const count = Math.max(recorded ?? 0, individualCount);
        if (type === "carp") unverifiedCarp = count - individualCount;
        if (type === "sturgeon") hasRecordedSturgeon = count > 0;
        counts[type] += count;
        identified += count;
      }
      const recordedTotal = metric(row.totalCount ?? row.fishCount);
      if (Number.isInteger(recordedTotal) && recordedTotal > 0 && weight > 0) {
        weighedFish += recordedTotal;
        fishWeight += weight;
      }
      const total = recordedTotal ?? fish.length;
      const estimate = tournament === "season:2026:season-2026__stage-1" && firstStageSpecies[number];
      if (estimate && identified === 0 && Number.isInteger(total) && total >= estimate[0] + estimate[1]) {
        const [amur, sturgeon] = estimate;
        counts.amur += amur;
        counts.sturgeon += sturgeon;
        counts.carp += total - amur - sturgeon;
        estimatedSpecies = true;
      } else {
        const provisional = modeledSturgeon[tournament]?.[number] ?? 0;
        if (provisional > 0 && !hasRecordedSturgeon && unverifiedCarp >= provisional) {
          counts.carp -= provisional;
          counts.sturgeon += provisional;
          modeledSpecies = true;
        }
        unknown += Math.max(0, total - identified);
      }
    }
    const place = average(places);
    return { weights, counts, unknown, estimatedSpecies, modeledSpecies, averageFishWeight: weighedFish ? fishWeight / weighedFish : null,
      place: place === null ? null : Math.trunc(place * 100) / 100 };
  }

  function create({ root, db, year }) {
    const buttons = new Map();
    const stageSectors = new Map();
    const history = [];
    let seasonStages;
    const stageLoads = new Map();
    const competitionLoads = new Map();

    async function tournamentDate(data) {
      const start = record => asDate(record?.startAt ?? record?.startDate ?? record?.schedule?.startAt);
      const direct = start(data);
      if (direct || !data.compId || !data.stageId) return direct;
      if (!competitionLoads.has(data.compId)) {
        competitionLoads.set(data.compId, db.collection("competitions").doc(data.compId)
          .get().then(snapshot => snapshot.data()).catch(() => null));
      }
      const competition = await competitionLoads.get(data.compId);
      const events = Array.isArray(competition?.events) ? competition.events : [];
      const event = events.find((item, index) =>
        (item.key || item.stageId || item.id || `stage-${index + 1}`) === data.stageId);
      return start(event) || (events.length <= 1 ? start(competition) : null);
    }
    let selected = sectorNumber(new URLSearchParams(location.search).get("sector")) || 1;
    let pending = false;
    let started = false;
    let limited = Boolean(db.limited);
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
    const mobileSort = root.querySelector("[data-sector-sort]");
    for (const button of sortButtons) {
      const option = element("option", button.querySelector("span").textContent.trim());
      option.value = button.dataset.sort;
      mobileSort.append(option);
    }
    mobileSort.value = sort;
    mobileSort.addEventListener("change", () => {
      sort = mobileSort.value;
      ascending = sort === "number";
      renderRanking();
    });

    for (const button of sortButtons) {
      button.addEventListener("click", () => {
        const next = button.dataset.sort;
        ascending = next === sort ? !ascending : next === "number";
        sort = next;
        mobileSort.value = next;
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
      const bestWeight = Math.max(0, ...stats.map(stat => stat.weight ?? 0));
      const bestFish = Math.max(0, ...stats.map(stat => stat.bigFish ?? 0));
      ranking.hidden = !sorted.length;
      ranking.querySelector("tbody").replaceChildren(...sorted.map(stat => {
        const tr = element("tr");
        const sectorCell = element("th");
        sectorCell.scope = "row";
        const button = element("button", stat.number);
        button.type = "button";
        button.setAttribute("aria-label", "Сектор " + stat.number);
        button.addEventListener("click", () => {
          select(stat.number);
          heading.focus();
          heading.scrollIntoView({ block: "nearest" });
        });
        sectorCell.append(button);
        const rankCell = element("td", stat.rank || "—");
        if (stat.rank && stat.rank <= 3) rankCell.dataset.podiumRank = stat.rank;
        tr.append(rankCell, sectorCell);
        const values = [
          formatMetric(stat.rating, percent),
          formatMetric(stat.weight), formatMetric(stat.fish),
          stat.knownPlaces ? `${stat.prizes} / ${stat.knownPlaces}` : "—",
          formatMetric(stat.bigFish), stat.count
        ];
        const highlights = [
          stat.rank === 1 ? "Лідер рейтингу" : "",
          bestWeight > 0 && stat.weight === bestWeight ? "Найвищий середній улов" : "",
          "", "",
          bestFish > 0 && stat.bigFish === bestFish ? "Найбільша риба" : ""
        ];
        values.forEach((value, index) => {
          const cell = element("td", value);
          if (highlights[index]) {
            cell.className = "sector-record";
            cell.title = highlights[index];
            cell.setAttribute("aria-label", `${highlights[index]}: ${value}`);
          }
          tr.append(cell);
        });
        return tr;
      }));
    }

    function updateRanking() {
      const entries = scopedHistory();
      const tournaments = new Set(entries.map(entry => entry.tournament));
      stats = POINTS.map(([number]) => ({
        number, ...summarize(entries.filter(entry => entry.number === number))
      })).filter(stat => stat.count > 0);
      coverage.textContent = stats.length
        ? `Змагань: ${tournaments.size} · Секторів: ${stats.length}`
        : `Немає результатів ${period()}.`;
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

    function renderCatchDetails(entries) {
      const records = entries.map(entry => ({ ...entry, fish: individualFish(entry.row) }));
      const { weights, counts, unknown, estimatedSpecies, modeledSpecies, averageFishWeight, place } = sectorSummary(records);
      const summary = root.querySelector("[data-catch-summary]");
      const fishCounts = root.querySelector("[data-species-counts]");
      const metricCell = (label, value) => {
        const cell = element("div");
        cell.append(element("dt", label), element("dd", value));
        return cell;
      };
      summary.replaceChildren(
        metricCell("Середній улов, кг", formatMetric(average(weights))),
        metricCell("Найбільший улов, кг", formatMetric(weights.length ? Math.max(...weights) : null)),
        metricCell("Середня вага риби, кг", formatMetric(averageFishWeight)),
        metricCell("Середнє місце в зоні", formatMetric(place))
      );
      root.querySelector("[data-species-estimate]").hidden = !estimatedSpecies;
      root.querySelector("[data-species-modeled]").hidden = !modeledSpecies;
      fishCounts.replaceChildren(
        ...Object.entries(fishTypes)
          .filter(([type]) => type !== "sturgeon" || counts[type] > 0)
          .map(([type, name]) => metricCell(name, `${counts[type]} шт`)),
        ...(unknown ? [metricCell("Вид невідомий", `${unknown} шт`)] : [])
      );

      const target = root.querySelector('[data-catch-table="fish"]');
      const fishTable = target.querySelector("table");
      const rows = records.flatMap(entry => entry.fish.map(fish => {
        const tr = element("tr");
        tr.append(...resultCells(fishTable, [
          entry.title, fishTypes[fish.type] || "Вид невідомий", formatMetric(fish.kg), fish.slot,
          fish.caughtAt ? `${calendar.format(fish.caughtAt)} ${clock.format(fish.caughtAt)}` : "—"
        ]));
        return tr;
      }));
      target.hidden = !rows.length;
      fishTable.tBodies[0].replaceChildren(...rows);
      root.querySelector("[data-catch-details]").hidden = !records.length;
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
        tr.append(...resultCells(table, [
          entry.year,
          entry.title,
          entry.date ? calendar.format(entry.date) : "—",
          entry.key || "—",
          row.teamName || row.team || row.participantName || "—",
          formatMetric(metric(row.totalWeight ?? row.totalWeightKg)),
          formatMetric(metric(row.totalCount ?? row.fishCount)),
          formatMetric(metric(row.bigFish ?? row.bigFishKg)),
          entry.zonePlace ? `${entry.zonePlace} · зона ${entry.key[0]}` : "—"
        ]));
        return tr;
      });
      results.replaceChildren(...fragments);
      table.hidden = !entries.length;
      renderCatchDetails(entries);
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
      const places = zonePlaces(rows.filter(row => !wasAbsent(row) &&
        !empty.has(sectorNumber(row?.lakeSectorNumber) || mapping.get(row && drawKey(row)))));
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
          number, row, key, title: stageTitle(item),
          tournament: `season:${year}:${item.id}`, year, average: fieldAverage,
          zonePlace: places.get(row)
        });
      }

      const date = byPhysicalSector.size ? await tournamentDate(item.data) : null;
      const numbers = new Map();
      const entries = [];
      for (const entry of byPhysicalSector.values()) {
        if (!entry) continue;
        numbers.set(entry.row, entry.number);
        entries.push({ ...entry, date });
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
            title: data.title || "Історичне змагання",
            date: asDate(data.startDate),
            zonePlace: metric(row.zonePlace) || null
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
          ...["seasonArchives", "seasonRating", "historicalSectorResults"]
            .map(name => db.collection(name).get())
        ]);
        for (const source of sources) {
          if (source.status !== "fulfilled") continue;
          source.value.forEach(doc => {
            const candidate = doc.id;
            if (validYear(candidate)) years.add(candidate);
          });
        }

        const data = await Promise.allSettled([...years].flatMap(year => [
          db.collection(`seasonResults/${year}/stages`).get().then(snapshot =>
            Promise.all(snapshot.docs.map(doc => {
              const data = doc.data();
              return loadStage({
                id: doc.id, data
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
