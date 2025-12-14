// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP (compat)

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований.");
    return;
  }

  const statusEl    = document.getElementById("cabinetStatus");
  const wrapperEl   = document.getElementById("cabinetWrapper");

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

  const membersContainerEl  = document.getElementById("membersContainer");
  const statsWrapperEl      = document.getElementById("statsWrapper");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }
  function showWrapper() {
    if (wrapperEl) wrapperEl.style.display = "block";
  }
  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  function roleLabel(role) {
    return role === "admin"   ? "Адміністратор" :
           role === "judge"   ? "Суддя" :
           role === "captain" ? "Капітан команди" :
                                "Учасник команди";
  }

  async function loadCabinet(user) {
    try {
      setStatus("Завантаження профілю…");

      // 1) users/{uid}
      const userSnap = await db.collection("users").doc(user.uid).get();

      if (!userSnap.exists) {
        setStatus("Анкета користувача не знайдена. Поверніться на сторінку входу та завершіть реєстрацію.");
        showWrapper();
        return;
      }

      const u = userSnap.data() || {};
      const fullName = u.fullName || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city || "";
      const roleText = roleLabel(u.role);

      if (captainTextEl)   captainTextEl.textContent   = fullName + (city ? ` · ${city}` : "");
      if (userRoleTextEl)  userRoleTextEl.textContent  = roleText;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      if (u.avatarUrl) setAvatarUrl(u.avatarUrl);

      // 2) teams/{teamId}
      let teamName = "—";
      let joinCode = "";

      if (u.teamId) {
        const teamSnap = await db.collection("teams").doc(u.teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data() || {};
          teamName = t.name || "—";
          joinCode = t.joinCode || "";
        }
      }

      if (teamNameEl) teamNameEl.textContent = teamName;

      if (joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = joinCode;
      } else if (joinCodePillEl) {
        joinCodePillEl.style.display = "none";
      }

      // 3) Склад команди — з твоїми Rules це НЕ МОЖНА витягнути з /users
      if (membersContainerEl) {
        membersContainerEl.innerHTML = `
          <div class="notice">
            <b>Склад команди:</b> наразі прихований правилами доступу (Firestore Rules).
            Учасник може читати тільки свій профіль. Якщо хочеш — я зроблю окрему безпечну схему
            “teamMembers” або підправимо Rules так, щоб команда бачила своїх.
          </div>
        `;
      }

      // 4) Статистика (якщо колись додаси)
      if (statsWrapperEl) {
        const stats = u.seasonStats || {};
        const total = (stats.totalWeightKg ?? "—");
        const big   = (stats.bigFishKg ?? "—");
        const rank  = (stats.rank ?? "—");

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

      setStatus("Кабінет завантажено.");
      showWrapper();

    } catch (err) {
      console.error(err);
      setStatus("Помилка завантаження кабінету: " + (err?.message || err));
      showWrapper();
    }
  }

  // auth guard
  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Ви не увійшли. Перехід на сторінку входу…");
      setTimeout(() => window.location.href = "auth.html", 400);
      return;
    }
    loadCabinet(user);
  });

  // avatar upload
  if (avatarBtnEl && avatarInputEl) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();
      const user = auth.currentUser;
      if (!user) return alert("Спочатку увійдіть у акаунт.");

      const file = avatarInputEl.files[0];
      if (!file) return alert("Оберіть файл.");
      if (!file.type.startsWith("image/")) return alert("Потрібен файл-зображення.");
      if (file.size > 5 * 1024 * 1024) return alert("Максимальний розмір 5 МБ.");

      try {
        if (avatarMsgEl) avatarMsgEl.textContent = "Завантаження…";

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;

        const snap = await storage.ref().child(path).put(file);
        const url  = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).set({ avatarUrl: url }, { merge: true });
        setAvatarUrl(url);

        if (avatarMsgEl) avatarMsgEl.textContent = "Аватар оновлено!";
      } catch (err) {
        console.error(err);
        if (avatarMsgEl) avatarMsgEl.textContent = "Помилка завантаження.";
      }
    });
  }
})();
