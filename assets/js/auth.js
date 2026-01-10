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
    // ключ для пошуку дублів (нечутливий до регістру/пробілів)
    return normalizeTeamName(name).toLowerCase();
  }

  async function isTeamNameTaken(db, name) {
    const norm = normalizeTeamName(name);
    if (!norm) return false;

    const key = teamNameKey(norm);

    // 1) Новий підхід: nameKey (якщо вже почали його писати)
    // 2) Сумісність зі старими доками: точний збіг name
    const q1 = db.collection("teams").where("nameKey", "==", key).limit(1).get();
    const q2 = db.collection("teams").where("name", "==", norm).limit(1).get();

    const [s1, s2] = await Promise.allSettled([q1, q2]);

    // якщо правила не дозволяють читання ДО auth — нехай кине помилку вище (ми відловимо)
    const snap1 = (s1.status === "fulfilled") ? s1.value : null;
    const snap2 = (s2.status === "fulfilled") ? s2.value : null;

    if (snap1 && !snap1.empty) return true;
    if (snap2 && !snap2.empty) return true;

    // якщо обидва запроси впали через permission — підкинемо помилку, щоб робити перевірку після signup
    const permDenied =
      (s1.status === "rejected" && String(s1.reason?.message || "").toLowerCase().includes("permission")) ||
      (s2.status === "rejected" && String(s2.reason?.message || "").toLowerCase().includes("permission"));

    if (permDenied) throw new Error("permission_denied_precheck");

    return false;
  }

  async function createTeam(db, name, ownerUid) {
    const normName = normalizeTeamName(name) || "Команда";
    const nameKey = teamNameKey(normName);

    // ✅ Жорстка перевірка унікальності назви (і тут теж, навіть якщо була precheck)
    const taken = await isTeamNameTaken(db, normName);
    if (taken) {
      throw new Error("Назва команди вже використовується. Додай 1 цифру або літеру, щоб відрізнялась.");
    }

    for (let i = 0; i < 10; i++) {
      const joinCode = genJoinCode(6);
      const exists = await db.collection("teams").where("joinCode", "==", joinCode).limit(1).get();
      if (!exists.empty) continue;

      const ref = await db.collection("teams").add({
        name: normName,
        nameKey, // ✅ для швидкого пошуку дублів
        ownerUid,
        joinCode,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
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
      // ✅ Новий документ: createdAt ставимо 1 раз + updatedAt
      await ref.set({
        ...base,
        createdAt: now,
        updatedAt: now
      });
      return;
    }

    // ✅ Існуючий документ: НЕ чіпаємо createdAt, лише доповнюємо й updatedAt
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
      // ✅ не світимо email
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

    // ✅ ФЛОУ ДОВОДИМО ДО КІНЦЯ: role-валідація ДО створення Auth (де можливо)
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
    let precheckedName = false;

    // precheck (може впасти через rules без auth — це нормально, тоді перевіримо вже після signup)
    try {
      if (role === "member") {
        preTeam = await findTeamByJoinCode(db, joinCode);
        if (!preTeam) {
          setMsg(signupMsg, "Команду з таким кодом не знайдено ❌", "err");
          return;
        }
      }
      if (role === "captain") {
        const taken = await isTeamNameTaken(db, teamName);
        precheckedName = true;
        if (taken) {
          setMsg(signupMsg, "Назва команди вже використовується. Додай 1 цифру або літеру.", "err");
          return;
        }
      }
    } catch (preErr) {
      // якщо rules забороняють читати ДО auth — просто йдемо далі (перевіримо після створення акаунта)
      const msg = String(preErr?.message || "");
      if (!msg.includes("permission_denied_precheck")) {
        console.warn(preErr);
      }
    }

    let createdUser = null;
    let createdTeamId = null;

    try {
      $("signupBtn") && ($("signupBtn").disabled = true);
      setMsg(signupMsg, "Готую реєстрацію…", "");

      // ✅ Тепер створюємо Auth
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;
      createdUser = user;

      // ✅ Після signup у нас вже є auth -> можемо гарантувати перевірки/створення до кінця
      if (role === "member") {
        setMsg(signupMsg, "Підключаю до команди…", "");

        // якщо не було preTeam (через rules) — знайдемо зараз
        const team = preTeam || await findTeamByJoinCode(db, joinCode);
        if (!team) {
          // rollback: не залишаємо “мертвий” акаунт
          setMsg(signupMsg, "Команду з таким кодом не знайдено ❌", "err");
          try { await user.delete(); } catch(_) {}
          try { await auth.signOut(); } catch(_) {}
          return;
        }

        await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role: "member", teamId: team.teamId });
        await setUserTeamAndRole(db, user.uid, team.teamId, "member");

        setMsg(signupMsg, `Готово ✅ Ти в команді: ${team.name}`, "ok");
        setTimeout(() => goAfterAuth(user), 450);
        return;
      }

      if (role === "captain") {
        setMsg(signupMsg, "Створюю команду…", "");

        // якщо precheck не вдалось/не робився — createTeam сам перевірить унікальність і кине помилку
        const team = await createTeam(db, teamName, user.uid);
        createdTeamId = team.teamId;

        await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role: "captain", teamId: team.teamId });
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");

        setMsg(signupMsg, `Готово ✅ Команда створена. Код приєднання: ${team.joinCode}`, "ok");
        setTimeout(() => goAfterAuth(user), 450);
        return;
      }

      // якщо роль якась інша (на всяк)
      await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role, teamId: null });
      setMsg(signupMsg, "Акаунт створено ✅", "ok");
      setTimeout(() => goAfterAuth(user), 450);

    } catch (err) {
      console.error(err);

      // ✅ rollback якщо щось впало після створення акаунта
      // (наприклад, назва зайнята, правила, мережа, тощо)
      const msg = err?.message || "Помилка реєстрації";

      if (createdUser) {
        try {
          // якщо ми створили команду і далі впало — прибираємо команду, щоб не залишати сміття
          if (createdTeamId) {
            try { await db.collection("teams").doc(createdTeamId).delete(); } catch(_) {}
          }
          try { await createdUser.delete(); } catch(_) {}
          try { await auth.signOut(); } catch(_) {}
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
      setMsg(loginMsg, err?.message || "Помилка входу", "err");
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

  // ✅ Головне: НЕ робимо авто-редірект адміна ніколи.
  // Показуємо "ви вже увійшли" і даємо кнопку "перейти".
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
