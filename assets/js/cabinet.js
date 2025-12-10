// assets/js/cabinet.js
import { auth, db, storage, firebase } from "./firebase-init.js";

const profileSubtitle = document.getElementById("profileSubtitle");
const teamNameText = document.getElementById("teamNameText");
const captainText = document.getElementById("captainText");
const userRoleText = document.getElementById("userRoleText");
const userPhoneText = document.getElementById("userPhoneText");
const joinCodePill = document.getElementById("joinCodePill");
const joinCodeText = document.getElementById("joinCodeText");

const avatarFileInput = document.getElementById("avatarFile");
const avatarUploadBtn = document.getElementById("avatarUploadBtn");
const avatarImg = document.getElementById("cabinetAvatarImg");
const avatarPlaceholder = document.getElementById("cabinetAvatarPlaceholder");
const avatarMsg = document.getElementById("avatarMsg");

const membersContainer = document.getElementById("membersContainer");
const statsWrapper = document.getElementById("statsWrapper");
const errorBox = document.getElementById("cabinetError");

function setError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.style.color = "#fca5a5";
}

function clearError() {
  if (!errorBox) return;
  errorBox.textContent = "";
  errorBox.style.color = "#6b7280";
}

// --------- пошук команди користувача ---------
async function findUsersTeam(userUid, userData) {
  // 1) якщо є поле teamId
  if (userData.teamId) {
    const tDoc = await db.collection("teams").doc(userData.teamId).get();
    if (tDoc.exists) {
      return { id: tDoc.id, data: tDoc.data() };
    }
  }

  // 2) команда де ownerUid = uid (капітан створив)
  const ownSnap = await db
    .collection("teams")
    .where("ownerUid", "==", userUid)
    .limit(1)
    .get();

  if (!ownSnap.empty) {
    const d = ownSnap.docs[0];
    return { id: d.id, data: d.data() };
  }

  // 3) запасний варіант — по joinCode
  if (userData.joinCode) {
    const joinSnap = await db
      .collection("teams")
      .where("joinCode", "==", userData.joinCode)
      .limit(1)
      .get();

    if (!joinSnap.empty) {
      const d = joinSnap.docs[0];
      return { id: d.id, data: d.data() };
    }
  }

  return null;
}

// --------- завантаження кабінету ---------
async function loadCabinet(user) {
  clearError();
  if (profileSubtitle) profileSubtitle.textContent = "Завантаження профілю…";

  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      if (profileSubtitle) {
        profileSubtitle.textContent =
          "Профіль користувача не знайдено. Завершіть реєстрацію акаунта.";
      }
      return;
    }

    const u = userDoc.data();

    const fullName = u.fullName || u.name || user.email || "Без імені";
    const phone = u.phone || "";
    const roleRaw = u.role || "member";

    let roleLabel = "Учасник команди";
    if (roleRaw === "captain") roleLabel = "Капітан команди";
    else if (roleRaw === "admin") roleLabel = "Адмін / суддя";

    // Основні поля
    if (captainText) {
      captainText.textContent = `${fullName} — ${roleLabel.toLowerCase()}`;
    }
    if (userRoleText) userRoleText.textContent = roleLabel;
    if (userPhoneText) userPhoneText.textContent = phone || "—";

    // Аватар
    const avatarUrl = u.avatarUrl;
    if (avatarUrl) {
      if (avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      }
      if (avatarPlaceholder) {
        avatarPlaceholder.style.display = "none";
      }
    } else {
      if (avatarPlaceholder) {
        const initials = fullName
          .trim()
          .split(/\s+/)
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        avatarPlaceholder.textContent = initials || "SC";
      }
    }

    // Команда
    const team = await findUsersTeam(user.uid, u);
    if (team) {
      const t = team.data;
      if (teamNameText) {
        teamNameText.textContent = t.name || t.teamName || "Без назви";
      }
      if (t.joinCode && joinCodeText && joinCodePill) {
        joinCodeText.textContent = t.joinCode;
        joinCodePill.style.display = "inline-flex";
      } else if (joinCodePill) {
        joinCodePill.style.display = "none";
      }
    } else {
      if (teamNameText) {
        teamNameText.textContent = u.teamName || "Без назви";
      }
      if (joinCodePill) joinCodePill.style.display = "none";
    }

    if (profileSubtitle) {
      profileSubtitle.textContent = "Ваш профіль успішно завантажено.";
    }

    // Учасники
    await loadMembers(u, team);

    // Статистика
    loadStats(u);

  } catch (err) {
    console.error(err);
    if (profileSubtitle) {
      profileSubtitle.textContent = "Сталася помилка при завантаженні профілю.";
    }
    setError(err.message || "Не вдалося прочитати дані з Firestore.");
  }
}

async function loadMembers(userData, teamObj) {
  if (!membersContainer) return;

  membersContainer.innerHTML = "";

  let teamId = userData.teamId;
  if (!teamId && teamObj) teamId = teamObj.id;

  if (!teamId) {
    membersContainer.innerHTML =
      '<div class="cabinet-small-muted">Команда ще не привʼязана. Завершіть реєстрацію капітана або приєднайтесь до команди за кодом.</div>';
    return;
  }

  const snap = await db
    .collection("users")
    .where("teamId", "==", teamId)
    .get();

  if (snap.empty) {
    membersContainer.innerHTML =
      '<div class="cabinet-small-muted">Поки що в команді тільки ви. Інші учасники зʼявляться після приєднання за кодом.</div>';
    return;
  }

  snap.forEach((doc) => {
    const m = doc.data();

    const row = document.createElement("div");
    row.className = "member-row";

    const avatar = document.createElement("div");
    avatar.className = "member-avatar";
    const initials = (m.name || m.fullName || "?")
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    avatar.textContent = initials;

    const meta = document.createElement("div");
    meta.className = "member-meta";

    const nameEl = document.createElement("div");
    nameEl.className = "member-name";
    nameEl.textContent = m.name || m.fullName || "Без імені";

    const roleEl = document.createElement("div");
    roleEl.className = "member-role";
    const r = m.role || "member";
    let rLabel = "Учасник";
    if (r === "captain") rLabel = "Капітан";
    else if (r === "admin") rLabel = "Адмін / суддя";
    roleEl.textContent = rLabel;

    meta.appendChild(nameEl);
    meta.appendChild(roleEl);

    row.appendChild(avatar);
    row.appendChild(meta);

    membersContainer.appendChild(row);
  });
}

function loadStats(userData) {
  if (!statsWrapper) return;

  statsWrapper.innerHTML = "";

  const stats = userData.seasonStats || {};
  const total = stats.totalWeightKg ?? "—";
  const big = stats.bigFishKg ?? "—";
  const rank = stats.rank ?? "—";

  const grid = document.createElement("div");
  grid.className = "stats-grid";

  function addStat(label, value, unit) {
    const card = document.createElement("div");
    card.className = "stat-card";

    const l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;

    const v = document.createElement("div");
    v.className = "stat-value";
    v.textContent = value;

    if (unit) {
      const uEl = document.createElement("span");
      uEl.className = "stat-unit";
      uEl.textContent = unit;
      v.appendChild(uEl);
    }

    card.appendChild(l);
    card.appendChild(v);
    grid.appendChild(card);
  }

  addStat("Загальний улов за сезон", total, total === "—" ? "" : "кг");
  addStat("Найбільша риба (Big Fish)", big, big === "—" ? "" : "кг");
  addStat("Місце у сезонному рейтингу", rank, "");

  statsWrapper.appendChild(grid);
}

// --------- завантаження аватара ---------
if (avatarUploadBtn && avatarFileInput) {
  avatarUploadBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      setError("Щоб змінити аватар, увійдіть у акаунт.");
      return;
    }

    const file = avatarFileInput.files[0];
    if (!file) {
      setError("Оберіть файл зображення.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Файл має бути зображенням (jpg, png…).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Файл завеликий (максимум 5 МБ).");
      return;
    }

    clearError();
    if (avatarMsg) avatarMsg.textContent = "Завантаження…";

    try {
      const ext = file.name.split(".").pop().toLowerCase() || "jpg";
      const path = `avatars/${user.uid}/avatar.${ext}`;
      const ref = storage.ref().child(path);

      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();

      await db.collection("users").doc(user.uid).update({ avatarUrl: url });

      if (avatarImg) {
        avatarImg.src = url;
        avatarImg.style.display = "block";
      }
      if (avatarPlaceholder) {
        avatarPlaceholder.style.display = "none";
      }

      if (avatarMsg) avatarMsg.textContent = "Збережено ✔";
    } catch (err) {
      console.error(err);
      if (avatarMsg) avatarMsg.textContent = "Помилка при завантаженні.";
      setError("Не вдалося завантажити фото. Спробуйте ще раз.");
    }
  });
}

// --------- слухач авторизації ---------
auth.onAuthStateChanged((user) => {
  if (!user) {
    // в кабінет заходять тільки залогінені
    window.location.href = "auth.html";
    return;
  }
  loadCabinet(user);
});
