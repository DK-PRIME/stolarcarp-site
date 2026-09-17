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
// ✅ mealPublicOrderEvents:
//    • історія повідомлень #1 / #2 / #3...
//    • повідомлення прив'язане до конкретного рядка
//    • нове повідомлення підсвічує рядок
//    • видно кількість НОВИХ
//    • після відкриття повідомлення стають прочитаними
//    • прочитане зберігається локально на телефоні Іри
//    • звіт по конкретній команді / учаснику
//
// ✅ ціни / доппослуги / прочитане:
//    НЕ пишуться у Firestore
// ✅ зберігаються локально на телефоні Іри
// ✅ після закриття харчування очищаються

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260917-messages-v8"
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

  // =========================================================
  // STATE
  // =========================================================

  let db = null;

  let competitionId = "";
  let stageId = "";
  let mealIsOpen = false;

  let orders = [];
  let messageEvents = [];

  let unsubCurrent = null;
  let unsubOrders = null;
  let unsubEvents = null;

  let prices = {
    d1l: 0,
    d1d: 0,
    d1b: 0,

    d2l: 0,
    d2d: 0,
    d2b: 0
  };

  let extras = {};

  /*
   * IDs повідомлень,
   * які Іра вже відкривала.
   */
  let readMessageIds =
    new Set();

  /*
   * Який рядок зараз
   * відкритий у модальному вікні.
   */
  let activeMessageRowKey = "";

  /*
   * Повідомлення, які були НОВИМИ
   * саме в момент відкриття.
   *
   * Вони вже записуються як прочитані,
   * але поки модалка відкрита,
   * Іра бачить позначку НОВЕ.
   */
  let activeFreshMessageIds =
    new Set();

  let reportMode =
    false;

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
      row?.entityId ||
      row?.uid ||
      row?.teamId ||
      row?.id ||
      rowName(row)
    );
  }

  function findRowByKey(key) {
    return orders.find(
      row =>
        rowKey(row) ===
        key
    ) || null;
  }

  // =========================================================
  // EVENT IDENTITY
  // =========================================================

  function eventText(event) {
    return norm(
      event?.message ||
      event?.text ||
      event?.note ||
      event?.details ||
      event?.orderText ||
      ""
    );
  }

  function eventBelongsToRow(
    event,
    row
  ) {
    if (
      !event ||
      !row ||
      isJudges(row)
    ) {
      return false;
    }

    /*
     * Якщо подія знає ID
     * документа замовлення.
     */
    const eventOrderId =
      norm(
        event.orderId
      );

    if (
      eventOrderId &&
      eventOrderId ===
        norm(row.id)
    ) {
      return true;
    }

    /*
     * canonical entityId
     */
    const eventEntityId =
      norm(
        event.entityId
      );

    const rowEntityId =
      norm(
        row.entityId
      );

    if (
      eventEntityId &&
      rowEntityId &&
      eventEntityId ===
        rowEntityId
    ) {
      return true;
    }

    /*
     * SOLO — головний ключ UID.
     */
    const eventUid =
      norm(
        event.uid ||
        event.participantUid ||
        event.userId
      );

    const rowUid =
      norm(
        row.uid ||
        row.participantUid ||
        row.userId
      );

    if (
      eventUid &&
      rowUid &&
      eventUid === rowUid
    ) {
      return true;
    }

    /*
     * TEAM — teamId.
     */
    const eventTeamId =
      norm(
        event.teamId
      );

    const rowTeamId =
      norm(
        row.teamId
      );

    if (
      eventTeamId &&
      rowTeamId &&
      eventTeamId ===
        rowTeamId
    ) {
      return true;
    }

    return false;
  }

  function eventsForRow(row) {
    return messageEvents
      .filter(
        event =>
          eventBelongsToRow(
            event,
            row
          )
      )
      .filter(
        event =>
          eventText(event)
      );
  }

  // =========================================================
  // EVENT TIME
  // =========================================================

  function timestampMillis(value) {
    if (!value) {
      return 0;
    }

    try {
      if (
        typeof value.toMillis ===
        "function"
      ) {
        return value.toMillis();
      }
    } catch {}

    try {
      if (
        typeof value.toDate ===
        "function"
      ) {
        return value
          .toDate()
          .getTime();
      }
    } catch {}

    if (
      typeof value.seconds ===
      "number"
    ) {
      return (
        value.seconds *
        1000
      );
    }

    if (
      typeof value ===
      "number"
    ) {
      return value;
    }

    const parsed =
      Date.parse(
        String(value)
      );

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  function eventMillis(event) {
    return (
      timestampMillis(
        event?.createdAt
      ) ||
      timestampMillis(
        event?.submittedAt
      ) ||
      timestampMillis(
        event?.clientCreatedAt
      ) ||
      timestampMillis(
        event?.createdAtISO
      ) ||
      timestampMillis(
        event?.updatedAt
      )
    );
  }

  function sortEventsOldFirst(
    a,
    b
  ) {
    const ta =
      eventMillis(a);

    const tb =
      eventMillis(b);

    if (ta !== tb) {
      return ta - tb;
    }

    return norm(a.id)
      .localeCompare(
        norm(b.id)
      );
  }

  function sortEventsNewFirst(
    a,
    b
  ) {
    return (
      sortEventsOldFirst(
        b,
        a
      )
    );
  }

  function eventNumber(
    event,
    allEvents
  ) {
    const explicit =
      Number(
        event?.sequence ||
        event?.eventNo ||
        event?.messageNo ||
        event?.number ||
        0
      );

    if (
      Number.isFinite(explicit) &&
      explicit > 0
    ) {
      return Math.floor(
        explicit
      );
    }

    const sorted =
      [...allEvents]
        .sort(
          sortEventsOldFirst
        );

    const index =
      sorted.findIndex(
        item =>
          item.id ===
          event.id
      );

    return (
      index >= 0
        ? index + 1
        : 1
    );
  }

  function fmtEventTime(event) {
    const ms =
      eventMillis(event);

    if (!ms) {
      return "час не вказано";
    }

    try {
      return new Intl
        .DateTimeFormat(
          "uk-UA",
          {
            weekday:
              "short",

            day:
              "2-digit",

            month:
              "2-digit",

            hour:
              "2-digit",

            minute:
              "2-digit"
          }
        )
        .format(
          new Date(ms)
        )
        .replace(
          ",",
          " ·"
        );
    } catch {
      return new Date(ms)
        .toLocaleString(
          "uk-UA"
        );
    }
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

  function readsKey() {
    return (
      storageBase() +
      "__message_reads"
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

    readMessageIds =
      new Set();

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

    try {
      const raw =
        localStorage.getItem(
          readsKey()
        );

      if (raw) {
        const list =
          JSON.parse(raw);

        if (
          Array.isArray(list)
        ) {
          readMessageIds =
            new Set(
              list.map(
                value =>
                  String(value)
              )
            );
        }
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

  function saveReadMessages() {
    if (!storageBase()) {
      return;
    }

    try {
      localStorage.setItem(
        readsKey(),
        JSON.stringify(
          [...readMessageIds]
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

      localStorage.removeItem(
        readsKey()
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

    readMessageIds =
      new Set();

    activeMessageRowKey =
      "";

    activeFreshMessageIds =
      new Set();

    reportMode =
      false;
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

  // =========================================================
  // MESSAGE READ STATE
  // =========================================================

  function isMessageRead(event) {
    return readMessageIds
      .has(
        String(event.id)
      );
  }

  function unreadEventsForRow(row) {
    return eventsForRow(row)
      .filter(
        event =>
          !isMessageRead(event)
      );
  }

  function markEventsRead(events) {
    let changed =
      false;

    events.forEach(
      event => {
        const id =
          String(
            event.id ||
            ""
          );

        if (
          id &&
          !readMessageIds.has(id)
        ) {
          readMessageIds.add(
            id
          );

          changed =
            true;
        }
      }
    );

    if (changed) {
      saveReadMessages();
    }
  }

  // =========================================================
  // VISIBLE ROWS
  // =========================================================

  function visibleRows() {
    return orders
      .filter(
        row => {
          if (
            row.status !==
            "submitted"
          ) {
            return false;
          }

          if (
            totalOrder(row) >
            0
          ) {
            return true;
          }

          if (
            norm(row.note)
          ) {
            return true;
          }

          return (
            eventsForRow(row)
              .length > 0
          );
        }
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

        const safeKey =
          window.CSS &&
          typeof CSS.escape ===
            "function"
            ? CSS.escape(key)
            : key.replace(
                /"/g,
                '\\"'
              );

        const cell =
          document.querySelector(
            `[data-row-total="${safeKey}"]`
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
  // UI STATE
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
  // MESSAGE BUTTON HTML
  // =========================================================

  function messageButtonHTML(row) {
    if (isJudges(row)) {
      return "";
    }

    const all =
      eventsForRow(row);

    if (!all.length) {
      return "";
    }

    const unread =
      all.filter(
        event =>
          !isMessageRead(event)
      );

    const key =
      rowKey(row);

    if (unread.length) {
      return `
        <button
          type="button"
          class="team-messages-btn has-unread"
          data-message-row="${esc(key)}"
        >
          🔔 ${unread.length}
          ${
            unread.length === 1
              ? "НОВЕ"
              : "НОВИХ"
          }

          <span class="team-messages-badge">
            ${unread.length}
          </span>
        </button>

        <div class="team-message-total">
          всього: ${all.length}
        </div>
      `;
    }

    return `
      <button
        type="button"
        class="team-messages-btn"
        data-message-row="${esc(key)}"
      >
        🔔 ${all.length}
        ${
          all.length === 1
            ? "повідомлення"
            : "повідомл."
        }
      </button>
    `;
  }

  function latestUnreadPreviewHTML(
    row
  ) {
    const unread =
      unreadEventsForRow(row)
        .sort(
          sortEventsNewFirst
        );

    if (!unread.length) {
      return "";
    }

    const latest =
      unread[0];

    const text =
      eventText(latest);

    if (!text) {
      return "";
    }

    return `
      <div class="note">
        🔔 ${esc(text)}
      </div>
    `;
  }

  // =========================================================
  // RENDER TABLE
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

          const rowEvents =
            eventsForRow(row);

          const unread =
            unreadEventsForRow(row);

          const hasUnread =
            unread.length > 0;

          /*
           * Якщо вже є нова система
           * повідомлень, старий note
           * вдруге не дублюємо.
           *
           * Поки events ще немає,
           * legacy note продовжує
           * показуватися як раніше.
           */
          const legacyNoteHTML =
            (
              note &&
              !rowEvents.length
            )
              ? `
                <div class="note">
                  ⚠ ${esc(note)}
                </div>
              `
              : "";

          return `
            <tr
              class="${
                hasUnread
                  ? "meal-row-unread"
                  : ""
              }"
            >

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
                      <div class="solo-label">
                        SOLO
                      </div>
                    `
                    : ""
                }

                ${legacyNoteHTML}

                ${
                  latestUnreadPreviewHTML(
                    row
                  )
                }

                ${
                  messageButtonHTML(
                    row
                  )
                }

              </td>

              <td>
                ${d1l || ""}
              </td>

              <td>
                ${d1d || ""}
              </td>

              <td>
                ${d1b || ""}
              </td>

              <td>
                ${d2l || ""}
              </td>

              <td>
                ${d2d || ""}
              </td>

              <td>
                ${d2b || ""}
              </td>

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
      )
      .join("");

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
          ${
            totals.extra
              ? fmtMoney(
                  totals.extra
                )
              : ""
          }
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
  // MESSAGE MODAL
  // =========================================================

  function modalIsOpen() {
    return Boolean(
      $("messagesModal")
        ?.classList
        .contains(
          "open"
        )
    );
  }

  function closeMessagesModal() {
    $("messagesModal")
      ?.classList
      .remove(
        "open"
      );

    activeMessageRowKey =
      "";

    activeFreshMessageIds =
      new Set();

    reportMode =
      false;

    if (
      $("messagesReportBtn")
    ) {
      $("messagesReportBtn")
        .textContent =
        "📋 Звіт";
    }
  }

  function renderNormalMessages(
    row,
    allEvents
  ) {
    const list =
      $("messageList");

    if (!list) {
      return;
    }

    if (!allEvents.length) {
      list.innerHTML = `
        <div class="message-empty">
          Повідомлень ще немає.
        </div>
      `;

      return;
    }

    const oldFirst =
      [...allEvents]
        .sort(
          sortEventsOldFirst
        );

    const newestFirst =
      [...allEvents]
        .sort(
          sortEventsNewFirst
        );

    list.innerHTML =
      newestFirst
        .map(
          event => {
            const number =
              eventNumber(
                event,
                oldFirst
              );

            const fresh =
              activeFreshMessageIds
                .has(
                  String(
                    event.id
                  )
                );

            return `
              <div
                class="message-item ${
                  fresh
                    ? "unread"
                    : ""
                }"
              >

                <div class="message-top">

                  <div>

                    <span class="message-number">
                      #${number}
                    </span>

                    ${
                      fresh
                        ? `
                          <span class="message-new">
                            НОВЕ
                          </span>
                        `
                        : ""
                    }

                  </div>

                  <div class="message-time">
                    ${esc(
                      fmtEventTime(
                        event
                      )
                    )}
                  </div>

                </div>

                <div class="message-text">
                  ${esc(
                    eventText(
                      event
                    )
                  )}
                </div>

              </div>
            `;
          }
        )
        .join("");
  }

  function renderReport(
    row,
    allEvents
  ) {
    const list =
      $("messageList");

    if (!list) {
      return;
    }

    if (!allEvents.length) {
      list.innerHTML = `
        <div class="message-empty">
          Немає даних для звіту.
        </div>
      `;

      return;
    }

    const sorted =
      [...allEvents]
        .sort(
          sortEventsOldFirst
        );

    const lines =
      sorted.map(
        event => {
          const number =
            eventNumber(
              event,
              sorted
            );

          return `
            <div class="message-item">

              <div class="message-top">

                <div class="message-number">
                  #${number}
                </div>

                <div class="message-time">
                  ${esc(
                    fmtEventTime(
                      event
                    )
                  )}
                </div>

              </div>

              <div class="message-text">
                ${esc(
                  eventText(
                    event
                  )
                )}
              </div>

            </div>
          `;
        }
      )
      .join("");

    list.innerHTML = `
      <div
        class="message-item"
        style="margin-bottom:10px;"
      >

        <div class="message-owner">
          📋 ЗВІТ
        </div>

        <div
          class="message-text"
          style="margin-top:4px;"
        >
          ${esc(
            rowSector(row)
          )}
          ·
          ${esc(
            rowName(row)
          )}
        </div>

        <div class="message-time">
          Повідомлень:
          ${sorted.length}
        </div>

      </div>

      ${lines}
    `;
  }

  function renderMessagesModal() {
    if (
      !activeMessageRowKey
    ) {
      return;
    }

    const row =
      findRowByKey(
        activeMessageRowKey
      );

    if (!row) {
      closeMessagesModal();

      return;
    }

    const allEvents =
      eventsForRow(row);

    if ($("messagesOwner")) {
      $("messagesOwner")
        .textContent =
        rowName(row);
    }

    if ($("messagesSector")) {
      const sector =
        rowSector(row);

      $("messagesSector")
        .textContent =
        sector !== "—"
          ? `Сектор ${sector}`
          : "";
    }

    if ($("messagesSummary")) {
      const newCount =
        activeFreshMessageIds
          .size;

      $("messagesSummary")
        .textContent =
        newCount
          ? (
              `Нових: ${newCount} · ` +
              `всього: ${allEvents.length}`
            )
          : (
              `Всього повідомлень: ` +
              `${allEvents.length}`
            );
    }

    const reportBtn =
      $("messagesReportBtn");

    if (reportBtn) {
      reportBtn.textContent =
        reportMode
          ? "↩ Історія"
          : "📋 Звіт";
    }

    if (reportMode) {
      renderReport(
        row,
        allEvents
      );
    } else {
      renderNormalMessages(
        row,
        allEvents
      );
    }
  }

  function openMessagesForRowKey(
    key
  ) {
    const row =
      findRowByKey(key);

    if (!row) {
      return;
    }

    const allEvents =
      eventsForRow(row);

    /*
     * Запам'ятовуємо, які саме
     * були НОВИМИ в момент відкриття.
     */
    activeFreshMessageIds =
      new Set(
        allEvents
          .filter(
            event =>
              !isMessageRead(event)
          )
          .map(
            event =>
              String(event.id)
          )
      );

    activeMessageRowKey =
      key;

    reportMode =
      false;

    /*
     * Відкрила = прочитала.
     */
    markEventsRead(
      allEvents
    );

    /*
     * Прибираємо зелену підсвітку
     * з основної таблиці.
     */
    render();

    $("messagesModal")
      ?.classList
      .add(
        "open"
      );

    renderMessagesModal();
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

            if (
              modalIsOpen()
            ) {
              renderMessagesModal();
            }

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
  // MESSAGE EVENTS LIVE
  // =========================================================

  function stopEventsRealtime() {
    try {
      unsubEvents?.();
    } catch {}

    unsubEvents =
      null;

    messageEvents = [];
  }

  function syncOpenModalReadState() {
    if (
      !modalIsOpen() ||
      !activeMessageRowKey
    ) {
      return;
    }

    const row =
      findRowByKey(
        activeMessageRowKey
      );

    if (!row) {
      return;
    }

    const allEvents =
      eventsForRow(row);

    const newWhileOpen =
      allEvents.filter(
        event =>
          !isMessageRead(event)
      );

    /*
     * Якщо повідомлення прийшло,
     * поки Іра вже дивиться це вікно,
     * вважаємо його побаченим.
     */
    newWhileOpen.forEach(
      event => {
        activeFreshMessageIds
          .add(
            String(event.id)
          );
      }
    );

    markEventsRead(
      newWhileOpen
    );
  }

  function startEventsRealtime() {
    stopEventsRealtime();

    if (
      !competitionId ||
      !stageId ||
      !mealIsOpen
    ) {
      return;
    }

    unsubEvents =
      db
        .collection(
          "mealPublicOrderEvents"
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
            messageEvents =
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

            syncOpenModalReadState();

            render();

            if (
              modalIsOpen()
            ) {
              renderMessagesModal();
            }
          },
          error => {
            /*
             * Поки Rules / writer ще
             * не підключені, основна
             * сторінка харчування
             * продовжує працювати.
             */
            console.warn(
              "[meal_ira] message events:",
              error
            );

            messageEvents = [];

            render();
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

            /*
             * Якщо переходимо
             * на інше змагання,
             * спочатку зупиняємо
             * старі LIVE listeners.
             */
            if (changed) {
              stopOrdersRealtime();
              stopEventsRealtime();

              closeMessagesModal();
            }

            competitionId =
              nextCompetitionId;

            stageId =
              nextStageId;

            mealIsOpen =
              nextOpen;

            // ---------------------------------------------
            // НЕМА АКТИВНОГО ХАРЧУВАННЯ
            // ---------------------------------------------

            if (
              !competitionId ||
              !stageId
            ) {
              stopOrdersRealtime();
              stopEventsRealtime();

              closeMessagesModal();

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

            // ---------------------------------------------
            // НОВЕ ЗМАГАННЯ / ЕТАП
            // ---------------------------------------------

            if (changed) {
              loadCalculator();

              fillPriceInputs();

              await loadTitle();
            }

            // ---------------------------------------------
            // ХАРЧУВАННЯ ЗАКРИТЕ
            // ---------------------------------------------

            if (!mealIsOpen) {
              stopOrdersRealtime();
              stopEventsRealtime();

              closeMessagesModal();

              /*
               * Ціни, доплати,
               * прочитані повідомлення
               * цього харчування
               * очищаються.
               */
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

            // ---------------------------------------------
            // ХАРЧУВАННЯ ВІДКРИТЕ
            // ---------------------------------------------

            if ($("priceCard")) {
              $("priceCard").hidden =
                false;
            }

            setState(
              "Харчування відкрите · LIVE",
              "ok"
            );

            startOrdersRealtime();

            startEventsRealtime();
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

      if (
        !target ||
        !target.classList
      ) {
        return;
      }

      // ---------------------------------------------
      // PRICE
      // ---------------------------------------------

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

      // ---------------------------------------------
      // EXTRA
      // ---------------------------------------------

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
  // CLICK EVENTS
  // =========================================================

  document.addEventListener(
    "click",
    event => {
      const target =
        event.target;

      if (!target) {
        return;
      }

      // ---------------------------------------------
      // BUTTON IN TEAM ROW
      // ---------------------------------------------

      const messageButton =
        target.closest
          ? target.closest(
              ".team-messages-btn"
            )
          : null;

      if (messageButton) {
        const key =
          norm(
            messageButton.dataset
              .messageRow
          );

        if (key) {
          openMessagesForRowKey(
            key
          );
        }

        return;
      }

      // ---------------------------------------------
      // CLOSE
      // ---------------------------------------------

      if (
        target.id ===
        "messagesClose"
      ) {
        closeMessagesModal();

        return;
      }

      // ---------------------------------------------
      // REPORT
      // ---------------------------------------------

      if (
        target.id ===
        "messagesReportBtn"
      ) {
        reportMode =
          !reportMode;

        renderMessagesModal();

        return;
      }

      // ---------------------------------------------
      // CLICK OUTSIDE MODAL
      // ---------------------------------------------

      if (
        target.id ===
        "messagesModal"
      ) {
        closeMessagesModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        closeMessagesModal();
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

      stopEventsRealtime();

      try {
        unsubCurrent?.();
      } catch {}
    }
  );

  boot();

})();
