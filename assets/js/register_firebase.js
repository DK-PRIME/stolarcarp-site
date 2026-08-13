// assets/js/register_firebase.js
// STOLAR CARP • Registration
//
// =========================================================
// ЗВИЧАЙНІ ЕТАПИ
// =========================================================
//
// ✅ stage-1 / stage-2 / stage-3 / ... працюють як раніше
// ✅ Manual registration dates
// ✅ registration.openDate / registration.closeDate
// ✅ regOpen / regClose та legacy aliases
// ✅ Opening date = 00:00
// ✅ Closing date = 23:59:59
// ✅ Pending / Open / Closed
// ✅ Finished stages hidden
// ✅ Payment UI
// ✅ Season + one-off competitions
//
// =========================================================
// ФІНАЛ
// =========================================================
//
// ФІНАЛ працює ІНАКШЕ.
//
// Для final:
// • реєстрація тільки за finalInvites;
// • стороння команда не може зареєструватися;
// • invited   -> можна подати заявку;
// • reserve   -> очікує своєї черги;
// • declined  -> доступ закритий;
// • confirmed -> участь уже підтверджена;
// • якщо invite немає -> доступу немає.
//
// finalInvites ID:
//
// {competitionId}__{stageId}__{teamId}
//
// Наприклад:
//
// season-2026__final__TEAM_ID
//
// Документ:
//
// {
//   competitionId: "...",
//   stageId: "final",
//   teamId: "...",
//   teamName: "...",
//   rank: 1,
//   status: "invited"
// }
//
// status:
// invited | reserve | declined | confirmed
//
// =========================================================

(function () {
  "use strict";

  // =========================================================
  // FIREBASE
  // =========================================================

  const auth =
    window.scAuth;

  const db =
    window.scDb;

  const fb =
    window.firebase;

  // =========================================================
  // DOM
  // =========================================================

  const form =
    document.getElementById(
      "regForm"
    );

  const eventOptionsEl =
    document.getElementById(
      "eventOptions"
    );

  const msgEl =
    document.getElementById(
      "msg"
    );

  const submitBtn =
    document.getElementById(
      "submitBtn"
    );

  const spinnerEl =
    document.getElementById(
      "spinner"
    );

  const hpInput =
    document.getElementById(
      "hp"
    );

  const profileSummary =
    document.getElementById(
      "profileSummary"
    );

  const rulesChk =
    document.getElementById(
      "rules"
    );

  const copyPayBtn =
    document.getElementById(
      "copyCard"
    );

  const payBoxEl =
    document.getElementById(
      "cardNum"
    );

  const payAmountEl =
    document.getElementById(
      "payAmount"
    );

  const payCurrEl =
    document.getElementById(
      "payCurrency"
    );

  const payDetailsEl =
    document.getElementById(
      "payDetails"
    );

  // =========================================================
  // FIREBASE CHECK
  // =========================================================

  if (
    !auth ||
    !db ||
    !fb
  ) {

    if (eventOptionsEl) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    }

    if (submitBtn) {
      submitBtn.disabled =
        true;
    }

    return;
  }

  // =========================================================
  // SETTINGS
  // =========================================================

  /*
   * Новий cache key.
   *
   * Старий кеш не використовуємо,
   * щоб фінал не підтягнувся
   * зі старої логіки.
   */
  const COMP_CACHE_KEY =
    "sc_competitions_cache_v7_final_invites";

  const TEAM_CACHE_PREFIX =
    "sc_team_cache_";

  const TEAM_CACHE_TTL_MS =
    24 * 60 * 60 * 1000;

  const FINISHED_HIDE_GRACE_MS =
    24 * 60 * 60 * 1000;

  const FINAL_INVITES_COLLECTION =
    "finalInvites";

  // =========================================================
  // STATE
  // =========================================================

  let currentUser =
    null;

  let profile =
    null;

  let lastItems =
    [];

  let nearestUpcomingValue =
    null;

  let activePayCopyText =
    "";

  /*
   * key:
   *
   * competitionId||stageId
   *
   * value:
   *
   * {
   *   inviteExists,
   *   inviteStatus,
   *   rank,
   *   registrationExists,
   *   registrationStatus
   * }
   */
  const finalAccessByEvent =
    new Map();

  /*
   * Захист від race-condition,
   * коли auth / competitions
   * завантажуються одночасно.
   */
  let finalAccessRequestId =
    0;

  // =========================================================
  // HELPERS
  // =========================================================

  function escapeHtml(
    value
  ) {
    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#39;"
      );
  }

  function firstDefined(
    ...values
  ) {
    for (
      const value of values
    ) {

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

  function normalize(
    value
  ) {
    return String(
      value ?? ""
    )
      .trim();
  }

  function normalizeLower(
    value
  ) {
    return normalize(
      value
    ).toLowerCase();
  }

  function setMsg(
    text,
    ok = true
  ) {
    if (!msgEl) {
      return;
    }

    msgEl.textContent =
      text || "";

    msgEl.classList.remove(
      "ok",
      "err"
    );

    if (text) {
      msgEl.classList.add(
        ok
          ? "ok"
          : "err"
      );
    }
  }

  function setLoading(
    value
  ) {
    if (spinnerEl) {

      spinnerEl.classList.toggle(
        "spinner--on",
        Boolean(value)
      );
    }

    refreshSubmitState();
  }

  function fmtDate(
    date
  ) {
    if (!date) {
      return "—";
    }

    return date.toLocaleDateString(
      "uk-UA",
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric"
      }
    );
  }

  function normalizeMoney(
    value
  ) {
    if (value === 0) {
      return 0;
    }

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const number =
      Number(
        String(value)
          .trim()
          .replace(
            ",",
            "."
          )
      );

    return Number.isFinite(
      number
    )
      ? number
      : null;
  }

  // =========================================================
  // DATES
  // =========================================================

  function parseDateYMDLocal(
    value,
    endOfDay = false
  ) {
    const match =
      String(
        value || ""
      )
        .trim()
        .match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!match) {
      return null;
    }

    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      );

    const day =
      Number(
        match[3]
      );

    if (
      !year ||
      !month ||
      !day
    ) {
      return null;
    }

    const date =
      endOfDay
        ? new Date(
            year,
            month - 1,
            day,
            23,
            59,
            59,
            999
          )
        : new Date(
            year,
            month - 1,
            day,
            0,
            0,
            0,
            0
          );

    return Number.isFinite(
      date.getTime()
    )
      ? date
      : null;
  }

  function toDateMaybe(
    value,
    options = {}
  ) {
    if (!value) {
      return null;
    }

    const endOfDay =
      options.endOfDay ===
      true;

    try {

      if (
        value instanceof
        Date
      ) {
        return Number.isFinite(
          value.getTime()
        )
          ? value
          : null;
      }

      if (
        typeof value ===
        "string"
      ) {

        const raw =
          value.trim();

        const dateOnly =
          parseDateYMDLocal(
            raw,
            endOfDay
          );

        if (dateOnly) {
          return dateOnly;
        }

        const parsed =
          new Date(
            raw
          );

        return Number.isFinite(
          parsed.getTime()
        )
          ? parsed
          : null;
      }

      if (
        value &&
        typeof value.toDate ===
        "function"
      ) {

        const parsed =
          value.toDate();

        return Number.isFinite(
          parsed.getTime()
        )
          ? parsed
          : null;
      }

      if (
        value &&
        typeof value.seconds ===
        "number"
      ) {

        const parsed =
          new Date(
            value.seconds *
            1000
          );

        return Number.isFinite(
          parsed.getTime()
        )
          ? parsed
          : null;
      }

      if (
        typeof value ===
        "number"
      ) {

        const parsed =
          new Date(
            value
          );

        return Number.isFinite(
          parsed.getTime()
        )
          ? parsed
          : null;
      }

    } catch (
      error
    ) {

      console.warn(
        "[Registration] toDateMaybe:",
        error
      );
    }

    return null;
  }

  function nowLocal() {
    return new Date();
  }

  // =========================================================
  // COMPETITION DATES
  // =========================================================

  function getRunDatesFromEvent(
    event,
    competition
  ) {
    const eventSchedule =
      event?.schedule || {};

    const compSchedule =
      competition?.schedule || {};

    const startAt =
      firstDefined(

        event?.startAt,
        event?.startDate,

        eventSchedule.startAt,
        eventSchedule.startDate,

        competition?.startAt,
        competition?.startDate,

        compSchedule.startAt,
        compSchedule.startDate
      );

    const endAt =
      firstDefined(

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

  function getRegDatesFromEvent(
    event,
    competition
  ) {
    const eventRegistration =
      event?.registration || {};

    const compRegistration =
      competition?.registration || {};

    const regOpenAt =
      firstDefined(

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

    const regCloseAt =
      firstDefined(

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

  function getRegistrationMode(
    event,
    competition
  ) {
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

  function getManualOpenFlag(
    event,
    competition
  ) {
    const value =
      firstDefined(

        event?.manualOpen,
        event?.registration?.manualOpen,

        competition?.manualOpen,
        competition?.registration?.manualOpen,

        false
      );

    return value === true;
  }

  // =========================================================
  // PAYMENT
  // =========================================================

  function getPaymentData(
    event,
    competition
  ) {
    const eventPayment =
      event?.payment || {};

    const compPayment =
      competition?.payment || {};

    const enabledRaw =
      firstDefined(

        eventPayment.enabled,
        event?.payEnabled,
        event?.paymentEnabled,

        compPayment.enabled,
        competition?.payEnabled,
        competition?.paymentEnabled,

        false
      );

    const priceRaw =
      firstDefined(

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

    const currency =
      String(
        firstDefined(

          eventPayment.currency,
          event?.currency,
          event?.paymentCurrency,

          compPayment.currency,
          competition?.currency,
          competition?.paymentCurrency,

          "UAH"
        )
      )
        .trim()
        .toUpperCase();

    const details =
      String(
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
      )
        .trim();

    return {
      payEnabled:
        enabledRaw === true,

      price:
        normalizeMoney(
          priceRaw
        ),

      currency,

      payDetails:
        details
    };
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function entryTypeFromEvent(
    event,
    competition
  ) {
    const type =
      String(
        firstDefined(

          event?.entryType,
          competition?.entryType,

          "team"
        )
      )
        .toLowerCase();

    return type ===
      "solo"
        ? "solo"
        : "team";
  }

  // =========================================================
  // FINAL DETECTOR
  // =========================================================

  function isFinalEvent(
    eventKey,
    event
  ) {
    const rawKey =
      normalizeLower(
        eventKey
      );

    const rawText =
      normalizeLower(
        `${
          event?.key || ""
        } ${
          event?.stageId || ""
        } ${
          event?.id || ""
        } ${
          event?.title || ""
        } ${
          event?.name || ""
        } ${
          event?.label || ""
        }`
      );

    return (
      event?.isFinal === true ||
      rawKey === "final" ||
      rawKey.includes(
        "final"
      ) ||
      rawKey.includes(
        "фінал"
      ) ||
      rawText.includes(
        "final"
      ) ||
      rawText.includes(
        "фінал"
      )
    );
  }

  // =========================================================
  // EVENT STATE
  // =========================================================

  function isFinishedEvent(
    item
  ) {
    const endAt =
      toDateMaybe(
        item?.endAt
      );

    if (!endAt) {
      return false;
    }

    return (
      nowLocal()
        .getTime() >
      endAt.getTime() +
        FINISHED_HIDE_GRACE_MS
    );
  }

  function visibleItemsOnly(
    items
  ) {
    return (
      items || []
    ).filter(
      item =>
        !isFinishedEvent(
          item
        )
    );
  }

  function getRegistrationState(
    item
  ) {
    if (!item) {
      return "unavailable";
    }

    if (
      isFinishedEvent(
        item
      )
    ) {
      return "closed";
    }

    const now =
      nowLocal();

    const mode =
      String(
        item.regMode ||
        "auto"
      ).toLowerCase();

    const openAt =
      toDateMaybe(
        item.regOpenAt,
        {
          endOfDay:
            false
        }
      );

    const closeAt =
      toDateMaybe(
        item.regCloseAt,
        {
          endOfDay:
            true
        }
      );

    /*
     * Обидві дати.
     */
    if (
      openAt &&
      closeAt
    ) {

      if (
        now <
        openAt
      ) {
        return "pending";
      }

      if (
        now >
        closeAt
      ) {
        return "closed";
      }

      return "open";
    }

    /*
     * Тільки open.
     */
    if (
      openAt &&
      !closeAt
    ) {

      return now >=
        openAt
          ? "open"
          : "pending";
    }

    /*
     * Тільки close.
     */
    if (
      !openAt &&
      closeAt
    ) {

      return now <=
        closeAt
          ? "open"
          : "closed";
    }

    /*
     * Legacy manual.
     */
    if (
      mode ===
        "manual" &&
      item.manualOpen ===
        true
    ) {
      return "open";
    }

    return "unavailable";
  }

  function isOpenWindow(
    item
  ) {
    return (
      getRegistrationState(
        item
      ) === "open"
    );
  }

  // =========================================================
  // EVENT KEY
  // =========================================================

  function eventValue(
    item
  ) {
    return (
      `${item?.compId || ""}||` +
      `${item?.stageKey || ""}`
    );
  }

  // =========================================================
  // REGISTRATION DOC ID
  // =========================================================

  function buildRegDocId({
    competitionId,
    stageId,
    entryType,
    uid,
    teamId
  }) {
    const stage =
      stageId ||
      "main";

    if (
      entryType ===
      "solo"
    ) {
      return (
        `${competitionId}__` +
        `${stage}__solo__` +
        `${uid || ""}`
      );
    }

    return (
      `${competitionId}__` +
      `${stage}__team__` +
      `${teamId || ""}`
    );
  }

  // =========================================================
  // FINAL INVITE ID
  // =========================================================

  function buildFinalInviteId(
    competitionId,
    stageId,
    teamId
  ) {
    return (
      `${competitionId}__` +
      `${stageId || "final"}__` +
      `${teamId}`
    );
  }

  // =========================================================
  // FINAL ACCESS
  // =========================================================

  function emptyFinalAccess(
    status = "not_invited"
  ) {
    return {
      inviteExists:
        false,

      inviteStatus:
        status,

      rank:
        0,

      registrationExists:
        false,

      registrationStatus:
        "",

      registrationId:
        ""
    };
  }

  function getFinalAccess(
    item
  ) {
    if (
      !item?.isFinal
    ) {
      return null;
    }

    return (
      finalAccessByEvent.get(
        eventValue(item)
      ) ||
      emptyFinalAccess()
    );
  }

  async function loadFinalAccess(
    items = lastItems
  ) {
    const requestId =
      ++finalAccessRequestId;

    const finalItems =
      (
        items || []
      ).filter(
        item =>
          item.isFinal ===
          true
      );

    /*
     * Видаляємо старі дані.
     */
    finalAccessByEvent.clear();

    if (
      !finalItems.length
    ) {
      return;
    }

    /*
     * Користувач ще не увійшов.
     */
    if (
      !currentUser ||
      !profile
    ) {

      finalItems.forEach(
        item => {

          finalAccessByEvent.set(
            eventValue(item),
            emptyFinalAccess(
              "login_required"
            )
          );
        }
      );

      return;
    }

    /*
     * Фінал командний.
     * Без teamId право участі неможливо визначити.
     */
    if (
      !profile.teamId
    ) {

      finalItems.forEach(
        item => {

          finalAccessByEvent.set(
            eventValue(item),
            emptyFinalAccess(
              "no_team"
            )
          );
        }
      );

      return;
    }

    await Promise.all(
      finalItems.map(
        async item => {

          const competitionId =
            item.compId;

          const stageId =
            item.stageKey ||
            "final";

          const teamId =
            profile.teamId;

          const inviteId =
            buildFinalInviteId(
              competitionId,
              stageId,
              teamId
            );

          const registrationId =
            buildRegDocId({
              competitionId,
              stageId,
              entryType:
                "team",
              uid:
                profile.uid,
              teamId
            });

          try {

            const [
              inviteSnap,
              registrationSnap
            ] =
              await Promise.all([

                db
                  .collection(
                    FINAL_INVITES_COLLECTION
                  )
                  .doc(
                    inviteId
                  )
                  .get(),

                db
                  .collection(
                    "registrations"
                  )
                  .doc(
                    registrationId
                  )
                  .get()
              ]);

            /*
             * Якщо за цей час прийшов
             * новіший запит — старий результат
             * ігноруємо.
             */
            if (
              requestId !==
              finalAccessRequestId
            ) {
              return;
            }

            const inviteData =
              inviteSnap.exists
                ? (
                    inviteSnap.data() ||
                    {}
                  )
                : {};

            const regData =
              registrationSnap.exists
                ? (
                    registrationSnap.data() ||
                    {}
                  )
                : {};

            finalAccessByEvent.set(
              eventValue(item),
              {
                inviteExists:
                  inviteSnap.exists,

                inviteStatus:
                  inviteSnap.exists
                    ? normalizeLower(
                        inviteData.status ||
                        "invited"
                      )
                    : "not_invited",

                rank:
                  Number(
                    inviteData.rank ||
                    inviteData.place ||
                    0
                  ),

                registrationExists:
                  registrationSnap.exists,

                registrationStatus:
                  registrationSnap.exists
                    ? normalizeLower(
                        regData.status
                      )
                    : "",

                registrationId,

                inviteId
              }
            );

          } catch (
            error
          ) {

            console.warn(
              "[Registration] final access:",
              item.compId,
              item.stageKey,
              error
            );

            finalAccessByEvent.set(
              eventValue(item),
              emptyFinalAccess(
                "error"
              )
            );
          }
        }
      )
    );
  }

  // =========================================================
  // FINAL ACCESS LOGIC
  // =========================================================

  function canRegisterFinal(
    item
  ) {
    if (
      !item?.isFinal
    ) {
      return true;
    }

    const access =
      getFinalAccess(
        item
      );

    if (!access) {
      return false;
    }

    /*
     * Якщо заявка вже існує,
     * повторно подавати не можна.
     */
    if (
      access.registrationExists
    ) {
      return false;
    }

    /*
     * Тільки invited.
     *
     * reserve / declined /
     * confirmed / not_invited —
     * реєстрацію блокують.
     */
    return (
      access.inviteExists ===
        true &&
      access.inviteStatus ===
        "invited"
    );
  }

  function canSubmitItem(
    item
  ) {
    if (!item) {
      return false;
    }

    if (
      isFinishedEvent(
        item
      )
    ) {
      return false;
    }

    if (
      !isOpenWindow(
        item
      )
    ) {
      return false;
    }

    if (
      item.isFinal &&
      !canRegisterFinal(
        item
      )
    ) {
      return false;
    }

    return true;
  }

  // =========================================================
  // PAYMENT UI
  // =========================================================

  function formatCardLikeText(
    text
  ) {
    const raw =
      String(
        text || ""
      ).trim();

    if (
      /^\d{16}$/.test(
        raw
      )
    ) {
      return raw.replace(
        /(\d{4})(?=\d)/g,
        "$1 "
      );
    }

    return raw;
  }

  function setPayUIFromSelected(
    item
  ) {
    const hasAnyUI =
      Boolean(
        payBoxEl ||
        payAmountEl ||
        payDetailsEl
      );

    if (!hasAnyUI) {
      return;
    }

    if (!item) {

      activePayCopyText =
        "";

      if (payAmountEl) {
        payAmountEl.textContent =
          "—";
      }

      if (payCurrEl) {
        payCurrEl.textContent =
          "UAH";
      }

      if (payDetailsEl) {
        payDetailsEl.textContent =
          "—";
      }

      if (payBoxEl) {
        payBoxEl.textContent =
          "—";
      }

      return;
    }

    const payEnabled =
      item.payEnabled ===
      true;

    const price =
      normalizeMoney(
        item.price
      );

    const currency =
      String(
        item.currency ||
        "UAH"
      )
        .toUpperCase();

    const details =
      String(
        item.payDetails ||
        ""
      ).trim();

    if (!payEnabled) {

      activePayCopyText =
        "Оплата не потрібна для цього етапу.";

      if (payAmountEl) {
        payAmountEl.textContent =
          "0";
      }

      if (payCurrEl) {
        payCurrEl.textContent =
          currency;
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
        : String(
            price
          );

    const detailsText =
      details ||
      "Реквізити не задані адміністратором.";

    activePayCopyText =
      detailsText;

    if (payAmountEl) {
      payAmountEl.textContent =
        amountText;
    }

    if (payCurrEl) {
      payCurrEl.textContent =
        currency;
    }

    if (payDetailsEl) {
      payDetailsEl.textContent =
        detailsText;
    }

    if (payBoxEl) {
      payBoxEl.textContent =
        formatCardLikeText(
          detailsText
        );
    }
  }

  if (copyPayBtn) {

    copyPayBtn.addEventListener(
      "click",
      async () => {

        const text =
          String(
            activePayCopyText ||
            ""
          ).trim();

        if (!text) {
          alert(
            "Нема що копіювати."
          );

          return;
        }

        try {

          await navigator
            .clipboard
            .writeText(
              text
            );

          const previousText =
            copyPayBtn.textContent;

          copyPayBtn.textContent =
            "Скопійовано ✔";

          setTimeout(
            () => {

              copyPayBtn.textContent =
                previousText ||
                "Скопіювати реквізити";
            },
            1200
          );

        } catch {

          alert(
            "Не вдалося скопіювати. Скопіюйте вручну."
          );
        }
      }
    );
  }

  // =========================================================
  // UPCOMING
  // =========================================================

  function calcNearestUpcoming(
    items
  ) {
    let best =
      null;

    const now =
      nowLocal();

    visibleItemsOnly(
      items
    ).forEach(
      item => {

        const openAt =
          toDateMaybe(
            item.regOpenAt,
            {
              endOfDay:
                false
            }
          );

        if (
          !openAt ||
          openAt <= now
        ) {
          return;
        }

        const value =
          eventValue(
            item
          );

        if (
          !best ||
          openAt <
            best.openAt
        ) {
          best = {
            value,
            openAt
          };
        }
      }
    );

    nearestUpcomingValue =
      best
        ? best.value
        : null;
  }

  // =========================================================
  // STATUS UI
  // =========================================================

  function statusLamp(
    item,
    value
  ) {
    /*
     * Фінал має власний статус.
     */
    if (
      item?.isFinal
    ) {

      const access =
        getFinalAccess(
          item
        );

      if (
        access?.registrationExists
      ) {
        return "lamp-green";
      }

      if (
        access?.inviteStatus ===
        "invited"
      ) {
        return isOpenWindow(
          item
        )
          ? "lamp-green"
          : "lamp-yellow";
      }

      if (
        access?.inviteStatus ===
        "reserve"
      ) {
        return "lamp-yellow";
      }

      return "lamp-red";
    }

    const state =
      getRegistrationState(
        item
      );

    if (
      state ===
      "open"
    ) {
      return "lamp-green";
    }

    if (
      state ===
        "pending" &&
      nearestUpcomingValue &&
      value ===
        nearestUpcomingValue
    ) {
      return "lamp-yellow";
    }

    return "lamp-red";
  }

  function getNormalStatusUI(
    item
  ) {
    const state =
      getRegistrationState(
        item
      );

    if (
      state ===
      "open"
    ) {
      return {
        state,
        short:
          "Відкрито",

        badge:
          "ВІДКРИТО",

        text:
          "Реєстрація відкрита ✅",

        badgeClass:
          "pill-b--open"
      };
    }

    if (
      state ===
      "pending"
    ) {
      return {
        state,
        short:
          "Очікується",

        badge:
          "ОЧІКУЄТЬСЯ",

        text:
          "Реєстрація ще не розпочалася.",

        badgeClass:
          "pill-b--closed"
      };
    }

    if (
      state ===
      "closed"
    ) {
      return {
        state,
        short:
          "Закрито",

        badge:
          "ЗАКРИТО",

        text:
          "Реєстрація завершена.",

        badgeClass:
          "pill-b--closed"
      };
    }

    return {
      state,
      short:
        "Недоступно",

      badge:
        "НЕДОСТУПНО",

      text:
        "Дати реєстрації не налаштовані.",

      badgeClass:
        "pill-b--closed"
    };
  }

  function getFinalStatusUI(
    item
  ) {
    const access =
      getFinalAccess(
        item
      );

    const normalState =
      getRegistrationState(
        item
      );

    /*
     * Ще не увійшов.
     */
    if (
      access?.inviteStatus ===
      "login_required"
    ) {
      return {
        state:
          "final-login",

        short:
          "Фінал",

        badge:
          "ЗА ЗАПРОШЕННЯМ",

        text:
          "Увійдіть у акаунт, щоб перевірити право участі у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * Немає команди.
     */
    if (
      access?.inviteStatus ===
      "no_team"
    ) {
      return {
        state:
          "final-no-team",

        short:
          "Фінал",

        badge:
          "НЕМА КОМАНДИ",

        text:
          "Фінал доступний тільки команді, яка отримала право участі.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * Уже є registrations.
     */
    if (
      access?.registrationExists
    ) {

      const status =
        access.registrationStatus;

      if (
        status ===
        "confirmed"
      ) {
        return {
          state:
            "final-confirmed",

          short:
            "Підтверджено",

          badge:
            "ПІДТВЕРДЖЕНО",

          text:
            "Участь вашої команди у фіналі вже підтверджена ✅",

          badgeClass:
            "pill-b--open"
        };
      }

      if (
        status ===
        "pending_payment"
      ) {
        return {
          state:
            "final-pending-payment",

          short:
            "Заявка подана",

          badge:
            "ОЧІКУЄ ОПЛАТУ",

          text:
            "Заявка на фінал уже подана. Очікується підтвердження оплати.",

          badgeClass:
            "pill-b--closed"
        };
      }

      if (
        status ===
        "cancelled"
      ) {
        return {
          state:
            "final-cancelled",

          short:
            "Скасовано",

          badge:
            "СКАСОВАНО",

          text:
            "Заявку на фінал скасовано.",

          badgeClass:
            "pill-b--closed"
        };
      }

      return {
        state:
          "final-existing",

        short:
          "Заявка подана",

        badge:
          "ЗАЯВКА Є",

        text:
          "Заявка на фінал уже існує.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * TOP-18 або піднятий резерв.
     */
    if (
      access?.inviteStatus ===
      "invited"
    ) {

      const rankText =
        access.rank > 0
          ? ` Ваше місце у рейтингу — №${access.rank}.`
          : "";

      if (
        normalState ===
        "pending"
      ) {
        return {
          state:
            "final-invited-pending",

          short:
            "Запрошено",

          badge:
            "ФІНАЛІСТ",

          text:
            `Ваша команда отримала право участі у фіналі.${rankText} Реєстрація ще не розпочалася.`,

          badgeClass:
            "pill-b--closed"
        };
      }

      if (
        normalState ===
        "closed"
      ) {
        return {
          state:
            "final-invited-closed",

          short:
            "Закрито",

          badge:
            "ФІНАЛІСТ",

          text:
            `Ваша команда отримала право участі у фіналі.${rankText} Термін реєстрації завершений.`,

          badgeClass:
            "pill-b--closed"
        };
      }

      if (
        normalState ===
        "open"
      ) {
        return {
          state:
            "final-invited-open",

          short:
            "Запрошено",

          badge:
            "ФІНАЛІСТ",

          text:
            `Ваша команда отримала право участі у фіналі.${rankText} Можна подавати заявку ✅`,

          badgeClass:
            "pill-b--open"
        };
      }

      return {
        state:
          "final-invited-unavailable",

        short:
          "Запрошено",

        badge:
          "ФІНАЛІСТ",

        text:
          `Ваша команда отримала право участі у фіналі.${rankText} Дати реєстрації ще не налаштовані.`,

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * Резерв.
     */
    if (
      access?.inviteStatus ===
      "reserve"
    ) {
      return {
        state:
          "final-reserve",

        short:
          "Резерв",

        badge:
          access.rank > 0
            ? `РЕЗЕРВ №${access.rank}`
            : "РЕЗЕРВ",

        text:
          access.rank > 0
            ? `Ваша команда зараз №${access.rank} у загальному рейтингу. Очікуйте запрошення, якщо звільниться місце у TOP-18.`
            : "Ваша команда перебуває у резерві. Очікуйте звільнення місця у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * Відмова.
     */
    if (
      access?.inviteStatus ===
      "declined"
    ) {
      return {
        state:
          "final-declined",

        short:
          "Відмова",

        badge:
          "ВІДМОВА",

        text:
          "Ваша команда відмовилася від участі у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * invite confirmed,
     * навіть якщо registrations
     * ще не прочитався.
     */
    if (
      access?.inviteStatus ===
      "confirmed"
    ) {
      return {
        state:
          "final-confirmed",

        short:
          "Підтверджено",

        badge:
          "ПІДТВЕРДЖЕНО",

        text:
          "Участь вашої команди у фіналі вже підтверджена ✅",

        badgeClass:
          "pill-b--open"
      };
    }

    /*
     * Помилка читання finalInvites.
     */
    if (
      access?.inviteStatus ===
      "error"
    ) {
      return {
        state:
          "final-error",

        short:
          "Помилка",

        badge:
          "ПЕРЕВІРКА",

        text:
          "Не вдалося перевірити право участі у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

    /*
     * Команда не входить ні у TOP-18,
     * ні в активний резерв.
     */
    return {
      state:
        "final-not-invited",

      short:
        "Фінал",

      badge:
        "ЗА ЗАПРОШЕННЯМ",

      text:
        "Реєстрація у фінал доступна тільки командам, які отримали запрошення за рейтингом.",

      badgeClass:
        "pill-b--closed"
    };
  }

  function getStatusUI(
    item
  ) {
    if (
      item?.isFinal
    ) {
      return getFinalStatusUI(
        item
      );
    }

    return getNormalStatusUI(
      item
    );
  }

  // =========================================================
  // SUBMIT STATE
  // =========================================================

  function refreshSubmitState() {
    if (!submitBtn) {
      return;
    }

    const loading =
      spinnerEl &&
      spinnerEl.classList.contains(
        "spinner--on"
      );

    if (loading) {

      submitBtn.disabled =
        true;

      return;
    }

    const picked =
      document.querySelector(
        'input[name="stagePick"]:checked'
      );

    const rulesOk =
      rulesChk
        ? rulesChk.checked ===
          true
        : true;

    const selectedValue =
      picked
        ? String(
            picked.value
          )
        : "";

    const selectedItem =
      selectedValue
        ? lastItems.find(
            item =>
              eventValue(item) ===
              selectedValue
          )
        : null;

    const canSubmit =
      Boolean(

        currentUser &&

        profile &&

        picked &&

        rulesOk &&

        selectedItem &&

        canSubmitItem(
          selectedItem
        )
      );

    submitBtn.disabled =
      !canSubmit;
  }

  // =========================================================
  // TEAM CACHE
  // =========================================================

  function getTeamCacheKey(
    teamId
  ) {
    return (
      TEAM_CACHE_PREFIX +
      String(
        teamId ||
        ""
      )
    );
  }

  function readTeamNameCache(
    teamId
  ) {
    try {

      const raw =
        localStorage.getItem(
          getTeamCacheKey(
            teamId
          )
        );

      if (!raw) {
        return null;
      }

      const object =
        JSON.parse(
          raw
        );

      if (
        !object ||
        !object.name ||
        !object.ts
      ) {
        return null;
      }

      if (
        Date.now() -
          object.ts >
        TEAM_CACHE_TTL_MS
      ) {
        return null;
      }

      return String(
        object.name
      );

    } catch {

      return null;
    }
  }

  function writeTeamNameCache(
    teamId,
    name
  ) {
    try {

      localStorage.setItem(
        getTeamCacheKey(
          teamId
        ),
        JSON.stringify({
          ts:
            Date.now(),

          name:
            String(
              name || ""
            )
        })
      );

    } catch {}
  }

  async function getTeamName(
    teamId
  ) {
    if (!teamId) {
      return "";
    }

    const cached =
      readTeamNameCache(
        teamId
      );

    if (cached) {
      return cached;
    }

    const teamSnap =
      await db
        .collection(
          "teams"
        )
        .doc(
          teamId
        )
        .get();

    const name =
      teamSnap.exists
        ? String(
            (
              teamSnap.data() ||
              {}
            ).name ||
            ""
          )
        : "";

    if (name) {
      writeTeamNameCache(
        teamId,
        name
      );
    }

    return name;
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async function loadProfile(
    user
  ) {
    const userSnap =
      await db
        .collection(
          "users"
        )
        .doc(
          user.uid
        )
        .get();

    if (
      !userSnap.exists
    ) {
      throw new Error(
        "Нема профілю. Зайдіть на сторінку «Акаунт» і створіть профіль."
      );
    }

    const userData =
      userSnap.data() ||
      {};

    const teamId =
      userData.teamId ||
      null;

    const teamName =
      teamId
        ? await getTeamName(
            teamId
          )
        : "";

    profile = {
      uid:
        user.uid,

      email:
        user.email ||
        "",

      fullName:
        String(
          userData.fullName ||
          ""
        ).trim(),

      teamId,

      teamName:
        String(
          teamName ||
          "Без назви"
        ).trim(),

      captain:
        String(
          userData.fullName ||
          user.email ||
          ""
        ).trim(),

      phone:
        String(
          userData.phone ||
          ""
        ).trim()
    };

    if (
      profileSummary
    ) {

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

  // =========================================================
  // CACHE
  // =========================================================

  function normalizeDateForCache(
    value
  ) {
    const date =
      toDateMaybe(
        value
      );

    if (date) {
      return date.toISOString();
    }

    return (
      typeof value ===
      "string"
    )
      ? value
      : null;
  }

  function hydrateItemFromCache(
    item
  ) {
    return {
      ...item,

      startAt:
        toDateMaybe(
          item.startAt
        ),

      endAt:
        toDateMaybe(
          item.endAt
        ),

      regOpenAt:
        item.regOpenAt ||
        null,

      regCloseAt:
        item.regCloseAt ||
        null,

      /*
       * Явно відновлюємо
       * final flag.
       */
      isFinal:
        item.isFinal === true
    };
  }

  function clearOldCompetitionCaches() {
    try {

      Object
        .keys(
          localStorage
        )
        .forEach(
          key => {

            if (
              key.startsWith(
                "sc_competitions_cache_"
              ) &&
              key !==
                COMP_CACHE_KEY
            ) {
              localStorage
                .removeItem(
                  key
                );
            }
          }
        );

    } catch {}
  }

  async function tryRenderCompetitionsFromCache() {
    try {

      const raw =
        localStorage.getItem(
          COMP_CACHE_KEY
        );

      if (!raw) {
        return false;
      }

      const object =
        JSON.parse(
          raw
        );

      if (
        !object ||
        !Array.isArray(
          object.items
        ) ||
        !object.ts
      ) {
        return false;
      }

      const items =
        visibleItemsOnly(
          object.items.map(
            hydrateItemFromCache
          )
        );

      lastItems =
        items;

      calcNearestUpcoming(
        items
      );

      /*
       * finalInvites НІКОЛИ
       * не беремо з cache.
       */
      await loadFinalAccess(
        items
      );

      renderItems(
        items
      );

      refreshSubmitState();

      if (
        eventOptionsEl
      ) {

        const hint =
          document.createElement(
            "div"
          );

        hint.className =
          "form__hint";

        hint.style.marginTop =
          "8px";

        hint.textContent =
          "Оновлюю список…";

        eventOptionsEl.appendChild(
          hint
        );
      }

      return true;

    } catch {

      return false;
    }
  }

  function saveCompetitionsToCache(
    items
  ) {
    try {

      const packed =
        visibleItemsOnly(
          items
        ).map(
          item => ({
            ...item,

            /*
             * Ніяких invite/status
             * у кеш не записуємо.
             */
            finalAccess:
              undefined,

            startAt:
              item.startAt
                ? item.startAt
                    .toISOString()
                : null,

            endAt:
              item.endAt
                ? item.endAt
                    .toISOString()
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
              item.payEnabled ===
              true,

            price:
              item.price === 0 ||
              item.price
                ? item.price
                : null,

            currency:
              String(
                item.currency ||
                "UAH"
              ).toUpperCase(),

            payDetails:
              String(
                item.payDetails ||
                ""
              ).trim(),

            regMode:
              item.regMode ||
              "auto",

            manualOpen:
              item.manualOpen ===
              true,

            isFinal:
              item.isFinal ===
              true
          })
        );

      localStorage.setItem(
        COMP_CACHE_KEY,
        JSON.stringify({
          ts:
            Date.now(),

          items:
            packed
        })
      );

    } catch {}
  }

  // =========================================================
  // BUILD COMPETITION ITEM
  // =========================================================

  function buildCompetitionItem({
    competition,
    compId,
    event = null,
    eventIndex = 0
  }) {
    const c =
      competition ||
      {};

    const ev =
      event ||
      {};

    const brand =
      c.brand ||
      "STOLAR CARP";

    const year =
      c.year ||
      c.seasonYear ||
      "";

    const compTitle =
      c.name ||
      c.title ||
      (
        year
          ? `Season ${year}`
          : compId
      );

    const eventKey =
      event
        ? (
            ev.key ||
            ev.stageId ||
            ev.id ||
            `stage-${
              eventIndex + 1
            }`
          )
        : null;

    const finalEvent =
      event
        ? isFinalEvent(
            eventKey,
            ev
          )
        : false;

    const stageTitle =
      event
        ? (
            ev.title ||
            ev.name ||
            ev.label ||
            (
              finalEvent
                ? "Фінал"
                : `Етап ${
                    eventIndex + 1
                  }`
            )
          )
        : null;

    const {
      startAt,
      endAt
    } =
      getRunDatesFromEvent(
        ev,
        c
      );

    const {
      regOpenAt,
      regCloseAt
    } =
      getRegDatesFromEvent(
        ev,
        c
      );

    const payment =
      getPaymentData(
        ev,
        c
      );

    return {
      compId,

      brand,

      year,

      compTitle,

      stageKey:
        eventKey
          ? String(
              eventKey
            )
          : null,

      stageTitle,

      /*
       * ГОЛОВНЕ:
       * тільки final отримує
       * спеціальну логіку.
       */
      isFinal:
        finalEvent,

      entryType:
        entryTypeFromEvent(
          ev,
          c
        ),

      startAt:
        toDateMaybe(
          startAt
        ),

      endAt:
        toDateMaybe(
          endAt
        ),

      regMode:
        getRegistrationMode(
          ev,
          c
        ),

      manualOpen:
        getManualOpenFlag(
          ev,
          c
        ),

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
          c.type ||
          "season"
        ).toLowerCase()
    };
  }

  // =========================================================
  // LOAD COMPETITIONS
  // =========================================================

  async function loadCompetitionsFresh() {
    if (
      !eventOptionsEl
    ) {
      return;
    }

    try {

      const snapshot =
        await db
          .collection(
            "competitions"
          )
          .get();

      const items =
        [];

      snapshot.forEach(
        docSnap => {

          const competition =
            docSnap.data() ||
            {};

          const compId =
            docSnap.id;

          const events =
            Array.isArray(
              competition.events
            )
              ? competition.events
              : [];

          if (
            events.length
          ) {

            events.forEach(
              (
                event,
                index
              ) => {

                items.push(
                  buildCompetitionItem({
                    competition,
                    compId,
                    event,
                    eventIndex:
                      index
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
        }
      );

      const visibleItems =
        visibleItemsOnly(
          items
        );

      visibleItems.sort(
        (
          a,
          b
        ) => {

          const timeA =
            a.startAt
              ? a.startAt
                  .getTime()
              : Number.MAX_SAFE_INTEGER;

          const timeB =
            b.startAt
              ? b.startAt
                  .getTime()
              : Number.MAX_SAFE_INTEGER;

          if (
            timeA !==
            timeB
          ) {
            return (
              timeA -
              timeB
            );
          }

          return String(
            a.compTitle ||
            ""
          ).localeCompare(
            String(
              b.compTitle ||
              ""
            ),
            "uk"
          );
        }
      );

      lastItems =
        visibleItems;

      calcNearestUpcoming(
        visibleItems
      );

      /*
       * ПЕРЕД render перевіряємо,
       * чи має поточна команда
       * доступ до фіналу.
       */
      await loadFinalAccess(
        visibleItems
      );

      renderItems(
        visibleItems
      );

      refreshSubmitState();

      saveCompetitionsToCache(
        visibleItems
      );

    } catch (
      error
    ) {

      console.error(
        "[Registration] loadCompetitionsFresh:",
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
        submitBtn.disabled =
          true;
      }
    }
  }

  // =========================================================
  // RENDER
  // =========================================================

  function renderItems(
    items
  ) {
    if (
      !eventOptionsEl
    ) {
      return;
    }

    eventOptionsEl.innerHTML =
      "";

    setPayUIFromSelected(
      null
    );

    const visibleItems =
      visibleItemsOnly(
        items
      );

    if (
      !visibleItems.length
    ) {

      eventOptionsEl.innerHTML =
        '<p class="form__hint">Наразі немає відкритих або майбутніх етапів для реєстрації.</p>';

      if (submitBtn) {
        submitBtn.disabled =
          true;
      }

      return;
    }

    visibleItems.forEach(
      item => {

        /*
         * Для звичайного етапу:
         * open = дата.
         *
         * Для final:
         * open = дата + invited.
         */
        const open =
          canSubmitItem(
            item
          );

        const status =
          getStatusUI(
            item
          );

        const value =
          eventValue(
            item
          );

        const lamp =
          statusLamp(
            item,
            value
          );

        const typeBadge =
          item.entryType ===
          "solo"
            ? "SOLO"
            : "TEAM";

        const titleText =
          `${
            item.brand
              ? item.brand +
                " · "
              : ""
          }${
            item.compTitle
          }` +
          (
            item.stageTitle
              ? ` — ${
                  item.stageTitle
                }`
              : ""
          );

        const dateLine =
          `${
            fmtDate(
              item.startAt
            )
          } — ${
            fmtDate(
              item.endAt
            )
          }`;

        const regOpen =
          toDateMaybe(
            item.regOpenAt,
            {
              endOfDay:
                false
            }
          );

        const regClose =
          toDateMaybe(
            item.regCloseAt,
            {
              endOfDay:
                true
            }
          );

        const registrationDatesLine =
          regOpen ||
          regClose
            ? `Реєстрація: ${
                fmtDate(
                  regOpen
                )
              } — ${
                fmtDate(
                  regClose
                )
              }`
            : "Дати реєстрації не задані";

        const label =
          document.createElement(
            "label"
          );

        label.className =
          "event-item" +
          (
            open
              ? ""
              : " is-closed"
          );

        /*
         * Додатковий class,
         * якщо захочемо оформити
         * фінал окремо через CSS.
         */
        if (
          item.isFinal
        ) {
          label.classList.add(
            "event-item--final"
          );
        }

        label.setAttribute(
          "role",
          "button"
        );

        label.style.cursor =
          open
            ? "pointer"
            : "default";

        label.innerHTML = `
          <input
            type="radio"
            name="stagePick"
            value="${escapeHtml(
              value
            )}"
            ${
              open
                ? ""
                : "disabled"
            }
            style="
              flex:0 0 auto;
              margin-top:4px;
            "
          >

          <div
            class="event-content"
            style="
              min-width:0;
              flex:1;
            "
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
                  style="
                    flex:0 0 auto;
                  "
                ></span>

                <span
                  style="
                    font-size:12px;
                    color:var(--muted);
                    font-weight:800;
                    white-space:nowrap;
                  "
                >
                  ${escapeHtml(
                    status.short
                  )}
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

                <span
                  class="pill-b"
                >
                  ${escapeHtml(
                    typeBadge
                  )}
                </span>

                ${
                  item.isFinal
                    ? `
                      <span class="pill-b">
                        FINAL
                      </span>
                    `
                    : ""
                }

                <span
                  class="pill-b ${
                    status.badgeClass
                  }"
                >
                  ${escapeHtml(
                    status.badge
                  )}
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
              ${escapeHtml(
                titleText
              )}
            </div>

            <div
              style="
                margin-top:7px;
                color:var(--muted);
                font-size:13px;
                line-height:1.35;
              "
            >
              ${escapeHtml(
                dateLine
              )}
            </div>

            <div
              style="
                margin-top:5px;
                color:var(--muted);
                font-size:12px;
                line-height:1.35;
              "
            >
              ${escapeHtml(
                registrationDatesLine
              )}
            </div>

            <div
              style="
                margin-top:7px;
                color:${
                  item.isFinal &&
                  canRegisterFinal(item)
                    ? "#fde68a"
                    : "var(--muted)"
                };
                font-size:13px;
                line-height:1.45;
                font-weight:${
                  item.isFinal
                    ? "700"
                    : "400"
                };
              "
            >
              ${escapeHtml(
                status.text
              )}
            </div>

          </div>
        `;

        eventOptionsEl.appendChild(
          label
        );
      }
    );
  }

  // =========================================================
  // CHANGE
  // =========================================================

  document.addEventListener(
    "change",
    event => {

      const target =
        event.target;

      if (!target) {
        return;
      }

      if (
        target.name ===
        "stagePick"
      ) {

        const picked =
          document.querySelector(
            'input[name="stagePick"]:checked'
          );

        const selectedValue =
          picked
            ? String(
                picked.value
              )
            : "";

        const selectedItem =
          selectedValue
            ? lastItems.find(
                item =>
                  eventValue(item) ===
                  selectedValue
              )
            : null;

        setPayUIFromSelected(
          selectedItem ||
          null
        );

        if (
          selectedItem
        ) {

          if (
            selectedItem.isFinal
          ) {

            const finalStatus =
              getFinalStatusUI(
                selectedItem
              );

            if (
              !canRegisterFinal(
                selectedItem
              )
            ) {

              setMsg(
                finalStatus.text,
                false
              );

            } else {

              const state =
                getRegistrationState(
                  selectedItem
                );

              if (
                state ===
                "pending"
              ) {

                setMsg(
                  "Ви маєте право участі у фіналі, але реєстрація ще не розпочалася.",
                  false
                );

              } else if (
                state ===
                "closed"
              ) {

                setMsg(
                  "Ви маєте право участі у фіналі, але реєстрація вже завершена.",
                  false
                );

              } else {

                setMsg(
                  ""
                );
              }
            }

          } else {

            const state =
              getRegistrationState(
                selectedItem
              );

            if (
              state ===
              "pending"
            ) {

              setMsg(
                "Реєстрація на це змагання ще не розпочалася.",
                false
              );

            } else if (
              state ===
              "closed"
            ) {

              setMsg(
                "Реєстрація на це змагання вже завершена.",
                false
              );

            } else if (
              state ===
              "unavailable"
            ) {

              setMsg(
                "Дати реєстрації для цього змагання не налаштовані.",
                false
              );

            } else {

              setMsg(
                ""
              );
            }
          }
        }
      }

      if (
        target.name ===
          "stagePick" ||
        target.id ===
          "rules"
      ) {
        refreshSubmitState();
      }
    }
  );

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  if (
    eventOptionsEl
  ) {
    eventOptionsEl.innerHTML =
      '<p class="form__hint">Завантаження списку...</p>';
  }

  clearOldCompetitionCaches();

  /*
   * Кеш можна показати швидко,
   * але finalInvites все одно
   * читаємо живцем.
   */
  tryRenderCompetitionsFromCache();

  setTimeout(
    () => {
      loadCompetitionsFresh();
    },
    50
  );

  // =========================================================
  // AUTH
  // =========================================================

  auth.onAuthStateChanged(
    async user => {

      currentUser =
        user ||
        null;

      profile =
        null;

      finalAccessByEvent.clear();

      setMsg(
        ""
      );

      refreshSubmitState();

      if (!user) {

        if (submitBtn) {
          submitBtn.disabled =
            true;
        }

        if (
          profileSummary
        ) {

          profileSummary.textContent =
            "Ви не залогінені. Зайдіть у «Мій кабінет» і поверніться сюди.";
        }

        setMsg(
          "Увійдіть у акаунт, щоб подати заявку.",
          false
        );

        await loadFinalAccess(
          lastItems
        );

        renderItems(
          lastItems
        );

        return;
      }

      try {

        await loadProfile(
          user
        );

        /*
         * Після завантаження profile
         * перевіряємо finalInvites.
         */
        await loadFinalAccess(
          lastItems
        );

        renderItems(
          lastItems
        );

        refreshSubmitState();

      } catch (
        error
      ) {

        console.error(
          "[Registration] profile:",
          error
        );

        if (submitBtn) {
          submitBtn.disabled =
            true;
        }

        setMsg(
          error.message ||
          "Помилка профілю.",
          false
        );
      }
    }
  );

  // =========================================================
  // PUBLIC PAYLOAD
  // =========================================================

  function buildPublicPayload({
    uid,
    competitionId,
    stageId,
    entryType,
    teamId,
    teamName,
    status,
    finalInvite = false
  }) {
    return {
      uid:
        uid ||
        null,

      competitionId,

      stageId:
        stageId ||
        null,

      entryType:
        entryType ||
        "team",

      teamId:
        teamId ||
        null,

      teamName:
        teamName ||
        null,

      status:
        status ||
        "pending_payment",

      finalInvite:
        finalInvite ===
        true,

      source:
        finalInvite
          ? "final_invite_registration"
          : "registration",

      createdAt:
        fb.firestore
          .FieldValue
          .serverTimestamp()
    };
  }

  // =========================================================
  // VERIFY FINAL BEFORE WRITE
  // =========================================================

  async function createFinalRegistration({
    selectedItem,
    registrationRef,
    payload
  }) {
    if (
      !selectedItem?.isFinal
    ) {
      throw new Error(
        "Це не фінал."
      );
    }

    if (
      !profile?.teamId
    ) {
      throw new Error(
        "Команда не визначена."
      );
    }

    const competitionId =
      selectedItem.compId;

    const stageId =
      selectedItem.stageKey ||
      "final";

    const inviteId =
      buildFinalInviteId(
        competitionId,
        stageId,
        profile.teamId
      );

    const inviteRef =
      db
        .collection(
          FINAL_INVITES_COLLECTION
        )
        .doc(
          inviteId
        );

    /*
     * КРИТИЧНА ПЕРЕВІРКА.
     *
     * Не довіряємо тільки DOM.
     *
     * Перед створенням registrations
     * знову читаємо finalInvites.
     */
    await db.runTransaction(
      async transaction => {

        const inviteSnap =
          await transaction.get(
            inviteRef
          );

        if (
          !inviteSnap.exists
        ) {
          throw new Error(
            "Ваша команда не має активного запрошення у фінал."
          );
        }

        const invite =
          inviteSnap.data() ||
          {};

        const inviteStatus =
          normalizeLower(
            invite.status
          );

        const inviteTeamId =
          normalize(
            invite.teamId
          );

        if (
          inviteTeamId &&
          inviteTeamId !==
            profile.teamId
        ) {
          throw new Error(
            "Запрошення належить іншій команді."
          );
        }

        if (
          inviteStatus !==
          "invited"
        ) {

          if (
            inviteStatus ===
            "reserve"
          ) {
            throw new Error(
              "Ваша команда зараз у резерві. Очікуйте звільнення місця."
            );
          }

          if (
            inviteStatus ===
            "declined"
          ) {
            throw new Error(
              "Команда вже відмовилася від участі у фіналі."
            );
          }

          if (
            inviteStatus ===
            "confirmed"
          ) {
            throw new Error(
              "Участь у фіналі вже підтверджена."
            );
          }

          throw new Error(
            "Запрошення у фінал зараз неактивне."
          );
        }

        /*
         * Не дозволяємо випадково
         * перезаписати існуючу заявку.
         */
        const existingReg =
          await transaction.get(
            registrationRef
          );

        if (
          existingReg.exists
        ) {
          throw new Error(
            "Заявка на фінал уже подана."
          );
        }

        /*
         * Створюємо registration.
         *
         * status invite поки НЕ міняємо.
         *
         * Якщо потрібна оплата:
         * admin підтвердить payment.
         *
         * Якщо оплати немає:
         * registration одразу confirmed.
         */
        transaction.set(
          registrationRef,
          payload,
          {
            merge:
              false
          }
        );
      }
    );
  }

  // =========================================================
  // FORM SUBMIT
  // =========================================================

  if (form) {

    form.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        // -----------------------------------------------------
        // BOT
        // -----------------------------------------------------

        if (
          hpInput &&
          hpInput.value
        ) {

          setMsg(
            "Підозра на бота. Заявка не відправлена.",
            false
          );

          return;
        }

        // -----------------------------------------------------
        // AUTH
        // -----------------------------------------------------

        if (
          !currentUser ||
          !profile
        ) {

          setMsg(
            "Увійдіть у акаунт.",
            false
          );

          return;
        }

        // -----------------------------------------------------
        // PICK
        // -----------------------------------------------------

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
          String(
            picked.value
          );

        const selectedItem =
          lastItems.find(
            item =>
              eventValue(
                item
              ) ===
              selectedValue
          );

        if (
          !selectedItem
        ) {

          setMsg(
            "Не знайдено вибране змагання.",
            false
          );

          return;
        }

        // -----------------------------------------------------
        // DATE CHECK
        // -----------------------------------------------------

        if (
          isFinishedEvent(
            selectedItem
          ) ||
          !isOpenWindow(
            selectedItem
          )
        ) {

          setMsg(
            "Це змагання зараз недоступне для реєстрації.",
            false
          );

          return;
        }

        // -----------------------------------------------------
        // FINAL CHECK — CLIENT
        // -----------------------------------------------------

        if (
          selectedItem.isFinal &&
          !canRegisterFinal(
            selectedItem
          )
        ) {

          const finalStatus =
            getFinalStatusUI(
              selectedItem
            );

          setMsg(
            finalStatus.text,
            false
          );

          return;
        }

        // -----------------------------------------------------
        // RULES CHECKBOX
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // IDs
        // -----------------------------------------------------

        const [
          competitionId,
          stageKeyRaw
        ] =
          selectedValue.split(
            "||"
          );

        const stageId =
          String(
            stageKeyRaw ||
            ""
          ).trim() ||
          null;

        const entryType =
          selectedItem.entryType ||
          "team";

        // -----------------------------------------------------
        // TEAM
        // -----------------------------------------------------

        if (
          entryType ===
          "team"
        ) {

          if (
            !profile.teamId
          ) {

            setMsg(
              "Це командне змагання. Спочатку приєднайтесь до команди в «Мій кабінет».",
              false
            );

            return;
          }

          if (
            !profile.teamName
          ) {

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

        // -----------------------------------------------------
        // PAYMENT
        // -----------------------------------------------------

        const payment = {
          payEnabled:
            selectedItem.payEnabled ===
            true,

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
         * З оплатою:
         * pending_payment
         *
         * Без оплати:
         * confirmed
         */
        const status =
          payment.payEnabled
            ? "pending_payment"
            : "confirmed";

        // -----------------------------------------------------
        // DOC ID
        // -----------------------------------------------------

        const docId =
          buildRegDocId({
            competitionId,
            stageId,
            entryType,

            uid:
              profile.uid,

            teamId:
              profile.teamId
          });

        const registrationRef =
          db
            .collection(
              "registrations"
            )
            .doc(
              docId
            );

        // -----------------------------------------------------
        // PAYLOAD
        // -----------------------------------------------------

        const payload = {
          uid:
            profile.uid,

          competitionId,

          stageId:
            stageId ||
            null,

          entryType,

          teamId:
            entryType ===
            "team"
              ? profile.teamId
              : null,

          teamName:
            entryType ===
            "team"
              ? profile.teamName
              : null,

          participantName:
            entryType ===
            "solo"
              ? participantName
              : null,

          captain:
            entryType ===
            "team"
              ? profile.captain
              : participantName,

          phone:
            profile.phone ||
            "",

          payEnabled:
            payment.payEnabled,

          price:
            payment.price,

          currency:
            payment.currency,

          payDetails:
            payment.payDetails,

          /*
           * Позначаємо фінал.
           */
          finalInvite:
            selectedItem.isFinal ===
            true,

          source:
            selectedItem.isFinal
              ? "final_invite_registration"
              : "registration",

          /*
           * Місце у рейтингу,
           * якщо це фінал.
           */
          finalQualificationRank:
            selectedItem.isFinal
              ? Number(
                  getFinalAccess(
                    selectedItem
                  )?.rank ||
                  0
                )
              : null,

          status,

          createdAt:
            fb.firestore
              .FieldValue
              .serverTimestamp(),

          confirmedAt:
            status ===
            "confirmed"
              ? fb.firestore
                  .FieldValue
                  .serverTimestamp()
              : null
        };

        // -----------------------------------------------------
        // WRITE
        // -----------------------------------------------------

        try {

          setLoading(
            true
          );

          setMsg(
            ""
          );

          /*
           * ФІНАЛ:
           *
           * transaction:
           *
           * finalInvites ->
           * verify invited ->
           * verify team ->
           * verify registration does not exist ->
           * create registration.
           */
          if (
            selectedItem.isFinal
          ) {

            await createFinalRegistration({
              selectedItem,
              registrationRef,
              payload
            });

          } else {

            /*
             * ЗВИЧАЙНІ ЕТАПИ:
             * стара поведінка.
             */
            await registrationRef.set(
              payload,
              {
                merge:
                  false
              }
            );
          }

          // ---------------------------------------------------
          // PUBLIC MIRROR
          // ---------------------------------------------------

          try {

            const publicRef =
              db
                .collection(
                  "public_participants"
                )
                .doc(
                  docId
                );

            const publicPayload =
              buildPublicPayload({
                uid:
                  profile.uid,

                competitionId,

                stageId,

                entryType,

                teamId:
                  entryType ===
                  "team"
                    ? profile.teamId
                    : null,

                teamName:
                  entryType ===
                  "team"
                    ? profile.teamName
                    : null,

                status,

                finalInvite:
                  selectedItem.isFinal ===
                  true
              });

            await publicRef.set(
              publicPayload,
              {
                merge:
                  false
              }
            );

          } catch (
            mirrorError
          ) {

            /*
             * Registration уже створений.
             *
             * Якщо rules не дозволили
             * public mirror, не вважаємо
             * основну заявку невдалою.
             */
            console.warn(
              "[Registration] public_participants:",
              mirrorError
            );
          }

          // ---------------------------------------------------
          // SUCCESS
          // ---------------------------------------------------

          if (
            selectedItem.isFinal
          ) {

            setMsg(
              payment.payEnabled
                ? "Заявка на Фінал подана ✔ Очікується підтвердження оплати."
                : "Участь у Фіналі підтверджена ✔",
              true
            );

          } else {

            setMsg(
              payment.payEnabled
                ? "Заявка подана ✔ Підтвердження буде після перевірки оплати."
                : "Заявка подана і підтверджена ✔",
              true
            );
          }

          form.reset();

          setPayUIFromSelected(
            null
          );

          /*
           * Після фінальної заявки
           * перечитуємо registrations
           * та finalInvites.
           */
          if (
            selectedItem.isFinal
          ) {

            await loadFinalAccess(
              lastItems
            );

            renderItems(
              lastItems
            );
          }

          refreshSubmitState();

        } catch (
          error
        ) {

          console.error(
            "[Registration] submit:",
            error
          );

          const code =
            String(
              error?.code ||
              ""
            )
              .toLowerCase();

          const message =
            String(
              error?.message ||
              ""
            ).trim();

          /*
           * Наші зрозумілі помилки
           * фінальної перевірки.
           */
          if (
            selectedItem.isFinal &&
            message
          ) {

            setMsg(
              message,
              false
            );

          } else if (
            code.includes(
              "permission"
            )
          ) {

            setMsg(
              selectedItem.isFinal
                ? "Firebase не дозволив реєстрацію у фінал. Перевірте finalInvites та Firestore Rules."
                : "Заявка вже існує або дані команди не збігаються з профілем. Перевірте «Мій кабінет».",
              false
            );

          } else {

            setMsg(
              `Помилка відправки заявки. (${
                error?.code ||
                "no-code"
              })`,
              false
            );
          }

        } finally {

          setLoading(
            false
          );
        }
      }
    );
  }

})();
