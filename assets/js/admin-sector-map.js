// ============================================================
// STOLAR CARP • КАРТИ СЕКТОРІВ
// Версія: 2.1 • 08.10.2026
//
// РЕЖИМИ:
//
// PREPARE
//   Підготовка секторів до жеребкування.
//   Джерело: competitions
//   sectorMaps/{year}/stages/{compId}__{stageKey}
//
// ARCHIVE
//   Прив'язка архівних результатів до фізичних секторів.
//   Джерело: seasonResults/{year}/stages
//   Збереження: sectorMaps/{year}/stages
//
// HISTORY
//   Історичні турніри інших організаторів.
//   historicalSectorResults/{year}/tournaments
//
// ГАРАНТІЇ:
//
// - LIVE не змінюється.
// - Архівні результати не змінюються.
// - Сезонний рейтинг не змінюється.
// - Фізичні сектори Лелехівки: 1–26.
// - Карта сумісна з draw_admin.js.
// - Контроль revision.
// - Контроль джерела архівних результатів.
// - Чернетка не вважається готовою картою.
// - Підтримка TEAM / SOLO / ONEOFF.
// ============================================================

(function () {
  "use strict";

  const VERSION = "2.1";

  const OWNER_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const LAKE_ID = "lelehivka";

  const MAX_LAKE_SECTOR = 26;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;

  const REQUEST_TIMEOUT = 20000;

  const MODE = Object.freeze({
    PREPARE: "prepare",
    ARCHIVE: "archive",
    HISTORY: "history"
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
  // HELPERS
  // ==========================================================

  const $ = id => document.getElementById(id);

  const txt = value =>
    String(value ?? "").trim();

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
    const valueNumber = num(value);

    return valueNumber !== null && valueNumber >= 0
      ? valueNumber
      : null;
  }

  function positiveInteger(value) {
    const valueNumber = num(value);

    return Number.isInteger(valueNumber) &&
      valueNumber > 0
      ? valueNumber
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

  function normalizeAssignment(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const lakeSectorNumber = positiveInteger(
      value.lakeSectorNumber ??
      value.physicalSector ??
      value.lakeSector
    );

    const slot = parseSlot(
      value.zone ?? value.drawZone,
      value.sector ??
      value.drawSector ??
      value.drawKey
    );

    if (
      !VALID_SECTORS.has(lakeSectorNumber) ||
      !slot
    ) {
      return null;
    }

    return {
      lakeSectorId: `sector-${lakeSectorNumber}`,
      lakeSectorNumber,
      zone: slot.zone,
      sector: slot.sector,
      drawKey: slot.drawKey
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
    const result = nonNegative(value);

    return result === null
      ? "—"
      : result.toFixed(3);
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

  function safeId(value) {
    return txt(value)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
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

    return Array.from(
      new Uint8Array(hash),
      byte => byte.toString(16).padStart(2, "0")
    ).join("");
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
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
      `[Sector maps v${VERSION}]`,
      value
    );
  }

  function errorMessage(error) {
    if (
      txt(error?.code).includes("permission-denied")
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

  function read(ref) {
    return timed(
      ref.get({ source: "server" }),
      `Перевищено час очікування: ${ref.path}`
    );
  }

  async function run(task) {
    if (S.busy || !S.allowed) {
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
        "Доступ дозволено тільки власнику STOLAR CARP."
      );
    }
  }

  function controls() {
    const locked = S.busy || !S.allowed;

    setDisabled("loadYear", locked);
    setDisabled("mapYear", locked);
    setDisabled("mapStage", locked);

    const editFields = $("editFields");

    if (editFields) {
      editFields.disabled = locked || !S.current;
    }

    [
      "lakeSector",
      "archiveSlot",
      "manualZone",
      "manualNumber",
      "assignSlot",
      "historicalTeam",
      "historicalPlace",
      "historicalWeight",
      "historicalCount",
      "historicalApply",
      "historicalRemove"
    ].forEach(id => {
      setDisabled(
        id,
        locked || !S.current
      );
    });

    setDisabled(
      "removeSlot",
      locked ||
      !S.current ||
      !S.assignments.some(
        item =>
          item.lakeSectorNumber === S.selected
      )
    );

    setDisabled(
      "saveMap",
      locked ||
      !S.current ||
      !S.dirty
    );

    setDisabled(
      "createHistory",
      locked ||
      S.mode !== MODE.HISTORY
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
  // INTERFACE
  // ==========================================================

  function installInterface() {
    const app = $("mapApp");

    if (!app) {
      throw new Error(
        "HTML не містить елемент #mapApp."
      );
    }

    const firstCard = app.querySelector(".maps-card");

    if (!firstCard) {
      throw new Error(
        "Не знайдено блок вибору етапу."
      );
    }

    if (!$("mapModeCard")) {
      const modeCard = document.createElement("section");

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
              До жеребкування · TEAM / SOLO
            </small>
          </button>

          <button
            type="button"
            data-map-mode="archive"
          >
            <strong>🔵 Архівні етапи</strong>
            <small>
              Завершені етапи STOLAR CARP
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
    }

    if (!$("historyCreateCard")) {
      const card = document.createElement("section");

      card.id = "historyCreateCard";
      card.className = "maps-card";
      card.hidden = true;

      card.innerHTML = `
        <h2>Додати історичний турнір</h2>

        <div class="maps-row">

          <label class="maps-field">
            Назва турніру

            <input
              id="historyTitle"
              maxlength="160"
              placeholder="Кубок Лелехівки"
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
        card,
        firstCard.nextSibling
      );
    }

    if (!$("historicalEditor")) {
      const editor = $("mapEditor");

      if (!editor) {
        throw new Error(
          "HTML не містить #mapEditor."
        );
      }

      const block = document.createElement("div");

      block.id = "historicalEditor";
      block.hidden = true;

      block.innerHTML = `
        <section class="maps-card">

          <h2>Історичний результат сектора</h2>

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
            Після внесення результатів збережи турнір.
          </p>

        </section>
      `;

      editor.appendChild(block);
    }

    if (!$("scMapV21Styles")) {
      const style = document.createElement("style");

      style.id = "scMapV21Styles";

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

          cursor: pointer;
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

        .sc-map-modes button:disabled {
          opacity: .6;
          cursor: wait;
        }

        #mapPins .map-pin {
          width: 23px !important;
          height: 23px !important;

          min-width: 0 !important;
          min-height: 0 !important;

          padding: 0 !important;

          border-radius: 50% !important;
          border: 1.5px solid #fff;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          line-height: 1;

          box-shadow:
            0 1px 4px rgba(0,0,0,.75);

          pointer-events: auto;
          cursor: pointer;
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

        #mapPins .map-pin[data-empty="true"] {
          opacity: .55;
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
    }

    const heading = document.querySelector(
      ".maps-page h1"
    );

    if (heading) {
      heading.textContent = "🗺️ Карти секторів";
    }

    const subtitle = heading?.nextElementSibling;

    if (subtitle) {
      subtitle.textContent =
        "Лелехівка · фізичні сектори водойми №1–26";
    }
  }

  // ==========================================================
  // MODE
  // ==========================================================

  function modeDescription() {
    switch (S.mode) {
      case MODE.PREPARE:
        return (
          "Підготовка до жеребкування. " +
          "Обери змагання та розподіли фізичні сектори " +
          "між зонами A/B/C. " +
          "Готова карта матиме статус ready."
        );

      case MODE.HISTORY:
        return (
          "Історичні турніри. " +
          "Можна створити турнір та внести " +
          "результати по фізичних секторах водойми."
        );

      default:
        return (
          "Архівні етапи STOLAR CARP. " +
          "Прив'язка результатів до фізичних секторів " +
          "без зміни архіву."
        );
    }
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

    const label = $("mapStage")?.closest("label");

    if (label) {
      const textNode = Array.from(label.childNodes)
        .find(node => node.nodeType === Node.TEXT_NODE);

      if (textNode) {
        textNode.textContent =
          S.mode === MODE.PREPARE
            ? "Етап для підготовки "
            : S.mode === MODE.HISTORY
              ? "Історичний турнір "
              : "Архівний етап ";
      }
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
      S.busy ||
      mode === S.mode ||
      !Object.values(MODE).includes(mode)
    ) {
      return;
    }

    if (!mayLeave()) {
      return;
    }

    S.mode = mode;

    clearStage();

    updateModeUI();

    await run(loadYear);
  }

  function clearStage() {
    S.current = null;
    S.stages = [];

    S.assignments = [];
    S.empty = [];

    S.historicalRows = {};

    S.revision = 0;
    S.sourceHash = "";

    S.selected = 1;
    S.zoom = 1;
    S.dirty = false;

    if ($("mapStage")) {
      $("mapStage").innerHTML =
        '<option value="">Обери етап</option>';
    }

    setHidden("mapEditor", true);
    setHidden("historicalEditor", true);

    controls();
  }

  // ==========================================================
  // ARCHIVE DATA
  // ==========================================================

  function readRows(rows) {
    const slots = new Map();
    const issues = [];

    if (!Array.isArray(rows)) {
      return {
        slots,
        issues: [
          "Архівний документ не містить standings."
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

  function hasCatch(row) {
    if (!row) {
      return false;
    }

    const fields = [
      rowTotalWeight(row),
      rowTotalCount(row),
      nonNegative(row.bigFish),
      nonNegative(row.bigFishKg),
      nonNegative(row.carpCount),
      nonNegative(row.amurCount),
      nonNegative(row.sturgeonCount)
    ];

    if (
      fields.some(value => (value || 0) > 0)
    ) {
      return true;
    }

    const weighings =
      row.weighings &&
      typeof row.weighings === "object"
        ? Object.values(row.weighings)
        : [];

    return weighings.some(weighing => {
      if (!weighing || typeof weighing !== "object") {
        return false;
      }

      return (
        (nonNegative(weighing.total) || 0) > 0 ||
        (nonNegative(weighing.count) || 0) > 0 ||
        (nonNegative(weighing.totalWeightKg) || 0) > 0 ||
        (nonNegative(weighing.fishCount) || 0) > 0
      );
    });
  }

  // ==========================================================
  // COMPETITIONS
  // ==========================================================

  function yearFromDate(value) {
    if (!value) {
      return "";
    }

    if (typeof value.toDate === "function") {
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

    const raw = txt(value);

    const match = raw.match(
      /(?:^|[^\d])(20\d{2})(?:[^\d]|$)/
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

    const dates = [
      event?.startDate,
      event?.startAt,
      event?.date,
      data?.startDate,
      data?.startAt,
      data?.date
    ];

    for (const value of dates) {
      const year = yearFromDate(value);

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
      const stageKey = txt(
        event.key ||
        event.stageId ||
        event.id ||
        `stage-${index + 1}`
      );

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
        data.lakeId ||
        LAKE_ID
      );

      const format = txt(
        event.format ||
        data.format ||
        data.type
      ).toLowerCase();

      const entryType = txt(
        event.entryType ||
        data.entryType ||
        (format.includes("solo") ? "solo" : "team")
      ).toLowerCase();

      return {
        id: `${doc.id}__${stageKey}`,

        title:
          `${competitionTitle} · ${eventTitle}`,

        competitionId: doc.id,
        stageKey,

        competition: data,
        event,

        year: competitionYear(data, event),

        lakeId,
        entryType,
        format
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

    return snapshot.docs
      .map(doc => {
        const data = doc.data() || {};

        return {
          id: doc.id,

          title: txt(
            data.stageName ||
            data.title ||
            data.stageId ||
            doc.id
          ),

          lakeId: txt(data.lakeId || LAKE_ID),

          data
        };
      })
      .filter(stage => stage.lakeId === LAKE_ID);
  }

  // ==========================================================
  // HISTORICAL STAGES
  // ==========================================================

  async function loadHistoricalStages(year) {
    const snapshot = await read(
      historyCollection(year)
    );

    return snapshot.docs
      .map(doc => {
        const data = doc.data() || {};

        return {
          id: doc.id,
          title: txt(data.title || doc.id),
          lakeId: txt(data.lakeId || LAKE_ID),
          data
        };
      })
      .filter(stage => stage.lakeId === LAKE_ID);
  }

  // ==========================================================
  // LOAD YEAR
  // ==========================================================

  async function loadYear() {
    requireAccess();

    const year = txt($("mapYear")?.value);

    if (!/^20\d{2}$/.test(year)) {
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

    S.year = year;

    clearStage();

    S.stages = stages;

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
        : "За цей рік етапів не знайдено.",
      stages.length ? "ok" : ""
    );
  }

  // ==========================================================
  // CREATE HISTORY
  // ==========================================================

  async function createHistory() {
    requireAccess();

    if (S.mode !== MODE.HISTORY) {
      throw new Error(
        "Створення доступне тільки в історичному режимі."
      );
    }

    const title = txt(
      $("historyTitle")?.value
    );

    const organizer = txt(
      $("historyOrganizer")?.value
    );

    if (!title) {
      throw new Error(
        "Введи назву турніру."
      );
    }

    const id =
      `historical-${Date.now()}-${safeId(title)}`;

    const ref = historyRef(S.year, id);

    const stamp = serverTimestamp();

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

        status: "draft",
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

    const stage = S.stages.find(
      item => item.id === id
    );

    if (!stage) {
      throw new Error(
        "Етап не знайдено."
      );
    }

    message("Завантажую карту…");

    let saved = null;
    let data = null;
    let rows = [];

    let sourceHash = "";

    if (S.mode === MODE.ARCHIVE) {
      const [source, map] = await Promise.all([
        read(archiveRef(S.year, id)),
        read(mapRef(S.year, id))
      ]);

      if (!source.exists) {
        throw new Error(
          "Архівний етап не знайдено."
        );
      }

      data = source.data() || {};

      rows = data.standings;

      sourceHash = await fingerprint(
        rows ?? null
      );

      saved = map.exists
        ? map.data()
        : null;
    }

    if (S.mode === MODE.PREPARE) {
      const [competition, map] = await Promise.all([
        read(
          S.db
            .collection("competitions")
            .doc(stage.competitionId)
        ),
        read(mapRef(S.year, id))
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
    }

    if (S.mode === MODE.HISTORY) {
      const history = await read(
        historyRef(S.year, id)
      );

      if (!history.exists) {
        throw new Error(
          "Історичний турнір не знайдено."
        );
      }

      saved = history.data() || {};

      data = saved;

      rows = Array.isArray(saved.results)
        ? saved.results
        : [];
    }

    if (
      saved?.lakeId &&
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
        txt(saved.seasonYear) !== S.year ||
        saved.stageDocId !== id ||
        Number(saved.schemaVersion) !== 1
      )
    ) {
      throw new Error(
        "Збережена карта має несумісну схему."
      );
    }

    if (
      S.mode === MODE.HISTORY &&
      saved &&
      Number(saved.schemaVersion) !== 1
    ) {
      throw new Error(
        "Історичний турнір має несумісну схему."
      );
    }

    const assignments = [];

    if (Array.isArray(saved?.assignments)) {
      saved.assignments.forEach((value, index) => {
        const normalized = normalizeAssignment(value);

        if (!normalized) {
          throw new Error(
            `Некоректна прив'язка №${index + 1} у збереженій карті.`
          );
        }

        assignments.push(normalized);
      });
    }

    const empty = Array.isArray(saved?.emptyLakeSectors)
      ? saved.emptyLakeSectors.map(Number)
      : [];

    if (
      empty.some(value => !VALID_SECTORS.has(value))
    ) {
      throw new Error(
        "У карті знайдено некоректні порожні сектори."
      );
    }

    const historicalRows = {};

    if (S.mode === MODE.HISTORY) {
      rows.forEach(row => {
        const sector = positiveInteger(
          row?.lakeSectorNumber
        );

        if (!VALID_SECTORS.has(sector)) {
          throw new Error(
            "Історичний результат містить некоректний фізичний сектор."
          );
        }

        if (historicalRows[sector]) {
          throw new Error(
            `Дублюється історичний результат сектора №${sector}.`
          );
        }

        historicalRows[sector] = {
          ...row,
          lakeSectorNumber: sector
        };
      });
    }

    S.current = {
      ...stage,
      data,
      rows
    };

    S.assignments = assignments;
    S.empty = [...new Set(empty)];

    S.historicalRows = historicalRows;

    S.revision = Number(
      saved?.revision || 0
    );

    S.sourceHash = sourceHash;

    S.selected = 1;
    S.zoom = 1;
    S.dirty = false;

    setText(
      "selectedStageTitle",
      `${S.year} · ${stage.title}`
    );

    setHidden("mapEditor", false);

    updateModeUI();

    render();
    selectSector(1);

    requestAnimationFrame(resizeMap);

    if (
      S.mode === MODE.ARCHIVE &&
      saved?.sourceSignature &&
      saved.sourceSignature !== sourceHash
    ) {
      message(
        "Увага: джерело архівних результатів змінилося. " +
        "Перевір прив'язки перед повторним збереженням.",
        "error"
      );
    } else {
      message(
        saved
          ? `Карту завантажено. Статус: ${saved.status || "невідомий"}.`
          : "Нова карта. Можна починати розстановку.",
        "ok"
      );
    }
  }

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function inspectMap() {
    const errors = [];
    const incomplete = [];

    const physical = new Set();
    const drawKeys = new Set();

    const source = S.mode === MODE.ARCHIVE
      ? readRows(S.current?.rows)
      : null;

    if (source) {
      incomplete.push(...source.issues);
    }

    for (const assignment of S.assignments) {
      const sector = Number(
        assignment.lakeSectorNumber
      );

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
          `Некоректна прив'язка сектора №${sector}.`
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

      if (S.mode === MODE.ARCHIVE) {
        const row = source.slots.get(
          slot.drawKey
        )?.row;

        if (
          !row &&
          !S.empty.includes(sector)
        ) {
          incomplete.push(
            `${slot.drawKey}: немає архівного результату.`
          );
        }

        if (
          row &&
          !S.empty.includes(sector) &&
          (
            rowTotalWeight(row) === null ||
            rowTotalCount(row) === null
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
            `${slot.drawKey}: є улов, але сектор позначено порожнім.`
          );
        }
      }
    }

    for (const sector of S.empty) {
      if (!physical.has(sector)) {
        errors.push(
          `Порожній сектор №${sector} не має прив'язки.`
        );
      }
    }

    if (!S.assignments.length) {
      incomplete.push(
        "Ще немає прив'язок."
      );
    }

    if (S.mode === MODE.ARCHIVE) {
      const missing = [...source.slots.keys()]
        .filter(key => !drawKeys.has(key));

      if (missing.length) {
        incomplete.push(
          `Не прив'язано: ${missing.join(", ")}.`
        );
      }
    }

    if (S.mode === MODE.HISTORY) {
      for (
        const [sectorKey, row] of
        Object.entries(S.historicalRows)
      ) {
        const sector = Number(sectorKey);

        if (!physical.has(sector)) {
          errors.push(
            `Результат сектора №${sector} не має прив'язки.`
          );
        }

        if (!txt(row.teamName)) {
          errors.push(
            `Сектор №${sector}: немає назви команди.`
          );
        }

        if (
          !Number.isInteger(row.place) ||
          row.place < 1
        ) {
          errors.push(
            `Сектор №${sector}: некоректне місце.`
          );
        }

        if (
          rowTotalWeight(row) === null ||
          !Number.isInteger(row.totalCount) ||
          row.totalCount < 0
        ) {
          errors.push(
            `Сектор №${sector}: некоректна вага або кількість риб.`
          );
        }

        if (S.empty.includes(sector)) {
          errors.push(
            `Сектор №${sector} має результат, але позначений порожнім.`
          );
        }
      }
    }

    if (S.mode === MODE.PREPARE) {
      if (S.assignments.length > MAX_LAKE_SECTOR) {
        errors.push(
          "Кількість прив'язок перевищує 26."
        );
      }

      if (
        S.assignments.length > 0 &&
        S.assignments.length === S.empty.length
      ) {
        incomplete.push(
          "Усі сектори позначені порожніми."
        );
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
    if (S.mode === MODE.ARCHIVE) {
      return [...readRows(S.current.rows)
        .slots.values()]
        .sort(sortSlots);
    }

    const slots = [];

    for (const zone of ["A", "B", "C"]) {
      for (
        let sector = 1;
        sector <= MAX_LAKE_SECTOR;
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

  function rowForAssignment(assignment) {
    if (!assignment) {
      return null;
    }

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

  function resultText(row) {
    if (!row) {
      return "—";
    }

    const totalWeight = rowTotalWeight(row);
    const totalCount = rowTotalCount(row);

    const place = nonNegative(
      row.place ??
      row.zonePlace ??
      row.overallPlace
    );

    const result =
      `${weight(totalWeight)} кг · ` +
      `${totalCount ?? "—"} риб`;

    return place !== null
      ? `${place} місце · ${result}`
      : result;
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {
    if (!S.current) {
      return;
    }

    const check = inspectMap();

    const pins = $("mapPins");

    pins.innerHTML = POINTS.map(([sector, x, y]) => {
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
          aria-label="Сектор озера №${sector}"
        >
          <span>${sector}</span>

          <small>
            ${esc(
              assignment
                ? assignment.drawKey +
                  (empty ? " ×" : "")
                : ""
            )}
          </small>
        </button>
      `;
    }).join("");

    pins
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.addEventListener("click", () => {
          if (!S.busy) {
            selectSector(
              Number(button.dataset.lake)
            );
          }
        });
      });

    const ordered = [...S.assignments]
      .sort(
        (a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
      );

    $("mappingRows").innerHTML =
      ordered.map(assignment => {
        const row = rowForAssignment(assignment);

        const sector = assignment.lakeSectorNumber;

        return `
          <tr>
            <td>№${sector}</td>
            <td>${esc(assignment.drawKey)}</td>
            <td>${esc(teamName(row))}</td>
            <td>${esc(resultText(row))}</td>

            <td>
              ${
                S.empty.includes(sector)
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
      ordered.map(assignment => {
        const sector = assignment.lakeSectorNumber;

        return `
          <label class="maps-check">

            <input
              type="checkbox"
              data-empty-sector="${sector}"
              ${S.empty.includes(sector) ? "checked" : ""}
              ${S.busy ? "disabled" : ""}
            >

            <span>
              ${esc(assignment.drawKey)}
              · озеро №${sector}
            </span>

          </label>
        `;
      }).join("") ||
      '<p class="maps-muted">Немає секторів.</p>';

    $("emptySectors")
      .querySelectorAll("[data-empty-sector]")
      .forEach(input => {
        input.addEventListener("change", () => {
          if (S.busy) {
            render();
            return;
          }

          const sector = Number(
            input.dataset.emptySector
          );

          const assignment = S.assignments.find(
            item =>
              item.lakeSectorNumber === sector
          );

          if (
            input.checked &&
            S.mode === MODE.ARCHIVE &&
            hasCatch(rowForAssignment(assignment))
          ) {
            input.checked = false;

            message(
              "Сектор має улов. Позначити його порожнім не можна.",
              "error"
            );

            return;
          }

          if (
            input.checked &&
            S.mode === MODE.HISTORY &&
            S.historicalRows[sector]
          ) {
            input.checked = false;

            message(
              "Спочатку видали історичний результат сектора.",
              "error"
            );

            return;
          }

          S.empty = input.checked
            ? [...new Set([...S.empty, sector])]
            : S.empty.filter(
                value => value !== sector
              );

          changed();
        });
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

  function selectSector(sector) {
    if (
      !S.current ||
      !VALID_SECTORS.has(sector)
    ) {
      return;
    }

    S.selected = sector;

    $("lakeSector").value = String(sector);

    const assignment = S.assignments.find(
      item => item.lakeSectorNumber === sector
    );

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

    if (assignment) {
      $("archiveSlot").value = slots.some(
        slot =>
          slot.drawKey === assignment.drawKey
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

    $("mapPins")
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.setAttribute(
          "aria-pressed",
          String(
            Number(button.dataset.lake) === sector
          )
        );
      });

    if (S.mode === MODE.HISTORY) {
      loadHistoricalEditor(sector);
    }

    preview();
    controls();
  }

  // ==========================================================
  // CHOSEN SLOT
  // ==========================================================

  function chosenSlot() {
    if ($("archiveSlot").value === "manual") {
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
    if (!S.current) {
      return;
    }

    setHidden(
      "manualSlot",
      $("archiveSlot").value !== "manual"
    );

    const slot = chosenSlot();

    if (!slot) {
      setText(
        "slotPreview",
        "Обери позначення."
      );

      return;
    }

    const row = S.mode === MODE.ARCHIVE
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
    if (
      !S.current ||
      S.busy ||
      !S.allowed
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

    if (S.mode === MODE.ARCHIVE) {
      const source = readRows(S.current.rows);

      if (!source.slots.has(slot.drawKey)) {
        message(
          "Цього позначення немає в архівних результатах.",
          "error"
        );

        return;
      }
    }

    const collision = S.assignments.find(
      item =>
        item.drawKey === slot.drawKey &&
        item.lakeSectorNumber !== S.selected
    );

    if (collision) {
      message(
        `${slot.drawKey} уже використовується.`,
        "error"
      );

      return;
    }

    const previous = S.assignments.find(
      item =>
        item.lakeSectorNumber === S.selected
    );

    if (
      S.mode === MODE.HISTORY &&
      S.historicalRows[S.selected] &&
      previous?.drawKey !== slot.drawKey
    ) {
      message(
        "Спочатку видали історичний результат перед зміною позначення.",
        "error"
      );

      return;
    }

    S.assignments = S.assignments.filter(
      item =>
        item.lakeSectorNumber !== S.selected
    );

    S.assignments.push({
      lakeSectorId: `sector-${S.selected}`,
      lakeSectorNumber: S.selected,

      zone: slot.zone,
      sector: slot.sector,
      drawKey: slot.drawKey
    });

    if (previous?.drawKey !== slot.drawKey) {
      S.empty = S.empty.filter(
        sector => sector !== S.selected
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
      !S.allowed
    ) {
      return;
    }

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

    S.assignments = S.assignments.filter(
      item =>
        item.lakeSectorNumber !== S.selected
    );

    S.empty = S.empty.filter(
      sector => sector !== S.selected
    );

    changed();
  }

  // ==========================================================
  // HISTORICAL RESULTS
  // ==========================================================

  function loadHistoricalEditor(sector) {
    const row = S.historicalRows[sector] || {};

    setText(
      "historicalSectorLabel",
      `Фізичний сектор озера №${sector}`
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
      S.mode !== MODE.HISTORY ||
      S.busy ||
      !S.allowed
    ) {
      return;
    }

    const sector = S.selected;

    const assignment = S.assignments.find(
      item =>
        item.lakeSectorNumber === sector
    );

    if (!assignment) {
      message(
        "Спочатку прив'яжи фізичний сектор до позначення.",
        "error"
      );

      return;
    }

    const name = txt(
      $("historicalTeam").value
    );

    const place = positiveInteger(
      $("historicalPlace").value
    );

    const totalWeight = nonNegative(
      $("historicalWeight").value
    );

    const totalCount = num(
      $("historicalCount").value
    );

    if (!name) {
      message(
        "Введи назву команди.",
        "error"
      );

      return;
    }

    if (place === null) {
      message(
        "Місце має бути цілим числом від 1.",
        "error"
      );

      return;
    }

    if (totalWeight === null) {
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

    if (
      totalCount > 0 &&
      totalWeight === 0
    ) {
      message(
        "Якщо є риба, сумарна вага повинна бути більшою за нуль.",
        "error"
      );

      return;
    }

    S.historicalRows[sector] = {
      lakeSectorNumber: sector,

      zone: assignment.zone,
      sector: assignment.sector,
      drawKey: assignment.drawKey,

      teamName: name,
      place,

      totalWeight: Number(
        totalWeight.toFixed(3)
      ),

      totalCount
    };

    S.empty = S.empty.filter(
      value => value !== sector
    );

    changed();

    message(
      `Результат сектора №${sector} додано. Збережи турнір.`,
      "ok"
    );
  }

  function removeHistoricalResult() {
    if (
      S.mode !== MODE.HISTORY ||
      S.busy ||
      !S.allowed
    ) {
      return;
    }

    if (!S.historicalRows[S.selected]) {
      message(
        "Для цього сектора немає результату."
      );

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

    const check = inspectMap();

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const year = S.year;
    const id = S.current.id;

    const expectedRevision = S.revision;

    const assignments = S.assignments
      .map(assignment => ({
        lakeSectorId:
          `sector-${assignment.lakeSectorNumber}`,

        lakeSectorNumber:
          assignment.lakeSectorNumber,

        zone: assignment.zone,
        sector: assignment.sector,
        drawKey: assignment.drawKey
      }))
      .sort(
        (a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
      );

    const emptyLakeSectors = [...new Set(S.empty)]
      .sort((a, b) => a - b);

    const ref = mapRef(year, id);

    const sourceRef = S.mode === MODE.ARCHIVE
      ? archiveRef(year, id)
      : S.db
          .collection("competitions")
          .doc(S.current.competitionId);

    await timed(
      S.db.runTransaction(async transaction => {
        // Усі читання перед записами.

        const source = await transaction.get(
          sourceRef
        );

        const saved = await transaction.get(
          ref
        );

        requireAccess();

        if (!source.exists) {
          throw new Error(
            "Джерело етапу більше не існує."
          );
        }

        if (S.mode === MODE.ARCHIVE) {
          const actualHash = await fingerprint(
            source.data().standings ?? null
          );

          if (actualHash !== S.sourceHash) {
            throw new Error(
              "Архів змінився. Перезавантаж етап."
            );
          }
        } else {
          const sourceStages = competitionStages(
            {
              id: S.current.competitionId,
              data: () => source.data()
            }
          );

          const exists = sourceStages.some(
            stage =>
              stage.stageKey === S.current.stageKey &&
              stage.year === year &&
              stage.lakeId === LAKE_ID
          );

          if (!exists) {
            throw new Error(
              "Змагання або етап змінилися. Перезавантаж список."
            );
          }
        }

        const old = saved.exists
          ? saved.data()
          : null;

        if (
          Number(old?.revision || 0) !==
          expectedRevision
        ) {
          throw new Error(
            "Карту змінили в іншій вкладці. Перезавантаж її."
          );
        }

        if (
          old &&
          (
            txt(old.seasonYear) !== year ||
            old.stageDocId !== id ||
            old.lakeId !== LAKE_ID
          )
        ) {
          throw new Error(
            "Існуюча карта має іншу прив'язку до етапу."
          );
        }

        const stamp = serverTimestamp();

        const payload = {
          schemaVersion: 1,

          lakeId: LAKE_ID,
          mapVersion: 1,

          seasonYear: year,
          stageDocId: id,

          stageTitle: S.current.title,

          assignments,
          emptyLakeSectors,

          status: check.ready
            ? "ready"
            : "draft",

          revision: expectedRevision + 1,

          createdAt: old?.createdAt || stamp,
          createdBy: old?.createdBy || OWNER_UID,

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

          payload.entryType =
            S.current.entryType || "team";

          payload.format =
            S.current.format || "";
        }

        transaction.set(ref, payload);
      }),

      "Не вдалося зберегти карту."
    );

    S.revision = expectedRevision + 1;
    S.dirty = false;

    render();

    message(
      check.ready
        ? "Карту збережено. Статус: ready. Розстановка готова."
        : "Карту збережено як draft. Заверши розстановку перед жеребкуванням.",
      "ok"
    );
  }

  // ==========================================================
  // SAVE HISTORY
  // ==========================================================

  async function saveHistory() {
    requireAccess();

    const check = inspectMap();

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const id = S.current.id;
    const expectedRevision = S.revision;

    const assignments = [...S.assignments]
      .sort(
        (a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
      );

    const results = Object.values(
      S.historicalRows
    )
      .map(row => {
        const assignment = assignments.find(
          item =>
            item.lakeSectorNumber ===
            row.lakeSectorNumber
        );

        if (!assignment) {
          throw new Error(
            `Немає прив'язки для сектора №${row.lakeSectorNumber}.`
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
        (a, b) =>
          a.lakeSectorNumber -
          b.lakeSectorNumber
      );

    const ref = historyRef(S.year, id);

    await timed(
      S.db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);

        requireAccess();

        if (!snapshot.exists) {
          throw new Error(
            "Історичний турнір не знайдено."
          );
        }

        const old = snapshot.data();

        if (
          Number(old.revision || 0) !==
          expectedRevision
        ) {
          throw new Error(
            "Турнір змінили в іншій вкладці. Перезавантаж його."
          );
        }

        if (
          old.lakeId !== LAKE_ID ||
          txt(old.year) !== S.year
        ) {
          throw new Error(
            "Історичний турнір має іншу водойму або рік."
          );
        }

        transaction.update(ref, {
          assignments,

          emptyLakeSectors:
            [...new Set(S.empty)]
              .sort((a, b) => a - b),

          results,

          status: check.ready
            ? "ready"
            : "draft",

          revision: expectedRevision + 1,

          updatedAt: serverTimestamp(),
          updatedBy: OWNER_UID
        });
      }),

      "Не вдалося зберегти історичний турнір."
    );

    S.revision = expectedRevision + 1;
    S.dirty = false;

    render();

    message(
      check.ready
        ? "Історичний турнір збережено. Статус: ready."
        : "Історичний турнір збережено як чернетку.",
      "ok"
    );
  }

  async function save() {
    requireAccess();

    if (!S.current) {
      throw new Error(
        "Спочатку обери етап."
      );
    }

    message("Зберігаю дані…");

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
    const viewport = $("mapViewport");
    const canvas = $("mapCanvas");

    if (!viewport || !canvas) {
      return;
    }

    const width = viewport.clientWidth;

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

    setText(
      "zoomValue",
      `${Math.round(S.zoom * 100)}%`
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

    const viewport = $("mapViewport");

    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  // ==========================================================
  // LEAVE CONFIRMATION
  // ==========================================================

  function mayLeave() {
    return (
      !S.dirty ||
      window.confirm(
        "Є незбережені зміни. Перейти без збереження?"
      )
    );
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
        button.addEventListener("click", () => {
          switchMode(button.dataset.mapMode);
        });
      });

    on("loadYear", "click", () => {
      if (mayLeave()) {
        run(loadYear);
      }
    });

    on("mapYear", "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();

        if (mayLeave()) {
          run(loadYear);
        }
      }
    });

    on("mapStage", "change", () => {
      const element = $("mapStage");

      const id = element.value;
      const previous = S.current?.id || "";

      if (!mayLeave()) {
        element.value = previous;
        return;
      }

      if (!id) {
        clearSelectedStageOnly();
        return;
      }

      run(async () => {
        try {
          await loadStage(id);
        } catch (error) {
          element.value = previous;
          throw error;
        }
      });
    });

    on("lakeSector", "change", () => {
      selectSector(
        Number($("lakeSector").value)
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

    on("assignSlot", "click", assign);

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

    on("createHistory", "click", () => {
      run(createHistory);
    });

    on("saveMap", "click", () => {
      run(save);
    });

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

    on("zoomReset", "click", resetZoom);

    on("lakeImage", "error", () => {
      setHidden("imageError", false);
    });

    window.addEventListener("resize", () => {
      requestAnimationFrame(resizeMap);
    });

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

  function clearSelectedStageOnly() {
    S.current = null;

    S.assignments = [];
    S.empty = [];
    S.historicalRows = {};

    S.revision = 0;
    S.sourceHash = "";
    S.dirty = false;

    setHidden("mapEditor", true);
    setHidden("historicalEditor", true);

    controls();

    message("Обери етап.");
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
          const interval = setInterval(() => {
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
          if (settled) {
            return;
          }

          settled = true;

          if (unsubscribe) {
            unsubscribe();
          }

          resolve(user);
        };

        unsubscribe = S.auth.onAuthStateChanged(
          done,
          reject
        );

        if (settled && unsubscribe) {
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
    if (S.started) {
      return;
    }

    S.started = true;

    try {
      message(
        `STOLAR CARP • Карти секторів v${VERSION}\n` +
        "Перевіряю доступ…"
      );

      installInterface();

      await waitFirebase();

      const user = await waitAuth();

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

      S.auth.onAuthStateChanged(value => {
        if (value?.uid !== OWNER_UID) {
          S.allowed = false;

          setHidden("mapApp", true);

          controls();

          message(
            "Сесію завершено.",
            "error"
          );
        }
      });

      const requestedYear = new URLSearchParams(
        location.search
      ).get("year");

      $("mapYear").value =
        /^20\d{2}$/.test(txt(requestedYear))
          ? requestedYear
          : String(new Date().getFullYear());

      $("lakeSector").innerHTML =
        POINTS.map(([sector]) => `
          <option value="${sector}">
            Сектор озера №${sector}
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
