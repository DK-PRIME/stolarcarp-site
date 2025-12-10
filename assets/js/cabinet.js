// assets/js/cabinet.js
// Кабінет учасника STOLAR CARP
// Працює з compat-версією Firebase (див. firebase-init.js)

// Беремо глобальний firebase з window
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// DOM
const guestBlock   = document.getElementById("cabinet-guest");
const userBlock    = document.getElementById("cabinet-user");
const loginBtn     = document.getElementById("cabinetLoginBtn");

const profileSubtitle = document.getElementById("profileSubtitle");
const teamNameText    = document.getElementById("teamNameText");
const captainText     = document.getElementById("captainText");
const userRoleText    = document.getElementById("userRoleText");
const userPhoneText   = document.getElementById("userPhoneText");
const joinCodePill    = document.getElementById("joinCodePill");
const joinCodeText    = document.getElementById("joinCodeText");

// Аватар
const avatarImg          = document.getElementById("cabinetAvatarImg");
const avatarPlaceholder  = document.getElementById("cabinetAvatarPlaceholder");
const avatarFileInput    = document.getElementById("avatarFile");
const avatarUploadBtn    = document.getElementById("avatarUploadBtn");
const avatarMsg          = document.getElementById("avatarMsg");

// Учасники та статистика
const membersContainer = document.getElementById("membersContainer");
const statsWrapper     = document.getElementById("statsWrapper");

// Перехід на сторінку авторизації
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    window.location.href = "auth.html";
  });
}

function setGuestMode() {
  if (guestBlock) guestBlock.style.display = "block";
  if (userBlock)  userBlock.style.display  = "none";
}

function setUserMode() {
  if (guestBlock) guestBlock.style.display = "none";
  if (userBlock)  userBlock.style.display  = "block";
}

// Ініціалізація при зміні авторизації
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    setGuestMode();
    return;
  }

  setUserMode();
  profileSubtitle.textContent = "Завантаження даних акаунта…";

  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      profileSubtitle.textContent =
        "Профіль користувача не знайдено. Завершіть реєстрацію на сторінці «Реєстрація STOLAR CARP».";
      return;
    }

    const u = userDoc.data();

    const fullName  = u.fullName || u.name || "(Без імені)";
    const phone     = u.phone || "";
    const role      = u.role  || "member";
    const teamId    = u.teamId || null;
    const avatarUrl = u.avatarUrl || "";

    // Підпис
    profileSubtitle.textContent =
      "Це ваш особистий кабінет. Дані беруться з вашого профілю та команди у Firestore.";

    // Аватар
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
      avatarPlaceholder.style.display = "none";
    } else {
      // ініціали
      const initials = fullName
        .split(" ")
        .filter(Boolean)
        .map((p) => p[0]?.toUpperCase() || "")
        .slice(0, 2)
        .join("");
      avatarPlaceholder.textContent = initials || "SC";
      avatarImg.style.display = "none";
      avatarPlaceholder.style.display = "flex";
    }

    // Текстові дані
    captainText.textContent   = `${fullName} — ваш профіль`;
    userRoleText.textContent  = role === "captain" ? "Капітан" : "Учасник";
    userPhoneText.textContent = phone || "не вказано";

    // Аватар – завантаження
    initAvatarUpload(user.uid);

    if (!teamId) {
      teamNameText.textContent = "Команда ще не створена";
      membersContainer.innerHTML =
        '<div class="cabinet-small-muted">Створіть команду як капітан, або приєднайтесь за кодом, щоб бачити склад та досягнення.</div>';
      statsWrapper.innerHTML =
        '<div class="cabinet-small-muted">Після привʼязки до команди тут зʼявиться статистика виступів.</div>';
      return;
    }

    await loadTeamBlock(teamId, role);
    await loadTeamStats(teamId);

  } catch (err) {
    console.error("Помилка ініціалізації кабінету:", err);
    profileSubtitle.textContent =
      "Сталася помилка при завантаженні даних. Спробуйте перезавантажити сторінку.";
  }
});

// ---------- Аватар поточного юзера ----------
function initAvatarUpload(uid) {
  if (!avatarFileInput || !avatarUploadBtn) return;

  avatarUploadBtn.onclick = async () => {
    const file = avatarFileInput.files && avatarFileInput.files[0];
    if (!file) {
      avatarMsg.textContent = "Оберіть файл з фото.";
      avatarMsg.style.color = "#fca5a5";
      return;
    }

    try {
      avatarUploadBtn.disabled = true;
      avatarMsg.textContent = "Завантаження…";
      avatarMsg.style.color = "#9ca3af";

      const ref = storage.ref().child(`avatars/${uid}.jpg`);
      await ref.put(file);
      const url = await ref.getDownloadURL();

      await db.collection("users").doc(uid).update({
        avatarUrl: url
      });

      avatarImg.src = url;
      avatarImg.style.display = "block";
      avatarPlaceholder.style.display = "none";

      avatarMsg.textContent = "Аватар оновлено.";
      avatarMsg.style.color = "#4ade80";
      avatarFileInput.value = "";
    } catch (err) {
      console.error("Помилка завантаження аватара:", err);
      avatarMsg.textContent = "Не вдалося завантажити фото.";
      avatarMsg.style.color = "#fca5a5";
    } finally {
      avatarUploadBtn.disabled = false;
    }
  };
}

// ---------- Завантаження команди та учасників ----------
async function loadTeamBlock(teamId, currentUserRole) {
  try {
    const teamDoc = await db.collection("teams").doc(teamId).get();
    let teamName = "Команда без назви";
    let joinCode = null;

    if (teamDoc.exists) {
      const t = teamDoc.data();
      teamName = t.name || t.teamName || teamName;
      joinCode = t.joinCode || null;
    }

    teamNameText.textContent = `Команда «${teamName}»`;

    if (joinCode) {
      joinCodePill.style.display = "inline-flex";
      joinCodeText.textContent = joinCode;
    } else {
      joinCodePill.style.display = "none";
    }

    // Учасники
    const snap = await db
      .collection("users")
      .where("teamId", "==", teamId)
      .get();

    if (snap.empty) {
      membersContainer.innerHTML =
        '<div class="cabinet-small-muted">Учасників команди ще не додано.</div>';
      return;
    }

    const rows = [];
    snap.forEach((doc) => {
      const u = doc.data();
      const name = u.fullName || u.name || "(Без імені)";
      const role = u.role === "captain" ? "Капітан" : "Учасник";
      const avatar = u.avatarUrl || "";

      rows.push(`
        <div class="member-row">
          <div class="member-avatar">
            ${
              avatar
                ? `<img src="${avatar}" alt="${name}">`
                : `<img src="assets/avatar-placeholder.png" alt="avatar">`
            }
          </div>
          <div class="member-meta">
            <div class="member-name">${name}</div>
            <div class="member-role">${role}</div>
          </div>
        </div>
      `);
    });

    membersContainer.innerHTML = rows.join("");

  } catch (err) {
    console.error("Помилка завантаження команди:", err);
    membersContainer.innerHTML =
      '<div class="cabinet-small-muted">Не вдалося завантажити список учасників.</div>';
  }
}

// ---------- Статистика команди ----------
async function loadTeamStats(teamId) {
  try {
    const statsDoc = await db.collection("teamStats").doc(teamId).get();

    if (!statsDoc.exists) {
      statsWrapper.innerHTML = `
        <div class="cabinet-small-muted">
          Статистика ще не додана. Після того як адмінка DK PRIME почне
          відправляти підсумки, тут зʼявляться ваші результати за етапами
          та незалежними змаганнями.
        </div>
      `;
      return;
    }

    const s = statsDoc.data() || {};
    const seasons   = s.seasons || {};
    const current   = seasons["2026"] || {}; // поточний сезон
    const totalKg   = current.totalWeightKg || 0;
    const bigKg     = current.bestBigFishKg || 0;
    const rank      = current.rank || null;

    const indy = s.independent || []; // масив незалежних стартів

    const statHeader = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Загальний улов сезону 2026</div>
          <div class="stat-value">${totalKg.toFixed(2)}<span class="stat-unit">кг</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Найбільша риба сезону</div>
          <div class="stat-value">${bigKg.toFixed(2)}<span class="stat-unit">кг</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Місце у сезонному рейтингу</div>
          <div class="stat-value">
            ${rank ? `#${rank}` : "—"}
          </div>
        </div>
      </div>
    `;

    // Таблиця етапів STOLAR CARP
    const stages = current.stages || []; // [{stageTitle, lake, zone, sector, weightKg, bigFishKg, place}, ...]

    let stagesTable = "";
    if (stages.length) {
      const rows = stages.map(st => `
        <tr>
          <td>${st.stageTitle || ""}</td>
          <td>${st.lake || ""}</td>
          <td>${st.zone || ""}</td>
          <td>${st.sector || ""}</td>
          <td>${(st.weightKg || 0).toFixed(2)}</td>
          <td>${(st.bigFishKg || 0).toFixed(2)}</td>
          <td>${st.place || "—"}</td>
        </tr>
      `).join("");

      stagesTable = `
        <div class="results-section-title">Етапи STOLAR CARP 2026</div>
        <table class="results-table">
          <thead>
            <tr>
              <th>Етап / водойма</th>
              <th>Водойма</th>
              <th>Зона</th>
              <th>Сектор</th>
              <th>Вага, кг</th>
              <th>Big Fish, кг</th>
              <th>Місце</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } else {
      stagesTable = `
        <div class="cabinet-small-muted">
          Результати етапів сезону ще не внесені.
        </div>
      `;
    }

    // Незалежні змагання
    let indyBlock = "";
    if (indy.length) {
      const rows = indy.map(ev => `
        <tr>
          <td>${ev.title || ""}</td>
          <td>${ev.year || ""}</td>
          <td>${ev.place || "—"}</td>
          <td>${(ev.weightKg || 0).toFixed(2)}</td>
          <td>${(ev.bigFishKg || 0).toFixed(2)}</td>
        </tr>
      `).join("");

      indyBlock = `
        <div class="results-section-title">Незалежні турніри</div>
        <table class="results-table">
          <thead>
            <tr>
              <th>Турнір</th>
              <th>Рік</th>
              <th>Місце</th>
              <th>Улов, кг</th>
              <th>Big Fish, кг</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } else {
      indyBlock = `
        <div class="cabinet-small-muted">
          Незалежні змагання ще не додані до профілю команди.
        </div>
      `;
    }

    statsWrapper.innerHTML = statHeader + stagesTable + indyBlock;

  } catch (err) {
    console.error("Помилка завантаження статистики:", err);
    statsWrapper.innerHTML =
      '<div class="cabinet-small-muted">Не вдалося завантажити статистику команди.</div>';
  }
}
