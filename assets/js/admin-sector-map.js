// assets/js/admin-sector-map.js
// STOLAR CARP • Карти секторів • v2.2 • 08.10.2026
// Компактний HTML v2.2: одна форма для кожного режиму.
// Записує тільки sectorMaps та historicalSectorResults.
// competitions і seasonResults читаються, LIVE та рейтинг не змінюються.

(function () {
  "use strict";

  const VERSION = "2.2";
  const OWNER_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const LAKE_ID = "lelehivka";
  const MAX_LAKE_SECTOR = 26;
  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;
  const REQUEST_TIMEOUT = 20000;

  const MODE = Object.freeze({
    PREPARE: "prepare",
    ARCHIVE: "archive",
    HISTORY: "history"
  });

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

  const VALID_SECTORS = new Set(POINTS.map(point => point[0]));
  const $ = id => document.getElementById(id);
  const txt = value => String(value ?? "").trim();

  const S = {
    db: null,
    auth: null,
    allowed: false,
    busy: false,
    started: false,

    dirty: false,
    metaDirty: false,
    resultDirty: false,
    newHistory: false,

    mode: MODE.PREPARE,
    year: "2026",
    stages: [],
    current: null,

    assignments: [],
    empty: [],
    historicalRows: {},

    revision: 0,
    sourceHash: "",
    selected: 1,
    zoom: 1,
    lastZone: "A"
  };

  // Helpers

  function esc(value) {
    return txt(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function num(value) {
    if (
      value == null ||
      typeof value === "boolean" ||
      txt(value) === ""
    ) {
      return null;
    }

    const result = Number(
      txt(value).replace(/\s/g, "").replace(",", ".")
    );

    return Number.isFinite(result) ? result : null;
  }

  function nonNegative(value) {
    const result = num(value);
    return result !== null && result >= 0 ? result : null;
  }

  function positiveInteger(value) {
    const result = num(value);
    return Number.isInteger(result) && result > 0 ? result : null;
  }

  function latin(value) {
    return txt(value)
      .toUpperCase()
      .replace(/А/g, "A")
      .replace(/В/g, "B")
      .replace(/С/g, "C");
  }

  function parseSlot(zoneValue, sectorValue) {
    let zone = latin(zoneValue);
    let raw = latin(sectorValue).replace(/[\s_-]+/g, "");

    const match = raw.match(/^([ABC])(\d+)$/);

    if (match) {
      if (zone && zone !== match[1]) return null;
      zone = match[1];
      raw = match[2];
    }

    if (!/^[ABC]$/.test(zone) || !/^\d+$/.test(raw)) {
      return null;
    }

    const sector = Number(raw);

    if (
      !Number.isInteger(sector) ||
      sector < 1 ||
      sector > 99
    ) {
      return null;
    }

    return {
      zone,
      sector,
      drawKey: `${zone}${sector}`
    };
  }

  function assignmentFor(sector, slot) {
    return {
      lakeSectorId: `sector-${sector}`,
      lakeSectorNumber: sector,
      zone: slot.zone,
      sector: slot.sector,
      drawKey: slot.drawKey
    };
  }

  function normalizeAssignment(value) {
    if (!value || typeof value !== "object") return null;

    const sector = positiveInteger(
      value.lakeSectorNumber ??
      value.physicalSector ??
      value.lakeSector
    );

    const slot = parseSlot(
      value.zone ?? value.drawZone,
      value.sector ?? value.drawSector ?? value.drawKey
    );

    return VALID_SECTORS.has(sector) && slot
      ? assignmentFor(sector, slot)
      : null;
  }

  function teamName(row) {
    return txt(
      row?.teamName ||
      row?.team ||
      row?.participantName ||
      row?.name
    ) || "—";
  }

  function weight(value) {
    const result = nonNegative(value);
    return result === null ? "—" : result.toFixed(3);
  }

  function rowTotalWeight(row) {
    return nonNegative(
      row?.totalWeight ??
      row?.totalWeightKg ??
      row?.totals?.totalWeightKg ??
      row?.totals?.totalWeight
    );
  }

  function rowTotalCount(row) {
    return nonNegative(
      row?.totalCount ??
      row?.fishCount ??
      row?.totals?.fishCount ??
      row?.totals?.totalCount
    );
  }

  function sortSlots(a, b) {
    const order = { A: 0, B: 1, C: 2 };

    return (
      (order[a.zone] ?? 99) - (order[b.zone] ?? 99) ||
      a.sector - b.sector
    );
  }

  function setText(id, value) {
    if ($(id)) $(id).textContent = value;
  }

  function setHidden(id, value) {
    if ($(id)) $(id).hidden = Boolean(value);
  }

  function setDisabled(id, value) {
    if ($(id)) $(id).disabled = Boolean(value);
  }

  function yearValue(value) {
    const year = txt(value);

    if (
      !/^\d{4}$/.test(year) ||
      Number(year) < 1990 ||
      Number(year) > 2100
    ) {
      throw new Error("Введи рік від 1990 до 2100.");
    }

    return year;
  }

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

  function serverTimestamp() {
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function message(value, kind = "") {
    setText("mapStatus", value);

    if ($("mapStatus")) {
      $("mapStatus").dataset.kind = kind;
    }
  }

  function errorMessage(error) {
    if (txt(error?.code).includes("permission-denied")) {
      return (
        "Firestore заборонив операцію. " +
        "Перевір доступ до потрібної колекції.\n" +
        `Код: ${error.code}`
      );
    }

    return error?.message || String(error);
  }

  function requireAccess() {
    if (
      !S.allowed ||
      S.auth?.currentUser?.uid !== OWNER_UID
    ) {
      throw new Error(
        "Доступ дозволено тільки власнику STOLAR CARP."
      );
    }
  }

  function timed(promise, label) {
    let timer;

    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(label)),
          REQUEST_TIMEOUT
        );
      })
    ]).finally(() => clearTimeout(timer));
  }

  function read(ref) {
    return timed(
      ref.get({ source: "server" }),
      "Перевищено час очікування відповіді Firestore."
    );
  }

  // Таймер не скасовує запис Firestore.
  // Редактор заблокований до завершення транзакції.
  async function waitWrite(promise) {
    const timer = setTimeout(() => {
      if (S.allowed) {
        message(
          "Збереження триває довше звичайного. " +
          "Дочекайся відповіді сервера…"
        );
      }
    }, REQUEST_TIMEOUT);

    try {
      return await promise;
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(task) {
    if (S.busy || !S.allowed) return;

    S.busy = true;
    controls();

    try {
      requireAccess();
      await task();
    } catch (error) {
      console.error(error);
      message(errorMessage(error), "error");
    } finally {
      S.busy = false;
      controls();
    }
  }

  function edit(task) {
    if (S.busy || !S.allowed || !S.current) return;

    try {
      requireAccess();
      task();
    } catch (error) {
      message(errorMessage(error), "error");
    }
  }

  function hasUnsaved() {
    return S.dirty || S.metaDirty || S.resultDirty;
  }

  function mayLeave() {
    return !hasUnsaved() || window.confirm(
      "Є незбережені зміни. Перейти без збереження?"
    );
  }

  function mayLeaveResult() {
    return !S.resultDirty || window.confirm(
      "Результат у формі ще не застосовано. " +
      "Відкинути введення для цього сектора?"
    );
  }

  function controls() {
    const locked = S.busy || !S.allowed;

    setDisabled("loadFields", locked);
    setDisabled("editFields", locked || !S.current);

    $("historicalSection")
      ?.querySelectorAll("input, select, button")
      .forEach(element => {
        element.disabled = locked;
      });

    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.disabled = locked;
      });

    setDisabled(
      "saveMap",
      locked || !S.current || !hasUnsaved()
    );

    setDisabled(
      "saveHistoricalMeta",
      locked || (!S.current && !S.newHistory)
    );

    setDisabled(
      "removeSlot",
      locked ||
      !S.current ||
      !S.assignments.some(
        item => item.lakeSectorNumber === S.selected
      )
    );

    setDisabled("zoomOut", locked || S.zoom <= MIN_ZOOM);
    setDisabled("zoomIn", locked || S.zoom >= MAX_ZOOM);

    const fished =
      $("historicalParticipation")?.value === "fished";

    [
      "historicalTeam",
      "historicalPlace",
      "historicalWeight",
      "historicalFishCount"
    ].forEach(id => {
      setDisabled(id, locked || !S.current || !fished);
    });

    setText(
      "saveState",
      hasUnsaved()
        ? "Є незбережені зміни"
        : S.revision
          ? "Збережено"
          : "Ще не збережено"
    );
  }

  // Firestore

  function mapRef(year, id) {
    return S.db
      .collection("sectorMaps")
      .doc(year)
      .collection("stages")
      .doc(id);
  }

  function archiveRef(year, id) {
    return S.db
      .collection("seasonResults")
      .doc(year)
      .collection("stages")
      .doc(id);
  }

  function historyCollection(year) {
    return S.db
      .collection("historicalSectorResults")
      .doc(year)
      .collection("tournaments");
  }

  // HTML

  function installInterface() {
    const required = [
      "mapApp", "mapStatus", "stageLoaderSection",
      "loadFields", "mapYear", "loadYear",
      "mapStage", "mapStageLabel", "mapEditor",
      "editFields", "selectedStageTitle",
      "currentMapModeBadge", "mapViewport",
      "mapCanvas", "mapPins", "mappingSection",
      "lakeImage", "lakeSector", "archiveSlot",
      "manualSlot", "manualZone", "manualNumber",
      "slotPreview", "assignSlot", "removeSlot",
      "emptySectors", "emptyDetails", "mapSummary",
      "mapCoverage", "saveMap", "saveState",
      "mappingRows", "mappingTableTitle",
      "zoomIn", "zoomOut", "zoomReset", "zoomValue",
      "historicalSection", "historicalYear",
      "loadHistorical", "historicalTournament",
      "newHistorical", "historicalMetaEditor",
      "historicalTitle", "historicalOrganizer",
      "historicalLake", "historicalStart",
      "historicalEnd", "saveHistoricalMeta",
      "historicalResultSection", "historicalSectorNumber",
      "historicalDrawKey", "historicalTeam",
      "historicalPlace", "historicalWeight",
      "historicalFishCount", "historicalParticipation",
      "saveHistoricalResult", "clearHistoricalResult",
      "historicalResultStatus", "historicalTableSection",
      "historicalResultsRows", "historicalTotals"
    ];

    for (const id of required) {
      if (
        document.querySelectorAll(`[id="${id}"]`).length !== 1
      ) {
        throw new Error(
          `HTML має містити рівно один елемент #${id}. ` +
          "Перевір також підключення старого JS."
        );
      }
    }

    if (
      document.querySelectorAll("[data-map-mode]").length !== 3
    ) {
      throw new Error(
        "HTML має містити три кнопки режимів."
      );
    }

    $("lakeSector").innerHTML = POINTS
      .map(([sector]) => `
        <option value="${sector}">
          Сектор озера №${sector}
        </option>
      `)
      .join("");
  }

  function updateModeUI() {
    const history = S.mode === MODE.HISTORY;
    const prepare = S.mode === MODE.PREPARE;

    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        const active = button.dataset.mapMode === S.mode;

        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });

    setHidden("stageLoaderSection", history);
    setHidden("historicalSection", !history);

    setHidden(
      "historicalMetaEditor",
      !history || (!S.current && !S.newHistory)
    );

    setHidden("mapEditor", !S.current);

    setHidden(
      "historicalResultSection",
      !history || !S.current
    );

    setHidden(
      "historicalTableSection",
      !history || !S.current
    );

    setText(
      "mapStageLabel",
      prepare ? "Етап для підготовки" : "Архівний етап"
    );

    setText(
      "saveMap",
      history
        ? "💾 Зберегти турнір"
        : prepare
          ? "💾 Зберегти розстановку"
          : "💾 Зберегти карту етапу"
    );

    setText(
      "saveHistoricalMeta",
      S.newHistory
        ? "💾 Створити турнір"
        : "💾 Зберегти турнір"
    );

    setText(
      "currentMapModeBadge",
      history
        ? "Історичні"
        : prepare
          ? "Підготовка"
          : "Архів"
    );

    $("currentMapModeBadge").className =
      "maps-badge " +
      (
        history
          ? "maps-badge--gold"
          : prepare
            ? "maps-badge--green"
            : "maps-badge--blue"
      );

    setHidden("mappingSection", history);

    $("archiveSlot").closest("label").hidden =
      S.mode !== MODE.ARCHIVE;

    setText(
      "mappingTableTitle",
      prepare
        ? "Підготовлена розстановка"
        : "Відповідність секторів"
    );

    const summary = $("emptyDetails").querySelector("summary");

    if (summary) {
      summary.textContent = prepare
        ? "Сектори, які не використовуємо"
        : "Неявки / Порожні сектори";
    }
  }

  function fillStageOptions(selectedId = "") {
    S.stages.sort((a, b) =>
      a.title.localeCompare(b.title, "uk", { numeric: true })
    );

    const options = S.stages.map(stage => `
      <option value="${esc(stage.id)}">
        ${esc(stage.title)}
      </option>
    `).join("");

    $("mapStage").innerHTML =
      '<option value="">Обери етап</option>' + options;

    $("historicalTournament").innerHTML =
      '<option value="">Обери турнір</option>' +
      (S.mode === MODE.HISTORY ? options : "");

    $(
      S.mode === MODE.HISTORY
        ? "historicalTournament"
        : "mapStage"
    ).value = selectedId;
  }

  function resetSelection() {
    S.current = null;
    S.assignments = [];
    S.empty = [];
    S.historicalRows = {};

    S.revision = 0;
    S.sourceHash = "";
    S.selected = 1;
    S.zoom = 1;
    S.lastZone = "A";

    S.dirty = false;
    S.metaDirty = false;
    S.resultDirty = false;
    S.newHistory = false;
  }

  // Джерела

  function readRows(rows) {
    const slots = new Map();
    const issues = [];

    if (!Array.isArray(rows)) {
      return {
        slots,
        issues: ["Архів не містить standings."]
      };
    }

    if (!rows.length) {
      issues.push("В архіві ще немає результатів.");
    }

    rows.forEach((row, index) => {
      const slot = parseSlot(
        row?.zone || row?.drawZone,
        row?.sector ?? row?.drawSector ?? row?.drawKey
      );

      if (!slot) {
        issues.push(
          `Некоректний сектор у рядку ${index + 1}.`
        );
      } else if (slots.has(slot.drawKey)) {
        issues.push(
          `Дублюється сектор ${slot.drawKey}.`
        );
      } else {
        slots.set(slot.drawKey, { ...slot, row });
      }
    });

    return { slots, issues };
  }

  function hasCatch(row) {
    if (!row) return false;

    if (
      [
        rowTotalWeight(row),
        rowTotalCount(row),
        row.bigFish,
        row.bigFishKg,
        row.carpCount,
        row.amurCount,
        row.sturgeonCount
      ].some(value => (nonNegative(value) || 0) > 0)
    ) {
      return true;
    }

    return Object.values(row.weighings || {}).some(value =>
      value &&
      [
        value.total,
        value.count,
        value.totalWeightKg,
        value.fishCount
      ].some(item => (nonNegative(item) || 0) > 0)
    );
  }

  function yearFromDate(value) {
    if (!value) return "";

    const date = typeof value.toDate === "function"
      ? value.toDate()
      : value;

    if (date instanceof Date) {
      return Number.isFinite(date.getTime())
        ? String(date.getFullYear())
        : "";
    }

    const match = txt(date).match(
      /(?:^|[^\d])(20\d{2}|2100)(?:[^\d]|$)/
    );

    return match ? match[1] : "";
  }

  function competitionYear(data, event) {
    const direct =
      num(event?.seasonYear) ??
      num(event?.year) ??
      num(data?.seasonYear) ??
      num(data?.year);

    if (
      Number.isInteger(direct) &&
      direct >= 2000 &&
      direct <= 2100
    ) {
      return String(direct);
    }

    for (const value of [
      event?.startDate,
      event?.startAt,
      event?.date,
      data?.startDate,
      data?.startAt,
      data?.date
    ]) {
      const year = yearFromDate(value);
      if (year) return year;
    }

    return "";
  }

  function competitionStages(doc) {
    const data = doc.data() || {};

    const events =
      Array.isArray(data.events) && data.events.length
        ? data.events
        : [{ key: "main", title: "Основний етап" }];

    return events.map((event, index) => {
      const stageKey = txt(
        event.key ||
        event.stageId ||
        event.id ||
        `stage-${index + 1}`
      );

      const format = txt(
        event.format || data.format || data.type
      ).toLowerCase();

      return {
        id: `${doc.id}__${stageKey}`,

        title:
          `${txt(data.title || data.name || doc.id)} · ` +
          `${txt(event.title || event.name || stageKey)}`,

        competitionId: doc.id,
        stageKey,
        year: competitionYear(data, event),
        lakeId: txt(event.lakeId || data.lakeId || LAKE_ID),
        format,

        entryType: txt(
          event.entryType ||
          data.entryType ||
          (format.includes("solo") ? "solo" : "team")
        ).toLowerCase()
      };
    });
  }

  async function fetchStages(mode, year) {
    if (mode === MODE.PREPARE) {
      const snapshot = await read(
        S.db.collection("competitions")
      );

      return snapshot.docs
        .flatMap(competitionStages)
        .filter(stage =>
          stage.year === year &&
          stage.lakeId === LAKE_ID
        );
    }

    const collection = mode === MODE.HISTORY
      ? historyCollection(year)
      : S.db
          .collection("seasonResults")
          .doc(year)
          .collection("stages");

    const snapshot = await read(collection);

    return snapshot.docs.map(doc => {
      const data = doc.data() || {};

      return {
        id: doc.id,

        title: txt(
          mode === MODE.HISTORY
            ? data.title || doc.id
            : data.stageName ||
              data.title ||
              data.stageId ||
              doc.id
        ),

        lakeId: txt(data.lakeId || LAKE_ID)
      };
    }).filter(stage => stage.lakeId === LAKE_ID);
  }

  async function loadYear(mode = S.mode, value) {
    const year = yearValue(
      value ??
      $(
        mode === MODE.HISTORY
          ? "historicalYear"
          : "mapYear"
      ).value
    );

    message(`Завантажую ${year} рік…`);

    const stages = await fetchStages(mode, year);

    requireAccess();
    resetSelection();

    S.mode = mode;
    S.year = year;
    S.stages = stages;

    $("mapYear").value = year;
    $("historicalYear").value = year;

    fillStageOptions();
    updateModeUI();

    message(
      stages.length
        ? `Знайдено: ${stages.length}. Обери потрібний запис.`
        : "За цей рік записів не знайдено.",
      stages.length ? "ok" : ""
    );
  }

  async function loadStage(id) {
    const stage = S.stages.find(item => item.id === id);

    if (!stage) {
      throw new Error("Запис не знайдено у списку.");
    }

    message("Завантажую карту…");

    const mode = S.mode;
    const year = S.year;

    let data;
    let saved;
    let rows = [];
    let sourceHash = "";

    if (mode === MODE.HISTORY) {
      const snapshot = await read(
        historyCollection(year).doc(id)
      );

      if (!snapshot.exists) {
        throw new Error(
          "Історичний турнір більше не існує."
        );
      }

      saved = data = snapshot.data() || {};

      if (txt(saved.year) !== year) {
        throw new Error(
          "Рік історичного турніру не збігається."
        );
      }

      if (
        saved.results != null &&
        !Array.isArray(saved.results)
      ) {
        throw new Error(
          "Історичні результати мають некоректний формат."
        );
      }

      rows = saved.results || [];

    } else {
      const sourceRef = mode === MODE.ARCHIVE
        ? archiveRef(year, id)
        : S.db
            .collection("competitions")
            .doc(stage.competitionId);

      const [source, map] = await Promise.all([
        read(sourceRef),
        read(mapRef(year, id))
      ]);

      if (!source.exists) {
        throw new Error(
          "Джерело етапу більше не існує."
        );
      }

      data = source.data() || {};
      saved = map.exists ? map.data() : null;

      if (mode === MODE.ARCHIVE) {
        rows = data.standings;
        sourceHash = await fingerprint(rows ?? null);

      } else {
        const fresh = competitionStages({
          id: stage.competitionId,
          data: () => data
        }).find(item =>
          item.id === id &&
          item.year === year &&
          item.lakeId === LAKE_ID
        );

        if (!fresh) {
          throw new Error(
            "Етап змінився. Завантаж список заново."
          );
        }

        Object.assign(stage, fresh);
      }

      if (
        saved &&
        (
          txt(saved.seasonYear) !== year ||
          saved.stageDocId !== id
        )
      ) {
        throw new Error(
          "Збережена карта належить іншому етапу або року."
        );
      }
    }

    if (
      saved &&
      (
        Number(saved.schemaVersion) !== 1 ||
        saved.lakeId !== LAKE_ID
      )
    ) {
      throw new Error(
        "Несумісна схема карти або інша водойма."
      );
    }

    if (
      saved?.assignments != null &&
      !Array.isArray(saved.assignments)
    ) {
      throw new Error("Некоректний формат прив'язок.");
    }

    if (
      saved?.emptyLakeSectors != null &&
      !Array.isArray(saved.emptyLakeSectors)
    ) {
      throw new Error(
        "Некоректний формат порожніх секторів."
      );
    }

    const assignments = (saved?.assignments || [])
      .map((item, index) => {
        const normalized = normalizeAssignment(item);

        if (!normalized) {
          throw new Error(
            `Некоректна прив'язка №${index + 1}.`
          );
        }

        return normalized;
      });

    const empty = [
      ...new Set(
        (saved?.emptyLakeSectors || []).map(Number)
      )
    ];

    if (
      empty.some(sector => !VALID_SECTORS.has(sector))
    ) {
      throw new Error(
        "Некоректний номер порожнього сектора."
      );
    }

    const historicalRows = {};

    if (mode === MODE.HISTORY) {
      for (const row of rows) {
        const sector = positiveInteger(
          row?.lakeSectorNumber
        );

        if (
          !VALID_SECTORS.has(sector) ||
          historicalRows[sector]
        ) {
          throw new Error(
            "Некоректний або повторний сектор " +
            "в історичних результатах."
          );
        }

        historicalRows[sector] = {
          ...row,
          lakeSectorNumber: sector
        };
      }
    }

    const revision = Number(saved?.revision ?? 0);

    if (!Number.isInteger(revision) || revision < 0) {
      throw new Error(
        "Некоректна revision документа."
      );
    }

    requireAccess();
    resetSelection();

    S.current = {
      ...stage,
      title: txt(data.title || stage.title),
      data,
      rows
    };

    if (mode !== MODE.HISTORY) {
      S.current.title = stage.title;
    }

    S.assignments = assignments;
    S.empty = empty;
    S.historicalRows = historicalRows;
    S.revision = revision;
    S.sourceHash = sourceHash;

    if (mode === MODE.HISTORY) {
      fillHistoricalMeta(data);
    }

    fillStageOptions(id);
    updateModeUI();
    render();
    selectSector(1, true);

    requestAnimationFrame(resetZoom);

    const archiveChanged =
      mode === MODE.ARCHIVE &&
      saved?.sourceSignature &&
      saved.sourceSignature !== sourceHash;

    message(
      archiveChanged
        ? "Архівні результати змінилися після збереження карти. " +
          "Перевір прив'язки перед збереженням."
        : saved
          ? `Карту завантажено. Статус: ${saved.status || "невідомий"}.`
          : "Нова карта. Можна починати розстановку.",
      archiveChanged ? "error" : "ok"
    );
  }

  // Перевірки

  function historyRowError(row) {
    if (!txt(row.teamName)) {
      return "немає назви команди";
    }

    if (
      !Number.isInteger(row.place) ||
      row.place < 1
    ) {
      return "некоректне місце";
    }

    const total = rowTotalWeight(row);
    const count = rowTotalCount(row);

    if (
      total === null ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      return "некоректна вага або кількість риб";
    }

    if (
      (count === 0 && total !== 0) ||
      (count > 0 && total <= 0)
    ) {
      return "вага не відповідає кількості риб";
    }

    return "";
  }

  function inspectMap() {
    const errors = [];
    const incomplete = [];
    const missingHistory = [];

    const physical = new Set();
    const drawKeys = new Set();

    const source = S.mode === MODE.ARCHIVE
      ? readRows(S.current?.rows)
      : null;

    if (source) {
      incomplete.push(...source.issues);
    }

    for (const assignment of S.assignments) {
      const sector = assignment.lakeSectorNumber;

      const slot = parseSlot(
        assignment.zone,
        assignment.sector
      );

      if (
        !VALID_SECTORS.has(sector) ||
        !slot ||
        slot.drawKey !== assignment.drawKey
      ) {
        errors.push(
          `Некоректна прив'язка №${sector}.`
        );
        continue;
      }

      if (physical.has(sector)) {
        errors.push(
          `Фізичний сектор №${sector} повторюється.`
        );
      }

      if (drawKeys.has(slot.drawKey)) {
        errors.push(
          `Позначення ${slot.drawKey} повторюється.`
        );
      }

      physical.add(sector);
      drawKeys.add(slot.drawKey);

      if (source) {
        const row = source.slots.get(slot.drawKey)?.row;

        if (!S.empty.includes(sector)) {
          if (!row) {
            incomplete.push(
              `${slot.drawKey}: немає архівного результату.`
            );
          } else if (
            rowTotalWeight(row) === null ||
            !Number.isInteger(rowTotalCount(row))
          ) {
            incomplete.push(
              `${slot.drawKey}: бракує коректної ваги ` +
              "або кількості риб."
            );
          }
        } else if (hasCatch(row)) {
          errors.push(
            `${slot.drawKey}: є улов, ` +
            "але сектор позначено порожнім."
          );
        }
      }

      if (
        S.mode === MODE.HISTORY &&
        !S.empty.includes(sector) &&
        !S.historicalRows[sector]
      ) {
        missingHistory.push(`№${sector}`);
      }
    }

    for (const sector of S.empty) {
      if (!physical.has(sector)) {
        errors.push(
          `Порожній сектор №${sector} не має прив'язки.`
        );
      }
    }

    if (missingHistory.length) {
      incomplete.push(
        `Без результату: ${missingHistory.join(", ")}.`
      );
    }

    if (!S.assignments.length) {
      incomplete.push("Ще немає прив'язок.");
    }

    if (source) {
      const missing = [...source.slots.keys()]
        .filter(key => !drawKeys.has(key));

      if (missing.length) {
        incomplete.push(
          `Не прив'язано: ${missing.join(", ")}.`
        );
      }
    }

    if (S.mode === MODE.HISTORY) {
      const entries = Object.entries(S.historicalRows);

      if (!entries.length) {
        incomplete.push(
          "Не внесено жодного результату."
        );
      }

      for (const [key, row] of entries) {
        const sector = Number(key);

        if (!physical.has(sector)) {
          errors.push(
            `Результат №${sector} не має прив'язки.`
          );
        }

        if (S.empty.includes(sector)) {
          errors.push(
            `№${sector}: одночасно є результат ` +
            "і позначка «пустував»."
          );
        }

        const issue = historyRowError(row);

        if (issue) {
          errors.push(`№${sector}: ${issue}.`);
        }
      }
    }

    if (
      S.mode === MODE.PREPARE &&
      S.assignments.length &&
      S.assignments.length === S.empty.length
    ) {
      incomplete.push(
        "Немає секторів для учасників."
      );
    }

    return {
      errors,
      incomplete,
      ready: !errors.length && !incomplete.length
    };
  }

  // Відображення

  function rowForAssignment(assignment) {
    if (!assignment) return null;

    if (S.mode === MODE.ARCHIVE) {
      return readRows(S.current.rows)
        .slots.get(assignment.drawKey)?.row || null;
    }

    if (S.mode === MODE.HISTORY) {
      return S.historicalRows[
        assignment.lakeSectorNumber
      ] || null;
    }

    return null;
  }

  function participation(assignment) {
    if (
      S.empty.includes(assignment.lakeSectorNumber)
    ) {
      return S.mode === MODE.PREPARE
        ? "Не використовується"
        : "Пустував";
    }

    if (S.mode === MODE.PREPARE) {
      return "Заплановано";
    }

    return rowForAssignment(assignment)
      ? "Ловили"
      : "Немає даних";
  }

  function resultText(row) {
    if (!row) return "—";

    const place = positiveInteger(
      row.place ?? row.zonePlace ?? row.overallPlace
    );

    return (
      (place ? `${place} місце · ` : "") +
      `${weight(rowTotalWeight(row))} кг · ` +
      `${rowTotalCount(row) ?? "—"} риб`
    );
  }

  function render() {
    if (!S.current) return;

    setText(
      "selectedStageTitle",
      `${S.year} · ${S.current.title}`
    );

    $("mapPins").innerHTML = POINTS
      .map(([sector, x, y]) => {
        const assignment = S.assignments.find(
          item => item.lakeSectorNumber === sector
        );

        const empty = S.empty.includes(sector);

        return `
          <button
            type="button"
            class="map-pin"
            data-lake="${sector}"
            data-zone="${esc(assignment?.zone || "")}"
            data-empty="${empty}"
            aria-pressed="${sector === S.selected}"
            style="left:${x}%;top:${y}%"
            aria-label="Сектор озера №${sector}${
              assignment ? `, ${esc(assignment.drawKey)}` : ""
            }"
          >
            <span>${sector}</span>
            <small>${esc(
              assignment
                ? assignment.drawKey + (empty ? " ×" : "")
                : ""
            )}</small>
          </button>
        `;
      })
      .join("");

    const ordered = [...S.assignments].sort(
      (a, b) => a.lakeSectorNumber - b.lakeSectorNumber
    );

    $("mappingRows").innerHTML = ordered
      .map(assignment => {
        const row = rowForAssignment(assignment);

        return `
          <tr>
            <td>№${assignment.lakeSectorNumber}</td>
            <td>${esc(assignment.drawKey)}</td>
            <td>${esc(teamName(row))}</td>
            <td>${esc(resultText(row))}</td>
            <td>${esc(participation(assignment))}</td>
          </tr>
        `;
      })
      .join("") ||
      '<tr><td colspan="5">Ще немає прив\'язок.</td></tr>';

    $("emptySectors").innerHTML = ordered
      .map(assignment => {
        const sector = assignment.lakeSectorNumber;

        return `
          <label class="maps-check">
            <input
              type="checkbox"
              data-empty-sector="${sector}"
              ${S.empty.includes(sector) ? "checked" : ""}
            >
            <span>
              ${esc(assignment.drawKey)} · озеро №${sector}
            </span>
          </label>
        `;
      })
      .join("") ||
      '<p class="maps-muted">Немає секторів.</p>';

    const check = inspectMap();

    const fished = ordered.filter(item =>
      !S.empty.includes(item.lakeSectorNumber) &&
      rowForAssignment(item)
    ).length;

    setText(
      "mapSummary",
      S.mode === MODE.PREPARE
        ? `У розстановці: ${ordered.length} · ` +
          `Для учасників: ${ordered.length - S.empty.length} · ` +
          `Не використовуємо: ${S.empty.length}`
        : `У розстановці: ${ordered.length} · ` +
          `Ловили: ${fished} · ` +
          `Пустували: ${S.empty.length} · ` +
          `Немає даних: ${ordered.length - S.empty.length - fished}`
    );

    setText(
      "mapCoverage",
      check.ready
        ? S.mode === MODE.PREPARE
          ? "Розстановка коректна."
          : "Дані прив'язаних секторів заповнено."
        : [...check.errors, ...check.incomplete].join("\n")
    );

    if (S.mode === MODE.HISTORY) {
      renderHistoricalTable(ordered);
    }

    controls();
  }

  function renderHistoricalTable(ordered) {
    $("historicalResultsRows").innerHTML = ordered
      .map(assignment => {
        const row = S.historicalRows[
          assignment.lakeSectorNumber
        ];

        return `
          <tr>
            <td>№${assignment.lakeSectorNumber}</td>
            <td>${esc(assignment.drawKey)}</td>
            <td>${esc(
              row ? teamName(row) : participation(assignment)
            )}</td>
            <td>${esc(row?.place ?? "—")}</td>
            <td>${weight(rowTotalWeight(row))}</td>
            <td>${esc(rowTotalCount(row) ?? "—")}</td>
          </tr>
        `;
      })
      .join("") ||
      '<tr><td colspan="6">Ще немає результатів.</td></tr>';

    const rows = Object.values(S.historicalRows);

    const totalGrams = rows.reduce(
      (sum, row) =>
        sum + Math.round((rowTotalWeight(row) || 0) * 1000),
      0
    );

    const count = rows.reduce(
      (sum, row) => sum + (rowTotalCount(row) || 0),
      0
    );

    setText(
      "historicalTotals",
      `Результатів: ${rows.length} · ` +
      `Вага: ${(totalGrams / 1000).toFixed(3)} кг · ` +
      `Риб: ${count}`
    );
  }

  // Номер у зоні — без списку з 78 варіантів

  function nextNumber(zone) {
    const used = new Set(
      S.assignments
        .filter(item =>
          item.zone === zone &&
          item.lakeSectorNumber !== S.selected
        )
        .map(item => item.sector)
    );

    for (
      let number = 1;
      number <= MAX_LAKE_SECTOR;
      number++
    ) {
      if (!used.has(number)) return number;
    }

    return 1;
  }

  function fillSlotControls() {
    const assignment = S.assignments.find(
      item => item.lakeSectorNumber === S.selected
    );

    const used = new Set(
      S.assignments
        .filter(item =>
          item.lakeSectorNumber !== S.selected
        )
        .map(item => item.drawKey)
    );

    const slots = S.mode === MODE.ARCHIVE
      ? [...readRows(S.current.rows).slots.values()]
          .sort(sortSlots)
      : [];

    $("lakeSector").value = String(S.selected);

    $("archiveSlot").innerHTML =
      '<option value="">Обери позначення</option>' +
      slots.map(slot => `
        <option
          value="${esc(slot.drawKey)}"
          ${used.has(slot.drawKey) ? "disabled" : ""}
        >
          ${esc(slot.drawKey)}
        </option>
      `).join("") +
      '<option value="manual">Ввести вручну…</option>';

    $("archiveSlot").value = assignment
      ? slots.some(slot =>
          slot.drawKey === assignment.drawKey
        )
        ? assignment.drawKey
        : "manual"
      : "";

    $("manualZone").value =
      assignment?.zone || S.lastZone;

    $("manualNumber").value =
      assignment?.sector ||
      nextNumber($("manualZone").value);

    preview();
  }

  function selectSector(sector, force = false) {
    if (
      !S.current ||
      !VALID_SECTORS.has(sector)
    ) {
      return;
    }

    if (!force && sector === S.selected) return;

    if (!force && !mayLeaveResult()) {
      $("lakeSector").value = String(S.selected);
      return;
    }

    S.selected = sector;
    S.resultDirty = false;

    fillSlotControls();

    $("mapPins")
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.lake) === sector)
        );
      });

    if (S.mode === MODE.HISTORY) {
      fillHistoricalResult();
    }

    controls();
  }

  function chosenSlot() {
    return (
      S.mode !== MODE.ARCHIVE ||
      $("archiveSlot").value === "manual"
    )
      ? parseSlot(
          $("manualZone").value,
          $("manualNumber").value
        )
      : parseSlot("", $("archiveSlot").value);
  }

  function preview() {
    if (!S.current) return;

    setHidden(
      "manualSlot",
      S.mode === MODE.ARCHIVE &&
      $("archiveSlot").value !== "manual"
    );

    const slot = chosenSlot();

    if (!slot) {
      setText("slotPreview", "Обери позначення.");
      return;
    }

    setText(
      "slotPreview",
      `№${S.selected} → ${slot.drawKey}`
    );
  }

  function checkCollision(slot, sector) {
    const other = S.assignments.find(item =>
      item.drawKey === slot.drawKey &&
      item.lakeSectorNumber !== sector
    );

    if (other) {
      throw new Error(
        `${slot.drawKey} уже прив'язано до фізичного ` +
        `сектора №${other.lakeSectorNumber}.`
      );
    }
  }

  function putAssignment(slot, sector) {
    S.assignments = S.assignments.filter(
      item => item.lakeSectorNumber !== sector
    );

    S.assignments.push(
      assignmentFor(sector, slot)
    );
  }

  function changed(refreshResult = false) {
    S.dirty = true;

    render();
    fillSlotControls();

    if (
      refreshResult &&
      S.mode === MODE.HISTORY
    ) {
      S.resultDirty = false;
      fillHistoricalResult();
    }

    controls();
  }

  function assign() {
    const slot = chosenSlot();

    if (!slot) {
      throw new Error("Обери правильне позначення.");
    }

    checkCollision(slot, S.selected);

    const previous = S.assignments.find(
      item => item.lakeSectorNumber === S.selected
    );

    if (
      S.mode === MODE.HISTORY &&
      S.historicalRows[S.selected] &&
      previous?.drawKey !== slot.drawKey
    ) {
      throw new Error(
        "Для зміни позначення разом із результатом " +
        "використай поле «Турнірне позначення» " +
        "у формі результату."
      );
    }

    putAssignment(slot, S.selected);

    S.lastZone = slot.zone;

    if (previous?.drawKey !== slot.drawKey) {
      S.empty = S.empty.filter(
        sector => sector !== S.selected
      );
    }

    if (S.mode === MODE.HISTORY) {
      $("historicalDrawKey").value = slot.drawKey;
    }

    changed();

    message(
      `Озеро №${S.selected} → ${slot.drawKey}. Збережи зміни.`,
      "ok"
    );
  }

  function removeAssignment() {
    if (
      S.mode === MODE.HISTORY &&
      S.historicalRows[S.selected]
    ) {
      throw new Error(
        "Спочатку очисти результат цього сектора."
      );
    }

    if (!mayLeaveResult()) return;

    S.assignments = S.assignments.filter(
      item => item.lakeSectorNumber !== S.selected
    );

    S.empty = S.empty.filter(
      sector => sector !== S.selected
    );

    changed(true);
  }

  function toggleEmpty(input) {
    const sector = Number(input.dataset.emptySector);
    const checked = input.checked;

    const assignment = S.assignments.find(
      item => item.lakeSectorNumber === sector
    );

    if (!assignment) return;

    if (
      checked &&
      S.mode === MODE.ARCHIVE &&
      hasCatch(rowForAssignment(assignment))
    ) {
      input.checked = false;

      throw new Error(
        "Сектор має улов. Позначити його порожнім не можна."
      );
    }

    if (
      checked &&
      S.mode === MODE.HISTORY &&
      S.historicalRows[sector]
    ) {
      input.checked = false;

      throw new Error(
        "Спочатку очисти результат сектора " +
        "або зміни участь у формі результату."
      );
    }

    if (
      sector === S.selected &&
      !mayLeaveResult()
    ) {
      input.checked = !checked;
      return;
    }

    S.empty = checked
      ? [...new Set([...S.empty, sector])]
      : S.empty.filter(value => value !== sector);

    changed(sector === S.selected);
  }

  // Історичні турніри

  function fillHistoricalMeta(data = {}) {
    $("historicalTitle").value = txt(data.title);
    $("historicalOrganizer").value = txt(data.organizer);
    $("historicalLake").value = LAKE_ID;
    $("historicalStart").value = txt(data.startDate);
    $("historicalEnd").value = txt(data.endDate);

    S.metaDirty = false;
  }

  function historicalMeta() {
    const title = txt($("historicalTitle").value);
    const organizer = txt($("historicalOrganizer").value);
    const startDate = txt($("historicalStart").value);
    const endDate = txt($("historicalEnd").value);

    if (!title || title.length > 150) {
      throw new Error(
        "Введи назву турніру, не довшу за 150 символів."
      );
    }

    if (organizer.length > 120) {
      throw new Error("Назва організатора задовга.");
    }

    if ($("historicalLake").value !== LAKE_ID) {
      throw new Error(
        "Ця карта призначена для Лелехівки."
      );
    }

    for (const date of [startDate, endDate]) {
      if (!date) continue;

      const parsed = new Date(`${date}T00:00:00Z`);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
      ) {
        throw new Error(
          "Введи коректні дати турніру."
        );
      }
    }

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      throw new Error(
        "Дата завершення не може бути раніше початку."
      );
    }

    return {
      title,
      organizer,
      startDate,
      endDate
    };
  }

  async function beginHistory() {
    const year = yearValue(
      $("historicalYear").value
    );

    if (year !== S.year) {
      await loadYear(MODE.HISTORY, year);
    }

    resetSelection();

    S.newHistory = true;

    fillHistoricalMeta();
    fillStageOptions();
    updateModeUI();

    $("historicalTitle").focus();

    message(
      `Новий турнір за ${S.year} рік. ` +
      "Введи назву та збережи його."
    );
  }

  async function createHistory() {
    if (
      S.mode !== MODE.HISTORY ||
      !S.newHistory
    ) {
      throw new Error(
        "Спочатку натисни «Створити новий турнір»."
      );
    }

    if (
      yearValue($("historicalYear").value) !== S.year
    ) {
      throw new Error(
        "Рік у полі змінено. Для іншого року " +
        "спочатку завантаж турніри за цей рік."
      );
    }

    const meta = historicalMeta();
    const year = S.year;
    const ref = historyCollection(year).doc();

    const payload = {
      schemaVersion: 1,
      lakeId: LAKE_ID,
      year,
      ...meta,

      assignments: [],
      emptyLakeSectors: [],
      results: [],

      status: "draft",
      revision: 1,

      createdAt: serverTimestamp(),
      createdBy: OWNER_UID,

      updatedAt: serverTimestamp(),
      updatedBy: OWNER_UID
    };

    message("Створюю історичний турнір…");

    await waitWrite(
      S.db.runTransaction(async transaction => {
        const old = await transaction.get(ref);

        requireAccess();

        if (old.exists) {
          throw new Error(
            "Запис із цим ID уже існує. Спробуй ще раз."
          );
        }

        transaction.set(ref, payload);
      })
    );

    requireAccess();
    resetSelection();

    const stage = {
      id: ref.id,
      title: meta.title,
      lakeId: LAKE_ID
    };

    S.stages.push(stage);

    S.current = {
      ...stage,
      data: payload,
      rows: []
    };

    S.revision = 1;

    fillHistoricalMeta(meta);
    fillStageOptions(ref.id);
    updateModeUI();
    render();
    selectSector(1, true);

    requestAnimationFrame(resetZoom);

    message(
      "Турнір створено як чернетку. Обери сектор і внеси результат.",
      "ok"
    );
  }

  function fillHistoricalResult() {
    const sector = S.selected;
    const row = S.historicalRows[sector];

    const assignment = S.assignments.find(
      item => item.lakeSectorNumber === sector
    );

    $("historicalSectorNumber").value = sector;
    $("historicalDrawKey").value = assignment?.drawKey || "";
    $("historicalTeam").value = row?.teamName || "";
    $("historicalPlace").value = row?.place ?? "";
    $("historicalWeight").value = rowTotalWeight(row) ?? "";
    $("historicalFishCount").value = rowTotalCount(row) ?? "";

    $("historicalParticipation").value =
      S.empty.includes(sector)
        ? "empty"
        : row
          ? "fished"
          : "unknown";

    setText(
      "historicalResultStatus",
      row
        ? "Результат внесено."
        : S.empty.includes(sector)
          ? "Сектор позначено порожнім."
          : "Немає даних."
    );
  }

  function applyHistoricalResult() {
    if (
      S.mode !== MODE.HISTORY ||
      !S.current
    ) {
      throw new Error(
        "Спочатку обери історичний турнір."
      );
    }

    const sector = S.selected;

    const slot = parseSlot(
      "",
      $("historicalDrawKey").value
    );

    if (!slot) {
      throw new Error(
        "Введи турнірне позначення: A1, B3, C5 тощо."
      );
    }

    checkCollision(slot, sector);

    const state = $("historicalParticipation").value;

    if (
      !["fished", "empty", "unknown"].includes(state)
    ) {
      throw new Error(
        "Обери коректний стан участі."
      );
    }

    let row = null;

    if (state === "fished") {
      const enteredWeight = nonNegative(
        $("historicalWeight").value
      );

      row = {
        lakeSectorNumber: sector,
        zone: slot.zone,
        sector: slot.sector,
        drawKey: slot.drawKey,

        teamName: txt($("historicalTeam").value),

        place: positiveInteger(
          $("historicalPlace").value
        ),

        totalWeight: enteredWeight === null
          ? null
          : Number(enteredWeight.toFixed(3)),

        totalCount: num(
          $("historicalFishCount").value
        )
      };

      const issue = historyRowError(row);

      if (issue) {
        throw new Error(
          `Сектор №${sector}: ${issue}.`
        );
      }

      if (row.teamName.length > 150) {
        throw new Error("Назва команди задовга.");
      }
    }

    putAssignment(slot, sector);

    if (row) {
      S.historicalRows[sector] = row;
    } else {
      delete S.historicalRows[sector];
    }

    S.empty = S.empty.filter(
      value => value !== sector
    );

    if (state === "empty") {
      S.empty.push(sector);
    }

    S.resultDirty = false;

    changed(true);

    setText(
      "historicalResultStatus",
      "Додано в чернетку. Збережи турнір."
    );

    message(
      `Сектор №${sector}: зміни в чернетці. Збережи турнір.`,
      "ok"
    );
  }

  function clearHistoricalResult() {
    delete S.historicalRows[S.selected];

    S.empty = S.empty.filter(
      sector => sector !== S.selected
    );

    S.resultDirty = false;

    changed(true);

    message(
      "Результат очищено в чернетці. Збережи турнір."
    );
  }

  // Збереження

  function sortedAssignments() {
    return S.assignments
      .map(item =>
        assignmentFor(item.lakeSectorNumber, item)
      )
      .sort(
        (a, b) => a.lakeSectorNumber - b.lakeSectorNumber
      );
  }

  async function saveSectorMap() {
    const check = inspectMap();

    if (check.errors.length) {
      throw new Error(check.errors.join("\n"));
    }

    const mode = S.mode;
    const year = S.year;
    const current = { ...S.current };
    const signature = S.sourceHash;
    const expectedRevision = S.revision;

    const assignments = sortedAssignments();

    const emptyLakeSectors = [...new Set(S.empty)]
      .sort((a, b) => a - b);

    const ref = mapRef(year, current.id);

    const sourceRef = mode === MODE.ARCHIVE
      ? archiveRef(year, current.id)
      : S.db
          .collection("competitions")
          .doc(current.competitionId);

    await waitWrite(
      S.db.runTransaction(async transaction => {
        const source = await transaction.get(sourceRef);
        const snapshot = await transaction.get(ref);

        requireAccess();

        if (!source.exists) {
          throw new Error(
            "Джерело етапу більше не існує."
          );
        }

        if (mode === MODE.ARCHIVE) {
          const actual = await fingerprint(
            source.data().standings ?? null
          );

          if (actual !== signature) {
            throw new Error(
              "Архів змінився. " +
              "Перезавантаж етап перед збереженням."
            );
          }

        } else {
          const exists = competitionStages({
            id: current.competitionId,
            data: () => source.data()
          }).some(stage =>
            stage.id === current.id &&
            stage.year === year &&
            stage.lakeId === LAKE_ID
          );

          if (!exists) {
            throw new Error(
              "Етап змінився. Перезавантаж список."
            );
          }
        }

        const old = snapshot.exists
          ? snapshot.data()
          : null;

        if (
          Number(old?.revision ?? 0) !== expectedRevision
        ) {
          throw new Error(
            "Карту змінили в іншій вкладці. " +
            "Перезавантаж її; поточні зміни ще не збережено."
          );
        }

        if (
          old &&
          (
            Number(old.schemaVersion) !== 1 ||
            old.lakeId !== LAKE_ID ||
            txt(old.seasonYear) !== year ||
            old.stageDocId !== current.id
          )
        ) {
          throw new Error(
            "Існуюча карта має несумісну схему " +
            "або іншу прив'язку."
          );
        }

        const stamp = serverTimestamp();

        const payload = {
          schemaVersion: 1,
          lakeId: LAKE_ID,
          mapVersion: 1,

          seasonYear: year,
          stageDocId: current.id,
          stageTitle: current.title,

          assignments,
          emptyLakeSectors,

          status: check.ready ? "ready" : "draft",
          revision: expectedRevision + 1,

          createdAt: old?.createdAt || stamp,
          createdBy: old?.createdBy || OWNER_UID,

          updatedAt: stamp,
          updatedBy: OWNER_UID
        };

        if (mode === MODE.ARCHIVE) {
          payload.sourcePath =
            `seasonResults/${year}/stages/${current.id}`;

          payload.sourceSignature = signature;

        } else {
          payload.sourcePath =
            `competitions/${current.competitionId}`;

          payload.competitionId = current.competitionId;
          payload.stageKey = current.stageKey;
          payload.entryType = current.entryType || "team";
          payload.format = current.format || "";
        }

        transaction.set(
          ref,
          payload,
          { merge: true }
        );
      })
    );

    requireAccess();

    S.revision = expectedRevision + 1;
    S.dirty = false;

    render();

    message(
      check.ready
        ? "Карту збережено. Статус: ready."
        : "Карту збережено як чернетку: draft.",
      "ok"
    );
  }

  async function saveHistory() {
    const meta = historicalMeta();

    // Загальне збереження застосовує введення у формі.
    if (S.resultDirty) {
      applyHistoricalResult();
    }

    const check = inspectMap();

    if (check.errors.length) {
      throw new Error(check.errors.join("\n"));
    }

    const year = S.year;
    const id = S.current.id;
    const expectedRevision = S.revision;

    const assignments = sortedAssignments();

    const results = Object.values(S.historicalRows)
      .map(row => {
        const assignment = assignments.find(
          item =>
            item.lakeSectorNumber === row.lakeSectorNumber
        );

        if (!assignment) {
          throw new Error(
            `Результат №${row.lakeSectorNumber} не має прив'язки.`
          );
        }

        return {
          ...row,
          zone: assignment.zone,
          sector: assignment.sector,
          drawKey: assignment.drawKey
        };
      })
      .sort(
        (a, b) => a.lakeSectorNumber - b.lakeSectorNumber
      );

    const emptyLakeSectors = [...new Set(S.empty)]
      .sort((a, b) => a - b);

    const ref = historyCollection(year).doc(id);

    const payload = {
      ...meta,

      assignments,
      emptyLakeSectors,
      results,

      status: check.ready ? "ready" : "draft",
      revision: expectedRevision + 1,

      updatedAt: serverTimestamp(),
      updatedBy: OWNER_UID
    };

    message("Зберігаю історичний турнір…");

    await waitWrite(
      S.db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);

        requireAccess();

        if (!snapshot.exists) {
          throw new Error(
            "Історичний турнір більше не існує."
          );
        }

        const old = snapshot.data();

        if (
          Number(old.revision ?? 0) !== expectedRevision
        ) {
          throw new Error(
            "Турнір змінили в іншій вкладці. " +
            "Перезавантаж його; поточні зміни ще не збережено."
          );
        }

        if (
          Number(old.schemaVersion) !== 1 ||
          old.lakeId !== LAKE_ID ||
          txt(old.year) !== year
        ) {
          throw new Error(
            "Турнір має іншу водойму, рік або схему."
          );
        }

        transaction.update(ref, payload);
      })
    );

    requireAccess();

    S.revision = expectedRevision + 1;
    S.current.title = meta.title;

    S.current.data = {
      ...S.current.data,
      ...payload
    };

    const stage = S.stages.find(
      item => item.id === id
    );

    if (stage) stage.title = meta.title;

    S.dirty = false;
    S.metaDirty = false;
    S.resultDirty = false;

    fillStageOptions(id);
    render();

    setText(
      "historicalResultStatus",
      "Турнір збережено на сервері."
    );

    message(
      check.ready
        ? "Історичний турнір збережено. Статус: ready."
        : "Історичний турнір збережено як чернетку: draft. " +
          "Перевір сектори без даних.",
      "ok"
    );
  }

  async function save() {
    if (
      S.mode === MODE.HISTORY &&
      S.newHistory
    ) {
      return createHistory();
    }

    if (!S.current) {
      throw new Error(
        "Спочатку обери етап або турнір."
      );
    }

    message("Зберігаю дані…");

    if (S.mode === MODE.HISTORY) {
      await saveHistory();
    } else {
      await saveSectorMap();
    }
  }

  // Масштаб

  function resizeMap() {
    const viewport = $("mapViewport");
    const canvas = $("mapCanvas");

    if (
      !viewport ||
      !canvas ||
      !viewport.clientWidth
    ) {
      return;
    }

    S.zoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, S.zoom)
    );

    canvas.style.width =
      `${viewport.clientWidth * S.zoom}px`;

    canvas.style.height = "auto";
    canvas.style.aspectRatio =
      `${MAP_WIDTH} / ${MAP_HEIGHT}`;

    viewport.style.overflow =
      S.zoom > MIN_ZOOM ? "auto" : "hidden";

    setText(
      "zoomValue",
      `${Math.round(S.zoom * 100)}%`
    );

    controls();
  }

  function resetZoom() {
    S.zoom = 1;

    resizeMap();

    $("mapViewport").scrollLeft = 0;
    $("mapViewport").scrollTop = 0;
  }

  // Події

  function on(id, event, handler) {
    $(id)?.addEventListener(event, handler);
  }

  function bindEvents() {
    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.addEventListener("click", () => {
          const mode = button.dataset.mapMode;

          if (
            !S.busy &&
            mode !== S.mode &&
            Object.values(MODE).includes(mode) &&
            mayLeave()
          ) {
            run(() => loadYear(mode, S.year));
          }
        });
      });

    const reload = () => {
      if (!S.busy && mayLeave()) {
        run(() => loadYear());
      }
    };

    on("loadYear", "click", reload);
    on("loadHistorical", "click", reload);

    ["mapYear", "historicalYear"].forEach(id => {
      on(id, "keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          reload();
        }
      });
    });

    ["mapStage", "historicalTournament"].forEach(id => {
      on(id, "change", () => {
        const element = $(id);
        const next = element.value;
        const previous = S.current?.id || "";

        if (S.busy || !mayLeave()) {
          element.value = previous;
          return;
        }

        if (!next) {
          resetSelection();
          updateModeUI();
          controls();

          message("Обери етап або турнір.");
          return;
        }

        run(async () => {
          try {
            await loadStage(next);
          } catch (error) {
            element.value = previous;
            throw error;
          }
        });
      });
    });

    on("newHistorical", "click", () => {
      if (!S.busy && mayLeave()) {
        run(beginHistory);
      }
    });

    on("saveHistoricalMeta", "click", () => run(save));
    on("saveMap", "click", () => run(save));

    [
      "historicalTitle",
      "historicalOrganizer",
      "historicalLake",
      "historicalStart",
      "historicalEnd"
    ].forEach(id => {
      on(id, "input", () => {
        if (
          !S.busy &&
          S.allowed &&
          S.mode === MODE.HISTORY
        ) {
          S.metaDirty = true;
          controls();
        }
      });
    });

    [
      "historicalDrawKey",
      "historicalTeam",
      "historicalPlace",
      "historicalWeight",
      "historicalFishCount",
      "historicalParticipation"
    ].forEach(id => {
      const mark = () => {
        if (
          !S.busy &&
          S.allowed &&
          S.current &&
          S.mode === MODE.HISTORY
        ) {
          S.resultDirty = true;

          setText(
            "historicalResultStatus",
            "Є незбережене введення."
          );

          controls();
        }
      };

      on(id, "input", mark);
      on(id, "change", mark);
    });

    on(
      "saveHistoricalResult",
      "click",
      () => edit(applyHistoricalResult)
    );

    on(
      "clearHistoricalResult",
      "click",
      () => edit(clearHistoricalResult)
    );

    on("lakeSector", "change", () => {
      edit(() => {
        selectSector(Number($("lakeSector").value));
      });
    });

    on("mapPins", "click", event => {
      const button = event.target.closest("[data-lake]");

      if (button) {
        edit(() => {
          selectSector(Number(button.dataset.lake));
        });
      }
    });

    on("emptySectors", "change", event => {
      if (event.target.matches("[data-empty-sector]")) {
        edit(() => toggleEmpty(event.target));
      }
    });

    on("manualZone", "change", () => {
      if (S.current && !S.busy) {
        $("manualNumber").value =
          nextNumber($("manualZone").value);

        preview();
      }
    });

    ["archiveSlot", "manualNumber"].forEach(id => {
      on(id, "input", preview);
      on(id, "change", preview);
    });

    on("assignSlot", "click", () => edit(assign));

    on(
      "removeSlot",
      "click",
      () => edit(removeAssignment)
    );

    on("zoomIn", "click", () => {
      edit(() => {
        S.zoom += ZOOM_STEP;
        resizeMap();
      });
    });

    on("zoomOut", "click", () => {
      edit(() => {
        S.zoom -= ZOOM_STEP;
        resizeMap();
      });
    });

    on("zoomReset", "click", () => edit(resetZoom));

    on("lakeImage", "error", () => {
      setHidden("imageError", false);
    });

    on("lakeImage", "load", () => {
      setHidden("imageError", true);
      resizeMap();
    });

    if (
      $("lakeImage").complete &&
      !$("lakeImage").naturalWidth
    ) {
      setHidden("imageError", false);
    }

    window.addEventListener("resize", () => {
      requestAnimationFrame(resizeMap);
    });

    window.addEventListener("beforeunload", event => {
      if (hasUnsaved() || S.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  // Запуск

  async function waitFirebase() {
    if (window.scReady) {
      await timed(
        window.scReady,
        "Firebase не відповідає."
      );
    }

    let interval;

    try {
      await timed(
        new Promise(resolve => {
          if (window.scDb && window.scAuth) {
            return resolve();
          }

          interval = setInterval(() => {
            if (window.scDb && window.scAuth) {
              resolve();
            }
          }, 100);
        }),
        "Firebase не ініціалізовано."
      );
    } finally {
      clearInterval(interval);
    }

    S.db = window.scDb;
    S.auth = window.scAuth;
  }

  function waitAuth() {
    return new Promise((resolve, reject) => {
      let unsubscribe = null;
      let settled = false;

      const finish = (error, user) => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);

        if (unsubscribe) unsubscribe();

        if (error) {
          reject(error);
        } else {
          resolve(user);
        }
      };

      const timer = setTimeout(() => {
        finish(
          new Error("Не вдалося перевірити авторизацію.")
        );
      }, REQUEST_TIMEOUT);

      unsubscribe = S.auth.onAuthStateChanged(
        user => finish(null, user),
        error => finish(error)
      );

      if (settled && unsubscribe) {
        unsubscribe();
      }
    });
  }

  async function boot() {
    if (S.started) return;

    S.started = true;

    try {
      message(
        `STOLAR CARP • Карти секторів v${VERSION}\n` +
        "Перевіряю доступ…"
      );

      installInterface();

      await waitFirebase();

      const user = await waitAuth();

      if (!user || user.uid !== OWNER_UID) {
        throw new Error(
          "Доступ тільки для власника STOLAR CARP."
        );
      }

      const profile = await read(
        S.db.collection("users").doc(user.uid)
      );

      if (
        !profile.exists ||
        profile.data()?.role !== "admin"
      ) {
        throw new Error(
          "Акаунт не має ролі admin."
        );
      }

      if (S.auth.currentUser?.uid !== OWNER_UID) {
        throw new Error("Сесію завершено.");
      }

      S.allowed = true;

      S.auth.onAuthStateChanged(value => {
        if (value?.uid !== OWNER_UID) {
          S.allowed = false;

          setHidden("mapApp", true);
          controls();

          message(
            "Сесію завершено. Увійди та перезавантаж сторінку.",
            "error"
          );
        }
      });

      const requested = new URLSearchParams(
        location.search
      ).get("year");

      let year = String(new Date().getFullYear());

      if (requested) {
        try {
          year = yearValue(requested);
        } catch (_) {}
      }

      $("mapYear").value = year;
      $("historicalYear").value = year;

      setHidden("mapApp", false);

      updateModeUI();
      bindEvents();
      controls();

      await run(() => loadYear(MODE.PREPARE, year));

    } catch (error) {
      S.allowed = false;

      setHidden("mapApp", true);

      console.error(error);
      message(errorMessage(error), "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
