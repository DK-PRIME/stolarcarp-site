// assets/js/register_firebase.js
// STOLAR CARP • Registration
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// TEAM
// • користувач повинен мати teamId
// • teamId повинен існувати в teams
// • одна заявка на команду
// • displayName = teamName
//
// SOLO
// • користувач ТЕЖ повинен мати teamId
// • teamId/teamName зберігаються як прив'язка
// • окрема заявка по UID
// • participantName = Ім'я Прізвище
// • displayName = participantName
// • кілька людей однієї команди можуть зареєструватись
//
// FINAL
// • тільки TEAM
// • доступ через finalQualifications/{year}/teams/{teamId}
//
// ВАЖЛИВО:
// • звичайний користувач НЕ читає registrations перед CREATE
// • дубль перевіряємо через public_participants
//
// =========================================================

(async function () {
  "use strict";

  // =========================================================
  // DOM
  // =========================================================

  const $ = id =>
    document.getElementById(id);

  const form =
    $("regForm");

  const eventOptionsEl =
    $("eventOptions");

  const msgEl =
    $("msg");

  const submitBtn =
    $("submitBtn");

  const spinnerEl =
    $("spinner");

  const hpInput =
    $("hp");

  const profileSummary =
    $("profileSummary");

  const rulesChk =
    $("rules");

  const copyPayBtn =
    $("copyCard");

  const payBoxEl =
    $("cardNum");

  const payAmountEl =
    $("payAmount");

  const payCurrEl =
    $("payCurrency");

  const payDetailsEl =
    $("payDetails");

  // =========================================================
  // STATE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  let currentUser = null;
  let profile = null;

  let lastItems = [];
  let activePayCopyText = "";

  const finalAccessByEvent =
    new Map();

  const FINISHED_HIDE_GRACE_MS =
    24 * 60 * 60 * 1000;

  // =========================================================
  // HELPERS
  // =========================================================

  const sleep = ms =>
    new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );

  function normalize(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function normalizeLower(value) {
    return normalize(value)
      .toLowerCase();
  }

  function firstDefined(
    ...values
  ) {
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

  function escapeHtml(value) {
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

    return [
      "true",
      "yes",
      "on"
    ].includes(
      normalizeLower(value)
    );
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

  function setLoading(value) {
    if (spinnerEl) {
      spinnerEl.classList.toggle(
        "spinner--on",
        Boolean(value)
      );
    }

    refreshSubmitState();
  }

  // =========================================================
  // FIREBASE WAIT
  // =========================================================

  async function waitForFirebase() {
    for (
      let i = 0;
      i < 150;
      i++
    ) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        auth =
          window.scAuth;

        db =
          window.scDb;

        fb =
          window.firebase;

        return;
      }

      await sleep(100);
    }

    throw new Error(
      "Firebase init не завантажився."
    );
  }

  // =========================================================
  // DATES
  // =========================================================

  function parseDateYMD(
    value,
    endOfDay = false
  ) {
    const match =
      normalize(value)
        .match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!match) {
      return null;
    }

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );
  }

  function toDateMaybe(
    value,
    endOfDay = false
  ) {
    if (!value) {
      return null;
    }

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
        typeof value.toDate ===
        "function"
      ) {
        return value.toDate();
      }

      if (
        typeof value.seconds ===
        "number"
      ) {
        return new Date(
          value.seconds *
          1000
        );
      }

      if (
        typeof value ===
        "string"
      ) {
        const dateOnly =
          parseDateYMD(
            value,
            endOfDay
          );

        if (dateOnly) {
          return dateOnly;
        }
      }

      const date =
        new Date(value);

      return Number.isFinite(
        date.getTime()
      )
        ? date
        : null;

    } catch {
      return null;
    }
  }

  function fmtDate(value) {
    const date =
      toDateMaybe(value);

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

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function entryTypeFromEvent(
    event,
    competition
  ) {
    const explicit =
      normalizeLower(
        firstDefined(
          event?.entryType,
          competition?.entryType
        )
      );

    if (
      explicit === "solo" ||
      explicit === "team"
    ) {
      return explicit;
    }

    const format =
      normalizeLower(
        firstDefined(
          event?.format,
          competition?.format,
          competition?.engine
            ?.baseFormat
        )
      );

    return format ===
      "stalker-solo"
      ? "solo"
      : "team";
  }

  // =========================================================
  // FINAL
  // =========================================================

  function isFinalEvent(
    eventKey,
    event
  ) {
    const text =
      normalizeLower(
        [
          eventKey,
          event?.key,
          event?.stageId,
          event?.id,
          event?.title,
          event?.name,
          event?.label
        ].join(" ")
      );

    return (
      event?.isFinal === true ||
      text.includes("final") ||
      text.includes("фінал")
    );
  }

  function getSeasonYearFromItem(
    item
  ) {
    if (
      /^\d{4}$/.test(
        normalize(
          item?.year
        )
      )
    ) {
      return normalize(
        item.year
      );
    }

    const match =
      [
        item?.compId,
        item?.compTitle,
        item?.stageTitle
      ]
        .join(" ")
        .match(
          /\b20\d{2}\b/
        );

    return match
      ? match[0]
      : "";
  }

  function eventValue(item) {
    return (
      `${item?.compId || ""}||` +
      `${item?.stageKey || ""}`
    );
  }

  // =========================================================
  // PAYMENT
  // =========================================================

  function getPaymentData(
    event,
    competition
  ) {
    const ep =
      event?.payment ||
      {};

    const cp =
      competition?.payment ||
      {};

    const price =
      normalizeMoney(
        firstDefined(
          ep.price,
          ep.amount,

          event?.price,
          event?.fee,
          event?.entryFee,
          event?.amount,
          event?.paymentAmount,

          cp.price,
          cp.amount,

          competition?.price,
          competition?.fee,
          competition?.entryFee,
          competition?.amount,
          competition?.paymentAmount
        )
      );

    const details =
      normalize(
        firstDefined(
          ep.details,
          ep.payDetails,

          event?.payDetails,
          event?.paymentDetails,
          event?.paymentText,
          event?.requisites,
          event?.bankDetails,
          event?.card,
          event?.cardNumber,

          cp.details,
          cp.payDetails,

          competition?.payDetails,
          competition?.paymentDetails,
          competition?.paymentText,
          competition?.requisites,
          competition?.bankDetails,
          competition?.card,
          competition?.cardNumber
        )
      );

    const enabled =
      normalizeBoolean(
        firstDefined(
          ep.enabled,

          event?.payEnabled,
          event?.paymentEnabled,

          cp.enabled,

          competition?.payEnabled,
          competition?.paymentEnabled
        )
      )
      ||
      (
        price !== null &&
        price > 0
      )
      ||
      Boolean(details);

    return {
      payEnabled:
        enabled,

      price,

      currency:
        normalize(
          firstDefined(
            ep.currency,
            event?.currency,
            event?.paymentCurrency,

            cp.currency,

            competition?.currency,
            competition?.paymentCurrency,

            "UAH"
          )
        ).toUpperCase(),

      payDetails:
        details
    };
  }

  function setPayUI(item) {
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

    if (!item.payEnabled) {
      activePayCopyText = "";

      if (payAmountEl) {
        payAmountEl.textContent =
          "0";
      }

      if (payCurrEl) {
        payCurrEl.textContent =
          item.currency ||
          "UAH";
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

    const details =
      item.payDetails ||
      "Реквізити не задані.";

    activePayCopyText =
      item.payDetails ||
      "";

    if (payAmountEl) {
      payAmountEl.textContent =
        item.price === null
          ? "—"
          : String(
              item.price
            );
    }

    if (payCurrEl) {
      payCurrEl.textContent =
        item.currency ||
        "UAH";
    }

    if (payDetailsEl) {
      payDetailsEl.textContent =
        details;
    }

    if (payBoxEl) {
      payBoxEl.textContent =
        details;
    }
  }

  if (copyPayBtn) {
    copyPayBtn.onclick =
      async () => {
        if (!activePayCopyText) {
          alert(
            "Нема реквізитів для копіювання."
          );

          return;
        }

        try {
          await navigator
            .clipboard
            .writeText(
              activePayCopyText
            );

          const old =
            copyPayBtn.textContent;

          copyPayBtn.textContent =
            "Скопійовано ✔";

          setTimeout(
            () => {
              copyPayBtn.textContent =
                old;
            },
            1200
          );

        } catch {
          alert(
            "Не вдалося скопіювати."
          );
        }
      };
  }

  // =========================================================
  // COMPETITION BUILD
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

    const eventKey =
      event
        ? (
            ev.key ||
            ev.stageId ||
            ev.id ||
            `stage-${eventIndex + 1}`
          )
        : null;

    const finalEvent =
      event
        ? isFinalEvent(
            eventKey,
            ev
          )
        : false;

    const eventSchedule =
      ev.schedule ||
      {};

    const compSchedule =
      c.schedule ||
      {};

    const eventRegistration =
      ev.registration ||
      {};

    const compRegistration =
      c.registration ||
      {};

    const payment =
      getPaymentData(
        ev,
        c
      );

    return {
      compId,

      year:
        normalize(
          firstDefined(
            ev.year,
            ev.seasonYear,
            c.year,
            c.seasonYear
          )
        ),

      brand:
        c.brand ||
        "STOLAR CARP",

      compTitle:
        c.name ||
        c.title ||
        compId,

      stageKey:
        eventKey
          ? String(
              eventKey
            )
          : null,

      stageTitle:
        event
          ? (
              ev.title ||
              ev.name ||
              ev.label ||
              (
                finalEvent
                  ? "Фінал"
                  : `Етап ${
                      eventIndex +
                      1
                    }`
              )
            )
          : null,

      isFinal:
        finalEvent,

      entryType:
        finalEvent
          ? "team"
          : entryTypeFromEvent(
              ev,
              c
            ),

      startAt:
        toDateMaybe(
          firstDefined(
            ev.startAt,
            ev.startDate,
            eventSchedule.startAt,
            eventSchedule.startDate,

            c.startAt,
            c.startDate,
            compSchedule.startAt,
            compSchedule.startDate
          )
        ),

      endAt:
        toDateMaybe(
          firstDefined(
            ev.finishAt,
            ev.finishDate,
            ev.endAt,
            ev.endDate,

            eventSchedule.finishAt,
            eventSchedule.finishDate,

            c.finishAt,
            c.finishDate,
            c.endAt,
            c.endDate,

            compSchedule.finishAt,
            compSchedule.finishDate
          )
        ),

      regOpenAt:
        firstDefined(
          ev.regOpen,
          ev.regOpenDate,
          ev.registrationOpenDate,
          eventRegistration.openDate,

          c.regOpen,
          c.regOpenDate,
          c.registrationOpenDate,
          compRegistration.openDate
        ),

      regCloseAt:
        firstDefined(
          ev.regClose,
          ev.regCloseDate,
          ev.registrationCloseDate,
          eventRegistration.closeDate,

          c.regClose,
          c.regCloseDate,
          c.registrationCloseDate,
          compRegistration.closeDate
        ),

      regMode:
        normalizeLower(
          firstDefined(
            eventRegistration.mode,
            ev.regMode,

            compRegistration.mode,
            c.regMode,

            "auto"
          )
        ),

      manualOpen:
        normalizeBoolean(
          firstDefined(
            eventRegistration.manualOpen,
            ev.manualOpen,

            compRegistration.manualOpen,
            c.manualOpen
          )
        ),

      payEnabled:
        payment.payEnabled,

      price:
        payment.price,

      currency:
        payment.currency,

      payDetails:
        payment.payDetails
    };
  }

  // =========================================================
  // REGISTRATION STATE
  // =========================================================

  function isFinishedEvent(item) {
    if (!item?.endAt) {
      return false;
    }

    return (
      Date.now() >
      item.endAt.getTime() +
      FINISHED_HIDE_GRACE_MS
    );
  }

  function visibleItemsOnly(array) {
    return (
      array ||
      []
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
      new Date();

    const openAt =
      toDateMaybe(
        item.regOpenAt,
        false
      );

    const closeAt =
      toDateMaybe(
        item.regCloseAt,
        true
      );

    if (
      openAt &&
      now < openAt
    ) {
      return "pending";
    }

    if (
      closeAt &&
      now > closeAt
    ) {
      return "closed";
    }

    if (
      openAt ||
      closeAt
    ) {
      return "open";
    }

    if (
      item.regMode ===
        "manual" &&
      item.manualOpen
    ) {
      return "open";
    }

    return "unavailable";
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async function loadProfile(
    user
  ) {
    const snap =
      await db
        .collection(
          "users"
        )
        .doc(
          user.uid
        )
        .get();

    if (!snap.exists) {
      throw new Error(
        "Нема профілю. Зайдіть у «Мій кабінет»."
      );
    }

    const data =
      snap.data() ||
      {};

    const teamId =
      normalize(
        data.teamId
      );

    let teamName =
      "";

    if (teamId) {
      const teamSnap =
        await db
          .collection(
            "teams"
          )
          .doc(
            teamId
          )
          .get();

      if (teamSnap.exists) {
        teamName =
          normalize(
            (
              teamSnap.data() ||
              {}
            ).name
          );
      }
    }

    profile = {
      uid:
        user.uid,

      email:
        user.email ||
        "",

      fullName:
        normalize(
          data.fullName ||
          data.name
        ),

      phone:
        normalize(
          data.phone
        ),

      teamId:
        teamId ||
        null,

      teamName
    };

    renderProfileSummary();
  }

  function getParticipantName() {
    return normalize(
      profile?.fullName ||
      profile?.email
    );
  }

  function hasTeam() {
    return Boolean(
      profile?.teamId &&
      profile?.teamName
    );
  }

  function renderProfileSummary(
    selectedItem = null
  ) {
    if (
      !profileSummary ||
      !profile
    ) {
      return;
    }

    const participantName =
      getParticipantName();

    if (
      selectedItem?.entryType ===
        "solo" &&
      !selectedItem?.isFinal
    ) {
      profileSummary.innerHTML =
        `Учасник: <b>${escapeHtml(
          participantName ||
          "—"
        )}</b><br>` +

        `Телефон: <b>${escapeHtml(
          profile.phone ||
          "не вказано"
        )}</b>`;

      return;
    }

    if (
      selectedItem?.entryType ===
        "team" ||
      selectedItem?.isFinal
    ) {
      profileSummary.innerHTML =
        `Команда: <b>${escapeHtml(
          profile.teamName ||
          "— (нема команди)"
        )}</b><br>` +

        `Заявник: <b>${escapeHtml(
          participantName ||
          "—"
        )}</b><br>` +

        `Телефон: <b>${escapeHtml(
          profile.phone ||
          "не вказано"
        )}</b>`;

      return;
    }

    profileSummary.innerHTML =
      `Користувач: <b>${escapeHtml(
        participantName ||
        "—"
      )}</b><br>` +

      `Телефон: <b>${escapeHtml(
        profile.phone ||
        "не вказано"
      )}</b>`;
  }

  // =========================================================
  // REGISTRATION ID
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
        `${uid}`
      );
    }

    return (
      `${competitionId}__` +
      `${stage}__team__` +
      `${teamId}`
    );
  }

  // =========================================================
  // FINAL ACCESS
  // =========================================================

  async function loadFinalAccess() {
    finalAccessByEvent.clear();

    const finalItems =
      lastItems.filter(
        item =>
          item.isFinal
      );

    for (
      const item of finalItems
    ) {
      const key =
        eventValue(item);

      if (
        !currentUser ||
        !profile
      ) {
        finalAccessByEvent.set(
          key,
          {
            status:
              "login_required",

            registrationExists:
              false,

            rank:
              0
          }
        );

        continue;
      }

      if (!hasTeam()) {
        finalAccessByEvent.set(
          key,
          {
            status:
              "no_team",

            registrationExists:
              false,

            rank:
              0
          }
        );

        continue;
      }

      const year =
        getSeasonYearFromItem(
          item
        );

      if (!year) {
        finalAccessByEvent.set(
          key,
          {
            status:
              "error",

            registrationExists:
              false,

            rank:
              0
          }
        );

        continue;
      }

      const stageId =
        normalize(
          item.stageKey
        ) ||
        "final";

      const regId =
        buildRegDocId({
          competitionId:
            item.compId,

          stageId,

          entryType:
            "team",

          uid:
            profile.uid,

          teamId:
            profile.teamId
        });

      try {
        /*
         * ВАЖЛИВО:
         *
         * registrations тут НЕ читаємо.
         *
         * public_participants має public read,
         * тому звичайний користувач
         * може безпечно перевірити,
         * чи заявка вже існує.
         */
        const [
          qualificationSnap,
          publicSnap
        ] =
          await Promise.all([
            db
              .collection(
                "finalQualifications"
              )
              .doc(year)
              .collection(
                "teams"
              )
              .doc(
                profile.teamId
              )
              .get(),

            db
              .collection(
                "public_participants"
              )
              .doc(
                regId
              )
              .get()
          ]);

        const q =
          qualificationSnap.exists
            ? (
                qualificationSnap
                  .data() ||
                {}
              )
            : {};

        let valid =
          qualificationSnap.exists;

        if (
          valid &&
          q.teamId &&
          normalize(
            q.teamId
          ) !==
            profile.teamId
        ) {
          valid = false;
        }

        if (
          valid &&
          q.competitionId &&
          normalize(
            q.competitionId
          ) !==
            item.compId
        ) {
          valid = false;
        }

        if (
          valid &&
          q.stageId &&
          normalize(
            q.stageId
          ) !==
            stageId
        ) {
          valid = false;
        }

        const publicData =
          publicSnap.exists
            ? (
                publicSnap.data() ||
                {}
              )
            : {};

        finalAccessByEvent.set(
          key,
          {
            status:
              valid
                ? normalizeLower(
                    q.status ||
                    "reserve"
                  )
                : "not_invited",

            rank:
              valid
                ? Number(
                    q.rank ||
                    q.place ||
                    0
                  )
                : 0,

            registrationExists:
              publicSnap.exists,

            registrationStatus:
              normalizeLower(
                publicData.status
              )
          }
        );

      } catch (error) {
        console.warn(
          "[Registration] final access:",
          error
        );

        finalAccessByEvent.set(
          key,
          {
            status:
              "error",

            registrationExists:
              false,

            rank:
              0
          }
        );
      }
    }
  }

  function getFinalAccess(item) {
    return (
      finalAccessByEvent.get(
        eventValue(item)
      ) ||
      null
    );
  }

  function canRegisterFinal(item) {
    const access =
      getFinalAccess(item);

    return Boolean(
      access &&
      access.status ===
        "invited" &&
      !access.registrationExists
    );
  }

  function canSubmitItem(item) {
    if (!item) {
      return false;
    }

    if (
      getRegistrationState(
        item
      ) !== "open"
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
  // STATUS UI
  // =========================================================

  function getStatusUI(item) {
    if (item.isFinal) {
      const access =
        getFinalAccess(
          item
        );

      if (
        access?.registrationExists
      ) {
        if (
          access.registrationStatus ===
          "confirmed"
        ) {
          return {
            short:
              "Підтверджено",

            badge:
              "ПІДТВЕРДЖЕНО",

            text:
              "Участь у фіналі підтверджена ✅",

            badgeClass:
              "pill-b--open",

            lamp:
              "lamp-green"
          };
        }

        return {
          short:
            "Заявка подана",

          badge:
            "ЗАЯВКА Є",

          text:
            "Заявка на фінал уже подана.",

          badgeClass:
            "pill-b--closed",

          lamp:
            "lamp-green"
        };
      }

      if (
        access?.status ===
        "invited"
      ) {
        return {
          short:
            "Фіналіст",

          badge:
            "ФІНАЛІСТ",

          text:
            access.rank
              ? `Ваша команда має право участі у фіналі. Місце у рейтингу №${access.rank}.`
              : "Ваша команда має право участі у фіналі.",

          badgeClass:
            canRegisterFinal(item)
              ? "pill-b--open"
              : "pill-b--closed",

          lamp:
            getRegistrationState(
              item
            ) === "open"
              ? "lamp-green"
              : "lamp-yellow"
        };
      }

      if (
        access?.status ===
        "reserve"
      ) {
        return {
          short:
            "Резерв",

          badge:
            access.rank
              ? `РЕЗЕРВ №${access.rank}`
              : "РЕЗЕРВ",

          text:
            "Команда перебуває у резерві.",

          badgeClass:
            "pill-b--closed",

          lamp:
            "lamp-yellow"
        };
      }

      if (
        access?.status ===
        "declined"
      ) {
        return {
          short:
            "Відмова",

          badge:
            "ВІДМОВА",

          text:
            "Команда відмовилась від участі.",

          badgeClass:
            "pill-b--closed",

          lamp:
            "lamp-red"
        };
      }

      return {
        short:
          "Фінал",

        badge:
          "ЗА РЕЙТИНГОМ",

        text:
          "Реєстрація доступна тільки командам, які отримали право участі.",

        badgeClass:
          "pill-b--closed",

        lamp:
          "lamp-red"
      };
    }

    const state =
      getRegistrationState(
        item
      );

    if (
      state ===
      "open"
    ) {
      return {
        short:
          "Відкрито",

        badge:
          "ВІДКРИТО",

        text:
          "Реєстрація відкрита ✅",

        badgeClass:
          "pill-b--open",

        lamp:
          "lamp-green"
      };
    }

    if (
      state ===
      "pending"
    ) {
      return {
        short:
          "Очікується",

        badge:
          "ОЧІКУЄТЬСЯ",

        text:
          "Реєстрація ще не розпочалась.",

        badgeClass:
          "pill-b--closed",

        lamp:
          "lamp-yellow"
      };
    }

    return {
      short:
        "Закрито",

      badge:
        "ЗАКРИТО",

      text:
        state ===
        "unavailable"
          ? "Дати реєстрації не налаштовані."
          : "Реєстрація завершена.",

      badgeClass:
        "pill-b--closed",

      lamp:
        "lamp-red"
    };
  }

  // =========================================================
  // RENDER
  // =========================================================

  function getSelectedItem() {
    const picked =
      document.querySelector(
        'input[name="stagePick"]:checked'
      );

    if (!picked) {
      return null;
    }

    return (
      lastItems.find(
        item =>
          eventValue(
            item
          ) ===
          picked.value
      ) ||
      null
    );
  }

  function renderItems() {
    if (!eventOptionsEl) {
      return;
    }

    const oldSelected =
      getSelectedItem();

    const oldValue =
      oldSelected
        ? eventValue(
            oldSelected
          )
        : "";

    eventOptionsEl.innerHTML =
      "";

    const visible =
      visibleItemsOnly(
        lastItems
      );

    if (!visible.length) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Наразі немає доступних змагань.</p>';

      setPayUI(null);

      refreshSubmitState();

      return;
    }

    visible.forEach(
      item => {
        const value =
          eventValue(item);

        const status =
          getStatusUI(item);

        const enabled =
          canSubmitItem(item);

        const label =
          document.createElement(
            "label"
          );

        label.className =
          "event-item" +
          (
            enabled
              ? ""
              : " is-closed"
          );

        if (item.isFinal) {
          label.classList.add(
            "event-item--final"
          );
        }

        const checked =
          enabled &&
          oldValue === value;

        const title =
          `${item.brand} · ${item.compTitle}` +
          (
            item.stageTitle
              ? ` — ${item.stageTitle}`
              : ""
          );

        label.innerHTML = `
          <input
            type="radio"
            name="stagePick"
            value="${escapeHtml(value)}"
            ${enabled ? "" : "disabled"}
            ${checked ? "checked" : ""}
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
                justify-content:space-between;
                align-items:center;
                gap:10px;
                margin-bottom:8px;
              "
            >

              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                "
              >
                <span
                  class="lamp ${status.lamp}"
                ></span>

                <span
                  style="
                    font-size:12px;
                    color:var(--muted);
                    font-weight:800;
                  "
                >
                  ${escapeHtml(status.short)}
                </span>
              </div>

              <span
                class="pill-b ${status.badgeClass}"
              >
                ${escapeHtml(status.badge)}
              </span>

            </div>

            <div
              style="
                font-weight:900;
                font-size:16px;
                line-height:1.28;
                color:#f3f4f6;
              "
            >
              ${escapeHtml(title)}
            </div>

            <div
              style="
                margin-top:7px;
                color:var(--muted);
                font-size:13px;
              "
            >
              ${escapeHtml(
                fmtDate(
                  item.startAt
                )
              )}
              —
              ${escapeHtml(
                fmtDate(
                  item.endAt
                )
              )}
            </div>

            <div
              style="
                margin-top:5px;
                color:var(--muted);
                font-size:12px;
              "
            >
              Реєстрація:
              ${escapeHtml(
                fmtDate(
                  item.regOpenAt
                )
              )}
              —
              ${escapeHtml(
                fmtDate(
                  item.regCloseAt
                )
              )}
            </div>

            <div
              style="
                margin-top:7px;
                color:var(--muted);
                font-size:13px;
                line-height:1.4;
              "
            >
              ${escapeHtml(status.text)}
            </div>

          </div>
        `;

        eventOptionsEl.appendChild(
          label
        );
      }
    );

    const selected =
      getSelectedItem();

    const defaultPaymentItem =
      selected ||
      visible.find(
        item =>
          getRegistrationState(
            item
          ) === "open"
      ) ||
      visible[0];

    setPayUI(
      defaultPaymentItem
    );

    refreshSubmitState();
  }

  // =========================================================
  // LOAD COMPETITIONS
  // =========================================================

  async function loadCompetitions() {
    const snapshot =
      await db
        .collection(
          "competitions"
        )
        .get();

    const result =
      [];

    snapshot.forEach(
      docSnap => {
        const competition =
          docSnap.data() ||
          {};

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
              result.push(
                buildCompetitionItem({
                  competition,

                  compId:
                    docSnap.id,

                  event,

                  eventIndex:
                    index
                })
              );
            }
          );

        } else {
          result.push(
            buildCompetitionItem({
              competition,

              compId:
                docSnap.id
            })
          );
        }
      }
    );

    result.sort(
      (a, b) => {
        const ta =
          a.startAt
            ? a.startAt.getTime()
            : Number.MAX_SAFE_INTEGER;

        const tb =
          b.startAt
            ? b.startAt.getTime()
            : Number.MAX_SAFE_INTEGER;

        return ta - tb;
      }
    );

    lastItems =
      visibleItemsOnly(
        result
      );

    await loadFinalAccess();

    renderItems();
  }

  // =========================================================
  // SUBMIT BUTTON
  // =========================================================

  function refreshSubmitState() {
    if (!submitBtn) {
      return;
    }

    if (
      spinnerEl?.classList.contains(
        "spinner--on"
      )
    ) {
      submitBtn.disabled =
        true;

      return;
    }

    const item =
      getSelectedItem();

    const rulesOk =
      rulesChk
        ? rulesChk.checked
        : true;

    /*
     * TEAM і SOLO
     * обидва мають командну прив'язку.
     */
    const teamOk =
      Boolean(
        profile &&
        profile.teamId &&
        profile.teamName
      );

    const participantOk =
      !item ||
      item.entryType !==
        "solo" ||
      Boolean(
        getParticipantName()
      );

    submitBtn.disabled =
      !(
        currentUser &&
        profile &&
        item &&
        rulesOk &&
        teamOk &&
        participantOk &&
        canSubmitItem(item)
      );
  }

  // =========================================================
  // CHANGE
  // =========================================================

  document.addEventListener(
    "change",
    event => {
      if (
        event.target?.name ===
        "stagePick"
      ) {
        const item =
          getSelectedItem();

        renderProfileSummary(
          item
        );

        setPayUI(
          item
        );

        if (
          item &&
          !hasTeam()
        ) {
          setMsg(
            item.entryType ===
              "solo"
              ? "Для SOLO ваш профіль повинен бути прив’язаний до команди. На змаганнях буде показано ваше ім’я та прізвище."
              : "Спочатку приєднайтесь до команди в «Мій кабінет».",
            false
          );

        } else if (
          item?.entryType ===
            "solo" &&
          !getParticipantName()
        ) {
          setMsg(
            "Для SOLO потрібно вказати ім’я та прізвище у «Мій кабінет».",
            false
          );

        } else {
          setMsg("");
        }
      }

      if (
        event.target?.name ===
          "stagePick" ||
        event.target?.id ===
          "rules"
      ) {
        refreshSubmitState();
      }
    }
  );

  // =========================================================
  // PAYLOAD
  // =========================================================

  function buildRegistrationPayload({
    item,
    entryType,
    status
  }) {
    const participantName =
      getParticipantName();

    return {
      uid:
        profile.uid,

      competitionId:
        item.compId,

      stageId:
        item.stageKey ||
        null,

      entryType,

      /*
       * TEAM + SOLO:
       * команда користувача.
       */
      teamId:
        profile.teamId,

      teamName:
        profile.teamName,

      /*
       * SOLO:
       * конкретний учасник.
       */
      participantName:
        entryType ===
          "solo"
          ? participantName
          : null,

      /*
       * SOLO показує ім'я,
       * TEAM показує команду.
       */
      displayName:
        entryType ===
          "solo"
          ? participantName
          : profile.teamName,

      captain:
        participantName,

      phone:
        profile.phone ||
        "",

      payEnabled:
        item.payEnabled ===
        true,

      price:
        item.price,

      currency:
        item.currency ||
        "UAH",

      payDetails:
        item.payDetails ||
        "",

      finalQualification:
        item.isFinal ===
        true,

      finalInvite:
        item.isFinal ===
        true,

      seasonYear:
        item.isFinal
          ? getSeasonYearFromItem(
              item
            )
          : null,

      source:
        item.isFinal
          ? "final_qualification_registration"
          : "registration",

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
  }

  function buildPublicPayload(
    payload
  ) {
    return {
      uid:
        payload.uid,

      competitionId:
        payload.competitionId,

      stageId:
        payload.stageId,

      entryType:
        payload.entryType,

      teamId:
        payload.teamId,

      teamName:
        payload.teamName,

      participantName:
        payload.participantName,

      displayName:
        payload.displayName,

      status:
        payload.status,

      finalQualification:
        payload.finalQualification,

      finalInvite:
        payload.finalInvite,

      seasonYear:
        payload.seasonYear,

      source:
        payload.source,

      createdAt:
        fb.firestore
          .FieldValue
          .serverTimestamp()
    };
  }

  // =========================================================
  // CREATE REGISTRATION
  // =========================================================

  async function createRegistration({
    item,
    registrationRef,
    publicRef,
    payload
  }) {
    await db.runTransaction(
      async transaction => {

        // =====================================================
        // FINAL QUALIFICATION
        // =====================================================

        if (item.isFinal) {
          const year =
            getSeasonYearFromItem(
              item
            );

          if (!year) {
            throw new Error(
              "Не визначено сезон фіналу."
            );
          }

          const qualificationRef =
            db
              .collection(
                "finalQualifications"
              )
              .doc(year)
              .collection(
                "teams"
              )
              .doc(
                profile.teamId
              );

          const qualificationSnap =
            await transaction.get(
              qualificationRef
            );

          if (
            !qualificationSnap.exists
          ) {
            throw new Error(
              "Ваша команда не має права участі у фіналі."
            );
          }

          const q =
            qualificationSnap.data() ||
            {};

          if (
            normalizeLower(
              q.status
            ) !==
            "invited"
          ) {
            throw new Error(
              "Право участі у фіналі зараз неактивне."
            );
          }

          if (
            q.competitionId &&
            normalize(
              q.competitionId
            ) !==
              item.compId
          ) {
            throw new Error(
              "Кваліфікація належить іншому фіналу."
            );
          }

          if (
            q.stageId &&
            normalize(
              q.stageId
            ) !==
              normalize(
                item.stageKey
              )
          ) {
            throw new Error(
              "Кваліфікація належить іншому етапу."
            );
          }
        }

        // =====================================================
        // DUPLICATE CHECK
        // =====================================================
        //
        // КРИТИЧНЕ ВИПРАВЛЕННЯ:
        //
        // registrations тут НЕ читаємо.
        //
        // Звичайний користувач може отримати
        // permission-denied на GET приватного
        // неіснуючого registration doc.
        //
        // public_participants має allow read: true,
        // тому перевіряємо дубль тут.
        // =====================================================

        const existingPublic =
          await transaction.get(
            publicRef
          );

        if (
          existingPublic.exists
        ) {
          throw new Error(
            payload.entryType ===
              "solo"
              ? "Ви вже подали заявку на це змагання."
              : "Ваша команда вже подала заявку на це змагання."
          );
        }

        // =====================================================
        // CREATE BOTH DOCUMENTS
        // =====================================================

        transaction.set(
          registrationRef,
          payload
        );

        transaction.set(
          publicRef,
          buildPublicPayload(
            payload
          )
        );
      }
    );
  }

  // =========================================================
  // SUBMIT
  // =========================================================

  if (form) {
    form.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        if (
          hpInput?.value
        ) {
          setMsg(
            "Підозра на бота.",
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

        const item =
          getSelectedItem();

        if (!item) {
          setMsg(
            "Оберіть змагання або етап.",
            false
          );

          return;
        }

        // =====================================================
        // TEAM LINK
        // =====================================================

        if (!profile.teamId) {
          setMsg(
            item.entryType ===
              "solo"
              ? "Для SOLO ваш профіль повинен бути прив’язаний до команди."
              : "Спочатку приєднайтесь до команди в «Мій кабінет».",
            false
          );

          return;
        }

        if (!profile.teamName) {
          setMsg(
            "Не знайдено вашу команду в Firebase.",
            false
          );

          return;
        }

        // =====================================================
        // SOLO NAME
        // =====================================================

        if (
          item.entryType ===
            "solo" &&
          !getParticipantName()
        ) {
          setMsg(
            "Для SOLO потрібно вказати ім’я та прізвище.",
            false
          );

          return;
        }

        // =====================================================
        // RULES CHECKBOX
        // =====================================================

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

        // =====================================================
        // AVAILABILITY
        // =====================================================

        if (
          !canSubmitItem(
            item
          )
        ) {
          setMsg(
            "Реєстрація зараз недоступна.",
            false
          );

          return;
        }

        const entryType =
          item.isFinal
            ? "team"
            : item.entryType;

        const docId =
          buildRegDocId({
            competitionId:
              item.compId,

            stageId:
              item.stageKey,

            entryType,

            uid:
              profile.uid,

            teamId:
              profile.teamId
          });

        const status =
          item.payEnabled
            ? "pending_payment"
            : "confirmed";

        const payload =
          buildRegistrationPayload({
            item,
            entryType,
            status
          });

        const registrationRef =
          db
            .collection(
              "registrations"
            )
            .doc(
              docId
            );

        const publicRef =
          db
            .collection(
              "public_participants"
            )
            .doc(
              docId
            );

        try {
          setLoading(true);

          setMsg("");

          await createRegistration({
            item,
            registrationRef,
            publicRef,
            payload
          });

          const participantName =
            getParticipantName();

          if (item.isFinal) {
            setMsg(
              item.payEnabled
                ? "Заявка на Фінал подана ✔ Очікується підтвердження оплати."
                : "Участь у Фіналі підтверджена ✔",
              true
            );

          } else if (
            entryType ===
            "solo"
          ) {
            setMsg(
              item.payEnabled
                ? `Заявка учасника «${participantName}» подана ✔ Очікується підтвердження оплати.`
                : `Заявка учасника «${participantName}» підтверджена ✔`,
              true
            );

          } else {
            setMsg(
              item.payEnabled
                ? "Заявка команди подана ✔ Очікується підтвердження оплати."
                : "Заявка команди підтверджена ✔",
              true
            );
          }

          form.reset();

          renderProfileSummary();

          await loadFinalAccess();

          renderItems();

        } catch (error) {
          console.error(
            "[Registration] submit:",
            error
          );

          const code =
            normalizeLower(
              error?.code
            );

          if (
            code.includes(
              "permission"
            )
          ) {
            setMsg(
              entryType ===
                "solo"
                ? "Firebase не дозволив створити SOLO-заявку."
                : "Firebase не дозволив створити заявку.",
              false
            );

          } else {
            setMsg(
              error?.message ||
              "Не вдалося подати заявку.",
              false
            );
          }

        } finally {
          setLoading(false);
        }
      }
    );
  }

  // =========================================================
  // AUTH
  // =========================================================

  function startAuthListener() {
    auth.onAuthStateChanged(
      async user => {
        currentUser =
          user ||
          null;

        profile =
          null;

        if (!user) {
          if (profileSummary) {
            profileSummary.textContent =
              "Увійдіть у акаунт, щоб подати заявку.";
          }

          await loadFinalAccess();

          renderItems();

          refreshSubmitState();

          return;
        }

        try {
          await loadProfile(
            user
          );

          await loadFinalAccess();

          renderItems();

          renderProfileSummary();

        } catch (error) {
          console.error(
            "[Registration] profile:",
            error
          );

          setMsg(
            error?.message ||
            "Помилка профілю.",
            false
          );
        }

        refreshSubmitState();
      }
    );
  }

  // =========================================================
  // INIT
  // =========================================================

  try {
    if (eventOptionsEl) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Завантаження списку...</p>';
    }

    await waitForFirebase();

    startAuthListener();

    await loadCompetitions();

    console.info(
      "[STOLAR CARP] Registration ready"
    );

  } catch (error) {
    console.error(
      "[Registration] init:",
      error
    );

    if (eventOptionsEl) {
      eventOptionsEl.innerHTML =
        `<p class="form__hint" style="color:#ff6c6c;">${escapeHtml(
          error?.message ||
          "Помилка запуску."
        )}</p>`;
    }

    if (submitBtn) {
      submitBtn.disabled =
        true;
    }
  }

})();
