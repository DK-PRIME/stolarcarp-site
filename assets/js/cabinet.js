// assets/js/cabinet.js
import { auth, db, storage, firebase } from "./firebase-init.js";

const loadingEl   = document.getElementById("cabinetLoading");
const contentEl   = document.getElementById("cabinetContent");
const avatarImg   = document.getElementById("avatarImg");
const avatarInput = document.getElementById("avatarInput");

const profileName = document.getElementById("profileName");
const profileRole = document.getElementById("profileRole");
const profileCity = document.getElementById("profileCity");

const teamNameEl   = document.getElementById("teamName");
const teamJoinCode = document.getElementById("teamJoinCode");
const teamPhoneEl  = document.getElementById("teamPhone");

const appsSummary  = document.getElementById("applicationsSummary");
const msgEl        = document.getElementById("cabinetMsg");

// статистика
const statsSeasonEl = document.getElementById("statsSeason");
const statsBigFishEl = document.getElementById("statsBigFish");
const statsRankEl = document.getElementById("statsRank");

function showError(text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.classList.remove("ok");
  msgEl.classList.add("err");
}

function clearError() {
  if (!msgEl) return;
  msgEl.textContent = "";
  msgEl.classList.remove("ok", "err");
}

// ---------- ЗАВАНТАЖЕННЯ ПРОФІЛЮ ----------
async function loadCabinet(user) {
  try {
    clearError();

    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new Error("Профіль користувача не знайдено. Завершіть реєстрацію акаунта.");
    }

    const data = userSnap.data();

    // Основні дані
    const fullName = data.fullName || data.name || user.email || "Без імені";
    const city = data.city || "";
    const phone = data.phone || "";
    const role = data.role === "captain" ? "Капітан команди" : "Учасник команди";

    profileName.textContent = fullName;
    profileRole.textContent = role;
    profileCity.textContent = city ? `Місто: ${city}` : "";

    // Команда
    let teamName = data.teamName || "Без назви";
    let joinCodeText = "—";

    if (data.teamId) {
      try {
        const teamSnap = await db.collection("teams").doc(data.teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data();
          teamName = t.name || t.teamName || teamName;
          if (t.joinCode) {
            joinCodeText = t.joinCode;
          }
        }
      } catch (e) {
        console.warn("Помилка читання команди:", e);
      }
    }

    teamNameEl.textContent = teamName;
    teamJoinCode.textContent = `Код приєднання: ${joinCodeText}`;
    teamPhoneEl.textContent  = phone ? `Телефон капітана: ${phone}` : "";

    // Аватар
    const avatarUrl = data.avatarUrl || "assets/img/avatar-default.png";
    avatarImg.src = avatarUrl;

    // Статистика (поки optional, беремо з поля seasonStats, якщо є)
    const stats = data.seasonStats || {};
    if (statsSeasonEl) {
      statsSeasonEl.textContent =
        `Загальний улов за сезон: ${stats.totalWeightKg ?? "—"} кг`;
    }
    if (statsBigFishEl) {
      statsBigFishEl.textContent =
        `Найбільша риба (Big Fish): ${stats.bigFishKg ?? "—"} кг`;
    }
    if (statsRankEl) {
      statsRankEl.textContent =
        `Поточне місце у сезонному рейтингу: ${stats.rank ?? "—"}.`;
    }

    // Заявки (поки тільки коротке резюме)
    const regsSnap = await db
      .collection("registrations")
      .where("userUid", "==", user.uid)
      .get();

    if (regsSnap.empty) {
      appsSummary.textContent =
        "Заявок на етапи поки немає. Ви можете подати першу заявку на сторінці «Реєстрація».";
    } else {
      const count = regsSnap.size;
      appsSummary.textContent =
        `Подано заявок на етапи: ${count}. Деталі участі відображаються в адмінці DK Prime.`;
    }

  } catch (err) {
    console.error(err);
    showError(err.message || "Не вдалося завантажити дані кабінету.");
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }
}

// ---------- ЗАВАНТАЖЕННЯ АВАТАРУ ----------
async function uploadAvatar(user, file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showError("Оберіть файл зображення (jpg, png тощо).");
    return;
  }
  if (file.size > 5 * 1024 * 1024) { // 5 МБ
    showError("Файл завеликий. Максимум 5 МБ.");
    return;
  }

  clearError();

  try {
    const ext = file.name.split(".").pop().toLowerCase() || "jpg";
    const path = `avatars/${user.uid}/avatar.${ext}`;

    const storageRef = storage.ref().child(path);

    // завантаження
    const snapshot = await storageRef.put(file);
    const url = await snapshot.ref.getDownloadURL();

    // зберігаємо url в users/{uid}
    await db.collection("users").doc(user.uid).update({
      avatarUrl: url
    });

    avatarImg.src = url;
    msgEl.textContent = "Аватар оновлено!";
    msgEl.classList.remove("err");
    msgEl.classList.add("ok");
  } catch (err) {
    console.error("Помилка завантаження аватара:", err);
    showError("Не вдалося завантажити фото. Спробуйте ще раз.");
  }
}

// ---------- СЛУХАЧ АВТОРИЗАЦІЇ ----------
auth.onAuthStateChanged((user) => {
  if (!user) {
    // якщо не залогінений — відправляємо на сторінку авторизації
    window.location.href = "auth.html";
    return;
  }
  loadCabinet(user);
});

// ---------- LISTENER НА ІНПУТ АВАТАРУ ----------
if (avatarInput) {
  avatarInput.addEventListener("change", (e) => {
    const user = auth.currentUser;
    if (!user) {
      showError("Щоб змінити аватар, увійдіть у акаунт.");
      return;
    }
    const file = e.target.files[0];
    if (file) uploadAvatar(user, file);
  });
}
