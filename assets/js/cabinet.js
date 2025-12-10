// assets/js/cabinet.js
import { auth, db, storage } from "./firebase-init.js";

const profileSubtitle = document.getElementById("profileSubtitle");

const teamNameText   = document.getElementById("teamNameText");
const captainText    = document.getElementById("captainText");
const userRoleText   = document.getElementById("userRoleText");
const userPhoneText  = document.getElementById("userPhoneText");
const joinCodePill   = document.getElementById("joinCodePill");
const joinCodeText   = document.getElementById("joinCodeText");

const membersContainer       = document.getElementById("membersContainer");
const statsWrapper           = document.getElementById("statsWrapper");

const avatarImg              = document.getElementById("cabinetAvatarImg");
const avatarPlaceholder      = document.getElementById("cabinetAvatarPlaceholder");
const avatarFileInput        = document.getElementById("avatarFile");
const avatarUploadBtn        = document.getElementById("avatarUploadBtn");
const avatarMsg              = document.getElementById("avatarMsg");

// ----------------- helpers -----------------
function setSubtitle(text) {
  if (profileSubtitle) profileSubtitle.textContent = text;
}

function setAvatar(url, letters = "SC") {
  if (!avatarImg || !avatarPlaceholder) return;

  if (url) {
    avatarImg.src = url;
    avatarImg.style.display = "block";
    avatarPlaceholder.style.display = "none";
  } else {
    avatarImg.style.display = "none";
    avatarPlaceholder.style.display = "flex";
    avatarPlaceholder.textContent = letters;
  }
}

function setAvatarMsg(text, ok = false) {
  if (!avatarMsg) return;
  avatarMsg.textContent = text || "";
  avatarMsg.classList.remove("ok", "err");
  if (!text) return;
  avatarMsg.classList.add(ok ? "ok" : "err");
}

// ----------------- load cabinet -----------------
async function loadCabinet(user) {
  try {
    setSubtitle("Завантаження профілю…");
    setAvatarMsg("");

    // 1. Профіль користувача
    const userRef  = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      setSubtitle("Профіль користувача не знайдено. Завершіть реєстрацію акаунта.");
      return;
    }

    const u = userSnap.data();

    const fullName   = u.name || u.fullName || user.email || "Без імені";
    const phone      = u.phone || "—";
    const roleRaw    = u.role || "captain";
    const isCaptain  = roleRaw === "captain" || roleRaw === "admin";

    const roleText =
      roleRaw === "admin"
        ? "Адмін"
        : roleRaw === "captain"
        ? "Капітан команди"
        : "Учасник команди";

    userRoleText.textContent  = roleText;
    userPhoneText.textContent = phone;

    // 2. Команда (спершу по teamId, якщо нема — шукаємо team.ownerUid == uid)
    let teamDoc = null;

    if (u.teamId) {
      const tSnap = await db.collection("teams").doc(u.teamId).get();
      if (tSnap.exists) teamDoc = tSnap;
    }

    if (!teamDoc) {
      const q = await db
        .collection("teams")
        .where("ownerUid", "==", user.uid)
        .limit(1)
        .get();
      if (!q.empty) teamDoc = q.docs[0];
    }

    let teamName = "Без назви";
    let joinCode = null;

    if (teamDoc) {
      const t = teamDoc.data();
      teamName = t.name || t.teamName || teamName;
      joinCode = t.joinCode || null;
    }

    teamNameText.textContent = teamName;
    captainText.textContent  = `Капітан: ${fullName}`;

    if (joinCode) {
      joinCodeText.textContent = joinCode;
      joinCodePill.style.display = "inline-flex";
    } else {
      joinCodePill.style.display = "none";
    }

    // avatar letters з назви команди
    const letters = teamName
      .split(" ")
      .filter(Boolean)
      .map(w => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "SC";

    setAvatar(u.avatarUrl || "", letters);

    // 3. Склад команди
    if (membersContainer) {
      membersContainer.innerHTML = "";

      const meRow = document.createElement("div");
      meRow.className = "member-row";
      meRow.innerHTML = `
        <div class="member-avatar">
          <span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:.8rem;">
            ${letters}
          </span>
        </div>
        <div class="member-meta">
          <div class="member-name">${fullName}</div>
          <div class="member-role">${roleText}</div>
        </div>
      `;
      membersContainer.appendChild(meRow);

      // Якщо пізніше будуть інші учасники, можна сюди додати читання subcollection teamMembers.
    }

    // 4. Статистика (поки робимо заглушку з даних профілю, щоб щось було)
    if (statsWrapper) {
      const stats = u.seasonStats || {};
      const totalWeight = stats.totalWeightKg ?? "—";
      const bigFish     = stats.bigFishKg ?? "—";
      const rank        = stats.rank ?? "—";

      statsWrapper.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Загальний улов за сезон</div>
            <div class="stat-value">${totalWeight}<span class="stat-unit">кг</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Найбільша риба</div>
            <div class="stat-value">${bigFish}<span class="stat-unit">кг</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Місце в сезоні</div>
            <div class="stat-value">${rank}</div>
          </div>
        </div>
        <div class="cabinet-small-muted">
          Детальна статистика буде підключена з адмінки DK PRIME.
        </div>
      `;
    }

    setSubtitle("Профіль завантажено.");
  } catch (err) {
    console.error(err);
    setSubtitle("Помилка завантаження профілю.");
    setAvatarMsg("Не вдалося завантажити дані кабінету.", false);
  }
}

// ----------------- avatar upload -----------------
async function uploadAvatar(user) {
  const file = avatarFileInput?.files?.[0];
  if (!file) {
    setAvatarMsg("Оберіть файл зображення.", false);
    return;
  }

  if (!file.type.startsWith("image/")) {
    setAvatarMsg("Потрібне зображення (jpg, png…).", false);
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setAvatarMsg("Файл завеликий (макс 5 МБ).", false);
    return;
  }

  try {
    setAvatarMsg("Завантаження…", true);

    // У Firebase Storage зараз потрібен платний (Blaze) план.
    // Якщо його нема – тут буде помилка в консолі.
    const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `avatars/${user.uid}/avatar.${ext}`;

    const ref  = storage.ref().child(path);
    const snap = await ref.put(file);
    const url  = await snap.ref.getDownloadURL();

    await db.collection("users").doc(user.uid).update({ avatarUrl: url });

    setAvatar(url);
    setAvatarMsg("Аватар оновлено.", true);
  } catch (err) {
    console.error("Помилка завантаження аватара:", err);
    setAvatarMsg("Не вдалося завантажити фото (перевір Storage / тариф).", false);
  }
}

// ----------------- auth listener -----------------
auth.onAuthStateChanged((user) => {
  if (!user) {
    // якщо не залогінений — відправляємо на сторінку авторизації
    window.location.href = "auth.html";
    return;
  }

  loadCabinet(user);

  if (avatarUploadBtn && avatarFileInput) {
    avatarUploadBtn.onclick = () => uploadAvatar(user);
  }
});
