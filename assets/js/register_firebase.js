// assets/js/register_firebase.js
// STOLAR CARP • Registration
// читає competitions + season.events[]; показує список; дозволяє реєстрацію лише коли OPEN.

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
  let activeCompetitionId = null;

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

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function toDateMaybe(x) {
    if (!x) return null;
    try {
      if (x instanceof Date) return x;
      if (typeof x === "string") return new Date(x);
      if (x && typeof x.toDate === "function") return x.toDate(); // Timestamp
    } catch {}
    return null;
  }

  function nowKyiv() {
    // дати ти задаєш як 12:00 Київ — нам достатньо локального now()
    return new Date();
  }

  function getRegDatesFromEvent(ev) {
    // підтримка різних назв полів з твоїх скрінів
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
    // item: { regMode, manualOpen, regOpenAt, regCloseAt }
    const mode = String(item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowKyiv();
    return n >= openAt && n <= closeAt;
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
        `Команда: <b>${profile.teamName}</b><br>` +
        `Капітан: <b>${profile.captain}</b><br>` +
        `Телефон: <b>${profile.phone || "не вказано"}</b>`;
    }
  }

  async function loadActiveCompetitionId() {
    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) {
        const d = s.data() || {};
        activeCompetitionId = d.activeCompetitionId || d.activeCompetition || null;
      }
    } catch {}
  }

  async function loadCompetitions() {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження списку...</p>`;

    try {
      await loadActiveCompetitionId();

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

      // сортування: нові роки зверху, далі назва, далі stageKey
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
    }
  }

  function badge(type, text) {
    return `<span class="pill-b ${type}">${text}</span>`;
  }

  function renderCompetitionItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const anyOpen = items.some(isOpenWindow);
    if (submitBtn) submitBtn.disabled = !anyOpen;

    items.forEach(it => {
      const open = isOpenWindow(it);
      const value = `${it.compId}||${it.stageKey || ""}`;

      const regOpenD  = toDateMaybe(it.regOpenAt);
      const regCloseD = toDateMaybe(it.regCloseAt);

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;
      const regLine  = (regOpenD && regCloseD)
        ? `Реєстрація: ${fmtDate(regOpenD)} — ${fmtDate(regCloseD)}`
        : `Реєстрація: —`;

      // типові бейджі кольорами:
      const badges = [];
      if (it.kind === "stage" && it.isFinal) badges.push(badge("pill-b--final", "ФІНАЛ"));
      else if (it.kind === "stage") badges.push(badge("pill-b--stage", "ЕТАП"));
      else if (it.stalker) badges.push(badge("pill-b--stalker", "STALKER"));
      else badges.push(badge("pill-b--oneoff", "ЗМАГАННЯ"));

      if (open) badges.push(badge("pill-b--open", "ВІДКРИТО"));
      else badges.push(badge("pill-b--closed", "ЗАКРИТО"));

      if (activeCompetitionId && it.compId === activeCompetitionId) {
        badges.push(badge("pill-b--active", "ACTIVE"));
      }

      const label = document.createElement("label");
      label.className = "event-item" + (open ? "" : " is-closed");

      // Текст який не лізе за межі (ellipsis)
      const titleText =
        `${it.brand ? it.brand + " · " : ""}${it.compTitle}` +
        (it.stageTitle ? ` — ${it.stageTitle}` : "");

      label.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div class="event-content">
          <div class="event-title">
            <div class="text" title="${titleText.replaceAll('"','&quot;')}">${titleText}</div>
            <div class="event-badges">${badges.join("")}</div>
          </div>
          <div class="event-meta" title="${dateLine} · ${regLine}">${dateLine} · ${regLine}</div>
        </div>
      `;

      eventOptionsEl.appendChild(label);
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
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
      }
    });
  }
})();
