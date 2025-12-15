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
  collectionGroup,
  limit
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

function renderStageOption({ seasonId, stageId, title, isFinal }) {
  const value = `${seasonId}||${stageId}`;

  const wrapper = document.createElement("label");
  wrapper.className = "event-item";
  wrapper.innerHTML = `
    <input type="radio" name="stagePick" value="${value}">
    <div>
      <div>${title}</div>
      <div style="font-size:12px;color:var(--muted);">
        ${seasonId ? `Сезон: ${seasonId}` : ""}
        ${isFinal ? " · ФІНАЛ" : ""}
      </div>
    </div>
  `;
  eventOptionsEl.appendChild(wrapper);
}

// --- load open stages
async function loadOpenStages() {
  if (!eventOptionsEl) return;

  eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження актуальних етапів...</p>`;

  // 1) СПРОБА №1 — collectionGroup (як ти хотів)
  try {
    const q1 = query(
      collectionGroup(db, "stages"),
      where("isRegistrationOpen", "==", true)
    );
    const snap1 = await getDocs(q1);

    eventOptionsEl.innerHTML = "";

    if (!snap1.empty) {
      snap1.forEach((docSnap) => {
        const st = docSnap.data() || {};
        const parts = docSnap.ref.path.split("/"); // seasons/{seasonId}/stages/{stageId}
        const seasonId = parts[1] || st.seasonId || "";
        const stageId  = docSnap.id;
        const title    = st.label || st.fullTitle || st.title || "Етап";
        renderStageOption({ seasonId, stageId, title, isFinal: !!st.isFinal });
      });
      return; // ✅ успіх
    }

    eventOptionsEl.innerHTML =
      '<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>';
    return;
  } catch (err) {
    // тут важливо побачити КОД помилки
    console.error("Помилка collectionGroup(stages):", err);

    const code = err?.code || "";
    const msg  = err?.message || String(err);

    // Показуємо людині зрозуміло:
    eventOptionsEl.innerHTML = `
      <p class="form__hint" style="color:#ff6c6c;">
        Не вдалося завантажити етапи (collectionGroup). Код: <b>${code || "?"}</b>
        <br><span style="opacity:.8">${msg}</span>
        <br>Пробую резервний спосіб…
      </p>
    `;

    // 2) СПРОБА №2 — fallback без collectionGroup (найчастіше рятує)
    try {
      // Беремо сезон(и) 2026 (бо в тебе так і є). Якщо буде інший — скажеш, зробимо авто.
      const seasonsSnap = await getDocs(
        query(collection(db, "seasons"), where("year", "==", 2026), limit(5))
      );

      // якщо раптом поле year не підходить — просто беремо docId "2026"
      let seasonIds = [];
      if (!seasonsSnap.empty) {
        seasonsSnap.forEach(s => seasonIds.push(s.id));
      } else {
        seasonIds = ["2026"];
      }

      const foundStages = [];

      for (const seasonId of seasonIds) {
        const stagesSnap = await getDocs(
          query(
            collection(db, "seasons", seasonId, "stages"),
            where("isRegistrationOpen", "==", true)
          )
        );

        stagesSnap.forEach(stDoc => {
          const st = stDoc.data() || {};
          foundStages.push({
            seasonId,
            stageId: stDoc.id,
            title: st.label || st.fullTitle || st.title || "Етап",
            isFinal: !!st.isFinal
          });
        });
      }

      eventOptionsEl.innerHTML = "";

      if (!foundStages.length) {
        eventOptionsEl.innerHTML =
          '<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>';
        return;
      }

      foundStages.forEach(renderStageOption);
      return;
    } catch (err2) {
      console.error("Fallback теж не спрацював:", err2);

      const code2 = err2?.code || "";
      const msg2  = err2?.message || String(err2);

      eventOptionsEl.innerHTML = `
        <p class="form__hint" style="color:#ff6c6c;">
          Не вдалося завантажити етапи навіть резервним способом.
          <br>Код: <b>${code2 || "?"}</b>
          <br><span style="opacity:.8">${msg2}</span>
        </p>
      `;
    }
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
      const qn = Number(foodQtyInput.value || "0");
      if (!qn || qn < 1 || qn > 6) {
        showMessage("Вкажіть кількість харчуючих від 1 до 6.", "err");
        return;
      }
      foodQty = qn;
    }

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
        uid: currentUser.uid,

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
      showMessage(`Помилка відправки заявки: ${err?.message || err}`, "err");
    } finally {
      setLoading(false);
    }
  });
} else {
  console.warn("Форма #regForm не знайдена на сторінці");
}
