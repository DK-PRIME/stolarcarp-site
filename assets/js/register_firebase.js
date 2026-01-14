// assets/js/register_firebase.js
// STOLAR CARP • Registration (FAST) — fixed UX + manual dates + payment preview
// ✅ Can click CLOSED items to view payment
// ✅ Submit enabled ONLY when registration open
// ✅ regMode=manual now supports dates too (manualOpen overrides)
// ✅ YYYY-MM-DD dates treated as 12:00 Kyiv (matches admin UI)
// ✅ Payment UI split: amount + details + copy
// ✅ Mobile: no overflow/out-of-screen on select

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
  const rulesChk       = document.getElementById("rules");

  // Payment UI (existing page ids)
  const copyPayBtn = document.getElementById("copyCard"); // button
  const payBoxEl   = document.getElementById("cardNum");  // pill/box
  // optional: if you later add these ids in HTML, script will use them too
  const payAmountEl  = document.getElementById("payAmount");
  const payCurrEl    = document.getElementById("payCurrency");
  const payDetailsEl = document.getElementById("payDetails");

  if (!auth || !db || !window.firebase) {
    if (eventOptionsEl) eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // ======= PERF CACHE =======
  const COMP_CACHE_KEY = "sc_competitions_cache_v2"; // bump to reset old cache
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

  function normalizeMoney(v){
    if (v === 0) return 0;
    if (v === null || v === undefined) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // ✅ parse "YYYY-MM-DD" as 12:00 Kyiv (local time)
  function parseDateYMDAsNoonLocal(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }

  function toDateMaybe(x) {
    if (!x) return null;
    try {
      if (x instanceof Date) return x;
      if (typeof x === "string") {
        // If pure date -> noon local
        const noon = parseDateYMDAsNoonLocal(x.trim());
        if (noon) return noon;

        const d = new Date(x);
        return isFinite(d.getTime()) ? d : null;
      }
      if (x && typeof x.toDate === "function") return x.toDate();
    } catch {}
    return null;
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

  function nowKyiv() {
    // браузер користувача (Київський час на телефоні)
    return new Date();
  }

  // ======= PAYMENT UI =======
  // show amount + details separately, and copy exactly details text
  let activePayCopyText = "";

  function formatCardLikeText(text) {
    // if it's 16 digits only -> group by 4 for display
    const raw = String(text || "").trim();
    if (/^\d{16}$/.test(raw)) return raw.replace(/(\d{4})(?=\d)/g, "$1 ");
    return raw;
  }

  function setPayUIFromSelected(item) {
    const hasAnyUI = !!(payBoxEl || payAmountEl || payDetailsEl);
    if (!hasAnyUI) return;

    if (!item) {
      activePayCopyText = "";
      if (payAmountEl)  payAmountEl.textContent = "—";
      if (payCurrEl)    payCurrEl.textContent = "UAH";
      if (payDetailsEl) payDetailsEl.textContent = "—";
      if (payBoxEl)     payBoxEl.textContent = "—";
      return;
    }

    const payEnabled = !!item.payEnabled;
    const price = normalizeMoney(item.price);
    const currency = String(item.currency || "UAH").toUpperCase();
    const details = String(item.payDetails || "").trim();

    if (!payEnabled) {
      activePayCopyText = "Оплата не потрібна для цього етапу ✅";
      if (payAmountEl)  payAmountEl.textContent = "0";
      if (payCurrEl)    payCurrEl.textContent = currency;
      if (payDetailsEl) payDetailsEl.textContent = "Оплата не потрібна ✅";
      if (payBoxEl)     payBoxEl.textContent = "Оплата не потрібна ✅";
      return;
    }

    // Amount
    const amountText = (price === null) ? "—" : String(price);

    // Details (keep as text, allow multiline if your CSS uses pre-line)
    const detailsText = details || "Реквізити не задані адміністратором.";

    // What we copy: ONLY реквізити (бо це найчастіше треба), але якщо пусто — копіюємо все що є
    activePayCopyText = detailsText;

    if (payAmountEl)  payAmountEl.textContent = amountText;
    if (payCurrEl)    payCurrEl.textContent = currency;
    if (payDetailsEl) payDetailsEl.textContent = detailsText;

    // If you have only #cardNum (pill), show реквізити (or card) there
    if (payBoxEl) payBoxEl.textContent = formatCardLikeText(detailsText);
  }

  if (copyPayBtn) {
    copyPayBtn.addEventListener("click", async () => {
      const txt = String(activePayCopyText || "").trim();
      if (!txt) {
        alert("Нема що копіювати.");
        return;
      }
      try {
        await navigator.clipboard.writeText(txt);
        const prev = copyPayBtn.textContent;
        copyPayBtn.textContent = "Скопійовано ✔";
        setTimeout(() => (copyPayBtn.textContent = prev || "Скопіювати реквізити"), 1200);
      } catch {
        alert("Не вдалося скопіювати. Скопіюйте вручну.");
      }
    });
  }

  // ======= REG WINDOW =======
  function isOpenWindow(item) {
    const n = nowKyiv();
    const mode = String(item.regMode || "auto").toLowerCase();

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);

    if (mode === "manual") {
      // ✅ manualOpen overrides
      if (item.manualOpen === true) return true;

      // ✅ BUT if admin also set dates — use them (your expected behavior)
      if (openAt && closeAt) return (n >= openAt && n <= closeAt);

      return false;
    }

    // auto
    if (!openAt || !closeAt) return false;
    return (n >= openAt && n <= closeAt);
  }

  function calcNearestUpcoming(items) {
    let best = null;
    items.forEach(it => {
      const openAt = toDateMaybe(it.regOpenAt);
      if (!openAt) return;
      if (openAt <= nowKyiv()) return;
      const value = `${it.compId}||${it.stageKey || ""}`;
      if (!best || openAt < best.openAt) best = { value, openAt };
    });
    nearestUpcomingValue = best ? best.value : null;
  }

  function statusLamp(it, value) {
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

    // ✅ can select closed; ✅ can submit only when open
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
      regOpenAt: it.regOpenAt || null,
      regCloseAt: it.regCloseAt || null,
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
        payEnabled: !!it.payEnabled,
        price: (it.price === 0 || it.price) ? it.price : null,
        currency: (it.currency || "UAH").toUpperCase(),
        payDetails: (it.payDetails || "").trim(),
        regMode: it.regMode || "auto",
        manualOpen: !!it.manualOpen,
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

  // ======= RENDER (mobile safe, selectable closed) =======
  function renderItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    setPayUIFromSelected(null);

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    items.forEach(it => {
      const open = isOpenWindow(it);
      const value = `${it.compId}||${it.stageKey || ""}`;
      const lamp = statusLamp(it, value);

      const typeBadge = it.entryType === "solo" ? "SOLO" : "TEAM";
      const titleText =
        `${it.brand ? it.brand + " · " : ""}${it.compTitle}` +
        (it.stageTitle ? ` — ${it.stageTitle}` : "");

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      const label = document.createElement("label");
      label.className = "event-item" + (open ? "" : " is-closed");
      label.setAttribute("role", "button");
      label.style.cursor = "pointer";

      // ✅ radio NOT disabled — so user can click to preview payment
      label.innerHTML = `
        <input type="radio" name="stagePick" value="${escapeHtml(value)}"
               style="flex:0 0 auto; margin-top:2px;">
        <div class="event-content" style="min-width:0;flex:1;">
          <div class="event-title" style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;">
            <div class="text" style="min-width:0;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span class="lamp ${lamp}"></span>
                <span style="font-weight:900;line-height:1.2;word-break:break-word;white-space:normal;">
                  ${escapeHtml(titleText)}
                </span>
              </div>
              <div style="margin-top:6px;color:var(--muted);font-size:12px;white-space:normal;word-break:break-word;">
                ${escapeHtml(dateLine)}
              </div>
              <div style="margin-top:6px;color:var(--muted);font-size:12px;white-space:normal;">
                ${open ? "Реєстрація відкрита ✅" : "Реєстрація закрита "}
              </div>
            </div>
            <div class="event-badges" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto;">
              <span class="pill-b">${escapeHtml(typeBadge)}</span>
              <span class="pill-b ${open ? "pill-b--open" : "pill-b--closed"}">${open ? "ВІДКРИТО" : "ЗАКРИТО"}</span>
            </div>
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

      // ✅ show payment even if closed
      setPayUIFromSelected(selectedItem || null);

      // small UX message
      if (selectedItem && !isOpenWindow(selectedItem)) {
        setMsg("Етап закритий — заявку подати не можна, але оплату можна переглянути 👇", false);
      } else {
        setMsg("");
      }
    }

    if (e.target.name === "stagePick" || e.target.id === "rules") refreshSubmitState();
  });

  // 1) cached list first
  if (eventOptionsEl) eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження списку...</p>`;
  tryRenderCompetitionsFromCache();

  // 2) fresh list
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
        setMsg("Оберіть змагання/етап.", false);
        return;
      }

      const selectedValue = String(picked.value);
      const selectedItem = lastItems.find(x => `${x.compId}||${x.stageKey || ""}` === selectedValue);
      if (!selectedItem || !isOpenWindow(selectedItem)) {
        setMsg("Цей етап зараз ЗАКРИТИЙ для реєстрації. Оплату можна переглянути, але заявку подати — ні.", false);
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

        await ref.set(payload, { merge: false });

        // public mirror
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

        // keep selected item payment visible? -> no, reset payment
        setPayUIFromSelected(null);
        refreshSubmitState();
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
