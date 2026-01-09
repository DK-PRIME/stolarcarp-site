// assets/js/register_firebase.js
// STOLAR CARP • Registration (FAST)
// ✅ Team vs Solo
// ✅ Anti-duplicate via deterministic docId (duplicate becomes UPDATE -> denied by rules)
// ✅ FAST: render competitions instantly from localStorage cache, then refresh in background
// ✅ Parallel loads: profile + competitions
// ✅ No undefined fields (uses null)
// ✅ PUBLIC mirror: writes safe fields to public_participants (teamName + status + ids)
// ✅ PAYMENT: reads payEnabled/price/currency/payDetails from competitions.events and snapshots into registrations

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
    if (eventOptionsEl) eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // ======= PERF CACHE =======
  const COMP_CACHE_KEY = "sc_competitions_cache_v1";
  const TEAM_CACHE_PREFIX = "sc_team_cache_";
  const TEAM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 год

  let currentUser = null;
  let profile = null;

  let lastItems = [];
  let nearestUpcomingValue = null;

  // ======= helpers =======
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");
    if (text) msgEl.classList.add(ok ? "ok" : "err");
  }

  function setLoading(v) {
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
    refreshSubmitState();
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function toDateMaybe(x) {
    if (!x) return null;
    try {
      if (x instanceof Date) return x;
      if (typeof x === "string") {
        const d = new Date(x);
        return isFinite(d.getTime()) ? d : null;
      }
      if (x && typeof x.toDate === "function") return x.toDate();
    } catch {}
    return null;
  }

  function nowKyiv() { return new Date(); }

  function normalizeMoney(v){
    if (v === 0) return 0;
    if (v === null || v === undefined) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function getRegDatesFromEvent(ev) {
    const regOpen  = ev.regOpenAt  || ev.regOpenDate  || ev.regOpen  || null;
    const regClose = ev.regCloseAt || ev.regCloseDate || ev.regClose || null;
    return { regOpenAt: regOpen, regCloseAt: regClose };
  }

  function getRunDatesFromEvent(ev) {
    const start  = ev.startAt  || ev.startDate  || null;
    const finish = ev.finishAt || ev.finishDate || ev.endAt || ev.endDate || null;
    return { startAt: start, endAt: finish };
  }

  function entryTypeFromEvent(ev, comp) {
    const t = String(ev?.entryType || comp?.entryType || "team").toLowerCase();
    return (t === "solo") ? "solo" : "team";
  }

  // ======= PAYMENT UI (uses existing #cardNum + #copyCard) =======
  let activePayText = "";

  function setPayUIFromSelected(item){
    // якщо в тебе нема payDetails UI на сторінці — просто тихо виходимо
    if (!cardNumEl) return;

    if (!item){
      activePayText = "";
      cardNumEl.textContent = "";
      return;
    }

    const payEnabled = !!item.payEnabled;
    const price = normalizeMoney(item.price);
    const currency = String(item.currency || "UAH").toUpperCase();
    const details = String(item.payDetails || "").trim();

    if (!payEnabled){
      activePayText = "Оплата не потрібна для цього етапу ✅";
      cardNumEl.textContent = activePayText;
      return;
    }

    const priceLine = (price === null) ? `Внесок: — ${currency}` : `Внесок: ${price} ${currency}`;
    const detailsLine = details || "Реквізити не задані адміністратором.";
    activePayText = `${priceLine}\n${detailsLine}`.trim();

    cardNumEl.textContent = activePayText;
  }

  // copy реквізити (завжди копіюємо те, що показано)
  if (copyCardBtn) {
    copyCardBtn.addEventListener("click", async () => {
      const txt = (activePayText || (cardNumEl ? cardNumEl.textContent : "") || "").trim();
      if (!txt) {
        alert("Нема що копіювати.");
        return;
      }
      try {
        await navigator.clipboard.writeText(txt);
        copyCardBtn.textContent = "Скопійовано ✔";
        setTimeout(() => (copyCardBtn.textContent = "Скопіювати реквізити"), 1200);
      } catch {
        alert("Не вдалося скопіювати. Скопіюйте вручну.");
      }
    });
  }

  // ======= OPEN WINDOW =======
  function isOpenWindow(item) {
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowKyiv();
    return n >= openAt && n <= closeAt;
  }

  function calcNearestUpcoming(items) {
    let best = null;
    items.forEach(it => {
      const mode = String(it.regMode || "auto").toLowerCase();
      if (mode === "manual") return;
      const openAt = toDateMaybe(it.regOpenAt);
      if (!openAt) return;
      if (openAt <= nowKyiv()) return;
      const value = `${it.compId}||${it.stageKey || ""}`;
      if (!best || openAt < best.openAt) best = { value, openAt };
    });
    nearestUpcomingValue = best ? best.value : null;
  }

  function lampClassFor(it, value) {
    if (isOpenWindow(it)) return "lamp-green";
    if (nearestUpcomingValue && value === nearestUpcomingValue) return "lamp-yellow";
    return "lamp-red";
  }

  function refreshSubmitState() {
    if (!submitBtn) return;

    const loading = spinnerEl && spinnerEl.classList.contains("spinner--on");
    if (loading) { submitBtn.disabled = true; return; }

    const picked = document.querySelector('input[name="stagePick"]:checked');
    const rulesOk = rulesChk ? !!rulesChk.checked : true;

    const selectedValue = picked ? String(picked.value) : "";
    const selectedItem = selectedValue
      ? lastItems.find(x => `${x.compId}||${x.stageKey || ""}` === selectedValue)
      : null;

    const ok = !!(currentUser && picked && rulesOk && selectedItem && isOpenWindow(selectedItem));
    submitBtn.disabled = !ok;
  }

  // ======= FOOD =======
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

  // ======= TEAM NAME CACHE =======
  function getTeamCacheKey(teamId) { return TEAM_CACHE_PREFIX + String(teamId || ""); }

  function readTeamNameCache(teamId) {
    try {
      const raw = localStorage.getItem(getTeamCacheKey(teamId));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.name || !obj.ts) return null;
      if ((Date.now() - obj.ts) > TEAM_CACHE_TTL_MS) return null;
      return String(obj.name);
    } catch { return null; }
  }

  function writeTeamNameCache(teamId, name) {
    try {
      localStorage.setItem(getTeamCacheKey(teamId), JSON.stringify({ ts: Date.now(), name: String(name || "") }));
    } catch {}
  }

  async function getTeamName(teamId) {
    if (!teamId) return "";
    const cached = readTeamNameCache(teamId);
    if (cached) return cached;

    const tSnap = await db.collection("teams").doc(teamId).get();
    const name = tSnap.exists ? ((tSnap.data() || {}).name || "") : "";
    if (name) writeTeamNameCache(teamId, name);
    return name;
  }

  async function loadProfile(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) throw new Error("Нема профілю. Зайдіть на сторінку «Акаунт» і створіть профіль.");

    const u = uSnap.data() || {};
    const teamId = u.teamId || null;

    const teamName = teamId ? await getTeamName(teamId) : "";

    profile = {
      uid: user.uid,
      email: user.email || "",
      fullName: (u.fullName || "").trim(),
      teamId,
      teamName: (teamName || "Без назви").trim(),
      captain: (u.fullName || user.email || "").trim(),
      phone: (u.phone || "").trim(),
    };

    if (profileSummary) {
      profileSummary.innerHTML =
        `Команда: <b>${escapeHtml(profile.teamId ? profile.teamName : "— (нема команди)")}</b><br>` +
        `Користувач: <b>${escapeHtml(profile.fullName || profile.email || "—")}</b><br>` +
        `Телефон: <b>${escapeHtml(profile.phone || "не вказано")}</b>`;
    }
  }

  // ======= COMPETITIONS CACHE =======
  function normalizeDateForCache(x) {
    const d = toDateMaybe(x);
    return d ? d.toISOString() : (typeof x === "string" ? x : null);
  }

  function hydrateItemFromCache(it) {
    return {
      ...it,
      startAt: toDateMaybe(it.startAt),
      endAt: toDateMaybe(it.endAt),
    };
  }

  function tryRenderCompetitionsFromCache() {
    try {
      const raw = localStorage.getItem(COMP_CACHE_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.items) || !obj.ts) return false;

      const items = obj.items.map(hydrateItemFromCache);

      lastItems = items;
      calcNearestUpcoming(items);
      renderItems(items);
      refreshSubmitState();

      if (eventOptionsEl) {
        const hint = document.createElement("div");
        hint.className = "form__hint";
        hint.style.marginTop = "8px";
        hint.textContent = "Оновлюю список…";
        eventOptionsEl.appendChild(hint);
      }

      return true;
    } catch {
      return false;
    }
  }

  function saveCompetitionsToCache(items) {
    try {
      const packed = items.map(it => ({
        ...it,
        startAt: it.startAt ? it.startAt.toISOString() : null,
        endAt: it.endAt ? it.endAt.toISOString() : null,
        regOpenAt: normalizeDateForCache(it.regOpenAt),
        regCloseAt: normalizeDateForCache(it.regCloseAt),

        // ✅ payment cache
        payEnabled: !!it.payEnabled,
        price: (it.price === 0 || it.price) ? it.price : null,
        currency: (it.currency || "UAH").toUpperCase(),
        payDetails: (it.payDetails || "").trim(),
      }));
      localStorage.setItem(COMP_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: packed }));
    } catch {}
  }

  async function loadCompetitionsFresh() {
    if (!eventOptionsEl) return;

    try {
      const snap = await db.collection("competitions").get();
      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const year  = c.year || c.seasonYear || "";
        const title = c.name || c.title || (year ? `Season ${year}` : compId);

        const eventsArr = Array.isArray(c.events) ? c.events : null;

        if (eventsArr && eventsArr.length) {
          eventsArr.forEach((ev, idx) => {
            const key = ev.key || ev.stageId || ev.id || `stage-${idx+1}`;
            const isFinal = String(key).toLowerCase().includes("final") || !!ev.isFinal;

            const { startAt, endAt } = getRunDatesFromEvent(ev);
            const { regOpenAt, regCloseAt } = getRegDatesFromEvent(ev);

            const stageTitle =
              ev.title || ev.name || ev.label ||
              (isFinal ? "Фінал" : `Етап ${idx + 1}`);

            const entryType = entryTypeFromEvent(ev, c);

            items.push({
              compId,
              brand,
              year,
              compTitle: title,
              stageKey: String(key),
              stageTitle,
              entryType,

              startAt: toDateMaybe(startAt),
              endAt: toDateMaybe(endAt),

              regMode: ev.regMode || c.regMode || "auto",
              manualOpen: !!(ev.manualOpen ?? c.manualOpen),
              regOpenAt,
              regCloseAt,

              // ✅ payment from admin
              payEnabled: !!ev.payEnabled,
              price: (ev.price === 0 || ev.price) ? normalizeMoney(ev.price) : null,
              currency: (ev.currency || "UAH").toUpperCase(),
              payDetails: (ev.payDetails || "").trim(),
            });
          });
        } else {
          const startAt = toDateMaybe(c.startAt || c.startDate);
          const endAt   = toDateMaybe(c.endAt || c.endDate || c.finishAt || c.finishDate);

          items.push({
            compId,
            brand,
            year,
            compTitle: title,
            stageKey: null,
            stageTitle: null,
            entryType: String(c.entryType || "team").toLowerCase() === "solo" ? "solo" : "team",

            startAt,
            endAt,

            regMode: c.regMode || "auto",
            manualOpen: !!c.manualOpen,
            regOpenAt: c.regOpenAt || c.regOpenDate || null,
            regCloseAt: c.regCloseAt || c.regCloseDate || null,

            // ✅ payment (fallback)
            payEnabled: !!c.payEnabled,
            price: (c.price === 0 || c.price) ? normalizeMoney(c.price) : null,
            currency: (c.currency || "UAH").toUpperCase(),
            payDetails: (c.payDetails || "").trim(),
          });
        }
      });

      items.sort((a, b) => {
        const ad = a.startAt ? a.startAt.getTime() : 0;
        const bd = b.startAt ? b.startAt.getTime() : 0;
        return ad - bd;
      });

      lastItems = items;
      calcNearestUpcoming(items);
      renderItems(items);
      refreshSubmitState();

      saveCompetitionsToCache(items);
    } catch (e) {
      console.error("loadCompetitionsFresh error:", e);
      if (!lastItems.length) {
        eventOptionsEl.innerHTML =
          '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ).</p>';
      }
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function renderItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    // ✅ clear pay UI until pick
    setPayUIFromSelected(null);

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    items.forEach(it => {
      const open = isOpenWindow(it);
      const value = `${it.compId}||${it.stageKey || ""}`;
      const lamp = lampClassFor(it, value);

      const typeBadge = it.entryType === "solo" ? "SOLO" : "TEAM";

      const titleText =
        `${it.brand ? it.brand + " · " : ""}${it.compTitle}` +
        (it.stageTitle ? ` — ${it.stageTitle}` : "") +
        ` · ${typeBadge}`;

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      const label = document.createElement("label");
      label.className = "stage-card";
      label.setAttribute("role", "button");

      if (!open) {
        label.style.opacity = "0.65";
        label.style.filter = "saturate(.9)";
      }

      label.innerHTML = `
        <input type="radio" name="stagePick" value="${escapeHtml(value)}" ${open ? "" : "disabled"} style="position:absolute;left:-9999px;opacity:0;">
        <div class="stage-head">
          <span class="lamp ${lamp}"></span>
          <div class="stage-info">
            <div class="stage-title">${escapeHtml(titleText)}</div>
            <div class="stage-dates">${escapeHtml(dateLine)}</div>
          </div>
        </div>
      `;

      eventOptionsEl.appendChild(label);
    });
  }

  document.addEventListener("change", (e) => {
    if (!e.target) return;

    if (e.target.name === "stagePick") {
      const picked = document.querySelector('input[name="stagePick"]:checked');
      const selectedValue = picked ? String(picked.value) : "";
      const selectedItem = selectedValue
        ? lastItems.find(x => `${x.compId}||${x.stageKey || ""}` === selectedValue)
        : null;

      setPayUIFromSelected(selectedItem || null);
    }

    if (e.target.name === "stagePick" || e.target.id === "rules") refreshSubmitState();
  });

  // 1) ПЕРШЕ — кешований список одразу
  if (eventOptionsEl) eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження списку...</p>`;
  tryRenderCompetitionsFromCache();

  // 2) Далі — актуальний список
  setTimeout(() => { loadCompetitionsFresh(); }, 50);

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    initFoodLogic();
    refreshSubmitState();

    if (!user) {
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Мій кабінет» і поверніться сюди.";
      setMsg("Увійдіть у акаунт, щоб подати заявку.", false);
      return;
    }

    try {
      await loadProfile(user);
      refreshSubmitState();
    } catch (e) {
      console.error(e);
      if (submitBtn) submitBtn.disabled = true;
      setMsg(e.message || "Помилка профілю.", false);
    }
  });

  function buildRegDocId({ competitionId, stageId, entryType }) {
    const st = stageId || "main";
    if (entryType === "solo") return `${competitionId}__${st}__solo__${profile.uid}`;
    return `${competitionId}__${st}__team__${profile.teamId}`;
  }

  // ✅ PUBLIC mirror payload (тільки безпечні поля)
  function buildPublicPayload({ uid, competitionId, stageId, entryType, teamId, teamName, status }) {
    return {
      uid: uid || null,
      competitionId,
      stageId: stageId || null,
      entryType: entryType || "team",
      teamId: teamId || null,
      teamName: teamName || null,
      status: status || "pending_payment",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

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
        setMsg("Оберіть ВІДКРИТЕ (зелена лампа) змагання/етап.", false);
        return;
      }

      const selectedValue = String(picked.value);
      const selectedItem = lastItems.find(x => `${x.compId}||${x.stageKey || ""}` === selectedValue);
      if (!selectedItem || !isOpenWindow(selectedItem)) {
        setMsg("Цей етап ще не відкритий для реєстрації. Оберіть зелений.", false);
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

      if (rulesChk && !rulesChk.checked) {
        setMsg("Підтвердіть ознайомлення з регламентом.", false);
        return;
      }

      const [competitionId, stageKeyRaw] = selectedValue.split("||");
      const stageId = (stageKeyRaw || "").trim() || null;

      const entryType = selectedItem.entryType || "team";

      // TEAM вимога під rules
      if (entryType === "team") {
        if (!profile.teamId) {
          setMsg("Це командний етап. Спочатку приєднайтесь до команди (в «Мій кабінет»).", false);
          return;
        }
        if (!profile.teamName) {
          setMsg("Не знайдено назву команди. Перевір teams/{teamId}.name", false);
          return;
        }
      }

      const participantName = (profile.fullName || profile.captain || profile.email || "").trim();

      // ✅ payment snapshot from selectedItem
      const payment = {
        payEnabled: !!selectedItem.payEnabled,
        price: (selectedItem.price === 0 || selectedItem.price) ? normalizeMoney(selectedItem.price) : null,
        currency: (selectedItem.currency || "UAH").toUpperCase(),
        payDetails: String(selectedItem.payDetails || "").trim()
      };

      const status = payment.payEnabled ? "pending_payment" : "pending";

      const docId = buildRegDocId({ competitionId, stageId, entryType });
      const ref = db.collection("registrations").doc(docId);

      const payload = {
        uid: profile.uid,
        competitionId,
        stageId: stageId || null,
        entryType,

        teamId: entryType === "team" ? profile.teamId : null,
        teamName: entryType === "team" ? profile.teamName : null,

        participantName: entryType === "solo" ? participantName : null,

        captain: entryType === "team" ? profile.captain : participantName,
        phone: profile.phone || "",

        food,
        foodQty: foodQty === null ? null : Number(foodQty),

        // ✅ payment snapshot fields
        payEnabled: payment.payEnabled,
        price: payment.price,
        currency: payment.currency,
        payDetails: payment.payDetails || "",

        status,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        setLoading(true);
        setMsg("");

        // Anti-duplicate
        await ref.set(payload, { merge: false });

        // ✅ Публічне дзеркало (безпечні поля) -> public_participants
        try {
          const pubRef = db.collection("public_participants").doc(docId);
          const pubPayload = buildPublicPayload({
            uid: profile.uid,
            competitionId,
            stageId,
            entryType,
            teamId: (entryType === "team") ? profile.teamId : null,
            teamName: (entryType === "team") ? profile.teamName : null,
            status
          });
          await pubRef.set(pubPayload, { merge: false });
        } catch (e) {
          console.warn("public_participants write failed:", e);
        }

        setMsg(
          payment.payEnabled
            ? "Заявка подана ✔ Підтвердження після оплати."
            : "Заявка подана ✔ Оплата не потрібна.",
          true
        );

        form.reset();
        initFoodLogic();
        setPayUIFromSelected(null);
      } catch (err) {
        console.error("submit error:", err);

        const code = String(err?.code || "").toLowerCase();
        if (code.includes("permission")) {
          setMsg("Заявка вже існує (дубль) або не збігається teamId з профілю. Перевір «Мій кабінет».", false);
        } else {
          setMsg(`Помилка відправки заявки. (${err?.code || "no-code"})`, false);
        }
      } finally {
        setLoading(false);
      }
    });
  }
})();
