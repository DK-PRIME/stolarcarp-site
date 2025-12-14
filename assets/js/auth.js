// assets/js/auth.js
// STOLAR CARP: реєстрація акаунта + вхід
// Працює з compat SDK через window.scAuth / window.scDb

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір підключення compat + firebase-init.js");
    return;
  }

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

  function normalizeCode(s) {
    return (s || "").trim().toUpperCase();
  }

  function genJoinCode6() {
    // 6 символів A-Z0-9
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function findTeamByJoinCode(joinCode) {
    const snap = await db.collection("teams")
      .where("joinCode", "==", joinCode)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // ----------------- РЕЄСТРАЦІЯ -----------------
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      let createdUser = null;

      try {
        const email     = document.getElementById("signupEmail")?.value?.trim();
        const password  = document.getElementById("signupPassword")?.value || "";
        const fullName  = document.getElementById("signupFullName")?.value?.trim();
        const phone     = document.getElementById("signupPhone")?.value?.trim();
        const city      = document.getElementById("signupCity")?.value?.trim();

        const isCaptain = !!document.getElementById("signupRoleCaptain")?.checked;
        const teamName  = document.getElementById("signupTeamName")?.value?.trim();
        const joinCode  = normalizeCode(document.getElementById("signupJoinCode")?.value);

        if (!email || !password || !fullName || !phone || !city) {
          throw new Error("Заповніть усі обовʼязкові поля.");
        }
        if (password.length < 6) {
          throw new Error("Пароль має містити щонайменше 6 символів.");
        }
        if (isCaptain && !teamName) {
          throw new Error("Вкажіть назву команди.");
        }
        if (!isCaptain && !joinCode) {
          throw new Error("Вкажіть код приєднання до команди.");
        }

        // 1) створюємо користувача Auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        createdUser = cred.user;
        const uid = createdUser.uid;

        // 2) команда
        let teamId = null;

        if (isCaptain) {
          // створюємо team doc
          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          // генеруємо joinCode і пробуємо уникати колізій
          let code = genJoinCode6();
          for (let attempt = 0; attempt < 5; attempt++) {
            const existing = await findTeamByJoinCode(code);
            if (!existing) break;
            code = genJoinCode6();
          }

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: code,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          showMsg(signupMsg, `Акаунт створено! Код команди: ${code}.`, "ok");
        } else {
          const team = await findTeamByJoinCode(joinCode);
          if (!team) throw new Error("Команду з таким кодом не знайдено.");
          teamId = team.id;

          showMsg(signupMsg, "Акаунт створено та приєднано до команди.", "ok");
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

        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 500);

      } catch (err) {
        console.error(err);

        // якщо ми вже створили Auth-юзера, але далі впало (наприклад joinCode не знайдено) — чистимо
        try {
          if (createdUser && createdUser.delete) await createdUser.delete();
        } catch (_) {}

        let text = err?.message || "Сталася помилка під час реєстрації.";
        if (String(text).includes("auth/email-already-in-use")) text = "Такий email вже використовується.";
        if (String(text).includes("auth/invalid-email")) text = "Email має некоректний формат.";
        if (String(text).includes("auth/weak-password")) text = "Пароль надто простий (мінімум 6 символів).";

        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // ----------------- ВХІД -----------------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(loginMsg, "", "");
      setLoading(loginBtn, true, "Увійти");

      try {
        const email    = document.getElementById("loginEmail")?.value?.trim();
        const password = document.getElementById("loginPassword")?.value || "";

        if (!email || !password) throw new Error("Введіть email та пароль.");

        await auth.signInWithEmailAndPassword(email, password);
        showMsg(loginMsg, "Вхід успішний, переходимо у кабінет…", "ok");

        setTimeout(() => {
          window.location.href = "cabinet.html";
        }, 300);

      } catch (err) {
        console.error(err);
        let text = err?.message || "Помилка входу.";
        if (String(text).includes("auth/wrong-password")) text = "Невірний пароль.";
        if (String(text).includes("auth/user-not-found")) text = "Користувача з таким email не знайдено.";
        if (String(text).includes("auth/invalid-credential")) text = "Невірний email або пароль.";
        showMsg(loginMsg, text, "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // якщо вже залогінений і зайшов на auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && (location.pathname.endsWith("auth.html") || location.pathname.endsWith("/auth.html"))) {
      window.location.href = "cabinet.html";
    }
  });
})();
