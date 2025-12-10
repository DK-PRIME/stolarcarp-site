// assets/js/register_firebase.js
// Реєстрація на ЕТАП: читає users/teams, пише в registrations.
// DK Prime читає цю ж колекцію і підтверджує заявку.

import { auth, db } from "./firebase-init.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

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

// кеш даних профілю
let currentUser = null;
let profileData = {
  teamId: null,
  teamName: "",
  captainName: "",
  phone: ""
};

function showMessage(text, type = "ok") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.classList.remove("ok", "err");
  msgEl.classList.add(type === "ok" ? "ok" : "err");
}

function setLoading(isLoading) {
  if (!submitBtn || !spinnerEl) return;
  submitBtn.disabled = isLoading;
  spinnerEl.classList.toggle("spinner--on", isLoading);
}

// ----------------- копіювання карти -----------------
if (copyCardBtn && cardNumEl) {
  copyCardBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cardNumEl.textContent.trim());
      copyCardBtn.textContent = "Скопійовано ✔";
      setTimeout(() => {
        copyCardBtn.textContent = "Скопіювати номер картки";
      }, 1200);
    } catch {
      alert("Не вдалося скопіювати номер. Скопіюйте вручну.");
    }
  });
}

// ----------------- відкриті етапи -----------------
async function loadOpenStages() {
  if (!eventOptionsEl) return;

  try {
    const q = query(
      collection(db, "stages"),
      where("isRegistrationOpen", "==", true)
    );
    const snap = await getDocs(q);

    eventOptionsEl.innerHTML = "";

    if (snap.empty) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>';
      return;
    }

    snap.forEach(docSnap => {
      const st = docSnap.data();
      const id = docSnap.id;

      const title =
        st.fullTitle ||
        st.title ||
        `${st.seasonTitle || ""} — ${st.name || st.stageName || "Етап"}`;

      const wrapper = document.createElement("label");
      wrapper.className = "event-item";
      wrapper.innerHTML = `
        <input type="radio" name="stageId" value="${id}">
        <div>
          <div>${title}</div>
          ${
            st.type === "final"
              ? '<div style="font-size:12px;color:var(--muted);">ФІНАЛ сезону</div>'
              : ""
          }
        </div>
      `;
      eventOptionsEl.appendChild(wrapper);
    });
  } catch (err) {
    console.error("Помилка завантаження етапів:", err);
    eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити етапи. Спробуйте пізніше.</p>';
  }
}

// ----------------- завантаження профілю -----------------
async function loadProfile(user) {
  if (!user) throw new Error("Немає авторизованого користувача");

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error("Профіль користувача не знайдено. Створіть акаунт на сторінці Акаунт.");
  }

  const u = userSnap.data();

  const fullName = u.fullName || user.email || "";
  const rawPhone = (u.phone || "").replace(/\s+/g, "");
  let phone = rawPhone;
  // нормалізуємо на +380...
  if (rawPhone && !rawPhone.startsWith("+380")) {
    if (rawPhone.startsWith("380")) phone = "+" + rawPhone;
    else if (rawPhone.length === 9) phone = "+380" + rawPhone;
  }

  let teamName = "";
  let teamId   = u.teamId || null;

  if (teamId) {
    try {
      const teamSnap = await getDoc(doc(db, "teams", teamId));
      if (teamSnap.exists()) {
        const t = teamSnap.data();
        teamName = t.name || t.teamName || "";
      }
    } catch (err) {
      console.warn("Не вдалося прочитати команду:", err);
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

// ----------------- харчування -----------------
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

// ----------------- auth state -----------------
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  await loadOpenStages().catch(console.error);

  if (!user) {
    showMessage(
      "Щоб подати заявку, увійдіть у свій акаунт (сторінка «Акаунт»).",
      "err"
    );
    if (submitBtn) submitBtn.disabled = true;
    if (profileSummary) {
      profileSummary.textContent = "Ви не залогінені. Спочатку увійдіть у акаунт STOLAR CARP.";
    }
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

// ----------------- сабміт форми -----------------
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

    const stageRadio = document.querySelector('input[name="stageId"]:checked');
    if (!stageRadio) {
      showMessage("Оберіть етап турніру.", "err");
      return;
    }
    const stageId = stageRadio.value;

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

    // дістаємо назву етапу (щоб не шукати потім в адмінці)
    let stageTitle = "";
    try {
      const stSnap = await getDoc(doc(db, "stages", stageId));
      if (stSnap.exists()) {
        const st = stSnap.data();
        stageTitle =
          st.fullTitle ||
          st.title ||
          `${st.seasonTitle || ""} — ${st.name || st.stageName || "Етап"}`;
      }
    } catch (err) {
      console.warn("Не вдалося прочитати документ етапу:", err);
    }

    try {
      setLoading(true);
      showMessage("");

      await addDoc(collection(db, "registrations"), {
        userUid:   currentUser.uid,
        teamId:    profileData.teamId,
        teamName:  profileData.teamName,
        captain:   profileData.captainName,
        phone:     profileData.phone,
        stageId,
        stageTitle,
        food,
        foodQty:   foodQty ?? null,
        status:    "pending_payment", // DK Prime може змінити на confirmed / rejected
        createdAt: serverTimestamp()
      });

      showMessage(
        "Заявку відправлено! Після оплати організатор підтвердить участь у адмінці.",
        "ok"
      );
      form.reset();
      initFoodLogic();
    } catch (err) {
      console.error("Помилка відправки заявки:", err);
      showMessage(
        `Помилка відправки заявки: ${err.message || err}`,
        "err"
      );
    } finally {
      setLoading(false);
    }
  });
} else {
  console.warn("Форма #regForm не знайдена на сторінці");
}
