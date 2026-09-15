// assets/js/final_decline.js
// STOLAR CARP • Відмова від участі у Фіналі
//
// =========================================================
// ЛОГІКА
// =========================================================
//
// Кнопка "Відмовитися від Фіналу" показується ТІЛЬКИ якщо:
//
// 1. користувач авторизований;
// 2. користувач має teamId;
// 3. існує finalQualifications/{year}/teams/{teamId};
// 4. status == "invited";
// 5. сезон ЩЕ НЕ завершений;
// 6. Фінал ЩЕ НЕ завершений;
// 7. реєстрація на Фінал ЩЕ НЕ закрита.
//
// Після завершення сезону стара qualification може залишатися
// status="invited" як історичний запис — це нормально.
// Кнопка при цьому більше НЕ показується.
//
// =========================================================

(function () {
  "use strict";

  const LOG =
    "[STOLAR CARP final_decline]";

  // =========================================================
  // CONFIG
  // =========================================================

  const QUALIFICATIONS_COLLECTION =
    "finalQualifications";

  const USERS_COLLECTION =
    "users";

  const COMPETITIONS_COLLECTION =
    "competitions";

  const SEASON_RATING_COLLECTION =
    "seasonRating";

  const SEASON_ARCHIVES_COLLECTION =
    "seasonArchives";

  const DECLINABLE_STATUS =
    "invited";

  // =========================================================
  // FIREBASE STATE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  // =========================================================
  // USER STATE
  // =========================================================

  let currentUser = null;

  let currentTeamId = "";

  // =========================================================
  // QUALIFICATION STATE
  // =========================================================

  let activeQualification =
    null;

  let unsubscribeQualification =
    null;

  let declining =
    false;

  let declineCompleted =
    false;

  // =========================================================
  // HELPERS
  // =========================================================

  function normalize(value) {
    return String(
      value ?? ""
    ).trim();
  }

  function clean(value) {
    return normalize(
      value
    ).toLowerCase();
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

  function sleep(ms) {
    return new Promise(
      resolve => {
        setTimeout(
          resolve,
          ms
        );
      }
    );
  }

  function serverTimestamp() {
    return fb
      .firestore
      .FieldValue
      .serverTimestamp();
  }

  function isValidYear(value) {
    return /^\d{4}$/.test(
      normalize(
        value
      )
    );
  }

  // =========================================================
  // DATE HELPERS
  // =========================================================

  function parseDateYMDLocal(
    value,
    endOfDay = false
  ) {
    const match =
      normalize(
        value
      ).match(
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

        const localDate =
          parseDateYMDLocal(
            raw,
            endOfDay
          );

        if (localDate) {
          return localDate;
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
        LOG,
        "date parse:",
        error
      );
    }

    return null;
  }

  // =========================================================
  // FIREBASE READY
  // =========================================================

  async function waitFirebase(
    maxMs = 15000
  ) {
    const startedAt =
      Date.now();

    while (
      Date.now() -
        startedAt <
      maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        return;
      }

      await sleep(
        100
      );
    }

    throw new Error(
      "Firebase не готовий."
    );
  }

  // =========================================================
  // UI
  // =========================================================

  function getOrCreateBox() {
    let box =
      document.getElementById(
        "finalDeclineBox"
      );

    if (box) {
      return box;
    }

    const formActions =
      document.querySelector(
        "#regForm .form-actions"
      );

    const form =
      document.getElementById(
        "regForm"
      );

    if (!form) {
      return null;
    }

    box =
      document.createElement(
        "div"
      );

    box.id =
      "finalDeclineBox";

    /*
     * За замовчуванням завжди приховано.
     */
    box.style.display =
      "none";

    box.style.marginTop =
      "10px";

    box.style.marginBottom =
      "0";

    box.innerHTML = `
      <button
        id="btnFinalDecline"
        type="button"
        style="
          width:100%;
          padding:11px 14px;
          border:1px solid rgba(239,68,68,.65);
          border-radius:12px;
          background:rgba(127,29,29,.35);
          color:#fecaca;
          font-weight:900;
          cursor:pointer;
          transition:
            opacity .15s ease,
            background .15s ease,
            border-color .15s ease;
        "
      >
        Відмовитися від Фіналу
      </button>

      <div
        id="finalDeclineMsg"
        role="status"
        aria-live="polite"
        style="
          display:none;
          margin-top:8px;
          padding:10px 12px;
          border-radius:10px;
          font-size:13px;
          line-height:1.4;
        "
      ></div>
    `;

    if (
      formActions &&
      formActions.parentNode
    ) {
      formActions
        .insertAdjacentElement(
          "afterend",
          box
        );
    } else {
      form.appendChild(
        box
      );
    }

    const button =
      box.querySelector(
        "#btnFinalDecline"
      );

    if (button) {
      button.addEventListener(
        "click",
        handleDecline
      );
    }

    return box;
  }

  // =========================================================
  // HIDE UI
  // =========================================================

  function hideBox(
    clearActive = true
  ) {
    const box =
      document.getElementById(
        "finalDeclineBox"
      );

    if (box) {
      box.style.display =
        "none";
    }

    if (
      clearActive
    ) {
      activeQualification =
        null;
    }
  }

  // =========================================================
  // SHOW UI
  // =========================================================

  function showBox(
    qualification
  ) {
    const data =
      qualification?.data ||
      {};

    const status =
      clean(
        data.status
      );

    if (
      status !==
      DECLINABLE_STATUS
    ) {
      hideBox();

      return;
    }

    const box =
      getOrCreateBox();

    if (!box) {
      return;
    }

    const msg =
      box.querySelector(
        "#finalDeclineMsg"
      );

    const button =
      box.querySelector(
        "#btnFinalDecline"
      );

    if (msg) {
      msg.textContent =
        "";

      msg.style.display =
        "none";
    }

    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Відмовитися від Фіналу";

      button.style.opacity =
        "1";

      button.style.cursor =
        "pointer";
    }

    box.style.display =
      "block";
  }

  // =========================================================
  // MESSAGE
  // =========================================================

  function setBoxMessage(
    text,
    ok = false
  ) {
    const msg =
      document.getElementById(
        "finalDeclineMsg"
      );

    if (!msg) {
      return;
    }

    const value =
      normalize(
        text
      );

    msg.textContent =
      value;

    if (!value) {
      msg.style.display =
        "none";

      return;
    }

    msg.style.display =
      "block";

    if (ok) {
      msg.style.color =
        "#86efac";

      msg.style.background =
        "rgba(22,101,52,.20)";

      msg.style.border =
        "1px solid rgba(34,197,94,.35)";
    } else {
      msg.style.color =
        "#fca5a5";

      msg.style.background =
        "rgba(127,29,29,.20)";

      msg.style.border =
        "1px solid rgba(239,68,68,.35)";
    }
  }

  // =========================================================
  // BUTTON STATE
  // =========================================================

  function setButtonLoading(
    value
  ) {
    const button =
      document.getElementById(
        "btnFinalDecline"
      );

    if (!button) {
      return;
    }

    const loading =
      Boolean(
        value
      );

    button.disabled =
      loading;

    button.textContent =
      loading
        ? "Зберігаю…"
        : "Відмовитися від Фіналу";

    button.style.opacity =
      loading
        ? ".65"
        : "1";

    button.style.cursor =
      loading
        ? "default"
        : "pointer";
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async function loadTeamId(
    user
  ) {
    if (!user) {
      return "";
    }

    const snapshot =
      await db
        .collection(
          USERS_COLLECTION
        )
        .doc(
          user.uid
        )
        .get();

    if (
      !snapshot.exists
    ) {
      return "";
    }

    const data =
      snapshot.data() ||
      {};

    return normalize(
      data.teamId
    );
  }

  // =========================================================
  // QUALIFICATION VALIDATION
  // =========================================================

  function qualificationMatchesTeam(
    data,
    teamId
  ) {
    if (
      !data ||
      !teamId
    ) {
      return false;
    }

    const storedTeamId =
      normalize(
        data.teamId
      );

    if (
      storedTeamId &&
      storedTeamId !==
        teamId
    ) {
      return false;
    }

    return true;
  }

  function qualificationMatchesYear(
    data,
    year
  ) {
    if (
      !data ||
      !year
    ) {
      return false;
    }

    const storedYear =
      normalize(
        data.seasonYear
      );

    if (
      storedYear &&
      storedYear !==
        String(year)
    ) {
      return false;
    }

    return true;
  }

  // =========================================================
  // SEASON CLOSED CHECK
  // =========================================================

  async function isSeasonClosed(
    year
  ) {
    const seasonYear =
      normalize(
        year
      );

    if (
      !isValidYear(
        seasonYear
      )
    ) {
      return false;
    }

    /*
     * 1. seasonRating/{year}.archived
     */
    try {
      const ratingSnap =
        await db
          .collection(
            SEASON_RATING_COLLECTION
          )
          .doc(
            seasonYear
          )
          .get();

      if (
        ratingSnap.exists
      ) {
        const rating =
          ratingSnap.data() ||
          {};

        if (
          rating.archived ===
          true
        ) {
          console.info(
            LOG,
            seasonYear,
            "seasonRating archived"
          );

          return true;
        }
      }

    } catch (
      error
    ) {
      console.warn(
        LOG,
        seasonYear,
        "seasonRating check:",
        error
      );
    }

    /*
     * 2. seasonArchives/{year}
     */
    try {
      const archiveSnap =
        await db
          .collection(
            SEASON_ARCHIVES_COLLECTION
          )
          .doc(
            seasonYear
          )
          .get();

      if (
        archiveSnap.exists
      ) {
        const archive =
          archiveSnap.data() ||
          {};

        const archiveStatus =
          clean(
            archive.status
          );

        /*
         * Новий формат:
         * status = archived.
         *
         * Для старого архіву самого
         * існування документа теж
         * достатньо, якщо status пустий.
         */
        if (
          archiveStatus ===
            "archived" ||
          archiveStatus ===
            "closed" ||
          archiveStatus ===
            "completed" ||
          !archiveStatus
        ) {
          console.info(
            LOG,
            seasonYear,
            "season archive found"
          );

          return true;
        }
      }

    } catch (
      error
    ) {
      console.warn(
        LOG,
        seasonYear,
        "seasonArchives check:",
        error
      );
    }

    return false;
  }

  // =========================================================
  // COMPETITION / FINAL CHECK
  // =========================================================

  function looksLikeFinalEvent(
    event,
    key = ""
  ) {
    const raw =
      clean(
        `${
          key || ""
        } ${
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
      event?.isFinal ===
        true ||
      raw.includes(
        "final"
      ) ||
      raw.includes(
        "фінал"
      )
    );
  }

  function findFinalEvent(
    competition,
    stageId
  ) {
    const events =
      Array.isArray(
        competition?.events
      )
        ? competition.events
        : [];

    if (
      !events.length
    ) {
      return null;
    }

    const wantedStageId =
      normalize(
        stageId
      );

    /*
     * Спочатку шукаємо
     * точний stageId/key/id.
     */
    if (
      wantedStageId
    ) {
      const exact =
        events.find(
          event => {
            const values = [
              event?.key,
              event?.stageId,
              event?.id
            ]
              .map(
                normalize
              )
              .filter(Boolean);

            return values.includes(
              wantedStageId
            );
          }
        );

      if (exact) {
        return exact;
      }
    }

    /*
     * Fallback:
     * шукаємо явно позначений Фінал.
     */
    const finalEvent =
      events.find(
        event =>
          looksLikeFinalEvent(
            event,
            wantedStageId
          )
      );

    return (
      finalEvent ||
      null
    );
  }

  function getFinalRunEnd(
    event,
    competition
  ) {
    const eventSchedule =
      event?.schedule ||
      {};

    const compSchedule =
      competition?.schedule ||
      {};

    const value =
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

    return toDateMaybe(
      value,
      {
        endOfDay: true
      }
    );
  }

  function getFinalRegistrationClose(
    event,
    competition
  ) {
    const eventRegistration =
      event?.registration ||
      {};

    const compRegistration =
      competition?.registration ||
      {};

    const value =
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

    return toDateMaybe(
      value,
      {
        endOfDay: true
      }
    );
  }

  async function isFinalClosed(
    qualification
  ) {
    if (!qualification) {
      return true;
    }

    const year =
      normalize(
        qualification.year
      );

    const data =
      qualification.data ||
      {};

    /*
     * 1. Якщо сезон уже офіційно
     * завершений — все.
     */
    if (
      await isSeasonClosed(
        year
      )
    ) {
      return true;
    }

    const competitionId =
      normalize(
        data.competitionId
      );

    /*
     * Старий qualification може
     * не мати competitionId.
     *
     * У такому випадку сезонна
     * перевірка вище лишається
     * основною.
     */
    if (
      !competitionId
    ) {
      return false;
    }

    try {
      const competitionSnap =
        await db
          .collection(
            COMPETITIONS_COLLECTION
          )
          .doc(
            competitionId
          )
          .get();

      if (
        !competitionSnap.exists
      ) {
        return false;
      }

      const competition =
        competitionSnap.data() ||
        {};

      /*
       * Якщо саме competition
       * явно закрите.
       */
      const competitionStatus =
        clean(
          competition.status
        );

      if (
        competition.archived ===
          true ||
        competition.finished ===
          true ||
        competition.completed ===
          true ||
        [
          "archived",
          "finished",
          "completed",
          "closed"
        ].includes(
          competitionStatus
        )
      ) {
        return true;
      }

      const stageId =
        normalize(
          data.stageId
        );

      const finalEvent =
        findFinalEvent(
          competition,
          stageId
        );

      /*
       * Якщо events нема —
       * можемо ще перевірити
       * дати самого competition.
       */
      const runEnd =
        getFinalRunEnd(
          finalEvent,
          competition
        );

      const registrationClose =
        getFinalRegistrationClose(
          finalEvent,
          competition
        );

      const now =
        new Date();

      /*
       * Фінал уже закінчився.
       */
      if (
        runEnd &&
        now.getTime() >
          runEnd.getTime()
      ) {
        console.info(
          LOG,
          year,
          "final finished",
          runEnd
        );

        return true;
      }

      /*
       * Реєстрація на Фінал
       * уже закрита.
       *
       * Після цього відмовлятися
       * через публічну форму вже
       * немає сенсу.
       */
      if (
        registrationClose &&
        now.getTime() >
          registrationClose.getTime()
      ) {
        console.info(
          LOG,
          year,
          "final registration closed",
          registrationClose
        );

        return true;
      }

      return false;

    } catch (
      error
    ) {
      console.warn(
        LOG,
        year,
        "competition/final check:",
        error
      );

      /*
       * Якщо не змогли прочитати
       * competition — не блокуємо
       * майбутній сезон помилково.
       */
      return false;
    }
  }

  // =========================================================
  // CAN DECLINE QUALIFICATION
  // =========================================================

  async function canDeclineQualification(
    qualification
  ) {
    if (
      !qualification
    ) {
      return false;
    }

    const status =
      clean(
        qualification
          .data
          ?.status
      );

    if (
      status !==
      DECLINABLE_STATUS
    ) {
      return false;
    }

    const closed =
      await isFinalClosed(
        qualification
      );

    return !closed;
  }

  // =========================================================
  // FIND INVITED QUALIFICATION
  // =========================================================

  async function findInvitedQualification(
    teamId
  ) {
    if (!teamId) {
      return null;
    }

    const seasonsSnapshot =
      await db
        .collection(
          QUALIFICATIONS_COLLECTION
        )
        .get();

    const years =
      seasonsSnapshot
        .docs
        .map(
          doc =>
            normalize(
              doc.id
            )
        )
        .filter(
          isValidYear
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(b) -
            Number(a)
        );

    for (
      const year of years
    ) {
      try {
        const ref =
          db
            .collection(
              QUALIFICATIONS_COLLECTION
            )
            .doc(
              year
            )
            .collection(
              "teams"
            )
            .doc(
              teamId
            );

        const snapshot =
          await ref.get();

        if (
          !snapshot.exists
        ) {
          continue;
        }

        const data =
          snapshot.data() ||
          {};

        if (
          !qualificationMatchesTeam(
            data,
            teamId
          )
        ) {
          console.warn(
            LOG,
            year,
            "teamId qualification mismatch."
          );

          continue;
        }

        if (
          !qualificationMatchesYear(
            data,
            year
          )
        ) {
          console.warn(
            LOG,
            year,
            "seasonYear qualification mismatch."
          );

          continue;
        }

        const status =
          clean(
            data.status
          );

        if (
          status !==
          DECLINABLE_STATUS
        ) {
          continue;
        }

        const qualification = {
          year:
            String(year),

          teamId:
            String(teamId),

          ref,

          data: {
            ...data,
            status
          }
        };

        /*
         * ГОЛОВНА ПРАВКА:
         *
         * invited самого по собі
         * вже недостатньо.
         *
         * Перевіряємо, що сезон /
         * фінал / реєстрація
         * ще не завершені.
         */
        const allowed =
          await canDeclineQualification(
            qualification
          );

        if (
          !allowed
        ) {
          console.info(
            LOG,
            year,
            "qualification is historical — decline hidden"
          );

          continue;
        }

        return qualification;

      } catch (
        error
      ) {
        console.warn(
          LOG,
          "qualification read:",
          year,
          error
        );
      }
    }

    return null;
  }

  // =========================================================
  // LISTENER CLEANUP
  // =========================================================

  function clearQualificationListener() {
    if (
      typeof unsubscribeQualification ===
      "function"
    ) {
      try {
        unsubscribeQualification();
      } catch (
        error
      ) {
        console.warn(
          LOG,
          "listener unsubscribe:",
          error
        );
      }
    }

    unsubscribeQualification =
      null;
  }

  // =========================================================
  // ACTIVE QUALIFICATION LISTENER
  // =========================================================

  function subscribeActiveQualification(
    qualification
  ) {
    clearQualificationListener();

    if (
      !qualification ||
      !qualification.ref
    ) {
      return;
    }

    const expectedYear =
      String(
        qualification.year
      );

    const expectedTeamId =
      String(
        qualification.teamId
      );

    unsubscribeQualification =
      qualification
        .ref
        .onSnapshot(
          async snapshot => {

            if (
              !snapshot.exists
            ) {
              if (
                !declineCompleted
              ) {
                hideBox();
              }

              return;
            }

            const data =
              snapshot.data() ||
              {};

            if (
              !qualificationMatchesTeam(
                data,
                expectedTeamId
              )
            ) {
              console.warn(
                LOG,
                expectedYear,
                "qualification team mismatch"
              );

              hideBox();

              return;
            }

            if (
              !qualificationMatchesYear(
                data,
                expectedYear
              )
            ) {
              console.warn(
                LOG,
                expectedYear,
                "qualification year mismatch"
              );

              hideBox();

              return;
            }

            const status =
              clean(
                data.status
              );

            if (
              declineCompleted &&
              status ===
                "declined"
            ) {
              return;
            }

            if (
              status !==
              DECLINABLE_STATUS
            ) {
              hideBox();

              return;
            }

            const liveQualification = {
              year:
                expectedYear,

              teamId:
                expectedTeamId,

              ref:
                qualification.ref,

              data: {
                ...data,
                status
              }
            };

            /*
             * Навіть listener
             * повторно перевіряє,
             * чи Фінал ще активний.
             */
            const allowed =
              await canDeclineQualification(
                liveQualification
              );

            if (
              !allowed
            ) {
              hideBox();

              return;
            }

            activeQualification =
              liveQualification;

            showBox(
              activeQualification
            );
          },

          error => {
            console.error(
              LOG,
              "qualification listener:",
              error
            );
          }
        );
  }

  // =========================================================
  // REFRESH
  // =========================================================

  async function refresh() {
    declineCompleted =
      false;

    hideBox();

    clearQualificationListener();

    if (
      !currentUser ||
      !currentTeamId
    ) {
      return;
    }

    try {
      const qualification =
        await findInvitedQualification(
          currentTeamId
        );

      if (
        !qualification
      ) {
        console.info(
          LOG,
          "active invited qualification not found"
        );

        return;
      }

      activeQualification =
        qualification;

      showBox(
        qualification
      );

      subscribeActiveQualification(
        qualification
      );

    } catch (
      error
    ) {
      console.error(
        LOG,
        "refresh:",
        error
      );
    }
  }

  // =========================================================
  // DECLINE
  // =========================================================

  async function handleDecline() {
    if (
      declining
    ) {
      return;
    }

    if (
      !currentUser ||
      !currentTeamId ||
      !activeQualification
    ) {
      setBoxMessage(
        "Не вдалося визначити фінальну кваліфікацію."
      );

      return;
    }

    const qualification =
      activeQualification;

    const qualificationRef =
      qualification.ref;

    const expectedYear =
      String(
        qualification.year
      );

    const expectedTeamId =
      String(
        qualification.teamId
      );

    if (
      expectedTeamId !==
      currentTeamId
    ) {
      setBoxMessage(
        "Фінальна кваліфікація належить іншій команді."
      );

      return;
    }

    /*
     * КРИТИЧНИЙ ЗАХИСТ:
     *
     * Сторінка могла бути відкрита
     * ще до завершення Фіналу.
     *
     * Перед самим натисканням
     * повторно перевіряємо стан.
     */
    try {
      const stillAllowed =
        await canDeclineQualification(
          qualification
        );

      if (
        !stillAllowed
      ) {
        clearQualificationListener();

        hideBox();

        window.alert(
          "Фінал або реєстрація на нього вже завершені. Відмова більше недоступна."
        );

        return;
      }

    } catch (
      error
    ) {
      console.warn(
        LOG,
        "pre-decline check:",
        error
      );

      return;
    }

    const confirmed =
      window.confirm(
        "Ви дійсно хочете відмовитися від участі у Фіналі?\n\nПісля відмови місце може автоматично перейти наступній команді з резерву."
      );

    if (
      !confirmed
    ) {
      return;
    }

    declining =
      true;

    declineCompleted =
      false;

    setButtonLoading(
      true
    );

    setBoxMessage(
      ""
    );

    try {

      await db.runTransaction(
        async transaction => {

          const snapshot =
            await transaction.get(
              qualificationRef
            );

          if (
            !snapshot.exists
          ) {
            throw new Error(
              "Фінальну кваліфікацію не знайдено."
            );
          }

          const data =
            snapshot.data() ||
            {};

          const status =
            clean(
              data.status
            );

          const documentTeamId =
            normalize(
              data.teamId
            );

          const documentYear =
            normalize(
              data.seasonYear
            );

          // =================================================
          // TEAM VALIDATION
          // =================================================

          if (
            documentTeamId &&
            documentTeamId !==
              currentTeamId
          ) {
            throw new Error(
              "Ця кваліфікація належить іншій команді."
            );
          }

          if (
            expectedTeamId !==
              currentTeamId
          ) {
            throw new Error(
              "Некоректна команда фінальної кваліфікації."
            );
          }

          // =================================================
          // YEAR VALIDATION
          // =================================================

          if (
            documentYear &&
            documentYear !==
              expectedYear
          ) {
            throw new Error(
              "Некоректний сезон фінальної кваліфікації."
            );
          }

          // =================================================
          // STATUS VALIDATION
          // =================================================

          if (
            status !==
            DECLINABLE_STATUS
          ) {
            if (
              status ===
              "declined"
            ) {
              throw new Error(
                "Команда вже відмовилася від участі."
              );
            }

            if (
              status ===
              "confirmed"
            ) {
              throw new Error(
                "Участь уже підтверджена. Автоматична відмова недоступна."
              );
            }

            if (
              status ===
              "reserve"
            ) {
              throw new Error(
                "Команда зараз перебуває у резерві."
              );
            }

            throw new Error(
              "Відмова зараз недоступна."
            );
          }

          // =================================================
          // UPDATE
          // =================================================

          /*
           * НЕ чіпаємо:
           *
           * rank
           * ratingPoints
           * totalWeight
           * bigFish
           * teamId
           * teamName
           * seasonYear
           * competitionId
           * stageId
           */
          transaction.update(
            qualificationRef,
            {
              status:
                "declined",

              qualifiedForFinal:
                false,

              declinedAt:
                serverTimestamp(),

              declinedByUid:
                currentUser.uid,

              updatedAt:
                serverTimestamp()
            }
          );
        }
      );

      // =====================================================
      // SUCCESS
      // =====================================================

      declineCompleted =
        true;

      setButtonLoading(
        true
      );

      const button =
        document.getElementById(
          "btnFinalDecline"
        );

      if (button) {
        button.textContent =
          "Відмову прийнято";
      }

      setBoxMessage(
        "Ви відмовилися від участі у Фіналі.",
        true
      );

      console.info(
        LOG,
        "declined:",
        {
          seasonYear:
            expectedYear,

          teamId:
            currentTeamId,

          uid:
            currentUser.uid
        }
      );

      setTimeout(
        () => {
          clearQualificationListener();

          hideBox();

          declineCompleted =
            false;
        },
        1800
      );

    } catch (
      error
    ) {

      declineCompleted =
        false;

      console.error(
        LOG,
        "decline:",
        error
      );

      const code =
        clean(
          error?.code
        );

      if (
        code.includes(
          "permission"
        )
      ) {
        setBoxMessage(
          "Firestore не дозволив відмову. Перевірте правила доступу finalQualifications."
        );
      }

      else if (
        code.includes(
          "unauthenticated"
        )
      ) {
        setBoxMessage(
          "Сесія користувача завершилася. Увійдіть у профіль повторно."
        );
      }

      else {
        setBoxMessage(
          error?.message ||
          "Не вдалося виконати відмову."
        );
      }

      setButtonLoading(
        false
      );

    } finally {
      declining =
        false;
    }
  }

  // =========================================================
  // AUTH
  // =========================================================

  function subscribeAuth() {
    auth.onAuthStateChanged(
      async user => {

        clearQualificationListener();

        hideBox();

        declining =
          false;

        declineCompleted =
          false;

        currentUser =
          user ||
          null;

        currentTeamId =
          "";

        if (
          !user
        ) {
          console.info(
            LOG,
            "no user"
          );

          return;
        }

        try {

          currentTeamId =
            await loadTeamId(
              user
            );

          if (
            !currentTeamId
          ) {
            console.info(
              LOG,
              "user has no team"
            );

            return;
          }

          console.info(
            LOG,
            "team detected:",
            currentTeamId
          );

          await refresh();

        } catch (
          error
        ) {
          console.error(
            LOG,
            "auth/profile:",
            error
          );
        }
      }
    );
  }

  // =========================================================
  // PUBLIC API
  // =========================================================

  window.SC_FINAL_DECLINE = {

    refresh,

    getState() {
      return {
        user:
          currentUser
            ? currentUser.uid
            : null,

        teamId:
          currentTeamId ||
          null,

        declining,

        qualification:
          activeQualification
            ? {
                seasonYear:
                  activeQualification
                    .year,

                teamId:
                  activeQualification
                    .teamId,

                status:
                  activeQualification
                    .data
                    ?.status ||
                  null,

                rank:
                  activeQualification
                    .data
                    ?.rank ||
                  null,

                competitionId:
                  activeQualification
                    .data
                    ?.competitionId ||
                  null,

                stageId:
                  activeQualification
                    .data
                    ?.stageId ||
                  null
              }
            : null
      };
    }
  };

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    try {

      await waitFirebase();

      auth =
        window.scAuth;

      db =
        window.scDb;

      fb =
        window.firebase;

      /*
       * Створюємо лише прихований
       * контейнер.
       *
       * Показати кнопку можна буде
       * тільки після всіх перевірок.
       */
      getOrCreateBox();

      subscribeAuth();

      console.info(
        LOG,
        "ready"
      );

    } catch (
      error
    ) {
      console.error(
        LOG,
        "init:",
        error
      );
    }
  }

  init();

})();
