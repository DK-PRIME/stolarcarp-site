// assets/js/register_firebase.js
// COMPAT. Працює з assets/js/firebase-init.js
// Реєстрація команди на відкритий етап (seasons/*/stages де isRegistrationOpen == true)

(function () {
  const auth = window.scAuth || window.auth;
  const db   = window.scDb   || window.db;

  const form           = document.getElementById("regForm");
  const eventOptionsEl = document.getElementById("eventOptions");
  const msgEl          = document.getElementById("msg");
  const submitBtn      = document.getElementById("submitBtn");
  const spinnerEl      = document.getElementById("spinner");
  const foodQtyField   = document.getElementById("foodQtyField");
  const foodQtyInput   = document.getElementById("food_qty");
  const profileSummary = document.getElementById("profileSummary");

  if (!auth || !db || !window.firebase) {
    console.error("❌ Firebase не ініціалізовано. Перевір assets/js/firebase-init.js");
    if (eventOptionsEl) eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  let currentUser = null;
  let profile = null;
  let openStages = [];

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");
    if (text) msgEl.classList.add(ok ? "ok" : "err");
  }

  function setLoading(v) {
    if (submitBtn) submitBtn.disabled = !!v;
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
  }

  function disableSubmit(reason) {
    if (submitBtn) submitBtn.disabled = true;
    if (reason) setMsg(reason, false);
  }

  // ===== FOOD =====
  function initFoodLogic() {
    const radios = document.querySelectorAll('input[name="food"]');
    if (!radios.length || !foodQtyField || !foodQtyInput) return;

    function update() {
      const selected = document.querySelector('input[name="food"]:checked');
      const needFood = selected && selected.value === "Так";
      foodQtyField.classList.toggle("field--disabled", !needFood);
      foodQtyInput.disabled = !needFood;
      if (!needFood) foodQtyInput.value = "";
    }
    radios.forEach(r => r.addEventListener("change", update));
    update();
  }

  // ===== PROFILE =====
  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw new Error("Профіль не знайдено. Створіть акаунт на сторінці «Акаунт».");

    const u = uSnap.data() || {};

    // нормалізація телефону
    const rawPhone = String(u.phone || "").replace(/\s+/g, "");
    let phone = rawPhone;
    if (rawPhone && !rawPhone.startsWith("+380")) {
      if (rawPhone.startsWith("380")) phone = "+" + rawPhone;
      else if (rawPhone.length === 9) phone = "+380" + rawPhone;
    }

    const teamId = u.teamId || null;
    let teamName = "";

    if (teamId) {
      const tSnap = await db.collection("teams").doc(teamId).get();
      if (tSnap.exists) teamName = (tSnap.data() || {}).name || "";
    }

    profile = {
      uid: user.uid,
      teamId,
      teamName: teamName || "",
      captainName: u.fullName || user.email || "",
      phone: phone || ""
    };

    if (profileSummary) {
      if (!profile.teamId) {
        profileSummary.innerHTML =
          `Профіль:<br><b style="color:#ff6c6c;">У вас немає команди.</b><br>Зайдіть у «Мій кабінет» і приєднайтесь/створіть команду.`;
      } else {
        profileSummary.innerHTML = `
          Профіль:
          <br>Команда: <b>${profile.teamName}</b>
          <br>Капітан: <b>${profile.captainName}</b>
          <br>Телефон: <b>${profile.phone || "не вказано"}</b>
        `;
      }
    }

    if (!profile.teamId) {
      disableSubmit("❗ Нема команди в акаунті. Додай/приєднайся до команди в кабінеті.");
    }
  }

  // ===== STAGES =====
  const cacheKey = "sc_open_stages_v2";
  function renderStages(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items || !items.length) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>';
      return;
    }

    items.forEach(s => {
      const label = document.createElement("label");
      label.className = "event-item";
      label.innerHTML = `
        <input type="radio" name="stagePick" value="${s.seasonId}||${s.stageId}">
        <div>
          <div>${escapeHtml(s.title)}</div>
          <div style="font-size:12px;color:var(--muted);">Сезон: ${escapeHtml(s.seasonId)}${s.isFinal ? " · ФІНАЛ" : ""}</div>
        </div>
      `;
      eventOptionsEl.appendChild(label);
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadOpenStages() {
    if (!eventOptionsEl) return;

    // показуємо кеш одразу (швидке відкриття сторінки)
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && Array.isArray(cached.items) && (Date.now() - cached.t < 60000)) {
        openStages = cached.items;
        renderStages(openStages);
      } else {
        eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження актуальних етапів...</p>`;
      }
    } catch {
      eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження актуальних етапів...</p>`;
    }

    // завжди тягнемо “свіже” фоном
    const snap = await db
      .collectionGroup("stages")
      .where("isRegistrationOpen", "==", true)
      .get();

    const items = [];
    snap.forEach(docSnap => {
      const st = docSnap.data() || {};
      const parts = docSnap.ref.path.split("/"); // seasons/{seasonId}/stages/{stageId}
      const seasonId = parts[1] || st.seasonId || "";
      items.push({
        seasonId,
        stageId: docSnap.id,
        title: st.label || st.fullTitle || st.title || docSnap.id,
        isFinal: !!st.isFinal
      });
    });

    items.sort((a,b) => (a.seasonId + a.stageId).localeCompare(b.seasonId + b.stageId));
    openStages = items;

    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
    renderStages(openStages);
  }

  // ===== AUTH STATE =====
  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    initFoodLogic();

    try {
      await loadOpenStages();
    } catch (e) {
      console.error("❌ stages load error:", e);
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити етапи.</p>';
    }

    if (!user) {
      profile = null;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Увійдіть у «Акаунт».";
      disableSubmit("Увійдіть у акаунт, щоб подати заявку.");
      return;
    }

    try {
      await loadProfile(user);
      if (submitBtn && profile && profile.teamId) submitBtn.disabled = false;
      setMsg("");
    } catch (e) {
      console.error("❌ profile load error:", e);
      disableSubmit(e.message || "Помилка профілю.");
    }
  });

  // ===== SUBMIT =====
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!currentUser || !profile) return disableSubmit("Нема авторизації/профілю.");
      if (!profile.teamId) return disableSubmit("Нема команди в акаунті.");

      const picked = document.querySelector('input[name="stagePick"]:checked');
      if (!picked) return setMsg("Оберіть етап турніру.", false);

      const food = document.querySelector('input[name="food"]:checked')?.value;
      if (!food) return setMsg("Оберіть, чи потрібне харчування.", false);

      let foodQty = null;
      if (food === "Так") {
        const q = Number(foodQtyInput?.value || "0");
        if (!q || q < 1 || q > 6) return setMsg("Вкажіть кількість харчуючих 1–6.", false);
        foodQty = q;
      }

      const [seasonId, stageId] = String(picked.value).split("||");

      // stageTitle (для DK Prime + реєстру)
      let stageTitle = "";
      try {
        const stSnap = await db.collection("seasons").doc(seasonId).collection("stages").doc(stageId).get();
        if (stSnap.exists) {
          const st = stSnap.data() || {};
          stageTitle = st.label || st.fullTitle || st.title || "";
        }
      } catch {}

      try {
        setLoading(true);
        setMsg("");

        await db.collection("registrations").add({
          uid: currentUser.uid,

          seasonId,
          stageId,
          stageTitle: stageTitle || stageId,

          teamId: profile.teamId,
          teamName: profile.teamName,
          captain: profile.captainName,        // залишаю для сумісності
          captainName: profile.captainName,    // + дубль (щоб точно бачило)
          phone: profile.phone,
          captainPhone: profile.phone,         // + дубль

          food,
          foodQty: foodQty ?? null,

          status: "pending_payment",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setMsg("Заявка подана ✔ Вона вже є в DK Prime → Реєстр команд.", true);
        form.reset();
        initFoodLogic();
      } catch (err) {
        console.error("❌ submit error:", err);
        setMsg("Помилка відправки заявки.", false);
      } finally {
        setLoading(false);
      }
    });
  }
})();
