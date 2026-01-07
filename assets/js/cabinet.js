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
  const avatarMsgEl    = document.getElementById("avatarMsg"); // (у тебе в HTML є cabinetMsg, але це не ламає нічого)

  const membersEl      = document.getElementById("membersContainer");

  // ✅ МОЯ УЧАСТЬ
  const myCompEl = document.getElementById("myCompetitions");

  let unsubUser = null;
  let unsubTeam = null;
  let unsubMembers = null;
  let unsubParticipation = null;

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
    if (typeof unsubParticipation === "function") unsubParticipation();
    unsubUser = unsubTeam = unsubMembers = unsubParticipation = null;
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

  // ✅ МОЯ УЧАСТЬ: registrations де teamId == teamId
  function renderParticipation(list, teamId){
    if (!myCompEl) return;

    if (!list || list.length === 0){
      myCompEl.innerHTML = `<div class="cabinet-small-muted">Ваша команда ще не подала заявок на змагання.</div>`;
      return;
    }

    const rows = list.map((r) => {
      const compId = r.competitionId || r.activeCompetitionId || r.activeCompetition || r.competition || "competition";
      const stageId = r.stageId || r.activeStageId || "main";
      const status = String(r.status || "").toLowerCase();

      const paid = (status === "confirmed" || status === "paid" || status === "payment_confirmed");
      const lamp = paid ? "🟢" : "🔴";
      const statusText = paid ? "Оплачено" : (r.status || "Очікує оплату");

      const title = `${compId} • ${stageId}`;
      const href = `participation.html?competitionId=${encodeURIComponent(compId)}&stageId=${encodeURIComponent(stageId)}&teamId=${encodeURIComponent(teamId||"")}`;

      return `
        <a href="${href}" class="card" style="display:block; padding:12px; margin-top:10px; text-decoration:none; color:inherit;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="font-weight:900; letter-spacing:.02em;">${escapeHtml(title)}</div>
            <div style="display:flex; align-items:center; gap:8px; font-weight:800;">
              <span>${lamp}</span>
              <span style="opacity:.85;">${escapeHtml(statusText)}</span>
            </div>
          </div>
          <div class="cabinet-small-muted" style="margin-top:6px;">
            Натисни, щоб переглянути список команд та статуси оплат.
          </div>
        </a>
      `;
    }).join("");

    myCompEl.innerHTML = rows;
  }

  function subscribeParticipation(db, teamId){
    if (!myCompEl) return;

    if (!teamId){
      myCompEl.innerHTML = `<div class="cabinet-small-muted">Нема teamId — спочатку приєднайся/створи команду.</div>`;
      return;
    }

    if (typeof unsubParticipation === "function") { unsubParticipation(); unsubParticipation = null; }

    myCompEl.innerHTML = `<div class="cabinet-small-muted">Завантаження участі…</div>`;

    unsubParticipation = db.collection("registrations")
      .where("teamId","==",teamId)
      .onSnapshot((qs) => {
        const list = [];
        qs.forEach(d => list.push({ id:d.id, ...(d.data()||{}) }));

        // без orderBy (щоб не впиратись в індекси) — сортуємо клієнтом
        list.sort((a,b) => {
          const ta = (a.confirmedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0);
          const tb = (b.confirmedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0);
          return tb - ta;
        });

        renderParticipation(list, teamId);
      }, (err) => {
        console.warn(err);
        myCompEl.innerHTML = `<div class="cabinet-small-muted">Не вдалося завантажити участь. Перевір правила доступу Firestore.</div>`;
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

      // ✅ МОЯ УЧАСТЬ
      subscribeParticipation(db, u.teamId || null);

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
