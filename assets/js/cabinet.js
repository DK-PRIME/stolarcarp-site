// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP.
// Мінімум запитів: 1 doc users/{uid}, 1 doc teams/{teamId}, 1 query по teamId для складу.

(function () {
  const auth    = window.scAuth || window.auth;
  const db      = window.scDb   || window.db;
  const storage = window.scStorage || window.storage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований. Перевір firebase-init.js та підключення скриптів.");
    return;
  }

  // Загальний стан
  const statusEl      = document.getElementById("cabinetStatus");
  const contentEl     = document.getElementById("cabinetContent");
  const cabinetMsgEl  = document.getElementById("cabinetMsg");

  // Профіль
  const teamNameEl      = document.getElementById("teamNameText");
  const captainTextEl   = document.getElementById("captainText");
  const userRoleTextEl  = document.getElementById("userRoleText");
  const userPhoneTextEl = document.getElementById("userPhoneText");
  const joinCodePillEl  = document.getElementById("joinCodePill");
  const joinCodeTextEl  = document.getElementById("joinCodeText");

  // Аватар
  const avatarImgEl         = document.getElementById("cabinetAvatarImg");
  const avatarPlaceholderEl = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl       = document.getElementById("avatarFile");
  const avatarBtnEl         = document.getElementById("avatarUploadBtn");

  // Учасники
  const membersContainerEl = document.getElementById("membersContainer");

  // Статистика
  const statTotalWeightEl = document.getElementById("statTotalWeight");
  const statBigFishEl     = document.getElementById("statBigFish");
  const statRankEl        = document.getElementById("statRank");

  // ------------- Хелпери UI -------------
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function showContent(show) {
    if (!contentEl) return;
    contentEl.style.display = show ? "grid" : "none";
  }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  function renderMembersSkeleton() {
    if (!membersContainerEl) return;
    membersContainerEl.innerHTML =
      '<div class="cabinet-small-muted">Завантаження складу команди…</div>';
  }

  async function loadMembersByTeam(teamId, currentUid) {
    if (!membersContainerEl || !teamId) return;

    try {
      const snap = await db.collection("users")
        .where("teamId", "==", teamId)
        .orderBy("fullName")
        .get();

      if (snap.empty) {
        membersContainerEl.innerHTML =
          '<div class="cabinet-small-muted">Поки що в команді тільки ви.</div>';
        return;
      }

      membersContainerEl.innerHTML = "";

      snap.forEach(doc => {
        const m = doc.data();
        const name = m.fullName || m.name || "Без імені";
        const roleKey = m.role || "member";

        const roleText =
          roleKey === "admin"   ? "Адміністратор" :
          roleKey === "judge"   ? "Суддя" :
          roleKey === "captain" ? "Капітан" :
                                  "Учасник";

        const youBadge = (doc.id === currentUid)
          ? ' · <span style="color:#22c55e;">(це ви)</span>'
          : '';

        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = `
          <div class="member-meta">
            <div class="member-name">${name}${youBadge}</div>
            <div class="member-role">${roleText}</div>
          </div>
        `;
        membersContainerEl.appendChild(row);
      });

    } catch (e) {
      console.error("Помилка завантаження складу команди:", e);
      membersContainerEl.innerHTML =
        '<div class="cabinet-small-muted">Не вдалося завантажити склад команди.</div>';
    }
  }

  // ------------- Завантаження кабінету -------------
  async function loadCabinet(user) {
    try {
      setStatus("Завантаження профілю…");
      showContent(false);

      // 1. Документ користувача
      const userSnap = await db.collection("users").doc(user.uid).get();
      if (!userSnap.exists) {
        setStatus("Анкета користувача не знайдена. Завершіть реєстрацію на сторінці входу.");
        showContent(false);
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

      // 2. Команда (один doc по teamId)
      let teamName = "Індивідуальна участь";
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

      // --- Записуємо в DOM (без довгих очікувань) ---
      if (teamNameEl)    teamNameEl.textContent    = teamName;
      if (captainTextEl) captainTextEl.textContent = fullName + (city ? ` · ${city}` : "");
      if (userRoleTextEl)  userRoleTextEl.textContent  = roleText;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      if (joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent   = joinCode;
      }

      if (u.avatarUrl) {
        setAvatarUrl(u.avatarUrl);
      }

      // 3. Статистика (якщо є)
      const stats = u.seasonStats || {};
      if (statTotalWeightEl) statTotalWeightEl.textContent = stats.totalWeightKg ?? "—";
      if (statBigFishEl)     statBigFishEl.textContent     = stats.bigFishKg    ?? "—";
      if (statRankEl)        statRankEl.textContent        = stats.rank         ?? "—";

      // Показуємо контент, профіль вже є
      showContent(true);
      setStatus("Кабінет завантажено.");

      // 4. Склад команди — окремим запитом, вже після відображення
      if (u.teamId) {
        renderMembersSkeleton();
        loadMembersByTeam(u.teamId, user.uid);
      } else if (membersContainerEl) {
        membersContainerEl.innerHTML =
          '<div class="cabinet-small-muted">Індивідуальна участь, без команди.</div>';
      }

    } catch (err) {
      console.error("Помилка завантаження кабінету:", err);
      setStatus("Помилка завантаження кабінету: " + (err.message || err));
      showContent(false);
    }
  }

  // ------------- Авторизація -------------
  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Для перегляду кабінету увійдіть у акаунт STOLAR CARP.");
      showContent(false);
      return;
    }
    loadCabinet(user);
  });

  // ------------- Завантаження аватара -------------
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
        if (cabinetMsgEl) cabinetMsgEl.textContent = "Завантаження аватара…";

        const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;
        const snap = await storage.ref().child(path).put(file);
        const url  = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).update({ avatarUrl: url });
        setAvatarUrl(url);

        if (cabinetMsgEl) cabinetMsgEl.textContent = "Аватар оновлено!";
      } catch (err) {
        console.error("Помилка завантаження аватара:", err);
        if (cabinetMsgEl) cabinetMsgEl.textContent = "Помилка завантаження аватара.";
      }
    });
  }
})();
