// assets/js/register_firebase.js
// STOLAR CARP • Registration
// competitions + events[] → показує картки етапів
// Лампочка: зелена = відкрита реєстрація, жовта = найближча до відкриття, червона = ще не відкрита
// Показує: Назву + Дата старт/фініш. НЕ показує reg open/close, НЕ показує "closed/active".

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
    if (eventOptionsEl) eventOptionsEl.innerHTML =
      '<p class="form__hint" style="color:#ff6c6c;">Firebase init не завантажився.</p>';
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
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
    if (submitBtn) submitBtn.disabled = !!v;
  }

  function nowKyiv() {
    // ти задаєш дати як 12:00 Київ — для логіки достатньо локального now()
    return new Date();
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
      if (x && typeof x.toDate === "function") return x.toDate(); // Firestore Timestamp
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
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !item.manualOpen; // ручний: якщо не відкрито — вважаємо "ще не відкрита"
    const openAt = toDateMaybe(item.regOpenAt);
    if (!openAt) return false;
    return openAt > nowKyiv();
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
              compId,
              brand,
              compTitle: title,
              year,

              stageKey: key,
              stageTitle,

              startAt: toDateMaybe(startAt),
              endAt: toDateMaybe(endAt),

              regMode: ev.regMode || c.regMode || "auto",
              manualOpen: !!(ev.manualOpen ?? c.manualOpen),
              regOpenAt,
              regCloseAt
            });
          });
        }
      });

      // сортування по даті старту (найближчі/майбутні вище)
      items.sort((a, b) => {
        const ad = a.startAt ? a.startAt.getTime() : 0;
        const bd = b.startAt ? b.startAt.getTime() : 0;
        return ad - bd;
      });

      renderStageCards(items);
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ).</p>';
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function renderStageCards(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // шукаємо найближчу майбутню (для жовтої лампочки)
    let nearestUpcomingKey = null;
    let nearestTime = Infinity;

    items.forEach(it => {
      if (!isOpenWindow(it) && isUpcoming(it)) {
        const d = toDateMaybe(it.regOpenAt);
        if (d) {
          const t = d.getTime();
          if (t < nearestTime) {
            nearestTime = t;
            nearestUpcomingKey = `${it.compId}||${it.stageKey || ""}`;
          }
        }
      }
    });

    // submit активний лише якщо є хоч один OPEN
    const anyOpen = items.some(isOpenWindow);
    if (submitBtn) submitBtn.disabled = !anyOpen;

    items.forEach(it => {
      const value = `${it.compId}||${it.stageKey || ""}`;
      const open = isOpenWindow(it);
      const upcoming = !open && isUpcoming(it);

      let lampClass = "lamp-red";
      if (open) lampClass = "lamp-green";
      else if (upcoming && nearestUpcomingKey && value === nearestUpcomingKey) lampClass = "lamp-yellow";
      else if (upcoming) lampClass = "lamp-red";
      else lampClass = "lamp-red"; // минулі/закриті — теж червона (щоб не плодити 4-й статус)

      const titleText =
        `${it.brand ? it.brand + " · " : ""}${it.compTitle}` +
        (it.stageTitle ? ` — ${it.stageTitle}` : "");

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      // радіо лишаємо для форми, але ховаємо (клік по картці вибирає)
      const card = document.createElement("div");
      card.className = "stage-card" + (open ? "" : " is-disabled");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", open ? "0" : "-1");
      card.dataset.value = value;

      card.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}
               style="position:absolute;opacity:0;pointer-events:none;">
        <div class="stage-head">
          <span class="lamp ${lampClass}"></span>
          <div class="stage-info">
            <div class="stage-title">${titleText}</div>
            <div class="stage-dates">${dateLine}</div>
          </div>
        </div>
      `;

      function selectThis() {
        if (!open) return;
        // відмітити radio
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        // підсвітити вибране
        document.querySelectorAll(".stage-card.is-selected").forEach(el => el.classList.remove("is-selected"));
        card.classList.add("is-selected");

        setMsg("");
      }

      card.addEventListener("click", selectThis);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectThis();
        }
      });

      eventOptionsEl.appendChild(card);
    });
  }

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
        setMsg("Оберіть ВІДКРИТЕ змагання/етап (зелена лампочка).", false);
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

      const [competitionId, stageKeyRaw] = String(picked.value).split("||");
      const stageId = (stageKeyRaw || "").trim() || null;

      try {
        setLoading(true);
        setMsg("");

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

        // прибрати підсвітку вибору після reset
        document.querySelectorAll(".stage-card.is-selected").forEach(el => el.classList.remove("is-selected"));
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
      }
    });
  }
})();
