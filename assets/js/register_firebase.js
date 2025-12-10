// assets/js/register_firebase.js
// СТОРІНКА STOLAR CARP: реєстрація на етап

import { auth, db } from "../firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// === ЕЛЕМЕНТИ DOM ===
const form         = document.getElementById("regForm");
const eventBox     = document.getElementById("eventOptions");
const msg          = document.getElementById("msg");
const submitBtn    = document.getElementById("submitBtn");
const spinner      = document.getElementById("spinner");

// Поля команди (тільки показ)
const teamNameInput    = document.getElementById("team_name");
const captainInput     = document.getElementById("captain");
const phoneRestInput   = document.getElementById("phone_rest");
const phoneHiddenInput = document.getElementById("phone");

// Харчування
const foodQtyField = document.getElementById("foodQtyField");
const foodQtyInput = document.getElementById("food_qty");

let currentUser   = null;
let userProfile   = null;
let activeSeason  = null;
let activeStage   = null;

// ===================== УТИЛІТИ =====================
function setMessage(text, type = "info") {
  if (!msg) return;
  msg.textContent = text || "";
  msg.className = "form-msg";
  if (type === "error") msg.classList.add("err");
  if (type === "success") msg.classList.add("ok");
}

function setLoading(isLoading) {
  if (!submitBtn || !spinner) return;
  submitBtn.disabled = isLoading;
  spinner.classList.toggle("active", isLoading);
}

function disableForm() {
  if (!form) return;
  Array.from(form.querySelectorAll("input,button,select,textarea"))
    .forEach(el => el.disabled = true);
}

function enableForm() {
  if (!form) return;
  Array.from(form.querySelectorAll("input,button,select,textarea"))
    .forEach(el => {
      // Команду/капітан/телефон не розблоковуємо
      if (el === teamNameInput || el === captainInput || el === phoneRestInput) return;
      el.disabled = false;
    });
}

// ===================== ЗАВАНТАЖЕННЯ КОРИСТУВАЧА =====================

async function loadUserProfile(user) {
  const uDoc = await getDoc(doc(db, "users", user.uid));
  if (!uDoc.exists()) {
    throw new Error("Профіль користувача не знайдено у Firestore (users).");
  }
  userProfile = uDoc.data();

  const teamName = userProfile.teamName || userProfile.team || "";
  const captain  = userProfile.captainName || userProfile.name || "";
  const phone    = userProfile.phone || "";

  if (!teamName || !captain || !phone) {
    throw new Error("У профілі відсутні назва команди, капітан або телефон.");
  }

  if (teamNameInput) {
    teamNameInput.value   = teamName;
    teamNameInput.disabled = true;
  }
  if (captainInput) {
    captainInput.value    = captain;
    captainInput.disabled  = true;
  }
  if (phoneRestInput && phoneHiddenInput) {
    // Очікуємо формат +380XXXXXXXXX
    const clean = phone.replace(/\D/g, "");
    let rest = clean;
    if (clean.startsWith("380")) {
      rest = clean.slice(3);
    } else if (clean.startsWith("0")) {
      rest = clean.slice(1);
    }
    phoneRestInput.value   = rest;
    phoneRestInput.disabled = true;
    phoneHiddenInput.value = "+380" + rest;
  }
}

// ===================== АКТИВНИЙ ЕТАП =====================

async function loadActiveStage() {
  // Читаємо settings/active -> { seasonId, stageId, isOpen }
  const activeSnap = await getDoc(doc(db, "settings", "active"));
  if (!activeSnap.exists()) {
    throw new Error("Документ settings/active не знайдено.");
  }

  const active = activeSnap.data();
  if (!active.isOpen) {
    throw new Error("Реєстрація зараз закрита (settings/active.isOpen == false).");
  }

  const { seasonId, stageId } = active;
  if (!seasonId || !stageId) {
    throw new Error("У settings/active немає seasonId або stageId.");
  }

  const seasonSnap = await getDoc(doc(db, "seasons", seasonId));
  if (!seasonSnap.exists()) {
    throw new Error("Сезон не знайдено у колекції seasons.");
  }

  const stageSnap = await getDoc(doc(db, "stages", stageId));
  if (!stageSnap.exists()) {
    throw new Error("Етап не знайдено у колекції stages.");
  }

  activeSeason = { id: seasonId, ...seasonSnap.data() };
  activeStage  = { id: stageId,  ...stageSnap.data() };

  const seasonTitle = activeSeason.title || activeSeason.id || "Сезон";
  const stageName   = activeStage.name   || "Етап";

  if (eventBox) {
    eventBox.innerHTML = `
      <div class="event-option event-option--active">
        <div class="event-option__title">${seasonTitle}</div>
        <div class="event-option__meta">${stageName}</div>
      </div>
    `;
  }
}

// ===================== ПЕРЕВІРКА: ОДНА ЗАЯВКА НА ЕТАП =====================

async function checkAlreadyRegistered() {
  // 1 етап = 1 заявка від команди
  const teamId = userProfile.teamId || currentUser.uid;

  // Щоб не плодити складні індекси — фільтруємо тільки по stageId,
  // а по teamId перевіряємо на клієнті.
  const qRegs = query(
    collection(db, "registrations"),
    where("stageId", "==", activeStage.id)
  );
  const snap = await getDocs(qRegs);

  const already = snap.docs.some(d => {
    const data = d.data();
    return data.teamId === teamId;
  });

  if (already) {
    throw new Error("Ваша команда вже подала заявку на цей етап.");
  }
}

// ===================== ІНІЦІАЛІЗАЦІЯ =====================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setMessage("Щоб подати заявку, увійдіть у свій акаунт капітана.", "error");
    disableForm();
    return;
  }

  currentUser = user;
  setLoading(true);
  setMessage("Завантажую дані профілю та активний етап...", "info");
  disableForm();

  try {
    await loadUserProfile(user);
    await loadActiveStage();
    setMessage("Реєстрація відкрита. Заповніть параметри участі та надішліть заявку.", "success");
    enableForm();
  } catch (err) {
    console.error(err);
    setMessage(err.message, "error");
    disableForm();
  } finally {
    setLoading(false);
  }
});

// ===================== ЛОГІКА ХАРЧУВАННЯ =====================

if (form && foodQtyField && foodQtyInput) {
  const foodRadios = form.querySelectorAll('input[name="food"]');
  const toggleFood = () => {
    const val = Array.from(foodRadios).find(r => r.checked)?.value || "Ні";
    if (val === "Так") {
      foodQtyField.classList.remove("hidden");
      foodQtyInput.disabled = false;
      if (!foodQtyInput.value) foodQtyInput.value = "1";
    } else {
      foodQtyField.classList.add("hidden");
      foodQtyInput.disabled = true;
      foodQtyInput.value = "";
    }
  };
  foodRadios.forEach(r => r.addEventListener("change", toggleFood));
  toggleFood();
}

// ===================== SABMIT ЗАЯВКИ =====================

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser || !userProfile || !activeSeason || !activeStage) {
      setMessage("Неможливо подати заявку: немає профілю або активного етапу.", "error");
      return;
    }

    // Перевірка регламенту
    const agreeChk = document.getElementById("agreeRules");
    if (agreeChk && !agreeChk.checked) {
      setMessage("Потрібно підтвердити, що ви ознайомлені з регламентом.", "error");
      return;
    }

    setLoading(true);
    disableForm();
    setMessage("Надсилаю заявку...", "info");

    try {
      await checkAlreadyRegistered();

      const teamId   = userProfile.teamId || currentUser.uid;
      const teamName = userProfile.teamName || userProfile.team || "";
      const captain  = userProfile.captainName || userProfile.name || "";
      const phone    = phoneHiddenInput?.value || userProfile.phone || "";

      const foodYes = Array.from(
        form.querySelectorAll('input[name="food"]')
      ).find(r => r.checked)?.value === "Так";

      const foodCount = foodYes
        ? Number(foodQtyInput?.value || 0)
        : 0;

      const payload = {
        seasonId:    activeSeason.id,
        seasonTitle: activeSeason.title || "",
        stageId:     activeStage.id,
        stageName:   activeStage.name || "",
        teamId,
        teamName,
        captainUid:  currentUser.uid,
        captainName: captain,
        phone,
        food: {
          needFood: foodYes,
          count:    foodCount
        },
        agreeRules: true,
        status:     "pending",      // ти потім підтверджуєш оплату в DK PRIME
        createdAt:  serverTimestamp()
      };

      await addDoc(collection(db, "registrations"), payload);

      setMessage(
        "Заявку подано! Тепер здійсніть оплату турнірного внеску. Після зарахування організатор підтвердить вашу участь.",
        "success"
      );

    } catch (err) {
      console.error(err);
      setMessage(err.message || "Сталася помилка при надсиланні заявки.", "error");
      enableForm();
    } finally {
      setLoading(false);
    }
  });
}
