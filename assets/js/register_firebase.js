// assets/js/register_firebase.js
// Реєстрація на ЕТАПИ зі сторони STOLAR CARP
// Використовує compat-версію Firebase через firebase-init.js

import { auth, db, firebase } from "./firebase-init.js";

// ------- DOM-елементи -------
const form           = document.getElementById("regForm");
const eventOptionsEl = document.getElementById("eventOptions");
const msgEl          = document.getElementById("msg");
const submitBtn      = document.getElementById("submitBtn");
const spinnerEl      = document.getElementById("spinner");

// (можуть існувати або бути видалені з HTML)
const teamNameInput   = document.getElementById("team_name");
const captainInput    = document.getElementById("captain");
const phoneRestInput  = document.getElementById("phone_rest");
const phoneHiddenInput= document.getElementById("phone");

// харчування
const foodQtyField    = document.getElementById("foodQtyField");
const foodQtyInput    = document.getElementById("food_qty");

// honeypot
const hpInput         = document.getElementById("hp");

// профіль (тримаємо в змінній, а не в інпутах)
let profileData = {
  teamName:    "",
  captainName: "",
  phone:       ""
};

// ------------ утиліти -------------
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

// ------------ завантаження відкритих етапів -------------
async function loadOpenStages() {
  if (!eventOptionsEl) return;

  try {
    const snap = await db
      .collection("stages")
      .where("isRegistrationOpen", "==", true)
      .get();

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

// ------------ завантаження профілю / команди -------------
async function loadProfile(user) {
  if (!user) throw new Error("Немає авторизованого користувача");

  const userSnap = await db.collection("users").doc(user.uid).get();
  if (!userSnap.exists) {
    throw new Error("Профіль користувача не знайдено. Завершіть реєстрацію акаунта.");
  }

  const u = userSnap.data();

  const captainName = u.fullName || u.displayName || user.email || "";
  const rawPhone    = (u.phone || "").replace(/\s+/g, "");
  let phoneRest = "";
  if (rawPhone.startsWith("+380")) {
    phoneRest = rawPhone.substring(4);
  } else if (rawPhone.startsWith("380")) {
    phoneRest = rawPhone.substring(3);
  } else {
    phoneRest = rawPhone;
  }

  // команда
  let teamName = u.teamName || "";
  if (u.teamId) {
    try {
      const teamSnap = await db.collection("teams").doc(u.teamId).get();
      if (teamSnap.exists) {
        const t = teamSnap.data();
        teamName = t.name || t.teamName || teamName;
      }
    } catch (e) {
      console.warn("Не вдалося прочитати документ команди:", e);
    }
  }

  const fullPhone = phoneRest ? `+380${phoneRest}` : "";

  // зберігаємо в profileData
  profileData = {
    teamName:    teamName || "Без назви",
    captainName,
    phone:       fullPhone
  };

  // якщо поля раптом є в HTML — заповнюємо їх тільки для відображення
  if (teamNameInput) {
    teamNameInput.value = profileData.teamName;
    teamNameInput.disabled = true;
    teamNameInput.readOnly = true;
  }
  if (captainInput) {
    captainInput.value = profileData.captainName;
    captainInput.disabled = true;
    captainInput.readOnly = true;
  }
  if (phoneRestInput) {
    phoneRestInput.value = phoneRest;
    phoneRestInput.disabled = true;
    phoneRestInput.readOnly = true;
  }
  if (phoneHiddenInput) {
    phoneHiddenInput.value = fullPhone;
  }
}

// ------------ логіка харчування -------------
function initFoodLogic() {
  const foodRadios = document.querySelectorAll('input[name="food"]');
  if (!foodRadios.length || !foodQtyField || !foodQtyInput) return;

  function update() {
    const selected = document.querySelector('input[name="food"]:checked');
    const needFood = selected && selected.value === "Так";
    foodQtyField.classList.toggle("field--disabled", !needFood);
    foodQtyInput.disabled = !needFood;
    if (!needFood) {
      foodQtyInput.value = "";
    }
  }

  foodRadios.forEach(r => r.addEventListener("change", update));
  update();
}

// ------------ ініціалізація -------------
auth.onAuthStateChanged(async user => {
  try {
    await loadOpenStages();

    if (!user) {
      showMessage(
        "Щоб подати заявку, увійдіть у свій акаунт (Мій кабінет → Увійти).",
        "err"
      );
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    await loadProfile(user);
    initFoodLogic();
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Помилка ініціалізації сторінки", "err");
  }
});

// ------------ сабміт форми -------------
if (form) {
  form.addEventListener("submit", async e => {
    e.preventDefault();

    // honeypot
    if (hpInput && hpInput.value) {
      showMessage("Підозра на бота. Заявка не відправлена.", "err");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
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

    // беремо дані з профілю, а не з форми
    const { teamName, captainName, phone } = profileData;

    try {
      setLoading(true);
      showMessage("");

      await db.collection("registrations").add({
        userUid:   user.uid,
        teamName,
        captainName,
        phone,
        stageId,
        food,
        foodQty:   foodQty ?? null,
        status:    "pending_payment",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showMessage(
        "Заявку відправлено! Після оплати внеску організатор підтвердить участь.",
        "ok"
      );
      form.reset();
      initFoodLogic();
    } catch (err) {
      console.error("Помилка відправки заявки:", err);
      showMessage(
        `Помилка відправки заявки: ${err.code || err.message}`,
        "err"
      );
    } finally {
      setLoading(false);
    }
  });
} else {
  console.warn("Форма #regForm не знайдена на сторінці");
}
