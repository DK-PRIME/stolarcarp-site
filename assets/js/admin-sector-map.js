// ============================================================
// STOLAR CARP • Карти архівних етапів
// Версія: 1.4 • 08.10.2026
//
// Джерело:
// seasonResults/{year}/stages/{stageDocId}
//
// Збереження:
// sectorMaps/{year}/stages/{stageDocId}
//
// FIX v1.4:
// - Безпечний запуск після DOMContentLoaded
// - Захист від відсутніх HTML-елементів
// - Тайм-аути Firebase / Firestore
// - Детальна діагностика завантаження
// - Коректна перевірка адміністратора
// - Без нескінченного "Перевіряю доступ..."
//
// MAP:
// - Лелехівка: фізичні сектори 1–26
// - Сектори 27–30 не відображаються
// - Кольори зон A/B/C
// - Золотий вибраний сектор
// - Масштабування 100–250%
// - Збереження існуючих прив'язок
//
// ВАЖЛИВО:
// Архівні результати НЕ змінюються.
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // CONFIG
  // ==========================================================

  const OWNER_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const LAKE_ID = "lelehivka";

  const MAX_LAKE_SECTOR = 26;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;

  const FIREBASE_TIMEOUT = 15000;
  const FIRESTORE_TIMEOUT = 20000;

  const VERSION = "1.4";

  // ==========================================================
  // PHYSICAL SECTORS • LELEHIVKA
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

    [21, 33.47, 81.70],

    [22, 63.22, 81.85],
    [23, 67.79, 82.00],
    [24, 72.36, 81.85],
    [25, 76.93, 82.00],
    [26, 81.50, 81.85]
  ];

  const VALID_LAKE_SECTORS = new Set(
    POINTS.map(point => point[0])
  );

  // ==========================================================
  // HELPERS
  // ==========================================================

  const text = value =>
    String(value ?? "").trim();

  const $ = id =>
    document.getElementById(id);

  function esc(value) {
    return text(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function number(value) {
    if (
      value == null ||
      text(value) === "" ||
      typeof value === "boolean"
    ) {
      return null;
    }

    const n = Number(
      text(value).replace(",", ".")
    );

    return Number.isFinite(n) && n >= 0
      ? n
      : null;
  }

  function latin(value) {
    return text(value)
      .toUpperCase()
      .replace(/А/g, "A")
      .replace(/В/g, "B")
      .replace(/С/g, "C");
  }

  function team(row) {
    return text(
      row?.team ||
      row?.teamName ||
      row?.participantName
    ) || "—";
  }

  function weight(value) {
    const n = number(value);

    return n == null
      ? "—"
      : n.toFixed(3);
  }

  function slotSort(a, b) {
    return (
      a.zone.localeCompare(b.zone) ||
      a.sector - b.sector
    );
  }

  // ==========================================================
  // TIMEOUT
  // ==========================================================

  function timed(promise, label, ms = FIREBASE_TIMEOUT) {
    let timer;

    return Promise.race([
      Promise.resolve(promise),

      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(label));
        }, ms);
      })
    ]).finally(() => {
      clearTimeout(timer);
    });
  }

  // ==========================================================
  // SLOT PARSING
  // ==========================================================

  function parseSlot(zoneValue, sectorValue) {
    let zone = latin(zoneValue);

    let raw = latin(sectorValue)
      .replace(/[\s_-]+/g, "");

    const prefixed = raw.match(/^([ABC])(\d+)$/);

    if (prefixed) {
      if (
        zone &&
        zone !== prefixed[1]
      ) {
        return null;
      }

      zone = prefixed[1];
      raw = prefixed[2];
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
          `Немає коректного сектора: ${team(row)} ` +
          `(рядок ${index + 1}).`
        );

        return;
      }

      if (slots.has(slot.drawKey)) {
        issues.push(
          `В архіві дублюється ${slot.drawKey}.`
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
  // CATCH DETECTION
  // ==========================================================

  function hasCatch(row) {
    if (!row) return false;

    const keys = [
      "totalWeight",
      "totalCount",
      "bigFish",
      "carpCount",
      "amurCount",
      "sturgeonCount",
      "carpWeight",
      "amurWeight",
      "sturgeonWeight"
    ];

    if (
      keys.some(
        key => (number(row[key]) || 0) > 0
      )
    ) {
      return true;
    }

    const weighings =
      row.weighings &&
      typeof row.weighings === "object"
        ? Object.values(row.weighings)
        : [];

    return [
      row.w1,
      row.w2,
      row.w3,
      row.w4,
      ...weighings
    ].some(slot => {
      if (!slot) return false;

      if (
        typeof slot !== "object"
      ) {
        return (number(slot) || 0) > 0;
      }

      const numericKeys = [
        "c",
        "count",
        "fishCount",
        "w",
        "weight",
        "total",
        "totalWeight",
        "big"
      ];

      const hasNumeric =
        numericKeys.some(
          key =>
            (number(slot[key]) || 0) > 0
        );

      const hasFish = [
        slot.fish,
        slot.fishKg,
        slot.weights
      ].some(list =>
        Array.isArray(list) &&
        list.some(fish => {
          const kg =
            fish &&
            typeof fish === "object"
              ? fish.kg
              : fish;

          return (number(kg) || 0) > 0;
        })
      );

      return hasNumeric || hasFish;
    });
  }

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function inspect(rows, assignments, emptyNumbers) {
    const source = readRows(rows);

    const errors = [];
    const incomplete = [...source.issues];

    const used = new Set();
    const physical = new Set();
    const empty = new Set(emptyNumbers);

    for (const a of assignments) {
      const slot = parseSlot(
        a.zone,
        a.sector
      );

      const n = a.lakeSectorNumber;

      if (
        !Number.isInteger(n) ||
        !VALID_LAKE_SECTORS.has(n) ||
        !slot ||
        a.drawKey !== slot.drawKey
      ) {
        errors.push(
          `Некоректна прив'язка фізичного сектора №${n}. ` +
          `Дозволені тільки №1–${MAX_LAKE_SECTOR}.`
        );

        continue;
      }

      if (
        physical.has(n) ||
        used.has(slot.drawKey)
      ) {
        errors.push(
          `Повторна прив'язка: №${n} / ${slot.drawKey}.`
        );
      }

      physical.add(n);
      used.add(slot.drawKey);

      const row =
        source.slots.get(slot.drawKey)?.row;

      if (
        empty.has(n) &&
        hasCatch(row)
      ) {
        errors.push(
          `${slot.drawKey} / озеро №${n}: ` +
          "є улов, тому сектор не може бути порожнім."
        );
      }

      if (!empty.has(n)) {
        if (!row) {
          incomplete.push(
            `${slot.drawKey}: немає результату в архіві.`
          );
        } else if (
          number(row.totalWeight) == null ||
          number(row.totalCount) == null
        ) {
          incomplete.push(
            `${slot.drawKey}: бракує ваги або кількості риби.`
          );
        }
      }
    }

    for (const n of empty) {
      if (!VALID_LAKE_SECTORS.has(n)) {
        errors.push(
          `Неявка №${n}: сектор не використовується.`
        );
      } else if (!physical.has(n)) {
        errors.push(
          `Неявка №${n} не має прив'язки.`
        );
      }
    }

    const missing = [...source.slots.keys()]
      .filter(key => !used.has(key));

    if (missing.length) {
      incomplete.push(
        `Ще не прив'язано: ${missing.join(", ")}.`
      );
    }

    if (!assignments.length) {
      incomplete.push(
        "Ще немає прив'язок."
      );
    }

    if (!source.slots.size) {
      incomplete.push(
        "В архіві немає придатних результатів."
      );
    }

    return {
      errors,
      incomplete,
      missing,

      ready:
        !errors.length &&
        !incomplete.length,

      selected: assignments.length,
      empty: empty.size,

      included:
        assignments.length - empty.size
    };
  }

  // ==========================================================
  // CANONICAL
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

  // ==========================================================
  // NODE EXPORTS
  // ==========================================================

  if (
    typeof module === "object" &&
    module.exports
  ) {
    module.exports = {
      parseSlot,
      readRows,
      hasCatch,
      inspect,
      canonical,
      number
    };

    return;
  }

  // ==========================================================
  // STATE
  // ==========================================================

  const S = {
    db: null,
    auth: null,
    user: null,

    allowed: false,
    busy: false,
    dirty: false,

    year: "",
    stages: [],
    current: null,

    assignments: [],
    empty: [],

    revision: 0,
    sourceHash: "",

    selected: 1,
    zoom: 1,

    started: false
  };

  // ==========================================================
  // SAFE DOM
  // ==========================================================

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = value;
    }
  }

  function setDisabled(id, value) {
    const element = $(id);

    if (element) {
      element.disabled = Boolean(value);
    }
  }

  function setHidden(id, value) {
    const element = $(id);

    if (element) {
      element.hidden = Boolean(value);
    }
  }

  function message(value, kind = "") {
    const status = $("mapStatus");

    if (status) {
      status.textContent = value;
      status.dataset.kind = kind;
      status.style.whiteSpace = "pre-line";

      console.log(
        "[Sector maps v1.4]",
        value
      );

      return;
    }

    console.log(
      "[Sector maps v1.4]",
      value
    );
  }

  function fatal(value) {
    console.error(
      "[Sector maps v1.4]",
      value
    );

    message(value, "error");

    const status = $("mapStatus");

    if (!status) {
      const box = document.createElement("div");

      box.id = "mapStatus";

      box.style.cssText = `
        padding: 18px;
        margin: 16px;
        border: 1px solid #b91c1c;
        border-radius: 12px;
        background: #290b0b;
        color: #ffffff;
        white-space: pre-line;
        font-size: 15px;
      `;

      box.textContent = value;

      const target =
        $("mapApp") ||
        document.body;

      target.prepend(box);
    }
  }

  // ==========================================================
  // REQUIRED HTML
  // ==========================================================

  const REQUIRED_IDS = [
    "mapApp",
    "mapStatus",
    "mapYear",
    "mapStage",
    "mapEditor",
    "mapPins",
    "mapViewport",
    "mapCanvas",
    "lakeSector",
    "archiveSlot",
    "manualZone",
    "manualNumber",
    "manualSlot",
    "slotPreview",
    "emptySectors",
    "mappingRows",
    "mapSummary",
    "mapCoverage",
    "saveState",
    "selectedStageTitle"
  ];

  function validateHTML() {
    const missing =
      REQUIRED_IDS.filter(id => !$(id));

    if (missing.length) {
      throw new Error(
        "HTML сторінки не відповідає JavaScript v1.4.\n" +
        "Відсутні елементи:\n" +
        missing.map(id => `• #${id}`).join("\n")
      );
    }
  }

  // ==========================================================
  // ERROR FORMAT
  // ==========================================================

  function errorMessage(error) {
    const code =
      text(error?.code);

    if (code.includes("permission-denied")) {
      const detail =
        error.scRequest;

      const project =
        S.db?.app?.options?.projectId ||
        "не визначено";

      return [
        "Firestore відхилив запит.",

        detail
          ? `${detail.operation}: ${detail.path}`
          : "Операцію не визначено.",

        `Firebase-проєкт: ${project}`,
        `Код: ${code}`,

        S.dirty
          ? "Незбережені зміни залишилися на сторінці."
          : ""
      ].filter(Boolean).join("\n");
    }

    return error?.message || String(error);
  }

  // ==========================================================
  // FIRESTORE REQUESTS
  // ==========================================================

  async function dbRequest(operation, path, task) {
    try {
      return await timed(
        Promise.resolve().then(task),

        `Перевищено час очікування Firestore.\n` +
        `${operation}: ${path}\n` +
        "Перевір інтернет-з'єднання та Firebase.",

        FIRESTORE_TIMEOUT
      );
    } catch (error) {
      const wrapped = new Error(
        error?.message || String(error)
      );

      wrapped.code = error?.code;

      wrapped.scRequest =
        error?.scRequest || {
          operation,
          path
        };

      throw wrapped;
    }
  }

  function serverRead(ref, isList = false) {
    return dbRequest(
      isList ? "Список" : "Читання",
      ref.path,
      () => ref.get({
        source: "server"
      })
    );
  }

  // ==========================================================
  // CONTROLS
  // ==========================================================

  function controls() {
    setDisabled(
      "loadFields",
      S.busy || !S.allowed
    );

    setDisabled(
      "loadYear",
      S.busy || !S.allowed
    );

    setDisabled(
      "editFields",
      S.busy ||
      !S.allowed ||
      !S.current
    );

    setDisabled(
      "saveMap",
      S.busy ||
      !S.allowed ||
      !S.current ||
      !S.dirty
    );

    setDisabled(
      "mapStage",
      S.busy ||
      !S.allowed ||
      !S.stages.length
    );
  }

  // ==========================================================
  // RUN
  // ==========================================================

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
      console.error(
        "[Sector maps v1.4]",
        error
      );

      message(
        errorMessage(error),
        "error"
      );
    } finally {
      S.busy = false;

      controls();
    }
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  function requireAccess() {
    if (
      !S.allowed ||
      S.auth?.currentUser?.uid !== OWNER_UID
    ) {
      throw new Error(
        "Потрібно увійти під акаунтом адміністратора."
      );
    }
  }

  // ==========================================================
  // REFERENCES
  // ==========================================================

  function sourceRef(year, id) {
    return S.db
      .collection("seasonResults")
      .doc(year)
      .collection("stages")
      .doc(id);
  }

  function mapRef(year, id) {
    return S.db
      .collection("sectorMaps")
      .doc(year)
      .collection("stages")
      .doc(id);
  }

  // ==========================================================
  // FINGERPRINT
  // ==========================================================

  async function fingerprint(rows) {
    if (!window.crypto?.subtle) {
      throw new Error(
        "Для перевірки архіву потрібен HTTPS."
      );
    }

    const bytes =
      new TextEncoder().encode(
        JSON.stringify(canonical(rows))
      );

    const hash =
      await window.crypto.subtle.digest(
        "SHA-256",
        bytes
      );

    return [...new Uint8Array(hash)]
      .map(
        b => b.toString(16).padStart(2, "0")
      )
      .join("");
  }

  // ==========================================================
  // STAGE LABEL
  // ==========================================================

  function stageLabel(id, data, metadata) {
    const meta = metadata.find(
      item =>
        text(item.stageDocId) === id
    );

    const title = text(
      meta?.title ||
      meta?.stageName ||
      data?.stageName ||
      data?.title ||
      data?.stageId ||
      id
    );

    return (
      (meta?.isFinal || data?.isFinal) &&
      !/фінал|final/i.test(title)
    )
      ? `Фінал · ${title}`
      : title;
  }

  // ==========================================================
  // LOAD YEAR
  // ==========================================================

  async function loadYear() {
    requireAccess();

    const year =
      text($("mapYear").value);

    if (!/^\d{4}$/.test(year)) {
      throw new Error(
        "Введи рік чотирма цифрами."
      );
    }

    message(
      `Завантажую архівні етапи за ${year} рік…`
    );

    const results =
      await Promise.allSettled([
        serverRead(
          S.db
            .collection("seasonResults")
            .doc(year)
            .collection("stages"),
          true
        ),

        serverRead(
          S.db
            .collection("seasonArchives")
            .doc(year)
        )
      ]);

    requireAccess();

    if (
      results[0].status !== "fulfilled"
    ) {
      throw results[0].reason;
    }

    const metaData =
      results[1].status === "fulfilled"
        ? results[1].value.data()
        : null;

    const metadata =
      Array.isArray(metaData?.stages)
        ? metaData.stages
        : [];

    const stages =
      results[0].value.docs
        .map(doc => ({
          id: doc.id,

          title: stageLabel(
            doc.id,
            doc.data(),
            metadata
          )
        }))
        .sort(
          (a, b) =>
            a.title.localeCompare(
              b.title,
              "uk",
              {
                numeric: true
              }
            )
        );

    S.year = year;
    S.stages = stages;

    S.current = null;
    S.dirty = false;

    setHidden("mapEditor", true);

    $("mapStage").innerHTML =
      '<option value="">Обери етап</option>' +
      stages.map(item => `
        <option value="${esc(item.id)}">
          ${esc(item.title)} · ${esc(item.id)}
        </option>
      `).join("");

    message(
      stages.length
        ? `Знайдено етапів: ${stages.length}. Обери потрібний.`
        : `За ${year} рік архівних етапів немає.`
    );
  }

  // ==========================================================
  // LOAD STAGE
  // ==========================================================

  async function loadStage(id) {
    requireAccess();

    const stage =
      S.stages.find(
        item => item.id === id
      );

    if (!stage) {
      throw new Error(
        "Обери архівний етап."
      );
    }

    message(
      "Завантажую результат і карту етапу…"
    );

    const [source, saved] =
      await Promise.all([
        serverRead(
          sourceRef(S.year, id)
        ),

        serverRead(
          mapRef(S.year, id)
        )
      ]);

    requireAccess();

    if (!source.exists) {
      throw new Error(
        "Цього етапу немає в архіві."
      );
    }

    const data = source.data();

    const old =
      saved.exists
        ? saved.data()
        : null;

    if (
      old &&
      (
        old.schemaVersion !== 1 ||
        old.lakeId !== LAKE_ID ||
        old.seasonYear !== S.year ||
        old.stageDocId !== id
      )
    ) {
      throw new Error(
        "Збережена карта має іншу версію, " +
        "водойму або етап. Перезаписування заблоковано."
      );
    }

    if (
      old &&
      (
        !Array.isArray(old.assignments) ||
        !Array.isArray(old.emptyLakeSectors) ||
        !Number.isInteger(old.revision)
      )
    ) {
      throw new Error(
        "Некоректний документ карти."
      );
    }

    const rows = data.standings;

    const hash =
      await fingerprint(rows ?? null);

    S.current = {
      ...stage,
      data,
      rows
    };

    S.sourceHash = hash;

    S.assignments = old
      ? old.assignments.map(a => ({ ...a }))
      : [];

    S.empty = old
      ? [...old.emptyLakeSectors]
      : [];

    S.revision =
      old?.revision || 0;

    S.dirty = Boolean(
      old &&
      old.sourceSignature !== hash
    );

    S.selected = 1;
    S.zoom = 1;

    setText(
      "selectedStageTitle",
      `${S.year} · ${stage.title}`
    );

    setHidden("mapEditor", false);

    render();
    selectSector(1);

    requestAnimationFrame(resizeMap);

    const obsolete =
      S.assignments.filter(
        a =>
          !VALID_LAKE_SECTORS.has(
            a.lakeSectorNumber
          )
      );

    if (obsolete.length) {
      message(
        "У збереженій карті є прив'язки до секторів, " +
        "які більше не використовуються: " +
        obsolete
          .map(a => `№${a.lakeSectorNumber}`)
          .join(", ") +
        ". Вони залишилися в документі. " +
        "Перед збереженням їх потрібно перевірити.",
        "error"
      );

      return;
    }

    message(
      old &&
      old.sourceSignature !== hash
        ? "Архів змінився. Перевір відповідності."
        : old
          ? "Збережену карту завантажено."
          : "Нова карта. Прив'яжи турнірні позначення."
    );
  }

  // ==========================================================
  // RESULT TEXT
  // ==========================================================

  function resultText(row) {
    return row
      ? `${weight(row.totalWeight)} кг · ` +
        `${number(row.totalCount) ?? "—"} риб`
      : "Немає запису в архіві";
  }

  // ==========================================================
  // PIN STYLES
  // ==========================================================

  function installPinStyles() {
    if ($("scSectorMapPinStyles")) {
      return;
    }

    const style =
      document.createElement("style");

    style.id = "scSectorMapPinStyles";

    style.textContent = `
      #mapCanvas {
        position: relative;
        box-sizing: border-box;
      }

      #mapPins {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      #mapPins .map-pin {
        position: absolute;
        z-index: 2;

        width: clamp(20px, 3.2vw, 38px);
        height: clamp(20px, 3.2vw, 38px);

        padding: 0;
        margin: 0;

        transform: translate(-50%, -50%);

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        border-radius: 50%;

        border: 2px solid #ffffff;

        background: #172033;
        color: #ffffff;

        box-shadow:
          0 2px 8px rgba(0, 0, 0, .8),
          0 0 0 1px rgba(0, 0, 0, .55);

        font-family: Arial, sans-serif;
        font-weight: 900;

        cursor: pointer;
        pointer-events: auto;
        touch-action: manipulation;
      }

      #mapPins .map-pin > span {
        display: block;

        font-size: clamp(10px, 1.5vw, 17px);
        font-weight: 900;

        line-height: 1.05;
        color: #ffffff;
      }

      #mapPins .map-pin > small {
        display: block;

        max-width: 100%;

        font-size: clamp(6px, .85vw, 10px);
        font-weight: 800;

        line-height: 1;

        color: #ffffff;

        white-space: nowrap;
        overflow: hidden;
      }

      #mapPins .map-pin[data-zone="A"] {
        background: #14783d;
        border-color: #b8ffd0;
      }

      #mapPins .map-pin[data-zone="B"] {
        background: #2059bc;
        border-color: #c4dcff;
      }

      #mapPins .map-pin[data-zone="C"] {
        background: #ba242b;
        border-color: #ffd0d0;
      }

      #mapPins .map-pin[data-empty="true"] {
        opacity: .75;
        border-style: dashed;
      }

      #mapPins .map-pin[aria-pressed="true"] {
        z-index: 10;

        border: 3px solid #ffd21c;

        box-shadow:
          0 0 0 3px rgba(255, 210, 28, .55),
          0 0 15px rgba(255, 210, 28, .85),
          0 3px 9px rgba(0, 0, 0, .85);
      }

      @media (max-width: 640px) {
        #mapPins .map-pin {
          width: 22px;
          height: 22px;
          border-width: 1.5px;
        }

        #mapPins .map-pin > span {
          font-size: 11px;
        }

        #mapPins .map-pin > small {
          font-size: 6px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {
    if (!S.current) return;

    const source =
      readRows(S.current.rows);

    const check =
      inspect(
        S.current.rows,
        S.assignments,
        S.empty
      );

    const pins = $("mapPins");

    pins.innerHTML =
      POINTS.map(([n, x, y]) => {
        const a =
          S.assignments.find(
            item =>
              item.lakeSectorNumber === n
          );

        const empty =
          S.empty.includes(n);

        const label = a
          ? `${a.drawKey}${empty ? " ×" : ""}`
          : "—";

        return `
          <button
            type="button"
            class="map-pin"
            data-lake="${n}"
            data-zone="${esc(a?.zone || "")}"
            data-empty="${empty}"
            aria-pressed="${n === S.selected}"
            aria-label="Сектор озера №${n}"
            style="left:${x}%;top:${y}%"
          >
            <span>${n}</span>
            <small>${esc(label)}</small>
          </button>
        `;
      }).join("");

    pins
      .querySelectorAll("[data-lake]")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            selectSector(
              Number(button.dataset.lake)
            );
          }
        );
      });

    const ordered =
      S.assignments
        .slice()
        .sort(slotSort);

    $("emptySectors").innerHTML =
      ordered.length
        ? ordered.map(a => {
            const row =
              source.slots.get(a.drawKey)?.row;

            const disabled =
              !VALID_LAKE_SECTORS.has(
                a.lakeSectorNumber
              );

            return `
              <label class="maps-check">
                <input
                  type="checkbox"
                  data-empty-sector="${a.lakeSectorNumber}"
                  ${S.empty.includes(a.lakeSectorNumber) ? "checked" : ""}
                  ${disabled ? "disabled" : ""}
                >
                <span>
                  ${esc(a.drawKey)} · озеро №${a.lakeSectorNumber}
                  <br>
                  <span class="maps-muted">
                    ${esc(team(row))}
                  </span>
                </span>
              </label>
            `;
          }).join("")
        : '<p class="maps-muted">Спочатку додай прив\'язки секторів.</p>';

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

            if (!a) return;

            if (
              input.checked &&
              hasCatch(
                source.slots.get(a.drawKey)?.row
              )
            ) {
              input.checked = false;

              message(
                `${a.drawKey}: в архіві є улов. ` +
                "Позначити неявку не можна.",
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

    $("mappingRows").innerHTML =
      ordered.map(a => {
        const row =
          source.slots.get(a.drawKey)?.row;

        const obsolete =
          !VALID_LAKE_SECTORS.has(
            a.lakeSectorNumber
          );

        return `
          <tr>
            <td>№${a.lakeSectorNumber}</td>
            <td>${esc(a.drawKey)}</td>
            <td>${esc(team(row))}</td>
            <td>${esc(resultText(row))}</td>
            <td>
              ${
                obsolete
                  ? "Не використовується"
                  : S.empty.includes(a.lakeSectorNumber)
                    ? "Пустував"
                    : "Ловили"
              }
            </td>
          </tr>
        `;
      }).join("") ||
      '<tr><td colspan="5">Ще немає прив\'язок.</td></tr>';

    setText(
      "mapSummary",
      `У розстановці: ${check.selected} · ` +
      `Пустували: ${check.empty} · ` +
      `Ловили: ${check.included}`
    );

    setText(
      "mapCoverage",
      check.ready
        ? "Усі архівні сектори прив'язані. Карта готова."
        : [
            ...check.errors,
            ...check.incomplete
          ].join(" ") +
          (
            check.errors.length
              ? " Виправ помилки перед збереженням."
              : " Можна зберегти чернетку."
          )
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
      !VALID_LAKE_SECTORS.has(n)
    ) {
      return;
    }

    S.selected = n;

    $("lakeSector").value =
      String(n);

    const source =
      readRows(S.current.rows);

    const a =
      S.assignments.find(
        item =>
          item.lakeSectorNumber === n
      );

    const used = new Set(
      S.assignments
        .filter(
          item =>
            item.lakeSectorNumber !== n
        )
        .map(item => item.drawKey)
    );

    $("archiveSlot").innerHTML =
      '<option value="">Обери позначення</option>' +
      [...source.slots.values()]
        .sort(slotSort)
        .map(slot => `
          <option
            value="${slot.drawKey}"
            ${used.has(slot.drawKey) ? "disabled" : ""}
          >
            ${slot.drawKey} · ${esc(team(slot.row))}
          </option>
        `).join("") +
      '<option value="manual">Номер, якого немає в архіві…</option>';

    $("archiveSlot").value = a
      ? source.slots.has(a.drawKey)
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

    preview();
  }

  // ==========================================================
  // CHOSEN SLOT
  // ==========================================================

  function chosenSlot() {
    return $("archiveSlot").value === "manual"
      ? parseSlot(
          $("manualZone").value,
          $("manualNumber").value
        )
      : parseSlot(
          "",
          $("archiveSlot").value
        );
  }

  // ==========================================================
  // PREVIEW
  // ==========================================================

  function preview() {
    if (!S.current) return;

    setHidden(
      "manualSlot",
      $("archiveSlot").value !== "manual"
    );

    const slot =
      chosenSlot();

    const row = slot
      ? readRows(S.current.rows)
          .slots.get(slot.drawKey)?.row
      : null;

    setText(
      "slotPreview",
      !slot
        ? "Обери позначення з архіву."
        : `Озеро №${S.selected} → ${slot.drawKey}\n` +
          (
            row
              ? `${team(row)}\n${resultText(row)}`
              : "Цього номера немає в архіві. " +
                "Для порожнього сектора познач неявку."
          )
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
  // ASSIGN
  // ==========================================================

  function assign() {
    if (!S.current) return;

    if (
      !VALID_LAKE_SECTORS.has(S.selected)
    ) {
      message(
        "Обраний сектор не використовується.",
        "error"
      );

      return;
    }

    const slot =
      chosenSlot();

    if (!slot) {
      message(
        "Обери сектор або введи зону A/B/C та номер.",
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
        `${slot.drawKey} уже прив'язаний до ` +
        `озера №${collision.lakeSectorNumber}.`,
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

      ...slot
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
      `Озеро №${S.selected} прив'язано до ${slot.drawKey}. ` +
      "Збережи карту."
    );
  }

  // ==========================================================
  // REMOVE
  // ==========================================================

  function remove() {
    if (!S.current) return;

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
  // SAVE
  // ==========================================================

  async function save() {
    requireAccess();

    if (!S.current) {
      throw new Error(
        "Спочатку обери архівний етап."
      );
    }

    const check =
      inspect(
        S.current.rows,
        S.assignments,
        S.empty
      );

    if (check.errors.length) {
      throw new Error(
        check.errors.join("\n")
      );
    }

    const id = S.current.id;
    const year = S.year;

    const expectedRevision =
      S.revision;

    const assignments =
      S.assignments
        .map(a => ({
          lakeSectorId:
            `sector-${a.lakeSectorNumber}`,

          lakeSectorNumber:
            a.lakeSectorNumber,

          zone: a.zone,
          sector: a.sector,
          drawKey: a.drawKey
        }))
        .sort(
          (a, b) =>
            a.lakeSectorNumber -
            b.lakeSectorNumber
        );

    const empty =
      [...new Set(S.empty)]
        .sort((a, b) => a - b);

    message(
      "Зберігаю карту…"
    );

    const sourceReference =
      sourceRef(year, id);

    const mapReference =
      mapRef(year, id);

    await dbRequest(
      "Збереження",
      mapReference.path,

      () => S.db.runTransaction(async tx => {
        const source =
          await tx.get(sourceReference);

        const saved =
          await tx.get(mapReference);

        requireAccess();

        if (!source.exists) {
          throw new Error(
            "Архівний етап не знайдено."
          );
        }

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

        const old =
          saved.exists
            ? saved.data()
            : null;

        if (
          (old?.revision || 0) !==
          expectedRevision
        ) {
          throw new Error(
            "Карту вже змінили в іншій вкладці."
          );
        }

        const stamp =
          window.firebase.firestore
            .FieldValue
            .serverTimestamp();

        tx.set(mapReference, {
          schemaVersion: 1,

          lakeId: LAKE_ID,
          mapVersion: 1,

          seasonYear: year,
          stageDocId: id,

          sourcePath:
            `seasonResults/${year}/stages/${id}`,

          sourceSignature:
            S.sourceHash,

          stageTitle:
            S.current.title,

          assignments,

          emptyLakeSectors: empty,

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
        });
      })
    );

    S.revision =
      expectedRevision + 1;

    S.dirty = false;

    render();

    message(
      check.ready
        ? "Карту збережено. Готова для статистики."
        : "Чернетку карти збережено.",
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

    const availableWidth =
      viewport.clientWidth;

    if (!availableWidth) {
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
      `${availableWidth * S.zoom}px`;

    canvas.style.height =
      "auto";

    canvas.style.aspectRatio =
      `${MAP_WIDTH} / ${MAP_HEIGHT}`;

    viewport.style.maxHeight =
      "none";

    viewport.style.overflowX =
      S.zoom > MIN_ZOOM
        ? "auto"
        : "hidden";

    viewport.style.overflowY =
      S.zoom > MIN_ZOOM
        ? "auto"
        : "hidden";

    const zoomText =
      `${Math.round(S.zoom * 100)}%`;

    const zoomValue =
      $("zoomValue");

    if (zoomValue) {
      zoomValue.value = zoomText;
      zoomValue.textContent = zoomText;
    }

    setDisabled(
      "zoomOut",
      S.zoom <= MIN_ZOOM
    );

    setDisabled(
      "zoomIn",
      S.zoom >= MAX_ZOOM
    );
  }

  function resetMapZoom() {
    S.zoom = MIN_ZOOM;

    resizeMap();

    const viewport =
      $("mapViewport");

    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  // ==========================================================
  // FIREBASE READY
  // ==========================================================

  async function waitFirebase() {
    message(
      "Перевіряю підключення Firebase…"
    );

    if (window.scReady) {
      await timed(
        window.scReady,

        "Firebase не відповів за 15 секунд.\n" +
        "Перевір assets/js/firebase-init.js."
      );
    }

    if (
      !window.scDb ||
      !window.scAuth
    ) {
      await timed(
        new Promise(resolve => {
          const timer = setInterval(() => {
            if (
              window.scDb &&
              window.scAuth
            ) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        }),

        "Firebase не ініціалізований.\n" +
        "Перевір assets/js/firebase-init.js."
      );
    }

    S.db = window.scDb;
    S.auth = window.scAuth;

    if (
      !S.db ||
      !S.auth
    ) {
      throw new Error(
        "Firebase недоступний."
      );
    }
  }

  // ==========================================================
  // AUTH
  // ==========================================================

  function waitAuthUser() {
    return timed(
      new Promise((resolve, reject) => {
        let unsubscribe = null;
        let settled = false;

        const onUser = user => {
          if (settled) return;

          settled = true;

          if (unsubscribe) {
            unsubscribe();
          }

          resolve(user);
        };

        try {
          unsubscribe =
            S.auth.onAuthStateChanged(
              onUser,
              reject
            );

          if (
            settled &&
            unsubscribe
          ) {
            unsubscribe();
          }
        } catch (error) {
          reject(error);
        }
      }),

      "Не вдалося перевірити вхід за 15 секунд."
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
        `STOLAR CARP • Карти архівних етапів v${VERSION}\n` +
        "Підготовка сторінки…"
      );

      validateHTML();

      installPinStyles();

      controls();

      await waitFirebase();

      message(
        "Firebase підключено.\n" +
        "Перевіряю авторизацію…"
      );

      const user =
        await waitAuthUser();

      if (!user) {
        throw new Error(
          "Користувач не авторизований.\n" +
          "Увійди через адмінпанель."
        );
      }

      if (
        user.uid !== OWNER_UID
      ) {
        throw new Error(
          "Редагування карт доступне " +
          "тільки власнику STOLAR CARP."
        );
      }

      message(
        "Авторизацію підтверджено.\n" +
        "Перевіряю роль адміністратора…"
      );

      const profile =
        await serverRead(
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

      S.user = user;
      S.allowed = true;

      setHidden("mapApp", false);

      S.auth.onAuthStateChanged(value => {
        if (
          value?.uid !== OWNER_UID
        ) {
          S.allowed = false;

          setHidden("mapApp", true);

          controls();

          message(
            "Сесію завершено.\n" +
            "Увійди повторно.",
            "error"
          );
        }
      });

      const params =
        new URLSearchParams(
          window.location.search
        );

      $("mapYear").value =
        params.get("year") ||
        String(new Date().getFullYear());

      $("lakeSector").innerHTML =
        POINTS.map(([n]) => `
          <option value="${n}">
            Сектор озера №${n}
          </option>
        `).join("");

      controls();

      message(
        "Доступ підтверджено.\n" +
        "Завантажую архівні етапи…"
      );

      await run(loadYear);

    } catch (error) {
      console.error(
        "[Sector maps boot]",
        error
      );

      fatal(
        errorMessage(error)
      );
    }
  }

  // ==========================================================
  // SAFE EVENTS
  // ==========================================================

  function on(id, eventName, handler) {
    const element = $(id);

    if (!element) {
      console.warn(
        `[Sector maps] HTML #${id} відсутній.`
      );

      return;
    }

    element.addEventListener(
      eventName,
      handler
    );
  }

  function mayLeave() {
    return (
      !S.dirty ||
      window.confirm(
        "Є незбережені зміни карти. " +
        "Перейти без збереження?"
      )
    );
  }

  // ==========================================================
  // BIND EVENTS
  // ==========================================================

  function bindEvents() {
    on("loadYear", "click", () => {
      if (mayLeave()) {
        run(loadYear);
      }
    });

    on("mapStage", "change", () => {
      const element =
        $("mapStage");

      const id =
        element?.value || "";

      const previous =
        S.current?.id || "";

      if (
        !id ||
        !mayLeave()
      ) {
        if (element) {
          element.value = previous;
        }

        return;
      }

      run(async () => {
        try {
          await loadStage(id);
        } catch (error) {
          if (element) {
            element.value = previous;
          }

          throw error;
        }
      });
    });

    on("lakeSector", "change", () => {
      selectSector(
        Number(
          $("lakeSector")?.value
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

    on("assignSlot", "click", assign);

    on("removeSlot", "click", remove);

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

    on("zoomReset", "click", resetMapZoom);

    on("lakeImage", "error", () => {
      setHidden("imageError", false);
    });

    window.addEventListener(
      "resize",
      () => {
        requestAnimationFrame(resizeMap);
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
  // START
  // ==========================================================

  function start() {
    try {
      bindEvents();

      boot();
    } catch (error) {
      fatal(
        errorMessage(error)
      );
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );
  } else {
    start();
  }

})();
