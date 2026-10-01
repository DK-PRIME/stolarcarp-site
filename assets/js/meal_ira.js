// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
//
// PUBLIC • БЕЗ ВХОДУ
//
// ✅ mealPublic/current
// ✅ mealPublicOrders LIVE
// ✅ mealPublicOrderEvents LIVE
//
// ✅ таблиця компактна
// ✅ повідомлення ✉️ / 📋
// ✅ звіт з коригуваннями + / -
// ✅ калькулятор харчування
// ✅ prices / read / report costs -> localStorage
//
// ✅ МЕНЮ ІРИ:
//    • Доба 1: Обід -> Вечеря -> Сніданок
//    • Доба 2: Обід -> Вечеря -> Сніданок
//    • кожен прийом:
//         1. Страва
//         2. Страва
//         3. Страва
//         4. Страва
//         5. Напій
//    • поки меню зберігається localStorage на телефоні Іри
//
// ВАЖЛИВО:
// Кожне нове повідомлення учасника має створювати
// окремий документ у mealPublicOrderEvents.

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20261001-menu-v12"
  );

  // =========================================================
  // HELPERS
  // =========================================================

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

  /*
   * eventId -> сума коригування
   *
   * Може бути:
   * +200
   * -180
   */
  let reportCosts = {};

  let readMessageIds =
    new Set();

  let activeMessageRowKey =
    "";

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
        ).replace(",", ".")
      );

    return (
      Number.isFinite(n) &&
      n > 0
    )
      ? n
      : 0;
  }

  function signedMoneyNum(value) {
    const n =
      Number(
        String(
          value ?? ""
        ).replace(",", ".")
      );

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function fmtMoney(value) {
    const n =
      signedMoneyNum(value);

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
          maximumFractionDigits: 2
        }
      ) +
      " ₴"
    );
  }

  function inputValue(value) {
    const n =
      moneyNum(value);

    return n
      ? String(n)
      : "";
  }

  function signedInputValue(value) {
    const n =
      signedMoneyNum(value);

    return n !== 0
      ? String(n)
      : "";
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
  // TIMESTAMP
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
      return value.seconds * 1000;
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

  // =========================================================
  // ROW IDENTITY
  // =========================================================

  function isJudges(row) {
    return (
      clean(row?.type) ===
        "judges" ||

      clean(row?.entryType) ===
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
    if (
      isJudges(row)
    ) {
      return "СУДДІ";
    }

    if (
      isSolo(row)
    ) {
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
    if (
      isJudges(row)
    ) {
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
    return (
      orders.find(
        row =>
          rowKey(row) ===
          key
      ) ||
      null
    );
  }

  // =========================================================
  // EVENT TEXT
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

  // =========================================================
  // EVENT MATCH
  // =========================================================

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

    const eventOrderId =
      norm(
        event?.orderId
      );

    const rowOrderId =
      norm(
        row?.id
      );

    if (
      eventOrderId &&
      rowOrderId &&
      eventOrderId === rowOrderId
    ) {
      return true;
    }

    const eventEntityId =
      norm(
        event?.entityId
      );

    const rowEntityId =
      norm(
        row?.entityId
      );

    if (
      eventEntityId &&
      rowEntityId &&
      eventEntityId === rowEntityId
    ) {
      return true;
    }

    const eventUid =
      norm(
        event?.uid ||
        event?.participantUid ||
        event?.userId
      );

    const rowUid =
      norm(
        row?.uid ||
        row?.participantUid ||
        row?.userId
      );

    if (
      eventUid &&
      rowUid &&
      eventUid === rowUid
    ) {
      return true;
    }

    const eventSolo =
      clean(
        event?.entryType ||
        event?.type
      ) === "solo";

    if (
      isSolo(row) ||
      eventSolo
    ) {
      return false;
    }

    const eventTeamId =
      norm(
        event?.teamId
      );

    const rowTeamId =
      norm(
        row?.teamId
      );

    if (
      eventTeamId &&
      rowTeamId &&
      eventTeamId === rowTeamId
    ) {
      return true;
    }

    return false;
  }

  // =========================================================
  // LEGACY NOTE
  // =========================================================

  function legacyEventForRow(row) {
    if (
      isJudges(row)
    ) {
      return null;
    }

    const text =
      norm(
        row?.note
      );

    if (!text) {
      return null;
    }

    const ms =
      timestampMillis(
        row?.updatedAt
      ) ||
      timestampMillis(
        row?.createdAt
      );

    const id =
      [
        "legacy",
        rowKey(row),
        ms || text
      ].join("__");

    return {
      id,

      _legacy: true,

      type:
        row?.type ||
        "",

      entryType:
        row?.entryType ||
        "",

      entityId:
        row?.entityId ||
        "",

      uid:
        row?.uid ||
        "",

      teamId:
        row?.teamId ||
        "",

      orderId:
        row?.id ||
        "",

      text,

      createdAt:
        row?.updatedAt ||
        row?.createdAt ||
        null
    };
  }

  // =========================================================
  // EVENTS FOR ROW
  // =========================================================

  function realEventsForRow(row) {
    if (
      isJudges(row)
    ) {
      return [];
    }

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

  function eventsForRow(row) {
    const real =
      realEventsForRow(row);

    if (
      real.length
    ) {
      return real;
    }

    const legacy =
      legacyEventForRow(row);

    return legacy
      ? [legacy]
      : [];
  }

  // =========================================================
  // EVENT TIME
  // =========================================================

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

    if (
      ta !== tb
    ) {
      return ta - tb;
    }

    return norm(
      a?.id
    ).localeCompare(
      norm(
        b?.id
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
          String(item?.id) ===
          String(event?.id)
      );

    return index >= 0
      ? index + 1
      : 1;
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
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
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
  // STORAGE
  // =========================================================

  function storageBase() {
    if (
      !competitionId ||
      !stageId
    ) {
      return "";
    }

    return (
      "sc_ira_meal_calc__" +
      competitionId +
      "__" +
      stageId
    );
  }

  function pricesKey() {
    return (
      storageBase() +
      "__prices"
    );
  }

  function readsKey() {
    return (
      storageBase() +
      "__message_reads"
    );
  }

  function reportCostsKey() {
    return (
      storageBase() +
      "__report_costs"
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

    reportCosts = {};

    readMessageIds =
      new Set();

    if (
      !storageBase()
    ) {
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
          ...(
            JSON.parse(raw) ||
            {}
          )
        };
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

    try {
      const raw =
        localStorage.getItem(
          reportCostsKey()
        );

      if (raw) {
        reportCosts =
          JSON.parse(raw) ||
          {};
      }
    } catch {}
  }

  function savePrices() {
    if (
      !storageBase()
    ) {
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

  function saveReadMessages() {
    if (
      !storageBase()
    ) {
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

  function saveReportCosts() {
    if (
      !storageBase()
    ) {
      return;
    }

    try {
      localStorage.setItem(
        reportCostsKey(),
        JSON.stringify(
          reportCosts
        )
      );
    } catch {}
  }

  function clearCalculator() {
    if (
      storageBase()
    ) {
      try {
        localStorage.removeItem(
          pricesKey()
        );

        localStorage.removeItem(
          readsKey()
        );

        localStorage.removeItem(
          reportCostsKey()
        );

        localStorage.removeItem(
          storageBase() +
          "__extras"
        );

      } catch {}
    }

    prices = {
      d1l: 0,
      d1d: 0,
      d1b: 0,

      d2l: 0,
      d2d: 0,
      d2b: 0
    };

    reportCosts = {};

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

        input.dataset
          .priceKey =
          key;
      }
    );
  }

  // =========================================================
  // REPORT COSTS
  // =========================================================

  function eventCost(event) {
    if (!event) {
      return 0;
    }

    return signedMoneyNum(
      reportCosts[
        String(
          event.id
        )
      ]
    );
  }

  function rowExtraMoney(row) {
    return eventsForRow(row)
      .reduce(
        (
          sum,
          event
        ) =>
          sum +
          eventCost(event),
        0
      );
  }

  // =========================================================
  // MONEY
  // =========================================================

  function rowMealMoney(row) {
    const d1 =
      row?.day1 ||
      {};

    const d2 =
      row?.day2 ||
      {};

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

  function rowTotalMoney(row) {
    return (
      rowMealMoney(row) +
      rowExtraMoney(row)
    );
  }

  // =========================================================
  // READ / UNREAD
  // =========================================================

  function isMessageRead(event) {
    return readMessageIds
      .has(
        String(
          event?.id
        )
      );
  }

  function unreadEventsForRow(row) {
    return eventsForRow(row)
      .filter(
        event =>
          !isMessageRead(
            event
          )
      );
  }

  function markEventsRead(events) {
    let changed =
      false;

    events.forEach(
      event => {
        const id =
          String(
            event?.id ||
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

    if (
      changed
    ) {
      saveReadMessages();
    }
  }

  // =========================================================
  // SORT ROWS
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
          a?.zone
        ).toUpperCase()
      ] ||
      9;

    const zb =
      zones[
        norm(
          b?.zone
        ).toUpperCase()
      ] ||
      9;

    if (
      za !== zb
    ) {
      return za - zb;
    }

    const sa =
      Number(
        a?.sector ||
        999
      );

    const sb =
      Number(
        b?.sector ||
        999
      );

    if (
      sa !== sb
    ) {
      return sa - sb;
    }

    return rowName(a)
      .localeCompare(
        rowName(b),
        "uk"
      );
  }

  // =========================================================
  // VISIBLE ROWS
  // =========================================================

  function visibleRows() {
    return orders
      .filter(
        row => {
          if (
            row?.status !==
            "submitted"
          ) {
            return false;
          }

          if (
            totalOrder(row) > 0
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

  // =========================================================
  // GLOBAL ENVELOPE
  // =========================================================

  function unreadRows() {
    return visibleRows()
      .filter(
        row =>
          unreadEventsForRow(row)
            .length > 0
      );
  }

  function totalUnreadCount() {
    return unreadRows()
      .reduce(
        (
          total,
          row
        ) =>
          total +
          unreadEventsForRow(row)
            .length,
        0
      );
  }

  function updateGlobalEnvelope() {
    const btn =
      $("globalEnvelopeBtn");

    if (!btn) {
      return;
    }

    const count =
      totalUnreadCount();

    const show =
      mealIsOpen &&
      count > 0;

    btn.classList.toggle(
      "show",
      show
    );

    btn.classList.toggle(
      "unread",
      show
    );

    btn.hidden =
      !show;

    if (
      show
    ) {
      btn.title =
        `Нових повідомлень: ${count}`;

      btn.setAttribute(
        "aria-label",
        `Нових повідомлень: ${count}`
      );

    } else {
      btn.title =
        "Нових повідомлень немає";

      btn.setAttribute(
        "aria-label",
        "Нових повідомлень немає"
      );
    }
  }

  function openFirstUnread() {
    const rows =
      unreadRows();

    if (
      !rows.length
    ) {
      return;
    }

    openMessagesForRowKey(
      rowKey(
        rows[0]
      )
    );
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
      text ||
      "";

    el.className =
      `state ${type}`
        .trim();
  }

  function showContent() {
    if (
      $("content")
    ) {
      $("content").hidden =
        false;
    }

    if (
      $("priceCard")
    ) {
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

    if (
      $("orderCount")
    ) {
      $("orderCount")
        .textContent =
        "0";
    }

    if (
      $("moneyTotal")
    ) {
      $("moneyTotal")
        .textContent =
        "0 ₴";
    }

    if (
      tbody
    ) {
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

    if (
      tfoot
    ) {
      tfoot.innerHTML =
        "";
    }

    updateGlobalEnvelope();
  }

  // =========================================================
  // MESSAGE ICON
  // =========================================================

  function messageActionHTML(row) {
    if (
      isJudges(row)
    ) {
      return "";
    }

    const all =
      eventsForRow(row);

    if (
      !all.length
    ) {
      return "";
    }

    const unread =
      all.filter(
        event =>
          !isMessageRead(
            event
          )
      );

    const key =
      rowKey(row);

    if (
      unread.length
    ) {
      return `
        <button
          type="button"
          class="team-message-action has-unread"
          data-message-row="${esc(key)}"
          aria-label="Нове повідомлення"
          title="Нове повідомлення"
        >
          <span class="team-action-icon">
            ✉️
          </span>
        </button>
      `;
    }

    return `
      <button
        type="button"
        class="team-message-action is-report"
        data-message-row="${esc(key)}"
        aria-label="Відкрити звіт"
        title="Відкрити звіт"
      >
        <span class="team-action-icon">
          📋
        </span>
      </button>
    `;
  }

  // =========================================================
  // RENDER TABLE
  // =========================================================

  function render() {
    showContent();

    if (
      !mealIsOpen
    ) {
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

    if (
      $("orderCount")
    ) {
      $("orderCount")
        .textContent =
        String(
          rows.length
        );
    }

    if (
      !rows.length
    ) {
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
            row?.day1 ||
            {};

          const d2 =
            row?.day2 ||
            {};

          const d1l =
            num(
              d1.lunch
            );

          const d1d =
            num(
              d1.dinner
            );

          const d1b =
            num(
              d1.breakfast
            );

          const d2l =
            num(
              d2.lunch
            );

          const d2d =
            num(
              d2.dinner
            );

          const d2b =
            num(
              d2.breakfast
            );

          totals.d1l +=
            d1l;

          totals.d1d +=
            d1d;

          totals.d1b +=
            d1b;

          totals.d2l +=
            d2l;

          totals.d2d +=
            d2d;

          totals.d2b +=
            d2b;

          const extra =
            rowExtraMoney(
              row
            );

          const money =
            rowTotalMoney(
              row
            );

          totals.extra +=
            extra;

          totals.money +=
            money;

          const key =
            rowKey(row);

          const name =
            rowName(row);

          const sector =
            rowSector(row);

          const hasUnread =
            unreadEventsForRow(row)
              .length > 0;

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

                <div class="team-line">

                  <div class="team-name-wrap">

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

                  </div>

                  ${
                    messageActionHTML(
                      row
                    )
                  }

                </div>

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

                <div
                  class="ira-extra-total ${
                    extra !== 0
                      ? "has-value"
                      : ""
                  }"
                  data-row-extra="${esc(key)}"
                >
                  ${
                    extra !== 0
                      ? esc(
                          fmtMoney(
                            extra
                          )
                        )
                      : "—"
                  }
                </div>

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
            totals.extra !== 0
              ? fmtMoney(
                  totals.extra
                )
              : "—"
          }
        </td>

        <td>
          ${fmtMoney(
            totals.money
          )}
        </td>

      </tr>
    `;

    if (
      $("moneyTotal")
    ) {
      $("moneyTotal")
        .textContent =
        fmtMoney(
          totals.money
        );
    }

    updateGlobalEnvelope();
  }

  // =========================================================
  // MODAL
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
  }

  // =========================================================
  // NORMAL MESSAGE VIEW
  // =========================================================

  function renderNormalMessages(
    row,
    allEvents
  ) {
    const list =
      $("messageList");

    if (!list) {
      return;
    }

    if (
      !allEvents.length
    ) {
      list.innerHTML = `
        <div class="message-empty">
          Повідомлень ще немає.
        </div>
      `;

      return;
    }

    const sorted =
      [...allEvents]
        .sort(
          sortEventsOldFirst
        );

    list.innerHTML =
      sorted.map(
        event => {
          const number =
            eventNumber(
              event,
              sorted
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

  // =========================================================
  // REPORT VIEW
  // =========================================================

  function renderReport(
    row,
    allEvents
  ) {
    const list =
      $("messageList");

    if (!list) {
      return;
    }

    if (
      !allEvents.length
    ) {
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

          const cost =
            eventCost(
              event
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

              <div class="report-cost-row">

                <input
                  class="report-cost-input"
                  type="number"
                  inputmode="decimal"
                  step="1"
                  placeholder="0"
                  data-report-event="${esc(
                    String(
                      event.id
                    )
                  )}"
                  value="${esc(
                    signedInputValue(
                      cost
                    )
                  )}"
                >

                <span
                  style="
                    flex:0 0 auto;
                    color:var(--muted);
                    font-size:.68rem;
                    font-weight:800;
                  "
                >
                  грн
                </span>

              </div>

            </div>
          `;
        }
      )
      .join("");

    list.innerHTML = `
      <div class="report-block">

        <div class="report-title">
          📋 Звіт
        </div>

        <div class="report-help">

          Вартість додаткової покупки:
          наприклад +200.

          Якщо потрібно відняти суму:
          наприклад -180.

          Після введення натисни
          «Зберегти звіт».

        </div>

        <div class="report-total">

          Коригування разом:

          <span id="reportExtraTotal">
            ${esc(
              fmtMoney(
                rowExtraMoney(
                  row
                )
              )
            )}
          </span>

        </div>

      </div>

      <div style="height:8px;"></div>

      ${lines}

      <div class="report-actions">

        <button
          id="saveReportCostsBtn"
          class="report-save-btn"
          type="button"
        >
          💾 Зберегти звіт
        </button>

        <div
          id="reportStatus"
          class="report-status"
        ></div>

      </div>
    `;
  }

  // =========================================================
  // RENDER MODAL
  // =========================================================

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

    if (
      !row
    ) {
      closeMessagesModal();

      return;
    }

    const allEvents =
      eventsForRow(
        row
      );

    if (
      $("messagesOwner")
    ) {
      $("messagesOwner")
        .textContent =
        rowName(
          row
        );
    }

    if (
      $("messagesSector")
    ) {
      const sector =
        rowSector(
          row
        );

      $("messagesSector")
        .textContent =
        sector !== "—"
          ? (
              "Сектор " +
              sector
            )
          : "";
    }

    if (
      $("messagesSummary")
    ) {
      if (
        reportMode
      ) {
        $("messagesSummary")
          .textContent =
          `📋 Звіт · повідомлень: ${allEvents.length}`;

      } else {
        const fresh =
          activeFreshMessageIds
            .size;

        $("messagesSummary")
          .textContent =
          fresh
            ? (
                `Нових: ${fresh} · ` +
                `всього: ${allEvents.length}`
              )
            : (
                `Повідомлень: ${allEvents.length}`
              );
      }
    }

    if (
      reportMode
    ) {
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

  // =========================================================
  // SAVE REPORT
  // =========================================================

  function saveActiveReportCosts() {
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
      return;
    }

    const inputs =
      document.querySelectorAll(
        ".report-cost-input[data-report-event]"
      );

    inputs.forEach(
      input => {
        const eventId =
          norm(
            input.dataset
              .reportEvent
          );

        if (
          !eventId
        ) {
          return;
        }

        const value =
          signedMoneyNum(
            input.value
          );

        if (
          value !== 0
        ) {
          reportCosts[
            eventId
          ] =
            value;

        } else {
          delete reportCosts[
            eventId
          ];
        }
      }
    );

    saveReportCosts();

    render();

    renderMessagesModal();

    const status =
      $("reportStatus");

    if (
      status
    ) {
      status.textContent =
        "✅ Звіт збережено";
    }
  }

  // =========================================================
  // OPEN MESSAGE / REPORT
  // =========================================================

  function openMessagesForRowKey(
    key
  ) {
    const row =
      findRowByKey(
        key
      );

    if (
      !row ||
      isJudges(row)
    ) {
      return;
    }

    const allEvents =
      eventsForRow(
        row
      );

    if (
      !allEvents.length
    ) {
      return;
    }

    const unread =
      allEvents.filter(
        event =>
          !isMessageRead(
            event
          )
      );

    const hadUnread =
      unread.length > 0;

    activeFreshMessageIds =
      new Set(
        unread.map(
          event =>
            String(
              event.id
            )
        )
      );

    activeMessageRowKey =
      key;

    reportMode =
      !hadUnread;

    markEventsRead(
      allEvents
    );

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

      if (
        !stageTitle
      ) {
        stageTitle =
          stageId;
      }

      if (
        $("competitionTitle")
      ) {
        $("competitionTitle")
          .textContent =
          title;
      }

      if (
        $("stageTitle")
      ) {
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

    orders =
      [];
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

    messageEvents =
      [];
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

    if (
      !row
    ) {
      return;
    }

    const allEvents =
      eventsForRow(
        row
      );

    const newWhileOpen =
      allEvents.filter(
        event =>
          !isMessageRead(
            event
          )
      );

    newWhileOpen.forEach(
      event => {
        activeFreshMessageIds
          .add(
            String(
              event.id
            )
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
            console.warn(
              "[meal_ira] message events:",
              error
            );

            messageEvents =
              [];

            render();
          }
        );
  }

  // =========================================================
  // ІРА • МЕНЮ
  // =========================================================

  const MENU_KEYS = [
    "d1l",
    "d1d",
    "d1b",

    "d2l",
    "d2d",
    "d2b"
  ];

  let currentMenuKey = "";

  function menuStorageKey() {
    if (
      !competitionId ||
      !stageId
    ) {
      return "";
    }

    return (
      "sc_ira_menu_draft__" +
      competitionId +
      "__" +
      stageId
    );
  }

  function emptyMenuData() {
    return {
      d1l: ["", "", "", "", ""],
      d1d: ["", "", "", "", ""],
      d1b: ["", "", "", "", ""],

      d2l: ["", "", "", "", ""],
      d2d: ["", "", "", "", ""],
      d2b: ["", "", "", "", ""]
    };
  }

  function setMenuStatus(
    text,
    error = false
  ) {
    const el =
      $("iraMenuStatusV2");

    if (!el) {
      return;
    }

    el.textContent =
      text || "";

    el.style.color =
      error
        ? "var(--red)"
        : "var(--green)";
  }

  function menuMealHtml(
    key,
    title
  ) {
    return `
      <div class="ira-menu-meal">

        <div class="ira-menu-meal-title">
          ${title}
        </div>

        <label class="ira-menu-row">

          <span>
            1. Страва
          </span>

          <input
            type="text"
            maxlength="120"
            data-menu-key="${key}"
            data-menu-index="0"
            placeholder="Впиши страву"
          >

        </label>

        <label class="ira-menu-row">

          <span>
            2. Страва
          </span>

          <input
            type="text"
            maxlength="120"
            data-menu-key="${key}"
            data-menu-index="1"
            placeholder="Впиши страву"
          >

        </label>

        <label class="ira-menu-row">

          <span>
            3. Страва
          </span>

          <input
            type="text"
            maxlength="120"
            data-menu-key="${key}"
            data-menu-index="2"
            placeholder="Впиши страву"
          >

        </label>

        <label class="ira-menu-row">

          <span>
            4. Страва
          </span>

          <input
            type="text"
            maxlength="120"
            data-menu-key="${key}"
            data-menu-index="3"
            placeholder="Впиши страву"
          >

        </label>

        <label class="ira-menu-row">

          <span>
            5. Напій
          </span>

          <input
            type="text"
            maxlength="120"
            data-menu-key="${key}"
            data-menu-index="4"
            placeholder="Компот / чай / кава"
          >

        </label>

      </div>
    `;
  }

  function createMenuEditor() {
    const priceCard =
      $("priceCard");

    if (!priceCard) {
      console.warn(
        "[meal_ira] Не знайдено priceCard."
      );

      return;
    }

    // -----------------------------------------------------
    // STYLE
    // -----------------------------------------------------

    let style =
      $("sc-ira-menu-v2-styles");

    if (!style) {
      style =
        document.createElement(
          "style"
        );

      style.id =
        "sc-ira-menu-v2-styles";

      document.head.appendChild(
        style
      );
    }

    style.textContent = `
      .ira-menu-panel[hidden] {
        display: none !important;
      }

      .ira-menu-panel {
        margin-top: 8px;

        border:
          1px solid
          var(--border);

        border-radius:
          15px;

        background:
          var(--card);

        overflow:
          hidden;
      }

      .ira-menu-panel summary {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          8px;

        padding:
          13px;

        color:
          var(--yellow);

        font-size:
          .94rem;

        font-weight:
          900;

        cursor:
          pointer;

        list-style:
          none;

        user-select:
          none;
      }

      .ira-menu-panel summary::-webkit-details-marker {
        display:
          none;
      }

      .ira-menu-panel summary::after {
        content:
          "▼";

        font-size:
          .68rem;
      }

      .ira-menu-panel details[open] summary::after {
        content:
          "▲";
      }

      .ira-menu-editor {
        padding:
          0 10px 13px;
      }

      .ira-menu-day {
        margin-top:
          9px;

        padding:
          9px;

        border:
          1px solid
          var(--border-soft);

        border-radius:
          12px;

        background:
          var(--card-soft);
      }

      .ira-menu-day-title {
        margin-bottom:
          8px;

        color:
          var(--yellow);

        font-size:
          .94rem;

        font-weight:
          900;
      }

      .ira-menu-meal {
        margin-top:
          9px;

        padding:
          8px;

        border:
          1px solid
          var(--border-soft);

        border-radius:
          10px;

        background:
          var(--card);
      }

      .ira-menu-meal-title {
        margin-bottom:
          7px;

        color:
          var(--text-main);

        font-size:
          .84rem;

        font-weight:
          900;
      }

      .ira-menu-row {
        display:
          grid;

        grid-template-columns:
          78px minmax(0,1fr);

        align-items:
          center;

        gap:
          7px;

        margin-top:
          6px;
      }

      .ira-menu-row span {
        color:
          var(--muted);

        font-size:
          .68rem;

        line-height:
          1.2;

        font-weight:
          800;
      }

      .ira-menu-row input {
        width:
          100%;

        min-width:
          0;

        height:
          35px;

        padding:
          5px 8px;

        border:
          1px solid
          var(--border);

        border-radius:
          8px;

        outline:
          none;

        background:
          var(--card-soft);

        color:
          var(--text-main);

        font:
          inherit;

        font-size:
          .78rem;
      }

      .ira-menu-row input:focus {
        border-color:
          var(--yellow);
      }

      .ira-menu-row input::placeholder {
        color:
          var(--muted);

        opacity:
          .70;
      }

      .ira-menu-save {
        width:
          100%;

        min-height:
          44px;

        margin-top:
          12px;

        padding:
          8px 10px;

        border:
          none;

        border-radius:
          11px;

        background:
          linear-gradient(
            90deg,
            #ffdc38,
            #ff872c
          );

        color:
          #171717;

        font-size:
          .86rem;

        font-weight:
          900;

        cursor:
          pointer;
      }

      .ira-menu-save:active {
        transform:
          scale(.99);
      }

      .ira-menu-status {
        min-height:
          17px;

        margin-top:
          7px;

        color:
          var(--green);

        font-size:
          .70rem;

        line-height:
          1.3;

        text-align:
          center;
      }

      @media(max-width:370px) {

        .ira-menu-row {
          grid-template-columns:
            70px minmax(0,1fr);

          gap:
            5px;
        }

        .ira-menu-row span {
          font-size:
            .63rem;
        }

        .ira-menu-row input {
          font-size:
            .73rem;
        }
      }
    `;

    // -----------------------------------------------------
    // PANEL
    // -----------------------------------------------------

    let section =
      $("iraMenuPanel");

    /*
     * Якщо панель вже є у HTML —
     * використовуємо її.
     *
     * Якщо нема —
     * створюємо після priceCard.
     */
    if (!section) {
      section =
        document.createElement(
          "section"
        );

      section.id =
        "iraMenuPanel";

      priceCard
        .insertAdjacentElement(
          "afterend",
          section
        );
    }

    section.className =
      "ira-menu-panel";

    section.hidden =
      true;

    /*
     * Важливо:
     * повністю перебудовуємо старий
     * textarea-редактор.
     */
    section.innerHTML = `
      <details id="iraMenuDetails">

        <summary>
          📖 Скласти меню на 2 доби
        </summary>

        <div class="ira-menu-editor">

          <!-- ===============================================
               ДОБА 1
               =============================================== -->

          <div class="ira-menu-day">

            <div class="ira-menu-day-title">
              Доба 1
            </div>

            ${
              menuMealHtml(
                "d1l",
                "🍲 Обід"
              )
            }

            ${
              menuMealHtml(
                "d1d",
                "🍽️ Вечеря"
              )
            }

            ${
              menuMealHtml(
                "d1b",
                "☕ Сніданок"
              )
            }

          </div>

          <!-- ===============================================
               ДОБА 2
               =============================================== -->

          <div class="ira-menu-day">

            <div class="ira-menu-day-title">
              Доба 2
            </div>

            ${
              menuMealHtml(
                "d2l",
                "🍲 Обід"
              )
            }

            ${
              menuMealHtml(
                "d2d",
                "🍽️ Вечеря"
              )
            }

            ${
              menuMealHtml(
                "d2b",
                "☕ Сніданок"
              )
            }

          </div>

          <button
            id="iraMenuSaveV2"
            class="ira-menu-save"
            type="button"
          >
            💾 Зберегти меню
          </button>

          <div
            id="iraMenuStatusV2"
            class="ira-menu-status"
            aria-live="polite"
          ></div>

        </div>

      </details>
    `;
  }

  // =========================================================
  // NORMALIZE MENU
  // =========================================================

  function normalizeMenuData(
    rawData
  ) {
    const result =
      emptyMenuData();

    const data =
      rawData &&
      typeof rawData ===
        "object"
        ? rawData
        : {};

    MENU_KEYS.forEach(
      key => {
        const value =
          data[key];

        /*
         * Новий формат:
         *
         * d1l: [
         *   "Солянка",
         *   "Картопляне пюре",
         *   "Відбивна",
         *   "Салат",
         *   "Компот"
         * ]
         */
        if (
          Array.isArray(value)
        ) {
          for (
            let i = 0;
            i < 5;
            i++
          ) {
            result[key][i] =
              String(
                value[i] ??
                ""
              ).trim();
          }

          return;
        }

        /*
         * Старий формат:
         *
         * d1l: "борщ, пюре..."
         *
         * Не втрачаємо:
         * ставимо старий текст
         * у перший рядок.
         */
        if (
          typeof value ===
            "string" &&
          value.trim()
        ) {
          result[key][0] =
            value.trim();
        }
      }
    );

    return result;
  }

  // =========================================================
  // FILL MENU
  // =========================================================

  function fillMenuEditor(
    rawData = {}
  ) {
    const data =
      normalizeMenuData(
        rawData
      );

    document
      .querySelectorAll(
        "[data-menu-key][data-menu-index]"
      )
      .forEach(
        input => {
          const key =
            input.dataset
              .menuKey;

          const index =
            Number(
              input.dataset
                .menuIndex
            );

          input.value =
            String(
              data?.[key]?.[index] ??
              ""
            );
        }
      );
  }

  // =========================================================
  // COLLECT MENU
  // =========================================================

  function collectMenuEditor() {
    const data =
      emptyMenuData();

    document
      .querySelectorAll(
        "[data-menu-key][data-menu-index]"
      )
      .forEach(
        input => {
          const key =
            input.dataset
              .menuKey;

          const index =
            Number(
              input.dataset
                .menuIndex
            );

          if (
            !MENU_KEYS.includes(
              key
            )
          ) {
            return;
          }

          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index > 4
          ) {
            return;
          }

          data[key][index] =
            String(
              input.value ||
              ""
            ).trim();
        }
      );

    return data;
  }

  // =========================================================
  // LOAD MENU DRAFT
  // =========================================================

  function loadMenuDraft() {
    fillMenuEditor();

    if (
      !currentMenuKey
    ) {
      setMenuStatus("");

      return;
    }

    try {
      const raw =
        localStorage.getItem(
          currentMenuKey
        );

      if (!raw) {
        setMenuStatus("");

        return;
      }

      const data =
        JSON.parse(
          raw
        );

      fillMenuEditor(
        data
      );

      setMenuStatus(
        "Збережене меню завантажено."
      );

    } catch (error) {
      console.error(
        "[meal_ira] menu load:",
        error
      );

      setMenuStatus(
        "Не вдалося завантажити меню.",
        true
      );
    }
  }

  // =========================================================
  // SAVE MENU DRAFT
  // =========================================================

  function saveMenuDraft() {
    if (
      !mealIsOpen ||
      !currentMenuKey
    ) {
      setMenuStatus(
        "Спочатку відкрий харчування.",
        true
      );

      return;
    }

    const data =
      collectMenuEditor();

    data.savedAt =
      Date.now();

    try {
      localStorage.setItem(
        currentMenuKey,
        JSON.stringify(
          data
        )
      );

      setMenuStatus(
        "✅ Меню збережено."
      );

    } catch (error) {
      console.error(
        "[meal_ira] menu save:",
        error
      );

      setMenuStatus(
        "Помилка збереження меню.",
        true
      );
    }
  }

  // =========================================================
  // INIT MENU EDITOR
  // =========================================================

  function initMenuEditor() {
    createMenuEditor();

    $("iraMenuSaveV2")
      ?.addEventListener(
        "click",
        saveMenuDraft
      );

    document
      .querySelectorAll(
        "[data-menu-key][data-menu-index]"
      )
      .forEach(
        input => {
          input.addEventListener(
            "input",
            () => {
              setMenuStatus(
                "Є незбережені зміни."
              );
            }
          );
        }
      );
  }

  // =========================================================
  // SYNC MENU EDITOR
  // =========================================================

  function syncMenuEditor() {
    const panel =
      $("iraMenuPanel");

    if (!panel) {
      return;
    }

    const active =
      Boolean(
        mealIsOpen &&
        competitionId &&
        stageId
      );

    panel.hidden =
      !active;

    if (!active) {
      const details =
        $("iraMenuDetails");

      if (details) {
        details.open =
          false;
      }

      /*
       * Якщо mealPublic/current
       * повністю очищений —
       * скидаємо активний ключ.
       */
      if (
        !competitionId ||
        !stageId
      ) {
        currentMenuKey =
          "";

        fillMenuEditor();

        setMenuStatus("");
      }

      return;
    }

    const nextKey =
      menuStorageKey();

    if (
      nextKey !==
      currentMenuKey
    ) {
      currentMenuKey =
        nextKey;

      fillMenuEditor();

      loadMenuDraft();

      const details =
        $("iraMenuDetails");

      if (details) {
        details.open =
          false;
      }
    }
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

            // -------------------------------------------------
            // CHANGED STAGE
            // -------------------------------------------------

            if (
              changed
            ) {
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

            /*
             * ВАЖЛИВО:
             * після отримання competitionId / stageId /
             * isOpen синхронізуємо меню.
             */
            syncMenuEditor();

            // -------------------------------------------------
            // NOTHING ACTIVE
            // -------------------------------------------------

            if (
              !competitionId ||
              !stageId
            ) {
              stopOrdersRealtime();

              stopEventsRealtime();

              closeMessagesModal();

              if (
                $("priceCard")
              ) {
                $("priceCard")
                  .hidden =
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

            // -------------------------------------------------
            // NEW STAGE
            // -------------------------------------------------

            if (
              changed
            ) {
              loadCalculator();

              fillPriceInputs();

              await loadTitle();
            }

            // -------------------------------------------------
            // CLOSED
            // -------------------------------------------------

            if (
              !mealIsOpen
            ) {
              stopOrdersRealtime();

              stopEventsRealtime();

              closeMessagesModal();

              clearCalculator();

              fillPriceInputs();

              if (
                $("priceCard")
              ) {
                $("priceCard")
                  .hidden =
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

            // -------------------------------------------------
            // OPEN
            // -------------------------------------------------

            if (
              $("priceCard")
            ) {
              $("priceCard")
                .hidden =
                false;
            }

            setState(
              "Харчування відкрите · LIVE",
              "ok"
            );

            if (
              changed ||
              !unsubOrders
            ) {
              startOrdersRealtime();
            }

            if (
              changed ||
              !unsubEvents
            ) {
              startEventsRealtime();
            }
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
  // INPUT
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

      if (
        target.classList
          .contains(
            "ira-price-input"
          )
      ) {
        const key =
          target.dataset
            .priceKey;

        if (
          !key
        ) {
          return;
        }

        prices[key] =
          moneyNum(
            target.value
          );

        savePrices();

        render();

        return;
      }
    }
  );

  // =========================================================
  // CLICK
  // =========================================================

  document.addEventListener(
    "click",
    event => {
      const target =
        event.target;

      if (
        !target
      ) {
        return;
      }

      const globalEnvelope =
        target.closest
          ? target.closest(
              "#globalEnvelopeBtn"
            )
          : null;

      if (
        globalEnvelope
      ) {
        openFirstUnread();

        return;
      }

      const action =
        target.closest
          ? target.closest(
              ".team-message-action"
            )
          : null;

      if (
        action
      ) {
        const key =
          norm(
            action.dataset
              .messageRow
          );

        if (
          key
        ) {
          openMessagesForRowKey(
            key
          );
        }

        return;
      }

      if (
        target.id ===
        "saveReportCostsBtn"
      ) {
        saveActiveReportCosts();

        return;
      }

      if (
        target.id ===
        "messagesClose"
      ) {
        closeMessagesModal();

        return;
      }

      if (
        target.id ===
        "messagesModal"
      ) {
        closeMessagesModal();
      }
    }
  );

  // =========================================================
  // ESC
  // =========================================================

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
      if (
        window.scReady
      ) {
        await window.scReady;
      }

      db =
        window.scDb;

      if (
        !db
      ) {
        throw new Error(
          "Firebase не готовий"
        );
      }

      /*
       * Створюємо / перебудовуємо
       * редактор меню.
       */
      initMenuEditor();

      if (
        $("content")
      ) {
        $("content")
          .hidden =
          false;
      }

      if (
        $("priceCard")
      ) {
        $("priceCard")
          .hidden =
          true;
      }

      if (
        $("iraMenuPanel")
      ) {
        $("iraMenuPanel")
          .hidden =
          true;
      }

      if (
        $("globalEnvelopeBtn")
      ) {
        $("globalEnvelopeBtn")
          .hidden =
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
