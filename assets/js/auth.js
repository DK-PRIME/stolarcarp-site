// assets/js/auth.js
(function () {
  const $ = (id) => document.getElementById(id);

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const qs = new URLSearchParams(location.search);
  const ADMIN_MODE = qs.get("admin") === "1"; // ✅ тільки якщо auth.html?admin=1

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  function show(el){ if(el) el.style.display = ""; }
  function hide(el){ if(el) el.style.display = "none"; }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не готовий (нема scAuth/scDb). Перевір підключення SDK та firebase-init.js");
  }

  // ====== ДРУЖНІ ПОВІДОМЛЕННЯ ПОМИЛОК (UA) ======
  function friendlyError(err, fallback = "Сталася помилка. Спробуй ще раз.") {
    const code = String(err?.code || "").trim();

    // Firebase Auth codes: https://firebase.google.com/docs/reference/js/auth
    const map = {
      "auth/email-already-in-use": "Цей email вже використовується. Спробуй увійти або відновити пароль.",
      "auth/invalid-email": "Невірний формат email.",
      "auth/weak-password": "Пароль занадто слабкий. Мінімум 6 символів.",
      "auth/wrong-password": "Невірний пароль.",
      "auth/user-not-found": "Користувача з таким email не знайдено.",
      "auth/too-many-requests": "Забагато спроб. Спробуй трохи пізніше.",
      "auth/network-request-failed": "Проблема з інтернетом. Перевір з’єднання та спробуй знову.",
      "auth/user-disabled": "Цей акаунт вимкнено. Звернись до адміністратора.",
      "auth/operation-not-allowed": "Вхід цим способом зараз недоступний.",
      "auth/requires-recent-login": "Для цієї дії потрібно повторно увійти в акаунт. Перезайди і спробуй ще раз.",

      // Firestore
      "permission-denied": "Немає доступу. Увійди в акаунт або звернись до адміністратора.",
      "failed-precondition": "Операцію зараз неможливо виконати. Спробуй пізніше.",
      "unavailable": "Сервіс тимчасово недоступний. Спробуй трохи пізніше.",
      "deadline-exceeded": "Операція перевищила час очікування. Спробуй ще раз.",
      "not-found": "Дані не знайдено.",
      "already-exists": "Такий запис вже існує.",
      "resource-exhausted": "Ліміт перевищено. Спробуй пізніше."
    };

    if (map[code]) return map[code];

    // наші/кастомні
    const msg = String(err?.message || "").trim();
    if (msg === "permission_denied_precheck") return "Немає доступу для перевірки. Продовжую реєстрацію…";
    if (msg) return msg;

    return fallback;
  }

  function genJoinCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // ====== УНІКАЛЬНІСТЬ НАЗВИ КОМАНДИ (1 символ має відрізнятись) ======
  function normalizeTeamName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }
  function teamNameKey(name) {
    return normalizeTeamName(name).toLowerCase();
  }

  async function isTeamNameTaken(db, name) {
    const norm = normalizeTeamName(name);
    if (!norm) return false;

    const key = teamNameKey(norm);

    const q1 = db.collection("teams").where("nameKey", "==", key).limit(1).get();
    const q2 = db.collection("teams").where("name", "==", norm).limit(1).get();

    const [s1, s2] = await Promise.allSettled([q1, q2]);

    const snap1 = (s1.status === "fulfilled") ? s1.value : null;
    const snap2 = (s2.status === "fulfilled") ? s2.value : null;

    if (snap1 && !snap1.empty) return true;
    if (snap2 && !snap2.empty) return true;

    const permDenied =
      (s1.status === "rejected" && String(s1.reason?.message || "").toLowerCase().includes("permission")) ||
      (s2.status === "rejected" && String(s2.reason?.message || "").toLowerCase().includes("permission")) ||
      (s1.status === "rejected" && String(s1.reason?.code || "") === "permission-denied") ||
      (s2.status === "rejected" && String(s2.reason?.code || "") === "permission-denied");

    if (permDenied) throw new Error("permission_denied_precheck");

    // інші помилки precheck не ховаємо
    const otherErr =
      (s1.status === "rejected" && !permDenied) ? s1.reason :
      (s2.status === "rejected" && !permDenied) ? s2.reason : null;
    if (otherErr) throw otherErr;

    return false;
  }

  async function createTeam(db, name, ownerUid) {
    const normName = normalizeTeamName(name) || "Команда";
    const nameKey = teamNameKey(normName);

    const taken = await isTeamNameTaken(db, normName);
    if (taken) {
      throw new Error("Назва команди вже використовується. Додай 1 цифру або літеру, щоб відрізнялась.");
    }

    for (let i = 0; i < 10; i++) {
      const joinCode = genJoinCode(6);
      const exists = await db.collection("teams").where("joinCode", "==", joinCode).limit(1).get();
      if (!exists.empty) continue;

      const now = window.firebase.firestore.FieldValue.serverTimestamp();

      const ref = await db.collection("teams").add({
        name: normName,
        nameKey,
        ownerUid,
        joinCode,
        createdAt: now,
        updatedAt: now
      });

      return { teamId: ref.id, joinCode, name: normName };
    }
    throw new Error("Не вдалося згенерувати унікальний joinCode. Спробуй ще раз.");
  }

  async function findTeamByJoinCode(db, code) {
    const c = String(code || "").trim().toUpperCase();
    const snap = await db.collection("teams").where("joinCode", "==", c).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { teamId: doc.id, ...doc.data() };
  }

  // ====== ДИСЦИПЛІНА ПОЛІВ createdAt/updatedAt ======
  async function ensureUserDoc(db, uid, data) {
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    const now = window.firebase.firestore.FieldValue.serverTimestamp();

    const base = {
      fullName: data.fullName || "",
      email: data.email || "",
      phone: data.phone || "",
      city: data.city || "",
      role: data.role || "member",
      teamId: data.teamId || null,
      avatarUrl: ""
    };

    if (!snap.exists) {
      await ref.set({
        ...base,
        createdAt: now,
        updatedAt: now
      });
      return;
    }

    const cur = snap.data() || {};
    const patch = {};
    if (!cur.fullName && base.fullName) patch.fullName = base.fullName;
    if (!cur.email && base.email) patch.email = base.email;
    if (!cur.phone && base.phone) patch.phone = base.phone;
    if (!cur.city && base.city) patch.city = base.city;
    if (cur.teamId == null && base.teamId) patch.teamId = base.teamId;
    if (!cur.role && base.role) patch.role = base.role;

    if (Object.keys(patch).length) {
      patch.updatedAt = now;
      await ref.set(patch, { merge: true });
    }
  }

  async function setUserTeamAndRole(db, uid, teamId, role) {
    await db.collection("users").doc(uid).set({
      teamId: teamId || null,
      role: role || "member",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // ✅ єдиний редірект: адмін -> admin.html ТІЛЬКИ в admin-mode
  function goAfterAuth(user){
    if (ADMIN_MODE && user && user.uid === ADMIN_UID) {
      location.href = "admin.html";
      return;
    }
    location.href = "cabinet.html";
  }

  // ====== UI blocks (якщо їх нема у твоєму auth.html — не заважає) ======
  const loggedBox = $("loggedBox");
  const authBox   = $("authBox");
  const btnGoCab  = $("goCabinetBtn");
  const btnLogout = $("logoutBtn");
  const loggedMsg = $("loggedMsg");

  const signupForm = $("signupForm");
  const loginForm  = $("loginForm");
  const signupMsg  = $("signupMsg");
  const loginMsg   = $("loginMsg");

  function showLoggedInUI(user) {
    if (loggedMsg) {
      loggedMsg.textContent = (ADMIN_MODE && user?.uid === ADMIN_UID)
        ? "Ви увійшли як адміністратор (admin-mode)."
        : "Ви вже увійшли у свій акаунт.";
    }
    if (loggedBox) show(loggedBox);
    if (authBox) hide(authBox);
  }

  function showAuthUI() {
    if (loggedBox) hide(loggedBox);
    if (authBox) show(authBox);
  }

  async function onSignup(e) {
    e.preventDefault();
    setMsg(signupMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;
    const db = window.scDb;

    const email = ($("signupEmail")?.value || "").trim();
    const pass = $("signupPassword")?.value || "";
    const fullName = ($("signupFullName")?.value || "").trim();
    const phone = ($("signupPhone")?.value || "").trim();
    const city = ($("signupCity")?.value || "").trim();

    const role = (document.querySelector('input[name="signupRole"]:checked')?.value || "captain").trim();
    const teamNameRaw = ($("signupTeamName")?.value || "").trim();
    const joinCodeRaw = ($("signupJoinCode")?.value || "").trim();

    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(signupMsg, "Заповни всі поля (email, пароль ≥ 6, ПІБ, телефон, місто).", "err");
      return;
    }

    const teamName = normalizeTeamName(teamNameRaw);
    const joinCode = String(joinCodeRaw || "").trim();

    if (role === "captain" && !teamName) {
      setMsg(signupMsg, "Для капітана потрібна назва команди.", "err");
      return;
    }
    if (role === "member" && !joinCode) {
      setMsg(signupMsg, "Для учасника потрібен код приєднання (joinCode).", "err");
      return;
    }

    let preTeam = null;

// precheck (може впасти через rules — тоді повторимо після signup)
try {

  if (role === "member") {
    // Перевірка joinCode
    preTeam = await findTeamByJoinCode(db, joinCode);
    if (!preTeam) {
      setMsg(signupMsg, "Команду з таким кодом не знайдено ❌", "err");
      return;
    }
  }

  if (role === "captain") {
    // Перевірка дубля назви команди
    const taken = await isTeamNameTaken(db, teamName);
    if (taken) {
      setMsg(
        signupMsg,
        "Назва команди вже використовується. Додай 1 цифру або літеру.",
        "err"
      );
      return;
    }
  }

} catch (preErr) {

  const code = String(preErr?.code || "").toLowerCase();

  // ❗ Немає прав читати teams ДО створення акаунта — це нормально
  if (code === "permission-denied") {
    console.warn(
      "Precheck пропущено через правила Firestore. Перевірку перенесемо після signup."
    );
  }

  // ⏱️ Тимчасові проблеми Firestore — дозволено один retry
  else if (code === "unavailable" || code === "deadline-exceeded") {
    console.warn("Тимчасова проблема Firestore. Виконую один retry precheck…");
    try {
      const retryTaken = await isTeamNameTaken(db, teamName);
      if (retryTaken) {
        setMsg(
          signupMsg,
          "Назва команди вже використовується. Додай 1 цифру або літеру.",
          "err"
        );
        return;
      }
    } catch (retryErr) {
      console.warn("Retry не вдався. Перевірку перенесемо після signup:", retryErr);
      // fallback → продовжуємо signup
    }
  }

  // ❌ Будь-яка інша помилка — критична
  else {
    setMsg(signupMsg, friendlyError(preErr), "err");
    $("signupBtn") && ($("signupBtn").disabled = false);
    return;
  }
}

let createdUser = null;
let createdTeamId = null;

try {
  $("signupBtn") && ($("signupBtn").disabled = true);
  setMsg(signupMsg, "Готую реєстрацію…", "");

  const cred = await auth.createUserWithEmailAndPassword(email, pass);
  const user = cred.user;
  createdUser = user;

  if (role === "member") {
    setMsg(signupMsg, "Підключаю до команди…", "");

    const team = preTeam || await findTeamByJoinCode(db, joinCode);
    if (!team) {
      setMsg(signupMsg, "Команду з таким кодом не знайдено ❌", "err");
      try { await user.delete(); } catch (delErr) { console.warn(delErr); }
      try { await auth.signOut(); } catch (_) {}
      return;
    }

    await ensureUserDoc(db, user.uid, {
      fullName,
      email,
      phone,
      city,
      role: "member",
      teamId: team.teamId
    });

    await setUserTeamAndRole(db, user.uid, team.teamId, "member");

    setMsg(signupMsg, `Готово ✅ Ти в команді: ${team.name}`, "ok");
    setTimeout(() => goAfterAuth(user), 450);
    return;
  }

  if (role === "captain") {
    // Перевірка дубля назви команди
    const taken = await isTeamNameTaken(db, teamName);
    if (taken) {
      setMsg(
        signupMsg,
        "Назва команди вже використовується. Додай 1 цифру або літеру.",
        "err"
      );
      return;
    }
  }

} catch (preErr) {

  const code = String(preErr?.code || "").toLowerCase();

  // ❗ Правила Firestore не дають читати teams ДО створення акаунта
  if (code === "permission-denied") {
    console.warn("Precheck пропущено через rules Firestore — виконаємо після signup.");
    // Продовжуємо signup без return


      if (role === "captain") {
        setMsg(signupMsg, "Створюю команду…", "");

        const team = await createTeam(db, teamName, user.uid);
        createdTeamId = team.teamId;

        await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role: "captain", teamId: team.teamId });
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");

        setMsg(signupMsg, `Готово ✅ Команда створена. Код приєднання: ${team.joinCode}`, "ok");
        setTimeout(() => goAfterAuth(user), 450);
        return;
      }

      await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role, teamId: null });
      setMsg(signupMsg, "Акаунт створено ✅", "ok");
      setTimeout(() => goAfterAuth(user), 450);

    } catch (err) {
      console.error(err);

      const msg = friendlyError(err, "Помилка реєстрації");

      if (createdUser) {
        try {
          if (createdTeamId) {
            try { await db.collection("teams").doc(createdTeamId).delete(); } catch (tErr) { console.warn(tErr); }
          }
          try { await createdUser.delete(); } catch (delErr) { console.warn(delErr); }
          try { await auth.signOut(); } catch (_) {}
        } catch (_) {}
      }

      setMsg(signupMsg, msg, "err");
    } finally {
      $("signupBtn") && ($("signupBtn").disabled = false);
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setMsg(loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;

    const email = ($("loginEmail")?.value || "").trim();
    const pass = $("loginPassword")?.value || "";

    if (!email || !pass) {
      setMsg(loginMsg, "Введи email і пароль.", "err");
      return;
    }

    try {
      $("loginBtn") && ($("loginBtn").disabled = true);
      setMsg(loginMsg, "Вхід…", "");

      await auth.signInWithEmailAndPassword(email, pass);

      const user = auth.currentUser;
      setMsg(loginMsg, "Готово ✅", "ok");
      setTimeout(() => goAfterAuth(user), 250);

    } catch (err) {
      console.error(err);
      setMsg(loginMsg, friendlyError(err, "Помилка входу"), "err");
    } finally {
      $("loginBtn") && ($("loginBtn").disabled = false);
    }
  }

  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);

  if (btnGoCab) btnGoCab.addEventListener("click", (e) => {
    e.preventDefault();
    const u = window.scAuth?.currentUser || null;
    goAfterAuth(u);
  });

  if (btnLogout) btnLogout.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await waitFirebase();
      await window.scAuth.signOut();
    } catch (err) {
      console.warn(err);
    }
  });

  (async () => {
    try {
      await waitFirebase();
      window.scAuth.onAuthStateChanged((u) => {
        if (u) showLoggedInUI(u);
        else showAuthUI();
      });
    } catch (e) {
      console.warn(e);
      showAuthUI();
    }
  })();
})();
