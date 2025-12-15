// assets/js/register_firebase.js
// COMPAT (firebase-init.js -> window.scAuth / window.scDb)
// Реєстрація команди на відкритий етап (seasons/*/stages де isRegistrationOpen == true)
// Запис у collection: registrations

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

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

  if (!auth || !db || !window.firebase) {
    if (eventOptionsEl) {
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  let currentUser = null;
  let profile = null;

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

  // copy card
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

  function initFoodLogic() {
    const radios = document.querySelectorAll('input[name="food"]');
    if (!radios.length || !foodQtyField || !foodQtyInput) return;

    function update() {
      const selected = document.querySelector('input[name="food"]:checked');
      const need = selected && selected.value === "Так";
      foodQtyField.classList.toggle("field--disabled", !need);
      foodQtyInput.disabled = !need;
      if (!need) foodQtyInput.value = "";
    }

    radios.forEach(r => r.addEventListener("change", update));
    update();
  }

  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw new Error("Нема профілю. Зайдіть на сторінку «Акаунт» і створіть профіль.");

    const u = uSnap.data() || {};
    const teamId = u.teamId || null;

    let teamName = "";
    if (teamId) {
      const tSnap = await db.collection("teams").doc(teamId).get();
      if (tSnap.exists) teamName = (tSnap.data() || {}).name || "";
    }

    profile = {
      uid: user.uid,
      email: user.email || "",
      teamId,
      teamName: teamName || "Без назви",
      captain: u.fullName || user.email || "",
      phone: u.phone || ""
    };

    if (profileSummary) {
      profileSummary.innerHTML =
        `Команда: <b>${profile.teamName}</b><br>` +
        `Капітан: <b>${profile.captain}</b><br>` +
        `Телефон: <b>${profile.phone || "не вказано"}</b>`;
    }
  }

  async function loadOpenStages() {
    if (!eventOptionsEl) return;

    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження актуальних етапів...</p>`;

    // кеш 60 сек
    const cacheKey = "sc_open_stages_v2";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && (Date.now() - cached.t < 60_000) && Array.isArray(cached.items)) {
        renderStages(cached.items);
        return;
      }
    } catch {}

    try {
      const snap = await db
        .collectionGroup("stages")
        .where("isRegistrationOpen", "==", true)
        .get();

      const items = [];
      snap.forEach(docSnap => {
        const st = docSnap.data() || {};
        const parts = docSnap.ref.path.split("/"); // seasons/2026/stages/2026_e1
        const seasonId = parts[1] || st.seasonId || "";
        const stageId = docSnap.id;

        items.push({
          seasonId,
          stageId,
          title: st.label || st.fullTitle || st.title || stageId,
          isFinal: !!st.isFinal
        });
      });

      items.sort((a,b) => (a.seasonId + a.stageId).localeCompare(b.seasonId + b.stageId));
      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
      renderStages(items);
    } catch (e) {
      console.error("loadOpenStages error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити етапи (Rules/доступ). Увійдіть у акаунт і оновіть сторінку.</p>';
    }
  }

  function renderStages(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Зараз немає відкритих етапів для реєстрації.</p>`;
      return;
    }

    items.forEach(st => {
      const value = `${st.seasonId}||${st.stageId}`;
      const el = document.createElement("label");
      el.className = "event-item";
      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}">
        <div>
          <div>${st.title}</div>
          <div style="font-size:12px;color:var(--muted);">
            ${st.seasonId ? `Сезон: ${st.seasonId}` : ""}${st.isFinal ? " · ФІНАЛ" : ""}
          </div>
        </div>
      `;
      eventOptionsEl.appendChild(el);
    });
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Акаунт» і поверніться сюди.";
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Етапи доступні після входу в акаунт.</p>';
      setMsg("Увійдіть у акаунт, щоб бачити відкриті етапи і подати заявку.", false);
      return;
    }

    try {
      await loadProfile(user);
      initFoodLogic();
      await loadOpenStages();
      if (submitBtn) submitBtn.disabled = false;
    } catch (e) {
      console.error(e);
      if (submitBtn) submitBtn.disabled = true;
      setMsg(e.message || "Помилка профілю.", false);
    }
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (hpInput && hpInput.value) {
        setMsg("Підозра на бота. Заявка не відправлена.", false);
        return;
      }

      if (!currentUser || !profile) {
        setMsg("Увійдіть у акаунт.", false);
        return;
      }

      const picked = document.querySelector('input[name="stagePick"]:checked');
      if (!picked) {
        setMsg("Оберіть етап.", false);
        return;
      }

      const food = document.querySelector('input[name="food"]:checked')?.value;
      if (!food) {
        setMsg("Оберіть харчування.", false);
        return;
      }

      let foodQty = null;
      if (food === "Так") {
        const q = Number(foodQtyInput?.value || "0");
        if (!q || q < 1 || q > 6) {
          setMsg("Вкажіть кількість харчуючих 1–6.", false);
          return;
        }
        foodQty = q;
      }

      const [seasonId, stageId] = String(picked.value).split("||");

      let stageTitle = "";
      try {
        const stSnap = await db.collection("seasons").doc(seasonId).collection("stages").doc(stageId).get();
        if (stSnap.exists) stageTitle = (stSnap.data() || {}).label || "";
      } catch {}

      try {
        setLoading(true);
        setMsg("");

        await db.collection("registrations").add({
          uid: profile.uid,
          seasonId,
          stageId,
          stageTitle: stageTitle || stageId,

          teamId: profile.teamId,
          teamName: profile.teamName,
          captain: profile.captain,
          phone: profile.phone,

          food,
          foodQty: foodQty ?? null,

          status: "pending_payment",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setMsg("Заявка подана ✔ Після оплати я підтверджу в DK Prime.", true);
        form.reset();
        initFoodLogic();
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
      }
    });
  }
})();
