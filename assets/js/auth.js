// assets/js/auth.js
// STOLAR CARP • AUTH
//
// ✅ Реєстрація + вхід
// ✅ Прізвище та Імʼя окремо
// ✅ canonical:
//    lastName = Прізвище
//    firstName = Імʼя
//    fullName = Прізвище Імʼя
// ✅ captain / member
// ✅ створення команди
// ✅ joinCode
// ✅ password reset
// ✅ старі профілі не ламаємо

(function () {
  "use strict";

  console.log(
    "✅ auth.js LOADED v20260916-structured-name-v2"
  );

  const $ =
    id =>
      document.getElementById(
        id
      );

  const ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const qs =
    new URLSearchParams(
      location.search
    );

  const ADMIN_MODE =
    location.pathname.includes(
      "admin.html"
    ) ||
    (
      qs.get(
        "admin"
      ) === "1" &&
      location.pathname.includes(
        "auth-admin.html"
      )
    );

  // =========================================================
  // UI
  // =========================================================

  function setMsg(
    el,
    text,
    type
  ) {
    if (
      !el
    ) {
      return;
    }

    el.textContent =
      text ||
      "";

    el.classList.remove(
      "ok",
      "err"
    );

    if (
      type
    ) {
      el.classList.add(
        type
      );
    }
  }

  function show(
    el
  ) {
    if (
      el
    ) {
      el.style.display =
        "";
    }
  }

  function hide(
    el
  ) {
    if (
      el
    ) {
      el.style.display =
        "none";
    }
  }

  // =========================================================
  // FIREBASE WAIT
  // =========================================================

  async function waitFirebase(
    maxMs = 8000
  ) {
    const t0 =
      Date.now();

    while (
      Date.now() -
        t0 <
      maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb
      ) {
        return;
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            50
          )
      );
    }

    throw new Error(
      "Firebase не готовий"
    );
  }

  // =========================================================
  // ERRORS
  // =========================================================

  function friendlyError(
    err,
    fallback =
      "Сталася помилка. Спробуй ще раз."
  ) {
    const code =
      String(
        err?.code ||
        ""
      ).trim();

    const msg =
      String(
        err?.message ||
        ""
      ).trim();

    const map = {
      "auth/email-already-in-use":
        "Цей email вже використовується.",

      "auth/invalid-email":
        "Невірний формат email.",

      "auth/weak-password":
        "Пароль занадто слабкий. Мінімум 6 символів.",

      "auth/wrong-password":
        "Невірний пароль.",

      "auth/user-not-found":
        "Користувача з таким email не знайдено.",

      "auth/too-many-requests":
        "Забагато спроб. Спробуй пізніше.",

      "auth/network-request-failed":
        "Проблема з інтернетом.",

      "auth/user-disabled":
        "Акаунт вимкнено.",

      "permission-denied":
        "Немає доступу.",

      "not-found":
        "Дані не знайдено.",

      "already-exists":
        "Такий запис вже існує."
    };

    if (
      map[
        code
      ]
    ) {
      return map[
        code
      ];
    }

    if (
      msg.includes(
        "team_name_too_short"
      )
    ) {
      return (
        "Назва команди занадто коротка " +
        "(мін. 3 символи)."
      );
    }

    if (
      msg.includes(
        "team_name_taken"
      )
    ) {
      return (
        "Така назва команди вже існує."
      );
    }

    if (
      msg.includes(
        "invalid_join_code"
      )
    ) {
      return (
        "Невірний код команди."
      );
    }

    if (
      msg.includes(
        "team_not_found"
      )
    ) {
      return (
        "Команду з таким кодом не знайдено."
      );
    }

    if (
      msg
    ) {
      return msg;
    }

    return fallback;
  }

  // =========================================================
  // NAME
  // =========================================================

  function cleanNamePart(
    value
  ) {
    return String(
      value ||
      ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .slice(
        0,
        40
      );
  }

  function buildFullName(
    lastName,
    firstName
  ) {
    const last =
      cleanNamePart(
        lastName
      );

    const first =
      cleanNamePart(
        firstName
      );

    if (
      !last ||
      !first
    ) {
      return "";
    }

    /*
     * ЄДИНИЙ canonical порядок:
     *
     * Прізвище Імʼя
     */
    return (
      `${last} ${first}`
    );
  }

  // =========================================================
  // TEAM
  // =========================================================

  function genJoinCode(
    len = 6
  ) {
    const chars =
      "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    let out =
      "";

    for (
      let i = 0;
      i < len;
      i++
    ) {
      out +=
        chars[
          Math.floor(
            Math.random() *
            chars.length
          )
        ];
    }

    return out;
  }

  function normalizeTeamName(
    name
  ) {
    return String(
      name ||
      ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      );
  }

  function isValidTeamName(
    name
  ) {
    const normalized =
      normalizeTeamName(
        name
      );

    return (
      normalized.length >=
        3 &&
      /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9\s\-]+$/.test(
        normalized
      )
    );
  }

  async function isTeamNameTaken(
    db,
    name
  ) {
    const normalized =
      normalizeTeamName(
        name
      );

    const key =
      normalized
        .toLowerCase();

    const snap =
      await db
        .collection(
          "teams"
        )
        .where(
          "nameKey",
          "==",
          key
        )
        .limit(
          1
        )
        .get();

    return (
      !snap.empty
    );
  }

  async function findTeamByJoinCode(
    db,
    code
  ) {
    const c =
      String(
        code ||
        ""
      )
        .trim()
        .toUpperCase();

    if (
      c.length !==
      6
    ) {
      return null;
    }

    const snap =
      await db
        .collection(
          "teams"
        )
        .where(
          "joinCode",
          "==",
          c
        )
        .limit(
          1
        )
        .get();

    if (
      snap.empty
    ) {
      return null;
    }

    const doc =
      snap.docs[
        0
      ];

    return {
      teamId:
        doc.id,

      ...(
        doc.data() ||
        {}
      )
    };
  }

  async function createTeam(
    db,
    name,
    ownerUid
  ) {
    const normName =
      normalizeTeamName(
        name
      );

    const nameKey =
      normName
        .toLowerCase();

    const taken =
      await isTeamNameTaken(
        db,
        normName
      );

    if (
      taken
    ) {
      throw new Error(
        "team_name_taken"
      );
    }

    for (
      let i = 0;
      i < 15;
      i++
    ) {
      const joinCode =
        genJoinCode(
          6
        );

      const exists =
        await db
          .collection(
            "teams"
          )
          .where(
            "joinCode",
            "==",
            joinCode
          )
          .limit(
            1
          )
          .get();

      if (
        !exists.empty
      ) {
        continue;
      }

      const now =
        window.firebase
          .firestore
          .FieldValue
          .serverTimestamp();

      const ref =
        await db
          .collection(
            "teams"
          )
          .add({
            name:
              normName,

            nameKey,

            ownerUid,

            joinCode,

            createdAt:
              now,

            updatedAt:
              now
          });

      return {
        teamId:
          ref.id,

        joinCode,

        name:
          normName
      };
    }

    throw new Error(
      "Не вдалося згенерувати код команди"
    );
  }

  // =========================================================
  // USER DOC
  // =========================================================

  async function ensureUserDoc(
    db,
    uid,
    data,
    forceUpdate = false
  ) {
    const ref =
      db
        .collection(
          "users"
        )
        .doc(
          uid
        );

    const snap =
      await ref.get();

    const now =
      window.firebase
        .firestore
        .FieldValue
        .serverTimestamp();

    const firstName =
      cleanNamePart(
        data.firstName
      );

    const lastName =
      cleanNamePart(
        data.lastName
      );

    const fullName =
      buildFullName(
        lastName,
        firstName
      );

    const base = {
      firstName,

      lastName,

      fullName,

      email:
        String(
          data.email ||
          ""
        ).trim(),

      phone:
        String(
          data.phone ||
          ""
        ).trim(),

      city:
        String(
          data.city ||
          ""
        ).trim(),

      role:
        data.role ||
        "member",

      teamId:
        data.teamId ||
        null,

      createdAt:
        now,

      updatedAt:
        now
    };

    /*
     * Новий користувач.
     */
    if (
      !snap.exists
    ) {
      await ref.set(
        base
      );

      return;
    }

    /*
     * Існуючий користувач.
     */
    const cur =
      snap.data() ||
      {};

    const patch =
      {};

    /*
     * Structured name —
     * головна схема.
     */
    if (
      forceUpdate ||
      !cur.lastName
    ) {
      if (
        lastName
      ) {
        patch.lastName =
          lastName;
      }
    }

    if (
      forceUpdate ||
      !cur.firstName
    ) {
      if (
        firstName
      ) {
        patch.firstName =
          firstName;
      }
    }

    if (
      forceUpdate ||
      !cur.fullName
    ) {
      if (
        fullName
      ) {
        patch.fullName =
          fullName;
      }
    }

    if (
      !cur.email &&
      base.email
    ) {
      patch.email =
        base.email;
    }

    if (
      !cur.phone &&
      base.phone
    ) {
      patch.phone =
        base.phone;
    }

    if (
      !cur.city &&
      base.city
    ) {
      patch.city =
        base.city;
    }

    if (
      forceUpdate ||
      cur.teamId ==
        null
    ) {
      patch.teamId =
        base.teamId;
    }

    if (
      !cur.role &&
      base.role
    ) {
      patch.role =
        base.role;
    }

    if (
      Object.keys(
        patch
      ).length
    ) {
      patch.updatedAt =
        now;

      await ref.update(
        patch
      );
    }
  }

  // =========================================================
  // REDIRECT
  // =========================================================

  function goAfterAuth(
    user
  ) {
    if (
      ADMIN_MODE &&
      user?.uid ===
        ADMIN_UID
    ) {
      location.href =
        "admin.html";

      return;
    }

    location.href =
      "cabinet.html";
  }

  // =========================================================
  // DOM
  // =========================================================

  const loggedBox =
    $("loggedBox");

  const authBox =
    $("authBox");

  const btnGoCab =
    $("goCabinetBtn");

  const btnLogout =
    $("logoutBtn");

  const loggedMsg =
    $("loggedMsg");

  const signupForm =
    $("signupForm");

  const loginForm =
    $("loginForm");

  const signupMsg =
    $("signupMsg");

  const loginMsg =
    $("loginMsg");

  const resetPassBtn =
    $("resetPassBtn");

  // =========================================================
  // UI STATE
  // =========================================================

  function showLoggedInUI(
    user
  ) {
    if (
      loggedMsg
    ) {
      loggedMsg.textContent =
        (
          ADMIN_MODE &&
          user?.uid ===
            ADMIN_UID
        )
          ? "Ви увійшли як адміністратор."
          : "Ви вже увійшли у свій акаунт.";
    }

    show(
      loggedBox
    );

    hide(
      authBox
    );
  }

  function showAuthUI() {
    hide(
      loggedBox
    );

    show(
      authBox
    );
  }

  // =========================================================
  // SIGNUP
  // =========================================================

  async function onSignup(
    e
  ) {
    e.preventDefault();

    setMsg(
      signupMsg,
      "",
      ""
    );

    await waitFirebase();

    const auth =
      window.scAuth;

    const db =
      window.scDb;

    const email =
      String(
        $("signupEmail")
          ?.value ||
        ""
      )
        .trim();

    const pass =
      $("signupPassword")
        ?.value ||
      "";

    /*
     * НОВА СХЕМА:
     *
     * Прізвище
     * Імʼя
     */
    const lastName =
      cleanNamePart(
        $("signupLastName")
          ?.value ||
        ""
      );

    const firstName =
      cleanNamePart(
        $("signupFirstName")
          ?.value ||
        ""
      );

    const fullName =
      buildFullName(
        lastName,
        firstName
      );

    const phone =
      String(
        $("signupPhone")
          ?.value ||
        ""
      )
        .trim();

    const city =
      String(
        $("signupCity")
          ?.value ||
        ""
      )
        .trim();

    const role =
      document
        .querySelector(
          'input[name="signupRole"]:checked'
        )
        ?.value ||
      "captain";

    const teamNameRaw =
      String(
        $("signupTeamName")
          ?.value ||
        ""
      )
        .trim();

    const joinCodeRaw =
      String(
        $("signupJoinCode")
          ?.value ||
        ""
      )
        .trim();

    if (
      !email ||
      !pass ||
      pass.length < 6 ||
      !lastName ||
      !firstName ||
      !phone ||
      !city
    ) {
      setMsg(
        signupMsg,
        "Заповни всі поля: прізвище, імʼя, email, телефон, місто та пароль мін. 6 символів.",
        "err"
      );

      return;
    }

    let teamContext =
      null;

    // ---------------------------------------------------------
    // CAPTAIN
    // ---------------------------------------------------------

    if (
      role ===
      "captain"
    ) {
      if (
        !isValidTeamName(
          teamNameRaw
        )
      ) {
        setMsg(
          signupMsg,
          "Назва команди: мін. 3 символи (літери, цифри, дефіс).",
          "err"
        );

        return;
      }

      try {
        const taken =
          await isTeamNameTaken(
            db,
            teamNameRaw
          );

        if (
          taken
        ) {
          setMsg(
            signupMsg,
            "Така назва команди вже існує. Вибери іншу.",
            "err"
          );

          return;
        }

      } catch (
        err
      ) {
        console.warn(
          "Перевірка назви:",
          err
        );
      }
    }

    // ---------------------------------------------------------
    // MEMBER
    // ---------------------------------------------------------

    if (
      role ===
      "member"
    ) {
      const joinCode =
        joinCodeRaw
          .toUpperCase();

      if (
        joinCode.length !==
        6
      ) {
        setMsg(
          signupMsg,
          "Введи код команди (6 символів).",
          "err"
        );

        return;
      }

      setMsg(
        signupMsg,
        "Перевіряю код команди…",
        ""
      );

      const team =
        await findTeamByJoinCode(
          db,
          joinCode
        );

      if (
        !team
      ) {
        setMsg(
          signupMsg,
          "Команду з таким кодом не знайдено. Перевір код.",
          "err"
        );

        return;
      }

      teamContext =
        team;
    }

    let createdUser =
      null;

    let createdTeamId =
      null;

    try {
      const signupBtn =
        $("signupBtn");

      if (
        signupBtn
      ) {
        signupBtn.disabled =
          true;
      }

      setMsg(
        signupMsg,
        role ===
          "captain"
          ? "Створюю акаунт і команду…"
          : "Створюю акаунт…",
        ""
      );

      const cred =
        await auth
          .createUserWithEmailAndPassword(
            email,
            pass
          );

      const user =
        cred.user;

      createdUser =
        user;

      // =======================================================
      // CAPTAIN
      // =======================================================

      if (
        role ===
        "captain"
      ) {
        setMsg(
          signupMsg,
          "Створюю команду…",
          ""
        );

        const team =
          await createTeam(
            db,
            teamNameRaw,
            user.uid
          );

        createdTeamId =
          team.teamId;

        await ensureUserDoc(
          db,
          user.uid,
          {
            lastName,
            firstName,
            fullName,

            email,
            phone,
            city,

            role:
              "captain",

            teamId:
              team.teamId
          },
          true
        );

        localStorage.setItem(
          "sc_team_cache_" +
          user.uid,
          JSON.stringify({
            ts:
              Date.now(),

            teamId:
              team.teamId,

            name:
              team.name,

            role:
              "captain"
          })
        );

        setMsg(
          signupMsg,
          `✅ ${fullName}. Команда "${team.name}" створена! Код: ${team.joinCode}`,
          "ok"
        );

        setTimeout(
          () =>
            goAfterAuth(
              user
            ),
          800
        );

        return;
      }

      // =======================================================
      // MEMBER
      // =======================================================

      if (
        role ===
        "member"
      ) {
        const team =
          teamContext ||
          await findTeamByJoinCode(
            db,
            joinCodeRaw
          );

        if (
          !team
        ) {
          throw new Error(
            "team_not_found"
          );
        }

        await ensureUserDoc(
          db,
          user.uid,
          {
            lastName,
            firstName,
            fullName,

            email,
            phone,
            city,

            role:
              "member",

            teamId:
              team.teamId
          },
          true
        );

        localStorage.setItem(
          "sc_team_cache_" +
          user.uid,
          JSON.stringify({
            ts:
              Date.now(),

            teamId:
              team.teamId,

            name:
              team.name,

            role:
              "member"
          })
        );

        setMsg(
          signupMsg,
          `✅ ${fullName}. Ти в команді "${team.name}"!`,
          "ok"
        );

        setTimeout(
          () =>
            goAfterAuth(
              user
            ),
          500
        );
      }

    } catch (
      err
    ) {
      console.error(
        "Помилка реєстрації:",
        err
      );

      /*
       * Cleanup:
       * якщо team/user створився
       * не повністю.
       */
      if (
        createdUser
      ) {
        try {
          if (
            createdTeamId
          ) {
            await db
              .collection(
                "teams"
              )
              .doc(
                createdTeamId
              )
              .delete();
          }

          await createdUser
            .delete();

          await auth
            .signOut();

        } catch (
          cleanupErr
        ) {
          console.warn(
            "Cleanup error:",
            cleanupErr
          );
        }
      }

      setMsg(
        signupMsg,
        friendlyError(
          err,
          "Помилка реєстрації"
        ),
        "err"
      );

      const signupBtn =
        $("signupBtn");

      if (
        signupBtn
      ) {
        signupBtn.disabled =
          false;
      }
    }
  }

  // =========================================================
  // LOGIN
  // =========================================================

  async function onLogin(
    e
  ) {
    e.preventDefault();

    setMsg(
      loginMsg,
      "",
      ""
    );

    await waitFirebase();

    const auth =
      window.scAuth;

    const db =
      window.scDb;

    const email =
      String(
        $("loginEmail")
          ?.value ||
        ""
      )
        .trim();

    const pass =
      $("loginPassword")
        ?.value ||
      "";

    if (
      !email ||
      !pass
    ) {
      setMsg(
        loginMsg,
        "Введи email і пароль.",
        "err"
      );

      return;
    }

    try {
      const loginBtn =
        $("loginBtn");

      if (
        loginBtn
      ) {
        loginBtn.disabled =
          true;
      }

      setMsg(
        loginMsg,
        "Вхід…",
        ""
      );

      await auth
        .signInWithEmailAndPassword(
          email,
          pass
        );

      const user =
        auth.currentUser;

      const userDoc =
        await db
          .collection(
            "users"
          )
          .doc(
            user.uid
          )
          .get();

      if (
        userDoc.exists &&
        userDoc.data()
          .teamId
      ) {
        const teamId =
          userDoc.data()
            .teamId;

        const teamDoc =
          await db
            .collection(
              "teams"
            )
            .doc(
              teamId
            )
            .get();

        const teamName =
          teamDoc.exists
            ? teamDoc.data()
                .name
            : "Команда";

        localStorage.setItem(
          "sc_team_cache_" +
          user.uid,
          JSON.stringify({
            ts:
              Date.now(),

            teamId,

            name:
              teamName
          })
        );
      }

      setMsg(
        loginMsg,
        "✅ Успішно!",
        "ok"
      );

      setTimeout(
        () =>
          goAfterAuth(
            user
          ),
        300
      );

    } catch (
      err
    ) {
      console.error(
        err
      );

      setMsg(
        loginMsg,
        friendlyError(
          err,
          "Помилка входу"
        ),
        "err"
      );

      const loginBtn =
        $("loginBtn");

      if (
        loginBtn
      ) {
        loginBtn.disabled =
          false;
      }
    }
  }

  // =========================================================
  // PASSWORD RESET
  // =========================================================

  async function onResetPassword(
    e
  ) {
    e.preventDefault();

    setMsg(
      loginMsg,
      "",
      ""
    );

    await waitFirebase();

    const auth =
      window.scAuth;

    const email =
      String(
        $("loginEmail")
          ?.value ||
        ""
      )
        .trim();

    if (
      !email
    ) {
      setMsg(
        loginMsg,
        "Введи email у полі входу, щоб відновити пароль.",
        "err"
      );

      return;
    }

    try {
      if (
        resetPassBtn
      ) {
        resetPassBtn.disabled =
          true;
      }

      await auth
        .sendPasswordResetEmail(
          email
        );

      setMsg(
        loginMsg,
        "✅ Лист для відновлення пароля відправлено. Перевір пошту та папку «Спам».",
        "ok"
      );

    } catch (
      err
    ) {
      console.error(
        "Помилка відновлення пароля:",
        err
      );

      setMsg(
        loginMsg,
        friendlyError(
          err,
          "Не вдалося відправити лист для відновлення."
        ),
        "err"
      );

    } finally {
      if (
        resetPassBtn
      ) {
        resetPassBtn.disabled =
          false;
      }
    }
  }

  // =========================================================
  // EVENTS
  // =========================================================

  if (
    signupForm
  ) {
    signupForm.addEventListener(
      "submit",
      onSignup
    );
  }

  if (
    loginForm
  ) {
    loginForm.addEventListener(
      "submit",
      onLogin
    );
  }

  if (
    resetPassBtn
  ) {
    resetPassBtn.addEventListener(
      "click",
      onResetPassword
    );
  }

  if (
    btnGoCab
  ) {
    btnGoCab.addEventListener(
      "click",
      e => {
        e.preventDefault();

        goAfterAuth(
          window.scAuth
            ?.currentUser
        );
      }
    );
  }

  if (
    btnLogout
  ) {
    btnLogout.addEventListener(
      "click",
      async e => {
        e.preventDefault();

        try {
          await waitFirebase();

          await window.scAuth
            .signOut();

          showAuthUI();

        } catch (
          err
        ) {
          console.warn(
            err
          );
        }
      }
    );
  }

  // =========================================================
  // INIT
  // =========================================================

  (
    async () => {
      try {
        await waitFirebase();

        window.scAuth
          .onAuthStateChanged(
            user => {
              if (
                user
              ) {
                showLoggedInUI(
                  user
                );

              } else {
                showAuthUI();
              }
            }
          );

      } catch (
        error
      ) {
        console.warn(
          error
        );

        showAuthUI();
      }
    }
  )();

})();
