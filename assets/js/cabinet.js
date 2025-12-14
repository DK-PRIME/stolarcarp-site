// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP (compat SDK)
// Читає users/{uid} + teams/{teamId} + склад команди (users where teamId==...)
// Після assets/js/firebase-init.js (scAuth, scDb, scStorage)

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований.");
    return;
  }

  // --- DOM ---
  const statusEl = document.getElementById("cabinetStatus");
  const wrapperEl = document.getElementById("cabinetWrapper");

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

  const msgEl = document.getElementById("cabinetMsg");
  const membersContainerEl = document.getElementById("membersContainer");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function showWrapper() {
    if (wrapperEl) wrapperEl.style.display = "block";
  }

  function setMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "form-msg" + (type ? " " + type : "");
  }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  function roleLabel(role) {
    if (role === "admin") return "Адміністратор";
    if (role === "judge") return "Суддя";
    if (role === "captain") return "Капітан команди";
    return "Учасник команди";
  }

  function escapeHtml(s) {
    return (s || "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadTeamMembers(teamId, myUid) {
    if (!membersContainerEl) return;

    try {
      membersContainerEl.innerHTML = "<div class='cabinet-small-muted'>Завантаження списку учасників…</div>";

      const snap = await db.collection("users").where("teamId", "==", teamId).get();

      if (snap.empty) {
        membersContainerEl.innerHTML = "<div class='cabinet-small-muted'>У команді поки немає учасників.</div>";
        return;
      }

      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => {
          const ar = (a.role === "captain") ? 0 : 1;
          const br = (b.role === "captain") ? 0 : 1;
          if (ar !== br) return ar - br;
          return (a.fullName || "").localeCompare(b.fullName || "");
        });

      membersContainerEl.innerHTML = "";

      items.forEach(u => {
        const row = document.createElement("div");
        row.className = "member-row";

        const name = u.fullName || u.email || "Без імені";
        const role = roleLabel(u.role);
        const me = (u.id === myUid) ? " (ви)" : "";

        row.innerHTML = `
          <div class="member-avatar"></div>
          <div class="member-meta">
            <div class="member-name">${escapeHtml(name)}${me}</div>
            <div class="member-role">${escapeHtml(role)}</div>
          </div>
        `;
        membersContainerEl.appendChild(row);
      });

    } catch (err) {
      console.error("members error", err);
      membersContainerEl.innerHTML = "<div class='cabinet-small-muted'>Не вдалося завантажити склад команди.</div>";
    }
  }

  async function loadCabinet(user) {
    try {
      setStatus("Перевірка доступу до кабінету…");

      const userRef = db.collection("users").doc(user.uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        setStatus("Анкета користувача не знайдена. Зайдіть на сторінку входу і завершіть реєстрацію.");
        showWrapper();
        return;
      }

      const u = userSnap.data() || {};

      const fullName = u.fullName || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city || "";
      const roleTxt  = roleLabel(u.role);

      if (captainTextEl)   captainTextEl.textContent = fullName + (city ? ` · ${city}` : "");
      if (userRoleTextEl)  userRoleTextEl.textContent = roleTxt;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      if (u.avatarUrl) setAvatarUrl(u.avatarUrl);

      // team
      let teamName = "Без назви";
      let joinCode = "";

      if (u.teamId) {
        const teamSnap = await db.collection("teams").doc(u.teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data() || {};
          teamName = t.name || teamName;
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
          joinCodeTextEl.textContent = "";
        }
      }

      // members
      if (u.teamId) {
        await loadTeamMembers(u.teamId, user.uid);
      } else if (membersContainerEl) {
        membersContainerEl.innerHTML = "<div class='cabinet-small-muted'>У вас ще немає команди.</div>";
      }

      setStatus("Кабінет завантажено.");
      showWrapper();

    } catch (err) {
      console.error(err);
      setStatus("Помилка завантаження кабінету: " + (err && err.message ? err.message : err));
      showWrapper();
    }
  }

  // ---- auth watcher ----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Ви не увійшли. Перехід на сторінку входу…");
      setTimeout(() => window.location.href = "auth.html", 600);
      return;
    }
    loadCabinet(user);
  });

  // ---- avatar upload ----
  if (avatarBtnEl && avatarInputEl) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();
      setMsg("", "");

      const user = auth.currentUser;
      if (!user) return setMsg("Спочатку увійдіть у акаунт.", "err");

      const file = avatarInputEl.files && avatarInputEl.files[0];
      if (!file) return setMsg("Оберіть файл.", "err");

      if (!file.type || !file.type.startsWith("image/")) {
        return setMsg("Потрібен файл-зображення.", "err");
      }
      if (file.size > 5 * 1024 * 1024) {
        return setMsg("Максимальний розмір файлу 5 МБ.", "err");
      }

      try {
        avatarBtnEl.disabled = true;
        avatarBtnEl.textContent = "Збереження…";
        setMsg("Завантаження…", "");

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const safeExt = ["jpg","jpeg","png","webp"].includes(ext) ? ext : "jpg";
        const path = `avatars/${user.uid}/avatar.${safeExt}`;

        const ref = storage.ref().child(path);
        const snap = await ref.put(file);
        const url  = await snap.ref.getDownloadURL();

        await db.collection("users").doc(user.uid).set({ avatarUrl: url }, { merge: true });

        setAvatarUrl(url);
        setMsg("Аватар оновлено!", "ok");

      } catch (err) {
        console.error(err);
        setMsg("Помилка завантаження аватара.", "err");
      } finally {
        avatarBtnEl.disabled = false;
        avatarBtnEl.textContent = "Зберегти";
      }
    });
  }
})();
