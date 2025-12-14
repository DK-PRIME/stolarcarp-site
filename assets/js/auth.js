// assets/js/auth.js
// STOLAR CARP — Реєстрація / Вхід (Firebase compat 10.12.2)
// Працює з assets/js/firebase-init.js (window.scAuth, window.scDb)

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db || !window.firebase) {
    console.error("Firebase не ініціалізовано. Перевір firebase-*-compat.js та assets/js/firebase-init.js");
    return;
  }

  // ===== UI =====
  const signupForm = document.getElementById("signupForm");
  const loginForm  = document.getElementById("loginForm");

  const signupMsg  = document.getElementById("signupMsg");
  const loginMsg   = document.getElementById("loginMsg");

  const signupBtn  = document.getElementById("signupBtn");
  const loginBtn   = document.getElementById("loginBtn");

  // Signup inputs (реальні id з auth.html)
  const emailInSU    = document.getElementById("signupEmail");
  const passInSU     = document.getElementById("signupPassword");
  const fullNameIn   = document.getElementById("signupFullName");
  const phoneIn      = document.getElementById("signupPhone");      // hidden з +380...
  const phoneCleanIn = document.getElementById("signupPhoneClean"); // видимий 9 цифр
  const cityIn       = document.getElementById("signupCity");

  const roleCaptain  = document.getElementById("signupRoleCaptain");
  const roleMember   = document.getElementById("signupRoleMember");

  const teamNameIn   = document.getElementById("signupTeamName");
  const joinCodeIn   = document.getElementById("signupJoinCode");

  // Login inputs
  const emailInLI  = document.getElementById("loginEmail");
  const passInLI   = document.getElementById("loginPassword");

  function setMsg(el, text, type){
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok","err");
    if (type) el.classList.add(type);
  }

  function setLoading(btn, loading){
    if (!btn) return;
    btn.disabled = !!loading;
    btn.style.opacity = loading ? "0.7" : "1";
  }

  function norm(s){ return String(s || "").trim(); }

  function makeJoinCode(len = 6){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }

  function getRole(){
    if (roleMember && roleMember.checked) return "member";
    return "captain";
  }

  function getPhone(){
    // пріоритет: hidden з +380..., але якщо раптом не заповнився — зберемо з clean
    const p = norm(phoneIn?.value);
    if (p) return p;
    const digits = norm(phoneCleanIn?.value).replace(/\D/g,"").slice(0,9);
    return digits ? ("+380" + digits) : "";
  }

  async function ensureUserDoc(uid, payload){
    await db.collection("users").doc(uid).set(payload, { merge:true });
  }

  async function createTeamForCaptain(uid, teamName){
    const joinCode = makeJoinCode(6);

    const teamRef = await db.collection("teams").add({
      name: teamName,
      ownerUid: uid,
      joinCode,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { teamId: teamRef.id, joinCode };
  }

  async function findTeamByJoinCode(code){
    const clean = norm(code).toUpperCase().replace(/\s+/g,"");
    const qs = await db.collection("teams")
      .where("joinCode","==",clean)
      .limit(1)
      .get();

    if (qs.empty) return null;

    const docSnap = qs.docs[0];
    return { teamId: docSnap.id, ...(docSnap.data() || {}) };
  }

  // ===== Signup =====
  if (signupForm){
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg(signupMsg, "");

      const email    = norm(emailInSU?.value);
      const pass     = String(passInSU?.value || "");
      const fullName = norm(fullNameIn?.value);
      const phone    = getPhone();
      const city     = norm(cityIn?.value);

      const role     = getRole();
      const isCaptain = role === "captain";

      const teamName = norm(teamNameIn?.value);
      const joinCode = norm(joinCodeIn?.value).toUpperCase().replace(/\s+/g,"");

      // базова валідація
      if (!email || !pass) return setMsg(signupMsg, "Вкажіть email і пароль.", "err");
      if (pass.length < 6) return setMsg(signupMsg, "Пароль мінімум 6 символів.", "err");
      if (!fullName) return setMsg(signupMsg, "Вкажіть ім'я та прізвище.", "err");
      if (!phone) return setMsg(signupMsg, "Вкажіть номер телефону.", "err");
      if (!city) return setMsg(signupMsg, "Вкажіть місто / селище.", "err");

      if (isCaptain && !teamName) return setMsg(signupMsg, "Вкажіть назву команди.", "err");
      if (!isCaptain && !joinCode) return setMsg(signupMsg, "Вкажіть код команди капітана.", "err");

      try {
        setLoading(signupBtn, true);
        setMsg(signupMsg, "Створюємо акаунт…");

        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        const user = cred.user;

        let teamId = null;
        let finalJoinCode = null;

        if (isCaptain){
          const created = await createTeamForCaptain(user.uid, teamName);
          teamId = created.teamId;
          finalJoinCode = created.joinCode;
        } else {
          const found = await findTeamByJoinCode(joinCode);
          if (!found){
            // якщо код не знайдено — прибираємо щойно створений auth-акаунт
            try { await user.delete(); } catch(_){}
            return setMsg(signupMsg, "Код команди не знайдено. Перевірте та спробуйте ще раз.", "err");
          }
          teamId = found.teamId;
          finalJoinCode = found.joinCode || joinCode;
        }

        // users/{uid}
        await ensureUserDoc(user.uid, {
          fullName,
          email: user.email || email,
          phone,
          city,
          role,
          teamId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          avatarUrl: ""
        });

        setMsg(
          signupMsg,
          isCaptain
            ? `Готово! Команду створено. Код: ${finalJoinCode}`
            : `Готово! Ви приєднані до команди.`,
          "ok"
        );

        // редірект
        setTimeout(() => window.location.href = "cabinet.html", 500);
      } catch (err){
        console.error(err);
        const msg = (err && err.message) ? err.message : String(err);
        setMsg(signupMsg, "Помилка реєстрації: " + msg, "err");
      } finally {
        setLoading(signupBtn, false);
      }
    });
  }

  // ===== Login =====
  if (loginForm){
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg(loginMsg, "");

      const email = norm(emailInLI?.value);
      const pass  = String(passInLI?.value || "");

      if (!email || !pass) return setMsg(loginMsg, "Вкажіть email і пароль.", "err");

      try {
        setLoading(loginBtn, true);
        setMsg(loginMsg, "Вхід…");

        await auth.signInWithEmailAndPassword(email, pass);

        setMsg(loginMsg, "Успішно!", "ok");
        setTimeout(() => window.location.href = "cabinet.html", 300);
      } catch (err){
        console.error(err);
        const msg = (err && err.message) ? err.message : String(err);
        setMsg(loginMsg, "Не вдалося увійти: " + msg, "err");
      } finally {
        setLoading(loginBtn, false);
      }
    });
  }

})();
