// ============================================================
// STOLAR CARP • КАРТИ СЕКТОРІВ
// Версія: 2.0 • 08.10.2026
//
// РЕЖИМИ:
//
// 1. PREPARE
//    Підготовка фізичних секторів до жеребкування.
//    Джерело: competitions
//    Збереження:
//    sectorMaps/{year}/stages/{compId}__{stageKey}
//
// 2. ARCHIVE
//    Прив'язка завершених етапів STOLAR CARP.
//    Джерело:
//    seasonResults/{year}/stages/{stageDocId}
//    Збереження:
//    sectorMaps/{year}/stages/{stageDocId}
//
// 3. HISTORY
//    Старі турніри та інші організатори.
//    Збереження:
//    historicalSectorResults/{year}/tournaments/{id}
//
//    Дані:
//    - команда
//    - місце
//    - сумарна вага
//    - кількість риб
//
// ВАЖЛИВО:
// - Архівні результати не змінюються.
// - LIVE не змінюється.
// - Історичні дані не впливають на сезонний рейтинг.
// - Фізичні сектори Лелехівки: 1–26.
// - Збережена схема sectorMaps сумісна з draw_admin.js.
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // CONFIG
  // ==========================================================

  const VERSION = "2.0";

  const OWNER_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const LAKE_ID = "lelehivka";

  const MAX_LAKE_SECTOR = 26;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;

  const REQUEST_TIMEOUT = 20000;

  const MODE = {
    PREPARE: "prepare",
    ARCHIVE: "archive",
    HISTORY: "history"
  };

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
    POINTS.map(p => p[0])
  );

  // ==========================================================
  // HELPERS
  // ==========================================================

  const $ = id =>
    document.getElementById(id);

  const txt = value =>
    String(value ?? "").trim();

  function esc(value) {
    return txt(value).replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c])
    );
  }

  function num(value) {
    if (
      value == null ||
      txt(value) === "" ||
      typeof value === "boolean"
    ) {
      return null;
    }

    const n = Number(
      txt(value).replace(",", ".")
    );

    return Number.isFinite(n)
      ? n
      : null;
  }

  function nonNegative(value) {
    const n = num(value);

    return n != null && n >= 0
      ? n
      : null;
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

    let raw = latin(sectorValue)
      .replace(/[\s_-]+/g, "");

    const match = raw.match(/^([ABC])(\d+)$/);

    if (match) {
      if (
        zone &&
        zone !== match[1]
      ) {
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

  function teamName(row) {
    return txt(
      row?.teamName ||
      row?.team ||
      row?.participantName ||
      row?.name
    ) || "—";
  }

  function weight(value) {
    const n = nonNegative(value);

    return n == null
      ? "—"
      : n.toFixed(3);
  }

  function sortSlots(a, b) {
    return (
      a.zone.localeCompare(b.zone) ||
      a.sector - b.sector
    );
  }

  function setText(id, value) {
    const el = $(id);

    if (el) {
      el.textContent = value;
    }
  }

  function setHidden(id, hidden) {
    const el = $(id);

    if (el) {
      el.hidden = Boolean(hidden);
    }
  }

  function setDisabled(id, disabled) {
    const el = $(id);

    if (el) {
      el.disabled = Boolean(disabled);
    }
  }

  function safeId(value) {
    return txt(value)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

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
        "Для перевірки архіву потрібне HTTPS-з'єднання."
      );
    }

    const bytes = new TextEncoder().encode(
      JSON.stringify(canonical(value))
    );

    const hash = await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return [...new Uint8Array(hash)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
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

    started: false
  };

  // ==========================================================
  // STATUS
  // ==========================================================

  function message(value, kind = "") {
    const el = $("mapStatus");

    if (el) {
      el.textContent = value;
      el.dataset.kind = kind;
    }

    console.log(
      `[Sector maps v${VERSION}]`,
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
        "Перевір правила доступу до відповідної колекції.\n" +
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
    ]).finally(() => clearTimeout(timer));
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
        "Доступ дозволено тільки адміністратору."
      );
    }
  }

  function controls() {
    const locked =
      S.busy || !S.allowed;

    setDisabled("loadYear", locked);
    setDisabled("mapYear", locked);
    setDisabled("mapStage", locked);

    setDisabled(
      "editFields",
      locked || !S.current
    );

    setDisabled(
      "saveMap",
      locked ||
      !S.current ||
      !S.dirty
    );

    setDisabled(
      "createHistory",
      locked
    );

    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.disabled = locked;
      });
  }

  // ==========================================================
  // FIRESTORE REFERENCES
  // ==========================================================

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

  function historyRef(year, id) {
    return historyCollection(year).doc(id);
  }

  // ==========================================================
  // DYNAMIC HTML
  // ==========================================================

  function installInterface() {
    const app = $("mapApp");

    if (!app) {
      throw new Error(
        "HTML не містить #mapApp."
      );
    }

    const firstCard =
      app.querySelector(".maps-card");

    if (!firstCard) {
      throw new Error(
        "Не знайдено блок вибору етапу."
      );
    }

    // --------------------------------------------------------
    // MODE SELECTOR
    // --------------------------------------------------------

    const modeCard =
      document.createElement("section");

    modeCard.className = "maps-card";

    modeCard.id = "mapModeCard";

    modeCard.innerHTML = `
      <h2>Режим роботи</h2>

      <div class="sc-map-modes">

        <button
          type="button"
          data-map-mode="prepare"
        >
          <strong>🟢 Підготовка</strong>
          <small>
            Майбутні змагання · до жеребкування
          </small>
        </button>

        <button
          type="button"
          data-map-mode="archive"
        >
          <strong>🔵 Архівні етапи</strong>
          <small>
            Завершені змагання STOLAR CARP
          </small>
        </button>

        <button
          type="button"
          data-map-mode="history"
        >
          <strong>🟡 Історичні</strong>
          <small>
            Старі турніри · інші організатори
          </small>
        </button>

      </div>

      <p
        id="modeDescription"
        class="maps-preview"
      ></p>
    `;

    app.insertBefore(
      modeCard,
      firstCard
    );

    // --------------------------------------------------------
    // HISTORY CREATION
    // --------------------------------------------------------

    const historyCard =
      document.createElement("section");

    historyCard.id = "historyCreateCard";
    historyCard.className = "maps-card";
    historyCard.hidden = true;

    historyCard.innerHTML = `
      <h2>Додати історичний турнір</h2>

      <div class="maps-row">

        <label class="maps-field">
          Назва турніру

          <input
            id="historyTitle"
            maxlength="160"
            placeholder="Наприклад: Кубок Лелехівки"
          >
        </label>

        <label class="maps-field">
          Організатор

          <input
            id="historyOrganizer"
            maxlength="120"
            placeholder="Назва організатора"
          >
        </label>

      </div>

      <div class="maps-row" style="margin-top:12px">

        <button
          id="createHistory"
          type="button"
          class="primary"
        >
          Створити турнір
        </button>

      </div>
    `;

    app.insertBefore(
      historyCard,
      firstCard.nextSibling
    );

    // --------------------------------------------------------
    // HISTORICAL RESULTS EDITOR
    // --------------------------------------------------------

    const historyEditor =
      document.createElement("div");

    historyEditor.id = "historicalEditor";
    historyEditor.hidden = true;

    historyEditor.innerHTML = `
      <section class="maps-card">

        <h2>
          Історичний результат сектора
        </h2>

        <p class="maps-muted">
          Дані вводяться для вибраного фізичного
          сектора водойми.
        </p>

        <p
          id="historicalSectorLabel"
          class="maps-preview"
        ></p>

        <div class="maps-row">

          <label class="maps-field wide">
            Команда

            <input
              id="historicalTeam"
              maxlength="160"
              placeholder="Назва команди"
            >
          </label>

          <label class="maps-field">
            Зайняте місце

            <input
              id="historicalPlace"
              type="number"
              min="1"
              step="1"
              placeholder="1"
            >
          </label>

          <label class="maps-field">
            Сумарна вага, кг

            <input
              id="historicalWeight"
              inputmode="decimal"
              placeholder="0.000"
            >
          </label>

          <label class="maps-field">
            Кількість риб

            <input
              id="historicalCount"
              type="number"
              min="0"
              step="1"
              placeholder="0"
            >
          </label>

        </div>

        <div class="maps-row" style="margin-top:12px">

          <button
            id="historicalApply"
            type="button"
            class="primary"
          >
            Додати результат
          </button>

          <button
            id="historicalRemove"
            type="button"
            class="danger"
          >
            Видалити результат
          </button>

        </div>

        <p class="maps-muted">
          Після внесення результатів натисни
          «Зберегти карту етапу».
        </p>

      </section>
    `;

    const editor = $("mapEditor");

    editor.appendChild(historyEditor);

    // --------------------------------------------------------
    // STYLES
    // --------------------------------------------------------

    const style =
      document.createElement("style");

    style.id = "scMapV2Styles";

    style.textContent = `
      .sc-map-modes {
        display: grid;
        gap: 10px;
      }

      .sc-map-modes button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;

        width: 100%;

        min-height: 72px;

        padding: 14px;

        text-align: left;

        background: #1e293b;

        border: 1px solid #475569;
        border-radius: 14px;
      }

      .sc-map-modes strong {
        font-size: 16px;
      }

      .sc-map-modes small {
        max-width: 48%;

        color: #a8b6c9;

        font-size: 12px;
        text-align: right;
      }

      .sc-map-modes button.active {
        border-color: #facc15;

        color: #facc15;

        background: #292719;

        box-shadow:
          0 0 0 1px rgba(250,204,21,.25);
      }

      #mapPins .map-pin {
        width: 23px !important;
        height: 23px !important;

        min-width: 0 !important;
        min-height: 0 !important;

        padding: 0 !important;

        border-radius: 50% !important;

        border: 1.5px solid #ffffff;

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        line-height: 1;

        box-shadow:
          0 1px 4px rgba(0,0,0,.75);

        pointer-events: auto;
      }

      #mapPins .map-pin > span {
        font-size: 11px;
        font-weight: 900;
      }

      #mapPins .map-pin > small {
        font-size: 6px;
        font-weight: 800;

        line-height: 1;

        white-space: nowrap;
      }

      #mapPins .map-pin[data-zone="A"] {
        background: #14783d;
      }

      #mapPins .map-pin[data-zone="B"] {
        background: #2059bc;
      }

      #mapPins .map-pin[data-zone="C"] {
        background: #ba242b;
      }

      #mapPins .map-pin[aria-pressed="true"] {
        z-index: 10;

        border: 2px solid #ffd21c;

        box-shadow:
          0 0 0 1px rgba(255,210,28,.65),
          0 0 7px rgba(255,210,28,.7);
      }

      @media (max-width:640px) {

        .sc-map-modes button {
          min-height: 68px;
          padding: 12px;
        }

        .sc-map-modes strong {
          font-size: 14px;
        }

        .sc-map-modes small {
          font-size: 11px;
        }

        #mapPins .map-pin {
          width: 15px !important;
          height: 15px !important;
        }

        #mapPins .map-pin > span {
          font-size: 8px;
        }

        #mapPins .map-pin > small {
          font-size: 4.5px;
        }

        #mapPins .map-pin[aria-pressed="true"] {
          border-width: 1.5px;
        }

      }
    `;

    document.head.appendChild(style);

    // --------------------------------------------------------
    // UPDATE LABELS
    // --------------------------------------------------------

    const heading =
      document.querySelector(".maps-page h1");

    if (heading) {
      heading.textContent =
        "🗺️ Карти секторів";
    }

    const subtitle =
      heading?.nextElementSibling;

    if (subtitle) {
      subtitle.textContent =
        "Лелехівка · фізичні сектори водойми №1–26";
    }
  }

  // ==========================================================
  // MODE
  // ==========================================================

  function modeDescription() {
    if (S.mode === MODE.PREPARE) {
      return (
        "Підготовка. Обери рік і майбутній етап. " +
        "Розподіли фізичні сектори водойми між " +
        "зонами A/B/C перед жеребкуванням."
      );
    }

    if (S.mode === MODE.HISTORY) {
      return (
        "Історичні турніри. Створи турнір або " +
        "відкрий існуючий. Для кожного сектора " +
        "внеси команду, місце, вагу та кількість риб."
      );
    }

    return (
      "Архівні етапи. Обери рік і завершений " +
      "етап STOLAR CARP. Прив'яжи результати " +
      "до фізичних секторів водойми."
    );
  }

  function updateModeUI() {
    document
      .querySelectorAll("[data-map-mode]")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.mapMode === S.mode
        );
      });

    setText(
      "modeDescription",
      modeDescription()
    );

    setHidden(
      "historyCreateCard",
      S.mode !== MODE.HISTORY
    );

    setHidden(
      "historicalEditor",
      S.mode !== MODE.HISTORY ||
      !S.current
    );

    const label =
      document.querySelector(
        'label:has(> #mapStage)'
      );

    if (label) {
      label.firstChild.textContent =
        S.mode === MODE.PREPARE
          ? "Етап для підготовки "
          : S.mode === MODE.HISTORY
            ? "Історичний турнір "
            : "Архівний етап ";
    }

    setText(
      "saveMap",
      S.mode === MODE.PREPARE
        ? "Зберегти розстановку"
        : S.mode === MODE.HISTORY
          ? "Зберегти історичний турнір"
          : "Зберегти карту етапу"
    );
  }

  async function switchMode(mode) {
    if (
      !Object.values(MODE).includes(mode)
    ) {
      return;
    }

    if (!mayLeave()) {
      return;
    }

    S.mode = mode;

    S.current = null;
    S.stages = [];

    S.assignments = [];
    S.empty = [];

    S.historicalRows = {};

    S.revision = 0;
    S.dirty = false;

    $("mapStage").innerHTML =
      '<option value="">Обери етап</option>';

    setHidden("mapEditor", true);

    updateModeUI();

    await run(loadYear);
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
          "У документі немає масиву standings."
        ]
      };
    }

    rows.forEach((row, index) => {
      const slot = parseSlot(
        row?.zone || row?.drawZone,
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

  function hasCatch(row) {
    if (!row) return false;

    const keys = [
      "totalWeight",
      "totalCount",
      "bigFish",
      "carpCount",
      "amurCount",
      "sturgeonCount"
    ];

    if (
      keys.some(
        key => (nonNegative(row[key]) || 0) > 0
      )
    ) {
      return true;
    }

    const weighings =
      row.weighings &&
      typeof row.weighings === "object"
        ? Object.values(row.weighings)
        : [];

    return weighings.some(w => {
      if (!w || typeof w !== "object") {
        return false;
      }

      return (
        (nonNegative(w.total) || 0) > 0 ||
        (nonNegative(w.count) || 0) > 0
      );
    });
  }

  // ==========================================================
  // PREPARE STAGES
  // ==========================================================

  function competitionYear(data) {
    const direct =
      num(data?.seasonYear) ??
      num(data?.year);

    if (
      Number.isInteger(direct) &&
      direct >= 2000 &&
      direct <= 2100
    ) {
      return String(direct);
    }

    const date =
      data?.startDate ||
      data?.startAt ||
      data?.date;

    if (date?.toDate) {
      return String(
        date.toDate().getFullYear()
      );
    }

    const raw = txt(date);

    const match =
      raw.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);

    return match
      ? match[1]
      : "";
  }

  function competitionStages(doc) {
    const data = doc.data();

    const events =
      Array.isArray(data.events) &&
      data.events.length
        ? data.events
        : [{
            key: "main",
            title: "Основний етап"
          }];

    return events.map((event, index) => {
      const stageKey = txt(
        event.key ||
        event.stageId ||
        event.id ||
        `stage-${index + 1}`
      );

      const title =
        txt(data.title || data.name || doc.id);

      const eventTitle =
        txt(event.title || event.name || stageKey);

      return {
        id: `${doc.id}__${stageKey}`,

        title: `${title} · ${eventTitle}`,

        competitionId: doc.id,
        stageKey,

        competition: data,
        event,

        year: competitionYear(data),

        lakeId: txt(
          event.lakeId ||
          data.lakeId ||
          LAKE_ID
        )
      };
    });
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

  async function loadArchiveStages(year) {
    const snapshot = await read(
      S.db
        .collection("seasonResults")
        .doc(year)
        .collection("stages")
    );

    return snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,

        title: txt(
          data.stageName ||
          data.title ||
          data.stageId ||
          doc.id
        ),

        data
      };
    });
  }

  // ==========================================================
  // HISTORICAL STAGES
  // ==========================================================

  async function loadHistoricalStages(year) {
    const snapshot = await read(
      historyCollection(year)
    );

    return snapshot.docs.map(doc => ({
      id: doc.id,

      title: txt(
        doc.data().title ||
        doc.id
      ),

      data: doc.data()
    }));
  }

  // ==========================================================
  // LOAD YEAR
  // ==========================================================

  async function loadYear() {
    requireAccess();

    const year =
      txt($("mapYear").value);

    if (!/^20\d{2}$/.test(year)) {
      throw new Error(
        "Введи коректний рік."
      );
    }

    S.year = year;

    message(
      `Завантажую дані за ${year} рік…`
    );

    let stages = [];

    if (S.mode === MODE.PREPARE) {
      stages = await loadPrepareStages(year);
    }

    if (S.mode === MODE.ARCHIVE) {
      stages = await loadArchiveStages(year);
    }

    if (S.mode === MODE.HISTORY) {
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

    S.stages = stages;

    S.current = null;
    S.dirty = false;

    setHidden("mapEditor", true);

    $("mapStage").innerHTML =
      '<option value="">Обери етап</option>' +
      stages.map(stage => `
        <option value="${esc(stage.id)}">
          ${esc(stage.title)}
        </option>
      `).join("");

    message(
      stages.length
        ? `Знайдено етапів: ${stages.length}. Обери потрібний.`
        : "Етапів поки немає."
    );
  }

  // ==========================================================
  // CREATE HISTORY
  // ==========================================================

  async function createHistory() {
    requireAccess();

    const title =
      txt($("historyTitle").value);

    const organizer =
      txt($("historyOrganizer").value);

    if (!title) {
      throw new Error(
        "Введи назву турніру."
      );
    }

    const id =
      `historical-${Date.now()}-${safeId(title)}`;

    const ref =
      historyRef(S.year, id);

    const stamp =
      firebase.firestore.FieldValue
        .serverTimestamp();

    await timed(
      ref.set({
        schemaVersion: 1,

        lakeId: LAKE_ID,

        year: S.year,

        title,
        organizer,

        assignments: [],
        emptyLakeSectors: [],

        results: [],

        revision: 1,

        createdAt: stamp,
        createdBy: OWNER_UID,

        updatedAt: stamp,
        updatedBy: OWNER_UID
      }),

      "Не вдалося створити історичний турнір."
    );

    await loadYear();

    $("mapStage").value = id;

    await loadStage(id);
  }

  // ==========================================================
  // LOAD STAGE
  // ==========================================================

  async function loadStage(id) {
    requireAccess();

    const stage =
      S.stages.find(item => item.id === id);

    if (!stage) {
      throw new Error(
        "Етап не знайдено."
      );
    }

    message(
      "Завантажую карту…"
    );

    let saved = null;
    let rows = [];
    let data = null;

    let sourceHash = "";

    if (S.mode === MODE.ARCHIVE) {
      const [source, map] =
        await Promise.all([
          read(archiveRef(S.year, id)),
          read(mapRef(S.year, id))
        ]);

      if (!source.exists) {
        throw new Error(
          "Архівний етап не знайдено."
        );
      }

      data = source.data();

      rows = data.standings;

      sourceHash =
        await fingerprint(rows ?? null);

      saved = map.exists
        ? map.data()
        : null;
    }

    if (S.mode === MODE.PREPARE) {
      const map =
        await read(mapRef(S.year, id));

      saved = map.exists
        ? map.data()
        : null;

      data = stage.competition;
    }

    if (S.mode === MODE.HISTORY) {
      const history =
        await read(historyRef(S.year, id));

      if (!history.exists) {
        throw new Error(
          "Історичний турнір не знайдено."
        );
      }

      saved = history.data();
      data = saved;

      rows = Array.isArray(saved.results)
        ? saved.results
        : [];
    }

    if (
      saved &&
      saved.lakeId &&
      saved.lakeId !== LAKE_ID
    ) {
      throw new Error(
        "Карта належить іншій водоймі."
      );
    }

    if (
      saved &&
      S.mode !== MODE.HISTORY &&
      (
        saved.seasonYear !== S.year ||
        saved.stageDocId !== id ||
        saved.schemaVersion !== 1
      )
    ) {
      throw new Error(
        "Збережена карта має несумісну схему."
      );
    }

    S.current = {
      ...stage,
      data,
      rows
    };

    S.assignments =
      Array.isArray(saved?.assignments)
        ? saved.assignments.map(a => ({
            ...a
          }))
        : [];

    S.empty =
      Array.isArray(saved?.emptyLakeSectors)
        ? [...saved.emptyLakeSectors]
        : [];

    S.historicalRows = {};

    if (S.mode === MODE.HISTORY) {
      rows.forEach(row => {
        const n =
          Number(row.lakeSectorNumber);

        if (VALID_SECTORS.has(n)) {
          S.historicalRows[n] = {
            ...row
          };
        }
      });
    }

    S.revision =
      Number(saved?.revision || 0);

    S.sourceHash = sourceHash;

    S.selected = 1;
    S.zoom = 1;

    S.dirty =
      S.mode === MODE.ARCHIVE &&
      Boolean(
        saved &&
        saved.sourceSignature !== sourceHash
      );

    setText(
      "selectedStageTitle",
      `${S.year} · ${stage.title}`
    );

    setHidden("mapEditor", false);

    updateModeUI();

    render();

    selectSector(1);

    requestAnimationFrame(resizeMap);

    message(
      saved
        ? "Карту завантажено."
        : "Нова карта. Можна починати розстановку.",
      "ok"
    );
  }

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function inspectMap() {
    const errors = [];
    const incomplete = [];

    const physical = new Set();
    const drawKeys = new Set();

    const source =
      S.mode === MODE.ARCHIVE
        ? readRows(S.current?.rows)
        : null;

    if (source) {
      incomplete.push(...source.issues);
    }

    for (const a of S.assignments) {
      const n =
        Number(a.lakeSectorNumber);

      const slot =
        parseSlot(a.zone, a.sector);

      if (
        !VALID_SECTORS.has(n) ||
        !slot ||
        slot.drawKey !== a.drawKey
      ) {
        errors.push(
          `Некоректна прив'язка сектора №${n}.`
        );

        continue;
      }

      if (physical.has(n)) {
        errors.push(
          `Сектор озера №${n} повторюється.`
        );
      }

      if (drawKeys.has(slot.drawKey)) {
        errors.push(
          `Позначення ${slot.drawKey} повторюється.`
        );
      }

      physical.add(n);
      drawKeys.add(slot.drawKey);

      if (S.mode === MODE.ARCHIVE) {
        const row =
          source.slots.get(a.drawKey)?.row;

        if (
          !row &&
          !S.empty.includes(n)
        ) {
          incomplete.push(
            `${a.drawKey}: немає результату.`
          );
        }

        if (
          row &&
          !S.empty.includes(n) &&
          (
            nonNegative(row.totalWeight) == null ||
            nonNegative(row.totalCount) == null
          )
        ) {
          incomplete.push(
            `${a.drawKey}: бракує ваги або кількості риб.`
          );
        }

        if (
          S.empty.includes(n) &&
          hasCatch(row)
        ) {
          errors.push(
            `${a.drawKey}: є улов, але сектор позначено порожнім.`
          );
        }
      }
    }

    for (const n of S.empty) {
      if (!physical.has(n)) {
        errors.push(
          `Порожній сектор №${n} не має прив'язки.`
        );
      }
    }

    if (!S.assignments.length) {
      incomplete.push(
        "Ще немає прив'язок."
      );
    }

    if (S.mode === MODE.ARCHIVE) {
      const missing =
        [...source.slots.keys()]
          .filter(key => !drawKeys.has(key));

      if (missing.length) {
        incomplete.push(
          `Не прив'язано: ${missing.join(", ")}.`
        );
      }
    }

    if (S.mode === MODE.HISTORY) {
      for (
        const [sector, row] of
        Object.entries(S.historicalRows)
      ) {
        const n = Number(sector);

        if (!physical.has(n)) {
          errors.push(
            `Результат сектора №${n} не має прив'язки.`
          );
        }

        if (!txt(row.teamName)) {
          errors.push(
            `Сектор №${n}: немає назви команди.`
          );
        }

        if (
          !Number.isInteger(row.place) ||
          row.place < 1
        ) {
          errors.push(
            `Сектор №${n}: некоректне місце.`
          );
        }

        if (
          nonNegative(row.totalWeight) == null ||
          !Number.isInteger(row.totalCount) ||
          row.totalCount < 0
        ) {
          errors.push(
            `Сектор №${n}: некоректна вага або кількість риб.`
          );
        }
      }
    }

    return {
      errors,
      incomplete,

      ready:
        !errors.length &&
        !incomplete.length,

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
    if (S.mode === MODE.ARCHIVE) {
      return [...readRows(S.current.rows)
        .slots.values()]
        .sort(sortSlots);
    }

    const slots = [];

    for (const zone of ["A", "B", "C"]) {
      for (let sector = 1; sector <= 26; sector++) {
        slots.push({
          zone,
          sector,
          drawKey: `${zone}${sector}`
        });
      }
    }

    return slots;
  }

  function rowForAssignment(a) {
    if (!a) return null;

    if (S.mode === MODE.ARCHIVE) {
      return readRows(S.current.rows)
        .slots.get(a.drawKey)?.row || null;
    }

    if (S.mode === MODE.HISTORY) {
      return S.historicalRows[
        a.lakeSectorNumber
      ] || null;
    }

    return null;
  }

  function resultText(row) {
    if (!row) {
      return "—";
    }

    const totalWeight =
      row.totalWeight;

    const totalCount =
      row.totalCount;

    const place =
      nonNegative(
        row.place ??
        row.zonePlace ??
        row.overallPlace
      );

    const result =
      `${weight(totalWeight)} кг · ` +
      `${nonNegative(totalCount) ?? "—"} риб`;

    return place != null
      ? `${place} місце · ${result}`
      : result;
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {
    if (!S.current) return;

    const check =
      inspectMap();

    $("mapPins").innerHTML =
      POINTS.map(([n, x, y]) => {
        const a =
          S.assignments.find(
            item =>
              Number(item.lakeSectorNumber) === n
          );

        const empty =
          S.empty.includes(n);

        return `
          <button
            type="button"
            class="map-pin"
            data-lake="${n}"
            data-zone="${esc(a?.zone || "")}"
            data-empty="${empty}"
            aria-pressed="${n === S.selected}"
            style="left:${x}%;top:${y}%"
            aria-label="Сектор озера №${n}"
          >
            <span>${n}</span>
            <small>
              ${esc(
                a
                  ? a.drawKey + (empty ? " ×" : "")
                  : ""
              )}
            </small>
          </button>
        `;
      }).join("");

    $("mapPins")
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => selectSector(
            Number(button.dataset.lake)
          )
        );
      });

    const ordered =
      [...S.assignments]
        .sort((a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
        );

    $("mappingRows").innerHTML =
      ordered.map(a => {
        const row =
          rowForAssignment(a);

        const n =
          a.lakeSectorNumber;

        return `
          <tr>
            <td>№${n}</td>
            <td>${esc(a.drawKey)}</td>
            <td>${esc(teamName(row))}</td>
            <td>${esc(resultText(row))}</td>
            <td>
              ${
                S.empty.includes(n)
                  ? "Пустував"
                  : "Ловили"
              }
            </td>
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

    $("emptySectors").innerHTML =
      ordered.map(a => {
        const n =
          a.lakeSectorNumber;

        return `
          <label class="maps-check">

            <input
              type="checkbox"
              data-empty-sector="${n}"
              ${S.empty.includes(n) ? "checked" : ""}
            >

            <span>
              ${esc(a.drawKey)}
              · озеро №${n}
            </span>

          </label>
        `;
      }).join("") ||
      '<p class="maps-muted">Немає секторів.</p>';

    $("emptySectors")
      .querySelectorAll("[data-empty-sector]")
      .forEach(input => {
        input.addEventListener(
          "change",
          () => {
            const n =
              Number(input.dataset.emptySector);

            const a =
              S.assignments.find(
                item =>
                  item.lakeSectorNumber === n
              );

            if (
              input.checked &&
              S.mode === MODE.ARCHIVE &&
              hasCatch(rowForAssignment(a))
            ) {
              input.checked = false;

              message(
                "Сектор має улов. Неявку встановити не можна.",
                "error"
              );

              return;
            }

            if (
              input.checked &&
              S.mode === MODE.HISTORY &&
              S.historicalRows[n]
            ) {
              input.checked = false;

              message(
                "Спочатку видали історичний результат сектора.",
                "error"
              );

              return;
            }

            S.empty =
              input.checked
                ? [...new Set([...S.empty, n])]
                : S.empty.filter(
                    value => value !== n
                  );

            changed();
          }
        );
      });

    setText(
      "mapSummary",
      `У розстановці: ${check.selected} · ` +
      `Пустували: ${check.empty} · ` +
      `Ловили: ${check.included}`
    );

    setText(
      "mapCoverage",
      check.ready
        ? "Карта готова."
        : [
            ...check.errors,
            ...check.incomplete
          ].join(" ") ||
          "Карта ще не завершена."
    );

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

  function selectSector(n) {
    if (
      !S.current ||
      !VALID_SECTORS.has(n)
    ) {
      return;
    }

    S.selected = n;

    $("lakeSector").value =
      String(n);

    const a =
      S.assignments.find(
        item =>
          item.lakeSectorNumber === n
      );

    const used =
      new Set(
        S.assignments
          .filter(
            item =>
              item.lakeSectorNumber !== n
          )
          .map(item => item.drawKey)
      );

    $("archiveSlot").innerHTML =
      '<option value="">Обери позначення</option>' +
      availableSlots().map(slot => `
        <option
          value="${esc(slot.drawKey)}"
          ${used.has(slot.drawKey) ? "disabled" : ""}
        >
          ${esc(slot.drawKey)}
        </option>
      `).join("") +
      `
        <option value="manual">
          Ввести вручну…
        </option>
      `;

    $("archiveSlot").value =
      a
        ? availableSlots().some(
            slot =>
              slot.drawKey === a.drawKey
          )
          ? a.drawKey
          : "manual"
        : "";

    $("manualZone").value =
      a?.zone || "A";

    $("manualNumber").value =
      a?.sector || 1;

    setDisabled(
      "removeSlot",
      !a
    );

    $("mapPins")
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.setAttribute(
          "aria-pressed",
          String(
            Number(button.dataset.lake) === n
          )
        );
      });

    if (S.mode === MODE.HISTORY) {
      loadHistoricalEditor(n);
    }

    preview();
  }

  // ==========================================================
  // CHOSEN SLOT
  // ==========================================================

  function chosenSlot() {
    if (
      $("archiveSlot").value === "manual"
    ) {
      return parseSlot(
        $("manualZone").value,
        $("manualNumber").value
      );
    }

    return parseSlot(
      "",
      $("archiveSlot").value
    );
  }

  function preview() {
    if (!S.current) return;

    setHidden(
      "manualSlot",
      $("archiveSlot").value !== "manual"
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
        ? readRows(S.current.rows)
            .slots.get(slot.drawKey)?.row
        : S.mode === MODE.HISTORY
          ? S.historicalRows[S.selected]
          : null;

    setText(
      "slotPreview",
      `Озеро №${S.selected} → ${slot.drawKey}\n` +
      (
        row
          ? `${teamName(row)}\n${resultText(row)}`
          : "Результат ще не внесено."
      )
    );
  }

  // ==========================================================
  // ASSIGN
  // ==========================================================

  function assign() {
    if (!S.current) return;

    const slot =
      chosenSlot();

    if (!slot) {
      message(
        "Обери правильне позначення.",
        "error"
      );

      return;
    }

    const collision =
      S.assignments.find(
        a =>
          a.drawKey === slot.drawKey &&
          a.lakeSectorNumber !== S.selected
      );

    if (collision) {
      message(
        `${slot.drawKey} уже використовується.`,
        "error"
      );

      return;
    }

    const previous =
      S.assignments.find(
        a =>
          a.lakeSectorNumber === S.selected
      );

    S.assignments =
      S.assignments.filter(
        a =>
          a.lakeSectorNumber !== S.selected
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
      previous?.drawKey !== slot.drawKey
    ) {
      S.empty =
        S.empty.filter(
          n => n !== S.selected
        );
    }

    changed();

    message(
      `Озеро №${S.selected} → ${slot.drawKey}. Збережи карту.`,
      "ok"
    );
  }

  function removeAssignment() {
    if (!S.current) return;

    if (
      S.mode === MODE.HISTORY &&
      S.historicalRows[S.selected]
    ) {
      message(
        "Спочатку видали результат цього сектора.",
        "error"
      );

      return;
    }

    S.assignments =
      S.assignments.filter(
        a =>
          a.lakeSectorNumber !== S.selected
      );

    S.empty =
      S.empty.filter(
        n => n !== S.selected
      );

    changed();
  }

  // ==========================================================
  // HISTORICAL RESULTS
  // ==========================================================

  function loadHistoricalEditor(n) {
    const row =
      S.historicalRows[n] || {};

    setText(
      "historicalSectorLabel",
      `Фізичний сектор озера №${n}`
    );

    $("historicalTeam").value =
      row.teamName || "";

    $("historicalPlace").value =
      row.place ?? "";

    $("historicalWeight").value =
      row.totalWeight ?? "";

    $("historicalCount").value =
      row.totalCount ?? "";
  }

  function applyHistoricalResult() {
    if (
      !S.current ||
      S.mode !== MODE.HISTORY
    ) {
      return;
    }

    const n = S.selected;

    const assignment =
      S.assignments.find(
        a =>
          a.lakeSectorNumber === n
      );

    if (!assignment) {
      message(
        "Спочатку прив'яжи фізичний сектор до позначення.",
        "error"
      );

      return;
    }

    const teamName =
      txt($("historicalTeam").value);

    const place =
      num($("historicalPlace").value);

    const totalWeight =
      nonNegative(
        $("historicalWeight").value
      );

    const totalCount =
      num($("historicalCount").value);

    if (!teamName) {
      message(
        "Введи назву команди.",
        "error"
      );

      return;
    }

    if (
      !Number.isInteger(place) ||
      place < 1
    ) {
      message(
        "Місце має бути цілим числом від 1.",
        "error"
      );

      return;
    }

    if (totalWeight == null) {
      message(
        "Введи коректну сумарну вагу.",
        "error"
      );

      return;
    }

    if (
      !Number.isInteger(totalCount) ||
      totalCount < 0
    ) {
      message(
        "Кількість риб має бути цілим невід'ємним числом.",
        "error"
      );

      return;
    }

    if (
      totalCount === 0 &&
      totalWeight > 0
    ) {
      message(
        "При нульовій кількості риб вага має бути нульовою.",
        "error"
      );

      return;
    }

    S.historicalRows[n] = {
      lakeSectorNumber: n,

      zone: assignment.zone,
      sector: assignment.sector,
      drawKey: assignment.drawKey,

      teamName,
      place,

      totalWeight:
        Number(totalWeight.toFixed(3)),

      totalCount
    };

    S.empty =
      S.empty.filter(
        value => value !== n
      );

    changed();

    message(
      `Результат сектора №${n} додано. Збережи турнір.`,
      "ok"
    );
  }

  function removeHistoricalResult() {
    if (
      S.mode !== MODE.HISTORY
    ) {
      return;
    }

    delete S.historicalRows[S.selected];

    changed();

    message(
      "Історичний результат видалено з чернетки."
    );
  }

  // ==========================================================
  // CHANGED
  // ==========================================================

  function changed() {
    S.dirty = true;

    render();

    selectSector(S.selected);
  }

  // ==========================================================
  // SAVE PREPARE / ARCHIVE
  // ==========================================================

  async function saveSectorMap() {
    requireAccess();

    const check =
      inspectMap();

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const year = S.year;
    const id = S.current.id;

    const expectedRevision =
      S.revision;

    const assignments =
      S.assignments.map(a => ({
        lakeSectorId:
          `sector-${a.lakeSectorNumber}`,

        lakeSectorNumber:
          a.lakeSectorNumber,

        zone: a.zone,
        sector: a.sector,
        drawKey: a.drawKey
      })).sort((a, b) =>
        a.lakeSectorNumber -
        b.lakeSectorNumber
      );

    const emptyLakeSectors =
      [...new Set(S.empty)]
        .sort((a, b) => a - b);

    const ref =
      mapRef(year, id);

    const sourceReference =
      S.mode === MODE.ARCHIVE
        ? archiveRef(year, id)
        : null;

    await timed(
      S.db.runTransaction(async tx => {
        // Усі читання виконуються перед записом.

        const source =
          sourceReference
            ? await tx.get(sourceReference)
            : null;

        const saved =
          await tx.get(ref);

        requireAccess();

        if (
          sourceReference &&
          !source.exists
        ) {
          throw new Error(
            "Архівний етап більше не існує."
          );
        }

        if (sourceReference) {
          const actualHash =
            await fingerprint(
              source.data().standings ?? null
            );

          if (
            actualHash !== S.sourceHash
          ) {
            throw new Error(
              "Архів змінився. Перезавантаж етап."
            );
          }
        }

        const old =
          saved.exists
            ? saved.data()
            : null;

        if (
          (old?.revision || 0) !==
          expectedRevision
        ) {
          throw new Error(
            "Карту вже змінили в іншій вкладці. Перезавантаж її."
          );
        }

        const stamp =
          firebase.firestore.FieldValue
            .serverTimestamp();

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

          status:
            check.ready
              ? "ready"
              : "draft",

          revision:
            expectedRevision + 1,

          createdAt:
            old?.createdAt || stamp,

          createdBy:
            old?.createdBy || OWNER_UID,

          updatedAt: stamp,
          updatedBy: OWNER_UID
        };

        if (S.mode === MODE.ARCHIVE) {
          payload.sourcePath =
            `seasonResults/${year}/stages/${id}`;

          payload.sourceSignature =
            S.sourceHash;
        } else {
          payload.sourcePath =
            `competitions/${S.current.competitionId}`;

          payload.competitionId =
            S.current.competitionId;

          payload.stageKey =
            S.current.stageKey;
        }

        tx.set(ref, payload);
      }),

      "Не вдалося зберегти карту."
    );

    S.revision =
      expectedRevision + 1;

    S.dirty = false;

    render();

    message(
      check.ready
        ? "Карту збережено. Статус: ready."
        : "Карту збережено як чернетку.",
      "ok"
    );
  }

  // ==========================================================
  // SAVE HISTORY
  // ==========================================================

  async function saveHistory() {
    requireAccess();

    const check =
      inspectMap();

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const id =
      S.current.id;

    const expectedRevision =
      S.revision;

    const assignments =
      [...S.assignments]
        .sort((a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
        );

    const results =
      Object.values(S.historicalRows)
        .map(row => {
          const assignment =
            assignments.find(
              a =>
                a.lakeSectorNumber ===
                row.lakeSectorNumber
            );

          return {
            ...row,

            zone: assignment.zone,
            sector: assignment.sector,
            drawKey: assignment.drawKey
          };
        })
        .sort((a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
        );

    const ref =
      historyRef(S.year, id);

    await timed(
      S.db.runTransaction(async tx => {
        const snapshot =
          await tx.get(ref);

        requireAccess();

        if (!snapshot.exists) {
          throw new Error(
            "Історичний турнір не знайдено."
          );
        }

        const old =
          snapshot.data();

        if (
          Number(old.revision || 0) !==
          expectedRevision
        ) {
          throw new Error(
            "Турнір змінили в іншій вкладці. Перезавантаж його."
          );
        }

        tx.update(ref, {
          assignments,

          emptyLakeSectors:
            [...new Set(S.empty)]
              .sort((a, b) => a - b),

          results,

          revision:
            expectedRevision + 1,

          updatedAt:
            firebase.firestore.FieldValue
              .serverTimestamp(),

          updatedBy: OWNER_UID
        });
      }),

      "Не вдалося зберегти історичний турнір."
    );

    S.revision =
      expectedRevision + 1;

    S.dirty = false;

    render();

    message(
      "Історичний турнір збережено.",
      "ok"
    );
  }

  async function save() {
    if (!S.current) {
      throw new Error(
        "Спочатку обери етап."
      );
    }

    message(
      "Зберігаю дані…"
    );

    if (S.mode === MODE.HISTORY) {
      await saveHistory();
    } else {
      await saveSectorMap();
    }
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
      Math.min(MAX_ZOOM, S.zoom)
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

    const value =
      `${Math.round(S.zoom * 100)}%`;

    setText("zoomValue", value);

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

    $("mapViewport").scrollLeft = 0;
    $("mapViewport").scrollTop = 0;
  }

  // ==========================================================
  // LEAVE CONFIRMATION
  // ==========================================================

  function mayLeave() {
    return (
      !S.dirty ||
      confirm(
        "Є незбережені зміни. Перейти без збереження?"
      )
    );
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  function on(id, event, handler) {
    const el = $(id);

    if (el) {
      el.addEventListener(
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
          () => switchMode(
            button.dataset.mapMode
          )
        );
      });

    on("loadYear", "click", () => {
      if (mayLeave()) {
        run(loadYear);
      }
    });

    on("mapStage", "change", () => {
      const el =
        $("mapStage");

      const id =
        el.value;

      const previous =
        S.current?.id || "";

      if (!id || !mayLeave()) {
        el.value = previous;
        return;
      }

      run(async () => {
        try {
          await loadStage(id);
        } catch (error) {
          el.value = previous;
          throw error;
        }
      });
    });

    on("lakeSector", "change", () => {
      selectSector(
        Number(
          $("lakeSector").value
        )
      );
    });

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
      "historicalApply",
      "click",
      applyHistoricalResult
    );

    on(
      "historicalRemove",
      "click",
      removeHistoricalResult
    );

    on(
      "createHistory",
      "click",
      () => run(createHistory)
    );

    on(
      "saveMap",
      "click",
      () => run(save)
    );

    on("zoomIn", "click", () => {
      S.zoom = Math.min(
        MAX_ZOOM,
        S.zoom + ZOOM_STEP
      );

      resizeMap();
    });

    on("zoomOut", "click", () => {
      S.zoom = Math.max(
        MIN_ZOOM,
        S.zoom - ZOOM_STEP
      );

      resizeMap();
    });

    on(
      "zoomReset",
      "click",
      resetZoom
    );

    on("lakeImage", "error", () => {
      setHidden(
        "imageError",
        false
      );
    });

    window.addEventListener(
      "resize",
      () => requestAnimationFrame(
        resizeMap
      )
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
  // FIREBASE
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
                clearInterval(interval);
                resolve();
              }
            }, 100);
        }),

        "Firebase не ініціалізовано."
      );
    }

    S.db = window.scDb;
    S.auth = window.scAuth;
  }

  function waitAuth() {
    return timed(
      new Promise((resolve, reject) => {
        let unsubscribe = null;
        let settled = false;

        const done = user => {
          if (settled) return;

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
      }),

      "Не вдалося перевірити авторизацію."
    );
  }

  // ==========================================================
  // BOOT
  // ==========================================================

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

      S.auth.onAuthStateChanged(value => {
        if (
          value?.uid !== OWNER_UID
        ) {
          S.allowed = false;

          setHidden("mapApp", true);

          controls();

          message(
            "Сесію завершено.",
            "error"
          );
        }
      });

      $("mapYear").value =
        new URLSearchParams(
          location.search
        ).get("year") ||
        String(
          new Date().getFullYear()
        );

      $("lakeSector").innerHTML =
        POINTS.map(([n]) => `
          <option value="${n}">
            Сектор озера №${n}
          </option>
        `).join("");

      setHidden("mapApp", false);

      updateModeUI();

      bindEvents();

      controls();

      await run(loadYear);

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
