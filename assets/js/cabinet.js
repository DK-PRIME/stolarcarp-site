// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP (compat SDK).
// Читає:
//  users/{uid} -> профіль
//  teams/{teamId} -> назва команди + joinCode
//  users where teamId == {teamId} -> склад команди (потребує rules)

(function () {
  const auth    = window.scAuth;
  const db      = window.scDb;
  const storage = window.scStorage;

  if (!auth || !db) {
    console.error("Firebase не ініціалізований.");
    return;
  }

  const statusEl            = document.getElementById("cabinetStatus");
  const wrapperEl           = document.getElementById("cabinetWrapper");

  const teamNameEl          = document.getElementById("teamNameText");
  const captainTextEl       = document.getElementById("captainText");
  const userRoleTextEl      = document.getElementById("userRoleText");
  const userPhoneTextEl     = document.getElementById("userPhoneText");

  const joinCodePillEl      = document.getElementById("joinCodePill");
  const joinCodeTextEl      = document.getElementById("joinCodeText");

  const avatarImgEl         = document.getElementById("cabinetAvatarImg");
  const avatarPlaceholderEl = document.getElementById("cabinetAvatarPlaceholder");
  const avatarInputEl       = document.getElementById("avatarFile");
  const avatarBtnEl         = document.getElementById("avatarUploadBtn");
  const avatarMsgEl         = document.getElementById("avatarMsg");

  const membersContainerEl  = document.getElementById("membersContainer");
  const statsWrapperEl      = document.getElementById("statsWrapper");

  function setStatus(text) { if (statusEl) statusEl.textContent = text || ""; }
  function showWrapper() { if (wrapperEl) wrapperEl.style.display = "block"; }

  function setAvatarUrl(url) {
    if (!avatarImgEl || !avatarPlaceholderEl) return;
    avatarImgEl.src = url;
    avatarImgEl.style.display = "block";
    avatarPlaceholderEl.style.display = "none";
  }

  function roleLabel(role){
    if (role === "admin") return "Адміністратор";
    if (role === "judge") return "Суддя";
    if (role === "captain") return "Капітан команди";
    return "Учасник команди";
  }

  function esc(s){
    return String(s ?? "").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadCabinet(user) {
    try {
      setStatus("Перевірка доступу до кабінету…");

      // 1) профіль
      const userRef  = db.collection("users").doc(user.uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        setStatus("Анкета користувача не знайдена. Перейдіть на сторінку входу та завершіть реєстрацію.");
        showWrapper();
        return;
      }

      const u = userSnap.data() || {};
      const fullName = u.fullName || user.email || "Без імені";
      const phone    = u.phone || "—";
      const city     = u.city || "";
      const roleText = roleLabel(u.role);

      if (captainTextEl)   captainTextEl.textContent   = fullName + (city ? (" · " + city) : "");
      if (userRoleTextEl)  userRoleTextEl.textContent  = roleText;
      if (userPhoneTextEl) userPhoneTextEl.textContent = phone;

      if (u.avatarUrl) setAvatarUrl(u.avatarUrl);

      // 2) команда
      let teamName = "Без команди";
      let joinCode = "";

      if (u.teamId) {
        const teamSnap = await db.collection("teams").doc(u.teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data() || {};
          teamName = t.name || "Без назви";
          joinCode = t.joinCode || "";
        }
      }

      if (teamNameEl) teamNameEl.textContent = teamName;

      if (joinCode && joinCodePillEl && joinCodeTextEl) {
        joinCodePillEl.style.display = "inline-flex";
        joinCodeTextEl.textContent = joinCode;
      }

      // 3) склад команди
      if (membersContainerEl) {
        membersContainerEl.innerHTML = "<div class='muted'>Завантаження списку…</div>";

        if (!u.teamId) {
          membersContainerEl.innerHTML = "<div class='muted'>Команда не привʼязана до профілю.</div>";
        } else {
          try {
            const snap = await db.collection("users")
              .where("teamId","==",u.teamId)
              .get();

            if (snap.empty) {
              membersContainerEl.innerHTML = "<div class='muted'>Немає учасників у команді.</div>";
            } else {
              const rows = snap.docs.map(d => d.data() || {}).sort((a,b)=>{
                const ra = (a.role==="captain") ? 0 : 1;
                const rb = (b.role==="captain") ? 0 : 1;
                if (ra!==rb) return ra-rb;
                return String(a.fullName||"").localeCompare(String(b.fullName||""), "uk");
              });

              membersContainerEl.innerHTML = rows.map(m => {
                const n = esc(m.fullName || "Без імені");
                const r = esc(roleLabel(m.role));
                return `
                  <div class="member-row">
                    <div class="member-avatar"></div>
                    <div class="member-meta">
                      <div class="member-name">${n}</div>
                      <div class="member-role">${r}</div>
                    </div>
                  </div>
                `;
              }).join("");
            }
          } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            membersContainerEl.innerHTML =
              msg.includes("permission-denied")
                ? "<div class='muted'>Немає доступу до складу команди (перевір правила Firestore для /users).</div>"
                : "<div class='muted'>Не вдалося завантажити склад команди.</div>";
          }
        }
      }

      // 4) статистика (як було)
      if (statsWrapperEl) {
        const stats = u.seasonStats || {};
        const total = (stats.totalWeightKg ?? "—");
        const big   = (stats.bigFishKg ?? "—");
        const rank  = (stats.rank ?? "—");

        statsWrapperEl.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Улов за сезон</div>
              <div class="stat-value">${esc(total)}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Big Fish</div>
              <div class="stat-value">${esc(big)}<span class="stat-unit">кг</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Місце в рейтингу</div>
              <div class="stat-value">${esc(rank)}</div>
            </div>
          </div>
        `;
      }

      setStatus("Кабінет завантажено.");
      showWrapper();

    } catch (err) {
      setStatus("Помилка завантаження кабінету: " + (err && err.message ? err.message : err));
      showWrapper();
    }
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      setStatus("Ви не увійшли. Переходимо на сторінку входу…");
      setTimeout(() => { window.location.href = "auth.html"; }, 600);
      return;
    }
    loadCabinet(user);
  });

  // ===== AVATAR UPLOAD =====
  if (avatarBtnEl && avatarInputEl && storage) {
    avatarBtnEl.addEventListener("click", async (e) => {
      e.preventDefault();

      const user = auth.currentUser;
      if (!user) return alert("Спочатку увійдіть у акаунт.");

      const file = avatarInputEl.files && avatarInputEl.files[0];
      if (!file) return alert("Оберіть файл.");
      if (!file.type || !file.type.startsWith("image/")) return alert("Потрібен файл-зображення.");
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
        if (avatarMsgEl) avatarMsgEl.textContent = "Помилка завантаження.";
      }
    });
  }
})();
