// assets/js/cabinet.js
// STOLAR CARP: Кабінет учасника
// compat SDK через window.scAuth / window.scDb / window.scStorage

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізовано. Перевір firebase-init.js");
    return;
  }

  const statusEl        = document.getElementById("cabinetStatus");
  const msgEl           = document.getElementById("cabinetMsg");

  const teamNameEl      = document.getElementById("teamNameText");
  const captainTextEl   = document.getElementById("captainText");
  const userRoleTextEl  = document.getElementById("userRoleText");
  const userPhoneTextEl = document.getElementById("userPhoneText");

  const joinCodePillEl  = document.getElementById("joinCodePill");
  const joinCodeTextEl  = document.getElementById("joinCodeText");

  const membersEl       = document.getElementById("membersContainer");
  const membersErrEl    = document.getElementById("membersError");

  const statTotalEl     = document.getElementById("statTotalWeight");
  const statBigEl       = document.getElementById("statBigFish");
  const statRankEl      = document.getElementById("statSeasonRank");

  const avatarImgEl     = document.getElementById("cabinetAvatarImg");
  const avatarPhEl      = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl   = document.getElementById("avatarFile");
  const avatarBtnEl     = document.getElementById("avatarUploadBtn");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }
  function setMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "cabinet-msg" + (type ? " " + type : "");
  }

  function roleLabel(role) {
    if (role === "admin") return "Адміністратор";
    if (role === "judge") return "Суддя";
    if (role === "captain") return "Капітан команди";
    return "Учасник команди";
  }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPhEl) return;
    if (!url) {
      avatarImgEl.style.display = "none";
      avatarPhEl.style.display = "grid";
      return;
    }
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPhEl.style.display = "none";
  }

  async function loadCabinet(user) {
    setMsg("", "");
    setStatus("Перевірка доступу до кабінету…");

    // 1) user doc
    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      setStatus("");
      setMsg("Анкета користувача не знайдена у Firestore (users/{uid}).", "err");
      return;
    }

    const u = userSnap.data() || {};

    const fullName = u.fullName || user.email || "Без імені";
    const phone    = u.phone || "—";
    const city     = u.city || "";
    const role     = u.role || "member";
    const teamId   = u.teamId || null;

    if (captainTextEl)   captainTextEl.textContent   = fullName + (city ? ` · ${city}` : "");
    if (userRoleTextEl)  userRoleTextEl.textContent  = roleLabel(role);
    if (userPhoneTextEl) userPhoneTextEl.textContent = `Телефон: ${phone}`;

    setAvatarUrl(u.avatarUrl || "");

    // 2) team doc
    let teamName = "—";
    let joinCode = "";

    if (teamId) {
      const teamSnap = await db.collection("teams").doc(teamId).get();
      if (teamSnap.exists) {
        const t = teamSnap.data() || {};
        teamName = t.name || "—";
        joinCode = t.joinCode || "";
      }
    }

    if (teamNameEl) teamNameEl.textContent = teamName;

    if (joinCodePillEl && joinCodeTextEl) {
      if (joinCode) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = joinCode;
      } else {
        joinCodePillEl.style.display = "none";
      }
    }

    // 3) stats (поки з users.seasonStats)
    const stats = u.seasonStats || {};
    if (statTotalEl) statTotalEl.textContent = (stats.totalWeightKg ?? "—");
    if (statBigEl)   statBigEl.textContent   = (stats.bigFishKg ?? "—");
    if (statRankEl)  statRankEl.textContent  = (stats.rank ?? "—");

    // 4) members (потребує правил!)
    if (membersEl) membersEl.innerHTML = "";
    if (membersErrEl) membersErrEl.style.display = "none";

    if (teamId) {
      try {
        const snap = await db.collection("users")
          .where("teamId", "==", teamId)
          .orderBy("createdAt", "asc")
          .get();

        if (membersEl) {
          membersEl.innerHTML = "";
          snap.forEach((d) => {
            const m = d.data() || {};
            const row = document.createElement("div");
            row.className = "member-row";
            row.innerHTML = `
              <div class="member-avatar"></div>
              <div class="member-meta">
                <div class="member-name">${m.fullName || "—"}</div>
                <div class="member-role">${roleLabel(m.role || "member")}</div>
              </div>
            `;
            membersEl.appendChild(row);
          });
        }
      } catch (e) {
        // найчастіше тут буде "Missing or insufficient permissions" через твої Rules
        console.warn("members load failed:", e);
        if (membersErrEl) {
          membersErrEl.style.display = "block";
          membersErrEl.textContent = "Не вдалося завантажити склад команди.";
        }
      }
    }

    setStatus("Кабінет завантажено.");
    setTimeout(() => setStatus(""), 800);
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Ви не увійшли. Переходимо на вхід…");
      setTimeout(() => (window.location.href = "auth.html"), 400);
      return;
    }
    loadCabinet(user).catch((e) => {
      console.error(e);
      setStatus("");
      setMsg("Помилка завантаження кабінету.", "err");
    });
  });

  // -------- Аватар --------
  if (avatarBtnEl && avatarInputEl) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();
      const user = auth.currentUser;
      if (!user) return;

      const file = avatarInputEl.files && avatarInputEl.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setMsg("Потрібен файл-зображення.", "err");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMsg("Максимальний розмір 5 МБ.", "err");
        return;
      }

      try {
        setMsg("Завантаження аватара…", "");

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `avatars/${user.uid}/avatar.${ext}`;

        const ref = storage.ref().child(path);
        const snap = await ref.put(file);
        const url = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).set({ avatarUrl: url }, { merge: true });
        setAvatarUrl(url);

        setMsg("Аватар оновлено!", "ok");
      } catch (err) {
        console.error(err);
        setMsg("Помилка завантаження аватара.", "err");
      }
    });
  }
})();
