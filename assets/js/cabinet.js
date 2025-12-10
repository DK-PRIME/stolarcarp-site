// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP
// Використовує ТУ Ж САМУ ініціалізацію firebase, що й auth/register

// Беремо глобальні об'єкти з firebase-init.js (compat)
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// DOM
const cabinetRoot      = document.getElementById("cabinetRoot");
const loadingEl        = document.getElementById("cabinetLoading");
const msgEl            = document.getElementById("cabinetMsg");

const profileSubtitle  = document.getElementById("profileSubtitle");

const avatarImg        = document.getElementById("cabinetAvatarImg");
const avatarPlaceholder= document.getElementById("cabinetAvatarPlaceholder");
const avatarFileInput  = document.getElementById("avatarFile");
const avatarUploadBtn  = document.getElementById("avatarUploadBtn");
const avatarMsg        = document.getElementById("avatarMsg");

const teamNameText     = document.getElementById("teamNameText");
const captainText      = document.getElementById("captainText");
const userRoleText     = document.getElementById("userRoleText");
const userPhoneText    = document.getElementById("userPhoneText");
const joinCodePill     = document.getElementById("joinCodePill");
const joinCodeText     = document.getElementById("joinCodeText");

const membersContainer = document.getElementById("membersContainer");
const statsWrapper     = document.getElementById("statsWrapper");

function setMsg(text, type = "err") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.classList.remove("ok", "err");
  msgEl.classList.add(type === "ok" ? "ok" : "err");
}

function clearMsg() {
  if (!msgEl) return;
  msgEl.textContent = "";
  msgEl.classList.remove("ok", "err");
}

// ---------- Завантаження профілю ----------
async function loadCabinet(user) {
  try {
    clearMsg();
    if (profileSubtitle) {
      profileSubtitle.textContent = "Завантажуємо ваш профіль та команду…";
    }

    const userRef  = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new Error("Профіль користувача не знайдено. Завершіть реєстрацію акаунта на сторінці «Реєстрація акаунта».");
    }

    const u = userSnap.data();

    const fullName = u.fullName || u.name || user.email || "Без імені";
    const phone    = u.phone || "";
    const city     = u.city || "";
    const roleRaw  = u.role || "member";
    const roleText = roleRaw === "captain" ? "Капітан команди" : "Учасник команди";

    // Профіль/текст
    teamNameText.textContent = u.teamName || "Без назви";
    captainText.textContent  = fullName + (city ? ` · ${city}` : "");
    userRoleText.textContent = roleText;
    userPhoneText.textContent= phone || "—";

    // Команда
    let teamName   = u.teamName || "Без назви";
    let joinCode   = u.joinCode || null;
    const teamId   = u.teamId || null;

    if (teamId) {
      try {
        const teamSnap = await db.collection("teams").doc(teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data();
          teamName = t.name || t.teamName || teamName;
          if (t.joinCode) joinCode = t.joinCode;
        }
      } catch (e) {
        console.warn("Помилка читання команди:", e);
      }
    }

    teamNameText.textContent = teamName;

    if (roleRaw === "captain" && joinCode) {
      joinCodePill.style.display = "inline-flex";
      joinCodeText.textContent   = joinCode;
    } else {
      joinCodePill.style.display = "none";
    }

    // Аватар
    const avatarUrl = u.avatarUrl || null;
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
      avatarPlaceholder.style.display = "none";
    } else {
      avatarImg.style.display = "none";
      avatarPlaceholder.style.display = "flex";
    }

    // Склад команди: всі users з тим самим teamId (якщо є)
    await loadMembers(teamId, user.uid);

    // Статистика
    await loadStats(u);

    if (profileSubtitle) {
      profileSubtitle.textContent = "Ваш профіль завантажено.";
    }

  } catch (err) {
    console.error(err);
    setMsg(err.message || "Не вдалося завантажити дані кабінету.");
    if (profileSubtitle) {
      profileSubtitle.textContent = "Помилка завантаження профілю.";
    }
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
    if (cabinetRoot) cabinetRoot.style.display = "grid";
  }
}

// ---------- Список учасників ----------
async function loadMembers(teamId, currentUid) {
  if (!membersContainer) return;

  if (!teamId) {
    membersContainer.innerHTML =
      '<div class="cabinet-small-muted">Команда ще не створена або не привʼязана до профілю.</div>';
    return;
  }

  try {
    const snap = await db
      .collection("users")
      .where("teamId", "==", teamId)
      .get();

    if (snap.empty) {
      membersContainer.innerHTML =
        '<div class="cabinet-small-muted">Учасників команди поки не додано.</div>';
      return;
    }

    const members = [];
    snap.forEach(doc => {
      const d = doc.data();
      members.push({
        uid: doc.id,
        name: d.fullName || d.name || "Без імені",
        role: d.role || "member"
      });
    });

    // капітан перший
    members.sort((a,b) => {
      if (a.role === "captain" && b.role !== "captain") return -1;
      if (b.role === "captain" && a.role !== "captain") return 1;
      return a.name.localeCompare(b.name, "uk");
    });

    membersContainer.innerHTML = "";
    members.forEach(m => {
      const row = document.createElement("div");
      row.className = "member-row";
      row.innerHTML = `
        <div class="member-avatar">
          <img src="assets/img/avatar-default-small.png" alt="">
        </div>
        <div class="member-meta">
          <div class="member-name">${m.name}</div>
          <div class="member-role">
            ${m.role === "captain" ? "Капітан" : "Учасник"}
            ${m.uid === currentUid ? " · це ви" : ""}
          </div>
        </div>
      `;
      membersContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Помилка завантаження учасників:", err);
    membersContainer.innerHTML =
      '<div class="cabinet-small-muted">Не вдалося отримати склад команди.</div>';
  }
}

// ---------- Статистика ----------
async function loadStats(u) {
  if (!statsWrapper) return;

  const stats = u.seasonStats || {};
  const totalWeight = stats.totalWeightKg ?? "—";
  const bigFish     = stats.bigFishKg ?? "—";
  const stages      = stats.totalStages ?? "—";
  const bestPlace   = stats.bestPlace ?? "—";

  statsWrapper.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Загальний улов</div>
        <div class="stat-value">${totalWeight}<span class="stat-unit">кг</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Найбільша риба</div>
        <div class="stat-value">${bigFish}<span class="stat-unit">кг</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Етапів у сезоні</div>
        <div class="stat-value">${stages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Найкраще місце</div>
        <div class="stat-value">${bestPlace}</div>
      </div>
    </div>
    <div class="cabinet-small-muted">
      Детальна статистика оновлюється після кожного етапу через адмінку DK PRIME.
    </div>
  `;
}

// ---------- Завантаження аватара ----------
async function uploadAvatar(user) {
  if (!avatarFileInput || !avatarFileInput.files.length) return;
  const file = avatarFileInput.files[0];

  if (!file.type.startsWith("image/")) {
    avatarMsg.textContent = "Оберіть файл зображення (jpg, png тощо).";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    avatarMsg.textContent = "Файл завеликий. Максимум 5 МБ.";
    return;
  }

  avatarMsg.textContent = "Завантаження фото...";
  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `avatars/${user.uid}/avatar.${ext}`;
    const storageRef = storage.ref().child(path);

    const snapshot = await storageRef.put(file);
    const url = await snapshot.ref.getDownloadURL();

    await db.collection("users").doc(user.uid).update({
      avatarUrl: url
    });

    avatarImg.src = url;
    avatarImg.style.display = "block";
    avatarPlaceholder.style.display = "none";
    avatarMsg.textContent = "Аватар оновлено.";
  } catch (err) {
    console.error("Помилка завантаження аватара:", err);
    avatarMsg.textContent = "Не вдалося завантажити фото.";
  }
}

// ---------- Слухач авторизації ----------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // гість → на сторінку авторизації
    window.location.href = "auth.html";
    return;
  }

  await loadCabinet(user);
});

// ---------- Обробник кнопки завантаження аватара ----------
if (avatarUploadBtn) {
  avatarUploadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setMsg("Щоб змінити аватар, увійдіть у акаунт.", "err");
      return;
    }
    uploadAvatar(user);
  });
}
