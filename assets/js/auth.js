// assets/js/auth.js
// Реєстрація + вхід для STOLAR CARP.
// ПРАЦЮЄ ТІЛЬКИ З compat SDK (firebase-app-compat / auth-compat / firestore-compat)
// І ПІСЛЯ assets/js/firebase-init.js (вікно: scAuth, scDb).

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір підключення compat-скриптів + firebase-init.js");
    return;
  }

  // --- DOM ---
  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");

  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");

  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (type ? " " + type : "");
  }

  function setLoading(btn, loading, labelDefault) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.textContent = loading ? "Зачекайте..." : labelDefault;
  }

  function normalizeJoinCode(v) {
    return (v || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }

  function genJoinCode6() {
    // 6 символів (A-Z0-9) без схожих I/O/1/0
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // =========================
  // РЕЄСТРАЦІЯ
  // =========================
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email    = (document.getElementById("signupEmail")?.value || "").trim();
        const password = (document.getElementById("signupPassword")?.value || "");
        const fullName = (document.getElementById("signupFullName")?.value || "").trim();
        const phone    = (document.getElementById("signupPhone")?.value || "").trim();
        const phoneClean = (document.getElementById("signupPhoneClean")?.value || "").trim();
        const city     = (document.getElementById("signupCity")?.value || "").trim();

        const isCaptain = !!document.getElementById("signupRoleCaptain")?.checked;
        const teamName  = (document.getElementById("signupTeamName")?.value || "").trim();
        const joinCodeIn= normalizeJoinCode(document.getElementById("signupJoinCode")?.value || "");

        if (!email || !password || !fullName || !phone || !city) {
          throw new Error("Заповніть усі обовʼязкові поля.");
        }
        if (password.length < 6) {
          throw new Error("Пароль має містити щонайменше 6 символів.");
        }
        if (isCaptain && !teamName) {
          throw new Error("Вкажіть назву команди.");
        }
        if (!isCaptain && !joinCodeIn) {
          throw new Error("Вкажіть код приєднання до команди.");
        }

        // 1) створюємо користувача в Auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;

        // 2) створюємо/знаходимо команду
        let teamId = null;
        let finalJoinCode = "";

        if (isCaptain) {
          finalJoinCode = genJoinCode6();

          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

        } else {
          const snap = await db.collection("teams").where("joinCode", "==", joinCodeIn).limit(1).get();
          if (snap.empty) throw new Error("Команду з таким кодом не знайдено.");
          const docTeam = snap.docs[0];
          teamId = docTeam.id;
          finalJoinCode = docTeam.data()?.joinCode || joinCodeIn;
        }

        // 3) users/{uid} — ЄДИНА СХЕМА ДАНИХ
        await db.collection("users").doc(uid).set({
          fullName: fullName,
          email: email,
          phone: phone,
          phoneClean: phoneClean || null,
          city: city,
          role: isCaptain ? "captain" : "member",
          teamId: teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          avatarUrl: null
        }, { merge: true });

        showMsg(
          signupMsg,
          isCaptain
            ? `Акаунт створено! Код команди: ${finalJoinCode}. Переходимо в кабінет...`
            : `Акаунт створено та приєднано до команди. Переходимо в кабінет...`,
          "ok"
        );

        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 700);

      } catch (err) {
        console.error(err);
        let text = (err && err.message) ? err.message : "Сталася помилка під час реєстрації.";

        if (typeof text === "string") {
          if (text.includes("auth/email-already-in-use")) text = "Такий email вже використовується.";
          if (text.includes("auth/invalid-email")) text = "Email має некоректний формат.";
          if (text.includes("auth/weak-password")) text = "Пароль занадто слабкий (мінімум 6 символів).";
        }

        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // =========================
  // ВХІД
  // =========================
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(loginMsg, "", "");
      setLoading(loginBtn, true, "Увійти");

      try {
        const email    = (document.getElementById("loginEmail")?.value || "").trim();
        const password = (document.getElementById("loginPassword")?.value || "");

        if (!email || !password) {
          throw new Error("Введіть email та пароль.");
        }

        await auth.signInWithEmailAndPassword(email, password);

        showMsg(loginMsg, "Вхід успішний. Переходимо у кабінет…", "ok");
        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 400);

      } catch (err) {
        console.error(err);
        let text = (err && err.message) ? err.message : "Помилка входу.";

        if (typeof text === "string") {
          if (text.includes("auth/wrong-password")) text = "Невірний пароль.";
          if (text.includes("auth/user-not-found")) text = "Користувача з таким email не знайдено.";
          if (text.includes("auth/invalid-credential")) text = "Невірний email або пароль.";
        }

        showMsg(loginMsg, text, "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // Якщо вже залогінений і зайшов на auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    try {
      const path = (window.location.pathname || "").toLowerCase();
      const onAuthPage = path.endsWith("/auth.html") || path.endsWith("auth.html");
      if (user && onAuthPage) window.location.href = "cabinet.html";
    } catch (_) {}
  });
})();
