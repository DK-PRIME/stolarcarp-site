// assets/js/register_firebase.js
// STOLAR CARP • Registration
// читає competitions + season.events[]; показує список з лампочками;
// реєстрація дозволена ЛИШЕ коли OPEN (зелена).

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
  const rulesChk       = document.getElementById("rules"); // є в твоєму HTML

  if (!auth || !db || !window.firebase) {
    if (eventOptionsEl) eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  let currentUser = null;
  let profile = null;

  // збираємо всі items і визначаємо “найближчу” (жовту)
  let lastItems = [];
  let nearestUpcomingId = null; // value === `${compId}||${stageKey||""}`

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");
    if (text) msgEl.classList.add(ok ? "ok" : "err");
  }

  function setLoading(v) {
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
    // не блокуємо кнопку назавжди — далі керуємо через refreshSubmitState()
    if (submitBtn) submitBtn.disabled = !!v ? true : submitBtn.disabled;
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
      if (x && typeof x.toDate === "function") return x.toDate(); // Timestamp
    } catch {}
    return null;
  }

  function nowKyiv() {
    // ти задаєш 12:00 Київ — тут вистачає локального now()
    return new Date();
  }

  function getRegDatesFromEvent(ev) {
    const regOpen  = ev.regOpenAt  || ev.regOpenDate  || ev.regOpen || null;
    const regClose = ev.regCloseAt || ev.regCloseDate || ev.regClose || null;
    return { regOpenAt: regOpen, regCloseAt: regClose };
  }

  function getRunDatesFromEvent(ev) {
    const start  = ev.startAt  || ev.startDate  || null;
    const finish = ev.finishAt || ev.finishDate || ev.endAt || ev.endDate || null;
    return { startAt: start, endAt: finish };
  }

  function isOpenWindow(item) {
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowKyiv();
    return n >= openAt && n <= closeAt;
  }

  function isUpcoming(item) {
    // upcoming = ще НЕ відкрито, але є regOpenAt у майбутньому
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return false; // ручний режим не прогнозуємо жовтим

    const openAt = toDateMaybe(item.regOpenAt);
    if (!openAt) return false;

    return openAt > nowKyiv();
  }

  function isStalkerComp(c) {
    const t = `${c.title || ""} ${c.name || ""}`.toLowerCase();
    const type = String(c.type || "").toLowerCase();
    const fmt  = String(c.format || "").toLowerCase();
    return t.includes("stalker") || type === "stalker" || fmt === "solo";
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
        `Команда: <b>${escapeHtml(profile.teamName)}</b><br>` +
        `Капітан: <b>${escapeHtml(profile.captain)}</b><br>` +
        `Телефон: <b>${escapeHtml(profile.phone || "не вказано")}</b>`;
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadCompetitions() {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження списку...</p>`;

    try {
      const snap = await db.collection("competitions").get();
      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const year  = c.year || c.seasonYear || "";
        const title = c.name || c.title || (year ? `Season ${year}` : compId);

        const type = String(c.type || "").toLowerCase(); // season / competition / stalker...
        const stalker = isStalkerComp(c);

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

            items.push({
              kind: "stage",
              compId,
              compTitle: title,
              brand,
              year,
              stalker,
              type: type || "season",
              stageKey: key,
              stageTitle,
              isFinal,

              startAt: toDateMaybe(startAt),
              endAt: toDateMaybe(endAt),

              regMode: ev.regMode || c.regMode || "auto",
              manualOpen: !!(ev.manualOpen ?? c.manualOpen),
              regOpenAt,
              regCloseAt
            });
          });
        } else {
          // одноразові змагання без events[]
          const startAt = toDateMaybe(c.startAt || c.startDate);
          const endAt   = toDateMaybe(c.endAt || c.endDate || c.finishAt || c.finishDate);

          items.push({
            kind: "oneoff",
            compId,
            compTitle: title,
            brand,
            year,
            stalker,
            type: stalker ? "stalker" : (type || "competition"),
            stageKey: null,
            stageTitle: null,
            isFinal: false,

            startAt,
            endAt,

            regMode: c.regMode || "auto",
            manualOpen: !!c.manualOpen,
            regOpenAt: c.regOpenAt || c.regOpenDate || null,
            regCloseAt: c.regCloseAt || c.regCloseDate || null
          });
        }
      });

      // сортування по старту (щоб бачили нормальну послідовність)
      items.sort((a, b) => {
        const ad = a.startAt ? a.startAt.getTime() : 9999999999999;
        const bd = b.startAt ? b.startAt.getTime() : 9999999999999;
        return ad - bd;
      });

      lastItems = items;
      nearestUpcomingId = computeNearestUpcomingId(items);

      renderCompetitionItems(items);
      refreshSubmitState();
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ).</p>';
    }
  }

  function computeNearestUpcomingId(items) {
    // шукаємо тільки future regOpenAt (auto). Беремо найближче.
    const future = items
      .filter(isUpcoming)
      .map(it => ({
        it,
        openAt: toDateMaybe(it.regOpenAt)
      }))
      .filter(x => x.openAt)
      .sort((a, b) => a.openAt - b.openAt);

    if (!future.length) return null;
    const it = future[0].it;
    return `${it.compId}||${it.stageKey || ""}`;
  }

  function getLampClass(it, value) {
    if (isOpenWindow(it)) return "green";
    if (nearestUpcomingId && value === nearestUpcomingId) return "yellow";
    return "red";
  }

  function getLampTitle(it, value) {
    const c = getLampClass(it, value);
    if (c === "green") return "Реєстрація відкрита";
    if (c === "yellow") return "Найближче відкриття реєстрації";
    return "Реєстрація ще не відкрита або вже закрита";
  }

  function renderCompetitionItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    items.forEach(it => {
      const open = isOpenWindow(it);
      const value = `${it.compId}||${it.stageKey || ""}`;

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      // ✅ ГОЛОВНЕ: щоб читалась назва етапу/змагання
      const titleText =
        `${it.brand ? it.brand + " · " : ""}${it.compTitle}` +
        (it.stageTitle ? ` — ${it.stageTitle}` : "");

      const lampCls = getLampClass(it, value);
      const lampTitle = getLampTitle(it, value);

      const label = document.createElement("label");
      label.className = "event-item" + (open ? "" : " is-closed");

      // ✅ БЕЗ "ЗАКРИТО / ACTIVE"
      // ✅ Показуємо тільки: лампа + назва + Start–Finish
      // ✅ Радіо активне лише коли OPEN
      label.innerHTML = `
        <input type="radio" name="stagePick" value="${escapeHtml(value)}" ${open ? "" : "disabled"}>
        <span class="event-lamp ${lampCls}" title="${escapeHtml(lampTitle)}" aria-hidden="true"></span>

        <div class="event-content">
          <div class="event-title">
            <div class="text"
              style="white-space:normal; overflow:visible; text-overflow:unset; line-height:1.25;"
              title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
          </div>

          <div class="event-meta"
            style="white-space:normal; overflow:visible; text-overflow:unset;"
            title="${escapeHtml(dateLine)}">${escapeHtml(dateLine)}</div>
        </div>
      `;

      eventOptionsEl.appendChild(label);
    });
  }

  function refreshSubmitState() {
    if (!submitBtn) return;

    const loading = spinnerEl && spinnerEl.classList.contains("spinner--on");
    if (loading) {
      submitBtn.disabled = true;
      return;
    }

    const picked = document.querySelector('input[name="stagePick"]:checked');
    const rulesOk = rulesChk ? !!rulesChk.checked : true; // якщо немає — не блокуємо
    submitBtn.disabled = !(picked && rulesOk);
  }

  // слухаємо вибір етапу + чекбокс регламенту
  document.addEventListener("change", (e) => {
    if (!e.target) return;
    if (e.target.name === "stagePick" || e.target.id === "rules") {
      refreshSubmitState();
    }
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Акаунт» і поверніться сюди.";
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Список змагань доступний після входу в акаунт.</p>';
      setMsg("Увійдіть у акаунт, щоб бачити змагання та подати заявку.", false);
      return;
    }

    try {
      await loadProfile(user);
      initFoodLogic();
      await loadCompetitions();
      refreshSubmitState();
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

      if (rulesChk && !rulesChk.checked) {
        setMsg("Потрібно підтвердити ознайомлення з регламентом.", false);
        return;
      }

      const picked = document.querySelector('input[name="stagePick"]:checked');
      if (!picked) {
        setMsg("Оберіть відкрите (зелене) змагання/етап.", false);
        return;
      }

      // ✅ Захист: навіть якщо хтось “підмінив” disabled — перевіряємо OPEN по item
      const pickedValue = String(picked.value);
      const [competitionId, stageKeyRaw] = pickedValue.split("||");
      const stageId = (stageKeyRaw || "").trim() || null;

      const it = (lastItems || []).find(x => {
        const v = `${x.compId}||${x.stageKey || ""}`;
        return v === pickedValue;
      });

      if (!it || !isOpenWindow(it)) {
        setMsg("Ця реєстрація зараз закрита. Оберіть зелену лампочку.", false);
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

      try {
        setLoading(true);
        setMsg("");
        refreshSubmitState();

        await db.collection("registrations").add({
          uid: profile.uid,

          competitionId,
          stageId,

          teamId: profile.teamId,
          teamName: profile.teamName,
          captain: profile.captain,
          phone: profile.phone,

          food,
          foodQty: foodQty ?? null,

          status: "pending_payment",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
        refreshSubmitState();
      }
    });
  }
})();
