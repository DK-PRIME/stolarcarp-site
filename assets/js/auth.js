// assets/js/auth.js
(function () {
  "use strict";

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

  function goCabinet() {
    location.href = "cabinet.html";
  }

  // ---------- UI: панель “вже увійшли” (створюється автоматично, HTML міняти НЕ треба)
  function ensureSignedInBar() {
    let bar = document.getElementById("signedInBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "signedInBar";
    bar.style.margin = "12px 0";
    bar.style.padding = "12px";
    bar.style.borderRadius = "14px";
    bar.style.border = "1px solid rgba(148,163,184,.35)";
    bar.style.background = "rgba(15,23,42,.9)";
    bar.style.display = "none";

    bar.innerHTML = `
      <div style="font-weight:800; margin-bottom:6px;">Ви вже увійшли</div>
      <div id="signedInText" style="color:#9ca3af; font-size:.9rem; margin-bottom:10px;"></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button id="btnGoCabinet" class="btn btn--primary" type="button">Перейти в кабінет</button>
        <button id="btnLogout" class="btn btn--danger" type="button">Вийти</button>
      </div>
      <div style="color:#6b7280; font-size:.85rem; margin-top:10px;">
        Якщо хочеш зареєструвати інший акаунт (капітан/учасник) — натисни “Вийти”.
      </div>
    `;

    // вставляємо вгору сторінки (перед формами)
    const host =
      document.querySelector("main") ||
      document.querySelector(".main") ||
      document.body;
    host.insertBefore(bar, host.firstChild);

    return bar;
  }

  function showBar(user) {
    const bar = ensureSignedInBar();
    const t = document.getElementById("signedInText");
    const email = user?.email || "—";
    if (t) t.textContent = `Поточний акаунт: ${email}`;
    bar.style.display = "block";

    const btnGo = document.getElementById("btnGoCabinet");
    const btnOut = document.getElementById("btnLogout");

    if (btnGo) btnGo.onclick = () => goCabinet();
    if (btnOut) btnOut.onclick = async () => {
      try {
        await window.scAuth.signOut();
        // після виходу сховаємо панель і покажемо форми
        bar.style.display = "none";
        const wrap = document.getElementById("authWrap");
        if (wrap) wrap.style.display = "block";
      } catch (e) {
        alert("Не вдалося вийти з акаунта.");
      }
    };
  }

  function hideBar() {
    const bar = document.getElementById("signedInBar");
    if (bar) bar.style.display = "none";
  }

  // ---------- TEAM helpers (як у тебе було)
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

    const base = {
      fullName: data.fullName || "",
      email: data.email || "",
      phone: data.phone || "",
      city: data.city || "",
      role: data.role || "member",
      teamId: data.teamId || null,
      avatarUrl: "",
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!snap.exists) {
      await ref.set(base, { merge: true });
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
      patch.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      await ref.set(patch, { merge: true });
    }
  }

  async function setUserTeamAndRole(db, uid, teamId, role) {
    await db.collection("users").doc(uid).set(
      {
        teamId: teamId || null,
        role: role || "member",
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  // ---------- Forms
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

      if (role === "captain") {
        if (!teamName) {
          setMsg(signupMsg, "Для капітана потрібна назва команди.", "err");
          return;
        }
        setMsg(signupMsg, "Створюю команду…", "");
        const team = await createTeam(db, teamName, user.uid);
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");
        setMsg(signupMsg, `Готово ✅ Команда створена. Код приєднання: ${team.joinCode}`, "ok");
        setTimeout(goCabinet, 600);
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
        setTimeout(goCabinet, 600);
        return;
      }

      setMsg(signupMsg, "Акаунт створено ✅", "ok");
      setTimeout(goCabinet, 600);
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

      await auth.signInWithEmailAndPassword(email, pass);
      setMsg(loginMsg, "Готово ✅", "ok");
      setTimeout(goCabinet, 300);
    } catch (err) {
      console.error(err);
      setMsg(loginMsg, err?.message || "Помилка входу", "err");
    } finally {
      $("loginBtn") && ($("loginBtn").disabled = false);
    }
  }

  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm) loginForm.addEventListener("submit", onLogin);

  // ---------- ВАЖЛИВО: більше НЕ перекидаємо автоматично з auth.html
  (async () => {
    try {
      await waitFirebase();

      // (необов'язково) якщо на сторінці є обгортка форм — ми можемо ховати її, коли user уже залогінений
      // якщо її нема — нічого страшного, все працює
      const maybeWrap = document.getElementById("authWrap");

      window.scAuth.onAuthStateChanged((u) => {
        if (u) {
          // користувач вже в системі: показати панель і (за бажання) сховати форми
          showBar(u);
          if (maybeWrap) maybeWrap.style.display = "none";
        } else {
          hideBar();
          if (maybeWrap) maybeWrap.style.display = "block";
        }
      });
    } catch (e) {
      console.warn(e);
    }
  })();
})();
