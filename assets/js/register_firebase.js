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
// ✅ Payment visible BEFORE registration opens
// ✅ Season + one-off competitions
//
// =========================================================
// ФІНАЛ
// =========================================================
//
// Фінал працює через:
//
// finalQualifications/{year}/teams/{teamId}
//
// Наприклад:
//
// finalQualifications/2026/teams/TEAM_ID
// finalQualifications/2027/teams/TEAM_ID
//
// status:
//
// invited   -> можна подати заявку
// reserve   -> резерв
// declined  -> відмова
// confirmed -> підтверджено
//
// Сезони не змішуються.
//
// =========================================================

(function () {
  "use strict";

  // =========================================================
  // FIREBASE
  // =========================================================

  const auth = window.scAuth;
  const db = window.scDb;
  const fb = window.firebase;

  // =========================================================
  // DOM
  // =========================================================

  const form =
    document.getElementById("regForm");

  const eventOptionsEl =
    document.getElementById("eventOptions");

  const msgEl =
    document.getElementById("msg");

  const submitBtn =
    document.getElementById("submitBtn");

  const spinnerEl =
    document.getElementById("spinner");

  const hpInput =
    document.getElementById("hp");

  const profileSummary =
    document.getElementById("profileSummary");

  const rulesChk =
    document.getElementById("rules");

  const copyPayBtn =
    document.getElementById("copyCard");

  const payBoxEl =
    document.getElementById("cardNum");

  const payAmountEl =
    document.getElementById("payAmount");

  const payCurrEl =
    document.getElementById("payCurrency");

  const payDetailsEl =
    document.getElementById("payDetails");

  // =========================================================
  // FIREBASE CHECK
  // =========================================================

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

  // =========================================================
  // SETTINGS
  // =========================================================

  /*
   * v9:
   *
   * спеціально міняємо ключ,
   * щоб старий localStorage cache
   * не залишив payment дані
   * від попередньої версії JS.
   */
  const COMP_CACHE_KEY =
    "sc_competitions_cache_v9_final_qualifications_payment";

  const TEAM_CACHE_PREFIX =
    "sc_team_cache_";

  const TEAM_CACHE_TTL_MS =
    24 * 60 * 60 * 1000;

  const FINISHED_HIDE_GRACE_MS =
    24 * 60 * 60 * 1000;

  const FINAL_QUALIFICATIONS_COLLECTION =
    "finalQualifications";

  // =========================================================
  // STATE
  // =========================================================

  let currentUser = null;
  let profile = null;

  let lastItems = [];

  let nearestUpcomingValue = null;

  let activePayCopyText = "";

  /*
   * competitionId||stageId
   */
  const finalAccessByEvent =
    new Map();

  let finalAccessRequestId = 0;

  // =========================================================
  // HELPERS
  // =========================================================

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

  function normalize(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function normalizeLower(value) {
    return normalize(value)
      .toLowerCase();
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
        ok ? "ok" : "err"
      );
    }
  }

  function setLoading(value) {
    if (spinnerEl) {
      spinnerEl.classList.toggle(
        "spinner--on",
        Boolean(value)
      );
    }

    refreshSubmitState();
  }

  function fmtDate(date) {
    if (!date) {
      return "—";
    }

    return date.toLocaleDateString(
      "uk-UA",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    );
  }

  function normalizeMoney(value) {
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
          .replace(",", ".")
      );

    return Number.isFinite(number)
      ? number
      : null;
  }

  function normalizeBoolean(value) {
    if (value === true) {
      return true;
    }

    if (value === false) {
      return false;
    }

    if (
      value === 1 ||
      value === "1"
    ) {
      return true;
    }

    if (
      value === 0 ||
      value === "0"
    ) {
      return false;
    }

    const text =
      normalizeLower(value);

    if (
      text === "true" ||
      text === "yes" ||
      text === "on"
    ) {
      return true;
    }

    return false;
  }

  // =========================================================
  // DATES
  // =========================================================

  function parseDateYMDLocal(
    value,
    endOfDay = false
  ) {
    const match =
      String(value || "")
        .trim()
        .match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);

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
      options.endOfDay === true;

    try {
      if (
        value instanceof Date
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
          new Date(raw);

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
            value.seconds * 1000
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
          new Date(value);

        return Number.isFinite(
          parsed.getTime()
        )
          ? parsed
          : null;
      }

    } catch (error) {
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

    return normalizeBoolean(value);
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

    /*
     * Підтримуємо:
     *
     * payEnabled
     * paymentEnabled
     * payment.enabled
     *
     * як на event,
     * так і на competition.
     */
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

    /*
     * Сума.
     */
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

    /*
     * Валюта.
     */
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

    /*
     * Реквізити.
     *
     * Зокрема підтримується
     * саме твоє поле payDetails.
     */
    const details =
      String(
        firstDefined(
          eventPayment.details,
          eventPayment.payDetails,

          event?.payDetails,
          event?.paymentDetails,
          event?.paymentText,
          event?.requisites,
          event?.bankDetails,
          event?.card,
          event?.cardNumber,

          compPayment.details,
          compPayment.payDetails,

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

    const price =
      normalizeMoney(
        priceRaw
      );

    /*
     * Основний прапорець —
     * payEnabled.
     *
     * Але для старих competitions:
     * якщо є price / details,
     * оплату також вважаємо заданою.
     *
     * Це захищає старі змагання,
     * створені до поточної схеми.
     */
    const payEnabled =
      normalizeBoolean(
        enabledRaw
      ) ||
      (
        price !== null &&
        price > 0
      ) ||
      Boolean(details);

    return {
      payEnabled,
      price,
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
      ).toLowerCase();

    return type === "solo"
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
      rawKey.includes("final") ||
      rawKey.includes("фінал") ||
      rawText.includes("final") ||
      rawText.includes("фінал")
    );
  }

  // =========================================================
  // SEASON YEAR
  // =========================================================

  function getSeasonYearFromItem(
    item
  ) {
    const directYear =
      normalize(
        item?.year
      );

    if (
      /^\d{4}$/.test(
        directYear
      )
    ) {
      return directYear;
    }

    const text =
      normalize(
        `${
          item?.compId || ""
        } ${
          item?.compTitle || ""
        } ${
          item?.stageTitle || ""
        }`
      );

    const match =
      text.match(
        /\b(20\d{2})\b/
      );

    if (match) {
      return match[1];
    }

    return "";
  }

  function getFinalQualificationRef(
    item,
    teamId
  ) {
    const seasonYear =
      getSeasonYearFromItem(
        item
      );

    if (
      !seasonYear ||
      !teamId
    ) {
      return null;
    }

    return db
      .collection(
        FINAL_QUALIFICATIONS_COLLECTION
      )
      .doc(
        seasonYear
      )
      .collection("teams")
      .doc(teamId);
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
      nowLocal().getTime() >
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
        !isFinishedEvent(item)
    );
  }

  function getRegistrationState(
    item
  ) {
    if (!item) {
      return "unavailable";
    }

    if (
      isFinishedEvent(item)
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
          endOfDay: false
        }
      );

    const closeAt =
      toDateMaybe(
        item.regCloseAt,
        {
          endOfDay: true
        }
      );

    if (
      openAt &&
      closeAt
    ) {
      if (
        now < openAt
      ) {
        return "pending";
      }

      if (
        now > closeAt
      ) {
        return "closed";
      }

      return "open";
    }

    if (
      openAt &&
      !closeAt
    ) {
      return now >= openAt
        ? "open"
        : "pending";
    }

    if (
      !openAt &&
      closeAt
    ) {
      return now <= closeAt
        ? "open"
        : "closed";
    }

    if (
      mode === "manual" &&
      item.manualOpen === true
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
      entryType === "solo"
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
  // FINAL ACCESS
  // =========================================================

  function emptyFinalAccess(
    status = "not_invited"
  ) {
    return {
      qualificationExists:
        false,

      inviteExists:
        false,

      inviteStatus:
        status,

      rank:
        0,

      seasonYear:
        "",

      competitionId:
        "",

      stageId:
        "",

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
          item.isFinal === true
      );

    finalAccessByEvent.clear();

    if (
      !finalItems.length
    ) {
      return;
    }

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
            normalize(
              item.compId
            );

          const stageId =
            normalize(
              item.stageKey
            ) || "final";

          const seasonYear =
            getSeasonYearFromItem(
              item
            );

          const teamId =
            profile.teamId;

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

          if (
            !seasonYear
          ) {
            finalAccessByEvent.set(
              eventValue(item),
              emptyFinalAccess(
                "season_missing"
              )
            );

            return;
          }

          const qualificationRef =
            getFinalQualificationRef(
              item,
              teamId
            );

          if (
            !qualificationRef
          ) {
            finalAccessByEvent.set(
              eventValue(item),
              emptyFinalAccess(
                "season_missing"
              )
            );

            return;
          }

          try {
            const [
              qualificationSnap,
              registrationSnap
            ] =
              await Promise.all([
                qualificationRef.get(),

                db
                  .collection(
                    "registrations"
                  )
                  .doc(
                    registrationId
                  )
                  .get()
              ]);

            if (
              requestId !==
              finalAccessRequestId
            ) {
              return;
            }

            const qualificationData =
              qualificationSnap.exists
                ? (
                    qualificationSnap.data() ||
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

            let qualificationValid =
              qualificationSnap.exists;

            if (
              qualificationValid &&
              qualificationData.teamId &&
              normalize(
                qualificationData.teamId
              ) !== teamId
            ) {
              qualificationValid =
                false;
            }

            if (
              qualificationValid &&
              qualificationData.seasonYear &&
              normalize(
                qualificationData.seasonYear
              ) !== seasonYear
            ) {
              qualificationValid =
                false;
            }

            if (
              qualificationValid &&
              qualificationData.competitionId &&
              normalize(
                qualificationData.competitionId
              ) !== competitionId
            ) {
              qualificationValid =
                false;
            }

            if (
              qualificationValid &&
              qualificationData.stageId &&
              normalize(
                qualificationData.stageId
              ) !== stageId
            ) {
              qualificationValid =
                false;
            }

            finalAccessByEvent.set(
              eventValue(item),
              {
                qualificationExists:
                  qualificationValid,

                inviteExists:
                  qualificationValid,

                inviteStatus:
                  qualificationValid
                    ? normalizeLower(
                        qualificationData.status ||
                        "reserve"
                      )
                    : "not_invited",

                rank:
                  qualificationValid
                    ? Number(
                        qualificationData.rank ||
                        qualificationData.place ||
                        0
                      )
                    : 0,

                seasonYear,
                competitionId,
                stageId,

                registrationExists:
                  registrationSnap.exists,

                registrationStatus:
                  registrationSnap.exists
                    ? normalizeLower(
                        regData.status
                      )
                    : "",

                registrationId,

                qualificationRef
              }
            );

          } catch (error) {
            console.warn(
              "[Registration] final qualification access:",
              seasonYear,
              competitionId,
              stageId,
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
      getFinalAccess(item);

    if (!access) {
      return false;
    }

    if (
      access.registrationExists
    ) {
      return false;
    }

    return (
      access.qualificationExists ===
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
      isFinishedEvent(item)
    ) {
      return false;
    }

    if (
      !isOpenWindow(item)
    ) {
      return false;
    }

    if (
      item.isFinal &&
      !canRegisterFinal(item)
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

    /*
     * 16 цифр:
     *
     * 4441111066640446
     *
     * ->
     *
     * 4441 1110 6664 0446
     */
    if (
      /^\d{16}$/.test(raw)
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
      activePayCopyText = "";

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
      item.payEnabled === true;

    const price =
      normalizeMoney(
        item.price
      );

    const currency =
      String(
        item.currency ||
        "UAH"
      ).toUpperCase();

    const details =
      String(
        item.payDetails ||
        ""
      ).trim();

    if (!payEnabled) {
      activePayCopyText =
        "";

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
        : String(price);

    const detailsText =
      details ||
      "Реквізити не задані адміністратором.";

    /*
     * Копіюємо оригінальні реквізити,
     * без доданих пробілів.
     */
    activePayCopyText =
      details;

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
        formatCardLikeText(
          detailsText
        );
    }

    if (payBoxEl) {
      payBoxEl.textContent =
        formatCardLikeText(
          detailsText
        );
    }
  }

  /*
   * Визначає, оплату якого етапу
   * показувати, якщо користувач
   * ще нічого не вибрав.
   *
   * Це і є ключове виправлення.
   */
  function getDefaultPaymentItem(
    items
  ) {
    const visibleItems =
      visibleItemsOnly(
        items
      );

    if (
      !visibleItems.length
    ) {
      return null;
    }

    /*
     * 1. Якщо radio вже вибраний —
     * показуємо саме його.
     */
    const picked =
      document.querySelector(
        'input[name="stagePick"]:checked'
      );

    if (picked) {
      const selected =
        visibleItems.find(
          item =>
            eventValue(item) ===
            String(picked.value)
        );

      if (selected) {
        return selected;
      }
    }

    /*
     * 2. Відкритий зараз.
     */
    const openItem =
      visibleItems.find(
        item =>
          getRegistrationState(
            item
          ) === "open"
      );

    if (openItem) {
      return openItem;
    }

    /*
     * 3. Найближчий майбутній
     * старт реєстрації.
     */
    const pending =
      visibleItems
        .filter(
          item =>
            getRegistrationState(
              item
            ) ===
            "pending"
        )
        .map(
          item => ({
            item,

            openAt:
              toDateMaybe(
                item.regOpenAt,
                {
                  endOfDay: false
                }
              )
          })
        )
        .filter(
          row =>
            row.openAt
        )
        .sort(
          (a, b) =>
            a.openAt.getTime() -
            b.openAt.getTime()
        );

    if (
      pending.length
    ) {
      return pending[0].item;
    }

    /*
     * 4. Якщо дати не задані,
     * але є оплата —
     * все одно показуємо її.
     */
    const paymentConfigured =
      visibleItems.find(
        item =>
          item.payEnabled ===
            true ||
          normalizeMoney(
            item.price
          ) !== null ||
          normalize(
            item.payDetails
          )
      );

    if (
      paymentConfigured
    ) {
      return paymentConfigured;
    }

    /*
     * 5. Останній fallback.
     */
    return (
      visibleItems[0] ||
      null
    );
  }

  function refreshPaymentUI(
    items = lastItems
  ) {
    setPayUIFromSelected(
      getDefaultPaymentItem(
        items
      )
    );
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
            "Нема реквізитів для копіювання."
          );

          return;
        }

        try {
          await navigator
            .clipboard
            .writeText(text);

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
    let best = null;

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
              endOfDay: false
            }
          );

        if (
          !openAt ||
          openAt <= now
        ) {
          return;
        }

        const value =
          eventValue(item);

        if (
          !best ||
          openAt < best.openAt
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
    if (item?.isFinal) {
      const access =
        getFinalAccess(item);

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
      state === "open"
    ) {
      return "lamp-green";
    }

    if (
      state === "pending" &&
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
      state === "open"
    ) {
      return {
        state,
        short: "Відкрито",
        badge: "ВІДКРИТО",
        text:
          "Реєстрація відкрита ✅",
        badgeClass:
          "pill-b--open"
      };
    }

    if (
      state === "pending"
    ) {
      return {
        state,
        short: "Очікується",
        badge: "ОЧІКУЄТЬСЯ",
        text:
          "Реєстрація ще не розпочалася.",
        badgeClass:
          "pill-b--closed"
      };
    }

    if (
      state === "closed"
    ) {
      return {
        state,
        short: "Закрито",
        badge: "ЗАКРИТО",
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
      getFinalAccess(item);

    const normalState =
      getRegistrationState(
        item
      );

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
          "ЗА РЕЙТИНГОМ",

        text:
          "Увійдіть у акаунт, щоб перевірити право участі у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

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

    if (
      access?.inviteStatus ===
      "season_missing"
    ) {
      return {
        state:
          "final-season-missing",

        short:
          "Фінал",

        badge:
          "ПОМИЛКА СЕЗОНУ",

        text:
          "Для цього фіналу не визначено рік сезону. Перевірте year або seasonYear у competitions.",

        badgeClass:
          "pill-b--closed"
      };
    }

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
            "Фіналіст",

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
            "Фіналіст",

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
          "Фіналіст",

        badge:
          "ФІНАЛІСТ",

        text:
          `Ваша команда отримала право участі у фіналі.${rankText} Дати реєстрації ще не налаштовані.`,

        badgeClass:
          "pill-b--closed"
      };
    }

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
            ? `Ваша команда зараз №${access.rank} у рейтингу сезону. Очікуйте, якщо звільниться місце у TOP-18.`
            : "Ваша команда перебуває у резерві. Очікуйте звільнення місця у фіналі.",

        badgeClass:
          "pill-b--closed"
      };
    }

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
          "Не вдалося перевірити фінальну кваліфікацію.",

        badgeClass:
          "pill-b--closed"
      };
    }

    return {
      state:
        "final-not-invited",

      short:
        "Фінал",

      badge:
        "ЗА РЕЙТИНГОМ",

      text:
        "Реєстрація у фінал доступна тільки командам, які отримали право участі за рейтингом сезону.",

      badgeClass:
        "pill-b--closed"
    };
  }

  function getStatusUI(
    item
  ) {
    if (item?.isFinal) {
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
        ? rulesChk.checked === true
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
      String(teamId || "")
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
        JSON.parse(raw);

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
        .collection("teams")
        .doc(teamId)
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
        .collection("users")
        .doc(user.uid)
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
      typeof value === "string"
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

      payEnabled:
        item.payEnabled === true,

      price:
        normalizeMoney(
          item.price
        ),

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

      isFinal:
        item.isFinal === true
    };
  }

  function clearOldCompetitionCaches() {
    try {
      Object
        .keys(localStorage)
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
                .removeItem(key);
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
        JSON.parse(raw);

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

      lastItems = items;

      calcNearestUpcoming(
        items
      );

      /*
       * Кваліфікація фіналу
       * завжди читається з Firestore.
       */
      await loadFinalAccess(
        items
      );

      renderItems(
        items
      );

      refreshSubmitState();

      if (eventOptionsEl) {
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

    } catch (error) {
      console.warn(
        "[Registration] cache:",
        error
      );

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
      competition || {};

    const ev =
      event || {};

    const brand =
      c.brand ||
      "STOLAR CARP";

    const yearRaw =
      firstDefined(
        ev.year,
        ev.seasonYear,
        c.year,
        c.seasonYear,
        ""
      );

    const year =
      normalize(
        yearRaw
      );

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

      const items = [];

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

          if (events.length) {
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
        (a, b) => {
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
            timeA !== timeB
          ) {
            return (
              timeA - timeB
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

    } catch (error) {
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

  /*
   * Зберігаємо поточний вибір
   * перед повторним render.
   */
  const previousPicked =
    document.querySelector(
      'input[name="stagePick"]:checked'
    );

  const previousPickedValue =
    previousPicked
      ? String(
          previousPicked.value
        )
      : "";

  eventOptionsEl.innerHTML =
    "";

  const visibleItems =
    visibleItemsOnly(
      items
    );

  if (
    !visibleItems.length
  ) {
    eventOptionsEl.innerHTML =
      '<p class="form__hint">Наразі немає відкритих або майбутніх етапів для реєстрації.</p>';

    setPayUIFromSelected(
      null
    );

    if (submitBtn) {
      submitBtn.disabled =
        true;
    }

    return;
  }

  visibleItems.forEach(
    item => {
      const open =
        canSubmitItem(item);

      const status =
        getStatusUI(item);

      const value =
        eventValue(item);

      const lamp =
        statusLamp(
          item,
          value
        );

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
            endOfDay: false
          }
        );

      const regClose =
        toDateMaybe(
          item.regCloseAt,
          {
            endOfDay: true
          }
        );

      const registrationDatesLine =
        regOpen ||
        regClose
          ? `Реєстрація: ${
              fmtDate(regOpen)
            } — ${
              fmtDate(regClose)
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

      /*
       * Якщо цей етап був вибраний
       * і все ще доступний —
       * залишаємо його вибраним.
       */
      const shouldRemainChecked =
        open &&
        previousPickedValue ===
          value;

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
          ${
            shouldRemainChecked
              ? "checked"
              : ""
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

  /*
   * Payment UI залишаємо без змін.
   */
  refreshPaymentUI(
    visibleItems
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

        /*
         * Коли користувач реально
         * вибирає інший етап —
         * payment UI перемикається
         * саме на нього.
         */
        setPayUIFromSelected(
          selectedItem ||
          getDefaultPaymentItem(
            lastItems
          )
        );

        if (selectedItem) {
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
                state === "pending"
              ) {
                setMsg(
                  "Ви маєте право участі у фіналі, але реєстрація ще не розпочалася.",
                  false
                );

              } else if (
                state === "closed"
              ) {
                setMsg(
                  "Ви маєте право участі у фіналі, але реєстрація вже завершена.",
                  false
                );

              } else {
                setMsg("");
              }
            }

          } else {
            const state =
              getRegistrationState(
                selectedItem
              );

            if (
              state === "pending"
            ) {
              setMsg(
                "Реєстрація на це змагання ще не розпочалася.",
                false
              );

            } else if (
              state === "closed"
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
              setMsg("");
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
        user || null;

      profile = null;

      finalAccessByEvent.clear();

      setMsg("");

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

        await loadFinalAccess(
          lastItems
        );

        renderItems(
          lastItems
        );

        refreshSubmitState();

      } catch (error) {
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
    finalQualification = false,
    seasonYear = null
  }) {
    return {
      uid:
        uid || null,

      competitionId,

      stageId:
        stageId || null,

      entryType:
        entryType || "team",

      teamId:
        teamId || null,

      teamName:
        teamName || null,

      status:
        status ||
        "pending_payment",

      finalQualification:
        finalQualification ===
        true,

      /*
       * Legacy compatibility.
       */
      finalInvite:
        finalQualification ===
        true,

      seasonYear:
        finalQualification
          ? (
              seasonYear ||
              null
            )
          : null,

      source:
        finalQualification
          ? "final_qualification_registration"
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

    const seasonYear =
      getSeasonYearFromItem(
        selectedItem
      );

    if (
      !seasonYear
    ) {
      throw new Error(
        "Для фіналу не визначено сезон."
      );
    }

    const competitionId =
      normalize(
        selectedItem.compId
      );

    const stageId =
      normalize(
        selectedItem.stageKey
      ) || "final";

    const qualificationRef =
      getFinalQualificationRef(
        selectedItem,
        profile.teamId
      );

    if (
      !qualificationRef
    ) {
      throw new Error(
        "Не вдалося визначити фінальну кваліфікацію."
      );
    }

    await db.runTransaction(
      async transaction => {
        const qualificationSnap =
          await transaction.get(
            qualificationRef
          );

        if (
          !qualificationSnap.exists
        ) {
          throw new Error(
            "Ваша команда не має права участі у цьому фіналі."
          );
        }

        const qualification =
          qualificationSnap.data() ||
          {};

        const qualificationStatus =
          normalizeLower(
            qualification.status
          );

        const qualificationTeamId =
          normalize(
            qualification.teamId
          );

        const qualificationCompetitionId =
          normalize(
            qualification.competitionId
          );

        const qualificationStageId =
          normalize(
            qualification.stageId
          );

        const qualificationSeason =
          normalize(
            qualification.seasonYear
          );

        if (
          qualificationTeamId &&
          qualificationTeamId !==
            profile.teamId
        ) {
          throw new Error(
            "Фінальна кваліфікація належить іншій команді."
          );
        }

        if (
          qualificationSeason &&
          qualificationSeason !==
            seasonYear
        ) {
          throw new Error(
            "Фінальна кваліфікація належить іншому сезону."
          );
        }

        if (
          qualificationCompetitionId &&
          qualificationCompetitionId !==
            competitionId
        ) {
          throw new Error(
            "Фінальна кваліфікація належить іншому змаганню."
          );
        }

        if (
          qualificationStageId &&
          qualificationStageId !==
            stageId
        ) {
          throw new Error(
            "Фінальна кваліфікація належить іншому фіналу."
          );
        }

        if (
          qualificationStatus !==
          "invited"
        ) {
          if (
            qualificationStatus ===
            "reserve"
          ) {
            throw new Error(
              "Ваша команда зараз у резерві. Очікуйте звільнення місця."
            );
          }

          if (
            qualificationStatus ===
            "declined"
          ) {
            throw new Error(
              "Команда відмовилася від участі у фіналі."
            );
          }

          if (
            qualificationStatus ===
            "confirmed"
          ) {
            throw new Error(
              "Участь у фіналі вже підтверджена."
            );
          }

          throw new Error(
            "Право участі у фіналі зараз неактивне."
          );
        }

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

        transaction.set(
          registrationRef,
          payload,
          {
            merge: false
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
              eventValue(item) ===
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

        if (
          entryType === "team"
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

        const status =
          payment.payEnabled
            ? "pending_payment"
            : "confirmed";

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
            .doc(docId);

        const finalSeasonYear =
          selectedItem.isFinal
            ? getSeasonYearFromItem(
                selectedItem
              )
            : null;

        const payload = {
          uid:
            profile.uid,

          competitionId,

          stageId:
            stageId || null,

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

          finalQualification:
            selectedItem.isFinal ===
            true,

          /*
           * Legacy flag.
           */
          finalInvite:
            selectedItem.isFinal ===
            true,

          seasonYear:
            finalSeasonYear,

          source:
            selectedItem.isFinal
              ? "final_qualification_registration"
              : "registration",

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
            status === "confirmed"
              ? fb.firestore
                  .FieldValue
                  .serverTimestamp()
              : null
        };

        try {
          setLoading(true);
          setMsg("");

          if (
            selectedItem.isFinal
          ) {
            await createFinalRegistration({
              selectedItem,
              registrationRef,
              payload
            });

          } else {
            await registrationRef.set(
              payload,
              {
                merge: false
              }
            );
          }

          // =================================================
          // PUBLIC MIRROR
          // =================================================

          try {
            const publicRef =
              db
                .collection(
                  "public_participants"
                )
                .doc(docId);

            const publicPayload =
              buildPublicPayload({
                uid:
                  profile.uid,

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

                status,

                finalQualification:
                  selectedItem.isFinal ===
                  true,

                seasonYear:
                  finalSeasonYear
              });

            await publicRef.set(
              publicPayload,
              {
                merge: false
              }
            );

          } catch (
            mirrorError
          ) {
            console.warn(
              "[Registration] public_participants:",
              mirrorError
            );
          }

          // =================================================
          // SUCCESS
          // =================================================

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

          /*
           * reset прибирає checked radio.
           */
          form.reset();

          /*
           * Після фінальної заявки
           * перечитуємо qualification
           * та registration.
           */
          if (
            selectedItem.isFinal
          ) {
            await loadFinalAccess(
              lastItems
            );
          }

          /*
           * Повторний render:
           *
           * - відновлює правильні статуси;
           * - payment UI НЕ пропадає;
           * - показує актуальний внесок.
           */
          renderItems(
            lastItems
          );

          refreshSubmitState();

        } catch (error) {
          console.error(
            "[Registration] submit:",
            error
          );

          const code =
            String(
              error?.code ||
              ""
            ).toLowerCase();

          const message =
            String(
              error?.message ||
              ""
            ).trim();

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
                ? "Firebase не дозволив реєстрацію у фінал. Перевірте finalQualifications цього сезону та Firestore Rules."
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
          setLoading(false);
        }
      }
    );
  }

})();
