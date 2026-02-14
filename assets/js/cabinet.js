// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника з liveCache + Profile Edit (Firebase compat 10.12.2)

(function () {
  "use strict";

  console.log("✅ cabinet.js LOADED v20260215-profile-edit");

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
      userLastUpdate: 0,
      compsLastUpdate: 0
    },
    isUserValid(maxAgeMs = 60000) {
      return this.data.userLastUpdate && (Date.now() - this.data.userLastUpdate < maxAgeMs);
    },
    isCompsValid(maxAgeMs = 300000) {
      return this.data.compsLastUpdate && (Date.now() - this.data.compsLastUpdate < maxAgeMs);
    },
    setUser(value) {
      this.data.user = value;
      this.data.userLastUpdate = Date.now();
    },
    setTeam(value) { this.data.team = value; },
    setMembers(value) { this.data.members = value; },
    setComps(value) {
      this.data.competitions = value;
      this.data.compsLastUpdate = Date.now();
    },
    get(key) { return this.data[key]; },
    clear() {
      this.data = {
        user: null, team: null, members: [], competitions: [],
        userLastUpdate: 0, compsLastUpdate: 0
      };
    }
  };

  // =========================
  // DOM ELEMENTS
  // =========================
  const statusEl  = document.getElementById("cabinetStatus");
  const contentEl = document.getElementById("cabinetContent");

  const teamNameEl     = document.getElementById("teamNameText");

  // ✅ нові елементи (з твого HTML)
  const userFullNameEl = document.getElementById("userFullName");
  const userCityEl     = document.getElementById("userCity");

  const captainTextEl  = document.getElementById("captainText"); // може бути у старому html
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

  // ✅ PROFILE EDIT DOM
  const editProfileBtn   = document.getElementById("editProfileBtn");
  const saveProfileBtn   = document.getElementById("saveProfileBtn");
  const cancelProfileBtn = document.getElementById("cancelProfileBtn");
  const profileEditBox   = document.getElementById("profileEditBox");
  const fullNameInput    = document.getElementById("fullNameInput");
  const phoneInput       = document.getElementById("phoneInput");
  const cityInput        = document.getElementById("cityInput");
  const profileEditMsg   = document.getElementById("profileEditMsg");

  let isEditingProfile = false;
  let isSavingProfile = false;
  let lastProfileSnap = null;

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
    if (typeof unsubUser === "function") unsubUser();
    if (typeof unsubTeam === "function") unsubTeam();
    if (typeof unsubMembers === "function") unsubMembers();
    if (typeof unsubRegs === "function") unsubRegs();
    unsubUser = unsubTeam = unsubMembers = unsubRegs = null;
  }

  function serverTimestamp(){
    try { return window.firebase.firestore.FieldValue.serverTimestamp(); }
    catch { return null; }
  }

  // =========================
  // PROFILE EDIT HELPERS
  // =========================
  function setEditMsg(txt, type){
    if (!profileEditMsg) return;
    profileEditMsg.textContent = txt || "";
    profileEditMsg.classList.remove("ok","err");
    if (type === "ok") profileEditMsg.classList.add("ok");
    if (type === "err") profileEditMsg.classList.add("err");
  }

  function cleanName(v){
    return String(v || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }
  function cleanPhone(v){
    return String(v || "")
      .trim()
      .replace(/[^\d+\-\s()]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 25);
  }
  function cleanCity(v){
    return String(v || "").trim().replace(/\s+/g, " ").slice(0, 40);
  }

  function openEditProfile(u){
    if (!profileEditBox || !fullNameInput || !phoneInput || !cityInput) return;

    isEditingProfile = true;
    lastProfileSnap = u || lastProfileSnap;

    profileEditBox.style.display = "block";
    if (editProfileBtn) editProfileBtn.style.display = "none";
    if (saveProfileBtn) saveProfileBtn.style.display = "inline-flex";
    if (cancelProfileBtn) cancelProfileBtn.style.display = "inline-flex";

    fullNameInput.value = u?.fullName || "";
    phoneInput.value = u?.phone || "";
    cityInput.value = u?.city || "";

    setEditMsg("", "");
  }

  function closeEditProfile(){
    isEditingProfile = false;

    if (profileEditBox) profileEditBox.style.display = "none";
    if (editProfileBtn) editProfileBtn.style.display = "inline-flex";
    if (saveProfileBtn) saveProfileBtn.style.display = "none";
    if (cancelProfileBtn) cancelProfileBtn.style.display = "none";

    setEditMsg("", "");
  }

  function renderUserInfo(u){
    const name = u?.fullName || "Без імені";
    const city = (u?.city || "").trim();

    // ✅ ПІБ/місто окремими рядками (твій новий HTML)
    if (userFullNameEl) userFullNameEl.textContent = name;

    if (userCityEl){
      if (city){
        userCityEl.textContent = city;
        userCityEl.style.display = "block";
      } else {
        userCityEl.textContent = "";
        userCityEl.style.display = "none";
      }
    }

    // ✅ якщо у старому HTML був captainTextEl — теж підтримаємо
    if (captainTextEl){
      const cityDot = city ? ` · ${city}` : "";
      captainTextEl.textContent = name + cityDot;
    }

    if (userRoleEl) userRoleEl.textContent = roleText(u?.role);
    if (userPhoneEl) userPhoneEl.textContent = u?.phone || "—";
    setAvatarUrl(u?.avatarUrl || "");

    // інпути — тільки якщо не редагуємо
    if (!isEditingProfile) {
      if (fullNameInput) fullNameInput.value = u?.fullName || "";
      if (phoneInput) phoneInput.value = u?.phone || "";
      if (cityInput) cityInput.value = u?.city || "";
    }
  }

  // =========================
  // POPUP SYSTEM
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
  // RENDER MEMBERS
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
        if (avatarWrap) avatarWrap.addEventListener('click', () => openImagePopup(avatarUrl));
      }

      membersEl.appendChild(row);
    });
  }

  // =========================
  // CACHE RENDER
  // =========================
  function renderCompsFromCache() {
    const comps = Cache.get('competitions');
    if (Cache.isCompsValid() && comps?.length) {
      renderMyParticipation(comps);
      return true;
    }
    if (Cache.isCompsValid()) {
      renderMyParticipation([]);
      return true;
    }
    return false;
  }

  function renderFromCache() {
    const user = Cache.get('user');
    const team = Cache.get('team');
    const members = Cache.get('members');

    if (Cache.isUserValid() && user) {
      renderUserInfo(user);

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

      renderMembers(members);
      return true;
    }
    return false;
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

    const hasCache = Cache.isCompsValid();

    if (!teamId && !uid){
      Cache.setComps([]);
      renderMyParticipation([]);
      return;
    }

    if (!hasCache) myPartListEl.innerHTML = `<div class="cabinet-small-muted">Завантаження…</div>`;

    const q = teamId
      ? db.collection("public_participants").where("teamId", "==", teamId).where("entryType", "==", "team")
      : db.collection("public_participants").where("uid", "==", uid);

    unsubRegs = q.onSnapshot(async (qs) => {
      const rows = [];
      qs.forEach(d => rows.push({ id:d.id, ...(d.data() || {}) }));

      if (!rows.length){
        Cache.setComps([]);
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

      Cache.setComps(uniq);
      renderMyParticipation(uniq);
    }, (err) => {
      console.warn(err);
      if (!hasCache) {
        renderMyParticipation(Cache.get('competitions'));
        myPartListEl.innerHTML += `<div class="cabinet-small-muted" style="color:#ef4444;margin-top:8px;">Офлайн-режим. Дані можуть бути застарілими.</div>`;
      }
    });
  }

  // =========================
  // TEAM & USER SUBSCRIPTIONS
  // =========================
  function subscribeTeam(db, teamId){
    if (!teamId){
      Cache.setTeam(null);
      Cache.setMembers([]);
      if (teamNameEl) teamNameEl.textContent = "Без команди";
      if (joinCodePillEl) joinCodePillEl.style.display = "none";
      renderMembers([]);
      return;
    }

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
      Cache.setTeam(t);

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
      Cache.setMembers(list);
      renderMembers(list);
    }, (err) => {
      console.warn(err);
      renderMembers(Cache.get('members'));
    });
  }

  function subscribeUser(auth, db, uid){
    renderCompsFromCache();
    const hasUserCache = renderFromCache();

    if (!hasUserCache) {
      setStatus("Завантаження…");
      showContent();
    }

    unsubUser = db.collection("users").doc(uid).onSnapshot((snap) => {
      if (!snap.exists){
        setStatus("Анкета користувача не знайдена.");
        showContent();
        return;
      }

      const u = snap.data() || {};
      Cache.setUser(u);
      lastProfileSnap = u;

      renderUserInfo(u);

      if (typeof unsubTeam === "function") { unsubTeam(); unsubTeam = null; }
      if (typeof unsubMembers === "function") { unsubMembers(); unsubMembers = null; }
      subscribeTeam(db, u.teamId || null);
      subscribeMyParticipation(db, u.teamId || null, uid);

      setStatus("Кабінет завантажено.");
      showContent();
      setTimeout(() => { if (statusEl?.textContent === "Кабінет завантажено.") statusEl.textContent = ""; }, 1200);
    }, (err) => {
      console.error(err);
      if (!hasUserCache) setStatus("Помилка читання профілю.");
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
      msgEl.classList.remove("ok","err");
      if (type === "ok") msgEl.classList.add("ok");
      if (type === "err") msgEl.classList.add("err");
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
  // PROFILE EDIT EVENTS
  // =========================
  function setupProfileEdit(auth, db){
    // якщо HTML без блоку редагування — тихо виходимо
    if (!editProfileBtn || !saveProfileBtn || !cancelProfileBtn || !profileEditBox) {
      console.warn("⚠️ Profile Edit UI not found in HTML");
      return;
    }

    editProfileBtn.addEventListener("click", () => {
      openEditProfile(lastProfileSnap || Cache.get("user"));
    });

    cancelProfileBtn.addEventListener("click", () => {
      const u = lastProfileSnap || Cache.get("user") || {};
      if (fullNameInput) fullNameInput.value = u.fullName || "";
      if (phoneInput) phoneInput.value = u.phone || "";
      if (cityInput) cityInput.value = u.city || "";
      closeEditProfile();
    });

    saveProfileBtn.addEventListener("click", async () => {
      if (isSavingProfile) return;

      const user = auth.currentUser;
      if (!user) { setEditMsg("Увійдіть у акаунт.", "err"); return; }

      const name = cleanName(fullNameInput?.value);
      const phone = cleanPhone(phoneInput?.value);
      const city = cleanCity(cityInput?.value);

      if (!name) { setEditMsg("Вкажіть імʼя та прізвище.", "err"); return; }
      if (!phone) { setEditMsg("Вкажіть номер телефону.", "err"); return; }

      try {
        isSavingProfile = true;
        setEditMsg("Зберігаю…");

        const upd = { fullName: name, phone: phone, city: city || "" };
        const ts = serverTimestamp();
        if (ts) upd.updatedAt = ts;

        await db.collection("users").doc(user.uid).set(upd, { merge: true });

        setEditMsg("Збережено!", "ok");
        setTimeout(() => closeEditProfile(), 550);
      } catch (e) {
        console.error(e);
        setEditMsg("Помилка збереження. Перевірте правила доступу.", "err");
      } finally {
        isSavingProfile = false;
      }
    });
  }

  // =========================
  // INIT
  // =========================
  (async () => {
    try {
      // 1) МИТТЄВО рендеримо кеш (без Firebase!)
      const hasComps = renderCompsFromCache();
      const hasUser = renderFromCache();

      if (hasComps || hasUser) {
        showContent();
        setStatus("Оновлення…");
      } else {
        setStatus("Завантаження…");
      }

      // 2) Тільки потім чекаємо Firebase
      await waitFirebase();
      const auth = window.scAuth;
      const db = window.scDb;

      auth.onAuthStateChanged((user) => {
        cleanup();

        if (!user){
          Cache.clear();
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

        subscribeUser(auth, db, user.uid);
      });

      setupCloudinaryWidget(auth, db);
      enableAvatarPopup();
      setupProfileEdit(auth, db);

    } catch (err) {
      console.error(err);
      setStatus("Помилка: " + (err?.message || err));
      showContent();
    }
  })();

})();
