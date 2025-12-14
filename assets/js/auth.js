// assets/js/auth.js
// STOLAR CARP — Реєстрація + Вхід (Firebase compat 10.12.2)
// Працює з firebase-init.js (window.scAuth, window.scDb)

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований. Підключи firebase-*-compat.js та assets/js/firebase-init.js");
    return;
  }

  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");

  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");

  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  const roleCaptainRadio = document.getElementById("signupRoleCaptain");
  const roleMemberRadio  = document.getElementById("signupRoleMember");

  const teamNameWrap = document.getElementById("signupTeamNameWrap");
  const joinCodeWrap = document.getElementById("signupJoinCodeWrap");

  const teamNameInput = document.getElementById("signupTeamName");
  const joinCodeInput = document.getElementById("signupJoinCode");

  const phoneCleanInput  = document.getElementById("signupPhoneClean");
  const phoneHiddenInput = document.getElementById("signupPhone"); // hidden

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "form-msg" + (type ? " " + type : "");
  }

  function setLoading(btn, loading, labelDefault) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.textContent = loading ? "Зачекайте..." : labelDefault;
  }

  function normalizeJoinCode(v) {
    return (v || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  }

  function normalizePhone(v) {
    let s = (v || "").trim().replace(/[^\d+]/g, "");
    if (!s) return "";
    if (s[0] !== "+") {
      if (s.startsWith("0")) s = "+38" + s;
      else if (s.startsWith("38")) s = "+" + s;
      else s = "+" + s;
    }
    return s;
  }

  function genJoinCode6() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function toggleRoleUI() {
    const isCaptain = !!(roleCaptainRadio && roleCaptainRadio.checked);
    if (teamNameWrap) teamNameWrap.style.display = isCaptain ? "block" : "none";
    if (joinCodeWrap) joinCodeWrap.style.display = isCaptain ? "none" : "block";
  }

  if (roleCaptainRadio) roleCaptainRadio.addEventListener("change", toggleRoleUI);
  if (roleMemberRadio)  roleMemberRadio.addEventListener("change", toggleRoleUI);
  toggleRoleUI();

  if (joinCodeInput) {
    joinCodeInput.addEventListener("input", () => {
      joinCodeInput.value = normalizeJoinCode(joinCodeInput.value);
    });
  }

  if (phoneCleanInput) {
    phoneCleanInput.addEventListener("input", () => {
      const normalized = normalizePhone(phoneCleanInput.value);
      if (phoneHiddenInput) phoneHiddenInput.value = normalized;
    });
  }

  // ===== SIGNUP =====
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email    = (document.getElementById("signupEmail")?.value || "").trim();
        const password = (document.getElementById("signupPassword")?.value || "");
        const fullName = (document.getElementById("signupFullName")?.value || "").trim();
        const city     = (document.getElementById("signupCity")?.value || "").trim();
        const phone    = normalizePhone(phoneCleanInput?.value || phoneHiddenInput?.value || "");

        const isCaptain = !!(roleCaptainRadio && roleCaptainRadio.checked);
        const teamName  = (teamNameInput?.value || "").trim();
        const joinCode  = normalizeJoinCode(joinCodeInput?.value || "");

        if (!email || !password || !fullName || !phone || !city) {
          throw new Error("Заповніть усі обовʼязкові поля.");
        }
        if (password.length < 6) throw new Error("Пароль має містити щонайменше 6 символів.");
        if (isCaptain && !teamName) throw new Error("Вкажіть назву команди.");
        if (!isCaptain && !joinCode) throw new Error("Вкажіть код приєднання до команди.");

        // 1) auth
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2) team
        let teamId = null;

        if (isCaptain) {
          let finalJoinCode = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = genJoinCode6();
            const existsSnap = await db.collection("teams").where("joinCode", "==", candidate).limit(1).get();
            if (existsSnap.empty) { finalJoinCode = candidate; break; }
          }
          if (!finalJoinCode) finalJoinCode = genJoinCode6();

          const teamRef = db.collection("teams").doc();
          teamId = teamRef.id;

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: finalJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          showMsg(signupMsg, `Акаунт створено! Код команди: ${finalJoinCode}. Переходимо в кабінет…`, "ok");
        } else {
          const snap = await db.collection("teams").where("joinCode", "==", joinCode).limit(1).get();
          if (snap.empty) throw new Error("Команду з таким кодом не знайдено.");
          teamId = snap.docs[0].id;

          showMsg(signupMsg, "Акаунт створено та приєднано до команди. Переходимо в кабінет…", "ok");
        }

        // 3) users/{uid} — єдина схема
        await db.collection("users").doc(uid).set({
          fullName,
          email,
          phone,
          city,
          role: isCaptain ? "captain" : "member",
          teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          avatarUrl: ""
        }, { merge: true });

        setTimeout(() => window.location.href = "cabinet.html", 400);

      } catch (err) {
        console.error(err);
        let text = err?.message || "Сталася помилка під час реєстрації.";
        const code = err?.code || "";

        if (code === "auth/email-already-in-use") text = "Такий email вже використовується.";
        else if (code === "auth/invalid-email") text = "Email має некоректний формат.";
        else if (code === "auth/weak-password") text = "Пароль надто слабкий (мінімум 6 символів).";

        showMsg(signupMsg, text, "err");
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // ===== LOGIN =====
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(loginMsg, "", "");
      setLoading(loginBtn, true, "Увійти");

      try {
        const email    = (document.getElementById("loginEmail")?.value || "").trim();
        const password = (document.getElementById("loginPassword")?.value || "");

        if (!email || !password) throw new Error("Введіть email та пароль.");

        await auth.signInWithEmailAndPassword(email, password);

        showMsg(loginMsg, "Вхід успішний, переходимо у кабінет…", "ok");
        setTimeout(() => window.location.href = "cabinet.html", 250);

      } catch (err) {
        console.error(err);
        let text = err?.message || "Помилка входу.";
        const code = err?.code || "";

        if (code === "auth/user-not-found") text = "Користувача з таким email не знайдено.";
        else if (code === "auth/wrong-password") text = "Невірний пароль.";
        else if (code === "auth/invalid-credential") text = "Невірні дані входу.";

        showMsg(loginMsg, text, "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // якщо вже залогінений на auth.html — у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && window.location.pathname.endsWith("auth.html")) {
      window.location.href = "cabinet.html";
    }
  });
})();
