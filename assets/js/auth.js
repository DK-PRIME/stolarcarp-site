// assets/js/auth.js
(function () {
  const $ = (id) => document.getElementById(id);

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const qs = new URLSearchParams(location.search);
  const ADMIN_MODE =
    location.pathname.includes("admin.html") ||
    (qs.get("admin") === "1" && location.pathname.includes("auth-admin.html"));

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }

  async function waitFirebase(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Firebase не готовий");
  }

  function friendlyError(err, fallback = "Сталася помилка. Спробуй ще раз.") {
    const code = String(err?.code || "").trim();
    const msg = String(err?.message || "").trim();

    const map = {
      "auth/email-already-in-use": "Цей email вже використовується.",
      "auth/invalid-email": "Невірний формат email.",
      "auth/weak-password": "Пароль занадто слабкий. Мінімум 6 символів.",
      "auth/wrong-password": "Невірний пароль.",
      "auth/user-not-found": "Користувача з таким email не знайдено.",
      "auth/too-many-requests": "Забагато спроб. Спробуй пізніше.",
      "auth/network-request-failed": "Проблема з інтернетом.",
      "auth/user-disabled": "Акаунт вимкнено.",
      "permission-denied": "Немає доступу.",
      "not-found": "Дані не знайдено.",
      "already-exists": "Такий запис вже існує."
    };

    if (map[code]) return map[code];
    if (msg.includes("team_name_too_short")) return "Назва команди занадто коротка (мін. 3 символи).";
    if (msg.includes("team_name_taken")) return "Така назва команди вже існує.";
    if (msg.includes("invalid_join_code")) return "Невірний код команди.";
    if (msg.includes("team_not_found")) return "Команду з таким кодом не знайдено.";
    if (msg) return msg;
    return fallback;
  }

  function genJoinCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function normalizeTeamName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function isValidTeamName(name) {
    const norm = normalizeTeamName(name);
    return norm.length >= 3 && /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9\s\-]+$/.test(norm);
  }

  async function isTeamNameTaken(db, name) {
    const norm = normalizeTeamName(name);
    const key = norm.toLowerCase();

    const snap = await db.collection("teams")
      .where("nameKey", "==", key)
      .limit(1)
      .get();

    return !snap.empty;
  }

  async function findTeamByJoinCode(db, code) {
    const c = String(code || "").trim().toUpperCase();
    if (c.length !== 6) return null;

    const snap = await db.collection("teams")
      .where("joinCode", "==", c)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { teamId: doc.id, ...doc.data() };
  }

  async function createTeam(db, name, ownerUid) {
    const normName = normalizeTeamName(name);
    const nameKey = normName.toLowerCase();

    const taken = await isTeamNameTaken(db, normName);
    if (taken) throw new Error("team_name_taken");

    for (let i = 0; i < 15; i++) {
      const joinCode = genJoinCode(6);

      const exists = await db.collection("teams")
        .where("joinCode", "==", joinCode)
        .limit(1)
        .get();

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

    throw new Error("Не вдалося згенерувати код команди");
  }

  async function ensureUserDoc(db, uid, data, forceUpdate = false) {
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
      createdAt: now,
      updatedAt: now
    };

    if (!snap.exists) {
      await ref.set(base);
      return;
    }

    const cur = snap.data() || {};
    const patch = {};

    if (!cur.fullName && base.fullName) patch.fullName = base.fullName;
    if (!cur.email && base.email) patch.email = base.email;
    if (!cur.phone && base.phone) patch.phone = base.phone;
    if (!cur.city && base.city) patch.city = base.city;
    if (forceUpdate || cur.teamId == null) patch.teamId = base.teamId;
    if (!cur.role && base.role) patch.role = base.role;

    if (Object.keys(patch).length) {
      patch.updatedAt = now;
      await ref.update(patch);
    }
  }

  function goAfterAuth(user) {
    if (ADMIN_MODE && user?.uid === ADMIN_UID) {
      location.href = "admin.html";
      return;
    }
    location.href = "cabinet.html";
  }

  const loggedBox = $("loggedBox");
  const authBox = $("authBox");
  const btnGoCab = $("goCabinetBtn");
  const btnLogout = $("logoutBtn");
  const loggedMsg = $("loggedMsg");

  const signupForm = $("signupForm");
  const loginForm = $("loginForm");
  const signupMsg = $("signupMsg");
  const loginMsg = $("loginMsg");
  const resetPassBtn = $("resetPassBtn");

  function showLoggedInUI(user) {
    if (loggedMsg) {
      loggedMsg.textContent = (ADMIN_MODE && user?.uid === ADMIN_UID)
        ? "Ви увійшли як адміністратор."
        : "Ви вже увійшли у свій акаунт.";
    }
    show(loggedBox);
    hide(authBox);
  }

  function showAuthUI() {
    hide(loggedBox);
    show(authBox);
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
    const role = document.querySelector('input[name="signupRole"]:checked')?.value || "captain";
    const teamNameRaw = ($("signupTeamName")?.value || "").trim();
    const joinCodeRaw = ($("signupJoinCode")?.value || "").trim();

    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(signupMsg, "Заповни всі поля (пароль мін. 6 символів).", "err");
      return;
    }

    let teamContext = null;

    if (role === "captain") {
      if (!isValidTeamName(teamNameRaw)) {
        setMsg(signupMsg, "Назва команди: мін. 3 символи (літери, цифри, дефіс).", "err");
        return;
      }

      try {
        const taken = await isTeamNameTaken(db, teamNameRaw);
        if (taken) {
          setMsg(signupMsg, "Така назва команди вже існує. Вибери іншу.", "err");
          return;
        }
      } catch (err) {
        console.warn("Перевірка назви:", err);
      }
    }

    if (role === "member") {
      const joinCode = joinCodeRaw.toUpperCase();

      if (joinCode.length !== 6) {
        setMsg(signupMsg, "Введи код команди (6 символів).", "err");
        return;
      }

      setMsg(signupMsg, "Перевіряю код команди…", "");

      const team = await findTeamByJoinCode(db, joinCode);

      if (!team) {
        setMsg(signupMsg, "Команду з таким кодом не знайдено. Перевір код.", "err");
        return;
      }

      teamContext = team;
    }

    let createdUser = null;
    let createdTeamId = null;

    try {
      const signupBtn = $("signupBtn");
      if (signupBtn) signupBtn.disabled = true;

      setMsg(signupMsg, role === "captain" ? "Створюю акаунт і команду…" : "Створюю акаунт…", "");

      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;
      createdUser = user;

      if (role === "captain") {
        setMsg(signupMsg, "Створюю команду…", "");

        const team = await createTeam(db, teamNameRaw, user.uid);
        createdTeamId = team.teamId;

        await ensureUserDoc(db, user.uid, {
          fullName,
          email,
          phone,
          city,
          role: "captain",
          teamId: team.teamId
        }, true);

        localStorage.setItem("sc_team_cache_" + user.uid, JSON.stringify({
          ts: Date.now(),
          teamId: team.teamId,
          name: team.name,
          role: "captain"
        }));

        setMsg(signupMsg, `✅ Команда "${team.name}" створена! Код: ${team.joinCode}`, "ok");
        setTimeout(() => goAfterAuth(user), 800);
      } else if (role === "member") {
        const team = teamContext || await findTeamByJoinCode(db, joinCodeRaw);

        if (!team) throw new Error("team_not_found");

        await ensureUserDoc(db, user.uid, {
          fullName,
          email,
          phone,
          city,
          role: "member",
          teamId: team.teamId
        }, true);

        localStorage.setItem("sc_team_cache_" + user.uid, JSON.stringify({
          ts: Date.now(),
          teamId: team.teamId,
          name: team.name,
          role: "member"
        }));

        setMsg(signupMsg, `✅ Ти в команді "${team.name}"!`, "ok");
        setTimeout(() => goAfterAuth(user), 500);
      }
    } catch (err) {
      console.error("Помилка реєстрації:", err);

      if (createdUser) {
        try {
          if (createdTeamId) {
            await db.collection("teams").doc(createdTeamId).delete();
          }
          await createdUser.delete();
          await auth.signOut();
        } catch (cleanupErr) {
          console.warn("Cleanup error:", cleanupErr);
        }
      }

      setMsg(signupMsg, friendlyError(err, "Помилка реєстрації"), "err");

      const signupBtn = $("signupBtn");
      if (signupBtn) signupBtn.disabled = false;
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    setMsg(loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;
    const db = window.scDb;

    const email = ($("loginEmail")?.value || "").trim();
    const pass = $("loginPassword")?.value || "";

    if (!email || !pass) {
      setMsg(loginMsg, "Введи email і пароль.", "err");
      return;
    }

    try {
      const loginBtn = $("loginBtn");
      if (loginBtn) loginBtn.disabled = true;

      setMsg(loginMsg, "Вхід…", "");

      await auth.signInWithEmailAndPassword(email, pass);
      const user = auth.currentUser;

      const userDoc = await db.collection("users").doc(user.uid).get();

      if (userDoc.exists && userDoc.data().teamId) {
        const teamId = userDoc.data().teamId;

        const teamDoc = await db.collection("teams").doc(teamId).get();
        const teamName = teamDoc.exists ? teamDoc.data().name : "Команда";

        localStorage.setItem("sc_team_cache_" + user.uid, JSON.stringify({
          ts: Date.now(),
          teamId,
          name: teamName
        }));
      }

      setMsg(loginMsg, "✅ Успішно!", "ok");
      setTimeout(() => goAfterAuth(user), 300);
    } catch (err) {
      console.error(err);
      setMsg(loginMsg, friendlyError(err, "Помилка входу"), "err");

      const loginBtn = $("loginBtn");
      if (loginBtn) loginBtn.disabled = false;
    }
  }

  async function onResetPassword(e) {
    e.preventDefault();
    setMsg(loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;

    const email = ($("loginEmail")?.value || "").trim();

    if (!email) {
      setMsg(loginMsg, "Введи email у полі входу, щоб відновити пароль.", "err");
      return;
    }

    try {
      if (resetPassBtn) resetPassBtn.disabled = true;

      await auth.sendPasswordResetEmail(email);

      setMsg(
        loginMsg,
        "✅ Лист для відновлення пароля відправлено. Перевір пошту та папку «Спам».",
        "ok"
      );
    } catch (err) {
      console.error("Помилка відновлення пароля:", err);
      setMsg(loginMsg, friendlyError(err, "Не вдалося відправити лист для відновлення."), "err");
    } finally {
      if (resetPassBtn) resetPassBtn.disabled = false;
    }
  }

  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);
  if (resetPassBtn) resetPassBtn.addEventListener("click", onResetPassword);

  if (btnGoCab) {
    btnGoCab.addEventListener("click", (e) => {
      e.preventDefault();
      goAfterAuth(window.scAuth?.currentUser);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await waitFirebase();
        await window.scAuth.signOut();
        showAuthUI();
      } catch (err) {
        console.warn(err);
      }
    });
  }

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
