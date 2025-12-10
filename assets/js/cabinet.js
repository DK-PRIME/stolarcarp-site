// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP
// Читає users/{uid}, teams/{teamId}, аватар, статистику.

(function () {
  const auth    = window.scAuth || window.auth;
  const db      = window.scDb   || window.db;
  const storage = window.scStorage || window.storage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований. Перевір firebase-init.js та підключення скриптів.");
    return;
  }

  // Блоки Гість/Користувач
  const guestBlock = document.getElementById("cabinet-guest");
  const userBlock  = document.getElementById("cabinet-user");

  // Текстові поля профілю
  const profileSubtitleEl = document.getElementById("profileSubtitle");
  const teamNameEl        = document.getElementById("teamNameText");
  const captainTextEl     = document.getElementById("captainText");
  const userRoleTextEl    = document.getElementById("userRoleText");
  const userPhoneTextEl   = document.getElementById("userPhoneText");
  const joinCodePillEl    = document.getElementById("joinCodePill");
  const joinCodeTextEl    = document.getElementById("joinCodeText");

  // Аватар
  const avatarImgEl         = document.getElementById("cabinetAvatarImg");
  const avatarPlaceholderEl = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl       = document.getElementById("avatarFile");
  const avatarBtnEl         = document.getElementById("avatarUploadBtn");
  const avatarMsgEl         = document.getElementById("avatarMsg");

  // Учасники команди
  const membersContainerEl = document.getElementById("membersContainer");

  // Досягнення
  const statsWrapperEl     = document.getElementById("statsWrapper");

  function showGuest() {
    if (guestBlock) guestBlock.style.display = "block";
    if (userBlock)  userBlock.style.display  = "none";
  }

  function showUser() {
    if (guestBlock) guestBlock.style.display = "none";
    if (userBlock)  userBlock.style.display  = "block";
  }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  async function loadCabinet(user) {
    try {
      // 1. user doc
      const userSnap = await db.collection("users").doc(user.uid).get();
      if (!userSnap.exists) {
        if (profileSubtitleEl) {
          profileSubtitleEl.textContent =
            "Анкета користувача не знайдена. Завершіть реєстрацію на сторінці входу.";
        }
        showUser();
        return;
      }

      const u = userSnap.data();

      const fullName = u.fullName || u.name || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city || "";
      const roleKey  = u.role || "member";

      const roleText =
        roleKey === "admin"   ? "Адміністратор" :
        roleKey === "judge"   ? "Суддя" :
        roleKey === "captain" ? "Капітан команди" :
                                "Учасник команди";

      if (profileSubtitleEl) {
        profileSubtitleEl.textContent =
          `Акаунт: ${fullName}` + (city ? ` · ${city}` : "");
      }

      if (captainTextEl)   captainTextEl.textContent   = fullName + (city ? ` · ${city}` : "");
      if (userRoleTextEl)  userRoleTextEl.textContent  = roleText;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      // аватар
      if (u.avatarUrl) {
        setAvatarUrl(u.avatarUrl);
      }

      // 2. team doc
      let teamName = "Без назви";
      let joinCode = "";

      if (u.teamId) {
        try {
          const teamSnap = await db.collection("teams").doc(u.teamId).get();
          if (teamSnap.exists) {
            const t = teamSnap.data();
            teamName = t.name || t.teamName || teamName;
            joinCode = t.joinCode || "";
          }
        } catch (e) {
          console.warn("Помилка читання команди:", e);
        }
      }

      if (teamNameEl) teamNameEl.textContent = teamName;
      if (joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent   = joinCode;
      }

      // 3. список учасників (мінімум — цей користувач)
      if (membersContainerEl) {
        membersContainerEl.innerHTML = "";
        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = `
          <div class="member-avatar"></div>
          <div class="member-meta">
            <div class="member-name">${fullName}</div>
            <div class="member-role">${roleText}</div>
          </div>
        `;
        membersContainerEl.appendChild(row);
      }

      // 4. статистика (з user.seasonStats, якщо є)
      if (statsWrapperEl) {
        const stats = u.seasonStats || {};
        const total = stats.totalWeightKg ?? "—";
        const big   = stats.bigFishKg    ?? "—";
        const rank  = stats.rank         ?? "—";

        statsWrapperEl.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Улов за сезон</div>
              <div class="stat-value">${total}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Big Fish</div>
              <div class="stat-value">${big}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Місце в рейтингу</div>
              <div class="stat-value">${rank}</div>
            </div>
          </div>
        `;
      }

      showUser();

    } catch (err) {
      console.error("Помилка завантаження кабінету:", err);
      if (profileSubtitleEl) {
        profileSubtitleEl.textContent =
          "Помилка завантаження кабінету: " + (err.message || err);
      }
      showUser();
    }
  }

  // ----- слухач авторизації -----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      // якщо не залогінений — показуємо гостьовий блок
      showGuest();
      return;
    }
    loadCabinet(user);
  });

  // ----- завантаження аватара -----
  if (avatarBtnEl && avatarInputEl && storage) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();
      const user = auth.currentUser;
      if (!user) {
        alert("Спочатку увійдіть у акаунт.");
        return;
      }
      const file = avatarInputEl.files[0];
      if (!file) {
        alert("Оберіть файл.");
        return;
      }
      if (!file.type.startsWith("image/")) {
        alert("Потрібен файл-зображення.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("Максимальний розмір 5 МБ.");
        return;
      }

      try {
        if (avatarMsgEl) avatarMsgEl.textContent = "Завантаження…";

        const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;
        const snap = await storage.ref().child(path).put(file);
        const url  = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).update({ avatarUrl: url });
        setAvatarUrl(url);

        if (avatarMsgEl) avatarMsgEl.textContent = "Аватар оновлено!";
      } catch (err) {
        console.error(err);
        if (avatarMsgEl) avatarMsgEl.textContent = "Помилка завантаження.";
      }
    });
  }
})();
