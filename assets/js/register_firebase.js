// assets/js/register_firebase.js
// Під Firestore схему зі скрінів:
// - competitions/{compId}: { brand, name, year, type, hasFinal, stagesCount, events: [ { key, startDate, finishDate, regOpenDate, regCloseDate } ] }
// - settings/app: { activeCompetitionId }
// Пише заявки в: registrations (status: pending_payment)

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
  const rulesChk       = document.getElementById("rules");

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

  // ---------- UI helpers ----------
  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");
    if (text) msgEl.classList.add(ok ? "ok" : "err");
  }

  function setLoading(v) {
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
    // кнопку блокуємо тільки під час сабміту, а не під час вибору
    if (submitBtn) submitBtn.disabled = !!v || !canSubmit();
  }

  function fmtDateUA(dateObj) {
    if (!dateObj) return "—";
    return dateObj.toLocaleDateString("uk-UA", { day:"2-digit", month:"2-digit", year:"numeric" });
  }

  function dateFromYMD_noonLocal(ymd) {
    // ymd: "YYYY-MM-DD"
    if (!ymd || typeof ymd !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const [y,m,d] = ymd.split("-").map(Number);
    // 12:00 локально (в UA це ок, бо ти саме так задаєш)
    return new Date(y, m-1, d, 12, 0, 0, 0);
  }

  function isOpenByRegDates(regOpenDate, regCloseDate) {
    const o = dateFromYMD_noonLocal(regOpenDate);
    const c = dateFromYMD_noonLocal(regCloseDate);
    if (!o || !c) return false;
    const n = new Date();
    return n >= o && n <= c;
  }

  function canSubmit() {
    if (!currentUser || !profile) return false;
    const picked = document.querySelector('input[name="stagePick"]:checked');
    if (!picked) return false;
    if (rulesChk && !rulesChk.checked) return false;

    const food = document.querySelector('input[name="food"]:checked')?.value;
    if (!food) return false;

    if (food === "Так") {
      const q = Number(foodQtyInput?.value || "0");
      if (!q || q < 1 || q > 6) return false;
    }
    return true;
  }

  function refreshSubmitState() {
    if (!submitBtn) return;
    submitBtn.disabled = !canSubmit();
  }

  // ---------- copy card ----------
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

  // ---------- food logic ----------
  function initFoodLogic() {
    const radios = document.querySelectorAll('input[name="food"]');
    if (!radios.length || !foodQtyField || !foodQtyInput) return;

    function update() {
      const selected = document.querySelector('input[name="food"]:checked');
      const need = selected && selected.value === "Так";
      foodQtyField.classList.toggle("field--disabled", !need);
      foodQtyInput.disabled = !need;
      if (!need) foodQtyInput.value = "";
      refreshSubmitState();
    }

    radios.forEach(r => r.addEventListener("change", update));
    if (foodQtyInput) foodQtyInput.addEventListener("input", refreshSubmitState);
    update();
  }

  // ---------- profile ----------
  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw new Error("Нема профілю. Зайдіть на «Акаунт» і створіть профіль.");

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

  // ---------- competitions / events ----------
  async function getActiveCompetitionId() {
    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) return (s.data() || {}).activeCompetitionId || "";
    } catch {}
    return "";
  }

  function stageLabelFromKey(key) {
    if (key === "final") return "Фінал";
    const m = /^stage-(\d+)$/i.exec(String(key || ""));
    if (m) return `Етап ${m[1]}`;
    return String(key || "").toUpperCase();
  }

  function renderItems(items, activeId) {
    if (!eventOptionsEl) return;

    eventOptionsEl.innerHTML = "";
    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      refreshSubmitState();
      return;
    }

    items.forEach(it => {
      const open = isOpenByRegDates(it.regOpenDate, it.regCloseDate);
      const value = `${it.compId}||${it.stageKey}`;

      const badges = [];
      if (it.compId === activeId) badges.push(`<span class="pill-b pill-b--active">АКТИВНЕ</span>`);
      if (it.stageKey === "final") badges.push(`<span class="pill-b pill-b--final">ФІНАЛ</span>`);
      badges.push(open
        ? `<span class="pill-b pill-b--open">ВІДКРИТО</span>`
        : `<span class="pill-b pill-b--closed">ЗАКРИТО</span>`
      );

      const startAt = dateFromYMD_noonLocal(it.startDate);
      const endAt   = dateFromYMD_noonLocal(it.finishDate);
      const regO    = dateFromYMD_noonLocal(it.regOpenDate);
      const regC    = dateFromYMD_noonLocal(it.regCloseDate);

      const el = document.createElement("label");
      el.className = "event-item" + (open ? "" : " is-closed");

      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div style="width:100%;">
          <div class="event-title">
            <div>
              ${it.brand} · ${it.compName}
              <span style="opacity:.85;">— ${stageLabelFromKey(it.stageKey)}</span>
            </div>
            <div class="event-badges">${badges.join("")}</div>
          </div>

          <div class="event-meta">
            Дати: <b>${fmtDateUA(startAt)}</b> — <b>${fmtDateUA(endAt)}</b>
            &nbsp;·&nbsp;
            Реєстрація: <b>${fmtDateUA(regO)}</b> — <b>${fmtDateUA(regC)}</b>
          </div>
        </div>
      `;

      eventOptionsEl.appendChild(el);
    });

    // слухаємо вибір
    eventOptionsEl.querySelectorAll('input[name="stagePick"]').forEach(r => {
      r.addEventListener("change", refreshSubmitState);
    });

    refreshSubmitState();
  }

  async function loadCompetitionsWithEvents() {
    if (!eventOptionsEl) return;

    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження змагань...</p>`;

    const cacheKey = "sc_comp_events_v1";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && (Date.now() - cached.t < 60_000) && Array.isArray(cached.items)) {
        const activeId = cached.activeId || "";
        renderItems(cached.items, activeId);
        return;
      }
    } catch {}

    try {
      const activeId = await getActiveCompetitionId();

      const snap = await db.collection("competitions").get();
      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const compName = c.name || compId;
        const year = c.year || 0;

        const events = Array.isArray(c.events) ? c.events : [];
        events.forEach(ev => {
          if (!ev || !ev.key) return;

          items.push({
            compId,
            compName,
            brand,
            year,
            stageKey: ev.key,
            startDate: ev.startDate || "",
            finishDate: ev.finishDate || "",
            regOpenDate: ev.regOpenDate || "",
            regCloseDate: ev.regCloseDate || ""
          });
        });
      });

      // сортування: активне зверху, потім рік ↓, потім compName, потім stage
      items.sort((a,b) => {
        const activeId = (sessionStorage.getItem("__sc_active_tmp") || "");
        const aA = a.compId === activeId ? 0 : 1;
        const bA = b.compId === activeId ? 0 : 1;
        if (aA !== bA) return aA - bA;

        if ((b.year||0) !== (a.year||0)) return (b.year||0) - (a.year||0);
        const n = (a.compName||"").localeCompare((b.compName||""), "uk");
        if (n !== 0) return n;

        // stage order
        const order = (k)=>{
          if (k === "final") return 999;
          const m = /^stage-(\d+)$/i.exec(String(k||""));
          return m ? Number(m[1]) : 500;
        };
        return order(a.stageKey) - order(b.stageKey);
      });

      // трюк: зберігаємо activeId для сортування в кеші
      sessionStorage.setItem("__sc_active_tmp", activeId);

      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items, activeId }));
      renderItems(items, activeId);
    } catch (e) {
      console.error("loadCompetitionsWithEvents error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання. Перевір Rules/доступ або увійди в акаунт.</p>';
      refreshSubmitState();
    }
  }

  // ---------- auth ----------
  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      profile = null;
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Акаунт» і поверніться сюди.";
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Список етапів доступний після входу в акаунт.</p>';
      setMsg("Увійдіть у акаунт, щоб бачити етапи та подати заявку.", false);
      return;
    }

    try {
      await loadProfile(user);
      initFoodLogic();
      if (rulesChk) rulesChk.addEventListener("change", refreshSubmitState);
      await loadCompetitionsWithEvents();
      refreshSubmitState();
    } catch (e) {
      console.error(e);
      profile = null;
      if (submitBtn) submitBtn.disabled = true;
      setMsg(e.message || "Помилка профілю.", false);
    }
  });

  // ---------- submit ----------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (hpInput && hpInput.value) {
        setMsg("Підозра на бота. Заявка не відправлена.", false);
        return;
      }
      if (!canSubmit()) {
        setMsg("Заповни обовʼязкові поля та обери ВІДКРИТИЙ етап.", false);
        return;
      }

      const picked = document.querySelector('input[name="stagePick"]:checked');
      const [competitionId, stageKey] = String(picked.value).split("||");

      const food = document.querySelector('input[name="food"]:checked')?.value;
      let foodQty = null;
      if (food === "Так") foodQty = Number(foodQtyInput.value);

      try {
        setLoading(true);
        setMsg("");

        await db.collection("registrations").add({
          uid: profile.uid,

          competitionId,
          stageId: stageKey,

          teamId: profile.teamId,
          teamName: profile.teamName,
          captain: profile.captain,
          phone: profile.phone,

          food,
          foodQty: foodQty ?? null,

          status: "pending_payment",
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        setMsg("Заявка подана ✔ Після оплати підтверджу в адмінці.", true);

        form.reset();
        initFoodLogic();
        refreshSubmitState();
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
      }
    });
  }
})();
