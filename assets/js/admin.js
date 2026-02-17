 });

  init();
})();
// assets/js/admin.js
// STOLAR CARP • Admin panel (Home)
// ✅ admin.html = login + menu only
// ✅ create/edit logic moved to admin-create.html + admin-create.js
// ✅ access by users/{uid}.role === "admin"
// ✅ no heavy Firestore reads here (no зависань)
// ✅ navigation handled by plain <a href="..."> in HTML (no duplicate JS redirects)
// ✅ РЕЖИМ 1: Ввів 1 раз — пускає на всі адмін-сторінки (сесія зберігається)

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);

  const setStatus = (t) => { const e = $("adminStatus"); if(e) e.textContent = t; };
  const setDebug  = (t) => { const e = $("adminDebug");  if(e) e.textContent = t || ""; };

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  // ---- Firebase wait ----
  async function waitForFirebase(){
    for(let i = 0; i < 140; i++){
      if(window.scAuth && window.scDb && window.firebase) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js.");
  }

  let auth = null, db = null;

  // ---- UI refs ----
  const adminLogin = $("adminLogin");
  const adminApp   = $("adminApp");

  // ---- Error messages map ----
  const AUTH_ERRORS = {
    'auth/user-not-found': "Користувача не знайдено",
    'auth/wrong-password': "Невірний пароль",
    'auth/invalid-email': "Невірний формат email",
    'auth/invalid-credential': "Невірний email або пароль",
    'auth/network-request-failed': "Немає з'єднання з інтернетом",
    'auth/too-many-requests': "Забагато спроб. Спробуйте пізніше",
    'auth/user-disabled': "Акаунт заблоковано"
  };

  async function requireAdmin(user){
    if(!user) return false;
    try{
      const snap = await db.collection("users").doc(user.uid).get();
      const role = snap.exists ? ((snap.data() || {}).role || "") : "";
      return String(role).toLowerCase() === "admin";
    }catch(_){
      return false;
    }
  }

  // ✅ Logout (admin -> auth.html + clear team caches)
  async function doLogout(){
    try{
      if(auth) await auth.signOut();
    }catch(_){}

    // чистимо кеші команд, щоб потім зайти як учасник з іншої пошти
    try{
      Object.keys(localStorage).forEach(k => {
        if(k.startsWith("sc_team_cache_")) localStorage.removeItem(k);
      });
    }catch(_){}

    window.location.href = "/auth.html";
  }

  async function init(){
    // Firebase init
    try{
      await waitForFirebase();
      auth = window.scAuth;
      db   = window.scDb;
    }catch(e){
      setStatus("Firebase не запустився ❌");
      setDebug(e.message || String(e));
      show(adminLogin);
      hide(adminApp);
      return;
    }

    // ✅ bind logout button (header)
    const btnLogout = $("btnAdminLogout");
    if(btnLogout){
      btnLogout.addEventListener("click", doLogout);
    }

    // UI refs
    const btnLogin = $("btnAdminLogin");
    const inpEmail = $("admEmail");
    const inpPass  = $("admPass");
    const msgEl    = $("adminLoginMsg");

    // Helper: set button loading state
    const setLoading = (loading) => {
      if(!btnLogin) return;
      btnLogin.disabled = loading;
      btnLogin.textContent = loading ? "Вхід…" : "Увійти";
    };

    // Login handler
    const doLogin = async () => {
      const email = (inpEmail?.value || "").trim();
      const pass  = (inpPass?.value || "").trim();

      if(!email || !pass){
        if(msgEl) msgEl.textContent = "Введіть email і пароль";
        return;
      }

      setLoading(true);
      if(msgEl) msgEl.textContent = "";

      try{
        await auth.signInWithEmailAndPassword(email, pass);
        // Успіх — onAuthStateChanged приховає форму і покаже меню
      }catch(e){
        const code = e?.code || "";
        const text = AUTH_ERRORS[code] || e?.message || "Помилка входу";
        if(msgEl) msgEl.textContent = text;
        setLoading(false);
      }
    };

    // Bind click
    if(btnLogin){
      btnLogin.onclick = doLogin;
    }

    // ✅ Bind Enter key on both inputs
    [inpEmail, inpPass].forEach(el => {
      if(el) el.addEventListener("keypress", (e) => {
        if(e.key === "Enter") doLogin();
      });
    });

    // AUTH STATE (by role)
    auth.onAuthStateChanged(async (user) => {
      if(!user){
        // Немає сесії — показуємо форму входу
        setStatus("Потрібен вхід");
        setDebug("");
        show(adminLogin);
        hide(adminApp);
        setLoading(false);
        return;
      }

      // Є користувач — перевіряємо чи це адмін
      const ok = await requireAdmin(user);
      if(!ok){
        setStatus("Доступ заборонено ❌");
        setDebug("Цей акаунт не має ролі admin (users/{uid}.role).");
        // Не робимо signOut — просто показуємо що доступу нема
        // Користувач може сам вийти через auth.html якщо потрібно
        show(adminLogin);
        hide(adminApp);
        setLoading(false);
        return;
      }

      // ✅ АДМІН ПІДТВЕРДЖЕНО — показуємо меню
      setStatus("Адмін-доступ ✅");
      setDebug("");
      hide(adminLogin);
      show(adminApp);
      // Кнопка залишиться в стані "Вхід…" але форма прихована — не проблема
    });
  }

  // Global errors
  window.addEventListener("error", (e) => {
    setStatus("Помилка JS ❌");
    setDebug(e?.message || "Помилка");
  });

  window.addEventListener("unhandledrejection", (e) => {
    setStatus("Помилка Promise ❌");
    setDebug(e?.reason?.message || String(e?.reason || "Promise error"));
  });

  init();
})();
