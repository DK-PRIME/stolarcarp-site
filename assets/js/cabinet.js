// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника з liveCache (Firebase compat 10.12.2)

(function () {
  "use strict";

  // =========================
  // BURGER MENU
  // =========================
  const burger = document.getElementById("burger");
  const nav = document.querySelector(".nav");

  if (burger && nav) {
    burger.addEventListener("click", () => nav.classList.toggle("open"));
    nav.addEventListener("click", (e) => {
      if (e.target.classList.contains("nav__link")) nav.classList.remove("open");
    });
  }

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не готовий");
  }

  // =========================
  // CACHE SYSTEM (LIVE CACHE)
  // =========================
  const Cache = {
    data: {
      user: null,
      team: null,
      members: [],
      competitions: [],
      lastUpdate: 0
    },
    isValid(maxAgeMs = 60000) { // 60 секунд
      return this.data.lastUpdate && (Date.now() - this.data.lastUpdate < maxAgeMs);
    },
    set(key, value) {
      this.data[key] = value;
      this.data.lastUpdate = Date.now();
    },
    get(key) { return this.data[key]; },
    clear() {
      this.data = { user: null, team: null, members: [], competitions: [], lastUpdate: 0 };
    }
  };

  // =========================
  // DOM ELEMENTS
  // =========================
  const statusEl  = document.getElementById("cabinetStatus");
  const contentEl = document.getElementById("cabinetContent");

  const teamNameEl     = document.getElementById("teamNameText");
  const captainTextEl  = document.getElementById("captainText");
  const userRoleEl     = document.getElementById("userRoleText");
  const userPhoneEl    = document.getElementById("userPhoneText");

  const joinCodePillEl = document.getElementById("joinCodePill");
  const joinCodeTextEl = document.getElementById("joinCodeText");

  const avatarWrapper  = document.getElementById("avatarWrapper");
  const avatarImgEl    = document.getElementById("cabinetAvatarImg");
  const avatarPhEl     = document.getElementById("cabinetAvatarPlaceholder");
  const avatarMsgEl    = document.getElementById("avatarMsg");

  const membersEl      = document.getElementById("membersContainer");
  const myPartListEl   = document.getElementById("myCompetitions");

  let unsubUser = null;
  let unsubTeam = null;
  let unsubMembers = null;
  let unsubRegs = null;

  // =========================
  // HELPERS
  // =========================
  function setStatus(t){ if (statusEl) statusEl.textContent = t || ""; }
  function showContent(){ if (contentEl) contentEl.style.display = "block"; }
  function hideContent(){ if (contentEl) contentEl.style.display = "none"; }

  function roleText(role){
    return role === "admin"   ? "Адміністратор" :
           role === "judge"   ? "Суддя" :
           role === "captain" ? "Капітан команди" :
           "Учасник команди";
  }

  function escapeHtml(str){
    return String(str || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function setAvatarUrl(url){
    if (!avatarImgEl || !avatarPhEl) return;
    if (url){
      avatarImgEl.src = url;
      avatarImgEl.style.display = "block";
      avatarPhEl.style.display = "none";
      if (avatarWrapper) avatarWrapper.style.cursor = "pointer";
    } else {
      avatarImgEl.style.display = "none";
      avatarPhEl.style.display = "block";
      if (avatarWrapper) avatarWrapper.style.cursor = "default";
    }
  }

  function cleanup(){
    // Не очищаємо Cache при cleanup — зберігаємо між сесіями!
    if (typeof unsubUser === "function") unsubUser();
    if (typeof unsubTeam === "function") unsubTeam();
    if (typeof unsubMembers === "function") unsubMembers();
    if (typeof unsubRegs === "function") unsubRegs();
    unsubUser = unsubTeam = unsubMembers = unsubRegs = null;
  }

  // =========================
  // POPUP SYSTEM (універсальний)
  // =========================
  function openImagePopup(imageUrl) {
    const popup = document.getElementById("avatarPopup");
    const popupImg = document.getElementById("avatarPopupImg");
    if (!popup || !popupImg) return;
    
    popupImg.src = imageUrl;
    popup.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeImagePopup() {
    const popup = document.getElementById("avatarPopup");
    if (!popup) return;
    popup.style.display = "none";
    document.body.style.overflow = "";
  }

  function enableAvatarPopup() {
    const popup = document.getElementById("avatarPopup");
    if (!popup) return;

    if (avatarWrapper && avatarImgEl) {
      avatarWrapper.addEventListener("click", () => {
        if (avatarImgEl.style.display !== "none" && avatarImgEl.src) {
          openImagePopup(avatarImgEl.src);
        }
      });
    }

    popup.addEventListener("click", closeImagePopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeImagePopup();
    });
  }

  // =========================
  // RENDER MEMBERS (з аватарками + попап)
  // =========================
  function renderMembers(list){
    if (!membersEl) return;
    membersEl.innerHTML = "";

    if (!list || list.length === 0){
      membersEl.innerHTML = `<div class="form__hint">Склад команди поки порожній.</div>`;
      return;
    }

    list.forEach((m) => {
      const name = m.fullName || m.email || "Учасник";
      const role = roleText(m.role);
      const avatarUrl = m.avatarUrl || '';
      const hasAvatar = !!avatarUrl;
      
      const row = document.createElement("div");
      row.className = "card";
      row.style.cssText = "padding:12px;margin-top:10px;display:flex;align-items:center;gap:12px;";
      
      const avatarHtml = hasAvatar 
        ? `<div class="member-avatar-wrap" data-avatar="${escapeHtml(avatarUrl)}" style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #facc15;cursor:pointer;transition:transform .2s,box-shadow .2s;" onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 0 10px rgba(250,204,21,.4)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
             <img src="${escapeHtml(avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">
           </div>`
        : `<div style="width:50px;height:50px;border-radius:50%;background:#1f2937;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:default;">👤</div>`;
      
      row.innerHTML = `
        ${avatarHtml}
        <div>
          <div style="font-weight:800">${escapeHtml(name)}</div>
          <div class="form__hint">${escapeHtml(role)}</div>
        </div>
      `;
      
      if (hasAvatar) {
        const avatarWrap = row.querySelector('.member-avatar-wrap');
        if (avatarWrap) {
          avatarWrap.addEventListener('click', () => {
            openImagePopup(avatarUrl);
          });
        }
      }
      
      membersEl.appendChild(row);
    });
  }

  // =========================
  // CACHE RENDER (швидкий старт)
  // =========================
  function renderFromCache() {
    if (!Cache.isValid()) return false;
    
    const user = Cache.get('user');
    const team = Cache.get('team');
    const members = Cache.get('members');
    const competitions = Cache.get('competitions');
    
    if (!user) return false;

    // Миттєво показуємо профіль
    const name = user.fullName || "Без імені";
    const city = user.city ? ` · ${user.city}` : "";
    if (captainTextEl) captainTextEl.textContent = name + city;
    if (userRoleEl) userRoleEl.textContent = roleText(user.role);
    if (userPhoneEl) userPhoneEl.textContent = user.phone || "—";
    setAvatarUrl(user.avatarUrl || "");
    
    // Миттєво показуємо команду
    if (team && teamNameEl) {
      teamNameEl.textContent = team.name || "Команда";
      if (team.joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = team.joinCode;
      }
    } else if (!team) {
      if (teamNameEl) teamNameEl.textContent = "Без команди";
      if (joinCodePillEl) joinCodePillEl.style.display = "none";
    }
    
    // Миттєво показуємо склад
    renderMembers(members);
    
    // Миттєво показуємо змагання
    renderMyParticipation(competitions);
    
    showContent();
    setStatus("Оновлення…");
    
    return true;
  }

  // =========================
  // MY PARTICIPATION
  // =========================
  function norm(v){ return String(v ?? "").trim(); }
  function toMillis(ts){
    if(!ts) return 0;
    if(ts.toMillis) return ts.toMillis();
    try { return +new Date(ts); } catch { return 0; }
  }

  const compMetaCache = Object.create(null);

  async function getCompetitionMeta(db, compId, stageId){
    const st = norm(stageId) || "main";
    const key = `${compId}||${st}`;
    if (compMetaCache[key]) return compMetaCache[key];

    let compTitle = "", stageTitle = "";
    try{
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (cSnap.exists){
        const c = cSnap.data() || {};
        compTitle = (c.name || c.title || "").trim();
        const events = Array.isArray(c.events) ? c.events : [];
        const ev = events.find(e => norm(e?.key || e?.stageId || e?.id) === st);
        stageTitle = (ev && (ev.title || ev.name || ev.label)) ? String(ev.title || ev.name || ev.label).trim() : "";
        if (!stageTitle && st !== "main") stageTitle = st;
      }
    }catch{}

    const res = { compTitle, stageTitle };
    compMetaCache[key] = res;
    return res;
  }

  function niceTitleOnly(it){
    const comp = (it.compTitle || it.competitionTitle || it.competitionName || it.competitionId || "Змагання").trim();
    const st = (it.stageTitle || (it.stageId && it.stageId !== "main" ? it.stageId : "") || "").trim();
    return st ? `${escapeHtml(comp)} · ${escapeHtml(st)}` : escapeHtml(comp);
  }

  function renderMyParticipation(items){
    if (!myPartListEl) return;
    myPartListEl.innerHTML = "";

    if (!items || items.length === 0){
      myPartListEl.innerHTML = `<div class="cabinet-small-muted">Поки що немає участі.</div>`;
      return;
    }

    items.forEach((it) => {
      const compId = norm(it.competitionId);
      const stageId = norm(it.stageId) || "main";
      const href = `participation.html?comp=${encodeURIComponent(compId)}&stage=${encodeURIComponent(stageId)}`;

      const row = document.createElement("a");
      row.href = href;
      row.className = "card";
      row.style.cssText = "display:block;padding:14px;margin-top:10px;text-decoration:none;";

      row.innerHTML = `
        <div style="font-weight:950;line-height:1.25;text-align:center;background:linear-gradient(90deg,#facc15 0%,#7f1d1d 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;">
          ${niceTitleOnly(it)}
        </div>
      `;
      myPartListEl.appendChild(row);
    });
  }

  function subscribeMyParticipation(db, teamId, uid){
    if (typeof unsubRegs === "function") { unsubRegs(); unsubRegs = null; }
    if (!myPartListEl) return;

    // Спочатку показуємо кеш
    const cached = Cache.get('competitions');
    if (cached?.length) {
      renderMyParticipation(cached);
    } else if (!teamId && !uid) {
      renderMyParticipation([]);
      return;
    } else {
      myPartListEl.innerHTML = `<div class="cabinet-small-muted">Завантаження…</div>`;
    }

    const q = teamId 
      ? db.collection("public_participants").where("teamId", "==", teamId).where("entryType", "==", "team")
      : db.collection("public_participants").where("uid", "==", uid);

    unsubRegs = q.onSnapshot(async (qs) => {
      const rows = [];
      qs.forEach(d => rows.push({ id:d.id, ...(d.data() || {}) }));

      if (!rows.length){ 
        Cache.set('competitions', []);
        renderMyParticipation([]); 
        return; 
      }

      const map = Object.create(null);
      rows.forEach(r => {
        const c = norm(r.competitionId);
        const s = norm(r.stageId) || "main";
        if (!c) return;
        const k = `${c}||${s}`;
        if (!map[k]) map[k] = r;
      });

      const uniq = Object.values(map);
      for (const it of uniq){
        const meta = await getCompetitionMeta(db, norm(it.competitionId), norm(it.stageId) || "main");
        it.compTitle = meta.compTitle || it.competitionTitle || it.competitionName || norm(it.competitionId);
        it.stageTitle = meta.stageTitle || it.stageName || "";
        it.updatedAt = it.updatedAt || it.confirmedAt || it.createdAt || null;
      }

      uniq.sort((a,b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      
      Cache.set('competitions', uniq);
      renderMyParticipation(uniq);
    }, (err) => {
      console.warn(err);
      // При помилці показуємо кеш
      renderMyParticipation(Cache.get('competitions'));
      myPartListEl.innerHTML = `<div class="cabinet-small-muted" style="color:#ef4444;">Офлайн-режим. Дані можуть бути застарілими.</div>`;
    });
  }

  // =========================
  // TEAM & USER SUBSCRIPTIONS
  // =========================
  function subscribeTeam(db, teamId){
    if (!teamId){
      Cache.set('team', null);
      Cache.set('members', []);
      if (teamNameEl) teamNameEl.textContent = "Без команди";
      if (joinCodePillEl) joinCodePillEl.style.display = "none";
      renderMembers([]);
      return;
    }

    // Спочатку показуємо кеш
    const cachedTeam = Cache.get('team');
    const cachedMembers = Cache.get('members');
    
    if (cachedTeam && teamNameEl) {
      teamNameEl.textContent = cachedTeam.name || "Команда";
      if (cachedTeam.joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = cachedTeam.joinCode;
      }
    }
    if (cachedMembers?.length) renderMembers(cachedMembers);

    unsubTeam = db.collection("teams").doc(teamId).onSnapshot((snap) => {
      if (!snap.exists) return;
      const t = snap.data() || {};
      Cache.set('team', t);
      
      if (teamNameEl) teamNameEl.textContent = t.name || "Команда";
      if (t.joinCode && joinCodePillEl && joinCodeTextEl){
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = t.joinCode;
      } else if (joinCodePillEl){
        joinCodePillEl.style.display = "none";
      }
    });

    unsubMembers = db.collection("users").where("teamId","==",teamId).onSnapshot((qs) => {
      const list = [];
      qs.forEach(d => list.push({ id:d.id, ...(d.data()||{}) }));
      Cache.set('members', list);
      renderMembers(list);
    }, (err) => {
      console.warn(err);
      renderMembers(Cache.get('members'));
      if (membersEl) membersEl.innerHTML += `<div class="form__hint" style="color:#ef4444;">Офлайн-режим.</div>`;
    });
  }

  function subscribeUser(auth, db, uid){
    // Спроба показати з кешу миттєво
    const hasCache = renderFromCache();
    
    unsubUser = db.collection("users").doc(uid).onSnapshot((snap) => {
      if (!snap.exists){
        setStatus("Анкета користувача не знайдена.");
        showContent();
        return;
      }

      const u = snap.data() || {};
      Cache.set('user', u);
      
      const name = u.fullName || auth.currentUser?.email || "Без імені";
      const city = u.city ? ` · ${u.city}` : "";

      if (captainTextEl) captainTextEl.textContent = name + city;
      if (userRoleEl) userRoleEl.textContent = roleText(u.role);
      if (userPhoneEl) userPhoneEl.textContent = u.phone || "—";

      setAvatarUrl(u.avatarUrl || "");

      if (typeof unsubTeam === "function") { unsubTeam(); unsubTeam = null; }
      if (typeof unsubMembers === "function") { unsubMembers(); unsubMembers = null; }
      subscribeTeam(db, u.teamId || null);
      subscribeMyParticipation(db, u.teamId || null, uid);

      setStatus("Кабінет завантажено.");
      showContent();
      setTimeout(() => { if (statusEl?.textContent === "Кабінет завантажено.") statusEl.textContent = ""; }, 1200);
    }, (err) => {
      console.error(err);
      if (!hasCache) {
        setStatus("Помилка читання профілю.");
      }
      showContent();
    });
  }

  // =========================
  // CLOUDINARY WIDGET
  // =========================
  function setupCloudinaryWidget(auth, db) {
    const CLOUDINARY_CLOUD = 'dxlr12gzc';
    const CLOUDINARY_PRESET = 'avatar_upload';
    const openWidgetBtn = document.getElementById("openCloudinaryWidget");
    const msgEl = document.getElementById("avatarMsg");

    if (!openWidgetBtn || !window.cloudinary) {
      console.warn("Cloudinary Widget не доступний");
      return;
    }

    function setMsg(txt, type){
      if (!msgEl) return;
      msgEl.textContent = txt;
      msgEl.style.color = type === "ok" ? "#22c55e" : type === "err" ? "#ef4444" : "";
    }

    openWidgetBtn.addEventListener("click", () => {
      const user = auth.currentUser;
      if (!user) { setMsg("Увійдіть у акаунт", "err"); return; }

      const widget = cloudinary.createUploadWidget(
        {
          cloudName: CLOUDINARY_CLOUD,
          uploadPreset: CLOUDINARY_PRESET,
          folder: `avatars/${user.uid}`,
          sources: ['local', 'camera'],
          multiple: false,
          maxFileSize: 5000000,
          cropping: true,
          croppingAspectRatio: 1,
          showSkipCropButton: false,
          language: 'uk',
          styles: {
            palette: {
              window: "#0f172a", sourceBg: "#1e293b", windowBorder: "#facc15",
              tabIcon: "#facc15", inactiveTabIcon: "#94a3b8", menuIcons: "#facc15",
              link: "#facc15", action: "#facc15", inProgress: "#f97316",
              complete: "#22c55e", error: "#ef4444", textDark: "#020617", textLight: "#e2e8f0"
            }
          }
        },
        async (error, result) => {
          if (error) { console.error(error); setMsg("Помилка завантаження", "err"); return; }
          if (result.event !== "success") return;

          try {
            setMsg("Зберігаю…");
            await db.collection("users").doc(user.uid).set({ avatarUrl: result.info.secure_url }, { merge: true });
            setAvatarUrl(result.info.secure_url);
            setMsg("Аватар оновлено!", "ok");
            setTimeout(() => setMsg("", ""), 3000);
          } catch (err) {
            console.error(err);
            setMsg("Помилка збереження", "err");
          }
        }
      );
      widget.open();
    });
  }

  // =========================
  // INIT
  // =========================
  (async () => {
    try {
      await waitFirebase();
      const auth = window.scAuth;
      const db = window.scDb;

      auth.onAuthStateChanged((user) => {
        cleanup();
        if (!user){
          Cache.clear(); // Чистимо кеш при виході
          setStatus("Ви не увійшли. Переходимо…");
          hideContent();
          setTimeout(() => window.location.href = "auth.html", 400);
          return;
        }
        if (user.uid === ADMIN_UID){
          setStatus("Адмін-акаунт → перехід…");
          hideContent();
          setTimeout(() => window.location.href = "admin.html", 200);
          return;
        }
        setStatus("Перевірка доступу…");
        subscribeUser(auth, db, user.uid);
      });

      setupCloudinaryWidget(auth, db);
      enableAvatarPopup();

    } catch (err) {
      console.error(err);
      setStatus("Помилка: " + (err?.message || err));
      showContent();
    }
  })();
})();
