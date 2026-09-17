// assets/js/meal_ira.js
// STOLAR CARP • Пані Іра • Харчування
//
// PUBLIC • БЕЗ ВХОДУ
//
// ✅ mealPublic/current
// ✅ mealPublicOrders LIVE
// ✅ mealPublicOrderEvents LIVE
//
// ✅ таблиця компактна:
//    • біля імені тільки ✉️ або 📋
//    • ніяких текстів повідомлень у таблиці
//    • ніяких "Звіт · 3" під ім'ям
//
// ✅ глобальний конверт:
//    • один ✉️ праворуч угорі
//    • блимає, якщо хоч одна команда / SOLO має нове повідомлення
//    • натискання відкриває перше непрочитане
//
// ✅ повідомлення:
//    • #1 / #2 / #3 / #4...
//    • дата + година
//    • відкрила = прочитано
//    • після прочитання біля учасника стає 📋
//    • нове повідомлення знову повертає ✉️
//
// ✅ звіт:
//    • кожне повідомлення має окрему вартість
//    • Іра вписує ціну додаткового замовлення
//    • всі додаткові вартості автоматично сумуються
//    • сума автоматично потрапляє у колонку "Доп."
//    • "Доп." у таблиці НЕ редагується
//
// ✅ калькулятор їжі:
//    • ціни 1О / 1В / 1С / 2О / 2В / 2С
//    • сума по кожному рядку
//    • загальна сума
//
// ✅ ціни / прочитане / вартість додаткових замовлень:
//    • локально на телефоні Іри
//    • після "Очистити та закрити харчування" очищаються
//
// ✅ legacy fallback:
//    • якщо старе row.note ще не має окремої події,
//      воно теж відкривається через ✉️
//
// ВАЖЛИВО:
// Для справжньої історії #1 / #2 / #3 кожне нове повідомлення
// повинно створювати ОКРЕМИЙ документ у mealPublicOrderEvents.

(function () {
  "use strict";

  console.log(
    "✅ meal_ira.js LOADED v20260918-global-envelope-report-v10"
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
   * Вартість додаткових замовлень.
   *
   * Ключ:
   * event.id
   *
   * Наприклад:
   * msg001 -> 250
   * msg002 -> 100
   */
  let reportCosts = {};

  /*
   * Які повідомлення Іра
   * вже відкривала.
   */
  let readMessageIds =
    new Set();

  /*
   * Який рядок зараз
   * відкритий у модалці.
   */
  let activeMessageRowKey = "";

  /*
   * Які повідомлення були
   * НОВИМИ в момент відкриття.
   */
  let activeFreshMessageIds =
    new Set();

  /*
   * false:
   * показуємо повідомлення.
   *
   * true:
   * показуємо звіт + ціни.
   */
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
        String(value ?? "")
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
      !row
    ) {
      return false;
    }

    // -----------------------------------------------------
    // ORDER DOCUMENT ID
    // -----------------------------------------------------

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
      eventOrderId ===
        rowOrderId
    ) {
      return true;
    }

    // -----------------------------------------------------
    // ENTITY ID
    // -----------------------------------------------------

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
      eventEntityId ===
        rowEntityId
    ) {
      return true;
    }

    // -----------------------------------------------------
    // UID
    // -----------------------------------------------------

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
      rowUid
    ) {
      return (
        eventUid ===
        rowUid
      );
    }

    // -----------------------------------------------------
    // SOLO НЕ МОЖНА MATCH ПО TEAM ID
    //
    // Бо два SOLO учасники можуть
    // бути з однієї команди.
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // TEAM ID
    // -----------------------------------------------------

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
      eventTeamId ===
        rowTeamId
    ) {
      return true;
    }

    return false;
  }

  // =========================================================
  // LEGACY NOTE
  // =========================================================

  function legacyEventForRow(row) {
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

      _legacy:
        true,

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
      realEventsForRow(
        row
      );

    /*
     * Є нормальна історія —
     * row.note вже не дублюємо.
     */
    if (
      real.length
    ) {
      return real;
    }

    const legacy =
      legacyEventForRow(
        row
      );

    return legacy
      ? [legacy]
      : [];
  }

  // =========================================================
  // EVENT TIME / SORT / NUMBER
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

    return norm(a.id)
      .localeCompare(
        norm(b.id)
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
      Number.isFinite(
        explicit
      ) &&
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
          String(item.id) ===
          String(event.id)
      );

    return (
      index >= 0
        ? index + 1
        : 1
    );
  }

  function fmtEventTime(event) {
    const ms =
      eventMillis(
        event
      );

    if (!ms) {
      return "час не вказано";
    }

    try {
      return new Intl
        .DateTimeFormat(
          "uk-UA",
          {
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

    reportCosts =
      {};

    readMessageIds =
      new Set();

    if (
      !storageBase()
    ) {
      return;
    }

    // -----------------------------------------------------
    // PRICES
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // READ
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // REPORT COSTS
    // -----------------------------------------------------

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

        /*
         * Старий ключ попередньої
         * версії теж прибираємо.
         */
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

    reportCosts =
      {};

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
    )
      .forEach(
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

    return moneyNum(
      reportCosts[
        String(event.id)
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

  function rowMealMoney(row) {
    const d1 =
      row?.day1 ||
      {};

    const d2 =
      row?.day2 ||
      {};

    return (
      num(d1.lunch) *
        moneyNum(
          prices.d1l
        )

      +

      num(d1.dinner) *
        moneyNum(
          prices.d1d
        )

      +

      num(d1.breakfast) *
        moneyNum(
          prices.d1b
        )

      +

      num(d2.lunch) *
        moneyNum(
          prices.d2l
        )

      +

      num(d2.dinner) *
        moneyNum(
          prices.d2d
        )

      +

      num(d2.breakfast) *
        moneyNum(
          prices.d2b
        )
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
          !readMessageIds.has(
            id
          )
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
      ] || 9;

    const zb =
      zones[
        norm(
          b?.zone
        ).toUpperCase()
      ] || 9;

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
  // ICON NEXT TO TEAM NAME
  // =========================================================

  function messageActionHTML(row) {
    if (
      isJudges(row)
    ) {
      const all =
        eventsForRow(row);

      if (
        !all.length
      ) {
        return "";
      }
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

    /*
     * НОВЕ:
     * тільки ✉️
     */
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

    /*
     * ПРОЧИТАНО:
     * тільки 📋
     */
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
                    extra
                      ? "has-value"
                      : ""
                  }"
                  data-row-extra="${esc(key)}"
                >
                  ${
                    extra
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
            totals.extra
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
  // REPORT TOTAL
  // =========================================================

  function activeReportTotal() {
    const row =
      findRowByKey(
        activeMessageRowKey
      );

    if (!row) {
      return 0;
    }

    return rowExtraMoney(
      row
    );
  }

  function updateReportTotalUI() {
    const el =
      $("reportExtraTotal");

    if (!el) {
      return;
    }

    el.textContent =
      fmtMoney(
        activeReportTotal()
      );
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
                  min="0"
                  step="1"
                  placeholder="Вартість, грн"
                  data-report-event="${esc(
                    String(
                      event.id
                    )
                  )}"
                  value="${esc(
                    inputValue(
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
          Впиши вартість тільки там,
          де було додаткове замовлення.
          Система сама додасть усе в
          колонку «Доп.».
        </div>

        <div class="report-total">
          Додатково разом:
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

      <div
        style="
          height:8px;
        "
      ></div>

      ${lines}
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
      !row
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

    /*
     * Є нові:
     * показуємо самі повідомлення.
     *
     * Все вже читане:
     * відкриваємо одразу звіт.
     */
    reportMode =
      !hadUnread;

    /*
     * Відкрила =
     * повідомлення прочитані.
     */
    markEventsRead(
      allEvents
    );

    /*
     * Після цього в таблиці
     * ✉️ стане 📋.
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
        stageId ===
        "main"
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

            /*
             * Якщо Rules ще не дозволяють
             * читання event-ів, сторінка
             * не падає.
             *
             * Залишається legacy row.note.
             */
            messageEvents =
              [];

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

            // -------------------------------------------------
            // CHANGE STAGE
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
            // NEW COMPETITION / STAGE
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

              /*
               * Після очищення харчування
               * очищаємо і телефон Іри.
               */
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

      // -----------------------------------------------------
      // PRICE OF MEALS
      // -----------------------------------------------------

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

        /*
         * Модалку не чіпаємо.
         * Перераховуємо тільки таблицю.
         */
        render();

        return;
      }

      // -----------------------------------------------------
      // REPORT COST
      // -----------------------------------------------------

      if (
        target.classList
          .contains(
            "report-cost-input"
          )
      ) {
        const eventId =
          norm(
            target.dataset
              .reportEvent
          );

        if (
          !eventId
        ) {
          return;
        }

        const value =
          moneyNum(
            target.value
          );

        if (
          value > 0
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

        saveReportCosts();

        /*
         * Відразу:
         *
         * • сумуємо Доп.
         * • перераховуємо Σ
         * • перераховуємо Всього
         */
        render();

        updateReportTotalUI();
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

      // -----------------------------------------------------
      // GLOBAL ✉️
      // -----------------------------------------------------

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

      // -----------------------------------------------------
      // ROW ✉️ / 📋
      // -----------------------------------------------------

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

      // -----------------------------------------------------
      // CLOSE
      // -----------------------------------------------------

      if (
        target.id ===
        "messagesClose"
      ) {
        closeMessagesModal();

        return;
      }

      // -----------------------------------------------------
      // BACKDROP
      // -----------------------------------------------------

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
