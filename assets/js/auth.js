// assets/js/auth.js
(function () {
  const $ = (id) => document.getElementById(id);

  function setMsg(el, text, type) {
    if (!el) return;
    el.innerHTML = text || "";
    el.classList.remove("ok", "err", "warn");
    if (type) el.classList.add(type);
  }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не готовий (нема scAuth/scDb). Перевір SDK та assets/js/firebase-init.js");
  }

  function esc(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

  function originUrl(path){
    const o = window.location.origin;
    return o + (path.startsWith("/") ? path : ("/" + path));
  }

  function actionSettings(){
    // Всі листи ведемо на email-verified.html, яка вже розрулює mode/oobCode
    return {
      url: originUrl("email-verified.html"),
      handleCodeInApp: true
    };
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

    const base = {
      fullName: data.fullName || "",
      email: data.email || "",
      phone: data.phone || "",
      city: data.city || "",
      role: data.role || "member",
      teamId: data.teamId ?? null,
      avatarUrl: data.avatarUrl || "",
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
    await db.collection("users").doc(uid).set({
      teamId: teamId || null,
      role: role || "member",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function goCabinet() { location.href = "cabinet.html"; }

  // --- Bind helpers for 2 UI versions (mobile + desktop) ---
  function pickUI(prefix){
    // prefix "" for mobile, "Desk" for desktop
    const suf = prefix || "";
    return {
      // forms
      signupForm: $("signupForm"+suf),
      loginForm:  $("loginForm"+suf),

      // msgs
      signupMsg: $("signupMsg"+suf),
      loginMsg:  $("loginMsg"+suf),

      // buttons
      signupBtn: $("signupBtn"+suf),
      loginBtn:  $("loginBtn"+suf),

      // login fields
      loginEmail: $("loginEmail"+suf),
      loginPassword: $("loginPassword"+suf),

      // signup fields
      signupEmail: $("signupEmail"+suf),
      signupPassword: $("signupPassword"+suf),
      signupFullName: $("signupFullName"+suf),
      signupPhone: $("signupPhone"+suf),
      signupCity: $("signupCity"+suf),
      signupTeamName: $("signupTeamName"+suf),
      signupJoinCode: $("signupJoinCode"+suf),

      // role name attr differs
      roleName: prefix ? "signupRoleDesk" : "signupRole",

      // forgot link
      forgotLink: prefix ? $("linkForgotDesk") : $("linkForgot"),

      // google btn
      googleBtn: prefix ? $("btnGoogleLoginDesk") : $("btnGoogleLogin"),
    };
  }

  async function sendVerify(user){
    try{
      await user.sendEmailVerification(actionSettings());
    }catch(e){
      console.warn("sendEmailVerification:", e);
    }
  }

  async function onSignup(ui, e) {
    e.preventDefault();
    setMsg(ui.signupMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;
    const db = window.scDb;

    const email = (ui.signupEmail?.value || "").trim();
    const pass = ui.signupPassword?.value || "";
    const fullName = (ui.signupFullName?.value || "").trim();
    const phone = (ui.signupPhone?.value || "").trim();
    const city = (ui.signupCity?.value || "").trim();

    const role = (document.querySelector(`input[name="${ui.roleName}"]:checked`)?.value || "captain").trim();
    const teamName = (ui.signupTeamName?.value || "").trim();
    const joinCode = (ui.signupJoinCode?.value || "").trim();

    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(ui.signupMsg, "Заповни всі поля (email, пароль ≥ 6, ПІБ, телефон, місто).", "err");
      return;
    }
    if (role === "captain" && !teamName) {
      setMsg(ui.signupMsg, "Для капітана потрібна назва команди.", "err");
      return;
    }
    if (role === "member" && !joinCode) {
      setMsg(ui.signupMsg, "Для учасника потрібен код приєднання (joinCode).", "err");
      return;
    }

    try {
      if (ui.signupBtn) ui.signupBtn.disabled = true;

      setMsg(ui.signupMsg, "Створюю акаунт…", "warn");
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;

      // ВАЖЛИВО: Спочатку створюємо/оновлюємо Firestore (щоб не зламати те, що працювало)
      await ensureUserDoc(db, user.uid, { fullName, email, phone, city, role, teamId: null });

      if (role === "captain") {
        setMsg(ui.signupMsg, "Створюю команду…", "warn");
        const team = await createTeam(db, teamName, user.uid);
        await setUserTeamAndRole(db, user.uid, team.teamId, "captain");

        // шлемо verify
        await sendVerify(user);

        setMsg(
          ui.signupMsg,
          `Готово ✅ Команда створена. Код приєднання: <b>${esc(team.joinCode)}</b>.<br>
           Ми надіслали лист підтвердження email. Відкрий його та підтвердь.<br>
           Після підтвердження — просто увійди (або натисни “Вхід через Google”, якщо акаунт Google).`,
          "ok"
        );
        return;
      }

      if (role === "member") {
        setMsg(ui.signupMsg, "Шукаю команду по коду…", "warn");
        const team = await findTeamByJoinCode(db, joinCode);
        if (!team) {
          setMsg(ui.signupMsg, "Команду з таким кодом не знайдено ❌", "err");
          return;
        }

        await setUserTeamAndRole(db, user.uid, team.teamId, "member");

        await sendVerify(user);

        setMsg(
          ui.signupMsg,
          `Готово ✅ Ти в команді: <b>${esc(team.name || "")}</b>.<br>
           Ми надіслали лист підтвердження email. Відкрий його та підтвердь.<br>
           Після підтвердження — увійди на цій сторінці.`,
          "ok"
        );
        return;
      }

      await sendVerify(user);

      setMsg(
        ui.signupMsg,
        `Акаунт створено ✅ Ми надіслали лист підтвердження email. Відкрий його та підтвердь, після цього увійди.`,
        "ok"
      );

    } catch (err) {
      console.error(err);
      setMsg(ui.signupMsg, esc(err?.message || "Помилка реєстрації"), "err");
    } finally {
      if (ui.signupBtn) ui.signupBtn.disabled = false;
    }
  }

  async function onLogin(ui, e) {
    e.preventDefault();
    setMsg(ui.loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;

    const email = (ui.loginEmail?.value || "").trim();
    const pass = ui.loginPassword?.value || "";

    if (!email || !pass) {
      setMsg(ui.loginMsg, "Введи email і пароль.", "err");
      return;
    }

    try {
      if (ui.loginBtn) ui.loginBtn.disabled = true;

      setMsg(ui.loginMsg, "Вхід…", "warn");
      await auth.signInWithEmailAndPassword(email, pass);

      const u = auth.currentUser;
      if (u && typeof u.reload === "function") await u.reload();

      if (u && !u.emailVerified) {
        await sendVerify(u);
        // НЕ викидаємо з акаунта (щоб не ламати UX), але блокнемо перехід
        setMsg(
          ui.loginMsg,
          `Пошта не підтверджена ❌<br>
           Ми щойно надіслали лист підтвердження ще раз. Перевір пошту і підтвердь, тоді увійдеш.`,
          "err"
        );
        try { await auth.signOut(); } catch(_){}
        return;
      }

      setMsg(ui.loginMsg, "Готово ✅", "ok");
      setTimeout(goCabinet, 250);

    } catch (err) {
      console.error(err);
      setMsg(ui.loginMsg, esc(err?.message || "Помилка входу"), "err");
    } finally {
      if (ui.loginBtn) ui.loginBtn.disabled = false;
    }
  }

  async function onForgot(ui, e){
    e.preventDefault();
    setMsg(ui.loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;

    const email = (ui.loginEmail?.value || "").trim();
    if(!email){
      setMsg(ui.loginMsg, "Введи email, а потім натисни “Забули пароль?”.", "err");
      return;
    }

    try{
      setMsg(ui.loginMsg, "Надсилаю лист для скидання пароля…", "warn");
      await auth.sendPasswordResetEmail(email, actionSettings());
      setMsg(ui.loginMsg, "Лист надіслано ✅ Відкрий пошту і натисни посилання для скидання пароля.", "ok");
    }catch(err){
      console.error(err);
      setMsg(ui.loginMsg, esc(err?.message || "Помилка надсилання листа"), "err");
    }
  }

  async function googleLogin(ui){
    setMsg(ui.loginMsg, "", "");

    await waitFirebase();
    const auth = window.scAuth;
    const db = window.scDb;

    try{
      setMsg(ui.loginMsg, "Вхід через Google…", "warn");

      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const isMobile = window.matchMedia && window.matchMedia("(max-width: 980px)").matches;

      if(isMobile){
        await auth.signInWithRedirect(provider);
        return;
      }else{
        await auth.signInWithPopup(provider);
      }

      const u = auth.currentUser;
      if (!u) throw new Error("Не вдалося отримати користувача після Google-входу.");

      // Google зазвичай verified, але перестрахуємось
      if (typeof u.reload === "function") await u.reload();
      if (!u.emailVerified){
        await sendVerify(u);
        try{ await auth.signOut(); }catch(_){}
        setMsg(ui.loginMsg, "Пошта не підтверджена. Ми надіслали лист підтвердження.", "err");
        return;
      }

      // створюємо users/{uid}, якщо нема
      await ensureUserDoc(db, u.uid, {
        fullName: u.displayName || "",
        email: u.email || "",
        phone: "",
        city: "",
        role: "member",
        teamId: null,
        avatarUrl: u.photoURL || ""
      });

      setMsg(ui.loginMsg, "Готово ✅", "ok");
      setTimeout(goCabinet, 250);

    }catch(err){
      console.error(err);
      setMsg(ui.loginMsg, esc(err?.message || "Помилка Google-входу"), "err");
    }
  }

  // Handle redirect result (mobile google)
  (async ()=>{
    try{
      await waitFirebase();
      const auth = window.scAuth;
      const db = window.scDb;

      const res = await auth.getRedirectResult();
      if(res && res.user){
        const u = res.user;
        if (typeof u.reload === "function") await u.reload();

        if (!u.emailVerified){
          await sendVerify(u);
          try{ await auth.signOut(); }catch(_){}
          return;
        }

        await ensureUserDoc(db, u.uid, {
          fullName: u.displayName || "",
          email: u.email || "",
          phone: "",
          city: "",
          role: "member",
          teamId: null,
          avatarUrl: u.photoURL || ""
        });

        // автоматом в кабінет
        setTimeout(goCabinet, 150);
      }
    }catch(e){
      console.warn("redirectResult:", e);
    }
  })();

  // ===== Bind both UIs =====
  function bind(prefix){
    const ui = pickUI(prefix);

    if(ui.signupForm) ui.signupForm.addEventListener("submit", onSignup.bind(null, ui));
    if(ui.loginForm)  ui.loginForm.addEventListener("submit", onLogin.bind(null, ui));

    if(ui.forgotLink) ui.forgotLink.addEventListener("click", onForgot.bind(null, ui));
    if(ui.googleBtn)  ui.googleBtn.addEventListener("click", ()=>googleLogin(ui));
  }

  bind("");      // mobile
  bind("Desk");  // desktop

  // якщо користувач уже залогінений — одразу в кабінет
  (async ()=>{
    try{
      await waitFirebase();
      window.scAuth.onAuthStateChanged(async (u)=>{
        if(!u) return;
        if (typeof u.reload === "function") await u.reload();
        if(u.emailVerified) goCabinet();
      });
    }catch(e){
      console.warn(e);
    }
  })();

})();
