// assets/js/register_firebase.js
// Читає competitions і показує всі змагання + старт/фініш.
// Дозволяє подати заявку тільки на ВІДКРИТИЙ етап/змагання.
// Пише в collection: registrations

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

  const TS = window.firebase.firestore.Timestamp;

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
    // Для логіки "відкрито/закрито" достатньо локального часу користувача;
    // ти задаєш всі дати як 12:00 Київ при створенні.
    return new Date();
  }

  function isOpenWindow(item) {
    // item: { regMode, manualOpen, regOpenAt, regCloseAt }
    const mode = (item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowKyiv();
    return n >= openAt && n <= closeAt;
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

    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження змагань...</p>`;

    // кеш 60 сек
    const cacheKey = "sc_competitions_v1";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && (Date.now() - cached.t < 60_000) && Array.isArray(cached.items)) {
        renderCompetitionItems(cached.items);
        return;
      }
    } catch {}

    try {
      // Без orderBy, щоб не вимагало індексів/поля.
      const snap = await db.collection("competitions").get();

      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        // Нормалізація
        const brand = c.brand || "STOLAR CARP";
        const year  = c.year || c.seasonYear || "";
        const title = c.title || c.name || (year ? `Season ${year}` : compId);

        const type  = (c.type || "").toLowerCase(); // season / oneoff (або як у тебе)
        const hasStagesArr = Array.isArray(c.stages) && c.stages.length;

        // Якщо це сезон і має масив stages[] — показуємо кожен етап окремою опцією.
        if (hasStagesArr) {
          c.stages.forEach((st, idx) => {
            const stageKey = st.stageId || st.id || `stage-${idx + 1}`;
            const stageTitle = st.title || st.name || st.label || (st.isFinal ? "Фінал" : `Етап ${idx + 1}`);

            const startAt = toDateMaybe(st.startAt || st.startDate);
            const endAt   = toDateMaybe(st.endAt || st.endDate);

            const regMode    = st.regMode || c.regMode || "auto";
            const manualOpen = !!(st.manualOpen ?? c.manualOpen);
            const regOpenAt  = st.regOpenAt || null;
            const regCloseAt = st.regCloseAt || null;

            items.push({
              compId,
              compTitle: title,
              brand,
              year,
              type: type || "season",
              stageKey,
              stageTitle,
              isFinal: !!st.isFinal,
              startAt,
              endAt,
              regMode,
              manualOpen,
              regOpenAt,
              regCloseAt,
            });
          });
        } else {
          // Одноразове або сезон без stages[]: показуємо як один пункт
          const startAt = toDateMaybe(c.startAt || c.startDate);
          const endAt   = toDateMaybe(c.endAt || c.endDate);

          items.push({
            compId,
            compTitle: title,
            brand,
            year,
            type: type || "oneoff",
            stageKey: null,
            stageTitle: null,
            isFinal: false,
            startAt,
            endAt,
            regMode: c.regMode || "auto",
            manualOpen: !!c.manualOpen,
            regOpenAt: c.regOpenAt || null,
            regCloseAt: c.regCloseAt || null,
          });
        }
      });

      // Сортування: по року/назві/етапу
      items.sort((a, b) => {
        const ay = String(a.year || "");
        const by = String(b.year || "");
        if (ay !== by) return by.localeCompare(ay, "uk"); // нові зверху
        const at = (a.compTitle || "").toString();
        const bt = (b.compTitle || "").toString();
        if (at !== bt) return at.localeCompare(bt, "uk");
        const as = (a.stageKey || "").toString();
        const bs = (b.stageKey || "").toString();
        return as.localeCompare(bs, "uk");
      });

      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
      renderCompetitionItems(items);
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання. Перевір Rules/доступ або увійди в акаунт.</p>';
    }
  }

  function renderCompetitionItems(items) {
    if (!eventOptionsEl) return;
    eventOptionsEl.innerHTML = "";

    if (!items.length) {
      eventOptionsEl.innerHTML = `<p class="form__hint">Нема створених змагань. Додай їх в адмінці.</p>`;
      return;
    }

    items.forEach(it => {
      const open = isOpenWindow(it);
      const value = `${it.compId}||${it.stageKey || ""}`;

      const dateLine =
        `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      const regOpenD  = toDateMaybe(it.regOpenAt);
      const regCloseD = toDateMaybe(it.regCloseAt);

      const regLine = (regOpenD && regCloseD)
        ? `Реєстрація: ${fmtDate(regOpenD)} — ${fmtDate(regCloseD)}`
        : `Реєстрація: —`;

      const el = document.createElement("label");
      el.className = "event-item";
      el.style.opacity = open ? "" : ".55";

      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div>
          <div style="font-weight:600;">
            ${it.brand ? `${it.brand} · ` : ""}${it.compTitle}${it.stageTitle ? ` — ${it.stageTitle}` : ""}
            ${it.isFinal ? " · ФІНАЛ" : ""}
            ${open ? "" : " · ЗАКРИТО"}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">
            ${dateLine} · ${regLine}
          </div>
        </div>
      `;
      eventOptionsEl.appendChild(el);
    });

    // якщо є хоч один відкритий — дозволяємо кнопку (інакше хай буде disabled)
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
      const stageKey = (stageKeyRaw || "").trim() || null;

      try {
        setLoading(true);
        setMsg("");

        await db.collection("registrations").add({
          uid: profile.uid,

          competitionId,
          stageId: stageKey, // може бути null для одноразового

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
