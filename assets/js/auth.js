// assets/js/auth.js
(function () {
  const $ = (id) => document.getElementById(id);

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const qs = new URLSearchParams(location.search);
  const ADMIN_MODE = qs.get("admin") === "1";

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  function show(el){ if(el) el.style.display = ""; }
  function hide(el){ if(el) el.style.display = "none"; }

  async function waitFirebase(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Firebase не готовий");
  }

  // ====== ПОВІДОМЛЕННЯ ПОМИЛОК (UA) ======
  function friendlyError(err, fallback = "Сталася помилка. Спробуй ще раз.") {
    const code = String(err?.code || "").trim();
    const msg = String(err?.message || "").trim();

    const map = {
      "auth/email-already-in-use": "Цей email вже використовується.",
      "auth/invalid-email": "Невірний формат email.",
      "auth/weak-password": "Пароль занадто слабкий. Мінімум 6 символів.",
      "auth/wrong-password": "Невірний пароль.",
      "auth/user-not-found": "Користувача не знайдено.",
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

  // ====== ВАЛІДАЦІЯ НАЗВИ КОМАНДИ ======
  function normalizeTeamName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function isValidTeamName(name) {
    const norm = normalizeTeamName(name);
    // Мінімум 3 символи, тільки літери, цифри, пробіли, дефіси
    return norm.length >= 3 && /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9\s\-]+$/.test(norm);
  }

  // ====== ПЕРЕВІРКА УНІКАЛЬНОСТІ НАЗВИ (case-insensitive) ======
  async function isTeamNameTaken(db, name) {
    const norm = normalizeTeamName(name);
    const key = norm.toLowerCase();

    // Шукаємо за нормалізованим ключем
    const snap = await db.collection("teams")
      .where("nameKey", "==", key)
      .limit(1)
      .get();

    return !snap.empty;
  }

  // ====== ПОШУК КОМАНДИ ПО JOIN КОДУ ======
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

  // ====== СТВОРЕННЯ КОМАНДИ ======
  async function createTeam(db, name, ownerUid) {
    const normName = normalizeTeamName(name);
    const nameKey = normName.toLowerCase();

    // Перевіряємо чи не зайнята
    const taken = await isTeamNameTaken(db, normName);
    if (taken) {
      throw new Error("team_name_taken");
    }

    // Генеруємо унікальний joinCode
    for (let i = 0; i < 15; i++) {
      const joinCode = genJoinCode(6);
      
      // Перевіряємо чи не зайнятий код
      const exists = await db.collection("teams")
        .where("joinCode", "==", joinCode)
        .limit(1)
        .get();
      
      if (!exists.empty) continue;

      const now = window.firebase.firestore.FieldValue.serverTimestamp();

      const ref = await db.collection("teams").add({
        name: normName,
        nameKey: nameKey,
        ownerUid: ownerUid,
        joinCode: joinCode,
        createdAt: now,
        updatedAt: now
      });

      return { teamId: ref.id, joinCode, name: normName };
    }
    
    throw new Error("Не вдалося згенерувати код команди");
  }

  // ====== РОБОТА З КОРИСТУВАЧЕМ ======
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
      createdAt: now,
      updatedAt: now
    };

    if (!snap.exists) {
      await ref.set(base);
    } else {
      // Оновлюємо тільки якщо поля порожні
      const cur = snap.data() || {};
      const patch = {};
      
      if (!cur.fullName && base.fullName) patch.fullName = base.fullName;
      if (!cur.email && base.email) patch.email = base.email;
      if (!cur.phone && base.phone) patch.phone = base.phone;
      if (!cur.city && base.city) patch.city = base.city;
      if (!cur.teamId && base.teamId) patch.teamId = base.teamId;
      if (!cur.role && base.role) patch.role = base.role;
      
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        await ref.update(patch);
      }
    }
  }

  // ====== РЕДИРЕКТ ======
  function goAfterAuth(user){
    if (ADMIN_MODE && user?.uid === ADMIN_UID) {
      location.href = "admin.html";
      return;
    }
    location.href = "cabinet.html";
  }

  // ====== UI ЕЛЕМЕНТИ ======
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
        ? "Ви увійшли як адміністратор."
        : "Ви вже увійшли у свій акаунт.";
    }
    if (loggedBox) show(loggedBox);
    if (authBox) hide(authBox);
  }

  function showAuthUI() {
    if (loggedBox) hide(loggedBox);
    if (authBox) show(authBox);
  }

  // ====== РЕЄСТРАЦІЯ ======
  async function onSignup(e) {
    e.preventDefault();
    setMsg(signupMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;
    const db = window.scDb;

    // Збираємо дані
    const email = ($("signupEmail")?.value || "").trim();
    const pass = $("signupPassword")?.value || "";
    const fullName = ($("signupFullName")?.value || "").trim();
    const phone = ($("signupPhone")?.value || "").trim();
    const city = ($("signupCity")?.value || "").trim();
    const role = document.querySelector('input[name="signupRole"]:checked')?.value || "captain";
    const teamNameRaw = ($("signupTeamName")?.value || "").trim();
    const joinCodeRaw = ($("signupJoinCode")?.value || "").trim();

    // Базова валідація
    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(signupMsg, "Заповни всі поля (пароль мін. 6 символів).", "err");
      return;
    }

    let teamContext = null;

    // ====== КАПІТАН ======
    if (role === "captain") {
      if (!isValidTeamName(teamNameRaw)) {
        setMsg(signupMsg, "Назва команди: мін. 3 символи (літери, цифри, дефіс).", "err");
        return;
      }

      // Перевіряємо унікальність назви ДО створення акаунта
      try {
        const taken = await isTeamNameTaken(db, teamNameRaw);
        if (taken) {
          setMsg(signupMsg, "Така назва команди вже існує. Вибери іншу.", "err");
          return;
        }
      } catch (err) {
        console.warn("Перевірка назви:", err);
        // Якщо немає прав — перевіримо після створення акаунта
      }
    }

    // ====== УЧАСНИК ======
    if (role === "member") {
      const joinCode = joinCodeRaw.toUpperCase();
      
      if (joinCode.length !== 6) {
        setMsg(signupMsg, "Введи код команди (6 символів).", "err");
        return;
      }

      // ОБОВ'ЯЗКОВО шукаємо команду ПЕРЕД реєстрацією
      setMsg(signupMsg, "Перевіряю код команди…", "");
      
      const team = await findTeamByJoinCode(db, joinCode);
      
      if (!team) {
        setMsg(signupMsg, "Команду з таким кодом не знайдено. Перевір код.", "err");
        return;
      }
      
      teamContext = team;
    }

    // ====== СТВОРЕННЯ АКАУНТА ======
    let createdUser = null;
    let createdTeamId = null;

    try {
      $("signupBtn") && ($("signupBtn").disabled = true);
      setMsg(signupMsg, role === "captain" ? "Створюю акаунт і команду…" : "Створюю акаунт…", "");

      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;
      createdUser = user;

      // ====== КАПІТАН: створюємо команду ======
      if (role === "captain") {
        setMsg(signupMsg, "Створюю команду…", "");
        
        try {
          const team = await createTeam(db, teamNameRaw, user.uid);
          createdTeamId = team.teamId;
          
          await ensureUserDoc(db, user.uid, {
            fullName, email, phone, city,
            role: "captain",
            teamId: team.teamId
          });

          setMsg(signupMsg, `✅ Команда "${team.name}" створена! Код: ${team.joinCode}`, "ok");
          setTimeout(() => goAfterAuth(user), 800);
          
        } catch (teamErr) {
          // Якщо не вдалось створити команду — видаляємо акаунт
          throw teamErr;
        }
      }

      // ====== УЧАСНИК: приєднуємо до команди ======
      else if (role === "member") {
        // Перевіряємо ще раз (на випадок якщо команда зникла)
        const team = teamContext || await findTeamByJoinCode(db, joinCodeRaw);
        
        if (!team) {
          throw new Error("team_not_found");
        }

        await ensureUserDoc(db, user.uid, {
          fullName, email, phone, city,
          role: "member",
          teamId: team.teamId
        });

        setMsg(signupMsg, `✅ Ти в команді "${team.name}"!`, "ok");
        setTimeout(() => goAfterAuth(user), 500);
      }

    } catch (err) {
      console.error("Помилка реєстрації:", err);

      // Cleanup: видаляємо створене при помилці
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
      $("signupBtn") && ($("signupBtn").disabled = false);
    }
  }

  // ====== ВХІД ======
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
      
      setMsg(loginMsg, "✅ Успішно!", "ok");
      setTimeout(() => goAfterAuth(user), 300);

    } catch (err) {
      console.error(err);
      setMsg(loginMsg, friendlyError(err, "Помилка входу"), "err");
      $("loginBtn") && ($("loginBtn").disabled = false);
    }
  }

  // ====== ІНІЦІАЛІЗАЦІЯ ======
  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);

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

  // Слідкуємо за станом авторизації
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
