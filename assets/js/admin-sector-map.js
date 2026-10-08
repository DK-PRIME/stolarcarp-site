// ============================================================
// STOLAR CARP • КАРТИ СЕКТОРІВ
// assets/js/admin-sector-map.js
//
// Версія: 2.2 • 08.10.2026
//
// HTML: admin-sector-map.html v2.1
//
// РЕЖИМИ:
//
// PREPARE
//   Підготовка фізичних секторів до жеребкування.
//   Джерело: competitions/{competitionId}
//   Карта: sectorMaps/{year}/stages/{stageDocId}
//   Статуси: draft / prepared
//
// ARCHIVE
//   Прив'язка архівних результатів до фізичних секторів.
//   Джерела:
//     seasonResults/{year}/stages/{stageDocId}
//     oneoffResults/{year}/tournaments/{stageDocId}
//   Карта: sectorMaps/{year}/stages/{stageDocId}
//   Статуси: draft / ready
//
// HISTORICAL
//   Турніри інших організаторів.
//   Метадані:
//     lakeHistoricalEvents/{eventId}
//   Результати:
//     lakeHistoricalEvents/{eventId}/sectors/{number}
//
// ГАРАНТІЇ:
//
// - LIVE не змінюється.
// - Архівні результати не змінюються.
// - Рейтинг сезону не змінюється.
// - Фізичні сектори Лелехівки: 1–26.
// - Немає дублювання елементів HTML.
// - Контроль revision.
// - Контроль змін архівного джерела.
// - Захист від випадкового перезапису архівної карти.
// - Перевірка початку жеребкування.
// - TEAM / SOLO / ONEOFF.
// - Історичні результати зберігаються по секторах.
//
// УВАГА:
// Для повного захисту від одночасних змін жеребкування
// потрібна серверна перевірка у Firestore Rules / Functions.
//
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

  const MAX_LAKE_SECTOR = 26;

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
    POINTS.map(point => point[0])
  );

  // ==========================================================
  // DOM HELPERS
  // ==========================================================

  const $ = id => document.getElementById(id);

  function txt(value) {
    return String(value ?? "").trim();
  }

  function esc(value) {
    return txt(value).replace(
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
      element.textContent = value;
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

  function valueOf(id) {
    return txt($(id)?.value);
  }

  function on(id, eventName, handler) {
    const element = $(id);

    if (element) {
      element.addEventListener(
        eventName,
        handler
      );
    }
  }

  function option(value, label) {
    return (
      `<option value="${esc(value)}">` +
      `${esc(label)}` +
      "</option>"
    );
  }

  // ==========================================================
  // NUMBERS
  // ==========================================================

  function num(value) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      txt(value) === ""
    ) {
      return null;
    }

    const result = Number(
      txt(value).replace(",", ".")
    );

    return Number.isFinite(result)
      ? result
      : null;
  }

  function nonNegative(value) {
    const result = num(value);

    return result !== null && result >= 0
      ? result
      : null;
  }

  function nonNegativeInteger(value) {
    const result = num(value);

    return Number.isInteger(result) &&
      result >= 0
      ? result
      : null;
  }

  function positiveInteger(value) {
    const result = num(value);

    return Number.isInteger(result) &&
      result > 0
      ? result
      : null;
  }

  function validYear(value) {
    return /^20\d{2}$/.test(txt(value));
  }

  function validSector(value) {
    return VALID_SECTORS.has(
      positiveInteger(value)
    );
  }

  // ==========================================================
  // SLOTS
  // ==========================================================

  function latin(value) {
    return txt(value)
      .toUpperCase()
      .replace(/А/g, "A")
      .replace(/В/g, "B")
      .replace(/С/g, "C");
  }

  function parseSlot(zoneValue, sectorValue) {
    let zone = latin(zoneValue);

    let raw = latin(sectorValue)
      .replace(/[\s_-]+/g, "");

    const match = raw.match(
      /^([ABC])(\d+)$/
    );

    if (match) {
      if (zone && zone !== match[1]) {
        return null;
      }

      zone = match[1];
      raw = match[2];
    }

    if (
      !/^[ABC]$/.test(zone) ||
      !/^\d+$/.test(raw)
    ) {
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

  function slotFromRow(row) {
    return parseSlot(
      row?.zone ?? row?.drawZone,
      row?.sector ??
      row?.drawSector ??
      row?.drawKey
    );
  }

  function normalizeAssignment(value) {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return null;
    }

    const lakeSectorNumber =
      positiveInteger(
        value.lakeSectorNumber ??
        value.physicalSector ??
        value.lakeSector
      );

    const slot = slotFromRow(value);

    if (
      !validSector(lakeSectorNumber) ||
      !slot
    ) {
      return null;
    }

    return {
      lakeSectorId:
        `sector-${lakeSectorNumber}`,

      lakeSectorNumber,

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
      (order[a.zone] ?? 99) -
      (order[b.zone] ?? 99) ||
      a.sector - b.sector
    );
  }

  function sortAssignments(a, b) {
    return (
      a.lakeSectorNumber -
      b.lakeSectorNumber
    );
  }

  // ==========================================================
  // DATA HELPERS
  // ==========================================================

  function teamName(row) {
    return txt(
      row?.teamName ||
      row?.team ||
      row?.participantName ||
      row?.name
    ) || "—";
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
    return nonNegativeInteger(
      row?.totalCount ??
      row?.fishCount ??
      row?.totals?.fishCount ??
      row?.totals?.totalCount
    );
  }

  function weightText(value) {
    const number = nonNegative(value);

    return number === null
      ? "—"
      : number.toFixed(3);
  }

  function resultText(row) {
    if (!row) {
      return "—";
    }

    const participation =
      txt(row.participation);

    if (participation === "empty") {
      return "Не ловили";
    }

    if (participation === "unknown") {
      return "Результат невідомий";
    }

    const place = positiveInteger(
      row.place ??
      row.zonePlace ??
      row.overallPlace
    );

    const result =
      `${weightText(rowTotalWeight(row))} кг · ` +
      `${rowTotalCount(row) ?? "—"} риб`;

    return place
      ? `${place} місце · ${result}`
      : result;
  }

  function hasCatch(row) {
    if (!row) {
      return false;
    }

    const direct = [
      rowTotalWeight(row),
      rowTotalCount(row),
      nonNegative(row.bigFish),
      nonNegative(row.bigFishKg),
      nonNegative(row.carpCount),
      nonNegative(row.amurCount)
    ];

    if (
      direct.some(value => value !== null && value > 0)
    ) {
      return true;
    }

    const weighings = row.weighings;

    if (
      weighings &&
      typeof weighings === "object"
    ) {
      for (
        const weighing of
        Object.values(weighings)
      ) {
        if (!weighing) {
          continue;
        }

        if (
          nonNegative(weighing.total) > 0 ||
          nonNegative(weighing.count) > 0 ||
          nonNegative(weighing.totalWeightKg) > 0 ||
          nonNegative(weighing.fishCount) > 0
        ) {
          return true;
        }

        if (
          Array.isArray(weighing.fish) &&
          weighing.fish.length
        ) {
          return true;
        }

        if (
          Array.isArray(weighing.fishKg) &&
          weighing.fishKg.length
        ) {
          return true;
        }
      }
    }

    for (
      const key of
      ["W1", "W2", "W3", "W4", "w1", "w2", "w3", "w4"]
    ) {
      const weighing = row[key];

      if (!weighing) {
        continue;
      }

      if (
        nonNegative(weighing.total) > 0 ||
        nonNegative(weighing.count) > 0 ||
        nonNegative(weighing.totalWeightKg) > 0
      ) {
        return true;
      }
    }

    return false;
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

    const hash = await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return Array.from(
      new Uint8Array(hash),
      byte => byte.toString(16).padStart(2, "0")
    ).join("");
  }

  // ==========================================================
  // STATE
  // ==========================================================

  const S = {
    db: null,
    auth: null,

    allowed: false,
    busy: false,
    dirty: false,

    mode: MODE.ARCHIVE,

    year: String(
      new Date().getFullYear()
    ),

    stages: [],
    current: null,

    assignments: [],
    empty: [],

    historicalRows: {},

    revision: 0,

    sourceHash: "",
    sourcePath: "",

    selected: 1,
    zoom: 1,

    prepareLocked: false,
    prepareLockReason: "",

    savedMap: null,

    creatingHistorical: false,

    started: false
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
      `[STOLAR CARP MAP v${VERSION}]`,
      value
    );
  }

  function errorMessage(error) {
    if (
      txt(error?.code).includes(
        "permission-denied"
      )
    ) {
      return (
        "Firestore заборонив операцію.\n" +
        "Перевір правила доступу.\n" +
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
          () => reject(
            new Error(label)
          ),
          REQUEST_TIMEOUT
        );
      })
    ]).finally(() => {
      clearTimeout(timer);
    });
  }

  function read(ref) {
    return timed(
      ref.get({ source: "server" }),
      `Перевищено час очікування: ${ref.path}`
    );
  }

  function serverTimestamp() {
    return firebase.firestore
      .FieldValue
      .serverTimestamp();
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
        errorMessage(error),
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

  function seasonArchiveCollection(year) {
    return S.db
      .collection("seasonResults")
      .doc(String(year))
      .collection("stages");
  }

  function oneoffArchiveCollection(year) {
    return S.db
      .collection("oneoffResults")
      .doc(String(year))
      .collection("tournaments");
  }

  function historyCollection() {
    return S.db.collection(
      "lakeHistoricalEvents"
    );
  }

  function historyRef(id) {
    return historyCollection().doc(id);
  }

  function historySectorRef(id, sector) {
    return historyRef(id)
      .collection("sectors")
      .doc(String(sector));
  }

  // ==========================================================
  // MODE UI
  // ==========================================================

  function modeDescription() {
    if (S.mode === MODE.PREPARE) {
      return (
        "Підготовка до жеребкування. " +
        "Розстав фізичні сектори по зонах A/B/C. " +
        "Статус prepared надається тільки після " +
        "перевірки повноти розстановки."
      );
    }

    if (S.mode === MODE.HISTORICAL) {
      return (
        "Історичні турніри Лелехівки. " +
        "Створи турнір і внеси результат " +
        "кожного фізичного сектора."
      );
    }

    return (
      "Архівні етапи STOLAR CARP. " +
      "Прив'язка архівних результатів до " +
      "фізичних секторів без зміни архіву."
    );
  }

  function updateModeUI() {
    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        const active =
          button.dataset.mapMode === S.mode;

        button.classList.toggle(
          "active",
          active
        );

        button.setAttribute(
          "aria-pressed",
          String(active)
        );
      });

    setText(
      "mapModeInfo",
      modeDescription()
    );

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
      "historicalMetaEditor",
      !historical ||
      !S.creatingHistorical
    );

    setHidden(
      "mapEditor",
      !S.current
    );

    setHidden(
      "historicalResultSection",
      !historical ||
      !S.current
    );

    setHidden(
      "historicalTableSection",
      !historical ||
      !S.current
    );

    setHidden(
      "emptySection",
      historical ||
      !S.current
    );

    setHidden(
      "assignmentSection",
      !S.current
    );

    setHidden(
      "mappingRows",
      historical
    );

    setHidden(
      "assignmentTitle",
      false
    );

    setText(
      "assignmentTitle",
      historical
        ? "Вибір фізичного сектора"
        : "Прив'язка сектора"
    );

    setHidden(
      "archiveSlot",
      historical
    );

    setHidden(
      "manualSlot",
      historical
    );

    setHidden(
      "assignSlot",
      historical
    );

    setHidden(
      "removeSlot",
      historical
    );

    setHidden(
      "slotPreview",
      historical
    );

    setText(
      "mapYearLabel",
      S.mode === MODE.PREPARE
        ? "Рік змагань"
        : "Рік архіву"
    );

    setText(
      "mapStageLabel",
      S.mode === MODE.PREPARE
        ? "Етап для підготовки"
        : "Архівний етап"
    );

    setText(
      "currentMapModeBadge",
      S.mode === MODE.PREPARE
        ? "ПІДГОТОВКА"
        : S.mode === MODE.HISTORICAL
          ? "ІСТОРІЯ"
          : "АРХІВ"
    );

    setText(
      "mapEditorDescription",
      S.mode === MODE.PREPARE
        ? "Прив'яжи фізичні сектори до секторів жеребкування."
        : S.mode === MODE.HISTORICAL
          ? "Обери фізичний сектор на карті та внеси його історичний результат."
          : "Прив'яжи архівні результати до фізичних секторів."
    );

    setText(
      "mappingTableTitle",
      historical
        ? "Сектори турніру"
        : "Прив'язки секторів"
    );

    setText(
      "saveMap",
      S.mode === MODE.PREPARE
        ? "Зберегти розстановку"
        : "Зберегти карту етапу"
    );
  }

  // ==========================================================
  // CONTROLS
  // ==========================================================

  function controls() {
    const locked =
      S.busy ||
      !S.allowed;

    const historical =
      S.mode === MODE.HISTORICAL;

    const canEditMap =
      !locked &&
      Boolean(S.current) &&
      !S.prepareLocked &&
      !historical;

    [
      "mapYear",
      "loadYear",
      "mapStage",
      "historicalYear",
      "loadHistorical",
      "historicalTournament",
      "newHistorical"
    ].forEach(id => {
      setDisabled(id, locked);
    });

    const editFields = $("editFields");

    if (editFields) {
      editFields.disabled =
        locked ||
        !S.current;
    }

    setDisabled(
      "lakeSector",
      locked ||
      !S.current
    );

    [
      "archiveSlot",
      "manualZone",
      "manualNumber",
      "assignSlot"
    ].forEach(id => {
      setDisabled(
        id,
        !canEditMap
      );
    });

    setDisabled(
      "removeSlot",
      !canEditMap ||
      !S.assignments.some(
        item =>
          item.lakeSectorNumber === S.selected
      )
    );

    setDisabled(
      "saveMap",
      !canEditMap ||
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
        !historical ||
        !S.creatingHistorical
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
        !S.current
      );
    });

    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.disabled = locked;
      });

    setDisabled(
      "zoomOut",
      S.zoom <= MIN_ZOOM
    );

    setDisabled(
      "zoomIn",
      S.zoom >= MAX_ZOOM
    );
  }

  // ==========================================================
  // RESET
  // ==========================================================

  function clearSelectedStage() {
    S.current = null;

    S.assignments = [];
    S.empty = [];

    S.historicalRows = {};

    S.revision = 0;

    S.sourceHash = "";
    S.sourcePath = "";

    S.savedMap = null;

    S.selected = 1;
    S.zoom = 1;

    S.dirty = false;

    S.prepareLocked = false;
    S.prepareLockReason = "";

    setHidden(
      "mapEditor",
      true
    );

    setHidden(
      "historicalResultSection",
      true
    );

    setHidden(
      "historicalTableSection",
      true
    );

    setHidden(
      "imageError",
      true
    );

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

  // ==========================================================
  // COMPETITION YEAR
  // ==========================================================

  function yearFromDate(value) {
    if (!value) {
      return "";
    }

    if (
      typeof value.toDate === "function"
    ) {
      const date = value.toDate();

      return Number.isFinite(date.getTime())
        ? String(date.getFullYear())
        : "";
    }

    if (value instanceof Date) {
      return Number.isFinite(value.getTime())
        ? String(value.getFullYear())
        : "";
    }

    const match = txt(value).match(
      /(?:^|[^\d])(20\d{2})(?:[^\d]|$)/
    );

    return match
      ? match[1]
      : "";
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

    const values = [
      event?.startDate,
      event?.startAt,
      event?.date,
      data?.startDate,
      data?.startAt,
      data?.date
    ];

    for (const value of values) {
      const year = yearFromDate(value);

      if (year) {
        return year;
      }
    }

    return "";
  }

  // ==========================================================
  // COMPETITION STAGES
  // ==========================================================

  function competitionStages(doc) {
    const data = doc.data() || {};

    const events = Array.isArray(
      data.events
    )
      ? data.events
      : [];

    return events
      .map(event => {
        const stageKey = txt(
          event?.key ||
          event?.stageId ||
          event?.id
        );

        if (!stageKey) {
          return null;
        }

        const competitionTitle = txt(
          data.title ||
          data.name ||
          doc.id
        );

        const eventTitle = txt(
          event.title ||
          event.name ||
          stageKey
        );

        const lakeId = txt(
          event.lakeId ||
          data.lakeId
        );

        const format = txt(
          event.format ||
          data.format ||
          data.type
        ).toLowerCase();

        const entryType = txt(
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

          lakeId,
          format,
          entryType
        };
      })
      .filter(Boolean);
  }

  async function loadPrepareStages(year) {
    const snapshot = await read(
      S.db.collection("competitions")
    );

    const stages = [];

    snapshot.docs.forEach(doc => {
      competitionStages(doc).forEach(stage => {
        if (
          stage.year === year &&
          stage.lakeId === LAKE_ID
        ) {
          stages.push(stage);
        }
      });
    });

    return stages;
  }

  // ==========================================================
  // ARCHIVE STAGES
  // ==========================================================

  function archiveStageFromDoc(
    doc,
    year,
    kind
  ) {
    const data = doc.data() || {};

    const lakeId = txt(
      data.lakeId || LAKE_ID
    );

    const sourcePath =
      kind === "oneoff"
        ? `oneoffResults/${year}/tournaments/${doc.id}`
        : `seasonResults/${year}/stages/${doc.id}`;

    return {
      id: doc.id,

      title: txt(
        data.stageName ||
        data.title ||
        data.stageTitle ||
        data.stageId ||
        doc.id
      ),

      lakeId,
      sourcePath,
      kind,
      data
    };
  }

  async function loadArchiveStages(year) {
    const seasonSnapshot = await read(
      seasonArchiveCollection(year)
    );

    const oneoffSnapshot = await read(
      oneoffArchiveCollection(year)
    );

    const stages = [];

    seasonSnapshot.docs.forEach(doc => {
      const stage = archiveStageFromDoc(
        doc,
        year,
        "season"
      );

      if (stage.lakeId === LAKE_ID) {
        stages.push(stage);
      }
    });

    oneoffSnapshot.docs.forEach(doc => {
      const stage = archiveStageFromDoc(
        doc,
        year,
        "oneoff"
      );

      if (stage.lakeId === LAKE_ID) {
        stages.push(stage);
      }
    });

    const unique = new Map();

    for (const stage of stages) {
      if (unique.has(stage.id)) {
        throw new Error(
          `Архівний ID ${stage.id} повторюється ` +
          "у seasonResults та oneoffResults. " +
          "Потрібно усунути неоднозначність."
        );
      }

      unique.set(stage.id, stage);
    }

    return [...unique.values()];
  }

  // ==========================================================
  // HISTORICAL STAGES
  // ==========================================================

  async function loadHistoricalStages(year) {
    const snapshot = await read(
      historyCollection()
        .where("year", "==", year)
    );

    return snapshot.docs
      .map(doc => {
        const data = doc.data() || {};

        return {
          id: doc.id,

          title: txt(
            data.title || doc.id
          ),

          lakeId: txt(
            data.lakeId || LAKE_ID
          ),

          data
        };
      })
      .filter(stage =>
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
      ? valueOf("historicalYear")
      : valueOf("mapYear");

    if (!validYear(year)) {
      throw new Error(
        "Введи коректний рік."
      );
    }

    message(
      `Завантажую ${year} рік…`
    );

    let stages = [];

    if (S.mode === MODE.PREPARE) {
      stages = await loadPrepareStages(year);
    } else if (
      S.mode === MODE.ARCHIVE
    ) {
      stages = await loadArchiveStages(year);
    } else {
      stages = await loadHistoricalStages(year);
    }

    stages.sort((a, b) =>
      a.title.localeCompare(
        b.title,
        "uk",
        { numeric: true }
      )
    );

    S.year = year;
    S.stages = stages;

    clearSelectedStage();

    const select = historical
      ? $("historicalTournament")
      : $("mapStage");

    if (select) {
      select.innerHTML =
        option(
          "",
          historical
            ? "Обери турнір"
            : "Обери етап"
        ) +
        stages.map(stage =>
          option(
            stage.id,
            stage.title
          )
        ).join("");
    }

    message(
      stages.length
        ? `Знайдено: ${stages.length}. Обери потрібний етап або турнір.`
        : "За цей рік записів не знайдено.",
      stages.length ? "ok" : ""
    );
  }

  // ==========================================================
  // ARCHIVE ROWS
  // ==========================================================

  function readRows(rows) {
    const slots = new Map();
    const issues = [];

    if (!Array.isArray(rows)) {
      return {
        slots,
        issues: [
          "Архівний документ не містить масиву standings."
        ]
      };
    }

    rows.forEach((row, index) => {
      const slot = slotFromRow(row);

      if (!slot) {
        issues.push(
          `Некоректний сектор у рядку ${index + 1}.`
        );

        return;
      }

      if (slots.has(slot.drawKey)) {
        issues.push(
          `Дублюється сектор ${slot.drawKey}.`
        );

        return;
      }

      slots.set(slot.drawKey, {
        ...slot,
        row
      });
    });

    return {
      slots,
      issues
    };
  }

  // ==========================================================
  // EXPECTED PREPARE SLOTS
  // ==========================================================

  function normalizeExpectedSlots(value) {
    if (!Array.isArray(value)) {
      return null;
    }

    const result = [];
    const seen = new Set();

    for (const item of value) {
      let slot = null;

      if (typeof item === "string") {
        slot = parseSlot("", item);
      } else if (
        item &&
        typeof item === "object"
      ) {
        slot = slotFromRow(item);
      }

      if (!slot) {
        return null;
      }

      if (seen.has(slot.drawKey)) {
        return null;
      }

      seen.add(slot.drawKey);
      result.push(slot);
    }

    return result.length
      ? result.sort(sortSlots)
      : null;
  }

  function expectedPrepareSlots() {
    const event =
      S.current?.event || {};

    const competition =
      S.current?.competition || {};

    const candidates = [
      event.drawSlots,
      event.slots,
      event.sectors,
      competition.drawSlots,
      competition.slots
    ];

    for (const candidate of candidates) {
      const slots =
        normalizeExpectedSlots(candidate);

      if (slots) {
        return slots;
      }
    }

    return null;
  }

  // ==========================================================
  // PREPARE LOCK
  // ==========================================================

  function hasDrawFields(row) {
    if (!row) {
      return false;
    }

    const zone = txt(
      row.drawZone || row.zone
    );

    const sector = txt(
      row.drawSector ||
      row.sector
    );

    const physical = positiveInteger(
      row.lakeSectorNumber
    );

    return Boolean(
      parseSlot(zone, sector) ||
      validSector(physical)
    );
  }

  function registrationBelongsToStage(
    row,
    stage
  ) {
    if (!row) {
      return false;
    }

    const competitionId = txt(
      row.competitionId
    );

    if (
      competitionId !==
      stage.competitionId
    ) {
      return false;
    }

    const directDocId = txt(
      row.stageDocId
    );

    if (directDocId) {
      return directDocId === stage.id;
    }

    const stageKey = txt(
      row.stageKey ||
      row.stageId ||
      row.eventKey
    );

    return stageKey === stage.stageKey;
  }

  async function checkPrepareLock(stage) {
    requireAccess();

    const [
      registrations,
      participants,
      live,
      liveTeams
    ] = await Promise.all([
      read(
        S.db.collection("registrations")
          .where(
            "competitionId",
            "==",
            stage.competitionId
          )
      ),

      read(
        S.db.collection(
          "public_participants"
        )
          .where(
            "competitionId",
            "==",
            stage.competitionId
          )
      ),

      read(
        S.db.collection("stageResults")
          .doc(stage.id)
      ),

      read(
        S.db.collection("stageResults")
          .doc(stage.id)
          .collection("teams")
          .limit(1)
      )
    ]);

    const sources = [
      registrations,
      participants
    ];

    for (const snapshot of sources) {
      for (const doc of snapshot.docs) {
        const row = doc.data() || {};

        if (
          registrationBelongsToStage(
            row,
            stage
          ) &&
          hasDrawFields(row)
        ) {
          return {
            locked: true,

            reason:
              "Для цього етапу вже є " +
              "розподілені сектори в заявках."
          };
        }
      }
    }

    if (!liveTeams.empty) {
      return {
        locked: true,

        reason:
          "Для цього етапу вже існують " +
          "результати команд у LIVE."
      };
    }

    if (live.exists) {
      const data = live.data() || {};

      if (
        Array.isArray(data.teams) &&
        data.teams.length
      ) {
        return {
          locked: true,

          reason:
            "Для цього етапу вже існують " +
            "результати LIVE."
        };
      }
    }

    return {
      locked: false,
      reason: ""
    };
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
        "Етап не знайдено."
      );
    }

    message(
      "Завантажую карту…"
    );

    let saved = null;
    let data = null;
    let rows = [];

    let sourceHash = "";
    let sourcePath = "";

    let historicalRows = {};

    let prepareLock = {
      locked: false,
      reason: ""
    };

    if (S.mode === MODE.ARCHIVE) {
      const sourceRef =
        S.db.doc(stage.sourcePath);

      const [
        source,
        map
      ] = await Promise.all([
        read(sourceRef),
        read(mapRef(S.year, id))
      ]);

      if (!source.exists) {
        throw new Error(
          "Архівний документ не знайдено."
        );
      }

      data = source.data() || {};

      rows = data.standings;

      sourceHash = await fingerprint(
        rows ?? null
      );

      sourcePath = stage.sourcePath;

      saved = map.exists
        ? map.data()
        : null;
    }

    if (S.mode === MODE.PREPARE) {
      const [
        competition,
        map,
        lock
      ] = await Promise.all([
        read(
          S.db.collection(
            "competitions"
          ).doc(
            stage.competitionId
          )
        ),

        read(
          mapRef(S.year, id)
        ),

        checkPrepareLock(stage)
      ]);

      if (!competition.exists) {
        throw new Error(
          "Змагання більше не існують."
        );
      }

      data = competition.data() || {};

      saved = map.exists
        ? map.data()
        : null;

      prepareLock = lock;

      sourcePath =
        `competitions/${stage.competitionId}`;
    }

    if (S.mode === MODE.HISTORICAL) {
      const [
        history,
        sectors
      ] = await Promise.all([
        read(historyRef(id)),

        read(
          historyRef(id)
            .collection("sectors")
        )
      ]);

      if (!history.exists) {
        throw new Error(
          "Історичний турнір не знайдено."
        );
      }

      saved = history.data() || {};
      data = saved;

      sectors.docs.forEach(doc => {
        const sector =
          positiveInteger(doc.id);

        if (!validSector(sector)) {
          throw new Error(
            `Некоректний номер історичного сектора: ${doc.id}.`
          );
        }

        historicalRows[sector] = {
          ...doc.data(),
          lakeSectorNumber: sector
        };
      });
    }

    if (
      saved?.lakeId &&
      saved.lakeId !== LAKE_ID
    ) {
      throw new Error(
        "Дані належать іншій водоймі."
      );
    }

    if (
      saved &&
      S.mode !== MODE.HISTORICAL
    ) {
      if (
        Number(saved.schemaVersion) !== 1 ||
        txt(saved.seasonYear) !== S.year ||
        saved.stageDocId !== id
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
        (value, index) => {
          const normalized =
            normalizeAssignment(value);

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
      Array.isArray(
        saved?.emptyLakeSectors
      )
        ? saved.emptyLakeSectors.map(Number)
        : [];

    if (
      empty.some(
        sector => !validSector(sector)
      )
    ) {
      throw new Error(
        "У карті є некоректні порожні сектори."
      );
    }

    S.current = {
      ...stage,
      data,
      rows
    };

    S.assignments = assignments;

    S.empty = [
      ...new Set(empty)
    ];

    S.historicalRows =
      historicalRows;

    S.revision = Number(
      saved?.revision || 0
    );

    S.sourceHash = sourceHash;
    S.sourcePath = sourcePath;

    S.savedMap = saved;

    S.prepareLocked =
      prepareLock.locked;

    S.prepareLockReason =
      prepareLock.reason;

    S.selected = 1;
    S.zoom = 1;

    S.dirty = false;
    S.creatingHistorical = false;

    setText(
      "selectedStageTitle",
      `${S.year} · ${stage.title}`
    );

    updateModeUI();

    render();
    selectSector(1);

    requestAnimationFrame(
      resizeMap
    );

    if (S.prepareLocked) {
      message(
        "Редагування заблоковано.\n" +
        S.prepareLockReason,
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
        "Перевір карту перед збереженням.",
        "error"
      );

      return;
    }

    message(
      saved
        ? "Дані завантажено."
        : "Нова карта. Можна починати.",
      "ok"
    );
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
        ? readRows(
            S.current?.rows
          )
        : null;

    if (source) {
      incomplete.push(
        ...source.issues
      );
    }

    for (
      const assignment of
      S.assignments
    ) {
      const sector =
        assignment.lakeSectorNumber;

      const slot = slotFromRow(
        assignment
      );

      if (
        !validSector(sector) ||
        !slot ||
        slot.drawKey !==
          assignment.drawKey
      ) {
        errors.push(
          `Некоректна прив'язка сектора №${sector}.`
        );

        continue;
      }

      if (
        physical.has(sector)
      ) {
        errors.push(
          `Фізичний сектор №${sector} повторюється.`
        );
      }

      if (
        drawKeys.has(slot.drawKey)
      ) {
        errors.push(
          `Позначення ${slot.drawKey} повторюється.`
        );
      }

      physical.add(sector);
      drawKeys.add(slot.drawKey);

      if (
        S.mode === MODE.ARCHIVE
      ) {
        const row =
          source.slots.get(
            slot.drawKey
          )?.row;

        if (!row) {
          incomplete.push(
            `${slot.drawKey}: немає архівного результату.`
          );
        } else {
          if (
            rowTotalWeight(row) === null ||
            rowTotalCount(row) === null
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
              `${slot.drawKey}: сектор позначено порожнім, але є улов.`
            );
          }
        }
      }
    }

    for (
      const sector of S.empty
    ) {
      if (!physical.has(sector)) {
        errors.push(
          `Порожній сектор №${sector} не має прив'язки.`
        );
      }
    }

    if (!S.assignments.length) {
      incomplete.push(
        "Немає прив'язок."
      );
    }

    if (
      S.mode === MODE.ARCHIVE &&
      source
    ) {
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

    if (
      S.mode === MODE.PREPARE
    ) {
      const expected =
        expectedPrepareSlots();

      if (!expected) {
        incomplete.push(
          "Не визначено повний список секторів жеребкування в налаштуваннях етапу."
        );
      } else {
        const expectedKeys =
          new Set(
            expected.map(
              slot => slot.drawKey
            )
          );

        for (
          const key of drawKeys
        ) {
          if (
            !expectedKeys.has(key)
          ) {
            errors.push(
              `Позначення ${key} не входить до конфігурації жеребкування.`
            );
          }
        }

        const missing = expected
          .filter(
            slot =>
              !drawKeys.has(
                slot.drawKey
              )
          )
          .map(
            slot => slot.drawKey
          );

        if (missing.length) {
          incomplete.push(
            `Не розставлено: ${missing.join(", ")}.`
          );
        }
      }

      if (
        S.assignments.length >
        MAX_LAKE_SECTOR
      ) {
        errors.push(
          "Більше 26 фізичних секторів."
        );
      }
    }

    return {
      errors,
      incomplete,

      ready:
        errors.length === 0 &&
        incomplete.length === 0,

      selected:
        S.assignments.length,

      empty:
        S.empty.length,

      included:
        S.assignments.length -
        S.empty.length
    };
  }

  // ==========================================================
  // AVAILABLE SLOTS
  // ==========================================================

  function availableSlots() {
    if (
      S.mode === MODE.ARCHIVE
    ) {
      return [
        ...readRows(
          S.current.rows
        ).slots.values()
      ].sort(sortSlots);
    }

    const expected =
      expectedPrepareSlots();

    if (expected) {
      return expected;
    }

    const slots = [];

    for (
      const zone of
      ["A", "B", "C"]
    ) {
      for (
        let sector = 1;
        sector <= MAX_LAKE_SECTOR;
        sector++
      ) {
        slots.push({
          zone,
          sector,
          drawKey:
            `${zone}${sector}`
        });
      }
    }

    return slots;
  }

  function assignmentForSector(
    sector
  ) {
    return S.assignments.find(
      item =>
        item.lakeSectorNumber === sector
    ) || null;
  }

  function rowForAssignment(
    assignment
  ) {
    if (!assignment) {
      return null;
    }

    if (
      S.mode === MODE.ARCHIVE
    ) {
      return readRows(
        S.current.rows
      ).slots.get(
        assignment.drawKey
      )?.row || null;
    }

    return null;
  }

  // ==========================================================
  // RENDER PINS
  // ==========================================================

  function renderPins() {
    const container =
      $("mapPins");

    if (!container) {
      return;
    }

    container.innerHTML =
      POINTS.map(
        ([sector, x, y]) => {
          const assignment =
            assignmentForSector(
              sector
            );

          const historical =
            S.historicalRows[
              sector
            ];

          const empty =
            S.empty.includes(
              sector
            );

          const zone =
            assignment?.zone || "";

          const subtitle =
            S.mode ===
            MODE.HISTORICAL
              ? historical?.drawKey || ""
              : assignment?.drawKey || "";

          return `
            <button
              type="button"
              class="map-pin"
              data-lake="${sector}"
              data-zone="${esc(zone)}"
              data-empty="${empty}"
              aria-pressed="${
                sector === S.selected
              }"
              style="
                left:${x}%;
                top:${y}%;
              "
              aria-label="Фізичний сектор №${sector}"
            >
              <span>${sector}</span>
              <small>${esc(subtitle)}</small>
            </button>
          `;
        }
      ).join("");

    container
      .querySelectorAll(
        "[data-lake]"
      )
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
  // RENDER MAPPING TABLE
  // ==========================================================

  function renderMappingTable() {
    const body =
      $("mappingRows");

    if (!body) {
      return;
    }

    if (
      S.mode === MODE.HISTORICAL
    ) {
      body.innerHTML = "";
      return;
    }

    const ordered = [
      ...S.assignments
    ].sort(sortAssignments);

    body.innerHTML =
      ordered.map(
        assignment => {
          const sector =
            assignment.lakeSectorNumber;

          const row =
            rowForAssignment(
              assignment
            );

          return `
            <tr>
              <td>
                №${sector}
              </td>

              <td>
                ${esc(
                  assignment.drawKey
                )}
              </td>

              <td>
                ${esc(
                  teamName(row)
                )}
              </td>

              <td>
                ${esc(
                  resultText(row)
                )}
              </td>

              <td>
                ${
                  S.empty.includes(
                    sector
                  )
                    ? "Пустував"
                    : "Ловили"
                }
              </td>
            </tr>
          `;
        }
      ).join("") ||
      `
        <tr>
          <td colspan="5">
            Ще немає прив'язок.
          </td>
        </tr>
      `;
  }

  // ==========================================================
  // RENDER EMPTY SECTORS
  // ==========================================================

  function renderEmptySectors() {
    const container =
      $("emptySectors");

    if (
      !container ||
      S.mode === MODE.HISTORICAL
    ) {
      return;
    }

    const ordered = [
      ...S.assignments
    ].sort(sortAssignments);

    container.innerHTML =
      ordered.map(
        assignment => {
          const sector =
            assignment.lakeSectorNumber;

          return `
            <label class="maps-check">
              <input
                type="checkbox"
                data-empty-sector="${sector}"
                ${
                  S.empty.includes(
                    sector
                  )
                    ? "checked"
                    : ""
                }
                ${
                  S.busy ||
                  S.prepareLocked
                    ? "disabled"
                    : ""
                }
              >

              <span>
                ${esc(
                  assignment.drawKey
                )}
                · озеро №${sector}
              </span>
            </label>
          `;
        }
      ).join("") ||
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
              S.prepareLocked
            ) {
              render();
              return;
            }

            const sector =
              Number(
                input.dataset
                  .emptySector
              );

            const assignment =
              assignmentForSector(
                sector
              );

            if (
              input.checked &&
              S.mode ===
                MODE.ARCHIVE &&
              hasCatch(
                rowForAssignment(
                  assignment
                )
              )
            ) {
              input.checked =
                false;

              message(
                "У секторі є улов. Позначити його порожнім не можна.",
                "error"
              );

              return;
            }

            if (input.checked) {
              S.empty = [
                ...new Set([
                  ...S.empty,
                  sector
                ])
              ];
            } else {
              S.empty =
                S.empty.filter(
                  value =>
                    value !== sector
                );
            }

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

    if (
      !body ||
      S.mode !== MODE.HISTORICAL
    ) {
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
        const sector =
          row.lakeSectorNumber;

        const participation =
          txt(row.participation) ||
          "unknown";

        return `
          <tr>
            <td>№${sector}</td>

            <td>
              ${esc(
                row.drawKey || "—"
              )}
            </td>

            <td>
              ${esc(
                row.teamName || "—"
              )}
            </td>

            <td>
              ${
                positiveInteger(
                  row.place
                ) || "—"
              }
            </td>

            <td>
              ${
                participation ===
                "fished"
                  ? weightText(
                      row.totalWeight
                    )
                  : "—"
              }
            </td>

            <td>
              ${
                participation ===
                "fished"
                  ? row.totalCount
                  : participation ===
                    "empty"
                    ? "Не ловили"
                    : "Невідомо"
              }
            </td>
          </tr>
        `;
      }).join("") ||
      `
        <tr>
          <td colspan="6">
            Результатів ще немає.
          </td>
        </tr>
      `;

    const fished = rows.filter(
      row =>
        row.participation ===
        "fished"
    );

    const empty = rows.filter(
      row =>
        row.participation ===
        "empty"
    );

    const totalWeight =
      fished.reduce(
        (sum, row) =>
          sum +
          (
            nonNegative(
              row.totalWeight
            ) || 0
          ),
        0
      );

    const totalCount =
      fished.reduce(
        (sum, row) =>
          sum +
          (
            nonNegativeInteger(
              row.totalCount
            ) || 0
          ),
        0
      );

    setText(
      "historicalTotals",
      `Заповнено секторів: ${rows.length}/26 · ` +
      `Ловили: ${fished.length} · ` +
      `Пустували: ${empty.length} · ` +
      `Вага: ${totalWeight.toFixed(3)} кг · ` +
      `Риб: ${totalCount}`
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {
    if (!S.current) {
      return;
    }

    renderPins();

    renderMappingTable();

    renderEmptySectors();

    renderHistoricalTable();

    if (
      S.mode !== MODE.HISTORICAL
    ) {
      const check =
        inspectMap();

      setText(
        "mapSummary",
        `У розстановці: ${check.selected} · ` +
        `Пустували: ${check.empty} · ` +
        `Ловили: ${check.included}`
      );

      setText(
        "mapCoverage",
        check.ready
          ? "Карта повністю перевірена."
          : [
              ...check.errors,
              ...check.incomplete
            ].join("\n") ||
            "Карта не завершена."
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
      !validSector(sector)
    ) {
      return;
    }

    S.selected = sector;

    if ($("lakeSector")) {
      $("lakeSector").value =
        String(sector);
    }

    const assignment =
      assignmentForSector(
        sector
      );

    if (
      S.mode !== MODE.HISTORICAL
    ) {
      const used = new Set(
        S.assignments
          .filter(
            item =>
              item.lakeSectorNumber !==
              sector
          )
          .map(
            item => item.drawKey
          )
      );

      const slots =
        availableSlots();

      const select =
        $("archiveSlot");

      if (select) {
        select.innerHTML =
          option(
            "",
            "Обери позначення"
          ) +
          slots.map(slot => {
            return `
              <option
                value="${esc(
                  slot.drawKey
                )}"
                ${
                  used.has(
                    slot.drawKey
                  )
                    ? "disabled"
                    : ""
                }
              >
                ${esc(
                  slot.drawKey
                )}
              </option>
            `;
          }).join("") +
          option(
            "manual",
            "Ввести вручну…"
          );

        select.value =
          assignment
            ? (
                slots.some(
                  slot =>
                    slot.drawKey ===
                    assignment.drawKey
                )
                  ? assignment.drawKey
                  : "manual"
              )
            : "";
      }

      if ($("manualZone")) {
        $("manualZone").value =
          assignment?.zone || "A";
      }

      if ($("manualNumber")) {
        $("manualNumber").value =
          assignment?.sector || 1;
      }

      preview();
    } else {
      loadHistoricalEditor(
        sector
      );
    }

    $("mapPins")
      ?.querySelectorAll(
        "[data-lake]"
      )
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

    controls();
  }

  // ==========================================================
  // CHOSEN SLOT
  // ==========================================================

  function chosenSlot() {
    if (
      valueOf("archiveSlot") ===
      "manual"
    ) {
      return parseSlot(
        valueOf("manualZone"),
        valueOf("manualNumber")
      );
    }

    return parseSlot(
      "",
      valueOf("archiveSlot")
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
      valueOf("archiveSlot") !==
      "manual"
    );

    const slot =
      chosenSlot();

    if (!slot) {
      setText(
        "slotPreview",
        "Обери позначення."
      );

      return;
    }

    const row =
      S.mode === MODE.ARCHIVE
        ? readRows(
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
          : "Результат не прив'язаний."
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
      S.prepareLocked ||
      S.mode === MODE.HISTORICAL
    ) {
      return;
    }

    const slot =
      chosenSlot();

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
      const source =
        readRows(
          S.current.rows
        );

      if (
        !source.slots.has(
          slot.drawKey
        )
      ) {
        message(
          "Цього позначення немає в архіві.",
          "error"
        );

        return;
      }
    }

    const collision =
      S.assignments.find(
        item =>
          item.drawKey ===
            slot.drawKey &&
          item.lakeSectorNumber !==
            S.selected
      );

    if (collision) {
      message(
        `${slot.drawKey} уже використовується.`,
        "error"
      );

      return;
    }

    const previous =
      assignmentForSector(
        S.selected
      );

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
      S.empty =
        S.empty.filter(
          sector =>
            sector !== S.selected
        );
    }

    changed();

    message(
      `Озеро №${S.selected} → ${slot.drawKey}. Збережи карту.`,
      "ok"
    );
  }

  function removeAssignment() {
    if (
      !S.current ||
      S.busy ||
      !S.allowed ||
      S.prepareLocked ||
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

    S.empty =
      S.empty.filter(
        sector =>
          sector !== S.selected
      );

    changed();
  }

  // ==========================================================
  // HISTORICAL EDITOR
  // ==========================================================

  function loadHistoricalEditor(sector) {
    const row =
      S.historicalRows[
        sector
      ] || {};

    setText(
      "historicalSectorNumber",
      `№${sector}`
    );

    if ($("historicalDrawKey")) {
      $("historicalDrawKey").value =
        row.drawKey || "";
    }

    if ($("historicalTeam")) {
      $("historicalTeam").value =
        row.teamName || "";
    }

    if ($("historicalPlace")) {
      $("historicalPlace").value =
        row.place ?? "";
    }

    if ($("historicalWeight")) {
      $("historicalWeight").value =
        row.totalWeight ?? "";
    }

    if ($("historicalFishCount")) {
      $("historicalFishCount").value =
        row.totalCount ?? "";
    }

    if ($("historicalParticipation")) {
      $("historicalParticipation").value =
        row.participation ||
        "unknown";
    }

    setText(
      "historicalResultStatus",
      row.lakeSectorNumber
        ? "Результат сектора завантажено."
        : "Для цього сектора результат ще не внесено."
    );

    updateHistoricalForm();
  }

  function updateHistoricalForm() {
    const participation =
      valueOf(
        "historicalParticipation"
      );

    const fished =
      participation ===
      "fished";

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
        !S.allowed
      );
    });
  }

  // ==========================================================
  // HISTORICAL VALIDATION
  // ==========================================================

  function collectHistoricalResult() {
    const sector =
      S.selected;

    if (
      !validSector(sector)
    ) {
      throw new Error(
        "Некоректний фізичний сектор."
      );
    }

    const participation =
      valueOf(
        "historicalParticipation"
      );

    if (
      ![
        "fished",
        "empty",
        "unknown"
      ].includes(participation)
    ) {
      throw new Error(
        "Обери статус участі."
      );
    }

    const drawKey =
      valueOf(
        "historicalDrawKey"
      );

    const payload = {
      lakeSectorNumber:
        sector,

      participation
    };

    if (drawKey) {
      const slot =
        parseSlot(
          "",
          drawKey
        );

      if (!slot) {
        throw new Error(
          "Позначення сектора має вигляд A1, B2 або C3."
        );
      }

      payload.drawKey =
        slot.drawKey;
    }

    if (
      participation !==
      "fished"
    ) {
      return payload;
    }

    const team =
      valueOf(
        "historicalTeam"
      );

    const place =
      positiveInteger(
        valueOf(
          "historicalPlace"
        )
      );

    const totalWeight =
      nonNegative(
        valueOf(
          "historicalWeight"
        )
      );

    const totalCount =
      nonNegativeInteger(
        valueOf(
          "historicalFishCount"
        )
      );

    if (!team) {
      throw new Error(
        "Введи назву команди."
      );
    }

    if (place === null) {
      throw new Error(
        "Місце має бути цілим числом від 1."
      );
    }

    if (
      totalWeight === null
    ) {
      throw new Error(
        "Введи коректну сумарну вагу."
      );
    }

    if (
      totalCount === null
    ) {
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
        "Якщо є риба, вага має бути більшою за нуль."
      );
    }

    payload.teamName =
      team;

    payload.place =
      place;

    payload.totalWeight =
      Number(
        totalWeight.toFixed(3)
      );

    payload.totalCount =
      totalCount;

    return payload;
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
        "Спочатку обери історичний турнір."
      );
    }

    const payload =
      collectHistoricalResult();

    const sector =
      payload.lakeSectorNumber;

    const ref =
      historySectorRef(
        S.current.id,
        sector
      );

    const stamp =
      serverTimestamp();

    await timed(
      S.db.runTransaction(
        async transaction => {
          const [
            tournament,
            existing
          ] = await Promise.all([
            transaction.get(
              historyRef(
                S.current.id
              )
            ),

            transaction.get(
              ref
            )
          ]);

          if (!tournament.exists) {
            throw new Error(
              "Турнір більше не існує."
            );
          }

          const old =
            existing.exists
              ? existing.data()
              : null;

          transaction.set(
            ref,
            {
              ...payload,

              createdAt:
                old?.createdAt ||
                stamp,

              createdBy:
                old?.createdBy ||
                OWNER_UID,

              updatedAt:
                stamp,

              updatedBy:
                OWNER_UID
            }
          );
        }
      ),

      "Не вдалося зберегти результат сектора."
    );

    S.historicalRows[sector] = {
      ...payload
    };

    render();
    selectSector(sector);

    message(
      `Результат фізичного сектора №${sector} збережено.`,
      "ok"
    );

    setText(
      "historicalResultStatus",
      "Збережено у Firestore."
    );
  }

  // ==========================================================
  // DELETE HISTORICAL RESULT
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

    if (
      !S.historicalRows[sector]
    ) {
      message(
        "Для цього сектора немає результату."
      );

      return;
    }

    if (
      !window.confirm(
        `Видалити історичний результат сектора №${sector}?`
      )
    ) {
      return;
    }

    await timed(
      historySectorRef(
        S.current.id,
        sector
      ).delete(),

      "Не вдалося видалити результат."
    );

    delete S.historicalRows[
      sector
    ];

    render();
    selectSector(sector);

    message(
      `Результат сектора №${sector} видалено.`,
      "ok"
    );
  }

  // ==========================================================
  // HISTORICAL META
  // ==========================================================

  function resetHistoricalMetaForm() {
    [
      "historicalTitle",
      "historicalOrganizer",
      "historicalStart",
      "historicalEnd"
    ].forEach(id => {
      if ($(id)) {
        $(id).value = "";
      }
    });

    if ($("historicalLake")) {
      $("historicalLake").value =
        LAKE_ID;
    }
  }

  function collectHistoricalMeta() {
    const title =
      valueOf(
        "historicalTitle"
      );

    const organizer =
      valueOf(
        "historicalOrganizer"
      );

    const lakeId =
      valueOf(
        "historicalLake"
      ) || LAKE_ID;

    const startDate =
      valueOf(
        "historicalStart"
      );

    const endDate =
      valueOf(
        "historicalEnd"
      );

    if (!title) {
      throw new Error(
        "Введи назву історичного турніру."
      );
    }

    if (
      lakeId !== LAKE_ID
    ) {
      throw new Error(
        "Ця карта підтримує тільки Лелехівку."
      );
    }

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      throw new Error(
        "Дата завершення не може бути раніше дати початку."
      );
    }

    return {
      title,
      organizer,
      lakeId,

      startDate:
        startDate || null,

      endDate:
        endDate || null
    };
  }

  // ==========================================================
  // CREATE HISTORICAL EVENT
  // ==========================================================

  async function saveHistoricalMeta() {
    requireAccess();

    if (
      S.mode !== MODE.HISTORICAL ||
      !S.creatingHistorical
    ) {
      return;
    }

    const meta =
      collectHistoricalMeta();

    const year =
      valueOf(
        "historicalYear"
      );

    if (!validYear(year)) {
      throw new Error(
        "Введи коректний рік."
      );
    }

    const ref =
      historyCollection().doc();

    const stamp =
      serverTimestamp();

    await timed(
      ref.set({
        schemaVersion: 1,

        year,
        ...meta,

        revision: 1,

        createdAt:
          stamp,

        createdBy:
          OWNER_UID,

        updatedAt:
          stamp,

        updatedBy:
          OWNER_UID
      }),

      "Не вдалося створити турнір."
    );

    S.creatingHistorical =
      false;

    await loadYear();

    if ($("historicalTournament")) {
      $("historicalTournament").value =
        ref.id;
    }

    await loadStage(
      ref.id
    );

    message(
      "Історичний турнір створено. Тепер можна вносити результати секторів.",
      "ok"
    );
  }

  // ==========================================================
  // CHANGED
  // ==========================================================

  function changed() {
    S.dirty = true;

    render();
    selectSector(
      S.selected
    );
  }

  // ==========================================================
  // SAVE SECTOR MAP
  // ==========================================================

  async function saveSectorMap() {
    requireAccess();

    if (
      !S.current ||
      S.mode === MODE.HISTORICAL
    ) {
      throw new Error(
        "Спочатку обери етап."
      );
    }

    if (
      S.prepareLocked
    ) {
      throw new Error(
        S.prepareLockReason ||
        "Редагування карти заблоковано."
      );
    }

    const check =
      inspectMap();

    if (
      check.errors.length
    ) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const year =
      S.year;

    const id =
      S.current.id;

    const expectedRevision =
      S.revision;

    const assignments =
      S.assignments
        .map(item => ({
          lakeSectorId:
            `sector-${item.lakeSectorNumber}`,

          lakeSectorNumber:
            item.lakeSectorNumber,

          zone:
            item.zone,

          sector:
            item.sector,

          drawKey:
            item.drawKey
        }))
        .sort(
          sortAssignments
        );

    const emptyLakeSectors = [
      ...new Set(
        S.empty
      )
    ].sort(
      (a, b) => a - b
    );

    const ref =
      mapRef(year, id);

    const sourceRef =
      S.db.doc(
        S.sourcePath
      );

    // Повторна перевірка перед записом.
    // Якщо перевірка не пройде, запис не виконується.

    if (
      S.mode === MODE.PREPARE
    ) {
      const lock =
        await checkPrepareLock(
          S.current
        );

      if (lock.locked) {
        S.prepareLocked = true;
        S.prepareLockReason =
          lock.reason;

        throw new Error(
          "Жеребкування вже розпочалося.\n" +
          lock.reason
        );
      }
    }

    await timed(
      S.db.runTransaction(
        async transaction => {
          const [
            source,
            saved
          ] = await Promise.all([
            transaction.get(
              sourceRef
            ),

            transaction.get(
              ref
            )
          ]);

          requireAccess();

          if (!source.exists) {
            throw new Error(
              "Джерело етапу більше не існує."
            );
          }

          if (
            S.mode === MODE.ARCHIVE
          ) {
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
                "Архівні результати змінилися. Перезавантаж етап."
              );
            }
          }

          if (
            S.mode === MODE.PREPARE
          ) {
            const currentStages =
              competitionStages({
                id:
                  S.current.competitionId,

                data: () =>
                  source.data()
              });

            const exists =
              currentStages.some(
                stage =>
                  stage.id === id &&
                  stage.year === year &&
                  stage.lakeId ===
                    LAKE_ID
              );

            if (!exists) {
              throw new Error(
                "Конфігурація змагання змінилася. Перезавантаж етап."
              );
            }
          }

          const old =
            saved.exists
              ? saved.data()
              : null;

          if (
            Number(
              old?.revision || 0
            ) !==
            expectedRevision
          ) {
            throw new Error(
              "Карту змінили в іншій вкладці. Перезавантаж її."
            );
          }

          if (old) {
            if (
              txt(old.seasonYear) !==
                year ||
              old.stageDocId !==
                id ||
              old.lakeId !==
                LAKE_ID
            ) {
              throw new Error(
                "Існуюча карта належить іншому етапу."
              );
            }

            const oldSource =
              txt(
                old.sourcePath
              );

            const archived =
              oldSource.startsWith(
                "seasonResults/"
              ) ||
              oldSource.startsWith(
                "oneoffResults/"
              );

            if (
              S.mode === MODE.PREPARE &&
              archived
            ) {
              throw new Error(
                "Це вже архівна карта. Режим підготовки не може її перезаписати."
              );
            }

            if (
              S.mode === MODE.ARCHIVE &&
              oldSource &&
              oldSource !==
                S.sourcePath &&
              archived
            ) {
              throw new Error(
                "Карта прив'язана до іншого архівного джерела."
              );
            }
          }

          const stamp =
            serverTimestamp();

          const status =
            check.ready
              ? (
                  S.mode ===
                  MODE.PREPARE
                    ? "prepared"
                    : "ready"
                )
              : "draft";

          const payload = {
            schemaVersion: 1,

            lakeId:
              LAKE_ID,

            mapVersion: 1,

            seasonYear:
              year,

            stageDocId:
              id,

            stageTitle:
              S.current.title,

            sourcePath:
              S.sourcePath,

            assignments,

            emptyLakeSectors,

            status,

            revision:
              expectedRevision + 1,

            createdAt:
              old?.createdAt ||
              stamp,

            createdBy:
              old?.createdBy ||
              OWNER_UID,

            updatedAt:
              stamp,

            updatedBy:
              OWNER_UID
          };

          if (
            S.mode === MODE.ARCHIVE
          ) {
            payload.sourceSignature =
              S.sourceHash;
          } else {
            payload.competitionId =
              S.current.competitionId;

            payload.stageKey =
              S.current.stageKey;

            payload.entryType =
              S.current.entryType ||
              "team";

            payload.format =
              S.current.format ||
              "";
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

    const status =
      check.ready
        ? (
            S.mode ===
            MODE.PREPARE
              ? "prepared"
              : "ready"
          )
        : "draft";

    message(
      `Карту збережено. Статус: ${status}.`,
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
      !canvas
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

    canvas.style.height =
      "auto";

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

    controls();
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
      !Object.values(
        MODE
      ).includes(mode)
    ) {
      return;
    }

    if (!mayLeave()) {
      return;
    }

    S.mode = mode;

    S.creatingHistorical =
      false;

    clearSelectedStage();

    updateModeUI();

    await run(
      loadYear
    );
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  function bindEvents() {
    document
      .querySelectorAll(
        "[data-map-mode]"
      )
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
      "mapYear",
      "keydown",
      event => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();

          if (mayLeave()) {
            run(loadYear);
          }
        }
      }
    );

    on(
      "historicalYear",
      "keydown",
      event => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();

          if (mayLeave()) {
            run(loadYear);
          }
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
          select.value =
            previous;

          return;
        }

        if (!id) {
          clearSelectedStage();
          return;
        }

        run(async () => {
          try {
            await loadStage(id);
          } catch (error) {
            select.value =
              previous;

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
          select.value =
            previous;

          return;
        }

        if (!id) {
          clearSelectedStage();
          return;
        }

        run(async () => {
          try {
            await loadStage(id);
          } catch (error) {
            select.value =
              previous;

            throw error;
          }
        });
      }
    );

    on(
      "newHistorical",
      "click",
      () => {
        if (
          S.mode !==
          MODE.HISTORICAL
        ) {
          return;
        }

        if (!mayLeave()) {
          return;
        }

        clearSelectedStage();

        resetHistoricalMetaForm();

        S.creatingHistorical =
          true;

        updateModeUI();
        controls();

        message(
          "Заповни дані нового історичного турніру."
        );
      }
    );

    on(
      "saveHistoricalMeta",
      "click",
      () => {
        run(
          saveHistoricalMeta
        );
      }
    );

    on(
      "lakeSector",
      "change",
      () => {
        selectSector(
          Number(
            valueOf(
              "lakeSector"
            )
          )
        );
      }
    );

    [
      "archiveSlot",
      "manualZone",
      "manualNumber"
    ].forEach(id => {
      on(
        id,
        "input",
        preview
      );

      on(
        id,
        "change",
        preview
      );
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
        run(
          saveSectorMap
        );
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
        run(
          saveHistoricalResult
        );
      }
    );

    on(
      "clearHistoricalResult",
      "click",
      () => {
        run(
          clearHistoricalResult
        );
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

    on(
      "lakeImage",
      "load",
      () => {
        setHidden(
          "imageError",
          true
        );

        resizeMap();
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

    if (
      !window.scDb ||
      !window.scAuth
    ) {
      await timed(
        new Promise(resolve => {
          const interval =
            setInterval(() => {
              if (
                window.scDb &&
                window.scAuth
              ) {
                clearInterval(
                  interval
                );

                resolve();
              }
            }, 100);
        }),

        "Firebase не ініціалізовано."
      );
    }

    S.db =
      window.scDb;

    S.auth =
      window.scAuth;
  }

  function waitAuth() {
    return timed(
      new Promise(
        (resolve, reject) => {
          let unsubscribe =
            null;

          let settled =
            false;

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

      if (!$("mapApp")) {
        throw new Error(
          "HTML не містить #mapApp."
        );
      }

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

      const profile =
        await read(
          S.db.collection(
            "users"
          ).doc(
            user.uid
          )
        );

      if (
        !profile.exists ||
        profile.data()?.role !==
          "admin"
      ) {
        throw new Error(
          "Акаунт не має ролі admin."
        );
      }

      S.allowed = true;

      S.auth.onAuthStateChanged(
        value => {
          if (
            value?.uid !==
            OWNER_UID
          ) {
            S.allowed =
              false;

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
        validYear(
          requestedYear
        )
          ? requestedYear
          : String(
              new Date()
                .getFullYear()
            );

      S.year = year;

      if ($("mapYear")) {
        $("mapYear").value =
          year;
      }

      if ($("historicalYear")) {
        $("historicalYear").value =
          year;
      }

      if ($("lakeSector")) {
        $("lakeSector").innerHTML =
          POINTS.map(
            ([sector]) =>
              option(
                sector,
                `Сектор озера №${sector}`
              )
          ).join("");
      }

      setHidden(
        "mapApp",
        false
      );

      setHidden(
        "imageError",
        true
      );

      updateModeUI();

      bindEvents();

      controls();

      await run(
        loadYear
      );

    } catch (error) {
      console.error(error);

      message(
        errorMessage(error),
        "error"
      );
    }
  }

  // ==========================================================
  // START
  // ==========================================================

  if (
    document.readyState ===
    "loading"
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
