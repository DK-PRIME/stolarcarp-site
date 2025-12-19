// assets/js/auth.js
(function () {
  "use strict";

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
    throw new Error("Firebase не готовий (нема scAuth/scDb). Перевір firebase-init.js та підключення compat SDK.");
  }

  function redirectAfterAuth(user) {
    if (!user) return;
    // ✅ Ти (адмін) — в адмінку
    if (user.uid === ADMIN_UID) {
      location.href = "admin.html";
      return;
    }
    // ✅ Всі інші — в кабінет
    location.href = "cabinet.html";
  }

  function genJoinCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function createTeam(db, name, ownerUid) {
    for (let i = 0; i < 10; i++) {
      const joinCode = genJoinCode(6);
      const exists = await db.collection("teams").where("joinCode", "==", joinCode).limit(1).get();
      if (!exists.empty) continue;

      const ref = await db.collection("teams").add({
        name: name || "Команда",
        ownerUid,
        joinCode,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });

      return { teamId: ref.id, joinCode };
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

  async function ensureUserDoc(db, uid, data) {
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    // ✅ ВАЖЛИВО: якщо це адмін UID — роль не затираємо “member”
    const roleToSave = (uid === ADMIN_UID) ? "admin" : (data.role || "member");

    const base = {
      fullName: data.fullName || "",
      email: data.email || "",
      phone: data.phone || "",
      city: data.city || "",
      role: roleToSave,           // member/captain/judge/admin
      teamId: data.teamId || null,
      avatarUrl: "",
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!snap.exists) {
      await ref.set(base, { merge: true });
      return;
    }

    // м’яке оновлення
    const cur = snap.data() || {};
    const patch = {};

    // ✅ Адміну нічого “переписувати” не треба
    if (uid !== ADMIN_UID) {
      if (!cur.fullName && base.fullName) patch.fullName = base.fullName;
      if (!cur.email && base.email) patch.email = base.email;
      if (!cur.phone && base.phone) patch.phone = base.phone;
      if (!cur.city && base.city) patch.city = base.city;
      if (cur.teamId == null && base.teamId) patch.teamId = base.teamId;
      if (!cur.role && base.role) patch.role = base.role;
    }

    if (Object.keys(patch).length) {
      patch.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      await ref.set(patch, { merge: true });
    }
  }

  async function setUserTeamAndRole(db, uid, teamId, role) {
    // ✅ Адміна не чіпаємо
    if (uid === ADMIN_UID) return;

    await db.collection("users").doc(uid).set({
      teamId: teamId || null,
      role: role || "member",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

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

      await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role, teamId: null });

      // ✅ Якщо випадково зареєструвався адмін — просто перекидаємо в адмінку
      if (user.uid === ADMIN_UID) {
        setMsg(signupMsg, "Адмін акаунт ✅", "ok");
        setTimeout(() => redirectAfterAuth(user), 400);
        return;
      }

      if (role === "captain") {
        if (!teamName) {
          setMsg(signupMsg, "Для капітана потрібна назва команди.", "err");
          return;
        }
        setMsg(signupMsg, "Створюю команду…", "");
        const team = await createTeam(db, teamName, user.uid);
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");
        setMsg(signupMsg, `Готово ✅ Команда створена. Код приєднання: ${team.joinCode}`, "ok");
        setTimeout(() => redirectAfterAuth(user), 600);
        return;
      }

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

  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);

  // ✅ Якщо вже залогінений — одразу кидаємо куди треба (адмін/кабінет)
  (async () => {
    try {
      await waitFirebase();
      window.scAuth.onAuthStateChanged((u) => {
        if (u) redirectAfterAuth(u);
      });
    } catch (e) {
      console.warn(e);
    }
  })();
})();
