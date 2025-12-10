// ---- ІМПОРТИ ----
import { auth, db, storage } from "./firebase-init.js";

// ---- ОТРИМУЄМО ЕЛЕМЕНТИ З HTML ----
const guestBlock = document.getElementById("cabinet-guest");
const userBlock  = document.getElementById("cabinet-user");

const teamNameEl = document.getElementById("teamNameText");
const captainEl  = document.getElementById("captainText");
const userRoleEl = document.getElementById("userRoleText");
const phoneEl    = document.getElementById("userPhoneText");

const joinCodePill = document.getElementById("joinCodePill");
const joinCodeEl   = document.getElementById("joinCodeText");

const membersContainer = document.getElementById("membersContainer");

const avatarInput   = document.getElementById("avatarFile");
const avatarBtn     = document.getElementById("avatarUploadBtn");
const avatarImg     = document.getElementById("cabinetAvatarImg");
const avatarPlaceholder = document.getElementById("cabinetAvatarPlaceholder");
const avatarMsg     = document.getElementById("avatarMsg");

const statsWrapper = document.getElementById("statsWrapper");


// ---- ВХІД/ВИХІД ДЛЯ ГОСТЯ ----
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    guestBlock.style.display = "block";
    userBlock.style.display  = "none";
    return;
  }

  guestBlock.style.display = "none";
  userBlock.style.display  = "block";

  await loadCabinet(user);
});


// ---- ЗАВАНТАЖЕННЯ ДАНИХ ----
async function loadCabinet(user) {
  const userRef = db.collection("users").doc(user.uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    captainEl.textContent = "Заповніть профіль на сторінці реєстрації";
    return;
  }

  const data = snap.data();

  // --- ОСНОВНА ІНФА ---
  const fullName = data.fullName || data.name || "Без імені";
  captainEl.textContent = `Капітан: ${fullName}`;
  phoneEl.textContent   = data.phone || "-";
  userRoleEl.textContent = data.role === "captain" ? "Капітан" : "Учасник";

  // --- КОМАНДА ---
  if (data.teamId) {
    const t = await db.collection("teams").doc(data.teamId).get();
    if (t.exists) {
      const team = t.data();
      teamNameEl.textContent = team.name || "Без назви";

      if (team.joinCode) {
        joinCodePill.style.display = "inline-block";
        joinCodeEl.textContent = team.joinCode;
      }
    }
  } else {
    teamNameEl.textContent = "Команда не створена";
  }

  // --- АВАТАР ---
  if (data.avatarUrl) {
    avatarImg.src = data.avatarUrl;
    avatarImg.style.display = "block";
    avatarPlaceholder.style.display = "none";
  }

  // --- УЧАСНИКИ КОМАНДИ ---
  loadMembers(data.teamId);

  // --- ДОСЯГНЕННЯ ---
  loadStats(data.teamId);
}


// ---- ЗАВАНТАЖЕННЯ УЧАСНИКІВ ----
async function loadMembers(teamId) {
  if (!teamId) {
    membersContainer.innerHTML = `<div class="cabinet-small-muted">Команда не створена</div>`;
    return;
  }

  const q = await db.collection("users").where("teamId", "==", teamId).get();

  let html = "";
  q.forEach((doc) => {
    const u = doc.data();
    html += `
      <div class="member-row">
        <div class="member-avatar">
          <img src="${u.avatarUrl || "assets/img/avatar-default.png"}">
        </div>
        <div class="member-meta">
          <div class="member-name">${u.fullName || "Учасник"}</div>
          <div class="member-role">${u.role === "captain" ? "Капітан" : "Учасник"}</div>
        </div>
      </div>
    `;
  });

  membersContainer.innerHTML = html;
}


// ---- ДОСЯГНЕННЯ (ПОКИ ДЕМКА) ----
async function loadStats(teamId) {
  statsWrapper.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Загальний улов</div>
      <div class="stat-value">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Big Fish</div>
      <div class="stat-value">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Рейтинг</div>
      <div class="stat-value">—</div>
    </div>
  `;
}


// ---- АВАТАР ----
avatarBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const file = avatarInput.files[0];
  if (!file) return;

  const ref = storage.ref(`avatars/${user.uid}/${file.name}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();

  await db.collection("users").doc(user.uid).update({
    avatarUrl: url
  });

  avatarImg.src = url;
  avatarImg.style.display = "block";
  avatarPlaceholder.style.display = "none";
  avatarMsg.textContent = "Оновлено!";
});
