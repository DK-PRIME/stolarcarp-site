// assets/js/auth.js
// STOLAR CARP — реєстрація + вхід (Firebase Auth + Firestore) через compat SDK.
// ВИМОГА: перед цим підключено firebase-*-compat + assets/js/firebase-init.js
// Пише у Firestore:
//   users/{uid}  -> { fullName, email, phone, city, role, teamId, createdAt }
//   teams/{teamId} -> { name, ownerUid, joinCode, createdAt }

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір підключення firebase-*-compat + firebase-init.js");
    return;
  }

  // ===== DOM =====
  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");

  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");

  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-msg" + (type ? (" " + type) : "");
  }

  function setLoading(btn, loading, labelDefault) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.textContent = loading ? "Зачекайте..." : labelDefault;
  }

  function normEmail(v){ return String(v||"").trim().toLowerCase(); }
  function normStr(v){ return String(v||"").trim(); }
  function upper(v){ return normStr(v).toUpperCase(); }

  // 6-символьний joinCode, без I/O/1 щоб менше плутанини
  function makeJoinCode(len=6) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i=0;i<len;i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
    return out;
  }

  async function ensureUniqueJoinCode(maxTries=12) {
    for (let i=0;i<maxTries;i++) {
      const code = makeJoinCode(6);
      const snap = await db.collection("teams").where("joinCode","==",code).limit(1).get();
      if (snap.empty) return code;
    }
    return (makeJoinCode(4) + Date.now().toString(36).slice(-2)).toUpperCase();
  }

  function mapAuthError(err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.includes("auth/email-already-in-use")) return "Такий email вже використовується.";
    if (msg.includes("auth/invalid-email")) return "Email має некоректний формат.";
    if (msg.includes("auth/weak-password")) return "Пароль занадто слабкий (мінімум 6 символів).";
    if (msg.includes("auth/wrong-password")) return "Невірний пароль.";
    if (msg.includes("auth/user-not-found")) return "Користувача з таким email не знайдено.";
    if (msg.includes("auth/too-many-requests")) return "Забагато спроб. Спробуйте пізніше.";
    if (msg.includes("permission-denied")) return "Немає доступу. Перевір правила Firestore (rules).";
    return msg || "Сталася помилка.";
  }

  // =========================
  //  РЕЄСТРАЦІЯ
  // =========================
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(signupMsg, "", "");
      setLoading(signupBtn, true, "Створити акаунт");

      try {
        const email     = normEmail(document.getElementById("signupEmail")?.value);
        const password  = String(document.getElementById("signupPassword")?.value || "");
        const fullName  = normStr(document.getElementById("signupFullName")?.value);
        const phone     = normStr(document.getElementById("signupPhone")?.value);
        const city      = normStr(document.getElementById("signupCity")?.value);

        const isCaptain = !!document.getElementById("signupRoleCaptain")?.checked;
        const teamName  = normStr(document.getElementById("signupTeamName")?.value);
        const joinCode  = upper(document.getElementById("signupJoinCode")?.value);

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

        // 1) створюємо користувача в Auth (одразу логінить)
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid  = cred.user.uid;

        // 2) команда: створити або знайти по joinCode
        let teamId = null;
        let teamJoinCode = null;

        if (isCaptain) {
          teamJoinCode = await ensureUniqueJoinCode();

          const teamRef = db.collection("teams").doc(); // авто-id
          teamId = teamRef.id;

          await teamRef.set({
            name: teamName,
            ownerUid: uid,
            joinCode: teamJoinCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

        } else {
          const snap = await db.collection("teams")
            .where("joinCode","==",joinCode)
            .limit(1)
            .get();

          if (snap.empty) throw new Error("Команду з таким кодом не знайдено.");
          const tdoc = snap.docs[0];
          teamId = tdoc.id;
          teamJoinCode = (tdoc.data() && tdoc.data().joinCode) ? tdoc.data().joinCode : joinCode;
        }

        // 3) users/{uid} — ОДИН канонічний профіль для STOLAR CARP + DK Prime
        await db.collection("users").doc(uid).set({
          fullName: fullName,
          email: email,
          phone: phone,
          city: city,
          role: isCaptain ? "captain" : "member",
          teamId: teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showMsg(
          signupMsg,
          isCaptain
            ? ("Акаунт створено! Код команди: " + teamJoinCode + ". Переходимо в кабінет…")
            : ("Акаунт створено та приєднано до команди. Переходимо в кабінет…"),
          "ok"
        );

        setTimeout(() => { window.location.href = "cabinet.html"; }, 700);

      } catch (err) {
        console.error(err);
        showMsg(signupMsg, mapAuthError(err), "err");

        // якщо впало після створення Auth — виходимо, щоб не залишати «битий» стан
        try { await auth.signOut(); } catch(_){}
      } finally {
        setLoading(signupBtn, false, "Створити акаунт");
      }
    });
  }

  // =========================
  //  ВХІД
  // =========================
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg(loginMsg, "", "");
      setLoading(loginBtn, true, "Увійти");

      try {
        const email    = normEmail(document.getElementById("loginEmail")?.value);
        const password = String(document.getElementById("loginPassword")?.value || "");

        if (!email || !password) throw new Error("Введіть email та пароль.");

        await auth.signInWithEmailAndPassword(email, password);

        showMsg(loginMsg, "Вхід успішний, переходимо у кабінет…", "ok");
        setTimeout(() => { window.location.href = "cabinet.html"; }, 500);

      } catch (err) {
        console.error(err);
        showMsg(loginMsg, mapAuthError(err), "err");
      } finally {
        setLoading(loginBtn, false, "Увійти");
      }
    });
  }

  // якщо вже залогінений і зайшов на auth.html — кидаємо у кабінет
  auth.onAuthStateChanged((user) => {
    if (user && /auth\.html$/i.test(window.location.pathname)) {
      window.location.href = "cabinet.html";
    }
  });
})();
