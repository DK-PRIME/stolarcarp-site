// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP (під верстку cabinet.html)

(function () {
  const auth    = window.scAuth    || window.auth;
  const db      = window.scDb      || window.db;
  const storage = window.scStorage || window.storage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований. Перевір firebase-init.js.");
    return;
  }

  // --- елементи DOM ---
  const statusEl   = document.getElementById("cabinetStatus");
  const contentEl  = document.getElementById("cabinetContent");

  const teamNameEl     = document.getElementById("teamNameText");
  const captainEl      = document.getElementById("captainText");
  const roleEl         = document.getElementById("userRoleText");
  const phoneEl        = document.getElementById("userPhoneText");
  const joinCodePillEl = document.getElementById("joinCodePill");
  const joinCodeTextEl = document.getElementById("joinCodeText");

  const avatarImgEl         = document.getElementById("cabinetAvatarImg");
  const avatarPlaceholderEl = document.getElementById("cabinetAvatarPlaceholder");
  const avatarFileEl        = document.getElementById("avatarFile");
  const avatarUploadBtnEl   = document.getElementById("avatarUploadBtn");
  const cabinetMsgEl        = document.getElementById("cabinetMsg");

  const membersContainerEl  = document.getElementById("membersContainer");

  const statTotalWeightEl = document.getElementById("statTotalWeight");
  const statBigFishEl     = document.getElementById("statBigFish");
  const statRankEl        = document.getElementById("statRank");

  function setStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
      type === "err" ? "#f97373" :
      type === "ok"  ? "#4ade80" : "#9ca3af";
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

  // --- основне завантаження кабінету ---
  async function loadCabinet(user) {
    try {
      setStatus("Завантаження профілю…", null);
      showContent(false);

      // 1) читаємо users/{uid}
      const userSnap = await db.collection("users").doc(user.uid).get();
      if (!userSnap.exists) {
        setStatus(
          "Анкету користувача не знайдено. Завершіть реєстрацію на сторінці «Реєстрація».",
          "err"
        );
        return;
      }

      const u = userSnap.data();

      const fullName = u.fullName || u.name || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city ? ` (${u.city})` : "";
      const roleKey  = u.role || "member";

      const roleText =
        roleKey === "admin"   ? "Адміністратор" :
        roleKey === "judge"   ? "Суддя" :
        roleKey === "captain" ? "Капітан команди" :
                                "Учасник команди";

      // 2) команда
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

      // 3) підставляємо в DOM
      if (teamNameEl) teamNameEl.textContent = teamName;
      if (captainEl)  captainEl.textContent  = fullName + city;
      if (roleEl)     roleEl.textContent     = roleText;
      if (phoneEl)    phoneEl.textContent    = phone;

      if (joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent   = joinCode;
      }

      if (avatarImgEl && avatarPlaceholderEl && u.avatarUrl) {
        setAvatarUrl(u.avatarUrl);
      }

      // 4) склад команди (мінімум — поточний користувач)
      if (membersContainerEl) {
        membersContainerEl.innerHTML = "";
        try {
          let snaps;
          if (u.teamId) {
            // пока що ця вибірка все одно поверне максимум самого користувача по rules
            snaps = await db.collection("users")
              .where("teamId", "==", u.teamId)
              .get();
          } else {
            snaps = { empty:false, docs:[userSnap] };
          }

          if (snaps.empty) {
            const div = document.createElement("div");
            div.className = "cabinet-small-muted";
            div.textContent = "Учасників не знайдено.";
            membersContainerEl.appendChild(div);
          } else {
            snaps.docs.forEach(doc => {
              const m = doc.data();
              const name = m.fullName || m.name || "Без імені";
              const rKey = m.role || "member";
              const rText =
                rKey === "captain" ? "Капітан" :
                rKey === "admin"   ? "Адмін" :
                rKey === "judge"   ? "Суддя" : "Учасник";

              const row = document.createElement("div");
              row.className = "member-row";
              row.innerHTML = `
                <div class="member-meta">
                  <div class="member-name">${name}</div>
                  <div class="member-role">${rText}</div>
                </div>
              `;
              membersContainerEl.appendChild(row);
            });
          }
        } catch (e) {
          console.warn("Помилка завантаження складу команди:", e);
          const div = document.createElement("div");
          div.className = "cabinet-small-muted";
          div.textContent = "Не вдалося завантажити список учасників.";
          membersContainerEl.appendChild(div);
        }
      }

      // 5) статистика (якщо ти потім запишеш у users.seasonStats)
      const stats = u.seasonStats || {};
      if (statTotalWeightEl) statTotalWeightEl.textContent = stats.totalWeightKg ?? "—";
      if (statBigFishEl)     statBigFishEl.textContent     = stats.bigFishKg    ?? "—";
      if (statRankEl)        statRankEl.textContent        = stats.rank         ?? "—";

      setStatus("Кабінет завантажено.", "ok");
      showContent(true);

    } catch (err) {
      console.error("Помилка завантаження кабінету:", err);
      setStatus("Помилка завантаження кабінету: " + (err.message || err), "err");
      showContent(false);
    }
  }

  // --- завантаження аватара ---
  if (avatarUploadBtnEl && avatarFileEl && storage) {
    avatarUploadBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();
      const user = auth.currentUser;
      if (!user) {
        alert("Спочатку увійдіть у акаунт.");
        return;
      }
      const file = avatarFileEl.files[0];
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
        if (cabinetMsgEl) {
          cabinetMsgEl.textContent = "Завантаження аватара…";
          cabinetMsgEl.className = "";
        }

        const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;
        const snap = await storage.ref().child(path).put(file);
        const url  = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).update({ avatarUrl: url });
        setAvatarUrl(url);

        if (cabinetMsgEl) {
          cabinetMsgEl.textContent = "Аватар оновлено!";
          cabinetMsgEl.className   = "ok";
        }
      } catch (err) {
        console.error(err);
        if (cabinetMsgEl) {
          cabinetMsgEl.textContent = "Помилка завантаження аватара.";
          cabinetMsgEl.className   = "err";
        }
      }
    });
  }

  // --- слухач авторизації ---
  auth.onAuthStateChanged((user) => {
    if (!statusEl) return;

    if (!user) {
      setStatus(
        "Щоб відкрити кабінет, увійдіть або створіть акаунт на сторінці «Реєстрація».",
        null
      );
      showContent(false);
      return;
    }

    loadCabinet(user);
  });
})();
