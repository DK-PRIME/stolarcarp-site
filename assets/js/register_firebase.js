// assets/js/register_firebase.js
// STOLAR CARP — Registration (competitions/events)
// shows competitions + stages, allows submit only if registration open

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
    if (spinnerEl) spinnerEl.classList.toggle("spinner--on", !!v);
    // submitBtn керуємо окремо нижче (бо є логіка “є відкриті/нема”)
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function toDateMaybe(x) {
    if (!x) return null;

    // Firestore Timestamp
    if (x && typeof x.toDate === "function") return x.toDate();

    // ISO string "2026-04-17" (як у тебе) — ставимо 12:00 локально, щоб вікно не “плавало”
    if (typeof x === "string") {
      const s = x.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    if (x instanceof Date) return x;
    return null;
  }

  function nowLocal() {
    return new Date();
  }

  function isOpenWindow(item) {
    // regMode: "auto" (by dates) or "manual" (manualOpen)
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowLocal();
    return n >= openAt && n <= closeAt;
  }

  function detectKind(it) {
    // 4 типи: stage, final, comp, stalker
    if (it.isFinal) return "final";

    const t = (it.type || "").toLowerCase();
    const name = `${it.compTitle || ""} ${it.stageTitle || ""}`.toLowerCase();

    const isStalker = t.includes("stalker") || name.includes("stalker") || !!it.isSolo;
    if (isStalker) return "stalker";

    if (it.stageKey) return "stage";
    return "comp";
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

  async function loadCompetitions() {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження змагань...</p>`;

    try {
      const snap = await db.collection("competitions").get();
      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const year  = c.year || c.seasonYear || "";
        const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);

        const type = (c.type || "").toLowerCase();

        // === MAIN: у тебе це events[] ===
        const evArr = Array.isArray(c.events) ? c.events : null;
        const stArr = Array.isArray(c.stages) ? c.stages : null;

        const arr = evArr || stArr;

        if (arr && arr.length) {
          arr.forEach((ev, idx) => {
            const stageKey   = ev.key || ev.stageId || ev.id || `stage-${idx + 1}`;
            const isFinal    = !!ev.isFinal || stageKey === "final";
            const stageTitle = ev.title || ev.name || (isFinal ? "Фінал" : `Етап ${idx + 1}`);

            const startAt  = toDateMaybe(ev.startDate || ev.startAt);
            const finishAt = toDateMaybe(ev.finishDate || ev.endDate || ev.endAt);

            items.push({
              compId,
              compTitle,
              brand,
              year,
              type,
              stageKey,
              stageTitle,
              isFinal,

              startAt,
              endAt: finishAt,

              regMode: ev.regMode || c.regMode || "auto",
              manualOpen: !!(ev.manualOpen ?? c.manualOpen),
              regOpenAt: ev.regOpenAt || c.regOpenAt || null,
              regCloseAt: ev.regCloseAt || c.regCloseAt || null,

              isSolo: !!ev.isSolo || !!c.isSolo
            });
          });
        } else {
          // no stages/events => single competition
          items.push({
            compId,
            compTitle,
            brand,
            year,
            type,
            stageKey: null,
            stageTitle: null,
            isFinal: false,

            startAt: toDateMaybe(c.startDate || c.startAt),
            endAt:   toDateMaybe(c.finishDate || c.endDate || c.endAt),

            regMode: c.regMode || "auto",
            manualOpen: !!c.manualOpen,
            regOpenAt: c.regOpenAt || null,
            regCloseAt: c.regCloseAt || null,

            isSolo: !!c.isSolo
          });
        }
      });

      // sort: newest year first
      items.sort((a, b) => {
        const ay = String(a.year || "");
        const by = String(b.year || "");
        if (ay !== by) return by.localeCompare(ay, "uk");
        const at = String(a.compTitle || "");
        const bt = String(b.compTitle || "");
        if (at !== bt) return at.localeCompare(bt, "uk");
        return String(a.stageKey || "").localeCompare(String(b.stageKey || ""), "uk");
      });

      renderCompetitionItems(items);
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ).</p>';
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function renderCompetitionItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    items.forEach(it => {
      const open = isOpenWindow(it);
      const kind = detectKind(it);

      const value = `${it.compId}||${it.stageKey || ""}`;

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      const regOpenD  = toDateMaybe(it.regOpenAt);
      const regCloseD = toDateMaybe(it.regCloseAt);

      const regLine = (regOpenD && regCloseD)
        ? `Реєстрація: ${fmtDate(regOpenD)} — ${fmtDate(regCloseD)}`
        : `Реєстрація: —`;

      const badges = [];
      badges.push(open ? `<span class="pill-b pill-b--open">ВІДКРИТО</span>` : `<span class="pill-b pill-b--closed">ЗАКРИТО</span>`);

      if (kind === "final") badges.push(`<span class="pill-b pill-b--final">ФІНАЛ</span>`);
      else if (kind === "stage") badges.push(`<span class="pill-b pill-b--stage">ЕТАП</span>`);
      else if (kind === "stalker") badges.push(`<span class="pill-b pill-b--stalker">STALKER</span>`);
      else badges.push(`<span class="pill-b pill-b--comp">ЗМАГАННЯ</span>`);

      const titleLeft =
        `${it.brand ? `${it.brand} · ` : ""}${it.compTitle}${it.stageTitle ? ` — ${it.stageTitle}` : ""}`;

      const el = document.createElement("label");
      el.className = "event-item" + (open ? "" : " is-closed");

      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div class="event-body">
          <div class="event-title">
            <div class="event-name" title="${titleLeft.replaceAll('"', "&quot;")}">${titleLeft}</div>
            <div class="event-badges">${badges.join("")}</div>
          </div>
          <div class="event-meta">${dateLine} · ${regLine}</div>
        </div>
      `;

      eventOptionsEl.appendChild(el);
    });

    // кнопка активна тільки якщо є відкриті
    const anyOpen = items.some(isOpenWindow);
    if (submitBtn) submitBtn.disabled = !anyOpen;
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    setMsg("");

    if (!user) {
      if (submitBtn) submitBtn.disabled = true;
      if (profileSummary) profileSummary.textContent = "Ви не залогінені. Зайдіть у «Акаунт» і поверніться сюди.";
      if (eventOptionsEl) eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Список змагань доступний після входу.</p>';
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
        setMsg("Оберіть відкрите змагання/етап.", false);
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
        // перерендер залишаємо як є (не треба знов грузити)
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
        // після сабміту кнопку не “вбиваємо” — вона залежить від відкритих етапів
        // її стан оновлюється при рендері
        const anyOpen = !!document.querySelector('.event-item:not(.is-closed) input[type="radio"]');
        if (submitBtn) submitBtn.disabled = !anyOpen;
      }
    });
  }
})();
