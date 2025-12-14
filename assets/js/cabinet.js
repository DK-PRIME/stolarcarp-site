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

  const statusEl = document.getElementById("cabinetStatus");
  const msgEl    = document.getElementById("cabinetMsg");

  const teamNameEl      = document.getElementById("teamNameText");
  const captainEl       = document.getElementById("captainText");
  const roleEl          = document.getElementById("userRoleText");
  const phoneEl         = document.getElementById("userPhoneText");
  const joinCodeWrapEl  = document.getElementById("joinCodePill");
  const joinCodeEl      = document.getElementById("joinCodeText");

  const membersContainerEl = document.getElementById("membersContainer");
  const statsWrapperEl     = document.getElementById("statsWrapper");

  const avatarInputEl = document.getElementById("avatarFile");
  const avatarBtnEl   = document.getElementById("avatarUploadBtn");

  function setStatus(t) { if (statusEl) statusEl.textContent = t || ""; }
  function setMsg(t, type) {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = type ? ("form-msg " + type) : "";
  }

  function roleText(r) {
    if (r === "admin") return "Адміністратор";
    if (r === "judge") return "Суддя";
    if (r === "captain") return "Капітан команди";
    return "Учасник команди";
  }

  async function loadCabinet(user) {
    setMsg("", "");
    setStatus("Завантаження профілю…");

    // 1) user doc
    const userSnap = await db.collection("users").doc(user.uid).get();
    if (!userSnap.exists) {
      setStatus("");
      setMsg("Анкета користувача не знайдена. Зайдіть в 'Вхід/реєстрація' та завершіть реєстрацію.", "err");
      return;
    }

    const u = userSnap.data() || {};
    const fullName = u.fullName || user.email || "Без імені";
    const phone    = u.phone || "—";
    const city     = u.city || "";

    if (captainEl) captainEl.textContent = fullName + (city ? ` · ${city}` : "");
    if (roleEl) roleEl.textContent = roleText(u.role);
    if (phoneEl) phoneEl.textContent = phone;

    // 2) team doc
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

    if (joinCodeWrapEl && joinCodeEl) {
      if (joinCode) {
        joinCodeWrapEl.style.display = "inline-flex";
        joinCodeEl.textContent = joinCode;
      } else {
        joinCodeWrapEl.style.display = "none";
      }
    }

    // 3) members list (✅ читає users по teamId)
    if (membersContainerEl) {
      membersContainerEl.innerHTML = "";

      if (!u.teamId) {
        membersContainerEl.innerHTML = `<div class="notice">Немає привʼязки до команди (teamId).</div>`;
      } else {
        try {
          const membersSnap = await db.collection("users")
            .where("teamId", "==", u.teamId)
            .get();

          if (membersSnap.empty) {
            membersContainerEl.innerHTML = `<div class="notice">У команді ще немає учасників.</div>`;
          } else {
            membersSnap.forEach((doc) => {
              const m = doc.data() || {};
              const row = document.createElement("div");
              row.className = "member-row";
              row.innerHTML = `
                <div class="member-avatar"></div>
                <div class="member-meta">
                  <div class="member-name">${(m.fullName || m.email || "Без імені")}</div>
                  <div class="member-role">${roleText(m.role)}</div>
                </div>
              `;
              membersContainerEl.appendChild(row);
            });
          }
        } catch (e) {
          console.error(e);
          membersContainerEl.innerHTML = `<div class="notice">Не вдалося завантажити склад команди.</div>`;
        }
      }
    }

    // 4) stats (поки заглушка з users.seasonStats)
    if (statsWrapperEl) {
      const s = u.seasonStats || {};
      const total = (s.totalWeightKg ?? "—");
      const big   = (s.bigFishKg ?? "—");
      const rank  = (s.rank ?? "—");

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
    setTimeout(() => setStatus(""), 700);
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Ви не увійшли. Переходимо на вхід…");
      setTimeout(() => (window.location.href = "auth.html"), 500);
      return;
    }
    loadCabinet(user).catch((e) => {
      console.error(e);
      setStatus("");
      setMsg("Помилка завантаження кабінету.", "err");
    });
  });

  // upload avatar (якщо storage треба)
  if (avatarBtnEl && avatarInputEl) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();

      const user = auth.currentUser;
      if (!user) return;

      const file = avatarInputEl.files?.[0];
      if (!file) return setMsg("Оберіть файл.", "err");
      if (!file.type.startsWith("image/")) return setMsg("Потрібен файл-зображення.", "err");

      try {
        setMsg("Завантаження аватара…", "ok");

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;

        const ref = storage.ref().child(path);
        const snap = await ref.put(file);
        const url = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).set({ avatarUrl: url }, { merge: true });

        setMsg("Аватар збережено!", "ok");
      } catch (err) {
        console.error(err);
        setMsg("Помилка завантаження аватара.", "err");
      }
    });
  }
})();
