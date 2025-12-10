// assets/js/cabinet.js
// Працює з канонічною схемою Firestore (users + teams)

(function () {
  // Елементи
  const statusEl        = document.getElementById("cabinetStatus");
  const cardProfile     = document.getElementById("cabinetProfileCard");
  const cardStats       = document.getElementById("cabinetStatsCard");

  const teamNameText    = document.getElementById("teamNameText");
  const captainText     = document.getElementById("captainText");
  const userRoleText    = document.getElementById("userRoleText");
  const userPhoneText   = document.getElementById("userPhoneText");
  const joinCodePill    = document.getElementById("joinCodePill");
  const joinCodeText    = document.getElementById("joinCodeText");

  const avatarImg       = document.getElementById("cabinetAvatarImg");
  const avatarPh        = document.getElementById("cabinetAvatarPlaceholder");
  const avatarFileInput = document.getElementById("avatarFile");
  const avatarBtn       = document.getElementById("avatarUploadBtn");
  const avatarMsg       = document.getElementById("avatarMsg");

  const membersContainer = document.getElementById("membersContainer");
  const statsWrapper     = document.getElementById("statsWrapper");

  // Перекладаємо role -> текст
  function roleLabel(role) {
    switch (role) {
      case "admin":   return "Адмін";
      case "judge":   return "Суддя";
      case "captain": return "Капітан команди";
      case "member":  return "Учасник команди";
      default:        return "Користувач";
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function showError(text) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = "#f97316";
    }
  }

  // ---------- Головне завантаження ----------
  async function loadCabinetForUser(user) {
    try {
      setStatus("Завантаження профілю…");

      // 1. Читаємо користувача
      const userRef = db.collection("users").doc(user.uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        showError("Профіль користувача не знайдено. Завершіть реєстрацію акаунта у формі DK PRIME.");
        return;
      }

      const u = userSnap.data();

      // 2. Заповнюємо верхню картку
      const fullName = u.fullName || user.email || "Без імені";
      const phone    = u.phone || "—";
      const role     = u.role || "member";
      const city     = u.city || "";

      if (teamNameText) teamNameText.textContent = u.teamName || "Команда…";
      if (captainText)  captainText.textContent  = (role === "captain"
        ? `Капітан: ${fullName}`
        : `Учасник: ${fullName}`);

      if (userRoleText)  userRoleText.textContent  = roleLabel(role);
      if (userPhoneText) userPhoneText.textContent = phone;

      // 3. Читаємо команду, якщо є teamId
      let teamId = u.teamId || null;
      if (teamId) {
        const teamSnap = await db.collection("teams").doc(teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data();
          if (teamNameText) teamNameText.textContent = t.name || "Команда без назви";
          if (joinCodeText && t.joinCode) {
            joinCodeText.textContent = t.joinCode;
            if (joinCodePill) joinCodePill.style.display = "inline-flex";
          }
        }
      }

      // 4. Аватар
      const avatarUrl = u.avatarUrl || null;
      if (avatarUrl) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
        if (avatarPh) avatarPh.style.display = "none";
      } else {
        if (avatarImg) avatarImg.style.display = "none";
        if (avatarPh) avatarPh.style.display = "flex";
      }

      // 5. Учасники команди (список)
      if (membersContainer) {
        membersContainer.innerHTML = "";

        if (!teamId) {
          membersContainer.innerHTML =
            '<div class="cabinet-small-muted">Команда ще не привʼязана до акаунта.</div>';
        } else {
          const membersSnap = await db.collection("users")
            .where("teamId", "==", teamId)
            .orderBy("createdAt", "asc")
            .get();

          if (membersSnap.empty) {
            membersContainer.innerHTML =
              '<div class="cabinet-small-muted">Поки що в команді немає інших учасників.</div>';
          } else {
            membersSnap.forEach(doc => {
              const m = doc.data();
              const div = document.createElement("div");
              div.className = "member-row";
              div.innerHTML = `
                <div class="member-avatar"></div>
                <div class="member-meta">
                  <div class="member-name">${m.fullName || m.email || "Без імені"}</div>
                  <div class="member-role">${roleLabel(m.role || "member")}</div>
                </div>
              `;
              membersContainer.appendChild(div);
            });
          }
        }
      }

      // 6. Статистика (поки дуже проста заглушка, але читає з users.seasonStats якщо є)
      if (statsWrapper) {
        statsWrapper.innerHTML = "";

        const stats = u.seasonStats || {};
        const totalWeight = stats.totalWeightKg ?? "—";
        const bigFishKg   = stats.bigFishKg ?? "—";
        const rank        = stats.rank ?? "—";

        statsWrapper.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Загальний улов за сезон</div>
              <div class="stat-value">${totalWeight}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Найбільша риба (Big Fish)</div>
              <div class="stat-value">${bigFishKg}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Місце у сезонному рейтингу</div>
              <div class="stat-value">${rank}</div>
            </div>
          </div>
          <p class="cabinet-small-muted">
            Детальна статистика буде підтягуватись автоматично з DK PRIME після налаштування.
          </p>
        `;
      }

      if (cardProfile) cardProfile.style.display = "block";
      if (cardStats) cardStats.style.display = "block";
      setStatus(""); // прибираємо «Перевірка доступу…»

    } catch (err) {
      console.error(err);
      showError(err.message || "Помилка завантаження кабінету.");
    }
  }

  // ---------- Аватар ----------
  async function uploadAvatar(user, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError("Оберіть файл зображення.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("Файл завеликий (макс. 5 МБ).");
      return;
    }

    try {
      setStatus("Завантаження аватару…");

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `avatars/${user.uid}/avatar.${ext}`;
      const ref = storage.ref().child(path);

      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();

      await db.collection("users").doc(user.uid).update({
        avatarUrl: url
      });

      avatarImg.src = url;
      avatarImg.style.display = "block";
      if (avatarPh) avatarPh.style.display = "none";

      if (avatarMsg) avatarMsg.textContent = "Аватар оновлено!";
      setStatus("");
    } catch (err) {
      console.error(err);
      showError("Не вдалося завантажити аватар.");
    }
  }

  // ---------- Старт: перевіряємо auth ----------
  auth.onAuthStateChanged((user) => {
    if (!user) {
      // якщо не залогінений – просто пишемо текст; вхід через кнопку "Увійти" на головній
      showError("Щоб побачити кабінет, увійдіть у систему через кнопку «Увійти» на головній сторінці.");
      if (cardProfile) cardProfile.style.display = "none";
      if (cardStats) cardStats.style.display = "none";
      return;
    }
    loadCabinetForUser(user);
  });

  // ---------- Лістенер на інпут аватару ----------
  if (avatarFileInput && avatarBtn) {
    avatarBtn.addEventListener("click", () => {
      const user = auth.currentUser;
      if (!user) {
        showError("Щоб змінити аватар, увійдіть у акаунт.");
        return;
      }
      const file = avatarFileInput.files[0];
      if (!file) {
        showError("Оберіть файл із зображенням.");
        return;
      }
      uploadAvatar(user, file);
    });
  }
})();
