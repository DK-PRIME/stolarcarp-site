// assets/js/admin.js
// STOLAR CARP • Admin panel (Home)
// ✅ admin.html = login + menu only
// ✅ create/edit logic moved to admin-create.html + admin-create.js
// ✅ access by users/{uid}.role === "admin"
// ✅ no heavy Firestore reads here (no зависань)
// ✅ navigation handled by plain <a href="..."> in HTML (no duplicate JS redirects)

(function(){
  "use strict";

  const $ = (id)=>document.getElementById(id);

  const setStatus = (t)=>{ const e=$("adminStatus"); if(e) e.textContent=t; };
  const setDebug  = (t)=>{ const e=$("adminDebug");  if(e) e.textContent=t||""; };

  function show(el){ el && el.classList.remove("hidden"); }
  function hide(el){ el && el.classList.add("hidden"); }

  // ---- Firebase wait ----
  async function waitForFirebase(){
    for(let i=0;i<140;i++){
      if(window.scAuth && window.scDb && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js.");
  }

  let auth=null, db=null;

  // ---- UI refs ----
  const adminLogin = $("adminLogin");
  const adminApp   = $("adminApp");

  async function requireAdmin(user){
    if(!user) return false;
    try{
      const snap = await db.collection("users").doc(user.uid).get();
      const role = snap.exists ? ((snap.data()||{}).role || "") : "";
      return String(role).toLowerCase() === "admin";
    }catch(_){
      return false;
    }
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

    // Login button
    const btnLogin = $("btnAdminLogin");
    if(btnLogin){
      btnLogin.onclick = async ()=>{
        const email = ($("admEmail")?.value || "").trim();
        const pass  = ($("admPass")?.value || "").trim();
        const msg   = $("adminLoginMsg");
        if(!email || !pass){
          if(msg) msg.textContent="Введи email і пароль.";
          return;
        }
        if(msg) msg.textContent="Вхід…";
        try{
          await auth.signInWithEmailAndPassword(email, pass);
        }catch(e){
          if(msg) msg.textContent = e?.message || "Помилка входу";
        }
      };
    }

    // AUTH STATE (by role)
    auth.onAuthStateChanged(async (user)=>{
      if(!user){
        setStatus("Потрібен вхід");
        setDebug("");
        show(adminLogin);
        hide(adminApp);
        return;
      }

      const ok = await requireAdmin(user);
      if(!ok){
        setStatus("Доступ заборонено ❌");
        setDebug("Цей акаунт не має ролі admin (users/{uid}.role).");
        try{ await auth.signOut(); }catch(_){}
        show(adminLogin);
        hide(adminApp);
        return;
      }

      setStatus("Адмін-доступ ✅");
      setDebug("");
      hide(adminLogin);
      show(adminApp);
    });
  }

  // Глобальні помилки — показуємо в шапці
  window.addEventListener("error", (e)=>{
    setStatus("Помилка JS ❌");
    setDebug(e?.message || "Помилка");
  });

  window.addEventListener("unhandledrejection", (e)=>{
    setStatus("Помилка Promise ❌");
    setDebug(e?.reason?.message || String(e?.reason || "Promise error"));
  });

  init();
})();
