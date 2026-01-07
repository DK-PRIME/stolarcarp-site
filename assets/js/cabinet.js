// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника (Firebase compat 10.12.2)
// Працює з firebase-init.js (window.scAuth, window.scDb, window.scStorage)

(function () {
  "use strict";

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
  const avatarInputEl  = document.getElementById("avatarFile");
  const avatarBtnEl    = document.getElementById("avatarUploadBtn");
  const avatarMsgEl    = document.getElementById("avatarMsg");

  const membersEl      = document.getElementById("membersContainer");

  // ✅ МОЯ УЧАСТЬ (якщо ці блоки існують у cabinet.html)
  const myPartListEl   = document.getElementById("myParticipationList");
  const myPartMsgEl    = document.getElementById("myParticipationMsg");

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
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
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
      const row = document.createElement("div");
      row.className = "card";
      row.style.padding = "12px";
      row.style.marginTop = "10px";
      row.innerHTML = `
        <div style="font-weight:800">${escapeHtml(name)}</div>
        <div class="form__hint">${escapeHtml(role)}</div>
      `;
      membersEl.appendChild(row);
    });
  }

  // ===== МОЯ УЧАСТЬ =====
  function isPaidStatus(status){
    const s = String(status || "").trim().toLowerCase();
    return s === "confirmed" || s === "paid";
  }

  function renderMyParticipation(regs){
    if (!myPartListEl) return; // ✅ якщо блоку нема — нічого не робимо

    myPartListEl.innerHTML = "";

    if (!regs || regs.length === 0){
      myPartListEl.innerHTML = `<div class="form__hint">Команда ще не подавала заявки на змагання.</div>`;
      if (myPartMsgEl) myPartMsgEl.textContent = "";
      return;
    }

    regs.forEach((r) => {
      const compId  = r.competitionId || r.competition || "";
      const stageId = r.stageId || r.activeStageId || "main";

      const title = r.competitionTitle || r.competitionName || r.eventTitle || "";
      const teamName = r.teamName || "Команда";
      const st = r.status || "—";
      const paid = isPaidStatus(st);

      const row = document.createElement("div");
      row.className = "card";
      row.style.padding = "12px";
      row.style.marginTop = "10px";

      row.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="min-width:180px">
            <div style="font-weight:900">${escapeHtml(title || "Змагання")}</div>
            <div class="form__hint">${escapeHtml(teamName)} · stage: ${escapeHtml(stageId)}</div>
            <div class="form__hint" style="display:flex;align-items:center;gap:8px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:999px;${paid ? "background:#22c55e" : "background:#ef4444"}"></span>
              <span>${paid ? "Оплачено" : "Очікує оплату"} (${escapeHtml(st)})</span>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:center">
            <a class="btn btn--primary" href="participation.html?comp=${encodeURIComponent(compId)}&stage=${encodeURIComponent(stageId)}">
              Команди
            </a>
          </div>
        </div>
      `;

      myPartListEl.appendChild(row);
    });

    if (myPartMsgEl) myPartMsgEl.textContent = "";
  }

  function subscribeMyParticipation(db, teamId, uid){
    if (typeof unsubRegs === "function") { unsubRegs(); unsubRegs = null; }

    if (!myPartListEl) return; // ✅ якщо блоку нема — не підписуємось
    if (!teamId && !uid){
      renderMyParticipation([]);
      return;
    }

    if (myPartMsgEl) myPartMsgEl.textContent = "Завантаження «Моя участь»…";

    // ✅ Показуємо всі заявки команди (або юзера як fallback)
    let q = null;
    if (teamId){
      q = db.collection("registrations").where("teamId", "==", teamId);
    } else {
      q = db.collection("registrations").where("uid", "==", uid);
    }

    unsubRegs = q.onSnapshot((qs) => {
      const regs = [];
      qs.forEach(d => regs.push({ id:d.id, ...(d.data() || {}) }));

      // ✅ прибираємо дублікати по competitionId+stageId (щоб "скільки змагань — стільки рядків")
      const map = Object.create(null);
      regs.forEach(r=>{
        const k = `${r.competitionId || r.competition || ""}||${r.stageId || "main"}`;
        if (!k || k === "||main") return;
        // якщо є кілька — залишимо той, що "кращий" (paid перемагає)
        if (!map[k]) map[k] = r;
        else {
          const a = map[k];
          const ap = isPaidStatus(a.status);
          const bp = isPaidStatus(r.status);
          if (!ap && bp) map[k] = r;
        }
      });

      const uniq = Object.values(map);

      // ✅ стабільне сортування: оплачені вгорі, далі за назвою
      uniq.sort((a,b)=>{
        const ap = isPaidStatus(a.status);
        const bp = isPaidStatus(b.status);
        if (ap !== bp) return ap ? -1 : 1;
        const at = String(a.competitionTitle || a.competitionName || a.eventTitle || a.competitionId || "");
        const bt = String(b.competitionTitle || b.competitionName || b.eventTitle || b.competitionId || "");
        return at.localeCompare(bt, "uk");
      });

      renderMyParticipation(uniq);
    }, (err)=>{
      console.warn(err);
      if (myPartMsgEl) myPartMsgEl.textContent = "Не вдалося завантажити «Моя участь».";
      if (myPartListEl) myPartListEl.innerHTML = `<div class="form__hint">Не вдалося завантажити список змагань.</div>`;
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

    // склад команди = users where teamId == teamId
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

      // ✅ МОЯ УЧАСТЬ: підписка на registrations (не ламає, якщо блоків нема)
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

  (async () => {
    try {
      await waitFirebase();
      const auth    = window.scAuth;
      const db      = window.scDb;
      const storage = window.scStorage;

      auth.onAuthStateChanged((user) => {
        cleanup();

        if (!user){
          setStatus("Ви не увійшли. Переходимо на сторінку входу…");
          hideContent();
          setTimeout(() => window.location.href = "auth.html", 400);
          return;
        }

        // ✅ Адмін не живе в кабінеті — тільки адмінка через © (або якщо відкрив cabinet випадково)
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

      // ===== avatar upload =====
      if (avatarBtnEl && avatarInputEl && storage){
        avatarBtnEl.addEventListener("click", async (e) => {
          e.preventDefault();

          const user = auth.currentUser;
          if (!user) return alert("Спочатку увійдіть у акаунт.");

          const file = avatarInputEl.files && avatarInputEl.files[0];
          if (!file) return alert("Оберіть файл.");
          if (!file.type.startsWith("image/")) return alert("Потрібен файл-зображення.");
          if (file.size > 5 * 1024 * 1024) return alert("Максимальний розмір 5 МБ.");

          try {
            if (avatarMsgEl) avatarMsgEl.textContent = "Завантаження…";

            const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
            const path = `avatars/${user.uid}/avatar.${ext}`;

            const ref = storage.ref().child(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();

            await db.collection("users").doc(user.uid).set({ avatarUrl:url }, { merge:true });

            if (avatarMsgEl) avatarMsgEl.textContent = "Аватар оновлено!";
            setTimeout(() => { if (avatarMsgEl) avatarMsgEl.textContent = ""; }, 2000);
          } catch (err){
            console.error(err);
            if (avatarMsgEl) avatarMsgEl.textContent = "Помилка завантаження аватара.";
          }
        });
      }

    } catch (err) {
      console.error(err);
      setStatus("Помилка ініціалізації кабінету: " + (err?.message || err));
      showContent();
    }
  })();
})();
