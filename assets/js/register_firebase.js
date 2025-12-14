// assets/js/register_firebase.js
// Реєстрація на ЕТАП: читає users/teams, читає відкриті stages з seasons/*/stages (як в DK Prime),
// пише в registrations.

import { auth, db } from "./firebase-init.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// DOM
const form           = document.getElementById("regForm");
const eventOptionsEl = document.getElementById("eventOptions");
const msgEl          = document.getElementById("msg");
const submitBtn      = document.getElementById("submitBtn");
const spinnerEl      = document.getElementById("spinner");
const hpInput        = document.getElementById("hp");
const foodQtyField   = document.getElementById("foodQtyField");
const foodQtyInput   = document.getElementById("food_qty");
const profileSummary = document.getElementById("profileSummary");
const copyCardBtn    = document.getElementById("copyCard");
const cardNumEl      = document.getElementById("cardNum");

let currentUser = null;
let profileData = { teamId: null, teamName: "", captainName: "", phone: "" };

function showMessage(text, type = "ok") {
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.classList.remove("ok", "err");
  if (text) msgEl.classList.add(type === "ok" ? "ok" : "err");
}

function setLoading(isLoading) {
  if (!submitBtn || !spinnerEl) return;
  submitBtn.disabled = !!isLoading;
  spinnerEl.classList.toggle("spinner--on", !!isLoading);
}

// --- copy card
if (copyCardBtn && cardNumEl) {
  copyCardBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cardNumEl.textContent.trim());
      copyCardBtn.textContent = "Скопійовано ✔";
      setTimeout(() => (copyCardBtn.textContent = "Скопіювати номер картки"), 1200);
    } catch {
      alert("Не вдалося скопіювати номер. Скопіюйте вручну.");
    }
  });
}

// --- FOOD logic
function initFoodLogic() {
  const foodRadios = document.querySelectorAll('input[name="food"]');
  if (!foodRadios.length || !foodQtyField || !foodQtyInput) return;

  function update() {
    const selected = document.querySelector('input[name="food"]:checked');
    const needFood = selected && selected.value === "Так";
    foodQtyField.classList.toggle("field--disabled", !needFood);
    foodQtyInput.disabled = !needFood;
    if (!needFood) foodQtyInput.value = "";
  }

  foodRadios.forEach(r => r.addEventListener("change", update));
  update();
}

// --- load profile from users + teams
async function loadProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error("Профіль користувача не знайдено. Створіть акаунт на сторінці «Акаунт».");
  }

  const u = userSnap.data() || {};
  const fullName = u.fullName || user.email || "";
  const rawPhone = String(u.phone || "").replace(/\s+/g, "");
  let phone = rawPhone;

  if (rawPhone && !rawPhone.startsWith("+380")) {
    if (rawPhone.startsWith("380")) phone = "+" + rawPhone;
    else if (rawPhone.length === 9) phone = "+380" + rawPhone;
  }

  let teamId = u.teamId || null;
  let teamName = "";

  if (teamId) {
    try {
      const teamSnap = await getDoc(doc(db, "teams", teamId));
      if (teamSnap.exists()) teamName = (teamSnap.data() || {}).name || "";
    } catch (e) {
      console.warn("Не вдалося прочитати команду:", e);
    }
  }

  profileData = {
    teamId,
    teamName: teamName || "Без назви",
    captainName: fullName,
    phone: phone || ""
  };

  if (profileSummary) {
    profileSummary.innerHTML = `
      Профіль:
      <br>Команда: <b>${profileData.teamName}</b>
      <br>Капітан: <b>${profileData.captainName}</b>
      <br>Телефон: <b>${profileData.phone || "не вказано"}</b>
    `;
  }
}

// --- load open stages (as DK Prime stores them: seasons/*/stages/*)
async function loadOpenStages() {
  if (!eventOptionsEl) return;

  eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження актуальних етапів...</p>`;

  try {
    // 🔥 ПРАВИЛЬНО: шукаємо відкриті етапи в підколекції seasons/*/stages (collectionGroup)
    const q = query(
      collectionGroup(db, "stages"),
      where("isRegistrationOpen", "==", true)
    );
    const snap = await getDocs(q);

    eventOptionsEl.innerHTML = "";

    if (snap.empty) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>';
      return;
    }

    snap.forEach((docSnap) => {
      const st = docSnap.data() || {};

      // витягуємо seasonId з шляху: seasons/{seasonId}/stages/{stageId}
      const path = docSnap.ref.path; // e.g. "seasons/2026/stages/2026_e1"
      const parts = path.split("/");
      const seasonId = parts[1] || st.seasonId || "";
      const stageId = docSnap.id;

      const title = st.label || st.fullTitle || st.title || `Етап`;

      // value = seasonId||stageId щоб потім правильно читати документ етапу
      const value = `${seasonId}||${stageId}`;

      const wrapper = document.createElement("label");
      wrapper.className = "event-item";
      wrapper.innerHTML = `
        <input type="radio" name="stagePick" value="${value}">
        <div>
          <div>${title}</div>
          <div style="font-size:12px;color:var(--muted);">
            ${seasonId ? `Сезон: ${seasonId}` : ""}
            ${st.isFinal ? " · ФІНАЛ" : ""}
          </div>
        </div>
      `;
      eventOptionsEl.appendChild(wrapper);
    });
  } catch (err) {
    console.error("Помилка завантаження етапів:", err);
    eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити етапи. Перевір доступ/індекс collectionGroup.</p>';
  }
}

// --- auth state
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  await loadOpenStages().catch(console.error);

  if (!user) {
    showMessage("Щоб подати заявку, увійдіть у свій акаунт (сторінка «Акаунт»).", "err");
    if (submitBtn) submitBtn.disabled = true;
    if (profileSummary) profileSummary.textContent = "Ви не залогінені. Спочатку увійдіть у акаунт STOLAR CARP.";
    return;
  }

  try {
    await loadProfile(user);
    initFoodLogic();
    if (submitBtn) submitBtn.disabled = false;
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Помилка завантаження профілю.", "err");
    if (submitBtn) submitBtn.disabled = true;
  }
});

// --- submit
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (hpInput && hpInput.value) {
      showMessage("Підозра на бота. Заявка не відправлена.", "err");
      return;
    }
    if (!currentUser) {
      showMessage("Спочатку увійдіть у свій акаунт.", "err");
      return;
    }

    const picked = document.querySelector('input[name="stagePick"]:checked');
    if (!picked) {
      showMessage("Оберіть етап турніру.", "err");
      return;
    }

    const [seasonId, stageId] = String(picked.value).split("||");

    const foodRadio = document.querySelector('input[name="food"]:checked');
    if (!foodRadio) {
      showMessage("Оберіть, чи потрібне харчування.", "err");
      return;
    }
    const food = foodRadio.value;

    let foodQty = null;
    if (food === "Так") {
      const q = Number(foodQtyInput.value || "0");
      if (!q || q < 1 || q > 6) {
        showMessage("Вкажіть кількість харчуючих від 1 до 6.", "err");
        return;
      }
      foodQty = q;
    }

    // назва етапу (щоб видно в DK Prime без пошуку)
    let stageTitle = "";
    try {
      const stSnap = await getDoc(doc(db, "seasons", seasonId, "stages", stageId));
      if (stSnap.exists()) stageTitle = (stSnap.data() || {}).label || "";
    } catch (err) {
      console.warn("Не вдалося прочитати документ етапу:", err);
    }

    try {
      setLoading(true);
      showMessage("");

      await addDoc(collection(db, "registrations"), {
        // ✅ ВАЖЛИВО: під правила доступу — поле має бути uid
        uid:       currentUser.uid,

        seasonId,
        stageId,
        stageTitle: stageTitle || `Етап (${stageId})`,

        teamId:    profileData.teamId,
        teamName:  profileData.teamName,
        captain:   profileData.captainName,
        phone:     profileData.phone,

        food,
        foodQty:   foodQty ?? null,

        status:    "pending_payment",
        createdAt: serverTimestamp()
      });

      showMessage("Заявку відправлено! Після оплати організатор підтвердить участь у адмінці.", "ok");
      form.reset();
      initFoodLogic();
    } catch (err) {
      console.error("Помилка відправки заявки:", err);
      showMessage(`Помилка відправки заявки: ${err.message || err}`, "err");
    } finally {
      setLoading(false);
    }
  });
} else {
  console.warn("Форма #regForm не знайдена на сторінці");
}
