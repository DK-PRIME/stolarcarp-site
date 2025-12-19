// assets/js/register_firebase.js
// COMPAT (firebase-init.js -> window.scAuth / window.scDb)
// Реєстрація команди на етап сезону зі списку stages активного сезону (settings/app)
// Відкритість етапу: regMode/manualOpen або regOpenAt/regCloseAt
// Запис у: registrations

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const form = document.getElementById("regForm");
  const eventOptionsEl = document.getElementById("eventOptions");
  const msgEl = document.getElementById("msg");
  const submitBtn = document.getElementById("submitBtn");
  const spinnerEl = document.getElementById("spinner");
  const hpInput = document.getElementById("hp");
  const foodQtyField = document.getElementById("foodQtyField");
  const foodQtyInput = document.getElementById("food_qty");
  const profileSummary = document.getElementById("profileSummary");
  const copyCardBtn = document.getElementById("copyCard");
  const cardNumEl = document.getElementById("cardNum");

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

    radios.forEach((r) => r.addEventListener("change", update));
    update();
  }

  function stageIsOpen(stageData, now = new Date()) {
    const d = stageData || {};
    const mode = (d.regMode || "auto").toLowerCase();

    // MANUAL
    if (mode === "manual") return !!d.manualOpen;

    // AUTO by dates
    const openAt = d.regOpenAt && typeof d.regOpenAt.toDate === "function" ? d.regOpenAt.toDate() : null;
    const closeAt = d.regCloseAt && typeof d.regCloseAt.toDate === "function" ? d.regCloseAt.toDate() : null;

    if (!openAt || !closeAt) return false;
    return now >= openAt && now <= closeAt;
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

  async function getActiveSeasonId() {
    try {
      const s = await db.collection("settings").doc("app").get();
      const d = s.exists ? (s.data() || {}) : {};
      return d.activeSeasonId || null;
    } catch {
      return null;
    }
  }

  async function loadStagesForRegister() {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження етапів...</p>`;

    const activeSeasonId = await getActiveSeasonId();

    if (!activeSeasonId) {
      eventOptionsEl.innerHTML =
        `<p class="form__hint" style="color:#ff6c6c;">Нема активного сезону (settings/app → activeSeasonId). Адмін має вибрати сезон/етап.</p>`;
      return;
    }

    // кеш 45 сек, але з ключем сезону
    const cacheKey = "sc_stages_for_register_" + activeSeasonId;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && (Date.now() - cached.t < 45_000) && Array.isArray(cached.items)) {
        renderStages(cached.items, activeSeasonId);
        return;
      }
    } catch {}

    try {
      const snap = await db
        .collection("seasons")
        .doc(activeSeasonId)
        .collection("stages")
        .get();

      const items = [];
      snap.forEach((docSnap) => {
        const st = docSnap.data() || {};
        items.push({
          seasonId: activeSeasonId,
          stageId: docSnap.id,
          title: st.label || st.fullTitle || st.title || st.name || docSnap.id,
          isFinal: !!st.isFinal,
          regMode: (st.regMode || "auto").toLowerCase(),
          manualOpen: !!st.manualOpen,
          regOpenAt: st.regOpenAt || null,
          regCloseAt: st.regCloseAt || null,
          _raw: st
        });
      });

      // сортування: спершу по regOpenAt, потім по stageId
      items.sort((a, b) => {
        const ad = a.regOpenAt && a.regOpenAt.toDate ? a.regOpenAt.toDate().getTime() : 0;
        const bd = b.regOpenAt && b.regOpenAt.toDate ? b.regOpenAt.toDate().getTime() : 0;
        if (ad !== bd) return ad - bd;
        return String(a.stageId).localeCompare(String(b.stageId), "uk");
      });

      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
      renderStages(items, activeSeasonId);
    } catch (e) {
      console.error("loadStagesForRegister error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити етапи (Rules/доступ). Увійдіть у акаунт і оновіть сторінку.</p>';
    }
  }

  function renderStages(items, activeSeasonId) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">У сезоні немає етапів. Адмін має їх створити.</p>`;
      return;
    }

    const now = new Date();
    const anyOpen = items.some((st) => stageIsOpen(st._raw, now));

    items.forEach((st) => {
      const open = stageIsOpen(st._raw, now);
      const value = `${st.seasonId}||${st.stageId}`;

      const openAt = st.regOpenAt && st.regOpenAt.toDate ? st.regOpenAt.toDate() : null;
      const closeAt = st.regCloseAt && st.regCloseAt.toDate ? st.regCloseAt.toDate() : null;

      const sub = [];
      sub.push(`Сезон: ${activeSeasonId}`);
      if (st.isFinal) sub.push("ФІНАЛ");
      if (st.regMode === "manual") sub.push(open ? "ВІДКРИТО (manual)" : "ЗАКРИТО (manual)");
      else sub.push(open ? "ВІДКРИТО" : "ЗАКРИТО");
      if (openAt && closeAt) sub.push(`${openAt.toLocaleDateString("uk-UA")}–${closeAt.toLocaleDateString("uk-UA")}`);

      const el = document.createElement("label");
      el.className = "event-item";
      el.style.opacity = open ? "1" : ".55";
      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div>
          <div>${st.title}</div>
          <div style="font-size:12px;color:var(--muted);">${sub.join(" · ")}</div>
        </div>
      `;
      eventOptionsEl.appendChild(el);
    });

    if (!anyOpen) {
      const hint = document.createElement("p");
      hint.className = "form__hint";
      hint.textContent = "Зараз немає відкритих етапів. Слідкуй за датами відкриття реєстрації.";
      eventOptionsEl.appendChild(hint);
    }
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Акаунт» і поверніться сюди.";
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Етапи доступні після входу в акаунт.</p>';
      setMsg("Увійдіть у акаунт, щоб бачити етапи і подати заявку.", false);
      return;
    }

    try {
      await loadProfile(user);
      initFoodLogic();
      await loadStagesForRegister();
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
        setMsg("Оберіть відкритий етап.", false);
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

      // Перевірка “прямо зараз”, щоб не було фейлу якщо адмін закрив
      let stageTitle = stageId;
      try {
        const stSnap = await db.collection("seasons").doc(seasonId).collection("stages").doc(stageId).get();
        if (!stSnap.exists) {
          setMsg("Етап не знайдено. Оновіть сторінку.", false);
          return;
        }
        const st = stSnap.data() || {};
        stageTitle = st.label || st.fullTitle || st.title || st.name || stageId;

        if (!stageIsOpen(st, new Date())) {
          setMsg("Цей етап зараз закритий для реєстрації. Оновіть список етапів.", false);
          await loadStagesForRegister();
          return;
        }
      } catch (err) {
        console.error(err);
        setMsg("Не вдалося перевірити статус етапу. Спробуйте ще раз.", false);
        return;
      }

      try {
        setLoading(true);
        setMsg("");

        await db.collection("registrations").add({
          uid: profile.uid,
          seasonId,
          stageId,
          stageTitle,

          teamId: profile.teamId,
          teamName: profile.teamName,
          captain: profile.captain,
          phone: profile.phone,

          food,
          foodQty: foodQty ?? null,

          status: "pending_payment",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setMsg("Заявка подана ✔ Після оплати я підтверджу в адмінці.", true);
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
