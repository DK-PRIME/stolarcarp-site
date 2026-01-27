// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника (Firebase compat 10.12.2)
// Працює з firebase-init.js (window.scAuth, window.scDb)

(function () {
  "use strict";

  // =========================
  // BURGER MENU (CABINET)
  // =========================
  const burger = document.getElementById("burger");
  const nav = document.querySelector(".nav");

  if (burger && nav) {
    burger.addEventListener("click", () => {
      nav.classList.toggle("open");
    });

    nav.addEventListener("click", (e) => {
      if (e.target.classList.contains("nav__link")) {
        nav.classList.remove("open");
      }
    });
  }

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не готовий (нема scAuth/scDb). Перевір firebase-init.js і підключення SDK на сторінці.");
  }

  const statusEl  = document.getElementById("cabinetStatus");
  const contentEl = document.getElementById("cabinetContent");

  const teamNameEl     = document.getElementById("teamNameText");
  const captainTextEl  = document.getElementById("captainText");
  const userRoleEl     = document.getElementById("userRoleText");
  const userPhoneEl    = document.getElementById("userPhoneText");

  const joinCodePillEl = document.getElementById("joinCodePill");
  const joinCodeTextEl = document.getElementById("joinCodeText");

  const avatarImgEl    = document.getElementById("cabinetAvatarImg");
  const avatarPhEl     = document.getElementById("cabinetAvatarPlaceholder");
  const avatarMsgEl    = document.getElementById("avatarMsg");

  const membersEl      = document.getElementById("membersContainer");

  // ✅ МОЯ УЧАСТЬ:
  const myPartListEl = document.getElementById("myCompetitions") || document.getElementById("myParticipationList");
  const myPartMsgEl  = document.getElementById("myParticipationMsg");

  let unsubUser = null;
  let unsubTeam = null;
  let unsubMembers = null;
  let unsubRegs = null;

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
    } else {
      avatarImgEl.style.display = "none";
      avatarPhEl.style.display = "block";
    }
  }

  function cleanup(){
    if (typeof unsubUser === "function") unsubUser();
    if (typeof unsubTeam === "function") unsubTeam();
    if (typeof unsubMembers === "function") unsubMembers();
    if (typeof unsubRegs === "function") unsubRegs();
    unsubUser = unsubTeam = unsubMembers = unsubRegs = null;
  }

  // ===== РЕНДЕР УЧАСНИКІВ З АВАТАРКАМИ =====
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
      
      const row = document.createElement("div");
      row.className = "card";
      row.style.cssText = "padding:12px;margin-top:10px;display:flex;align-items:center;gap:12px;";
      
      const avatarHtml = avatarUrl 
        ? `<img src="${escapeHtml(avatarUrl)}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid #facc15;">`
        : `<div style="width:50px;height:50px;border-radius:50%;background:#1f2937;display:flex;align-items:center;justify-content:center;font-size:24px;">👤</div>`;
      
      row.innerHTML = `
        ${avatarHtml}
        <div>
          <div style="font-weight:800">${escapeHtml(name)}</div>
          <div class="form__hint">${escapeHtml(role)}</div>
        </div>
      `;
      
      membersEl.appendChild(row);
    });
  }

  // ===== МОЯ УЧАСТЬ =====
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

    let compTitle = "";
    let stageTitle = "";

    try{
      const cSnap = await db.collection("competitions").doc(compId).get();
      if (cSnap.exists){
        const c = cSnap.data() || {};
        compTitle = (c.name || c.title || "").trim();

        const events = Array.isArray(c.events) ? c.events : [];
        const ev = events.find(e => norm(e?.key || e?.stageId || e?.id) === st);

        stageTitle = (ev && (ev.title || ev.name || ev.label))
          ? String(ev.title || ev.name || ev.label).trim()
          : "";

        if (!stageTitle && st !== "main") stageTitle = st;
      }
    }catch{}

    const res = { compTitle, stageTitle };
    compMetaCache[key] = res;
    return res;
  }

  function niceTitleOnly(it){
    const comp = (it.compTitle || it.competitionTitle || it.competitionName || it.competitionId || "Змагання").trim();
    const st   = (it.stageTitle || (it.stageId && it.stageId !== "main" ? it.stageId : "") || "").trim();
    return st ? `${escapeHtml(comp)} · ${escapeHtml(st)}` : escapeHtml(comp);
  }

  function renderMyParticipation(items){
    if (!myPartListEl) return;

    myPartListEl.innerHTML = "";

    if (!items || items.length === 0){
      myPartListEl.innerHTML = `<div class="cabinet-small-muted">Поки що немає участі.</div>`;
      if (myPartMsgEl) myPartMsgEl.textContent = "";
      return;
    }

    items.forEach((it) => {
      const compId  = norm(it.competitionId);
      const stageId = norm(it.stageId) || "main";
      const href = `participation.html?comp=${encodeURIComponent(compId)}&stage=${encodeURIComponent(stageId)}`;

      const row = document.createElement("a");
      row.href = href;
      row.className = "card";
      row.style.display = "block";
      row.style.padding = "14px 14px";
      row.style.marginTop = "10px";
      row.style.textDecoration = "none";

      row.innerHTML = `
        <div style="
          font-weight:950;
          line-height:1.25;
          text-align:center;
          white-space:normal;
          overflow:visible;
          letter-spacing:.2px;
          background:linear-gradient(90deg,#facc15 0%,#7f1d1d 100%);
          -webkit-background-clip:text;
          background-clip:text;
          color:transparent;
          -webkit-text-fill-color:transparent;
        ">
          ${niceTitleOnly(it)}
        </div>
      `;

      myPartListEl.appendChild(row);
    });

    if (myPartMsgEl) myPartMsgEl.textContent = "";
  }

  function subscribeMyParticipation(db, teamId, uid){
    if (typeof unsubRegs === "function") { unsubRegs(); unsubRegs = null; }
    if (!myPartListEl) return;

    if (!teamId && !uid){
      renderMyParticipation([]);
      return;
    }

    myPartListEl.innerHTML = `<div class="cabinet-small-muted">Завантаження…</div>`;
    if (myPartMsgEl) myPartMsgEl.textContent = "";

    let q;
    if (teamId){
      q = db.collection("public_participants")
        .where("teamId", "==", teamId)
        .where("entryType", "==", "team");
    } else {
      q = db.collection("public_participants")
        .where("uid", "==", uid);
    }

    unsubRegs = q.onSnapshot(async (qs) => {
      const rows = [];
      qs.forEach(d => rows.push({ id:d.id, ...(d.data() || {}) }));

      if (!rows.length){
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
        const compId = norm(it.competitionId);
        const stageId = norm(it.stageId) || "main";
        const meta = await getCompetitionMeta(db, compId, stageId);

        it.compTitle  = meta.compTitle || it.competitionTitle || it.competitionName || compId;
        it.stageTitle = meta.stageTitle || it.stageName || "";
        it.stageId    = stageId;
        it.updatedAt  = it.updatedAt || it.confirmedAt || it.createdAt || null;
      }

      uniq.sort((a,b)=> toMillis(b.updatedAt) - toMillis(a.updatedAt));
      renderMyParticipation(uniq);
    }, (err) => {
      console.warn(err);
      myPartListEl.innerHTML = `<div class="cabinet-small-muted" style="color:#ef4444;">Не вдалося завантажити участь.</div>`;
      if (myPartMsgEl) myPartMsgEl.textContent = "";
    });
  }

  function subscribeTeam(db, teamId){
    if (!teamId){
      if (teamNameEl) teamNameEl.textContent = "Без команди";
      if (joinCodePillEl) joinCodePillEl.style.display = "none";
      renderMembers([]);
      return;
    }

    unsubTeam = db.collection("teams").doc(teamId).onSnapshot((snap) => {
      if (!snap.exists) return;
      const t = snap.data() || {};
      if (teamNameEl) teamNameEl.textContent = t.name || "Команда";

      if (t.joinCode && joinCodePillEl && joinCodeTextEl){
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = t.joinCode;
      } else if (joinCodePillEl){
        joinCodePillEl.style.display = "none";
      }
    });

    unsubMembers = db.collection("users")
      .where("teamId","==",teamId)
      .onSnapshot((qs) => {
        const list = [];
        qs.forEach(d => list.push({ id:d.id, ...(d.data()||{}) }));
        renderMembers(list);
      }, (err) => {
        console.warn(err);
        if (membersEl) membersEl.innerHTML = `<div class="form__hint">Не вдалося завантажити склад команди.</div>`;
      });
  }

  function subscribeUser(auth, db, uid){
    unsubUser = db.collection("users").doc(uid).onSnapshot((snap) => {
      if (!snap.exists){
        setStatus("Анкета користувача не знайдена. Перейди в «Увійти» і зареєструй акаунт заново.");
        showContent();
        return;
      }

      const u = snap.data() || {};
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
      setTimeout(() => {
        if (statusEl && statusEl.textContent === "Кабінет завантажено.") statusEl.textContent = "";
      }, 1200);
    }, (err) => {
      console.error(err);
      setStatus("Помилка читання профілю. Перевір правила доступу Firestore.");
      showContent();
    });
  }

  // =========================
  // CLOUDINARY WIDGET SETUP
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
      
      if (!user) {
        setMsg("Увійдіть у акаунт", "err");
        return;
      }

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
              window: "#0f172a",
              sourceBg: "#1e293b",
              windowBorder: "#facc15",
              tabIcon: "#facc15",
              inactiveTabIcon: "#94a3b8",
              menuIcons: "#facc15",
              link: "#facc15",
              action: "#facc15",
              inProgress: "#f97316",
              complete: "#22c55e",
              error: "#ef4444",
              textDark: "#020617",
              textLight: "#e2e8f0"
            }
          }
        },
        async (error, result) => {
          if (error) {
            console.error(error);
            setMsg("Помилка завантаження", "err");
            return;
          }

          if (result.event === "success") {
            const url = result.info.secure_url;

            try {
              setMsg("Зберігаю…");

              await db.collection("users")
                .doc(user.uid)
                .set({ avatarUrl: url }, { merge: true });

              setAvatarUrl(url);
              setMsg("Аватар оновлено!", "ok");

              setTimeout(() => setMsg("", ""), 3000);

            } catch (err) {
              console.error(err);
              setMsg("Помилка збереження", "err");
            }
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
      const db   = window.scDb;

      auth.onAuthStateChanged((user) => {
        cleanup();

        if (!user){
          setStatus("Ви не увійшли. Переходимо на сторінку входу…");
          hideContent();
          setTimeout(() => window.location.href = "auth.html", 400);
          return;
        }

        if (user.uid === ADMIN_UID){
          setStatus("Адмін-акаунт → перехід в адмінку…");
          hideContent();
          setTimeout(() => window.location.href = "admin.html", 200);
          return;
        }

        setStatus("Перевірка доступу до кабінету…");
        showContent();
        subscribeUser(auth, db, user.uid);
      });

      // Налаштовуємо Cloudinary Widget
      setupCloudinaryWidget(auth, db);

    } catch (err) {
      console.error(err);
      setStatus("Помилка ініціалізації кабінету: " + (err?.message || err));
      showContent();
    }
  })();
})();
