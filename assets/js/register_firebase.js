// assets/js/register_firebase.js
// STOLAR CARP • Registration
//
// ✅ Manual registration dates fixed
// ✅ Reads registration.openDate / registration.closeDate
// ✅ Reads regOpen / regClose and all legacy aliases
// ✅ Opening date starts at 00:00
// ✅ Closing date remains active until 23:59:59
// ✅ Pending / Open / Closed statuses
// ✅ Finished stages are hidden
// ✅ Submit enabled only while registration is open
// ✅ Payment UI: amount + currency + details + copy
// ✅ Compatible with season events and one-off competitions
// ✅ New cache version

(function () {
  "use strict";

  const auth = window.scAuth;
  const db = window.scDb;
  const fb = window.firebase;

  const form = document.getElementById("regForm");
  const eventOptionsEl = document.getElementById("eventOptions");
  const msgEl = document.getElementById("msg");
  const submitBtn = document.getElementById("submitBtn");
  const spinnerEl = document.getElementById("spinner");
  const hpInput = document.getElementById("hp");
  const profileSummary = document.getElementById("profileSummary");
  const rulesChk = document.getElementById("rules");

  const copyPayBtn = document.getElementById("copyCard");
  const payBoxEl = document.getElementById("cardNum");

  const payAmountEl = document.getElementById("payAmount");
  const payCurrEl = document.getElementById("payCurrency");
  const payDetailsEl = document.getElementById("payDetails");

  if (!auth || !db || !fb) {
    if (eventOptionsEl) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }

    return;
  }

  const COMP_CACHE_KEY =
    "sc_competitions_cache_v6_registration_dates_fixed";

  const TEAM_CACHE_PREFIX = "sc_team_cache_";
  const TEAM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const FINISHED_HIDE_GRACE_MS = 24 * 60 * 60 * 1000;

  let currentUser = null;
  let profile = null;
  let lastItems = [];
  let nearestUpcomingValue = null;
  let activePayCopyText = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function firstDefined(...values) {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  }

  function setMsg(text, ok = true) {
    if (!msgEl) return;

    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");

    if (text) {
      msgEl.classList.add(ok ? "ok" : "err");
    }
  }

  function setLoading(value) {
    if (spinnerEl) {
      spinnerEl.classList.toggle("spinner--on", Boolean(value));
    }

    refreshSubmitState();
  }

  function fmtDate(date) {
    if (!date) return "—";

    return date.toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function normalizeMoney(value) {
    if (value === 0) return 0;

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const number = Number(
      String(value).trim().replace(",", ".")
    );

    return Number.isFinite(number) ? number : null;
  }

  function parseDateYMDLocal(value, endOfDay = false) {
    const match = String(value || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!year || !month || !day) {
      return null;
    }

    const date = endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);

    return Number.isFinite(date.getTime())
      ? date
      : null;
  }

  function toDateMaybe(value, options = {}) {
    if (!value) return null;

    const endOfDay = options.endOfDay === true;

    try {
      if (value instanceof Date) {
        return Number.isFinite(value.getTime())
          ? value
          : null;
      }

      if (typeof value === "string") {
        const raw = value.trim();

        const dateOnly = parseDateYMDLocal(
          raw,
          endOfDay
        );

        if (dateOnly) {
          return dateOnly;
        }

        const parsed = new Date(raw);

        return Number.isFinite(parsed.getTime())
          ? parsed
          : null;
      }

      if (
        value &&
        typeof value.toDate === "function"
      ) {
        const parsed = value.toDate();

        return Number.isFinite(parsed.getTime())
          ? parsed
          : null;
      }

      if (
        value &&
        typeof value.seconds === "number"
      ) {
        const parsed = new Date(
          value.seconds * 1000
        );

        return Number.isFinite(parsed.getTime())
          ? parsed
          : null;
      }

      if (typeof value === "number") {
        const parsed = new Date(value);

        return Number.isFinite(parsed.getTime())
          ? parsed
          : null;
      }
    } catch (error) {
      console.warn("toDateMaybe error:", error);
    }

    return null;
  }

  function nowLocal() {
    return new Date();
  }

  function getRunDatesFromEvent(event, competition) {
    const eventSchedule = event?.schedule || {};
    const compSchedule = competition?.schedule || {};

    const startAt = firstDefined(
      event?.startAt,
      event?.startDate,
      eventSchedule.startAt,
      eventSchedule.startDate,

      competition?.startAt,
      competition?.startDate,
      compSchedule.startAt,
      compSchedule.startDate
    );

    const endAt = firstDefined(
      event?.finishAt,
      event?.finishDate,
      event?.endAt,
      event?.endDate,
      eventSchedule.finishAt,
      eventSchedule.finishDate,
      eventSchedule.endAt,
      eventSchedule.endDate,

      competition?.finishAt,
      competition?.finishDate,
      competition?.endAt,
      competition?.endDate,
      compSchedule.finishAt,
      compSchedule.finishDate,
      compSchedule.endAt,
      compSchedule.endDate
    );

    return {
      startAt,
      endAt
    };
  }

  function getRegDatesFromEvent(event, competition) {
    const eventRegistration =
      event?.registration || {};

    const compRegistration =
      competition?.registration || {};

    const regOpenAt = firstDefined(
      event?.regOpenAt,
      event?.regOpenDate,
      event?.regOpen,
      event?.registrationOpenAt,
      event?.registrationOpenDate,
      eventRegistration.openAt,
      eventRegistration.openDate,

      competition?.regOpenAt,
      competition?.regOpenDate,
      competition?.regOpen,
      competition?.registrationOpenAt,
      competition?.registrationOpenDate,
      compRegistration.openAt,
      compRegistration.openDate
    );

    const regCloseAt = firstDefined(
      event?.regCloseAt,
      event?.regCloseDate,
      event?.regClose,
      event?.registrationCloseAt,
      event?.registrationCloseDate,
      eventRegistration.closeAt,
      eventRegistration.closeDate,

      competition?.regCloseAt,
      competition?.regCloseDate,
      competition?.regClose,
      competition?.registrationCloseAt,
      competition?.registrationCloseDate,
      compRegistration.closeAt,
      compRegistration.closeDate
    );

    return {
      regOpenAt,
      regCloseAt
    };
  }

  function getRegistrationMode(event, competition) {
    return String(
      firstDefined(
        event?.registration?.mode,
        event?.regMode,
        competition?.registration?.mode,
        competition?.regMode,
        "auto"
      )
    )
      .trim()
      .toLowerCase();
  }

  function getManualOpenFlag(event, competition) {
    const value = firstDefined(
      event?.manualOpen,
      event?.registration?.manualOpen,
      competition?.manualOpen,
      competition?.registration?.manualOpen,
      false
    );

    return value === true;
  }

  function getPaymentData(event, competition) {
    const eventPayment = event?.payment || {};
    const compPayment = competition?.payment || {};

    const enabledRaw = firstDefined(
      eventPayment.enabled,
      event?.payEnabled,
      event?.paymentEnabled,

      compPayment.enabled,
      competition?.payEnabled,
      competition?.paymentEnabled,

      false
    );

    const priceRaw = firstDefined(
      eventPayment.price,
      eventPayment.amount,
      event?.price,
      event?.fee,
      event?.entryFee,
      event?.amount,
      event?.paymentAmount,

      compPayment.price,
      compPayment.amount,
      competition?.price,
      competition?.fee,
      competition?.entryFee,
      competition?.amount,
      competition?.paymentAmount,

      null
    );

    const currency = String(
      firstDefined(
        eventPayment.currency,
        event?.currency,
        event?.paymentCurrency,

        compPayment.currency,
        competition?.currency,
        competition?.paymentCurrency,

        "UAH"
      )
    ).toUpperCase();

    const details = String(
      firstDefined(
        eventPayment.details,
        event?.payDetails,
        event?.paymentDetails,
        event?.paymentText,
        event?.requisites,
        event?.bankDetails,
        event?.card,
        event?.cardNumber,

        compPayment.details,
        competition?.payDetails,
        competition?.paymentDetails,
        competition?.paymentText,
        competition?.requisites,
        competition?.bankDetails,
        competition?.card,
        competition?.cardNumber,

        ""
      )
    ).trim();

    return {
      payEnabled: enabledRaw === true,
      price: normalizeMoney(priceRaw),
      currency,
      payDetails: details
    };
  }

  function entryTypeFromEvent(event, competition) {
    const type = String(
      firstDefined(
        event?.entryType,
        competition?.entryType,
        "team"
      )
    ).toLowerCase();

    return type === "solo"
      ? "solo"
      : "team";
  }

  function isFinishedEvent(item) {
    const endAt = toDateMaybe(item?.endAt);

    if (!endAt) return false;

    return (
      nowLocal().getTime() >
      endAt.getTime() + FINISHED_HIDE_GRACE_MS
    );
  }

  function visibleItemsOnly(items) {
    return (items || []).filter(
      item => !isFinishedEvent(item)
    );
  }

  function getRegistrationState(item) {
    if (!item) return "unavailable";

    if (isFinishedEvent(item)) {
      return "closed";
    }

    const now = nowLocal();
    const mode = String(
      item.regMode || "auto"
    ).toLowerCase();

    const openAt = toDateMaybe(
      item.regOpenAt,
      { endOfDay: false }
    );

    const closeAt = toDateMaybe(
      item.regCloseAt,
      { endOfDay: true }
    );

    /*
     * Якщо дати задані, вони завжди мають пріоритет.
     */
    if (openAt && closeAt) {
      if (now < openAt) {
        return "pending";
      }

      if (now > closeAt) {
        return "closed";
      }

      return "open";
    }

    /*
     * Можлива часткова конфігурація.
     */
    if (openAt && !closeAt) {
      return now >= openAt
        ? "open"
        : "pending";
    }

    if (!openAt && closeAt) {
      return now <= closeAt
        ? "open"
        : "closed";
    }

    /*
     * Старий ручний прапорець підтримуємо лише тоді,
     * коли конкретні дати взагалі відсутні.
     */
    if (
      mode === "manual" &&
      item.manualOpen === true
    ) {
      return "open";
    }

    return "unavailable";
  }

  function isOpenWindow(item) {
    return getRegistrationState(item) === "open";
  }

  function formatCardLikeText(text) {
    const raw = String(text || "").trim();

    if (/^\d{16}$/.test(raw)) {
      return raw.replace(
        /(\d{4})(?=\d)/g,
        "$1 "
      );
    }

    return raw;
  }

  function setPayUIFromSelected(item) {
    const hasAnyUI = Boolean(
      payBoxEl ||
      payAmountEl ||
      payDetailsEl
    );

    if (!hasAnyUI) return;

    if (!item) {
      activePayCopyText = "";

      if (payAmountEl) {
        payAmountEl.textContent = "—";
      }

      if (payCurrEl) {
        payCurrEl.textContent = "UAH";
      }

      if (payDetailsEl) {
        payDetailsEl.textContent = "—";
      }

      if (payBoxEl) {
        payBoxEl.textContent = "—";
      }

      return;
    }

    const payEnabled = item.payEnabled === true;
    const price = normalizeMoney(item.price);
    const currency = String(
      item.currency || "UAH"
    ).toUpperCase();

    const details = String(
      item.payDetails || ""
    ).trim();

    if (!payEnabled) {
      activePayCopyText =
        "Оплата не потрібна для цього етапу.";

      if (payAmountEl) {
        payAmountEl.textContent = "0";
      }

      if (payCurrEl) {
        payCurrEl.textContent = currency;
      }

      if (payDetailsEl) {
        payDetailsEl.textContent =
          "Оплата не потрібна.";
      }

      if (payBoxEl) {
        payBoxEl.textContent =
          "Оплата не потрібна.";
      }

      return;
    }

    const amountText =
      price === null
        ? "—"
        : String(price);

    const detailsText =
      details ||
      "Реквізити не задані адміністратором.";

    activePayCopyText = detailsText;

    if (payAmountEl) {
      payAmountEl.textContent = amountText;
    }

    if (payCurrEl) {
      payCurrEl.textContent = currency;
    }

    if (payDetailsEl) {
      payDetailsEl.textContent = detailsText;
    }

    if (payBoxEl) {
      payBoxEl.textContent =
        formatCardLikeText(detailsText);
    }
  }

  if (copyPayBtn) {
    copyPayBtn.addEventListener(
      "click",
      async () => {
        const text = String(
          activePayCopyText || ""
        ).trim();

        if (!text) {
          alert("Нема що копіювати.");
          return;
        }

        try {
          await navigator.clipboard.writeText(
            text
          );

          const previousText =
            copyPayBtn.textContent;

          copyPayBtn.textContent =
            "Скопійовано ✔";

          setTimeout(() => {
            copyPayBtn.textContent =
              previousText ||
              "Скопіювати реквізити";
          }, 1200);
        } catch {
          alert(
            "Не вдалося скопіювати. Скопіюйте вручну."
          );
        }
      }
    );
  }

  function calcNearestUpcoming(items) {
    let best = null;
    const now = nowLocal();

    visibleItemsOnly(items).forEach(item => {
      const openAt = toDateMaybe(
        item.regOpenAt,
        { endOfDay: false }
      );

      if (!openAt || openAt <= now) {
        return;
      }

      const value =
        `${item.compId}||${item.stageKey || ""}`;

      if (!best || openAt < best.openAt) {
        best = {
          value,
          openAt
        };
      }
    });

    nearestUpcomingValue =
      best ? best.value : null;
  }

  function statusLamp(item, value) {
    const state = getRegistrationState(item);

    if (state === "open") {
      return "lamp-green";
    }

    if (
      state === "pending" &&
      nearestUpcomingValue &&
      value === nearestUpcomingValue
    ) {
      return "lamp-yellow";
    }

    return "lamp-red";
  }

  function getStatusUI(item) {
    const state = getRegistrationState(item);

    if (state === "open") {
      return {
        state,
        short: "Відкрито",
        badge: "ВІДКРИТО",
        text: "Реєстрація відкрита ✅",
        badgeClass: "pill-b--open"
      };
    }

    if (state === "pending") {
      return {
        state,
        short: "Очікується",
        badge: "ОЧІКУЄТЬСЯ",
        text: "Реєстрація ще не розпочалася.",
        badgeClass: "pill-b--closed"
      };
    }

    if (state === "closed") {
      return {
        state,
        short: "Закрито",
        badge: "ЗАКРИТО",
        text: "Реєстрація завершена.",
        badgeClass: "pill-b--closed"
      };
    }

    return {
      state,
      short: "Недоступно",
      badge: "НЕДОСТУПНО",
      text: "Дати реєстрації не налаштовані.",
      badgeClass: "pill-b--closed"
    };
  }

  function refreshSubmitState() {
    if (!submitBtn) return;

    const loading =
      spinnerEl &&
      spinnerEl.classList.contains(
        "spinner--on"
      );

    if (loading) {
      submitBtn.disabled = true;
      return;
    }

    const picked = document.querySelector(
      'input[name="stagePick"]:checked'
    );

    const rulesOk = rulesChk
      ? rulesChk.checked === true
      : true;

    const selectedValue = picked
      ? String(picked.value)
      : "";

    const selectedItem = selectedValue
      ? lastItems.find(
          item =>
            `${item.compId}||${item.stageKey || ""}` ===
            selectedValue
        )
      : null;

    const canSubmit = Boolean(
      currentUser &&
      picked &&
      rulesOk &&
      selectedItem &&
      !isFinishedEvent(selectedItem) &&
      isOpenWindow(selectedItem)
    );

    submitBtn.disabled = !canSubmit;
  }

  function getTeamCacheKey(teamId) {
    return (
      TEAM_CACHE_PREFIX +
      String(teamId || "")
    );
  }

  function readTeamNameCache(teamId) {
    try {
      const raw = localStorage.getItem(
        getTeamCacheKey(teamId)
      );

      if (!raw) return null;

      const object = JSON.parse(raw);

      if (
        !object ||
        !object.name ||
        !object.ts
      ) {
        return null;
      }

      if (
        Date.now() - object.ts >
        TEAM_CACHE_TTL_MS
      ) {
        return null;
      }

      return String(object.name);
    } catch {
      return null;
    }
  }

  function writeTeamNameCache(teamId, name) {
    try {
      localStorage.setItem(
        getTeamCacheKey(teamId),
        JSON.stringify({
          ts: Date.now(),
          name: String(name || "")
        })
      );
    } catch {}
  }

  async function getTeamName(teamId) {
    if (!teamId) return "";

    const cached =
      readTeamNameCache(teamId);

    if (cached) return cached;

    const teamSnap = await db
      .collection("teams")
      .doc(teamId)
      .get();

    const name = teamSnap.exists
      ? String(
          (teamSnap.data() || {}).name || ""
        )
      : "";

    if (name) {
      writeTeamNameCache(teamId, name);
    }

    return name;
  }

  async function loadProfile(user) {
    const userSnap = await db
      .collection("users")
      .doc(user.uid)
      .get();

    if (!userSnap.exists) {
      throw new Error(
        "Нема профілю. Зайдіть на сторінку «Акаунт» і створіть профіль."
      );
    }

    const userData =
      userSnap.data() || {};

    const teamId =
      userData.teamId || null;

    const teamName = teamId
      ? await getTeamName(teamId)
      : "";

    profile = {
      uid: user.uid,
      email: user.email || "",
      fullName: String(
        userData.fullName || ""
      ).trim(),
      teamId,
      teamName: String(
        teamName || "Без назви"
      ).trim(),
      captain: String(
        userData.fullName ||
        user.email ||
        ""
      ).trim(),
      phone: String(
        userData.phone || ""
      ).trim()
    };

    if (profileSummary) {
      profileSummary.innerHTML =
        `Команда: <b>${
          escapeHtml(
            profile.teamId
              ? profile.teamName
              : "— (нема команди)"
          )
        }</b><br>` +
        `Користувач: <b>${
          escapeHtml(
            profile.fullName ||
            profile.email ||
            "—"
          )
        }</b><br>` +
        `Телефон: <b>${
          escapeHtml(
            profile.phone ||
            "не вказано"
          )
        }</b>`;
    }
  }

  function normalizeDateForCache(value) {
    const date = toDateMaybe(value);

    if (date) {
      return date.toISOString();
    }

    return typeof value === "string"
      ? value
      : null;
  }

  function hydrateItemFromCache(item) {
    return {
      ...item,

      startAt: toDateMaybe(
        item.startAt
      ),

      endAt: toDateMaybe(
        item.endAt
      ),

      regOpenAt:
        item.regOpenAt || null,

      regCloseAt:
        item.regCloseAt || null
    };
  }

  function clearOldCompetitionCaches() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (
          key.startsWith(
            "sc_competitions_cache_"
          ) &&
          key !== COMP_CACHE_KEY
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
  }

  function tryRenderCompetitionsFromCache() {
    try {
      const raw = localStorage.getItem(
        COMP_CACHE_KEY
      );

      if (!raw) return false;

      const object = JSON.parse(raw);

      if (
        !object ||
        !Array.isArray(object.items) ||
        !object.ts
      ) {
        return false;
      }

      const items = visibleItemsOnly(
        object.items.map(
          hydrateItemFromCache
        )
      );

      lastItems = items;

      calcNearestUpcoming(items);
      renderItems(items);
      refreshSubmitState();

      if (eventOptionsEl) {
        const hint =
          document.createElement("div");

        hint.className = "form__hint";
        hint.style.marginTop = "8px";
        hint.textContent =
          "Оновлюю список…";

        eventOptionsEl.appendChild(hint);
      }

      return true;
    } catch {
      return false;
    }
  }

  function saveCompetitionsToCache(items) {
    try {
      const packed = visibleItemsOnly(
        items
      ).map(item => ({
        ...item,

        startAt: item.startAt
          ? item.startAt.toISOString()
          : null,

        endAt: item.endAt
          ? item.endAt.toISOString()
          : null,

        regOpenAt:
          normalizeDateForCache(
            item.regOpenAt
          ),

        regCloseAt:
          normalizeDateForCache(
            item.regCloseAt
          ),

        payEnabled:
          item.payEnabled === true,

        price:
          item.price === 0 ||
          item.price
            ? item.price
            : null,

        currency: String(
          item.currency || "UAH"
        ).toUpperCase(),

        payDetails: String(
          item.payDetails || ""
        ).trim(),

        regMode:
          item.regMode || "auto",

        manualOpen:
          item.manualOpen === true
      }));

      localStorage.setItem(
        COMP_CACHE_KEY,
        JSON.stringify({
          ts: Date.now(),
          items: packed
        })
      );
    } catch {}
  }

  function buildCompetitionItem({
    competition,
    compId,
    event = null,
    eventIndex = 0
  }) {
    const c = competition || {};
    const ev = event || {};

    const brand =
      c.brand || "STOLAR CARP";

    const year =
      c.year || c.seasonYear || "";

    const compTitle =
      c.name ||
      c.title ||
      (year
        ? `Season ${year}`
        : compId);

    const eventKey = event
      ? (
          ev.key ||
          ev.stageId ||
          ev.id ||
          `stage-${eventIndex + 1}`
        )
      : null;

    const isFinal =
      eventKey &&
      (
        String(eventKey)
          .toLowerCase()
          .includes("final") ||
        ev.isFinal === true
      );

    const stageTitle = event
      ? (
          ev.title ||
          ev.name ||
          ev.label ||
          (isFinal
            ? "Фінал"
            : `Етап ${eventIndex + 1}`)
        )
      : null;

    const {
      startAt,
      endAt
    } = getRunDatesFromEvent(ev, c);

    const {
      regOpenAt,
      regCloseAt
    } = getRegDatesFromEvent(ev, c);

    const payment =
      getPaymentData(ev, c);

    return {
      compId,
      brand,
      year,
      compTitle,

      stageKey: eventKey
        ? String(eventKey)
        : null,

      stageTitle,

      entryType:
        entryTypeFromEvent(ev, c),

      startAt:
        toDateMaybe(startAt),

      endAt:
        toDateMaybe(endAt),

      regMode:
        getRegistrationMode(ev, c),

      manualOpen:
        getManualOpenFlag(ev, c),

      regOpenAt,
      regCloseAt,

      payEnabled:
        payment.payEnabled,

      price:
        payment.price,

      currency:
        payment.currency,

      payDetails:
        payment.payDetails,

      format:
        String(
          ev.format ||
          c.format ||
          "classic"
        ).toLowerCase(),

      competitionType:
        String(
          c.type || "season"
        ).toLowerCase()
    };
  }

  async function loadCompetitionsFresh() {
    if (!eventOptionsEl) return;

    try {
      const snapshot = await db
        .collection("competitions")
        .get();

      const items = [];

      snapshot.forEach(docSnap => {
        const competition =
          docSnap.data() || {};

        const compId = docSnap.id;

        const events = Array.isArray(
          competition.events
        )
          ? competition.events
          : [];

        if (events.length) {
          events.forEach(
            (event, index) => {
              items.push(
                buildCompetitionItem({
                  competition,
                  compId,
                  event,
                  eventIndex: index
                })
              );
            }
          );
        } else {
          items.push(
            buildCompetitionItem({
              competition,
              compId
            })
          );
        }
      });

      const visibleItems =
        visibleItemsOnly(items);

      visibleItems.sort((a, b) => {
        const timeA = a.startAt
          ? a.startAt.getTime()
          : Number.MAX_SAFE_INTEGER;

        const timeB = b.startAt
          ? b.startAt.getTime()
          : Number.MAX_SAFE_INTEGER;

        if (timeA !== timeB) {
          return timeA - timeB;
        }

        return String(
          a.compTitle || ""
        ).localeCompare(
          String(b.compTitle || ""),
          "uk"
        );
      });

      lastItems = visibleItems;

      calcNearestUpcoming(
        visibleItems
      );

      renderItems(
        visibleItems
      );

      refreshSubmitState();

      saveCompetitionsToCache(
        visibleItems
      );
    } catch (error) {
      console.error(
        "loadCompetitionsFresh error:",
        error
      );

      if (
        eventOptionsEl &&
        !lastItems.length
      ) {
        eventOptionsEl.innerHTML =
          '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання. Перевірте Firestore Rules та доступ.</p>';
      }

      if (submitBtn) {
        submitBtn.disabled = true;
      }
    }
  }

  function renderItems(items) {
    if (!eventOptionsEl) return;

    eventOptionsEl.innerHTML = "";

    setPayUIFromSelected(null);

    const visibleItems =
      visibleItemsOnly(items);

    if (!visibleItems.length) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Наразі немає відкритих або майбутніх етапів для реєстрації.</p>';

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      return;
    }

    visibleItems.forEach(item => {
      const open =
        isOpenWindow(item);

      const status =
        getStatusUI(item);

      const value =
        `${item.compId}||${item.stageKey || ""}`;

      const lamp =
        statusLamp(item, value);

      const typeBadge =
        item.entryType === "solo"
          ? "SOLO"
          : "TEAM";

      const titleText =
        `${item.brand
          ? item.brand + " · "
          : ""
        }${item.compTitle}` +
        (
          item.stageTitle
            ? ` — ${item.stageTitle}`
            : ""
        );

      const dateLine =
        `${fmtDate(item.startAt)} — ${fmtDate(item.endAt)}`;

      const regOpen =
        toDateMaybe(
          item.regOpenAt,
          { endOfDay: false }
        );

      const regClose =
        toDateMaybe(
          item.regCloseAt,
          { endOfDay: true }
        );

      const registrationDatesLine =
        regOpen || regClose
          ? `Реєстрація: ${fmtDate(regOpen)} — ${fmtDate(regClose)}`
          : "Дати реєстрації не задані";

      const label =
        document.createElement("label");

      label.className =
        "event-item" +
        (open ? "" : " is-closed");

      label.setAttribute(
        "role",
        "button"
      );

      label.style.cursor =
        open ? "pointer" : "default";

      label.innerHTML = `
        <input
          type="radio"
          name="stagePick"
          value="${escapeHtml(value)}"
          ${open ? "" : "disabled"}
          style="flex:0 0 auto;margin-top:4px;"
        >

        <div
          class="event-content"
          style="min-width:0;flex:1;"
        >
          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              margin-bottom:8px;
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                gap:8px;
                min-width:0;
              "
            >
              <span
                class="lamp ${lamp}"
                style="flex:0 0 auto;"
              ></span>

              <span
                style="
                  font-size:12px;
                  color:var(--muted);
                  font-weight:800;
                  white-space:nowrap;
                "
              >
                ${escapeHtml(status.short)}
              </span>
            </div>

            <div
              class="event-badges"
              style="
                display:flex;
                gap:6px;
                flex-wrap:wrap;
                justify-content:flex-end;
                flex:0 0 auto;
              "
            >
              <span class="pill-b">
                ${escapeHtml(typeBadge)}
              </span>

              <span
                class="pill-b ${status.badgeClass}"
              >
                ${escapeHtml(status.badge)}
              </span>
            </div>
          </div>

          <div
            style="
              font-weight:900;
              font-size:16px;
              line-height:1.28;
              letter-spacing:.02em;
              color:#f3f4f6;
              white-space:normal;
              overflow-wrap:break-word;
            "
          >
            ${escapeHtml(titleText)}
          </div>

          <div
            style="
              margin-top:7px;
              color:var(--muted);
              font-size:13px;
              line-height:1.35;
            "
          >
            ${escapeHtml(dateLine)}
          </div>

          <div
            style="
              margin-top:5px;
              color:var(--muted);
              font-size:12px;
              line-height:1.35;
            "
          >
            ${escapeHtml(registrationDatesLine)}
          </div>

          <div
            style="
              margin-top:7px;
              color:var(--muted);
              font-size:13px;
              line-height:1.35;
            "
          >
            ${escapeHtml(status.text)}
          </div>
        </div>
      `;

      eventOptionsEl.appendChild(label);
    });
  }

  document.addEventListener(
    "change",
    event => {
      const target = event.target;

      if (!target) return;

      if (target.name === "stagePick") {
        const picked =
          document.querySelector(
            'input[name="stagePick"]:checked'
          );

        const selectedValue = picked
          ? String(picked.value)
          : "";

        const selectedItem =
          selectedValue
            ? lastItems.find(
                item =>
                  `${item.compId}||${item.stageKey || ""}` ===
                  selectedValue
              )
            : null;

        setPayUIFromSelected(
          selectedItem || null
        );

        if (selectedItem) {
          const state =
            getRegistrationState(
              selectedItem
            );

          if (state === "pending") {
            setMsg(
              "Реєстрація на це змагання ще не розпочалася.",
              false
            );
          } else if (state === "closed") {
            setMsg(
              "Реєстрація на це змагання вже завершена.",
              false
            );
          } else if (state === "unavailable") {
            setMsg(
              "Дати реєстрації для цього змагання не налаштовані.",
              false
            );
          } else {
            setMsg("");
          }
        }
      }

      if (
        target.name === "stagePick" ||
        target.id === "rules"
      ) {
        refreshSubmitState();
      }
    }
  );

  if (eventOptionsEl) {
    eventOptionsEl.innerHTML =
      '<p class="form__hint">Завантаження списку...</p>';
  }

  clearOldCompetitionCaches();
  tryRenderCompetitionsFromCache();

  setTimeout(() => {
    loadCompetitionsFresh();
  }, 50);

  auth.onAuthStateChanged(
    async user => {
      currentUser = user || null;

      setMsg("");
      refreshSubmitState();

      if (!user) {
        if (submitBtn) {
          submitBtn.disabled = true;
        }

        if (profileSummary) {
          profileSummary.textContent =
            "Ви не залогінені. Зайдіть у «Мій кабінет» і поверніться сюди.";
        }

        setMsg(
          "Увійдіть у акаунт, щоб подати заявку.",
          false
        );

        return;
      }

      try {
        await loadProfile(user);
        refreshSubmitState();
      } catch (error) {
        console.error(error);

        if (submitBtn) {
          submitBtn.disabled = true;
        }

        setMsg(
          error.message ||
          "Помилка профілю.",
          false
        );
      }
    }
  );

  function buildRegDocId({
    competitionId,
    stageId,
    entryType
  }) {
    const stage =
      stageId || "main";

    if (entryType === "solo") {
      return (
        `${competitionId}__` +
        `${stage}__solo__` +
        `${profile.uid}`
      );
    }

    return (
      `${competitionId}__` +
      `${stage}__team__` +
      `${profile.teamId}`
    );
  }

  function buildPublicPayload({
    uid,
    competitionId,
    stageId,
    entryType,
    teamId,
    teamName,
    status
  }) {
    return {
      uid: uid || null,
      competitionId,
      stageId: stageId || null,
      entryType: entryType || "team",
      teamId: teamId || null,
      teamName: teamName || null,
      status: status || "pending_payment",
      createdAt:
        fb.firestore.FieldValue.serverTimestamp()
    };
  }

  if (form) {
    form.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        if (hpInput && hpInput.value) {
          setMsg(
            "Підозра на бота. Заявка не відправлена.",
            false
          );

          return;
        }

        if (!currentUser || !profile) {
          setMsg(
            "Увійдіть у акаунт.",
            false
          );

          return;
        }

        const picked =
          document.querySelector(
            'input[name="stagePick"]:checked'
          );

        if (!picked) {
          setMsg(
            "Оберіть змагання або етап.",
            false
          );

          return;
        }

        const selectedValue =
          String(picked.value);

        const selectedItem =
          lastItems.find(
            item =>
              `${item.compId}||${item.stageKey || ""}` ===
              selectedValue
          );

        if (
          !selectedItem ||
          isFinishedEvent(selectedItem) ||
          !isOpenWindow(selectedItem)
        ) {
          setMsg(
            "Це змагання зараз недоступне для реєстрації.",
            false
          );

          return;
        }

        if (
          rulesChk &&
          !rulesChk.checked
        ) {
          setMsg(
            "Підтвердіть ознайомлення з регламентом.",
            false
          );

          return;
        }

        const [
          competitionId,
          stageKeyRaw
        ] = selectedValue.split("||");

        const stageId =
          String(stageKeyRaw || "").trim() ||
          null;

        const entryType =
          selectedItem.entryType || "team";

        if (entryType === "team") {
          if (!profile.teamId) {
            setMsg(
              "Це командне змагання. Спочатку приєднайтесь до команди в «Мій кабінет».",
              false
            );

            return;
          }

          if (!profile.teamName) {
            setMsg(
              "Не знайдено назву команди. Перевірте teams/{teamId}.name.",
              false
            );

            return;
          }
        }

        const participantName =
          String(
            profile.fullName ||
            profile.captain ||
            profile.email ||
            ""
          ).trim();

        const payment = {
          payEnabled:
            selectedItem.payEnabled === true,

          price:
            normalizeMoney(
              selectedItem.price
            ),

          currency:
            String(
              selectedItem.currency ||
              "UAH"
            ).toUpperCase(),

          payDetails:
            String(
              selectedItem.payDetails ||
              ""
            ).trim()
        };

        /*
         * Без оплати заявка одразу підтверджена.
         * З оплатою — очікує підтвердження.
         */
        const status =
          payment.payEnabled
            ? "pending_payment"
            : "confirmed";

        const docId =
          buildRegDocId({
            competitionId,
            stageId,
            entryType
          });

        const registrationRef =
          db.collection("registrations")
            .doc(docId);

        const payload = {
          uid: profile.uid,
          competitionId,
          stageId: stageId || null,
          entryType,

          teamId:
            entryType === "team"
              ? profile.teamId
              : null,

          teamName:
            entryType === "team"
              ? profile.teamName
              : null,

          participantName:
            entryType === "solo"
              ? participantName
              : null,

          captain:
            entryType === "team"
              ? profile.captain
              : participantName,

          phone:
            profile.phone || "",

          payEnabled:
            payment.payEnabled,

          price:
            payment.price,

          currency:
            payment.currency,

          payDetails:
            payment.payDetails,

          status,

          createdAt:
            fb.firestore.FieldValue.serverTimestamp(),

          confirmedAt:
            status === "confirmed"
              ? fb.firestore.FieldValue.serverTimestamp()
              : null
        };

        try {
          setLoading(true);
          setMsg("");

          await registrationRef.set(
            payload,
            { merge: false }
          );

          try {
            const publicRef =
              db.collection(
                "public_participants"
              ).doc(docId);

            const publicPayload =
              buildPublicPayload({
                uid: profile.uid,
                competitionId,
                stageId,
                entryType,

                teamId:
                  entryType === "team"
                    ? profile.teamId
                    : null,

                teamName:
                  entryType === "team"
                    ? profile.teamName
                    : null,

                status
              });

            await publicRef.set(
              publicPayload,
              { merge: false }
            );
          } catch (mirrorError) {
            console.warn(
              "public_participants write failed:",
              mirrorError
            );
          }

          setMsg(
            payment.payEnabled
              ? "Заявка подана ✔ Підтвердження буде після перевірки оплати."
              : "Заявка подана і підтверджена ✔",
            true
          );

          form.reset();
          setPayUIFromSelected(null);
          refreshSubmitState();
        } catch (error) {
          console.error(
            "submit error:",
            error
          );

          const code = String(
            error?.code || ""
          ).toLowerCase();

          if (
            code.includes("permission")
          ) {
            setMsg(
              "Заявка вже існує або дані команди не збігаються з профілем. Перевірте «Мій кабінет».",
              false
            );
          } else {
            setMsg(
              `Помилка відправки заявки. (${error?.code || "no-code"})`,
              false
            );
          }
        } finally {
          setLoading(false);
        }
      }
    );
  }
})();
