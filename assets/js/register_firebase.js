// assets/js/register_firebase.js
// COMPAT. Працює з firebase-init.js
// Реєстрація команди на відкритий етап

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  if (!auth || !db || !firebase) {
    console.error("Firebase init missing");
    return;
  }

  const form           = document.getElementById("regForm");
  const eventOptionsEl = document.getElementById("eventOptions");
  const msgEl          = document.getElementById("msg");
  const submitBtn      = document.getElementById("submitBtn");
  const spinnerEl      = document.getElementById("spinner");
  const foodQtyField   = document.getElementById("foodQtyField");
  const foodQtyInput   = document.getElementById("food_qty");
  const profileSummary = document.getElementById("profileSummary");

  let currentUser = null;
  let profile = null;

  function msg(t, ok = true) {
    msgEl.textContent = t || "";
    msgEl.className = "form-msg " + (ok ? "ok" : "err");
  }

  function loading(v) {
    submitBtn.disabled = v;
    spinnerEl.classList.toggle("spinner--on", v);
  }

  // ===== ПРОФІЛЬ =====
  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw "Нема профілю";

    const u = uSnap.data();
    let teamName = "—";

    if (u.teamId) {
      const tSnap = await db.collection("teams").doc(u.teamId).get();
      if (tSnap.exists) teamName = tSnap.data().name;
    }

    profile = {
      uid: user.uid,
      teamId: u.teamId || null,
      teamName,
      captain: u.fullName || user.email,
      phone: u.phone || ""
    };

    profileSummary.innerHTML = `
      Команда: <b>${profile.teamName}</b><br>
      Капітан: <b>${profile.captain}</b><br>
      Телефон: <b>${profile.phone}</b>
    `;
  }

  // ===== ЕТАПИ (DK PRIME) =====
  async function loadStages() {
    eventOptionsEl.innerHTML = "Завантаження етапів…";

    const cache = sessionStorage.getItem("sc_open_stages");
    if (cache) {
      renderStages(JSON.parse(cache));
      return;
    }

    const snap = await db
      .collectionGroup("stages")
      .where("isRegistrationOpen", "==", true)
      .get();

    const stages = [];
    snap.forEach(d => {
      const p = d.ref.path.split("/");
      stages.push({
        seasonId: p[1],
        stageId: d.id,
        title: d.data().label || d.id
      });
    });

    sessionStorage.setItem("sc_open_stages", JSON.stringify(stages));
    renderStages(stages);
  }

  function renderStages(list) {
    eventOptionsEl.innerHTML = "";

    if (!list.length) {
      eventOptionsEl.innerHTML = "Нема відкритих етапів";
      return;
    }

    list.forEach(s => {
      const l = document.createElement("label");
      l.className = "event-item";
      l.innerHTML = `
        <input type="radio" name="stagePick" value="${s.seasonId}||${s.stageId}">
        <div>${s.title} <small>(${s.seasonId})</small></div>
      `;
      eventOptionsEl.appendChild(l);
    });
  }

  // ===== AUTH =====
  auth.onAuthStateChanged(async user => {
    await loadStages();

    if (!user) {
      msg("Увійдіть у акаунт", false);
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
        msg("К-сть 1–6", false);
        return;
      }
    }

    const [seasonId, stageId] = pick.value.split("||");

    try {
      loading(true);

      await db.collection("registrations").add({
        uid: profile.uid,
        seasonId,
        stageId,
        teamId: profile.teamId,
        teamName: profile.teamName,
        captain: profile.captain,
        phone: profile.phone,
        food,
        foodQty,
        status: "pending_payment",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      msg("Заявка подана ✔");
      form.reset();
    } catch (e) {
      console.error(e);
      msg("Помилка відправки", false);
    } finally {
      loading(false);
    }
  });
})();
