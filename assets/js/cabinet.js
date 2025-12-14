// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника (Firebase compat 10.12.2)
// Працює з firebase-init.js (window.scAuth, window.scDb, window.scStorage)

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований. Підключи firebase-*-compat.js та assets/js/firebase-init.js");
    return;
  }

  const statusEl      = document.getElementById("cabinetStatus");
  const contentEl     = document.getElementById("cabinetContent");

  const teamNameEl    = document.getElementById("teamNameText");
  const captainTextEl = document.getElementById("captainText");
  const userRoleEl    = document.getElementById("userRoleText");
  const userPhoneEl   = document.getElementById("userPhoneText");

  const joinCodePillEl= document.getElementById("joinCodePill");
  const joinCodeTextEl= document.getElementById("joinCodeText");

  const avatarImgEl   = document.getElementById("cabinetAvatarImg");
  const avatarPhEl    = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl = document.getElementById("avatarFile");
  const avatarBtnEl   = document.getElementById("avatarUploadBtn");
  const avatarMsgEl   = document.getElementById("avatarMsg");

  const membersEl     = document.getElementById("membersContainer");

  let unsubUser = null;
  let unsubTeam = null;
  let unsubMembers = null;

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
    unsubUser = unsubTeam = unsubMembers = null;
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

  function subscribeTeam(teamId){
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

    // ✅ склад команди = users where teamId == teamId (працює швидко і стабільно)
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

  function subscribeUser(uid){
    unsubUser = db.collection("users").doc(uid).onSnapshot((snap) => {
      if (!snap.exists){
        setStatus("Анкета користувача не знайдена. Зайди в auth.html і зареєструйся заново.");
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
      subscribeTeam(u.teamId || null);

      setStatus("Кабінет завантажено.");
      showContent();

      setTimeout(() => { if (statusEl && statusEl.textContent === "Кабінет завантажено.") statusEl.textContent = ""; }, 1200);
    }, (err) => {
      console.error(err);
      setStatus("Помилка читання профілю. Перевір правила доступу Firestore.");
      showContent();
    });
  }

  auth.onAuthStateChanged((user) => {
    cleanup();

    if (!user){
      setStatus("Ви не увійшли. Переходимо на сторінку входу…");
      hideContent();
      setTimeout(() => window.location.href = "auth.html", 400);
      return;
    }

    setStatus("Перевірка доступу до кабінету…");
    showContent();
    subscribeUser(user.uid);
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
})();
