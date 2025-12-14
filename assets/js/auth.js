// assets/js/auth.js
// Реєстрація + вхід. Пише в Firestore: users/{uid}, teams/{teamId}

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір підключення firebase-*-compat + firebase-init.js");
    return;
  }

  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");
  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");
  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  function msg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (type ? " " + type : "");
  }

  function loading(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.textContent = on ? "Зачекайте..." : label;
  }

  function genJoinCode(len = 6) {
    return (Math.random().toString(36).slice(2, 2 + len)).toUpperCase();
  }

  // --------- SIGNUP ----------
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg(signupMsg, "", "");
      loading(signupBtn, true, "Створити акаунт");

      try {
        const email     = (document.getElementById("signupEmail")?.value || "").trim();
        const password  = (document.getElementById("signupPassword")?.value || "");
        const fullName  = (document.getElementById("signupFullName")?.value || "").trim();
        const phone     = (document.getElementById("signupPhone")?.value || "").trim();
        const city      = (document.getElementById("signupCity")?.value || "").trim();

        const isCaptain = !!document.getElementById("signupRoleCaptain")?.checked;
        const teamName  = (document.getElementById("signupTeamName")?.value || "").trim();
        const joinCode  = (document.getElementById("signupJoinCode")?.value || "").trim().toUpperCase();

        if (!email || !password || !fullName || !phone || !city) throw new Error("Заповніть усі обовʼязкові поля.");
        if (password.length < 6) throw new Error("Пароль має містити щонайменше 6 символів.");
        if (isCaptain && !teamName) throw new Error("Вкажіть назву команди.");
        if (!isCaptain && !joinCode) throw new Error("Вкажіть код приєднання до команди.");

        // 1) створюємо auth-user
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2) команда
        let teamId = null;
        let finalJoinCode = null;

        if (isCaptain) {
          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          finalJoinCode = genJoinCode(6);

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

        } else {
          const snap = await db.collection("teams")
            .where("joinCode", "==", joinCode)
            .limit(1)
            .get();

          if (snap.empty) throw new Error("Команду з таким кодом не знайдено.");

          teamId = snap.docs[0].id;
        }

        // 3) users/{uid}
        await db.collection("users").doc(uid).set({
          fullName,
          email,
          phone,
          city,
          role: isCaptain ? "captain" : "member",
          teamId: teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        msg(
          signupMsg,
          isCaptain
            ? `Акаунт створено! Код команди: ${finalJoinCode}. Переходимо в кабінет…`
            : "Акаунт створено та приєднано до команди. Переходимо в кабінет…",
          "ok"
        );

        setTimeout(() => (window.location.href = "cabinet.html"), 700);

      } catch (err) {
        console.error(err);
        const code = err?.code || "";
        let text = err?.message || "Помилка реєстрації.";

        if (code === "auth/email-already-in-use") text = "Такий email вже використовується.";
        if (code === "auth/invalid-email") text = "Email має некоректний формат.";
        if (code === "auth/weak-password") text = "Пароль занадто слабкий (мін. 6 символів).";

        msg(signupMsg, text, "err");
      } finally {
        loading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // --------- LOGIN ----------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg(loginMsg, "", "");
      loading(loginBtn, true, "Увійти");

      try {
        const email    = (document.getElementById("loginEmail")?.value || "").trim();
        const password = (document.getElementById("loginPassword")?.value || "");

        if (!email || !password) throw new Error("Введіть email та пароль.");

        await auth.signInWithEmailAndPassword(email, password);
        msg(loginMsg, "Вхід успішний. Переходимо у кабінет…", "ok");

        setTimeout(() => (window.location.href = "cabinet.html"), 450);

      } catch (err) {
        console.error(err);
        const code = err?.code || "";
        let text = err?.message || "Помилка входу.";

        if (code === "auth/wrong-password") text = "Невірний пароль.";
        if (code === "auth/user-not-found") text = "Користувача з таким email не знайдено.";
        if (code === "auth/invalid-credential") text = "Невірний email або пароль.";

        msg(loginMsg, text, "err");
      } finally {
        loading(loginBtn, false, "Увійти");
      }
    });
  }

  // якщо вже залогінений і зайшов на auth.html — кидаємо в cabinet
  auth.onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
})();
