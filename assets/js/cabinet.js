// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP — читає users + teams + аватар

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований (cabinet.js)");
    return;
  }

  const guestBlock      = document.getElementById("cabinet-guest");
  const userBlock       = document.getElementById("cabinet-user");
  const profileSubtitle = document.getElementById("profileSubtitle");

  const teamNameEl      = document.getElementById("teamNameText");
  const captainTextEl   = document.getElementById("captainText");
  const userRoleTextEl  = document.getElementById("userRoleText");
  const userPhoneTextEl = document.getElementById("userPhoneText");
  const joinCodePillEl  = document.getElementById("joinCodePill");
  const joinCodeTextEl  = document.getElementById("joinCodeText");

  const avatarImgEl         = document.getElementById("cabinetAvatarImg");
  const avatarPlaceholderEl = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl       = document.getElementById("avatarFile");
  const avatarBtnEl         = document.getElementById("avatarUploadBtn");
  const avatarMsgEl         = document.getElementById("avatarMsg");

  const membersContainerEl = document.getElementById("membersContainer");
  const statsWrapperEl     = document.getElementById("statsWrapper");

  const loginBtn = document.getElementById("cabinetLoginBtn");

  // кнопка "Увійти / Зареєструватися" веде на auth.html
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = "auth.html";
    });
  }

  function showGuest(message) {
    if (guestBlock) guestBlock.style.display = "block";
    if (userBlock)  userBlock.style.display = "none";
    if (profileSubtitle && message) {
      profileSubtitle.textContent = message;
    }
  }

  function showUser() {
    if (guestBlock) guestBlock.style.display = "none";
    if (userBlock)  userBlock.style.display = "block";
  }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  // ----- основне завантаження профілю -----
  async function loadCabinet(user) {
    try {
      if (profileSubtitle) profileSubtitle.textContent = "Завантаження профілю…";

      // 1. user doc
      const userSnap = await db.collection("users").doc(user.uid).get();
      if (!userSnap.exists) {
        showGuest("Анкета користувача не знайдена. Завершіть реєстрацію на сторінці входу.");
        return;
      }

      const u = userSnap.data();

      const fullName = u.fullName || u.name || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city || "";

      const roleText =
        u.role === "admin"   ? "Адміністратор" :
        u.role === "judge"   ? "Суддя" :
        u.role === "captain" ? "Капітан команди" :
                               "Учасник команди";

      if (captainTextEl)   captainTextEl.textContent   = fullName + (city ? ` · ${city}` : "");
      if (userRoleTextEl)  userRoleTextEl.textContent  = roleText;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      // аватар
      if (u.avatarUrl) {
        setAvatarUrl(u.avatarUrl);
      } else if (avatarImgEl && avatarPlaceholderEl) {
        avatarImgEl.style.display = "none";
        avatarPlaceholderEl.style.display = "flex";
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
        joinCodeTextEl.textContent = joinCode;
      }

      // 3. список учасників (поки що показуємо тільки поточного)
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
        const big   = stats.bigFishKg ?? "—";
        const rank  = stats.rank ?? "—";

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

      if (profileSubtitle) profileSubtitle.textContent = "Профіль завантажено.";
      showUser();

    } catch (err) {
      console.error(err);
      showGuest("Помилка завантаження кабінету: " + (err.message || err));
    }
  }

  // ----- слухач авторизації -----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      showGuest("Щоб побачити кабінет, увійдіть у систему.");
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

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
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
