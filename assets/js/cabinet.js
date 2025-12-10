// assets/js/cabinet.js
// очікуємо, що firebase вже ініціалізований у firebase-init.js

// якщо в firebase-init.js ти робиш initializeApp, то тут просто:
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Елементи
const statusEl      = document.getElementById("cabinetStatus");
const contentEl     = document.getElementById("cabinetContent");

const avatarImg     = document.getElementById("cabinetAvatarImg");
const avatarPh      = document.getElementById("cabinetAvatarPlaceholder");
const avatarFileInp = document.getElementById("avatarFile");
const avatarBtn     = document.getElementById("avatarUploadBtn");
const msgEl         = document.getElementById("cabinetMsg");

const teamNameText  = document.getElementById("teamNameText");
const captainText   = document.getElementById("captainText");
const userRoleText  = document.getElementById("userRoleText");
const userPhoneText = document.getElementById("userPhoneText");
const joinCodePill  = document.getElementById("joinCodePill");
const joinCodeText  = document.getElementById("joinCodeText");

const membersContainer = document.getElementById("membersContainer");

const statTotalWeight = document.getElementById("statTotalWeight");
const statBigFish     = document.getElementById("statBigFish");
const statRank        = document.getElementById("statRank");

function showMsg(text, type = "err") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.classList.remove("ok", "err");
  msgEl.classList.add(type);
}

function clearMsg() {
  if (!msgEl) return;
  msgEl.textContent = "";
  msgEl.classList.remove("ok", "err");
}

// Завантаження даних користувача
async function loadCabinet(user) {
  try {
    clearMsg();
    statusEl.textContent = "Завантаження профілю…";

    const userRef = db.collection("users").doc(user.uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      statusEl.textContent = "Профіль не знайдено. Завершіть реєстрацію акаунта.";
      return;
    }

    const data = snap.data() || {};

    const fullName = data.fullName || data.name || user.email || "Без імені";
    const phone    = data.phone || data.phoneNumber || "—";
    const teamName = data.teamName || data.team || "Без назви";
    const roleRaw  = (data.role || "").toLowerCase();

    let roleDisplay = "Учасник команди";
    if (roleRaw === "captain") roleDisplay = "Капітан команди";
    if (roleRaw === "admin")  roleDisplay = "Адмін / Організатор";

    teamNameText.textContent  = teamName;
    captainText.textContent   = `Капітан: ${fullName}`;
    userRoleText.textContent  = roleDisplay;
    userPhoneText.textContent = phone;

    // joinCode: беремо з users, або шукаємо в teams за ownerUid
    let joinCode = data.joinCode || "";
    if (!joinCode) {
      const teamSnap = await db.collection("teams")
        .where("ownerUid", "==", user.uid)
        .limit(1)
        .get();
      if (!teamSnap.empty) {
        const t = teamSnap.docs[0].data() || {};
        if (!data.teamName && (t.name || t.teamName)) {
          teamNameText.textContent = t.name || t.teamName;
        }
        joinCode = t.joinCode || "";
      }
    }
    if (joinCode) {
      joinCodeText.textContent = joinCode;
      joinCodePill.style.display = "inline-flex";
    } else {
      joinCodePill.style.display = "none";
    }

    // Аватар
    const avatarUrl = data.avatarUrl || "";
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
      avatarPh.style.display = "none";
    } else {
      avatarImg.style.display = "none";
      avatarPh.style.display  = "block";
      avatarPh.textContent    = (teamName || "SC").substring(0,2).toUpperCase();
    }

    // Склад команди – поки що тільки один рядок з капітаном
    membersContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div class="member-meta">
        <div class="member-name">${fullName}</div>
        <div class="member-role">${roleDisplay}</div>
      </div>
    `;
    membersContainer.appendChild(row);

    // Статистика (поки береться з поля seasonStats, якщо є)
    const stats = data.seasonStats || {};
    statTotalWeight.textContent = stats.totalWeightKg != null ? stats.totalWeightKg : "—";
    statBigFish.textContent     = stats.bigFishKg != null ? stats.bigFishKg : "—";
    statRank.textContent        = stats.rank != null ? stats.rank : "—";

    statusEl.textContent = "Ваш профіль завантажено.";
    contentEl.style.display = "grid";

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Не вдалося завантажити дані кабінету.";
    showMsg(err.message || "Сталася помилка.", "err");
  }
}

// Завантаження аватара
async function uploadAvatar(user, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showMsg("Оберіть файл зображення (jpg, png тощо).", "err");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showMsg("Файл завеликий. Максимум 5 МБ.", "err");
    return;
  }

  clearMsg();
  try {
    const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `avatars/${user.uid}/avatar.${ext}`;
    const ref  = storage.ref().child(path);

    const snap = await ref.put(file);
    const url  = await snap.ref.getDownloadURL();

    await db.collection("users").doc(user.uid).update({ avatarUrl: url });

    avatarImg.src = url;
    avatarImg.style.display = "block";
    avatarPh.style.display  = "none";

    showMsg("Аватар оновлено!", "ok");
  } catch (err) {
    console.error(err);
    showMsg("Не вдалося завантажити фото. Спробуйте ще раз.", "err");
  }
}

// Слухач авторизації
auth.onAuthStateChanged((user) => {
  if (!user) {
    // гість — відправляємо на сторінку входу
    window.location.href = "auth.html";
    return;
  }
  loadCabinet(user);
});

// Обробник кнопки аватара
if (avatarBtn && avatarFileInp) {
  avatarBtn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) {
      showMsg("Щоб змінити аватар, спочатку увійдіть у акаунт.", "err");
      return;
    }
    const file = avatarFileInp.files && avatarFileInp.files[0];
    if (!file) {
      showMsg("Оберіть файл зображення.", "err");
      return;
    }
    uploadAvatar(user, file);
  });
}
