// assets/js/final_decline.js
// STOLAR CARP • Відмова від участі у Фіналі
//
// =========================================================
// ПРИЗНАЧЕННЯ
// =========================================================
//
// Цей файл дозволяє команді зі статусом:
//
// invited
//
// добровільно відмовитися від участі у Фіналі.
//
// Змінюється:
//
// finalQualifications/{year}/teams/{teamId}
//
// invited -> declined
//
// Після цього final_qualification.js під admin-сесією
// автоматично піднімає наступну команду:
//
// reserve -> invited
//
// =========================================================

(function () {
  "use strict";

  const LOG = "[STOLAR CARP final_decline]";

  const QUALIFICATIONS_COLLECTION = "finalQualifications";

  // =========================================================
  // STATE
  // =========================================================

  let auth = null;
  let db = null;
  let fb = null;

  let currentUser = null;
  let currentTeamId = "";

  /*
   * qualification, яку зараз
   * можна відхилити.
   */
  let activeQualification = null;

  /*
   * Listener конкретного qualification.
   */
  let unsubscribeQualification = null;

  /*
   * Захист від подвійного кліку.
   */
  let declining = false;

  // =========================================================
  // HELPERS
  // =========================================================

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function clean(value) {
    return normalize(value).toLowerCase();
  }

  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  function serverTimestamp() {
    return fb.firestore.FieldValue.serverTimestamp();
  }

  function isValidYear(value) {
    return /^\d{4}$/.test(
      normalize(value)
    );
  }

  // =========================================================
  // FIREBASE READY
  // =========================================================

  async function waitFirebase(maxMs = 15000) {
    const startedAt = Date.now();

    while (
      Date.now() - startedAt < maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb &&
        window.firebase
      ) {
        return;
      }

      await sleep(100);
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
     * Створюємо UI автоматично.
     *
     * Спочатку пробуємо вставити
     * після списку змагань.
     */
    const eventOptions =
      document.getElementById(
        "eventOptions"
      );

    const form =
      document.getElementById(
        "regForm"
      );

    if (
      !eventOptions &&
      !form
    ) {
      return null;
    }

    box =
      document.createElement("div");

    box.id = "finalDeclineBox";

    box.style.display = "none";
    box.style.marginTop = "16px";
    box.style.padding = "14px";
    box.style.borderRadius = "14px";
    box.style.border =
      "1px solid rgba(239,68,68,.35)";
    box.style.background =
      "rgba(127,29,29,.12)";

    box.innerHTML = `
      <div
        style="
          font-weight:900;
          font-size:15px;
          margin-bottom:6px;
          color:#f3f4f6;
        "
      >
        Участь у Фіналі
      </div>

      <div
        id="finalDeclineText"
        style="
          font-size:13px;
          line-height:1.45;
          color:#9ca3af;
          margin-bottom:10px;
        "
      ></div>

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
        "
      >
        Відмовитися від Фіналу
      </button>

      <div
        id="finalDeclineMsg"
        style="
          margin-top:8px;
          font-size:13px;
          line-height:1.4;
        "
      ></div>
    `;

    if (
      eventOptions &&
      eventOptions.parentNode
    ) {
      eventOptions.insertAdjacentElement(
        "afterend",
        box
      );

    } else if (form) {
      form.appendChild(box);
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

  function hideBox() {
    const box =
      document.getElementById(
        "finalDeclineBox"
      );

    if (box) {
      box.style.display = "none";
    }

    activeQualification = null;
  }

  function showBox(data) {
    const box =
      getOrCreateBox();

    if (!box) {
      return;
    }

    const text =
      box.querySelector(
        "#finalDeclineText"
      );

    const msg =
      box.querySelector(
        "#finalDeclineMsg"
      );

    const button =
      box.querySelector(
        "#btnFinalDecline"
      );

    const rank =
      Number(data.rank || 0);

    if (text) {
      text.textContent =
        rank > 0
          ? `Ваша команда має право участі у Фіналі. Поточне місце у рейтингу — №${rank}. Якщо ви не плануєте брати участь, можете звільнити місце для наступної команди.`
          : "Ваша команда має право участі у Фіналі. Якщо ви не плануєте брати участь, можете звільнити місце для наступної команди.";
    }

    if (msg) {
      msg.textContent = "";
    }

    if (button) {
      button.disabled = false;
      button.textContent =
        "Відмовитися від Фіналу";
    }

    box.style.display = "block";
  }

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

    msg.textContent =
      text || "";

    msg.style.color =
      ok
        ? "#86efac"
        : "#fca5a5";
  }

  function setButtonLoading(value) {
    const button =
      document.getElementById(
        "btnFinalDecline"
      );

    if (!button) {
      return;
    }

    button.disabled =
      Boolean(value);

    button.textContent =
      value
        ? "Зберігаю…"
        : "Відмовитися від Фіналу";
  }

  // =========================================================
  // PROFILE
  // =========================================================

  async function loadTeamId(user) {
    if (!user) {
      return "";
    }

    const snapshot =
      await db
        .collection("users")
        .doc(user.uid)
        .get();

    if (!snapshot.exists) {
      return "";
    }

    const data =
      snapshot.data() || {};

    return normalize(
      data.teamId
    );
  }

  // =========================================================
  // FIND QUALIFICATIONS
  // =========================================================

  async function findInvitedQualification(
    teamId
  ) {
    if (!teamId) {
      return null;
    }

    /*
     * Не робимо collectionGroup query.
     *
     * Читаємо кореневі документи:
     *
     * finalQualifications/2026
     * finalQualifications/2027
     * ...
     *
     * і перевіряємо teamId
     * тільки у відповідному сезоні.
     */

    const seasonsSnapshot =
      await db
        .collection(
          QUALIFICATIONS_COLLECTION
        )
        .get();

    const years =
      seasonsSnapshot.docs
        .map(doc => normalize(doc.id))
        .filter(isValidYear)
        .sort((a, b) => Number(b) - Number(a));

    for (const year of years) {
      try {
        const ref =
          db
            .collection(
              QUALIFICATIONS_COLLECTION
            )
            .doc(year)
            .collection("teams")
            .doc(teamId);

        const snapshot =
          await ref.get();

        if (!snapshot.exists) {
          continue;
        }

        const data =
          snapshot.data() || {};

        const status =
          clean(data.status);

        /*
         * Кнопка потрібна тільки
         * для invited.
         */
        if (status !== "invited") {
          continue;
        }

        return {
          year,
          teamId,
          ref,
          data: {
            ...data,
            status
          }
        };

      } catch (error) {
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
  // LISTENER
  // =========================================================

  function clearQualificationListener() {
    if (
      typeof unsubscribeQualification ===
      "function"
    ) {
      unsubscribeQualification();
    }

    unsubscribeQualification = null;
  }

  function subscribeActiveQualification(
    qualification
  ) {
    clearQualificationListener();

    if (
      !qualification?.ref
    ) {
      return;
    }

    unsubscribeQualification =
      qualification.ref.onSnapshot(
        snapshot => {
          if (!snapshot.exists) {
            hideBox();
            return;
          }

          const data =
            snapshot.data() || {};

          const status =
            clean(data.status);

          /*
           * Якщо admin automation
           * або інший процес змінив
           * статус — UI оновлюється.
           */
          if (
            status !== "invited"
          ) {
            hideBox();
            return;
          }

          activeQualification = {
            ...qualification,

            data: {
              ...data,
              status
            }
          };

          showBox(
            activeQualification.data
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

      if (!qualification) {
        return;
      }

      activeQualification =
        qualification;

      showBox(
        qualification.data
      );

      subscribeActiveQualification(
        qualification
      );

    } catch (error) {
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
    if (declining) {
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

    const confirmed =
      window.confirm(
        "Ви дійсно хочете відмовитися від участі у Фіналі?\n\nПісля відмови місце може автоматично перейти наступній команді з резерву."
      );

    if (!confirmed) {
      return;
    }

    declining = true;

    setButtonLoading(true);
    setBoxMessage("");

    try {
      const qualificationRef =
        activeQualification.ref;

      const expectedYear =
        activeQualification.year;

      /*
       * Транзакція потрібна, щоб
       * перед записом ще раз
       * перевірити актуальний status.
       */
      await db.runTransaction(
        async transaction => {
          const snapshot =
            await transaction.get(
              qualificationRef
            );

          if (!snapshot.exists) {
            throw new Error(
              "Фінальну кваліфікацію не знайдено."
            );
          }

          const data =
            snapshot.data() || {};

          const status =
            clean(data.status);

          const documentTeamId =
            normalize(
              data.teamId
            );

          const documentYear =
            normalize(
              data.seasonYear
            );

          /*
           * Додаткова перевірка teamId.
           */
          if (
            documentTeamId &&
            documentTeamId !==
              currentTeamId
          ) {
            throw new Error(
              "Ця кваліфікація належить іншій команді."
            );
          }

          /*
           * Додаткова перевірка сезону.
           */
          if (
            documentYear &&
            documentYear !==
              expectedYear
          ) {
            throw new Error(
              "Некоректний сезон фінальної кваліфікації."
            );
          }

          /*
           * Відмовитися можна
           * ТІЛЬКИ зі статусу invited.
           */
          if (
            status !== "invited"
          ) {
            if (
              status === "declined"
            ) {
              throw new Error(
                "Команда вже відмовилася від участі."
              );
            }

            if (
              status === "confirmed"
            ) {
              throw new Error(
                "Участь уже підтверджена. Автоматична відмова недоступна."
              );
            }

            if (
              status === "reserve"
            ) {
              throw new Error(
                "Команда зараз перебуває у резерві."
              );
            }

            throw new Error(
              "Відмова зараз недоступна."
            );
          }

          /*
           * Міняємо тільки поля,
           * які стосуються відмови.
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

              updatedAt:
                serverTimestamp()
            }
          );
        }
      );

      setBoxMessage(
        "Ви відмовилися від участі у Фіналі.",
        true
      );

      /*
       * Listener також приховає box,
       * але робимо це з невеликою
       * затримкою, щоб користувач
       * побачив повідомлення.
       */
      setTimeout(
        () => {
          hideBox();
        },
        1500
      );

      console.info(
        LOG,
        "declined:",
        {
          seasonYear:
            activeQualification?.year,

          teamId:
            currentTeamId
        }
      );

    } catch (error) {
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
          "Firestore не дозволив відмову. Потрібно додати правило для finalQualifications."
        );

      } else {
        setBoxMessage(
          error?.message ||
          "Не вдалося виконати відмову."
        );
      }

      setButtonLoading(false);

    } finally {
      declining = false;
    }
  }

  // =========================================================
  // AUTH
  // =========================================================

  function subscribeAuth() {
    auth.onAuthStateChanged(
      async user => {
        currentUser =
          user || null;

        currentTeamId = "";

        activeQualification = null;

        clearQualificationListener();

        hideBox();

        if (!user) {
          return;
        }

        try {
          currentTeamId =
            await loadTeamId(
              user
            );

          if (!currentTeamId) {
            console.info(
              LOG,
              "user has no team"
            );

            return;
          }

          await refresh();

        } catch (error) {
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

        qualification:
          activeQualification
            ? {
                seasonYear:
                  activeQualification.year,

                status:
                  activeQualification
                    .data
                    ?.status ||
                  null,

                rank:
                  activeQualification
                    .data
                    ?.rank ||
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
       * UI можна створити одразу.
       */
      getOrCreateBox();

      subscribeAuth();

      console.info(
        LOG,
        "ready"
      );

    } catch (error) {
      console.error(
        LOG,
        "init:",
        error
      );
    }
  }

  init();

})();
