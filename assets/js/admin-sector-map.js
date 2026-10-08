// ============================================================
// STOLAR CARP • Карти архівних етапів
// Версія: 1.2 • 08.10.2026
//
// Джерело результатів:
// seasonResults/{year}/stages/{stageDocId}
//
// Збереження карт:
// sectorMaps/{year}/stages/{stageDocId}
//
// ОНОВЛЕННЯ v1.2:
//
// ✅ Повна карта вміщується по ширині екрана
// ✅ Адаптація під телефон і комп'ютер
// ✅ Виправлені координати секторів 22–26
// ✅ Масштабування 100–250%
// ✅ Кнопка 100% повертає повний огляд
// ✅ Новий етап відкривається при 100%
// ✅ Архівні результати не змінюються
// ✅ Прив'язки секторів зберігаються
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // CONFIG
  // ==========================================================

  const OWNER_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const LAKE_ID = "lelehivka";

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;

  const MAP_WIDTH = 1615;
  const MAP_HEIGHT = 974;

  // ==========================================================
  // LELEHIVKA • PHYSICAL SECTORS
  //
  // Координати у відсотках від зображення.
  //
  // ВАЖЛИВО:
  // Це постійні фізичні номери секторів водойми.
  // Вони не залежать від жеребкування етапу.
  //
  // Виправлення:
  // №22 -> колишнє місце №24
  // №23 -> колишнє місце №25
  // №24–26 -> посунуті праворуч
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

    // ========================================================
    // ВИПРАВЛЕНІ СЕКТОРИ 22–26
    // ========================================================

    [22, 63.22, 81.85],
    [23, 67.79, 82.00],
    [24, 72.36, 81.85],
    [25, 76.93, 82.00],
    [26, 81.50, 81.85],

    // ========================================================

    [27, 90.46, 51.84],
    [28, 90.55, 42.93],
    [29, 90.55, 34.46],
    [30, 90.64, 27.03]

  ];

  // ==========================================================
  // HELPERS
  // ==========================================================

  const text = value =>
    String(value ?? "").trim();

  const esc = value =>
    text(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const number = value => {

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
  };

  const latin = value =>
    text(value)
      .toUpperCase()
      .replace(/А/g, "A")
      .replace(/В/g, "B")
      .replace(/С/g, "C");

  const team = row =>
    text(
      row?.team ||
      row?.teamName ||
      row?.participantName
    ) || "—";

  const weight = value =>
    number(value) == null
      ? "—"
      : number(value).toFixed(3);

  const slotSort = (a, b) =>
    a.zone.localeCompare(b.zone) ||
    a.sector - b.sector;

  // ==========================================================
  // PARSE SLOT
  // ==========================================================

  function parseSlot(zoneValue, sectorValue) {

    let zone = latin(zoneValue);

    let raw = latin(sectorValue)
      .replace(/[\s_-]+/g, "");

    const prefixed = raw.match(
      /^([ABC])(\d+)$/
    );

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

    return sector >= 1 && sector <= 99
      ? {
          zone,
          sector,
          drawKey: `${zone}${sector}`
        }
      : null;
  }

  // ==========================================================
  // READ ARCHIVE ROWS
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
          `Немає коректного сектора: ${team(row)} (рядок ${index + 1}).`
        );

        return;
      }

      if (slots.has(slot.drawKey)) {

        issues.push(
          `В архіві дублюється ${slot.drawKey}.`
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

    return [
      row.w1,
      row.w2,
      row.w3,
      row.w4,
      ...Object.values(row.weighings || {})
    ].some(slot => {

      if (!slot) return false;

      return [
        "c",
        "count",
        "fishCount",
        "w",
        "weight",
        "total",
        "totalWeight",
        "big"
      ].some(
        key => (number(slot[key]) || 0) > 0
      ) || [
        slot.fish,
        slot.fishKg,
        slot.weights
      ].some(
        list =>
          Array.isArray(list) &&
          list.some(
            fish =>
              (
                number(
                  typeof fish === "object"
                    ? fish?.kg
                    : fish
                ) || 0
              ) > 0
          )
      );

    });
  }

  // ==========================================================
  // VALIDATION
  // ==========================================================

  function inspect(
    rows,
    assignments,
    emptyNumbers
  ) {

    const source = readRows(rows);

    const errors = [];

    const incomplete = [
      ...source.issues
    ];

    const used = new Set();

    const physical = new Set();

    const empty = new Set(
      emptyNumbers
    );

    for (const a of assignments) {

      const slot = parseSlot(
        a.zone,
        a.sector
      );

      const n = a.lakeSectorNumber;

      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n > 30 ||
        !slot ||
        a.drawKey !== slot.drawKey
      ) {

        errors.push(
          "Некоректна прив’язка сектора."
        );

        continue;
      }

      if (
        physical.has(n) ||
        used.has(slot.drawKey)
      ) {

        errors.push(
          `Повторна прив’язка: №${n} / ${slot.drawKey}.`
        );
      }

      physical.add(n);
      used.add(slot.drawKey);

      const row =
        source.slots.get(
          slot.drawKey
        )?.row;

      if (
        empty.has(n) &&
        hasCatch(row)
      ) {

        errors.push(
          `${slot.drawKey} / озеро №${n}: є улов, тому сектор не може бути порожнім.`
        );
      }

      if (!empty.has(n)) {

        if (!row) {

          incomplete.push(
            `${slot.drawKey}: немає результату в архіві. Перевір номер або познач неявку.`
          );

        } else if (
          number(row.totalWeight) == null ||
          number(row.totalCount) == null
        ) {

          incomplete.push(
            `${slot.drawKey}: у результаті бракує ваги або кількості риби.`
          );
        }
      }
    }

    for (const n of empty) {

      if (!physical.has(n)) {

        errors.push(
          `Неявка №${n} не має прив’язки.`
        );
      }
    }

    const missing = [
      ...source.slots.keys()
    ].filter(
      key => !used.has(key)
    );

    if (missing.length) {

      incomplete.push(
        `Ще не прив’язано: ${missing.join(", ")}.`
      );
    }

    if (!assignments.length) {

      incomplete.push(
        "Ще немає прив’язок."
      );
    }

    if (!source.slots.size) {

      incomplete.push(
        "В архіві немає придатних результатів цього етапу."
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
        assignments.length -
        empty.size
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
          .map(
            key => [
              key,
              canonical(value[key])
            ]
          )
      );
    }

    return value ?? null;
  }

  // ==========================================================
  // NODE TEST EXPORTS
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
  // DOM
  // ==========================================================

  const $ = id =>
    document.getElementById(id);

  if (!$("mapApp")) return;

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

    zoom: 1

  };

  // ==========================================================
  // MESSAGES
  // ==========================================================

  function message(
    value,
    kind = ""
  ) {

    $("mapStatus").textContent = value;

    $("mapStatus").dataset.kind = kind;
  }

  function errorMessage(error) {

    if (
      String(error?.code)
        .includes("permission-denied")
    ) {

      const detail = error.scRequest;

      const project =
        S.db?.app?.options?.projectId ||
        "не визначено";

      return [
        "Firestore відхилив запит.",

        detail
          ? `${detail.operation}: ${detail.path}`
          : "Операцію не визначено.",

        `Firebase-проєкт: ${project}`,

        `Код: ${error.code}`,

        S.dirty
          ? "Незбережені зміни карти залишилися на сторінці."
          : ""

      ].filter(Boolean).join("\n");
    }

    return error?.message || String(error);
  }

  // ==========================================================
  // FIRESTORE REQUESTS
  // ==========================================================

  async function dbRequest(
    operation,
    path,
    task
  ) {

    try {

      return await task();

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

  function serverRead(
    ref,
    isList = false
  ) {

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

    $("loadFields").disabled =
      S.busy || !S.allowed;

    $("editFields").disabled =
      S.busy ||
      !S.allowed ||
      !S.current;

    $("saveMap").disabled =
      !S.dirty;

    $("mapStage").disabled =
      !S.stages.length;
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
        "[Sector maps]",
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
  // UNSAVED CHANGES
  // ==========================================================

  function mayLeave() {

    return (
      !S.dirty ||
      window.confirm(
        "Є незбережені зміни карти. Перейти без їх збереження?"
      )
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  function requireAccess() {

    if (
      !S.allowed ||
      S.auth.currentUser?.uid !== OWNER_UID
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
        "Відкрий сторінку через HTTPS на сайті."
      );
    }

    const bytes =
      new TextEncoder().encode(
        JSON.stringify(
          canonical(rows)
        )
      );

    const hash =
      await window.crypto.subtle.digest(
        "SHA-256",
        bytes
      );

    return [
      ...new Uint8Array(hash)
    ]
      .map(
        b =>
          b.toString(16)
            .padStart(2, "0")
      )
      .join("");
  }

  // ==========================================================
  // STAGE LABEL
  // ==========================================================

  function stageLabel(
    id,
    data,
    metadata
  ) {

    const meta = metadata.find(
      item =>
        text(item.stageDocId) === id
    );

    const title = text(
      meta?.title ||
      meta?.stageName ||
      data.stageName ||
      data.title ||
      data.stageId ||
      id
    );

    return (
      (meta?.isFinal || data.isFinal) &&
      !/фінал|final/i.test(title)
    )
      ? `Фінал · ${title}`
      : title;
  }

  // ==========================================================
  // LOAD YEAR
  // ==========================================================

  async function loadYear() {

    const year =
      text($("mapYear").value);

    if (!/^\d{4}$/.test(year)) {

      throw new Error(
        "Введи рік чотирма цифрами, наприклад 2026."
      );
    }

    message(
      "Завантажую архівні етапи…"
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
      results[0].status !==
      "fulfilled"
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

    if (
      results[1].status === "rejected"
    ) {

      console.warn(
        "[Sector maps] Назви з seasonArchives недоступні."
      );
    }

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

    $("mapEditor").hidden = true;

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
        "Цього етапу вже немає в архіві. Онови список."
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
        "Збережена карта має іншу версію, водойму або етап. " +
        "Автоматичне перезаписування заблоковано."
      );
    }

    if (
      old &&
      (
        !Array.isArray(
          old.assignments
        ) ||
        !Array.isArray(
          old.emptyLakeSectors
        ) ||
        !Number.isInteger(
          old.revision
        )
      )
    ) {

      throw new Error(
        "Некоректний документ карти. Його не буде перезаписано."
      );
    }

    const rows =
      data.standings;

    const hash =
      await fingerprint(
        rows ?? null
      );

    S.current = {
      ...stage,
      data,
      rows
    };

    S.sourceHash = hash;

    S.assignments = old
      ? old.assignments.map(
          a => ({
            ...a
          })
        )
      : [];

    S.empty = old
      ? [
          ...old.emptyLakeSectors
        ]
      : [];

    S.revision =
      old?.revision || 0;

    S.dirty = Boolean(
      old &&
      old.sourceSignature !== hash
    );

    S.selected = 1;

    // Новий етап завжди відкривається
    // з повним оглядом водойми.
    S.zoom = 1;

    $("selectedStageTitle").textContent =
      `${S.year} · ${stage.title}`;

    $("mapEditor").hidden = false;

    render();

    selectSector(1);

    requestAnimationFrame(() => {
      resizeMap();
    });

    message(
      old &&
      old.sourceSignature !== hash
        ? "Результати архіву змінилися після збереження карти. Перевір відповідності та збережи карту ще раз."
        : old
          ? "Збережену карту завантажено."
          : "Нова карта. Прив’яжи турнірні позначення до секторів озера."
    );
  }

  // ==========================================================
  // RESULT TEXT
  // ==========================================================

  function resultText(row) {

    return row
      ? `${weight(row.totalWeight)} кг · ${number(row.totalCount) ?? "—"} риб`
      : "Немає запису в архіві";
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {

    const source =
      readRows(S.current.rows);

    const check =
      inspect(
        S.current.rows,
        S.assignments,
        S.empty
      );

    // ========================================================
    // MAP PINS
    // ========================================================

    $("mapPins").innerHTML =
      POINTS.map(
        ([n, x, y]) => {

          const a =
            S.assignments.find(
              item =>
                item.lakeSectorNumber === n
            );

          const empty =
            S.empty.includes(n);

          return `
            <button
              type="button"
              class="map-pin"
              data-lake="${n}"
              data-zone="${a?.zone || ""}"
              data-empty="${empty}"
              aria-pressed="${n === S.selected}"
              aria-label="Сектор озера ${n}${a ? `, ${esc(a.drawKey)}` : ", не задіяний"}${empty ? ", пустував" : ""}"
              style="left:${x}%;top:${y}%"
            >
              <span>${n}</span>
              <small>${a ? esc(a.drawKey) : "—"}${empty ? " ×" : ""}</small>
            </button>
          `;
        }
      ).join("");

    $("mapPins")
      .querySelectorAll(
        "[data-lake]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => selectSector(
            Number(
              button.dataset.lake
            )
          )
        );

      });

    // ========================================================
    // EMPTY SECTORS
    // ========================================================

    const ordered =
      S.assignments
        .slice()
        .sort(slotSort);

    $("emptySectors").innerHTML =
      ordered.length
        ? ordered.map(a => {

            const row =
              source.slots.get(
                a.drawKey
              )?.row;

            return `
              <label class="maps-check">
                <input
                  type="checkbox"
                  data-empty-sector="${a.lakeSectorNumber}"
                  ${S.empty.includes(a.lakeSectorNumber) ? "checked" : ""}
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
        : '<p class="maps-muted">Спочатку додай прив’язки секторів.</p>';

    $("emptySectors")
      .querySelectorAll(
        "[data-empty-sector]"
      )
      .forEach(input => {

        input.addEventListener(
          "change",
          () => {

            const n =
              Number(
                input.dataset.emptySector
              );

            const a =
              S.assignments.find(
                item =>
                  item.lakeSectorNumber === n
              );

            if (!a) return;

            if (
              input.checked &&
              hasCatch(
                source.slots.get(
                  a.drawKey
                )?.row
              )
            ) {

              input.checked = false;

              message(
                `${a.drawKey}: в архіві є улов. Перевір відповідність сектора; позначити неявку зараз не можна.`,
                "error"
              );

              return;
            }

            S.empty =
              input.checked
                ? [
                    ...new Set([
                      ...S.empty,
                      n
                    ])
                  ]
                : S.empty.filter(
                    value =>
                      value !== n
                  );

            changed();
          }
        );

      });

    // ========================================================
    // MAPPING TABLE
    // ========================================================

    $("mappingRows").innerHTML =
      ordered.map(a => {

        const row =
          source.slots.get(
            a.drawKey
          )?.row;

        return `
          <tr>
            <td>
              №${a.lakeSectorNumber}
            </td>

            <td>
              ${esc(a.drawKey)}
            </td>

            <td>
              ${esc(team(row))}
            </td>

            <td>
              ${esc(resultText(row))}
            </td>

            <td>
              ${S.empty.includes(a.lakeSectorNumber) ? "Пустував" : "Ловили"}
            </td>
          </tr>
        `;

      }).join("") ||
      '<tr><td colspan="5">Ще немає прив’язок.</td></tr>';

    // ========================================================
    // SUMMARY
    // ========================================================

    $("mapSummary").textContent =
      `У розстановці: ${check.selected} · ` +
      `Пустували: ${check.empty} · ` +
      `Ловили: ${check.included}`;

    $("mapCoverage").textContent =
      check.ready
        ? "Усі архівні сектори прив’язані. Карта готова для статистики."
        : [
            ...check.errors,
            ...check.incomplete
          ].join(" ") +
          " Можна зберегти незавершену карту як чернетку, якщо немає помилок.";

    $("saveState").textContent =
      S.dirty
        ? "Є незбережені зміни"
        : S.revision
          ? "Збережено"
          : "Ще не збережено";

    controls();
  }

  // ==========================================================
  // SELECT PHYSICAL SECTOR
  // ==========================================================

  function selectSector(n) {

    S.selected = n;

    $("lakeSector").value =
      String(n);

    const source =
      readRows(
        S.current.rows
      );

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
          .map(
            item => item.drawKey
          )
      );

    $("archiveSlot").innerHTML =
      '<option value="">Обери позначення</option>' +

      [
        ...source.slots.values()
      ]
        .sort(slotSort)
        .map(slot => `
          <option
            value="${slot.drawKey}"
            ${used.has(slot.drawKey) ? "disabled" : ""}
          >
            ${slot.drawKey} · ${esc(team(slot.row))}
            ${used.has(slot.drawKey) ? " · вже прив’язано" : ""}
          </option>
        `)
        .join("") +

      '<option value="manual">Номер, якого немає в архіві…</option>';

    $("archiveSlot").value =
      a
        ? source.slots.has(
            a.drawKey
          )
          ? a.drawKey
          : "manual"
        : "";

    $("manualZone").value =
      a?.zone || "A";

    $("manualNumber").value =
      a?.sector || 1;

    $("removeSlot").disabled =
      !a;

    $("mapPins")
      .querySelectorAll(
        "[data-lake]"
      )
      .forEach(button => {

        button.setAttribute(
          "aria-pressed",
          String(
            Number(
              button.dataset.lake
            ) === n
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

    $("manualSlot").hidden =
      $("archiveSlot").value !== "manual";

    const slot =
      chosenSlot();

    const row =
      slot
        ? readRows(
            S.current.rows
          ).slots.get(
            slot.drawKey
          )?.row
        : null;

    $("slotPreview").textContent =
      !slot
        ? "Обери позначення з архіву."
        : `Озеро №${S.selected} → ${slot.drawKey}\n` +
          (
            row
              ? `${team(row)}\n${resultText(row)}`
              : "Цього номера немає в архіві. Для порожнього сектора додай його та познач неявку."
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
  // ASSIGN SLOT
  // ==========================================================

  function assign() {

    const slot =
      chosenSlot();

    if (!slot) {

      message(
        "Обери сектор етапу або введи зону A/B/C та номер 1–99.",
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
        `${slot.drawKey} уже прив’язаний до озера №${collision.lakeSectorNumber}.`,
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
      previous?.drawKey !==
      slot.drawKey
    ) {

      S.empty =
        S.empty.filter(
          n =>
            n !== S.selected
        );
    }

    changed();

    message(
      `Озеро №${S.selected} прив’язано до ${slot.drawKey}. Збережи карту етапу.`
    );
  }

  // ==========================================================
  // SAVE
  // ==========================================================

  async function save() {

    requireAccess();

    const check =
      inspect(
        S.current.rows,
        S.assignments,
        S.empty
      );

    if (
      check.errors.length
    ) {

      throw new Error(
        check.errors.join("\n")
      );
    }

    const id =
      S.current.id;

    const year =
      S.year;

    const expectedRevision =
      S.revision;

    const assignments =
      S.assignments
        .map(a => ({

          lakeSectorId:
            `sector-${a.lakeSectorNumber}`,

          lakeSectorNumber:
            a.lakeSectorNumber,

          zone:
            a.zone,

          sector:
            a.sector,

          drawKey:
            a.drawKey

        }))
        .sort(
          (a, b) =>
            a.lakeSectorNumber -
            b.lakeSectorNumber
        );

    const empty =
      [
        ...new Set(
          S.empty
        )
      ].sort(
        (a, b) => a - b
      );

    message(
      "Зберігаю карту…"
    );

    await dbRequest(
      "Збереження",
      mapRef(year, id).path,

      () =>
        S.db.runTransaction(
          async tx => {

            const source =
              await dbRequest(
                "Читання результату перед збереженням",
                sourceRef(year, id).path,
                () =>
                  tx.get(
                    sourceRef(year, id)
                  )
              );

            const saved =
              await dbRequest(
                "Читання карти перед збереженням",
                mapRef(year, id).path,
                () =>
                  tx.get(
                    mapRef(year, id)
                  )
              );

            requireAccess();

            if (
              !source.exists ||
              await fingerprint(
                source.data().standings ??
                null
              ) !== S.sourceHash
            ) {

              throw new Error(
                "Архівний результат змінився. Перезавантаж етап " +
                "і перевір прив’язки перед збереженням."
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
                "Карту вже змінили в іншій вкладці. Перезавантаж етап; " +
                "твої зміни не перезаписали чужі."
              );
            }

            const stamp =
              window.firebase.firestore
                .FieldValue
                .serverTimestamp();

            tx.set(
              mapRef(year, id),
              {

                schemaVersion: 1,

                lakeId:
                  LAKE_ID,

                mapVersion: 1,

                seasonYear:
                  year,

                stageDocId:
                  id,

                sourcePath:
                  `seasonResults/${year}/stages/${id}`,

                sourceSignature:
                  S.sourceHash,

                stageTitle:
                  S.current.title,

                assignments,

                emptyLakeSectors:
                  empty,

                status:
                  check.ready
                    ? "ready"
                    : "draft",

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

              }
            );

          }
        )
    );

    S.revision =
      expectedRevision + 1;

    S.dirty = false;

    render();

    message(
      check.ready
        ? "Карту збережено. Вона готова для розрахунку статистики."
        : "Чернетку карти збережено. Заверши прив’язки, щоб включити етап у статистику.",
      "ok"
    );
  }

  // ==========================================================
  // RESPONSIVE MAP
  //
  // ГОЛОВНЕ ВИПРАВЛЕННЯ:
  //
  // 100% = ширина доступного контейнера.
  //
  // На телефоні карта більше НЕ має
  // примусової ширини 1120 px.
  //
  // На комп'ютері карта також вміщується
  // у своє вікно.
  //
  // При збільшенні можна прокручувати карту.
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

    if (
      !availableWidth
    ) {
      return;
    }

    S.zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        S.zoom
      )
    );

    const mapWidth =
      availableWidth * S.zoom;

    canvas.style.width =
      `${mapWidth}px`;

    canvas.style.height =
      "auto";

    canvas.style.aspectRatio =
      `${MAP_WIDTH} / ${MAP_HEIGHT}`;

    // При 100% вся карта відображається
    // без горизонтального прокручування.

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

    $("zoomValue").value =
      zoomText;

    $("zoomValue").textContent =
      zoomText;

    $("zoomOut").disabled =
      S.zoom <= MIN_ZOOM;

    $("zoomIn").disabled =
      S.zoom >= MAX_ZOOM;
  }

  // ==========================================================
  // RESET MAP
  // ==========================================================

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
  // TIMEOUT
  // ==========================================================

  function timed(
    promise,
    label
  ) {

    let timer;

    return Promise.race([

      promise,

      new Promise(
        (_, reject) => {

          timer = setTimeout(
            () =>
              reject(
                new Error(label)
              ),
            15000
          );

        }
      )

    ]).finally(
      () =>
        clearTimeout(timer)
    );
  }

  // ==========================================================
  // BOOT
  // ==========================================================

  async function boot() {

    try {

      if (window.scReady) {

        await timed(
          window.scReady,
          "Firebase не відповів. Онови сторінку."
        );
      }

      S.db =
        window.scDb;

      S.auth =
        window.scAuth;

      if (
        !S.db ||
        !S.auth
      ) {

        throw new Error(
          "Firebase не ініціалізований. Перевір assets/js/firebase-init.js."
        );
      }

      const user =
        await timed(
          new Promise(
            (resolve, reject) => {

              let unsubscribe = null;

              unsubscribe =
                S.auth.onAuthStateChanged(
                  value => {

                    if (unsubscribe) {
                      unsubscribe();
                    }

                    resolve(value);

                  },
                  reject
                );

            }
          ),

          "Не вдалося перевірити вхід. Онови сторінку."
        );

      if (!user) {

        throw new Error(
          "Спочатку увійди в адмінпанель, потім відкрий карти етапів."
        );
      }

      if (
        user.uid !== OWNER_UID
      ) {

        throw new Error(
          "Редагування карт доступне тільки власнику STOLAR CARP."
        );
      }

      const profile =
        await serverRead(
          S.db
            .collection("users")
            .doc(user.uid)
        );

      if (
        !profile.exists ||
        profile.data().role !== "admin"
      ) {

        throw new Error(
          "Акаунт не має ролі admin."
        );
      }

      S.user = user;

      S.allowed = true;

      $("mapApp").hidden = false;

      S.auth.onAuthStateChanged(
        value => {

          if (
            value?.uid !== OWNER_UID
          ) {

            S.allowed = false;

            $("mapApp").hidden = true;

            controls();

            message(
              "Сесію завершено. Увійди через адмінпанель та онови сторінку.",
              "error"
            );
          }
        }
      );

      $("mapYear").value =
        new URLSearchParams(
          location.search
        ).get("year") ||
        "2026";

      $("lakeSector").innerHTML =
        POINTS.map(
          ([n]) => `
            <option value="${n}">
              Сектор озера №${n}
            </option>
          `
        ).join("");

      await run(loadYear);

    } catch (error) {

      message(
        errorMessage(error),
        "error"
      );
    }
  }

  // ==========================================================
  // EVENTS • LOAD YEAR
  // ==========================================================

  $("loadYear").addEventListener(
    "click",
    () => {

      if (
        mayLeave()
      ) {

        run(loadYear);
      }
    }
  );

  // ==========================================================
  // EVENTS • STAGE
  // ==========================================================

  $("mapStage").addEventListener(
    "change",
    () => {

      const id =
        $("mapStage").value;

      const previous =
        S.current?.id || "";

      if (
        !id ||
        !mayLeave()
      ) {

        $("mapStage").value =
          previous;

        return;
      }

      run(async () => {

        try {

          await loadStage(id);

        } catch (error) {

          $("mapStage").value =
            previous;

          throw error;
        }
      });
    }
  );

  // ==========================================================
  // EVENTS • SELECT LAKE SECTOR
  // ==========================================================

  $("lakeSector").addEventListener(
    "change",
    () => {

      selectSector(
        Number(
          $("lakeSector").value
        )
      );
    }
  );

  // ==========================================================
  // EVENTS • SLOT PREVIEW
  // ==========================================================

  [
    "archiveSlot",
    "manualZone",
    "manualNumber"
  ].forEach(id => {

    $(id).addEventListener(
      "input",
      preview
    );

  });

  // ==========================================================
  // EVENTS • ASSIGN
  // ==========================================================

  $("assignSlot").addEventListener(
    "click",
    assign
  );

  // ==========================================================
  // EVENTS • REMOVE
  // ==========================================================

  $("removeSlot").addEventListener(
    "click",
    () => {

      S.assignments =
        S.assignments.filter(
          a =>
            a.lakeSectorNumber !==
            S.selected
        );

      S.empty =
        S.empty.filter(
          n =>
            n !== S.selected
        );

      changed();
    }
  );

  // ==========================================================
  // EVENTS • SAVE
  // ==========================================================

  $("saveMap").addEventListener(
    "click",
    () => run(save)
  );

  // ==========================================================
  // EVENTS • ZOOM IN
  // ==========================================================

  $("zoomIn").addEventListener(
    "click",
    () => {

      S.zoom = Math.min(
        MAX_ZOOM,
        S.zoom + ZOOM_STEP
      );

      resizeMap();
    }
  );

  // ==========================================================
  // EVENTS • ZOOM OUT
  // ==========================================================

  $("zoomOut").addEventListener(
    "click",
    () => {

      S.zoom = Math.max(
        MIN_ZOOM,
        S.zoom - ZOOM_STEP
      );

      resizeMap();
    }
  );

  // ==========================================================
  // EVENTS • RESET ZOOM
  // ==========================================================

  $("zoomReset").addEventListener(
    "click",
    resetMapZoom
  );

  // ==========================================================
  // IMAGE ERROR
  // ==========================================================

  $("lakeImage").addEventListener(
    "error",
    () => {

      $("imageError").hidden = false;
    }
  );

  // ==========================================================
  // WINDOW RESIZE
  // ==========================================================

  window.addEventListener(
    "resize",
    () => {

      requestAnimationFrame(
        resizeMap
      );
    }
  );

  // ==========================================================
  // UNSAVED CHANGES WARNING
  // ==========================================================

  window.addEventListener(
    "beforeunload",
    event => {

      if (S.dirty) {

        event.preventDefault();

        event.returnValue = "";
      }
    }
  );

  // ==========================================================
  // START
  // ==========================================================

  controls();

  boot();

})();
