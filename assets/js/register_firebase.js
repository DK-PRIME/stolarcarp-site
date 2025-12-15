// assets/js/register_firebase.js
(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db || !window.firebase) {
    document.getElementById("eventOptions").innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    return;
  }

  const form = document.getElementById("regForm");
  const eventOptionsEl = document.getElementById("eventOptions");
  const msgEl = document.getElementById("msg");
  const submitBtn = document.getElementById("submitBtn");
  const spinner = document.getElementById("spinner");
  const foodQtyField = document.getElementById("foodQtyField");
  const foodQtyInput = document.getElementById("food_qty");
  const profileSummary = document.getElementById("profileSummary");

  let currentUser = null;
  let profile = null;

  function msg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.className = "form-msg " + (ok ? "ok" : "err");
  }

  function loading(v) {
    submitBtn.disabled = v;
    spinner.classList.toggle("spinner--on", v);
  }

  // ===== PROFILE =====
  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw "Нема профілю користувача";

    const u = uSnap.data();
    let teamName = "—";

    if (u.teamId) {
      const tSnap = await db.collection("teams").doc(u.teamId).get();
      if (tSnap.exists) teamName = tSnap.data().name;
    }

    profile = {
      uid: user.uid,
      teamId: u.teamId,
      teamName,
      captain: u.fullName || user.email,
      phone: u.phone || ""
    };

    profileSummary.innerHTML = `
      Команда: <b>${profile.teamName}</b><br>
      Капітан: <b>${profile.captain}</b><br>
      Телефон: <b>${profile.phone || "—"}</b>
    `;
  }

  // ===== STAGES =====
  async function loadStages() {
    eventOptionsEl.innerHTML = "Завантаження етапів…";

    const snap = await db
      .collectionGroup("stages")
      .where("isRegistrationOpen", "==", true)
      .get();

    if (snap.empty) {
      eventOptionsEl.innerHTML = "Нема відкритих етапів";
      return;
    }

    eventOptionsEl.innerHTML = "";

    snap.forEach(doc => {
      const st = doc.data();
      const path = doc.ref.path.split("/");
      const seasonId = path[1];

      const label = document.createElement("label");
      label.className = "event-item";
      label.innerHTML = `
        <input type="radio" name="stagePick" value="${seasonId}||${doc.id}">
        <div>${st.label || doc.id} <small>(${seasonId})</small></div>
      `;
      eventOptionsEl.appendChild(label);
    });
  }

  // ===== AUTH =====
  auth.onAuthStateChanged(async user => {
    await loadStages();

    if (!user) {
      msg("Увійдіть у акаунт STOLAR CARP", false);
      submitBtn.disabled = true;
      return;
    }

    currentUser = user;
    await loadProfile(user);
    submitBtn.disabled = false;
  });

  // ===== SUBMIT =====
  form.addEventListener("submit", async e => {
    e.preventDefault();

    if (!currentUser || !profile) {
      msg("Нема профілю", false);
      return;
    }

    const pick = document.querySelector("input[name=stagePick]:checked");
    if (!pick) {
      msg("Оберіть етап", false);
      return;
    }

    const food = document.querySelector("input[name=food]:checked")?.value;
    if (!food) {
      msg("Оберіть харчування", false);
      return;
    }

    let foodQty = null;
    if (food === "Так") {
      foodQty = Number(foodQtyInput.value);
      if (!foodQty || foodQty < 1 || foodQty > 6) {
        msg("Кількість 1–6", false);
        return;
      }
    }

    const [seasonId, stageId] = pick.value.split("||");

    try {
      loading(true);

      await db.collection("registrations").add({
        uid: profile.uid,
        teamId: profile.teamId,
        teamName: profile.teamName,
        captain: profile.captain,
        phone: profile.phone,

        seasonId,
        stageId,

        food,
        foodQty,
        status: "pending_payment",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      msg("Заявку подано ✔");
      form.reset();
    } catch (err) {
      console.error(err);
      msg("Помилка відправки", false);
    } finally {
      loading(false);
    }
  });
})();
