// assets/js/final_decline.js
// STOLAR CARP • Відмова від участі у Фіналі
//
// =========================================================
// ПРИЗНАЧЕННЯ
// =========================================================
//
// Відповідальність цього файла:
//
// 1. Визначити поточного користувача.
// 2. Визначити його teamId.
// 3. Знайти його qualification у finalQualifications.
// 4. Показати кнопку відмови ТІЛЬКИ для status == "invited".
// 5. Безпечно виконати:
//
//      invited -> declined
//
// 6. Записати:
//
//      status: "declined"
//      qualifiedForFinal: false
//      declinedAt
//      declinedByUid
//      updatedAt
//
// ЦЕЙ ФАЙЛ:
//
// • НЕ рахує рейтинг;
// • НЕ визначає TOP-18;
// • НЕ переводить reserve -> invited;
// • НЕ змінює rank;
// • НЕ змінює competitionId;
// • НЕ змінює stageId.
//
// За перерахунок фіналістів відповідає:
//
// assets/js/final_qualification.js
//
// =========================================================
// FIRESTORE
// =========================================================
//
// finalQualifications/{year}/teams/{teamId}
//
// Наприклад:
//
// finalQualifications/2026/teams/TEAM_ID
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

  /*
   * Поточна qualification, яку
   * користувач має право відхилити.
   *
   * {
   *   year,
   *   teamId,
   *   ref,
   *   data
   * }
   */
  let activeQualification = null;

  /*
   * Listener конкретного документа:
   *
   * finalQualifications/{year}/teams/{teamId}
   */
  let unsubscribeQualification = null;

  /*
   * Захист від подвійного натискання.
   */
  let declining = false;

  /*
   * Після успішної відмови не даємо
   * listener миттєво стерти повідомлення.
   */
  let declineCompleted = false;

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

    /*
     * Кнопка відмови повинна
     * розташовуватися відразу
     * після кнопки "Подати заявку".
     *
     * У HTML кнопка submit знаходиться
     * всередині .form-actions.
     */
    const formActions =
      document.querySelector(
        "#regForm .form-actions"
      );

    const form =
      document.getElementById(
        "regForm"
      );

    /*
     * Якщо форми реєстрації немає,
     * нічого не створюємо.
     */
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
     * Контейнер прихований,
     * доки не буде знайдено
     * qualification зі status=invited.
     */
    box.style.display =
      "none";

    box.style.marginTop =
      "10px";

    box.style.marginBottom =
      "0";

    /*
     * Тут навмисно НЕМАЄ:
     *
     * "Участь у Фіналі"
     *
     * і НЕМАЄ опису:
     *
     * "Ваша команда має право участі..."
     *
     * Залишається тільки кнопка.
     */
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

    /*
     * Основне місце:
     *
     * одразу ПІСЛЯ .form-actions,
     * тобто після кнопки
     * "Подати заявку".
     */
    if (
      formActions &&
      formActions.parentNode
    ) {
      formActions
        .insertAdjacentElement(
          "afterend",
          box
        );
    }

    /*
     * Fallback:
     * якщо .form-actions чомусь
     * відсутній — додаємо в кінець form.
     */
    else {
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

    if (clearActive) {
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
    /*
     * Додатково перевіряємо status,
     * щоб кнопку неможливо було
     * випадково показати для reserve,
     * confirmed або declined.
     */
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

    /*
     * Ніякого текстового опису
     * qualification тут більше немає.
     */

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

    /*
     * Старий qualification може
     * теоретично не мати teamId
     * всередині документа.
     *
     * У такому випадку сам document ID
     * уже є teamId.
     */
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

    /*
     * Старий запис може не мати
     * seasonYear всередині.
     *
     * Path:
     *
     * finalQualifications/{year}
     *
     * уже визначає сезон.
     */
    const storedYear =
      normalize(
        data.seasonYear
      );

    if (
      storedYear &&
      storedYear !==
        String(
          year
        )
    ) {
      return false;
    }

    return true;
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

    /*
     * Отримуємо доступні сезони:
     *
     * finalQualifications/2026
     * finalQualifications/2027
     * finalQualifications/2028
     * ...
     *
     * Новіший сезон перевіряємо першим.
     */
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
            Number(
              b
            ) -
            Number(
              a
            )
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

        /*
         * Відмова доступна
         * ТІЛЬКИ invited.
         */
        if (
          status !==
          DECLINABLE_STATUS
        ) {
          continue;
        }

        return {
          year:
            String(
              year
            ),

          teamId:
            String(
              teamId
            ),

          ref,

          data: {
            ...data,
            status
          }
        };

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
          snapshot => {

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

            /*
             * Захист від невідповідності
             * документа.
             */
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

            /*
             * Після нашої успішної відмови
             * handleDecline сам покаже
             * success message і сховає box.
             */
            if (
              declineCompleted &&
              status ===
                "declined"
            ) {
              return;
            }

            /*
             * Якщо статус змінився
             * іншим процесом —
             * кнопка більше недоступна.
             */
            if (
              status !==
              DECLINABLE_STATUS
            ) {
              hideBox();

              return;
            }

            activeQualification = {
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
    /*
     * Захист від подвійного кліку.
     */
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

    /*
     * Зберігаємо значення ДО async операцій.
     *
     * Listener може змінити
     * activeQualification.
     */
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

    /*
     * Перевіряємо, що qualification
     * належить поточній команді.
     */
    if (
      expectedTeamId !==
      currentTeamId
    ) {
      setBoxMessage(
        "Фінальна кваліфікація належить іншій команді."
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

      // =====================================================
      // TRANSACTION
      // =====================================================

      await db.runTransaction(
        async transaction => {

          /*
           * Перед UPDATE ще раз читаємо
           * актуальний документ.
           */
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

          /*
           * Відмовитися можна ТІЛЬКИ:
           *
           * invited -> declined
           */
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
           * НЕ змінюємо:
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
           *
           * Міняємо виключно поля,
           * пов'язані з відмовою.
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

      /*
       * Даємо користувачу побачити
       * повідомлення.
       */
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

        /*
         * При будь-якій зміні auth
         * старий listener прибираємо.
         */
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

          // =================================================
          // LOAD TEAM
          // =================================================

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

          // =================================================
          // FIND QUALIFICATION
          // =================================================

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

    /*
     * Ручне оновлення:
     *
     * await SC_FINAL_DECLINE.refresh()
     */
    refresh,

    /*
     * Debug state:
     *
     * SC_FINAL_DECLINE.getState()
     */
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
       * UI створюємо лише якщо
       * сторінка має форму реєстрації.
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
