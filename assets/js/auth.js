// assets/js/auth.js
(function () {
  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const $ = (id) => document.getElementById(id);

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не готовий (нема scAuth/scDb). Перевір підключення SDK та firebase-init.js");
  }

  function genJoinCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // без плутаних I O 0 1
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function createTeam(db, name, ownerUid) {
    // робимо унікальний joinCode (кілька спроб)
    for (let i = 0; i < 8; i++) {
      const joinCode = genJoinCode(6);
      const exists = await db.collection("teams").where("joinCode", "==", joinCode).limit(1).get();
      if (!exists.empty) continue;

      const ref = await db.collection("teams").add({
        name: name || "Команда",
        ownerUid,
        joinCode,
        createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
      });

      return { teamId: ref.id, joinCode };
    }
    throw new Error("Не вдалося згенерувати унікальний joinCode (спробуй ще раз).");
  }

  async function findTeamByJoinCode(db, code) {
    const snap = await db.collection("teams").where("joinCode", "==", String(code || "").trim().toUpperCase()).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { teamId: doc.id, ...doc.data() };
  }

  function redirectAfterAuth(user) {
    if (!user) return;
    if (user.uid === ADMIN_UID) {
      location.href = "admin.html";
    } else {
      location.href = "cabinet.html";
    }
  }

  async function ensureUserDoc(db, user, data) {
    const ref = db.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        fullName: data.fullName || "",
        email: data.email || user.email || "",
        phone: data.phone || "",
        city: data.city || "",
        role: data.role || "member",      // member/captain/judge/admin
        teamId: data.teamId || null,
        createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
        avatarUrl: ""
      });
    } else {
      // мінімально оновимо поля, якщо порожні
      const cur = snap.data() || {};
      const patch = {};
      if (!cur.fullName && data.fullName) patch.fullName = data.fullName;
      if (!cur.phone && data.phone) patch.phone = data.phone;
      if (!cur.city && data.city) patch.city = data.city;
      if (!cur.role && data.role) patch.role = data.role;
      if ((cur.teamId == null) && data.teamId) patch.teamId = data.teamId;
      if (Object.keys(patch).length) await ref.update(patch);
    }
  }

  async function setUserTeamAndRole(db, uid, teamId, role) {
    await db.collection("users").doc(uid).update({
      teamId: teamId || null,
      role: role || "member"
    });
  }

  // ====== INIT UI (tabs already handled in HTML) ======
  const signupForm = $("signupForm");
  const loginForm = $("loginForm");

  const signupMsg = $("signupMsg");
  const loginMsg = $("loginMsg");

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

    const teamName = ($("signupTeamName")?.value || "").trim();
    const joinCode = ($("signupJoinCode")?.value || "").trim();

    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(signupMsg, "Заповни всі поля (email, пароль ≥ 6, ПІБ, телефон, місто).", "err");
      return;
    }

    try {
      $("signupBtn") && ($("signupBtn").disabled = true);
      setMsg(signupMsg, "Створюю акаунт…", "");

      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;

      // створюємо профіль користувача
      await ensureUserDoc(db, user, { fullName, email, phone, city, role, teamId: null });

      // якщо капітан — створюємо команду
      if (role === "captain") {
        if (!teamName) {
          setMsg(signupMsg, "Для капітана потрібна назва команди.", "err");
          return;
        }
        setMsg(signupMsg, "Створюю команду…", "");
        const team = await createTeam(db, teamName, user.uid);
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");
        setMsg(signupMsg, `Готово ✅ Команда створена. Код приєднання: ${team.joinCode}`, "ok");
        // невелика пауза, щоб прочитав
        setTimeout(() => redirectAfterAuth(user), 600);
        return;
      }

      // якщо учасник — приєднуємося по коду
      if (role === "member") {
        if (!joinCode) {
          setMsg(signupMsg, "Для учасника потрібен код приєднання (joinCode).", "err");
          return;
        }
        setMsg(signupMsg, "Шукаю команду по коду…", "");
        const team = await findTeamByJoinCode(db, joinCode);
        if (!team) {
          setMsg(signupMsg, "Команду з таким кодом не знайдено ❌", "err");
          return;
        }
        await setUserTeamAndRole(db, user.uid, team.teamId, "member");
        setMsg(signupMsg, `Готово ✅ Ти в команді: ${team.name}`, "ok");
        setTimeout(() => redirectAfterAuth(user), 600);
        return;
      }

      // інші ролі (на майбутнє)
      setMsg(signupMsg, "Акаунт створено ✅", "ok");
      setTimeout(() => redirectAfterAuth(user), 600);
    } catch (err) {
      console.error(err);
      setMsg(signupMsg, err?.message || "Помилка реєстрації", "err");
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

      const cred = await auth.signInWithEmailAndPassword(email, pass);
      setMsg(loginMsg, "Готово ✅", "ok");
      setTimeout(() => redirectAfterAuth(cred.user), 300);
    } catch (err) {
      console.error(err);
      setMsg(loginMsg, err?.message || "Помилка входу", "err");
    } finally {
      $("loginBtn") && ($("loginBtn").disabled = false);
    }
  }

  // підв’язка
  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);

  // якщо вже залогінений — одразу перекидаємо
  (async () => {
    try {
      await waitFirebase();
      const auth = window.scAuth;
      auth.onAuthStateChanged((u) => {
        if (u) redirectAfterAuth(u);
      });
    } catch (e) {
      console.warn(e);
    }
  })();
})();
