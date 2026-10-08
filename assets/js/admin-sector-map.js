// ============================================================
// STOLAR CARP • КАРТИ СЕКТОРІВ
// Версія: 2.2 • 08.10.2026
//
// HTML: admin-sector-map.html v2.0
//
// РЕЖИМИ:
// 1. prepare    — підготовка до жеребкування
// 2. archive    — прив'язка архівних результатів
// 3. historical — історичні / сторонні турніри
//
// FIRESTORE:
//
// sectorMaps/{year}/stages/{stageDocId}
//
// seasonResults/{year}/stages/{stageDocId}
//
// lakeHistoricalEvents/{eventId}
//
// lakeHistoricalEvents/{eventId}/sectors/{number}
//
// ГАРАНТІЇ:
// - LIVE не змінюємо.
// - Архівні результати не змінюємо.
// - Рейтинг не змінюємо.
// - Фізичні сектори 1–26.
// - Немає дублювання HTML-елементів.
// - Історичні результати зберігаємо окремо.
// - Перевіряємо revision.
// - Підготовку блокуємо після початку жеребкування.
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // CONFIG
  // ==========================================================

  const VERSION = "2.2";

  const OWNER_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const LAKE_ID = "lelehivka";

  const SECTOR_COUNT = 26;

  const REQUEST_TIMEOUT = 20000;

  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  const MODE = Object.freeze({
    PREPARE: "prepare",
    ARCHIVE: "archive",
    HISTORICAL: "historical"
  });

  // ==========================================================
  // PHYSICAL SECTORS
  // ==========================================================

  const POINTS = [
    [1, 84.54, 13.14],
    [2, 80.24, 13.58],
    [3, 74.78, 14.03],
    [4, 70.30, 14.32],
    [5, 65.73, 14.32],
    [6, 60.98, 14.62],
    [7, 56.32, 14.32],
    [8, 51.30, 14.77],
    [9, 47.00, 14.62],
    [10, 42.79, 14.47],
    [11, 38.49, 15.07],
    [12, 34.54, 15.07],
    [13, 30.06, 14.77],
    [14, 25.49, 14.32],
    [15, 20.83, 13.88],
    [16, 16.80, 13.58],
    [17, 16.80, 66.03],
    [18, 21.19, 71.16],
    [19, 25.40, 77.40],
    [20, 29.17, 81.78],
    [21, 36.00, 81.70],
    [22, 63.22, 81.85],
    [23, 67.79, 82.00],
    [24, 72.36, 81.85],
    [25, 76.93, 82.00],
    [26, 81.50, 81.85]
  ];

  const VALID_SECTORS = new Set(
    POINTS.map(item => item[0])
  );

  // ==========================================================
  // DOM HELPERS
  // ==========================================================

  const $ = id => document.getElementById(id);

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHTML(value) {
    return text(value).replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character])
    );
  }

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = String(value ?? "");
    }
  }

  function setHidden(id, hidden) {
    const element = $(id);

    if (element) {
      element.hidden = Boolean(hidden);
    }
  }

  function setDisabled(id, disabled) {
    const element = $(id);

    if (element) {
      element.disabled = Boolean(disabled);
    }
  }

  function value(id) {
    return text($(id)?.value);
  }

  function number(value) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      text(value) === ""
    ) {
      return null;
    }

    const result = Number(
      text(value).replace(",", ".")
    );

    return Number.isFinite(result)
      ? result
      : null;
  }

  function positiveInteger(value) {
    const result = number(value);

    return Number.isInteger(result) &&
      result > 0
      ? result
      : null;
  }

  function nonNegativeInteger(value) {
    const result = number(value);

    return Number.isInteger(result) &&
      result >= 0
      ? result
      : null;
  }

  function nonNegativeNumber(value) {
    const result = number(value);

    return result !== null &&
      result >= 0
      ? result
      : null;
  }

  function validYear(value) {
    return /^(19|20)\d{2}$/.test(text(value));
  }

  function normalizedZone(value) {
    return text(value)
      .toUpperCase()
      .replace(/А/g, "A")
      .replace(/В/g, "B")
      .replace(/С/g, "C");
  }

  function parseSlot(zoneValue, sectorValue) {
    let zone = normalizedZone(zoneValue);

    let sector = normalizedZone(sectorValue)
      .replace(/[\s_-]+/g, "");

    const combined = sector.match(
      /^([ABC])(\d+)$/
    );

    if (combined) {
      if (
        zone &&
        zone !== combined[1]
      ) {
        return null;
      }

      zone = combined[1];
      sector = combined[2];
    }

    if (
      !/^[ABC]$/.test(zone) ||
      !/^\d+$/.test(sector)
    ) {
      return null;
    }

    const n = Number(sector);

    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > 99
    ) {
      return null;
    }

    return {
      zone,
      sector: n,
      drawKey: `${zone}${n}`
    };
  }

  function normalizeAssignment(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const physical = positiveInteger(
      item.lakeSectorNumber ??
      item.physicalSector ??
      item.lakeSector
    );

    const slot = parseSlot(
      item.zone ?? item.drawZone,
      item.sector ??
      item.drawSector ??
      item.drawKey
    );

    if (
      !VALID_SECTORS.has(physical) ||
      !slot
    ) {
      return null;
    }

    return {
      lakeSectorId: `sector-${physical}`,
      lakeSectorNumber: physical,
      zone: slot.zone,
      sector: slot.sector,
      drawKey: slot.drawKey
    };
  }

  function sortSlots(a, b) {
    const order = {
      A: 0,
      B: 1,
      C: 2
    };

    return (
      (order[a.zone] ?? 9) -
      (order[b.zone] ?? 9) ||
      a.sector - b.sector
    );
  }

  function formatWeight(value) {
    const n = nonNegativeNumber(value);

    return n === null
      ? "—"
      : n.toFixed(3);
  }

  function teamName(row) {
    return text(
      row?.teamName ||
      row?.team ||
      row?.participantName ||
      row?.name
    ) || "—";
  }

  function timestamp() {
    return firebase.firestore.FieldValue
      .serverTimestamp();
  }

  // ==========================================================
  // STATE
  // ==========================================================

  const S = {
    db: null,
    auth: null,

    allowed: false,
    busy: false,
    started: false,

    mode: MODE.ARCHIVE,

    year: "2026",

    stages: [],
    current: null,

    assignments: [],
    empty: [],

    historicalRows: {},

    revision: 0,
    dirty: false,

    sourceHash: "",

    selected: 1,
    zoom: 1,

    historicalIsNew: false,

    drawStarted: false,

    authUnsubscribe: null
  };

  // ==========================================================
  // STATUS
  // ==========================================================

  function message(value, kind = "") {
    const element = $("mapStatus");

    if (element) {
      element.textContent = value;
      element.dataset.kind = kind;
    }

    console.log(
      `[STOLAR CARP MAP ${VERSION}]`,
      value
    );
  }

  function errorText(error) {
    if (
      text(error?.code).includes(
        "permission-denied"
      )
    ) {
      return (
        "Firestore заборонив операцію.\n" +
        "Перевір правила доступу до колекції.\n" +
        `Код: ${error.code}`
      );
    }

    return error?.message || String(error);
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
    ]).finally(() => {
      clearTimeout(timer);
    });
  }

  async function read(ref) {
    return timed(
      ref.get({ source: "server" }),
      `Перевищено час очікування: ${ref.path}`
    );
  }

  async function run(task) {
    if (
      S.busy ||
      !S.allowed
    ) {
      return;
    }

    S.busy = true;

    controls();

    try {
      await task();
    } catch (error) {
      console.error(error);

      message(
        errorText(error),
        "error"
      );
    } finally {
      S.busy = false;
      controls();
    }
  }

  function requireAccess() {
    if (
      !S.allowed ||
      S.auth?.currentUser?.uid !== OWNER_UID
    ) {
      throw new Error(
        "Доступ дозволено тільки адміністратору STOLAR CARP."
      );
    }
  }

  // ==========================================================
  // FIRESTORE REFERENCES
  // ==========================================================

  function mapRef(year, stageDocId) {
    return S.db
      .collection("sectorMaps")
      .doc(String(year))
      .collection("stages")
      .doc(stageDocId);
  }

  function archiveRef(year, stageDocId) {
    return S.db
      .collection("seasonResults")
      .doc(String(year))
      .collection("stages")
      .doc(stageDocId);
  }

  function historicalCollection() {
    return S.db.collection(
      "lakeHistoricalEvents"
    );
  }

  function historicalRef(eventId) {
    return historicalCollection().doc(eventId);
  }

  function historicalSectorRef(
    eventId,
    sector
  ) {
    return historicalRef(eventId)
      .collection("sectors")
      .doc(String(sector));
  }

  // ==========================================================
  // FINGERPRINT
  // ==========================================================

  function canonical(value) {
    if (Array.isArray(value)) {
      return value.map(canonical);
    }

    if (
      value &&
      typeof value === "object"
    ) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(key => [
            key,
            canonical(value[key])
          ])
      );
    }

    return value ?? null;
  }

  async function fingerprint(value) {
    if (!window.crypto?.subtle) {
      throw new Error(
        "Для перевірки архіву потрібен HTTPS."
      );
    }

    const bytes = new TextEncoder().encode(
      JSON.stringify(canonical(value))
    );

    const digest = await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return Array.from(
      new Uint8Array(digest),
      byte => byte.toString(16).padStart(2, "0")
    ).join("");
  }

  // ==========================================================
  // CONTROLS
  // ==========================================================

  function controls() {
    const locked =
      S.busy ||
      !S.allowed;

    const noStage = !S.current;

    const historical =
      S.mode === MODE.HISTORICAL;

    const mapLocked =
      locked ||
      noStage ||
      (
        S.mode === MODE.PREPARE &&
        S.drawStarted
      );

    [
      "loadYear",
      "mapYear",
      "mapStage",
      "loadHistorical",
      "historicalYear",
      "historicalTournament",
      "newHistorical"
    ].forEach(id => {
      setDisabled(id, locked);
    });

    [
      "lakeSector",
      "archiveSlot",
      "manualZone",
      "manualNumber",
      "assignSlot",
      "removeSlot"
    ].forEach(id => {
      setDisabled(id, mapLocked || historical);
    });

    setDisabled(
      "saveMap",
      mapLocked ||
      historical ||
      !S.dirty
    );

    [
      "historicalTitle",
      "historicalOrganizer",
      "historicalLake",
      "historicalStart",
      "historicalEnd",
      "saveHistoricalMeta"
    ].forEach(id => {
      setDisabled(
        id,
        locked ||
        !historical
      );
    });

    [
      "historicalDrawKey",
      "historicalTeam",
      "historicalPlace",
      "historicalWeight",
      "historicalFishCount",
      "historicalParticipation",
      "saveHistoricalResult",
      "clearHistoricalResult"
    ].forEach(id => {
      setDisabled(
        id,
        locked ||
        !historical ||
        noStage ||
        S.historicalIsNew
      );
    });

    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.disabled = locked;
      });

    $("emptySectors")
      ?.querySelectorAll("input")
      .forEach(input => {
        input.disabled =
          mapLocked ||
          historical;
      });
  }

  // ==========================================================
  // MODE UI
  // ==========================================================

  function updateModeUI() {
    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.setAttribute(
          "aria-pressed",
          String(
            button.dataset.mapMode === S.mode
          )
        );
      });

    const prepare =
      S.mode === MODE.PREPARE;

    const archive =
      S.mode === MODE.ARCHIVE;

    const historical =
      S.mode === MODE.HISTORICAL;

    setHidden(
      "stageLoaderSection",
      historical
    );

    setHidden(
      "historicalSection",
      !historical
    );

    setHidden(
      "assignmentSection",
      historical
    );

    setHidden(
      "emptySection",
      historical
    );

    setHidden(
      "historicalResultSection",
      !historical || !S.current
    );

    setHidden(
      "historicalTableSection",
      !historical || !S.current
    );

    setHidden(
      "historicalMetaEditor",
      !historical ||
      (!S.current && !S.historicalIsNew)
    );

    setText(
      "mapYearLabel",
      prepare
        ? "Рік змагань"
        : "Рік архіву"
    );

    setText(
      "mapStageLabel",
      prepare
        ? "Змагання / етап"
        : "Архівний етап"
    );

    setText(
      "currentMapModeBadge",
      prepare
        ? "Підготовка"
        : archive
          ? "Архів"
          : "Історичні"
    );

    const badge = $("currentMapModeBadge");

    if (badge) {
      badge.className =
        "maps-badge " +
        (
          prepare
            ? "maps-badge--green"
            : archive
              ? "maps-badge--blue"
              : "maps-badge--gold"
        );
    }

    setText(
      "mapModeInfo",
      prepare
        ? (
          "ПІДГОТОВКА. Обери майбутні змагання, " +
          "прив'яжи фізичні сектори до зон A/B/C. " +
          "Після початку жеребкування зміни блокуються."
        )
        : archive
          ? (
            "АРХІВ. Обери завершений етап " +
            "STOLAR CARP та прив'яжи його " +
            "результати до секторів водойми."
          )
          : (
            "ІСТОРИЧНІ. Створюй турніри інших " +
            "організаторів і зберігай результати " +
            "окремо для кожного сектора."
          )
    );

    setText(
      "assignmentTitle",
      prepare
        ? "Підготовка розстановки"
        : "Прив'язка сектора"
    );

    setText(
      "mappingTableTitle",
      historical
        ? "Фізичні сектори турніру"
        : "Відповідність секторів"
    );

    setText(
      "saveMap",
      prepare
        ? "💾 Зберегти розстановку"
        : "💾 Зберегти карту етапу"
    );

    setText(
      "mapEditorDescription",
      historical
        ? (
          "Натисни фізичний сектор на карті " +
          "та внеси його результат."
        )
        : (
          "Натисни сектор озера на карті " +
          "або вибери його зі списку."
        )
    );

    controls();
  }

  // ==========================================================
  // RESET
  // ==========================================================

  function resetStage() {
    S.current = null;

    S.assignments = [];
    S.empty = [];

    S.historicalRows = {};

    S.revision = 0;
    S.sourceHash = "";

    S.selected = 1;
    S.zoom = 1;

    S.dirty = false;
    S.drawStarted = false;

    S.historicalIsNew = false;

    setHidden("mapEditor", true);
    setHidden("historicalMetaEditor", true);

    setText("saveState", "");

    controls();
  }

  function mayLeave() {
    return (
      !S.dirty ||
      window.confirm(
        "Є незбережені зміни. Перейти без збереження?"
      )
    );
  }

  function changed() {
    S.dirty = true;

    render();
    selectSector(S.selected);
  }

  // ==========================================================
  // COMPETITIONS
  // ==========================================================

  function yearFromDate(value) {
    if (!value) {
      return "";
    }

    if (typeof value.toDate === "function") {
      return String(
        value.toDate().getFullYear()
      );
    }

    if (value instanceof Date) {
      return String(value.getFullYear());
    }

    const match = text(value).match(
      /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/
    );

    return match?.[1] || "";
  }

  function competitionYear(data, event) {
    const direct =
      number(event?.seasonYear) ??
      number(event?.year) ??
      number(data?.seasonYear) ??
      number(data?.year);

    if (
      Number.isInteger(direct) &&
      direct >= 1990 &&
      direct <= 2100
    ) {
      return String(direct);
    }

    const dates = [
      event?.startDate,
      event?.startAt,
      event?.date,
      data?.startDate,
      data?.startAt,
      data?.date
    ];

    for (const date of dates) {
      const year = yearFromDate(date);

      if (year) {
        return year;
      }
    }

    return "";
  }

  function competitionStages(doc) {
    const data = doc.data() || {};

    const events =
      Array.isArray(data.events) &&
      data.events.length
        ? data.events
        : [{
            key: "main",
            title: "Основний етап"
          }];

    return events.map((event, index) => {
      const stageKey = text(
        event.key ||
        event.stageId ||
        event.id ||
        `stage-${index + 1}`
      );

      const competitionTitle = text(
        data.title ||
        data.name ||
        doc.id
      );

      const eventTitle = text(
        event.title ||
        event.name ||
        stageKey
      );

      const format = text(
        event.format ||
        data.format ||
        data.type
      ).toLowerCase();

      const entryType = text(
        event.entryType ||
        data.entryType ||
        (
          format.includes("solo")
            ? "solo"
            : "team"
        )
      ).toLowerCase();

      return {
        id: `${doc.id}__${stageKey}`,

        title:
          `${competitionTitle} · ${eventTitle}`,

        competitionId: doc.id,
        stageKey,

        competition: data,
        event,

        year: competitionYear(
          data,
          event
        ),

        lakeId: text(
          event.lakeId ||
          data.lakeId ||
          LAKE_ID
        ),

        entryType,
        format
      };
    });
  }

  async function loadPrepareStages(year) {
    const snapshot = await read(
      S.db.collection("competitions")
    );

    const result = [];

    snapshot.docs.forEach(doc => {
      competitionStages(doc).forEach(stage => {
        if (
          stage.year === year &&
          stage.lakeId === LAKE_ID
        ) {
          result.push(stage);
        }
      });
    });

    return result;
  }

  // ==========================================================
  // ARCHIVE STAGES
  // ==========================================================

  async function loadArchiveStages(year) {
    const snapshot = await read(
      S.db
        .collection("seasonResults")
        .doc(year)
        .collection("stages")
    );

    return snapshot.docs
      .map(doc => {
        const data = doc.data() || {};

        return {
          id: doc.id,

          title: text(
            data.stageName ||
            data.title ||
            data.stageId ||
            doc.id
          ),

          lakeId: text(
            data.lakeId ||
            LAKE_ID
          ),

          data
        };
      })
      .filter(
        stage =>
          stage.lakeId === LAKE_ID
      );
  }

  // ==========================================================
  // HISTORICAL STAGES
  // ==========================================================

  async function loadHistoricalStages(year) {
    const snapshot = await read(
      historicalCollection()
        .where("year", "==", year)
    );

    return snapshot.docs
      .map(doc => {
        const data = doc.data() || {};

        return {
          id: doc.id,

          title: text(
            data.title ||
            doc.id
          ),

          lakeId: text(
            data.lakeId ||
            LAKE_ID
          ),

          data
        };
      })
      .filter(
        stage =>
          stage.lakeId === LAKE_ID
      );
  }

  // ==========================================================
  // LOAD YEAR
  // ==========================================================

  async function loadYear() {
    requireAccess();

    const historical =
      S.mode === MODE.HISTORICAL;

    const year = historical
      ? value("historicalYear")
      : value("mapYear");

    if (!validYear(year)) {
      throw new Error(
        "Введи коректний рік."
      );
    }

    message(
      `Завантажую турніри за ${year} рік…`
    );

    let stages;

    if (S.mode === MODE.PREPARE) {
      stages = await loadPrepareStages(year);
    } else if (S.mode === MODE.ARCHIVE) {
      stages = await loadArchiveStages(year);
    } else {
      stages = await loadHistoricalStages(year);
    }

    requireAccess();

    stages.sort((a, b) =>
      a.title.localeCompare(
        b.title,
        "uk",
        { numeric: true }
      )
    );

    resetStage();

    S.year = year;
    S.stages = stages;

    const select = historical
      ? $("historicalTournament")
      : $("mapStage");

    select.innerHTML =
      '<option value="">Обери турнір / етап</option>' +
      stages.map(stage => `
        <option value="${escapeHTML(stage.id)}">
          ${escapeHTML(stage.title)}
        </option>
      `).join("");

    message(
      stages.length
        ? (
          `Знайдено: ${stages.length}. ` +
          "Обери потрібний турнір."
        )
        : (
          "За цей рік записів не знайдено."
        ),
      stages.length ? "ok" : ""
    );
  }

  // ==========================================================
  // ARCHIVE ROWS
  // ==========================================================

  function archiveRows(rows) {
    const slots = new Map();
    const issues = [];

    if (!Array.isArray(rows)) {
      return {
        slots,
        issues: [
          "Архів не містить масиву standings."
        ]
      };
    }

    rows.forEach((row, index) => {
      const slot = parseSlot(
        row?.zone ??
        row?.drawZone,

        row?.sector ??
        row?.drawSector ??
        row?.drawKey
      );

      if (!slot) {
        issues.push(
          `Некоректний сектор у рядку ${index + 1}.`
        );

        return;
      }

      if (slots.has(slot.drawKey)) {
        issues.push(
          `Дублюється ${slot.drawKey}.`
        );

        return;
      }

      slots.set(
        slot.drawKey,
        {
          ...slot,
          row
        }
      );
    });

    return {
      slots,
      issues
    };
  }

  function rowWeight(row) {
    return nonNegativeNumber(
      row?.totalWeight ??
      row?.totalWeightKg ??
      row?.totals?.totalWeightKg ??
      row?.totals?.totalWeight
    );
  }

  function rowCount(row) {
    return nonNegativeInteger(
      row?.totalCount ??
      row?.fishCount ??
      row?.totals?.fishCount ??
      row?.totals?.totalCount
    );
  }

  function hasCatch(row) {
    if (!row) {
      return false;
    }

    const fields = [
      rowWeight(row),
      rowCount(row),
      number(row.bigFish),
      number(row.bigFishKg),
      number(row.carpCount),
      number(row.amurCount)
    ];

    if (
      fields.some(
        n => n !== null && n > 0
      )
    ) {
      return true;
    }

    const weighings =
      row.weighings &&
      typeof row.weighings === "object"
        ? Object.values(row.weighings)
        : [];

    return weighings.some(item => {
      if (!item || typeof item !== "object") {
        return false;
      }

      return [
        item.total,
        item.count,
        item.totalWeightKg,
        item.fishCount
      ].some(
        value => (number(value) || 0) > 0
      );
    });
  }

  // ==========================================================
  // DRAW SAFETY
  // ==========================================================

  function belongsToStage(data, stage) {
    if (
      text(data.competitionId) !==
      stage.competitionId
    ) {
      return false;
    }

    const stageValues = [
      data.stageId,
      data.stageKey,
      data.eventKey,
      data.stageDocId
    ]
      .map(text)
      .filter(Boolean);

    if (!stageValues.length) {
      return stage.stageKey === "main";
    }

    return stageValues.some(
      candidate =>
        candidate === stage.stageKey ||
        candidate === stage.id
    );
  }

  function hasDrawFields(data) {
    const zone = text(
      data.drawZone ??
      data.zone
    );

    const sector =
      data.drawSector ??
      data.sector;

    return Boolean(
      parseSlot(zone, sector)
    );
  }

  async function checkDrawStarted(stage) {
    if (!stage?.competitionId) {
      return false;
    }

    // Серверна перевірка LIVE stageResults.
    const live = await read(
      S.db
        .collection("stageResults")
        .doc(stage.id)
    );

    if (live.exists) {
      return true;
    }

    // Серверна перевірка реєстрацій.
    // Якщо читання заборонено, операція
    // зупиниться, а не пропустить перевірку.

    const registrations = await read(
      S.db
        .collection("registrations")
        .where(
          "competitionId",
          "==",
          stage.competitionId
        )
    );

    for (const doc of registrations.docs) {
      const data = doc.data() || {};

      if (
        belongsToStage(data, stage) &&
        hasDrawFields(data)
      ) {
        return true;
      }
    }

    // Додаткова перевірка дзеркальної колекції.
    const publicRows = await read(
      S.db
        .collection("public_participants")
        .where(
          "competitionId",
          "==",
          stage.competitionId
        )
    );

    for (const doc of publicRows.docs) {
      const data = doc.data() || {};

      if (
        belongsToStage(data, stage) &&
        hasDrawFields(data)
      ) {
        return true;
      }
    }

    return false;
  }

  // ==========================================================
  // LOAD STAGE
  // ==========================================================

  async function loadStage(id) {
    requireAccess();

    const stage = S.stages.find(
      item => item.id === id
    );

    if (!stage) {
      throw new Error(
        "Турнір або етап не знайдено."
      );
    }

    message("Завантажую карту…");

    let saved = null;
    let sourceData = null;
    let rows = [];
    let sourceHash = "";

    if (S.mode === MODE.ARCHIVE) {
      const [source, map] =
        await Promise.all([
          read(
            archiveRef(S.year, id)
          ),
          read(
            mapRef(S.year, id)
          )
        ]);

      if (!source.exists) {
        throw new Error(
          "Архівний етап не знайдено."
        );
      }

      sourceData = source.data() || {};

      rows = sourceData.standings;

      sourceHash = await fingerprint(
        rows ?? null
      );

      saved = map.exists
        ? map.data()
        : null;
    }

    if (S.mode === MODE.PREPARE) {
      const [competition, map] =
        await Promise.all([
          read(
            S.db
              .collection("competitions")
              .doc(stage.competitionId)
          ),
          read(
            mapRef(S.year, id)
          )
        ]);

      if (!competition.exists) {
        throw new Error(
          "Змагання більше не існують."
        );
      }

      sourceData = competition.data() || {};

      saved = map.exists
        ? map.data()
        : null;
    }

    if (S.mode === MODE.HISTORICAL) {
      const [event, sectors] =
        await Promise.all([
          read(
            historicalRef(id)
          ),
          read(
            historicalRef(id)
              .collection("sectors")
          )
        ]);

      if (!event.exists) {
        throw new Error(
          "Історичний турнір не знайдено."
        );
      }

      saved = event.data() || {};
      sourceData = saved;

      rows = sectors.docs.map(doc => ({
        ...doc.data(),
        lakeSectorNumber:
          Number(doc.id)
      }));
    }

    if (
      saved?.lakeId &&
      saved.lakeId !== LAKE_ID
    ) {
      throw new Error(
        "Запис належить іншій водоймі."
      );
    }

    if (
      saved &&
      S.mode !== MODE.HISTORICAL
    ) {
      if (
        text(saved.seasonYear) !== S.year ||
        saved.stageDocId !== id ||
        Number(saved.schemaVersion) !== 1
      ) {
        throw new Error(
          "Збережена карта має несумісну схему."
        );
      }
    }

    const assignments = [];

    if (
      S.mode !== MODE.HISTORICAL &&
      Array.isArray(saved?.assignments)
    ) {
      saved.assignments.forEach(
        (item, index) => {
          const normalized =
            normalizeAssignment(item);

          if (!normalized) {
            throw new Error(
              `Некоректна прив'язка №${index + 1}.`
            );
          }

          assignments.push(normalized);
        }
      );
    }

    const empty =
      S.mode !== MODE.HISTORICAL &&
      Array.isArray(saved?.emptyLakeSectors)
        ? saved.emptyLakeSectors.map(Number)
        : [];

    if (
      empty.some(
        sector =>
          !VALID_SECTORS.has(sector)
      )
    ) {
      throw new Error(
        "Некоректні порожні сектори."
      );
    }

    const historicalRows = {};

    if (S.mode === MODE.HISTORICAL) {
      rows.forEach(row => {
        const sector = positiveInteger(
          row.lakeSectorNumber
        );

        if (!VALID_SECTORS.has(sector)) {
          throw new Error(
            "Некоректний фізичний сектор в історичних результатах."
          );
        }

        historicalRows[sector] = row;
      });
    }

    let drawStarted = false;

    if (S.mode === MODE.PREPARE) {
      drawStarted = await checkDrawStarted(
        stage
      );
    }

    S.current = {
      ...stage,
      data: sourceData,
      rows
    };

    S.assignments = assignments;
    S.empty = [...new Set(empty)];

    S.historicalRows = historicalRows;

    S.revision = Number(
      saved?.revision || 0
    );

    S.sourceHash = sourceHash;

    S.drawStarted = drawStarted;

    S.selected = 1;
    S.zoom = 1;
    S.dirty = false;

    S.historicalIsNew = false;

    setText(
      "selectedStageTitle",
      `${S.year} · ${stage.title}`
    );

    setHidden("mapEditor", false);

    if (S.mode === MODE.HISTORICAL) {
      fillHistoricalMeta(saved);
    }

    updateModeUI();

    render();
    selectSector(1);

    requestAnimationFrame(resizeMap);

    if (drawStarted) {
      message(
        "Жеребкування вже почалося. " +
        "Карту можна переглядати, але змінювати не можна.",
        "error"
      );

      return;
    }

    if (
      S.mode === MODE.ARCHIVE &&
      saved?.sourceSignature &&
      saved.sourceSignature !== sourceHash
    ) {
      message(
        "Архівні результати змінилися. " +
        "Перевір прив'язки перед збереженням.",
        "error"
      );

      return;
    }

    message(
      saved
        ? (
          "Карту завантажено. " +
          `Статус: ${saved.status || "невідомий"}.`
        )
        : (
          "Нова карта. Можна починати."
        ),
      "ok"
    );
  }

  // ==========================================================
  // PREPARE EXPECTED SLOTS
  // ==========================================================

  function expectedPrepareSlots() {
    if (
      S.mode !== MODE.PREPARE ||
      !S.current
    ) {
      return null;
    }

    const event = S.current.event || {};
    const competition =
      S.current.competition || {};

    // Підтримуємо явно задані позначення.
    const explicit =
      event.drawSlots ||
      event.sectorSlots ||
      competition.drawSlots ||
      competition.sectorSlots;

    if (
      Array.isArray(explicit) &&
      explicit.length
    ) {
      const result = new Set();

      for (const item of explicit) {
        const slot =
          typeof item === "string"
            ? parseSlot("", item)
            : parseSlot(
                item?.zone,
                item?.sector ??
                item?.drawKey
              );

        if (!slot) {
          return null;
        }

        result.add(slot.drawKey);
      }

      return result;
    }

    // Кількість секторів за зонами.
    const zoneCounts =
      event.zoneSectorCounts ||
      event.sectorsByZone ||
      competition.zoneSectorCounts ||
      competition.sectorsByZone;

    if (
      zoneCounts &&
      typeof zoneCounts === "object"
    ) {
      const result = new Set();

      for (const zone of ["A", "B", "C"]) {
        const count = nonNegativeInteger(
          zoneCounts[zone]
        );

        if (count === null) {
          return null;
        }

        for (
          let sector = 1;
          sector <= count;
          sector++
        ) {
          result.add(
            `${zone}${sector}`
          );
        }
      }

      return result.size
        ? result
        : null;
    }

    return null;
  }

  // ==========================================================
  // MAP VALIDATION
  // ==========================================================

  function inspectMap() {
    const errors = [];
    const incomplete = [];

    const physical = new Set();
    const drawKeys = new Set();

    const source =
      S.mode === MODE.ARCHIVE
        ? archiveRows(
            S.current?.rows
          )
        : null;

    if (source) {
      incomplete.push(...source.issues);
    }

    for (const assignment of S.assignments) {
      const sector =
        assignment.lakeSectorNumber;

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
          `Повторюється фізичний сектор №${sector}.`
        );
      }

      if (drawKeys.has(slot.drawKey)) {
        errors.push(
          `Повторюється ${slot.drawKey}.`
        );
      }

      physical.add(sector);
      drawKeys.add(slot.drawKey);

      if (source) {
        const row = source.slots.get(
          slot.drawKey
        )?.row;

        if (
          !row &&
          !S.empty.includes(sector)
        ) {
          incomplete.push(
            `${slot.drawKey}: немає результату.`
          );
        }

        if (
          row &&
          !S.empty.includes(sector) &&
          (
            rowWeight(row) === null ||
            rowCount(row) === null
          )
        ) {
          incomplete.push(
            `${slot.drawKey}: бракує ваги або кількості риб.`
          );
        }

        if (
          S.empty.includes(sector) &&
          hasCatch(row)
        ) {
          errors.push(
            `${slot.drawKey}: є улов, але сектор позначений порожнім.`
          );
        }
      }
    }

    for (const sector of S.empty) {
      if (!physical.has(sector)) {
        errors.push(
          `Порожній сектор №${sector} не прив'язаний.`
        );
      }
    }

    if (!S.assignments.length) {
      incomplete.push(
        "Немає прив'язок."
      );
    }

    if (source) {
      const missing = [
        ...source.slots.keys()
      ].filter(
        key => !drawKeys.has(key)
      );

      if (missing.length) {
        incomplete.push(
          `Не прив'язано: ${missing.join(", ")}.`
        );
      }
    }

    if (S.mode === MODE.PREPARE) {
      const expected =
        expectedPrepareSlots();

      if (!expected) {
        incomplete.push(
          "Не задано конфігурацію секторів етапу. " +
          "Повноту підготовки не можна підтвердити."
        );
      } else {
        const missing = [
          ...expected
        ].filter(
          key => !drawKeys.has(key)
        );

        const extra = [
          ...drawKeys
        ].filter(
          key => !expected.has(key)
        );

        if (missing.length) {
          incomplete.push(
            `Не розставлено: ${missing.join(", ")}.`
          );
        }

        if (extra.length) {
          errors.push(
            `Зайві позначення: ${extra.join(", ")}.`
          );
        }
      }
    }

    return {
      errors,
      incomplete,

      ready:
        errors.length === 0 &&
        incomplete.length === 0,

      selected: S.assignments.length,
      empty: S.empty.length,

      included:
        S.assignments.length -
        S.empty.length
    };
  }

  // ==========================================================
  // SLOT OPTIONS
  // ==========================================================

  function availableSlots() {
    if (
      S.mode === MODE.ARCHIVE
    ) {
      return [
        ...archiveRows(
          S.current.rows
        ).slots.values()
      ].sort(sortSlots);
    }

    const expected =
      expectedPrepareSlots();

    if (expected) {
      return [...expected]
        .map(key => parseSlot("", key))
        .filter(Boolean)
        .sort(sortSlots);
    }

    const slots = [];

    for (const zone of ["A", "B", "C"]) {
      for (
        let sector = 1;
        sector <= SECTOR_COUNT;
        sector++
      ) {
        slots.push({
          zone,
          sector,
          drawKey: `${zone}${sector}`
        });
      }
    }

    return slots;
  }

  function assignmentFor(sector) {
    return S.assignments.find(
      item =>
        item.lakeSectorNumber === sector
    ) || null;
  }

  function rowForAssignment(assignment) {
    if (!assignment) {
      return null;
    }

    if (
      S.mode === MODE.ARCHIVE
    ) {
      return archiveRows(
        S.current.rows
      ).slots.get(
        assignment.drawKey
      )?.row || null;
    }

    return null;
  }

  function resultText(row) {
    if (!row) {
      return "—";
    }

    const weight = rowWeight(row);
    const count = rowCount(row);

    const place = positiveInteger(
      row.place ??
      row.zonePlace ??
      row.overallPlace
    );

    const result =
      `${formatWeight(weight)} кг · ` +
      `${count ?? "—"} риб`;

    return place
      ? `${place} місце · ${result}`
      : result;
  }

  // ==========================================================
  // RENDER PINS
  // ==========================================================

  function renderPins() {
    const pins = $("mapPins");

    if (!pins) {
      return;
    }

    pins.innerHTML = POINTS.map(
      ([sector, x, y]) => {
        const assignment =
          assignmentFor(sector);

        const historical =
          S.historicalRows[sector];

        const empty =
          S.mode === MODE.HISTORICAL
            ? historical?.participation === "empty"
            : S.empty.includes(sector);

        let drawKey =
          assignment?.drawKey || "";

        if (
          S.mode === MODE.HISTORICAL
        ) {
          drawKey = text(
            historical?.drawKey
          );
        }

        const zone =
          S.mode === MODE.HISTORICAL
            ? parseSlot(
                "",
                drawKey
              )?.zone || ""
            : assignment?.zone || "";

        return `
          <button
            type="button"
            class="map-pin"
            data-lake="${sector}"
            data-zone="${escapeHTML(zone)}"
            data-empty="${Boolean(empty)}"
            aria-pressed="${sector === S.selected}"
            aria-label="Фізичний сектор №${sector}"
            style="left:${x}%;top:${y}%"
          >
            <span>${sector}</span>
            <small>${escapeHTML(
              drawKey +
              (empty ? " ×" : "")
            )}</small>
          </button>
        `;
      }
    ).join("");

    pins
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            if (!S.busy) {
              selectSector(
                Number(
                  button.dataset.lake
                )
              );
            }
          }
        );
      });
  }

  // ==========================================================
  // RENDER TABLE
  // ==========================================================

  function renderMappingTable() {
    const body = $("mappingRows");

    if (!body) {
      return;
    }

    if (
      S.mode === MODE.HISTORICAL
    ) {
      body.innerHTML = POINTS.map(
        ([sector]) => {
          const row =
            S.historicalRows[sector];

          const participation =
            row?.participation ||
            "unknown";

          return `
            <tr>
              <td>№${sector}</td>
              <td>${escapeHTML(
                row?.drawKey || "—"
              )}</td>
              <td>${escapeHTML(
                row?.teamName || "—"
              )}</td>
              <td>${escapeHTML(
                participation === "fished"
                  ? resultText(row)
                  : "—"
              )}</td>
              <td>${
                participation === "fished"
                  ? "Ловили"
                  : participation === "empty"
                    ? "Пустував"
                    : "Немає даних"
              }</td>
            </tr>
          `;
        }
      ).join("");

      return;
    }

    const ordered = [
      ...S.assignments
    ].sort(
      (a, b) =>
        a.lakeSectorNumber -
        b.lakeSectorNumber
    );

    body.innerHTML =
      ordered.map(assignment => {
        const sector =
          assignment.lakeSectorNumber;

        const row =
          rowForAssignment(assignment);

        return `
          <tr>
            <td>№${sector}</td>
            <td>${escapeHTML(
              assignment.drawKey
            )}</td>
            <td>${escapeHTML(
              teamName(row)
            )}</td>
            <td>${escapeHTML(
              resultText(row)
            )}</td>
            <td>${
              S.empty.includes(sector)
                ? "Пустував"
                : "Ловили"
            }</td>
          </tr>
        `;
      }).join("") ||
      `
        <tr>
          <td colspan="5">
            Ще немає прив'язок.
          </td>
        </tr>
      `;
  }

  // ==========================================================
  // RENDER EMPTY
  // ==========================================================

  function renderEmpty() {
    const container =
      $("emptySectors");

    if (!container) {
      return;
    }

    const ordered = [
      ...S.assignments
    ].sort(
      (a, b) =>
        a.lakeSectorNumber -
        b.lakeSectorNumber
    );

    container.innerHTML =
      ordered.map(assignment => {
        const sector =
          assignment.lakeSectorNumber;

        return `
          <label class="maps-check">
            <input
              type="checkbox"
              data-empty-sector="${sector}"
              ${
                S.empty.includes(sector)
                  ? "checked"
                  : ""
              }
            >

            <span>
              ${escapeHTML(
                assignment.drawKey
              )}
              · озеро №${sector}
            </span>
          </label>
        `;
      }).join("") ||
      '<p class="maps-muted">Немає секторів.</p>';

    container
      .querySelectorAll(
        "[data-empty-sector]"
      )
      .forEach(input => {
        input.addEventListener(
          "change",
          () => {
            if (
              S.busy ||
              S.drawStarted
            ) {
              render();
              return;
            }

            const sector = Number(
              input.dataset.emptySector
            );

            const assignment =
              assignmentFor(sector);

            if (
              input.checked &&
              S.mode === MODE.ARCHIVE &&
              hasCatch(
                rowForAssignment(
                  assignment
                )
              )
            ) {
              input.checked = false;

              message(
                "Сектор має улов. " +
                "Позначити його порожнім не можна.",
                "error"
              );

              return;
            }

            S.empty = input.checked
              ? [
                  ...new Set([
                    ...S.empty,
                    sector
                  ])
                ]
              : S.empty.filter(
                  item =>
                    item !== sector
                );

            changed();
          }
        );
      });
  }

  // ==========================================================
  // RENDER HISTORICAL TABLE
  // ==========================================================

  function renderHistoricalTable() {
    const body =
      $("historicalResultsRows");

    if (!body) {
      return;
    }

    const rows = Object.values(
      S.historicalRows
    ).sort(
      (a, b) =>
        a.lakeSectorNumber -
        b.lakeSectorNumber
    );

    body.innerHTML =
      rows.map(row => {
        const fished =
          row.participation === "fished";

        return `
          <tr>
            <td>№${row.lakeSectorNumber}</td>
            <td>${escapeHTML(
              row.drawKey || "—"
            )}</td>
            <td>${escapeHTML(
              fished
                ? row.teamName
                : row.participation === "empty"
                  ? "Пустував"
                  : "Немає даних"
            )}</td>
            <td>${
              fished
                ? escapeHTML(row.place)
                : "—"
            }</td>
            <td>${
              fished
                ? formatWeight(
                    row.totalWeight
                  )
                : "—"
            }</td>
            <td>${
              fished
                ? escapeHTML(
                    row.totalCount
                  )
                : "—"
            }</td>
          </tr>
        `;
      }).join("") ||
      `
        <tr>
          <td colspan="6">
            Ще немає результатів.
          </td>
        </tr>
      `;

    const fished = rows.filter(
      row =>
        row.participation === "fished"
    );

    const totalWeight = fished.reduce(
      (sum, row) =>
        sum +
        (number(row.totalWeight) || 0),
      0
    );

    const totalCount = fished.reduce(
      (sum, row) =>
        sum +
        (number(row.totalCount) || 0),
      0
    );

    const empty = rows.filter(
      row =>
        row.participation === "empty"
    ).length;

    setText(
      "historicalTotals",
      `Внесено секторів: ${rows.length}/26\n` +
      `Ловили: ${fished.length}\n` +
      `Пустували: ${empty}\n` +
      `Загальна вага: ${totalWeight.toFixed(3)} кг\n` +
      `Кількість риб: ${totalCount}`
    );
  }

  // ==========================================================
  // MAIN RENDER
  // ==========================================================

  function render() {
    if (!S.current) {
      return;
    }

    renderPins();
    renderMappingTable();

    if (
      S.mode === MODE.HISTORICAL
    ) {
      renderHistoricalTable();

      setText(
        "mapSummary",
        `Історичних записів: ${
          Object.keys(
            S.historicalRows
          ).length
        }`
      );
    } else {
      renderEmpty();

      const check = inspectMap();

      setText(
        "mapSummary",
        `У розстановці: ${check.selected}\n` +
        `Пустували: ${check.empty}\n` +
        `Ловили: ${check.included}`
      );

      setText(
        "mapCoverage",
        check.ready
          ? "Карта повністю перевірена."
          : [
              ...check.errors,
              ...check.incomplete
            ].join("\n")
      );
    }

    setText(
      "saveState",
      S.dirty
        ? "Є незбережені зміни"
        : S.revision
          ? "Збережено"
          : "Ще не збережено"
    );

    controls();
  }

  // ==========================================================
  // SELECT SECTOR
  // ==========================================================

  function selectSector(sector) {
    if (
      !S.current ||
      !VALID_SECTORS.has(sector)
    ) {
      return;
    }

    S.selected = sector;

    $("lakeSector").value =
      String(sector);

    $("mapPins")
      ?.querySelectorAll("[data-lake]")
      .forEach(button => {
        button.setAttribute(
          "aria-pressed",
          String(
            Number(
              button.dataset.lake
            ) === sector
          )
        );
      });

    if (
      S.mode === MODE.HISTORICAL
    ) {
      loadHistoricalEditor(sector);
      controls();
      return;
    }

    const assignment =
      assignmentFor(sector);

    const used = new Set(
      S.assignments
        .filter(
          item =>
            item.lakeSectorNumber !== sector
        )
        .map(item => item.drawKey)
    );

    const slots = availableSlots();

    $("archiveSlot").innerHTML =
      '<option value="">Обери позначення</option>' +
      slots.map(slot => `
        <option
          value="${escapeHTML(
            slot.drawKey
          )}"
          ${
            used.has(slot.drawKey)
              ? "disabled"
              : ""
          }
        >
          ${escapeHTML(
            slot.drawKey
          )}
        </option>
      `).join("") +
      `
        <option value="manual">
          Ввести вручну…
        </option>
      `;

    if (assignment) {
      $("archiveSlot").value =
        slots.some(
          slot =>
            slot.drawKey ===
            assignment.drawKey
        )
          ? assignment.drawKey
          : "manual";
    } else {
      $("archiveSlot").value = "";
    }

    $("manualZone").value =
      assignment?.zone || "A";

    $("manualNumber").value =
      assignment?.sector || 1;

    preview();
    controls();
  }

  // ==========================================================
  // SLOT PREVIEW
  // ==========================================================

  function chosenSlot() {
    if (
      value("archiveSlot") === "manual"
    ) {
      return parseSlot(
        value("manualZone"),
        value("manualNumber")
      );
    }

    return parseSlot(
      "",
      value("archiveSlot")
    );
  }

  function preview() {
    if (
      !S.current ||
      S.mode === MODE.HISTORICAL
    ) {
      return;
    }

    setHidden(
      "manualSlot",
      value("archiveSlot") !== "manual"
    );

    const slot = chosenSlot();

    if (!slot) {
      setText(
        "slotPreview",
        "Обери позначення."
      );

      return;
    }

    const row =
      S.mode === MODE.ARCHIVE
        ? archiveRows(
            S.current.rows
          ).slots.get(
            slot.drawKey
          )?.row
        : null;

    setText(
      "slotPreview",
      `Озеро №${S.selected} → ${slot.drawKey}\n` +
      (
        row
          ? (
            `${teamName(row)}\n` +
            resultText(row)
          )
          : "Результат ще не внесено."
      )
    );
  }

  // ==========================================================
  // ASSIGN
  // ==========================================================

  function assign() {
    if (
      !S.current ||
      S.busy ||
      !S.allowed ||
      S.drawStarted ||
      S.mode === MODE.HISTORICAL
    ) {
      return;
    }

    const slot = chosenSlot();

    if (!slot) {
      message(
        "Обери правильне позначення.",
        "error"
      );

      return;
    }

    if (
      S.mode === MODE.ARCHIVE
    ) {
      const source = archiveRows(
        S.current.rows
      );

      if (
        !source.slots.has(
          slot.drawKey
        )
      ) {
        message(
          "Такого сектора немає в архіві.",
          "error"
        );

        return;
      }
    }

    const collision =
      S.assignments.find(
        item =>
          item.drawKey === slot.drawKey &&
          item.lakeSectorNumber !==
            S.selected
      );

    if (collision) {
      message(
        `${slot.drawKey} вже використовується.`,
        "error"
      );

      return;
    }

    const previous =
      assignmentFor(S.selected);

    S.assignments =
      S.assignments.filter(
        item =>
          item.lakeSectorNumber !==
          S.selected
      );

    S.assignments.push({
      lakeSectorId:
        `sector-${S.selected}`,

      lakeSectorNumber:
        S.selected,

      zone: slot.zone,
      sector: slot.sector,
      drawKey: slot.drawKey
    });

    if (
      previous?.drawKey !==
      slot.drawKey
    ) {
      S.empty = S.empty.filter(
        sector =>
          sector !== S.selected
      );
    }

    changed();

    message(
      `Озеро №${S.selected} → ${slot.drawKey}.`,
      "ok"
    );
  }

  function removeAssignment() {
    if (
      !S.current ||
      S.busy ||
      S.drawStarted ||
      S.mode === MODE.HISTORICAL
    ) {
      return;
    }

    S.assignments =
      S.assignments.filter(
        item =>
          item.lakeSectorNumber !==
          S.selected
      );

    S.empty = S.empty.filter(
      sector =>
        sector !== S.selected
    );

    changed();
  }

  // ==========================================================
  // SAVE PREPARE / ARCHIVE
  // ==========================================================

  async function saveSectorMap() {
    requireAccess();

    if (
      !S.current ||
      S.mode === MODE.HISTORICAL
    ) {
      throw new Error(
        "Не обрано карту етапу."
      );
    }

    const check = inspectMap();

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const year = S.year;
    const id = S.current.id;

    const prepare =
      S.mode === MODE.PREPARE;

    if (prepare) {
      const started =
        await checkDrawStarted(
          S.current
        );

      if (started) {
        S.drawStarted = true;

        throw new Error(
          "Жеребкування вже почалося. " +
          "Збереження розстановки заблоковано."
        );
      }
    }

    const expectedRevision =
      S.revision;

    const assignments =
      S.assignments
        .map(item => ({
          lakeSectorId:
            `sector-${item.lakeSectorNumber}`,

          lakeSectorNumber:
            item.lakeSectorNumber,

          zone: item.zone,
          sector: item.sector,
          drawKey: item.drawKey
        }))
        .sort(
          (a, b) =>
            a.lakeSectorNumber -
            b.lakeSectorNumber
        );

    const emptyLakeSectors = [
      ...new Set(S.empty)
    ].sort(
      (a, b) => a - b
    );

    const ref = mapRef(year, id);

    const sourceRef = prepare
      ? S.db
          .collection("competitions")
          .doc(
            S.current.competitionId
          )
      : archiveRef(year, id);

    await timed(
      S.db.runTransaction(
        async transaction => {
          const source =
            await transaction.get(
              sourceRef
            );

          const saved =
            await transaction.get(
              ref
            );

          requireAccess();

          if (!source.exists) {
            throw new Error(
              "Джерело етапу більше не існує."
            );
          }

          if (!prepare) {
            const actualHash =
              await fingerprint(
                source.data()
                  .standings ?? null
              );

            if (
              actualHash !==
              S.sourceHash
            ) {
              throw new Error(
                "Архів змінився. Перезавантаж етап."
              );
            }
          } else {
            const stages =
              competitionStages({
                id:
                  S.current.competitionId,

                data: () =>
                  source.data()
              });

            const exists =
              stages.some(
                stage =>
                  stage.id === id &&
                  stage.year === year &&
                  stage.lakeId === LAKE_ID
              );

            if (!exists) {
              throw new Error(
                "Конфігурація змагань змінилася."
              );
            }
          }

          const old = saved.exists
            ? saved.data()
            : null;

          if (
            Number(
              old?.revision || 0
            ) !== expectedRevision
          ) {
            throw new Error(
              "Карту змінили в іншій вкладці. " +
              "Перезавантаж її."
            );
          }

          if (old) {
            if (
              old.lakeId !== LAKE_ID ||
              old.stageDocId !== id ||
              text(
                old.seasonYear
              ) !== year
            ) {
              throw new Error(
                "Існуюча карта належить іншому етапу."
              );
            }

            const oldSource =
              text(old.sourcePath);

            if (
              prepare &&
              (
                oldSource.startsWith(
                  "seasonResults/"
                ) ||
                oldSource.startsWith(
                  "oneoffResults/"
                )
              )
            ) {
              throw new Error(
                "Це архівна карта. " +
                "Режим підготовки не може її перезаписати."
              );
            }

            if (
              !prepare &&
              oldSource.startsWith(
                "competitions/"
              ) &&
              old.status === "prepared"
            ) {
              throw new Error(
                "Карта підготовки ще має статус prepared. " +
                "Перевір завершення етапу."
              );
            }
          }

          const stamp = timestamp();

          const payload = {
            schemaVersion: 1,

            lakeId: LAKE_ID,
            mapVersion: 1,

            seasonYear: year,
            stageDocId: id,

            stageTitle:
              S.current.title,

            assignments,
            emptyLakeSectors,

            status: prepare
              ? (
                check.ready
                  ? "prepared"
                  : "draft"
              )
              : (
                check.ready
                  ? "ready"
                  : "draft"
              ),

            revision:
              expectedRevision + 1,

            createdAt:
              old?.createdAt || stamp,

            createdBy:
              old?.createdBy || OWNER_UID,

            updatedAt: stamp,
            updatedBy: OWNER_UID
          };

          if (prepare) {
            payload.sourcePath =
              `competitions/${S.current.competitionId}`;

            payload.competitionId =
              S.current.competitionId;

            payload.stageKey =
              S.current.stageKey;

            payload.entryType =
              S.current.entryType ||
              "team";

            payload.format =
              S.current.format || "";

            payload.sourceSignature =
              "";
          } else {
            payload.sourcePath =
              `seasonResults/${year}/stages/${id}`;

            payload.sourceSignature =
              S.sourceHash;
          }

          transaction.set(
            ref,
            payload
          );
        }
      ),

      "Не вдалося зберегти карту."
    );

    S.revision =
      expectedRevision + 1;

    S.dirty = false;

    render();

    const status = prepare
      ? (
        check.ready
          ? "prepared"
          : "draft"
      )
      : (
        check.ready
          ? "ready"
          : "draft"
      );

    message(
      `Карту збережено. Статус: ${status}.`,
      "ok"
    );
  }

  // ==========================================================
  // HISTORICAL METADATA
  // ==========================================================

  function fillHistoricalMeta(data = {}) {
    $("historicalTitle").value =
      data.title || "";

    $("historicalOrganizer").value =
      data.organizer || "";

    $("historicalLake").value =
      LAKE_ID;

    $("historicalStart").value =
      data.startDate || "";

    $("historicalEnd").value =
      data.endDate || "";

    setHidden(
      "historicalMetaEditor",
      false
    );
  }

  function validateHistoricalMeta() {
    const title =
      value("historicalTitle");

    const organizer =
      value("historicalOrganizer");

    const lakeId =
      value("historicalLake");

    const startDate =
      value("historicalStart");

    const endDate =
      value("historicalEnd");

    if (!title) {
      throw new Error(
        "Введи назву турніру."
      );
    }

    if (lakeId !== LAKE_ID) {
      throw new Error(
        "Підтримується тільки Лелехівка."
      );
    }

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      throw new Error(
        "Дата завершення раніше дати початку."
      );
    }

    if (
      startDate &&
      startDate.slice(0, 4) !==
        S.year
    ) {
      throw new Error(
        "Рік дати початку не збігається з роком турніру."
      );
    }

    return {
      year: S.year,
      title,
      organizer,
      lakeId,
      startDate,
      endDate
    };
  }

  function newHistorical() {
    if (
      S.mode !== MODE.HISTORICAL ||
      S.busy
    ) {
      return;
    }

    if (!mayLeave()) {
      return;
    }

    resetStage();

    S.historicalIsNew = true;

    $("historicalTournament").value = "";

    fillHistoricalMeta({
      title: "",
      organizer: "",
      startDate: "",
      endDate: ""
    });

    message(
      "Заповни інформацію про новий турнір."
    );

    controls();
  }

  async function saveHistoricalMeta() {
    requireAccess();

    if (
      S.mode !== MODE.HISTORICAL
    ) {
      throw new Error(
        "Ця дія доступна тільки в історичному режимі."
      );
    }

    const data =
      validateHistoricalMeta();

    if (
      S.historicalIsNew ||
      !S.current
    ) {
      const ref =
        historicalCollection().doc();

      await timed(
        ref.set({
          schemaVersion: 1,

          ...data,

          revision: 1,

          createdAt: timestamp(),
          createdBy: OWNER_UID,

          updatedAt: timestamp(),
          updatedBy: OWNER_UID
        }),

        "Не вдалося створити турнір."
      );

      const newId = ref.id;

      S.historicalIsNew = false;

      await loadYear();

      $("historicalTournament").value =
        newId;

      // Після loadYear список міг бути
      // перезавантажений до появи документа
      // в запиті. Додаємо його локально.
      if (
        !S.stages.some(
          stage =>
            stage.id === newId
        )
      ) {
        S.stages.push({
          id: newId,
          title: data.title,
          lakeId: LAKE_ID,
          data
        });

        $("historicalTournament")
          .add(
            new Option(
              data.title,
              newId
            )
          );

        $("historicalTournament").value =
          newId;
      }

      await loadStage(newId);

      message(
        "Історичний турнір створено.",
        "ok"
      );

      return;
    }

    const ref =
      historicalRef(
        S.current.id
      );

    const expectedRevision =
      S.revision;

    await timed(
      S.db.runTransaction(
        async transaction => {
          const snapshot =
            await transaction.get(
              ref
            );

          if (!snapshot.exists) {
            throw new Error(
              "Турнір не знайдено."
            );
          }

          const old =
            snapshot.data();

          if (
            Number(
              old.revision || 0
            ) !== expectedRevision
          ) {
            throw new Error(
              "Турнір змінено в іншій вкладці."
            );
          }

          transaction.update(
            ref,
            {
              ...data,

              revision:
                expectedRevision + 1,

              updatedAt: timestamp(),
              updatedBy: OWNER_UID
            }
          );
        }
      ),

      "Не вдалося оновити турнір."
    );

    S.revision =
      expectedRevision + 1;

    S.current.title =
      data.title;

    setText(
      "selectedStageTitle",
      `${S.year} · ${data.title}`
    );

    message(
      "Інформацію про турнір збережено.",
      "ok"
    );
  }

  // ==========================================================
  // HISTORICAL RESULT EDITOR
  // ==========================================================

  function loadHistoricalEditor(sector) {
    const row =
      S.historicalRows[sector] || {};

    $("historicalSectorNumber").value =
      sector;

    $("historicalDrawKey").value =
      row.drawKey || "";

    $("historicalTeam").value =
      row.teamName || "";

    $("historicalPlace").value =
      row.place ?? "";

    $("historicalWeight").value =
      row.totalWeight ?? "";

    $("historicalFishCount").value =
      row.totalCount ?? "";

    $("historicalParticipation").value =
      row.participation ||
      "unknown";

    setText(
      "historicalResultStatus",
      row.lakeSectorNumber
        ? "Результат завантажено."
        : "Для цього сектора ще немає запису."
    );

    updateHistoricalForm();
  }

  function updateHistoricalForm() {
    const participation =
      value("historicalParticipation");

    const fished =
      participation === "fished";

    [
      "historicalTeam",
      "historicalPlace",
      "historicalWeight",
      "historicalFishCount"
    ].forEach(id => {
      setDisabled(
        id,
        !fished ||
        S.busy ||
        !S.allowed ||
        !S.current
      );
    });
  }

  function historicalResultData() {
    const sector =
      S.selected;

    const participation =
      value("historicalParticipation");

    if (
      ![
        "fished",
        "empty",
        "unknown"
      ].includes(participation)
    ) {
      throw new Error(
        "Некоректний статус участі."
      );
    }

    const rawDrawKey =
      value("historicalDrawKey");

    let drawKey = "";

    if (rawDrawKey) {
      const slot = parseSlot(
        "",
        rawDrawKey
      );

      if (!slot) {
        throw new Error(
          "Позначення має бути A1, B2, C3 тощо."
        );
      }

      drawKey = slot.drawKey;
    }

    const base = {
      lakeSectorNumber: sector,
      drawKey,
      participation
    };

    if (
      participation !== "fished"
    ) {
      return {
        ...base,

        teamName: "",
        place: null,
        totalWeight: null,
        totalCount: null
      };
    }

    const teamName =
      value("historicalTeam");

    const place =
      positiveInteger(
        value("historicalPlace")
      );

    const totalWeight =
      nonNegativeNumber(
        value("historicalWeight")
      );

    const totalCount =
      nonNegativeInteger(
        value("historicalFishCount")
      );

    if (!teamName) {
      throw new Error(
        "Введи назву команди."
      );
    }

    if (!place) {
      throw new Error(
        "Місце має бути цілим числом від 1."
      );
    }

    if (totalWeight === null) {
      throw new Error(
        "Введи коректну загальну вагу."
      );
    }

    if (totalCount === null) {
      throw new Error(
        "Кількість риб має бути цілим числом від 0."
      );
    }

    if (
      totalCount === 0 &&
      totalWeight > 0
    ) {
      throw new Error(
        "При нульовій кількості риб вага має бути нульовою."
      );
    }

    if (
      totalCount > 0 &&
      totalWeight === 0
    ) {
      throw new Error(
        "Якщо риба є, вага має бути більшою за нуль."
      );
    }

    return {
      ...base,

      teamName,
      place,

      totalWeight:
        Number(
          totalWeight.toFixed(3)
        ),

      totalCount
    };
  }

  // ==========================================================
  // SAVE HISTORICAL RESULT
  // ==========================================================

  async function saveHistoricalResult() {
    requireAccess();

    if (
      S.mode !== MODE.HISTORICAL ||
      !S.current
    ) {
      throw new Error(
        "Спочатку відкрий історичний турнір."
      );
    }

    const data =
      historicalResultData();

    // Одне турнірне позначення
    // не може належати двом секторам.
    if (data.drawKey) {
      const collision =
        Object.values(
          S.historicalRows
        ).find(
          row =>
            row.drawKey === data.drawKey &&
            row.lakeSectorNumber !==
              data.lakeSectorNumber
        );

      if (collision) {
        throw new Error(
          `${data.drawKey} вже використовується ` +
          `у секторі №${collision.lakeSectorNumber}.`
        );
      }
    }

    const ref =
      historicalSectorRef(
        S.current.id,
        S.selected
      );

    const old =
      S.historicalRows[
        S.selected
      ];

    const expectedRevision =
      Number(
        old?.revision || 0
      );

    await timed(
      S.db.runTransaction(
        async transaction => {
          const snapshot =
            await transaction.get(
              ref
            );

          const existing =
            snapshot.exists
              ? snapshot.data()
              : null;

          if (
            Number(
              existing?.revision || 0
            ) !== expectedRevision
          ) {
            throw new Error(
              "Результат сектора змінено " +
              "в іншій вкладці. Перезавантаж турнір."
            );
          }

          transaction.set(
            ref,
            {
              schemaVersion: 1,

              ...data,

              revision:
                expectedRevision + 1,

              createdAt:
                existing?.createdAt ||
                timestamp(),

              createdBy:
                existing?.createdBy ||
                OWNER_UID,

              updatedAt: timestamp(),
              updatedBy: OWNER_UID
            }
          );
        }
      ),

      "Не вдалося зберегти результат."
    );

    S.historicalRows[
      S.selected
    ] = {
      ...data,

      revision:
        expectedRevision + 1
    };

    render();
    selectSector(S.selected);

    setText(
      "historicalResultStatus",
      "Результат збережено."
    );

    message(
      `Сектор №${S.selected}: результат збережено.`,
      "ok"
    );
  }

  // ==========================================================
  // CLEAR HISTORICAL RESULT
  // ==========================================================

  async function clearHistoricalResult() {
    requireAccess();

    if (
      S.mode !== MODE.HISTORICAL ||
      !S.current
    ) {
      return;
    }

    const sector =
      S.selected;

    const old =
      S.historicalRows[sector];

    if (!old) {
      message(
        "У цьому секторі немає запису."
      );

      return;
    }

    if (
      !window.confirm(
        `Видалити результат фізичного сектора №${sector}?`
      )
    ) {
      return;
    }

    const ref =
      historicalSectorRef(
        S.current.id,
        sector
      );

    const expectedRevision =
      Number(
        old.revision || 0
      );

    await timed(
      S.db.runTransaction(
        async transaction => {
          const snapshot =
            await transaction.get(
              ref
            );

          if (!snapshot.exists) {
            throw new Error(
              "Результат уже видалено. Перезавантаж турнір."
            );
          }

          if (
            Number(
              snapshot.data().revision || 0
            ) !== expectedRevision
          ) {
            throw new Error(
              "Результат змінено в іншій вкладці."
            );
          }

          transaction.delete(ref);
        }
      ),

      "Не вдалося видалити результат."
    );

    delete S.historicalRows[sector];

    render();
    selectSector(sector);

    message(
      `Результат сектора №${sector} видалено.`,
      "ok"
    );
  }

  // ==========================================================
  // MAP ZOOM
  // ==========================================================

  function resizeMap() {
    const viewport =
      $("mapViewport");

    const canvas =
      $("mapCanvas");

    if (
      !viewport ||
      !canvas ||
      !S.current
    ) {
      return;
    }

    const width =
      viewport.clientWidth;

    if (!width) {
      return;
    }

    S.zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        S.zoom
      )
    );

    canvas.style.width =
      `${width * S.zoom}px`;

    canvas.style.height = "auto";

    canvas.style.aspectRatio =
      `${MAP_WIDTH} / ${MAP_HEIGHT}`;

    viewport.style.overflow =
      S.zoom > MIN_ZOOM
        ? "auto"
        : "hidden";

    setText(
      "zoomValue",
      `${Math.round(
        S.zoom * 100
      )}%`
    );

    setDisabled(
      "zoomOut",
      S.zoom <= MIN_ZOOM
    );

    setDisabled(
      "zoomIn",
      S.zoom >= MAX_ZOOM
    );
  }

  function resetZoom() {
    S.zoom = 1;

    resizeMap();

    const viewport =
      $("mapViewport");

    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  // ==========================================================
  // SWITCH MODE
  // ==========================================================

  async function switchMode(mode) {
    if (
      S.busy ||
      mode === S.mode ||
      !Object.values(MODE).includes(
        mode
      )
    ) {
      return;
    }

    if (!mayLeave()) {
      return;
    }

    S.mode = mode;

    resetStage();
    updateModeUI();

    await run(loadYear);
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  function on(id, event, handler) {
    const element = $(id);

    if (element) {
      element.addEventListener(
        event,
        handler
      );
    }
  }

  function bindEvents() {
    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            switchMode(
              button.dataset.mapMode
            );
          }
        );
      });

    on(
      "loadYear",
      "click",
      () => {
        if (mayLeave()) {
          run(loadYear);
        }
      }
    );

    on(
      "loadHistorical",
      "click",
      () => {
        if (mayLeave()) {
          run(loadYear);
        }
      }
    );

    on(
      "mapStage",
      "change",
      () => {
        const select =
          $("mapStage");

        const id =
          select.value;

        const previous =
          S.current?.id || "";

        if (!mayLeave()) {
          select.value = previous;
          return;
        }

        if (!id) {
          resetStage();
          return;
        }

        run(async () => {
          try {
            await loadStage(id);
          } catch (error) {
            select.value = previous;
            throw error;
          }
        });
      }
    );

    on(
      "historicalTournament",
      "change",
      () => {
        const select =
          $("historicalTournament");

        const id =
          select.value;

        const previous =
          S.current?.id || "";

        if (!mayLeave()) {
          select.value = previous;
          return;
        }

        if (!id) {
          resetStage();
          return;
        }

        run(async () => {
          try {
            await loadStage(id);
          } catch (error) {
            select.value = previous;
            throw error;
          }
        });
      }
    );

    on(
      "newHistorical",
      "click",
      newHistorical
    );

    on(
      "saveHistoricalMeta",
      "click",
      () => {
        run(saveHistoricalMeta);
      }
    );

    on(
      "lakeSector",
      "change",
      () => {
        selectSector(
          Number(
            value("lakeSector")
          )
        );
      }
    );

    [
      "archiveSlot",
      "manualZone",
      "manualNumber"
    ].forEach(id => {
      on(id, "input", preview);
      on(id, "change", preview);
    });

    on(
      "assignSlot",
      "click",
      assign
    );

    on(
      "removeSlot",
      "click",
      removeAssignment
    );

    on(
      "saveMap",
      "click",
      () => {
        run(saveSectorMap);
      }
    );

    on(
      "historicalParticipation",
      "change",
      updateHistoricalForm
    );

    on(
      "saveHistoricalResult",
      "click",
      () => {
        run(saveHistoricalResult);
      }
    );

    on(
      "clearHistoricalResult",
      "click",
      () => {
        run(clearHistoricalResult);
      }
    );

    on(
      "zoomIn",
      "click",
      () => {
        S.zoom = Math.min(
          MAX_ZOOM,
          S.zoom + ZOOM_STEP
        );

        resizeMap();
      }
    );

    on(
      "zoomOut",
      "click",
      () => {
        S.zoom = Math.max(
          MIN_ZOOM,
          S.zoom - ZOOM_STEP
        );

        resizeMap();
      }
    );

    on(
      "zoomReset",
      "click",
      resetZoom
    );

    on(
      "lakeImage",
      "error",
      () => {
        setHidden(
          "imageError",
          false
        );
      }
    );

    window.addEventListener(
      "resize",
      () => {
        requestAnimationFrame(
          resizeMap
        );
      }
    );

    window.addEventListener(
      "beforeunload",
      event => {
        if (S.dirty) {
          event.preventDefault();
          event.returnValue = "";
        }
      }
    );
  }

  // ==========================================================
  // FIREBASE INIT
  // ==========================================================

  async function waitFirebase() {
    if (window.scReady) {
      await timed(
        window.scReady,
        "Firebase не відповідає."
      );
    }

    const started = Date.now();

    while (
      !window.scDb ||
      !window.scAuth
    ) {
      if (
        Date.now() - started >
        REQUEST_TIMEOUT
      ) {
        throw new Error(
          "Firebase не ініціалізовано."
        );
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            100
          )
      );
    }

    S.db = window.scDb;
    S.auth = window.scAuth;
  }

  function waitAuth() {
    return timed(
      new Promise(
        (resolve, reject) => {
          let unsubscribe = null;
          let settled = false;

          const done = user => {
            if (settled) {
              return;
            }

            settled = true;

            if (unsubscribe) {
              unsubscribe();
            }

            resolve(user);
          };

          unsubscribe =
            S.auth.onAuthStateChanged(
              done,
              reject
            );

          if (
            settled &&
            unsubscribe
          ) {
            unsubscribe();
          }
        }
      ),

      "Не вдалося перевірити авторизацію."
    );
  }

  // ==========================================================
  // BOOT
  // ==========================================================

  async function boot() {
    if (S.started) {
      return;
    }

    S.started = true;

    try {
      message(
        `STOLAR CARP • Карти секторів v${VERSION}\n` +
        "Перевіряю доступ…"
      );

      await waitFirebase();

      const user =
        await waitAuth();

      if (
        !user ||
        user.uid !== OWNER_UID
      ) {
        throw new Error(
          "Доступ тільки для власника STOLAR CARP."
        );
      }

      const profile = await read(
        S.db
          .collection("users")
          .doc(user.uid)
      );

      if (
        !profile.exists ||
        profile.data()?.role !== "admin"
      ) {
        throw new Error(
          "Акаунт не має ролі admin."
        );
      }

      S.allowed = true;

      S.authUnsubscribe =
        S.auth.onAuthStateChanged(
          currentUser => {
            if (
              currentUser?.uid !==
              OWNER_UID
            ) {
              S.allowed = false;

              setHidden(
                "mapApp",
                true
              );

              controls();

              message(
                "Сесію завершено.",
                "error"
              );
            }
          }
        );

      const requestedYear =
        new URLSearchParams(
          location.search
        ).get("year");

      const year =
        validYear(requestedYear)
          ? requestedYear
          : String(
              new Date().getFullYear()
            );

      $("mapYear").value =
        year;

      $("historicalYear").value =
        year;

      S.year = year;

      $("lakeSector").innerHTML =
        POINTS.map(
          ([sector]) => `
            <option value="${sector}">
              Сектор озера №${sector}
            </option>
          `
        ).join("");

      // Початковий режим відповідає HTML:
      // archive має aria-pressed="true".
      S.mode = MODE.ARCHIVE;

      setHidden(
        "mapApp",
        false
      );

      updateModeUI();
      bindEvents();

      controls();

      await run(loadYear);

    } catch (error) {
      console.error(error);

      message(
        errorText(error),
        "error"
      );
    }
  }

  // ==========================================================
  // START
  // ==========================================================

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }

})();
