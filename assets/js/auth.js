// assets/js/auth.js (NO Firebase)
(function () {
  const $ = (id) => document.getElementById(id);

  const LS_USERS = "sc_users_v1";      // база користувачів (локально)
  const LS_TEAMS = "sc_teams_v1";      // база команд (локально)
  const LS_SESSION = "sc_session_v1";  // сесія (пам'ятає вхід)

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (type) el.classList.add(type);
  }

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function genJoinCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function hashPass(p) {
    // простий хеш (НЕ для реальної безпеки, але щоб не зберігати пароль відкрито)
    let h = 0;
    for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0;
    return String(h);
  }

  function goCabinet() { location.href = "cabinet.html"; }

  function getUsers(){ return loadJSON(LS_USERS, {}); } // email -> user
  function setUsers(v){ saveJSON(LS_USERS, v); }

  function getTeams(){ return loadJSON(LS_TEAMS, {}); } // teamId -> team
  function setTeams(v){ saveJSON(LS_TEAMS, v); }

  function setSession(email){
    saveJSON(LS_SESSION, { email, ts: Date.now() });
  }
  function getSession(){
    return loadJSON(LS_SESSION, null);
  }

  // ====== SIGNUP ======
  const signupForm = $("signupForm");
  const signupMsg  = $("signupMsg");

  async function onSignup(e){
    e.preventDefault();
    setMsg(signupMsg, "", "");

    const email = ($("signupEmail")?.value || "").trim().toLowerCase();
    const pass  = ($("signupPassword")?.value || "");
    const fullName = ($("signupFullName")?.value || "").trim();
    const phone = ($("signupPhone")?.value || "").trim();
    const city  = ($("signupCity")?.value || "").trim();

    const role = (document.querySelector('input[name="signupRole"]:checked')?.value || "captain").trim();
    const teamName = ($("signupTeamName")?.value || "").trim();
    const joinCode = ($("signupJoinCode")?.value || "").trim().toUpperCase();

    if (!email || !pass || pass.length < 6 || !fullName || !phone || !city) {
      setMsg(signupMsg, "Заповни всі поля (email, пароль ≥ 6, ПІБ, телефон, місто).", "err");
      return;
    }
    if (role === "captain" && !teamName) {
      setMsg(signupMsg, "Для капітана потрібна назва команди.", "err");
      return;
    }
    if (role === "member" && !joinCode) {
      setMsg(signupMsg, "Для учасника потрібен код приєднання (joinCode).", "err");
      return;
    }

    const users = getUsers();
    if (users[email]) {
      setMsg(signupMsg, "Такий email вже зареєстрований. Перейди у вкладку «Вхід».", "err");
      return;
    }

    const teams = getTeams();

    let teamId = null;
    let createdJoinCode = null;

    if (role === "captain") {
      // створюємо команду
      // генеруємо унікальний joinCode
      for (let i=0;i<20;i++){
        const code = genJoinCode(6);
        const exists = Object.values(teams).some(t => t.joinCode === code);
        if (!exists){
          teamId = "team_" + Date.now();
          createdJoinCode = code;
          teams[teamId] = {
            teamId,
            name: teamName,
            ownerEmail: email,
            joinCode: code,
            createdAt: Date.now()
          };
          break;
        }
      }
      if (!teamId){
        setMsg(signupMsg, "Не вдалося створити команду. Спробуй ще раз.", "err");
        return;
      }
    }

    if (role === "member") {
      // знаходимо команду по joinCode
      const found = Object.values(teams).find(t => t.joinCode === joinCode);
      if (!found){
        setMsg(signupMsg, "Команду з таким joinCode не знайдено ❌", "err");
        return;
      }
      teamId = found.teamId;
    }

    // створюємо користувача
    users[email] = {
      email,
      passHash: hashPass(pass),
      fullName, phone, city,
      role,
      teamId,
      createdAt: Date.now()
    };

    setTeams(teams);
    setUsers(users);

    // логінимо одразу і пам'ятаємо
    setSession(email);

    if (role === "captain") {
      setMsg(signupMsg, `Готово ✅ Команда створена. joinCode: ${createdJoinCode}`, "ok");
    } else {
      const t = teams[teamId];
      setMsg(signupMsg, `Готово ✅ Ти в команді: ${t?.name || "Команда"}`, "ok");
    }

    setTimeout(goCabinet, 350);
  }

  // ====== LOGIN ======
  const loginForm = $("loginForm");
  const loginMsg  = $("loginMsg");

  async function onLogin(e){
    e.preventDefault();
    setMsg(loginMsg, "", "");

    const email = ($("loginEmail")?.value || "").trim().toLowerCase();
    const pass  = ($("loginPassword")?.value || "");

    if (!email || !pass) {
      setMsg(loginMsg, "Введи email і пароль.", "err");
      return;
    }

    const users = getUsers();
    const u = users[email];
    if (!u) {
      setMsg(loginMsg, "Акаунт не знайдено. пройдіть «Реєстрацію».", "err");
      return;
    }

    if (u.passHash !== hashPass(pass)) {
      setMsg(loginMsg, "Невірний пароль.", "err");
      return;
    }

    setSession(email);
    setMsg(loginMsg, "Готово ✅", "ok");
    setTimeout(goCabinet, 250);
  }

  // ===== bind =====
  if (signupForm) signupForm.addEventListener("submit", onSignup);
  if (loginForm)  loginForm.addEventListener("submit", onLogin);

  // ===== auto-login (пам’ятає) =====
  (function(){
    const sess = getSession();
    if (!sess || !sess.email) return;

    const users = getUsers();
    if (!users[sess.email]) return;

    // якщо вже є сесія — одразу в кабінет
    goCabinet();
  })();

})();
