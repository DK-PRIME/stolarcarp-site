// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
// PUBLIC • READ ONLY FIRESTORE
//
// ✅ без входу
// ✅ одна постійна сторінка
// ✅ mealPublic/current
// ✅ mealPublicOrders LIVE
//
// ✅ калькулятор Іри:
//    • ціна кожного прийому їжі
//    • додаткові послуги окремо по кожному учаснику
//    • автоматичний підсумок по кожному рядку
//    • загальний підсумок
//
// ✅ ціни та доппослуги НЕ пишуться у Firestore
// ✅ зберігаються тільки локально на телефоні Іри
// ✅ після закриття харчування очищаються

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917-calculator-v6"
  );

  const $ = id =>
    document.getElementById(id);

  const norm = value =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const clean = value =>
    norm(value).toLowerCase();

  const esc = value =>
    String(value ?? "")
      .replace(
        /[&<>"']/g,
        char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char])
      );

  let db = null;

  let competitionId = "";
  let stageId = "";
  let mealIsOpen = false;

  let orders = [];

  let unsubCurrent = null;
  let unsubOrders = null;

  let prices = {
    d1l: 0,
    d1d: 0,
    d1b: 0,

    d2l: 0,
    d2d: 0,
    d2b: 0
  };

  let extras = {};

  // =========================================================
  // NUMBERS
  // =========================================================

  function num(value) {
    const n =
      Number(value);

    return (
      Number.isFinite(n) &&
      n > 0
    )
      ? Math.floor(n)
      : 0;
  }

  function moneyNum(value) {
    const n =
      Number(
        String(
          value ?? ""
        )
          .replace(",", ".")
      );

    return (
      Number.isFinite(n) &&
      n > 0
    )
      ? n
      : 0;
  }

  function fmtMoney(value) {
    const n =
      moneyNum(value);

    if (!n) {
      return "0 ₴";
    }

    const rounded =
      Math.round(
        n * 100
      ) / 100;

    return (
      rounded.toLocaleString(
        "uk-UA",
        {
          maximumFractionDigits:
            2
        }
      ) +
      " ₴"
    );
  }

  function totalOrder(order) {
    return (
      num(order?.day1?.lunch) +
      num(order?.day1?.dinner) +
      num(order?.day1?.breakfast) +
      num(order?.day2?.lunch) +
      num(order?.day2?.dinner) +
      num(order?.day2?.breakfast)
    );
  }

  // =========================================================
  // IDENTITY
  // =========================================================

  function isJudges(row) {
    return (
      clean(row?.type) ===
        "judges" ||
      norm(row?.entityId) ===
        "__judges__"
    );
  }

  function isSolo(row) {
    return (
      clean(row?.entryType) ===
        "solo" ||
      clean(row?.type) ===
        "solo"
    );
  }

  function rowName(row) {
    if (isJudges(row)) {
      return "СУДДІ";
    }

    if (isSolo(row)) {
      return norm(
        row?.participantName ||
        row?.displayName ||
        row?.teamName ||
        "—"
      );
    }

    return norm(
      row?.teamName ||
      row?.displayName ||
      "—"
    );
  }

  function rowSector(row) {
    if (isJudges(row)) {
      return "—";
    }

    const direct =
      norm(
        row?.drawKey
      ).toUpperCase();

    if (direct) {
      return direct;
    }

    const zone =
      norm(
        row?.zone
      ).toUpperCase();

    const sector =
      norm(
        row?.sector
      );

    if (
      zone &&
      sector
    ) {
      return (
        zone +
        sector.replace(
          /^[ABC]/i,
          ""
        )
      );
    }

    return "—";
  }

  function rowKey(row) {
    return norm(
      row?.id ||
      row?.entityId ||
      row?.uid ||
      row?.teamId ||
      rowName(row)
    );
  }

  // =========================================================
  // LOCAL STORAGE
  // =========================================================

  function storageBase() {
    if (
      !competitionId ||
      !stageId
    ) {
      return "";
    }

    return (
      `sc_ira_meal_calc__` +
      `${competitionId}__` +
      `${stageId}`
    );
  }

  function pricesKey() {
    return (
      storageBase() +
      "__prices"
    );
  }

  function extrasKey() {
    return (
      storageBase() +
      "__extras"
    );
  }

  function loadCalculator() {
    prices = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0
    };

    extras = {};

    if (!storageBase()) {
      return;
    }

    try {
      const raw =
        localStorage.getItem(
          pricesKey()
        );

      if (raw) {
        prices = {
          ...prices,
          ...JSON.parse(raw)
        };
      }
    } catch {}

    try {
      const raw =
        localStorage.getItem(
          extrasKey()
        );

      if (raw) {
        extras =
          JSON.parse(raw) ||
          {};
      }
    } catch {}
  }

  function savePrices() {
    if (!storageBase()) {
      return;
    }

    try {
      localStorage.setItem(
        pricesKey(),
        JSON.stringify(
          prices
        )
      );
    } catch {}
  }

  function saveExtras() {
    if (!storageBase()) {
      return;
    }

    try {
      localStorage.setItem(
        extrasKey(),
        JSON.stringify(
          extras
        )
      );
    } catch {}
  }

  function clearCalculator() {
    if (!storageBase()) {
      return;
    }

    try {
      localStorage.removeItem(
        pricesKey()
      );

      localStorage.removeItem(
        extrasKey()
      );
    } catch {}

    prices = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0
    };

    extras = {};
  }

  // =========================================================
  // PRICE INPUTS
  // =========================================================

  function inputValue(value) {
    const n =
      moneyNum(value);

    return n
      ? String(n)
      : "";
  }

  function fillPriceInputs() {
    const map = {
      priceD1Lunch:
        "d1l",

      priceD1Dinner:
        "d1d",

      priceD1Breakfast:
        "d1b",

      priceD2Lunch:
        "d2l",

      priceD2Dinner:
        "d2d",

      priceD2Breakfast:
        "d2b"
    };

    Object.entries(
      map
    ).forEach(
      ([id, key]) => {
        const input =
          $(id);

        if (!input) {
          return;
        }

        input.value =
          inputValue(
            prices[key]
          );

        input.dataset.priceKey =
          key;
      }
    );
  }

  // =========================================================
  // MONEY CALCULATION
  // =========================================================

  function rowMealMoney(row) {
    const d1 =
      row.day1 || {};

    const d2 =
      row.day2 || {};

    return (
      num(d1.lunch) *
        moneyNum(prices.d1l)

      +

      num(d1.dinner) *
        moneyNum(prices.d1d)

      +

      num(d1.breakfast) *
        moneyNum(prices.d1b)

      +

      num(d2.lunch) *
        moneyNum(prices.d2l)

      +

      num(d2.dinner) *
        moneyNum(prices.d2d)

      +

      num(d2.breakfast) *
        moneyNum(prices.d2b)
    );
  }

  function rowExtraMoney(row) {
    return moneyNum(
      extras[
        rowKey(row)
      ]
    );
  }

  function rowTotalMoney(row) {
    return (
      rowMealMoney(row) +
      rowExtraMoney(row)
    );
  }

  function visibleRows() {
    return orders
      .filter(
        row =>
          row.status ===
            "submitted" &&
          totalOrder(row) > 0
      )
      .sort(
        sortOrders
      );
  }

  function recalcMoney() {
    const rows =
      visibleRows();

    let grandTotal =
      0;

    rows.forEach(
      row => {
        const key =
          rowKey(row);

        const total =
          rowTotalMoney(row);

        grandTotal +=
          total;

        const cell =
          document.querySelector(
            `[data-row-total="${CSS.escape(key)}"]`
          );

        if (cell) {
          cell.textContent =
            fmtMoney(total);
        }
      }
    );

    if ($("moneyTotal")) {
      $("moneyTotal")
        .textContent =
        fmtMoney(
          grandTotal
        );
    }
  }

  // =========================================================
  // STATE
  // =========================================================

  function setState(
    text,
    type = ""
  ) {
    const el =
      $("state");

    if (!el) {
      return;
    }

    el.textContent =
      text || "";

    el.className =
      `state ${type}`.trim();
  }

  function showContent() {
    if ($("content")) {
      $("content").hidden =
        false;
    }

    if ($("priceCard")) {
      $("priceCard").hidden =
        !mealIsOpen;
    }
  }

  function clearTable(
    message =
      "Заявок на харчування ще немає."
  ) {
    const tbody =
      $("mealBody");

    const tfoot =
      $("mealFoot");

    if ($("orderCount")) {
      $("orderCount")
        .textContent =
        "0";
    }

    if ($("moneyTotal")) {
      $("moneyTotal")
        .textContent =
        "0 ₴";
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr>

          <td
            colspan="10"
            class="empty"
          >
            ${esc(message)}
          </td>

        </tr>
      `;
    }

    if (tfoot) {
      tfoot.innerHTML =
        "";
    }
  }

  // =========================================================
  // SORT
  // =========================================================

  function sortOrders(
    a,
    b
  ) {
    if (
      isJudges(a) &&
      !isJudges(b)
    ) {
      return 1;
    }

    if (
      isJudges(b) &&
      !isJudges(a)
    ) {
      return -1;
    }

    const zones = {
      A: 1,
      B: 2,
      C: 3
    };

    const za =
      zones[
        norm(
          a.zone
        ).toUpperCase()
      ] || 9;

    const zb =
      zones[
        norm(
          b.zone
        ).toUpperCase()
      ] || 9;

    if (za !== zb) {
      return za - zb;
    }

    const sa =
      Number(
        a.sector ||
        999
      );

    const sb =
      Number(
        b.sector ||
        999
      );

    if (sa !== sb) {
      return sa - sb;
    }

    return rowName(a)
      .localeCompare(
        rowName(b),
        "uk"
      );
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render() {
    showContent();

    if (!mealIsOpen) {
      clearTable(
        "Харчування зараз не відкрите."
      );

      return;
    }

    const tbody =
      $("mealBody");

    const tfoot =
      $("mealFoot");

    if (
      !tbody ||
      !tfoot
    ) {
      return;
    }

    const rows =
      visibleRows();

    if ($("orderCount")) {
      $("orderCount")
        .textContent =
        String(
          rows.length
        );
    }

    if (!rows.length) {
      clearTable(
        "Заявок на харчування ще немає."
      );

      return;
    }

    const totals = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0,

      extra: 0,

      money: 0
    };

    tbody.innerHTML =
      rows.map(
        row => {
          const d1 =
            row.day1 || {};

          const d2 =
            row.day2 || {};

          const d1l =
            num(d1.lunch);

          const d1d =
            num(d1.dinner);

          const d1b =
            num(d1.breakfast);

          const d2l =
            num(d2.lunch);

          const d2d =
            num(d2.dinner);

          const d2b =
            num(d2.breakfast);

          totals.d1l += d1l;
          totals.d1d += d1d;
          totals.d1b += d1b;

          totals.d2l += d2l;
          totals.d2d += d2d;
          totals.d2b += d2b;

          const key =
            rowKey(row);

          const extra =
            rowExtraMoney(row);

          const money =
            rowTotalMoney(row);

          totals.extra +=
            extra;

          totals.money +=
            money;

          const note =
            norm(
              row.note
            );

          const name =
            rowName(row);

          const sector =
            rowSector(row);

          return `
            <tr>

              <td class="sector">
                ${esc(sector)}
              </td>

              <td class="team">

                <div class="team-name">

                  ${
                    isJudges(row)
                      ? "👨‍⚖️ СУДДІ"
                      : esc(name)
                  }

                </div>

                ${
                  isSolo(row)
                    ? `
                      <div
                        style="
                          margin-top:2px;
                          color:#94a3b8;
                          font-size:.55rem;
                          font-weight:700;
                        "
                      >
                        SOLO
                      </div>
                    `
                    : ""
                }

                ${
                  note
                    ? `
                      <div class="note">
                        ⚠ ${esc(note)}
                      </div>
                    `
                    : ""
                }

              </td>

              <td>${d1l || ""}</td>
              <td>${d1d || ""}</td>
              <td>${d1b || ""}</td>

              <td>${d2l || ""}</td>
              <td>${d2d || ""}</td>
              <td>${d2b || ""}</td>

              <td>

                <input
                  class="ira-extra-input"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="1"
                  placeholder="0"
                  data-extra-key="${esc(key)}"
                  value="${esc(
                    inputValue(
                      extra
                    )
                  )}"
                >

              </td>

              <td
                class="row-money"
                data-row-total="${esc(key)}"
              >
                ${esc(
                  fmtMoney(
                    money
                  )
                )}
              </td>

            </tr>
          `;
        }
      ).join("");

    tfoot.innerHTML = `
      <tr>

        <td colspan="2">
          Разом
        </td>

        <td>
          ${totals.d1l}
        </td>

        <td>
          ${totals.d1d}
        </td>

        <td>
          ${totals.d1b}
        </td>

        <td>
          ${totals.d2l}
        </td>

        <td>
          ${totals.d2d}
        </td>

        <td>
          ${totals.d2b}
        </td>

        <td>
          ${totals.extra
            ? fmtMoney(
                totals.extra
              )
            : ""}
        </td>

        <td>
          ${fmtMoney(
            totals.money
          )}
        </td>

      </tr>
    `;

    if ($("moneyTotal")) {
      $("moneyTotal")
        .textContent =
        fmtMoney(
          totals.money
        );
    }
  }

  // =========================================================
  // TITLE
  // =========================================================

  async function loadTitle() {
    if (
      !competitionId ||
      !stageId
    ) {
      return;
    }

    try {
      const snap =
        await db
          .collection(
            "competitions"
          )
          .doc(
            competitionId
          )
          .get();

      const competition =
        snap.exists
          ? (
              snap.data() ||
              {}
            )
          : {};

      const title =
        norm(
          competition.name ||
          competition.title ||
          competitionId
        );

      const events =
        Array.isArray(
          competition.events
        )
          ? competition.events
          : [];

      const event =
        events.find(
          (item, index) =>
            norm(
              item?.key ||
              item?.stageId ||
              item?.id ||
              `stage-${index + 1}`
            ) ===
            stageId
        );

      let stageTitle =
        norm(
          event?.title ||
          event?.name ||
          event?.label ||
          ""
        );

      if (
        !stageTitle &&
        stageId === "main"
      ) {
        stageTitle =
          "Основне змагання";
      }

      if (!stageTitle) {
        stageTitle =
          stageId;
      }

      if ($("competitionTitle")) {
        $("competitionTitle")
          .textContent =
          title;
      }

      if ($("stageTitle")) {
        $("stageTitle")
          .textContent =
          stageTitle;
      }

    } catch (error) {
      console.warn(
        "[meal_ira] title:",
        error
      );
    }
  }

  // =========================================================
  // ORDERS LIVE
  // =========================================================

  function stopOrdersRealtime() {
    try {
      unsubOrders?.();
    } catch {}

    unsubOrders =
      null;

    orders = [];
  }

  function startOrdersRealtime() {
    stopOrdersRealtime();

    if (
      !competitionId ||
      !stageId ||
      !mealIsOpen
    ) {
      render();

      return;
    }

    unsubOrders =
      db
        .collection(
          "mealPublicOrders"
        )
        .where(
          "competitionId",
          "==",
          competitionId
        )
        .where(
          "stageId",
          "==",
          stageId
        )
        .onSnapshot(
          snap => {
            orders =
              snap.docs.map(
                doc => ({
                  id:
                    doc.id,

                  ...(
                    doc.data() ||
                    {}
                  )
                })
              );

            render();

            setState(
              "Оновлюється автоматично",
              "ok"
            );
          },
          error => {
            console.error(
              "[meal_ira] orders:",
              error
            );

            setState(
              "Не вдалося завантажити харчування.",
              "err"
            );
          }
        );
  }

  // =========================================================
  // CURRENT MEAL
  // =========================================================

  function startCurrentMealRealtime() {
    unsubCurrent =
      db
        .collection(
          "mealPublic"
        )
        .doc(
          "current"
        )
        .onSnapshot(
          async snap => {
            const data =
              snap.exists
                ? (
                    snap.data() ||
                    {}
                  )
                : {};

            const nextCompetitionId =
              norm(
                data.competitionId
              );

            const nextStageId =
              norm(
                data.stageId
              );

            const nextOpen =
              data.isOpen ===
              true;

            const changed =
              nextCompetitionId !==
                competitionId ||
              nextStageId !==
                stageId;

            competitionId =
              nextCompetitionId;

            stageId =
              nextStageId;

            mealIsOpen =
              nextOpen;

            /*
             * Нема активного харчування.
             */
            if (
              !competitionId ||
              !stageId
            ) {
              stopOrdersRealtime();

              if ($("priceCard")) {
                $("priceCard").hidden =
                  true;
              }

              setState(
                "Харчування зараз не відкрите.",
                ""
              );

              clearTable(
                "Харчування зараз не відкрите."
              );

              return;
            }

            /*
             * Нове змагання / етап.
             */
            if (changed) {
              loadCalculator();

              fillPriceInputs();

              await loadTitle();
            }

            /*
             * Харчування закрите.
             *
             * Очищаємо локальний
             * калькулятор Іри.
             */
            if (!mealIsOpen) {
              stopOrdersRealtime();

              clearCalculator();

              fillPriceInputs();

              if ($("priceCard")) {
                $("priceCard").hidden =
                  true;
              }

              setState(
                "Харчування завершено.",
                ""
              );

              clearTable(
                "Харчування зараз не відкрите."
              );

              return;
            }

            if ($("priceCard")) {
              $("priceCard").hidden =
                false;
            }

            setState(
              "Харчування відкрите · LIVE",
              "ok"
            );

            startOrdersRealtime();
          },
          error => {
            console.error(
              "[meal_ira] current:",
              error
            );

            setState(
              "Не вдалося визначити активне харчування.",
              "err"
            );
          }
        );
  }

  // =========================================================
  // INPUT EVENTS
  // =========================================================

  document.addEventListener(
    "input",
    event => {
      const target =
        event.target;

      /*
       * Ціна прийому їжі.
       */
      if (
        target.classList
          .contains(
            "ira-price-input"
          )
      ) {
        const key =
          target.dataset
            .priceKey;

        if (!key) {
          return;
        }

        prices[key] =
          moneyNum(
            target.value
          );

        savePrices();

        recalcMoney();

        return;
      }

      /*
       * Додаткова послуга
       * конкретного рядка.
       */
      if (
        target.classList
          .contains(
            "ira-extra-input"
          )
      ) {
        const key =
          target.dataset
            .extraKey;

        if (!key) {
          return;
        }

        extras[key] =
          moneyNum(
            target.value
          );

        saveExtras();

        recalcMoney();
      }
    }
  );

  // =========================================================
  // BOOT
  // =========================================================

  async function boot() {
    try {
      if (window.scReady) {
        await window.scReady;
      }

      db =
        window.scDb;

      if (!db) {
        throw new Error(
          "Firebase не готовий"
        );
      }

      if ($("content")) {
        $("content").hidden =
          false;
      }

      if ($("priceCard")) {
        $("priceCard").hidden =
          true;
      }

      clearTable(
        "Перевіряю активне харчування…"
      );

      setState(
        "Завантаження…",
        ""
      );

      startCurrentMealRealtime();

    } catch (error) {
      console.error(
        "[meal_ira] boot:",
        error
      );

      setState(
        "Помилка: " +
        (
          error?.message ||
          error
        ),
        "err"
      );
    }
  }

  // =========================================================
  // CLEANUP
  // =========================================================

  window.addEventListener(
    "beforeunload",
    () => {
      stopOrdersRealtime();

      try {
        unsubCurrent?.();
      } catch {}
    }
  );

  boot();

})();
