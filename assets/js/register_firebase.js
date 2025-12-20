// assets/js/register_firebase.js
// Показує всі змагання/етапи з Firestore (collection: competitions)
// Дозволяє подати заявку тільки на ВІДКРИТЕ змагання/етап
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
  const rulesCb        = document.getElementById("rules");

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
  let lastItems = [];

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("ok", "err");
    if (text) msgEl.classList.add(ok ? "ok" : "err");
  }

  function setLoading(v) {
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
    return new Date();
  }

  function isOpenWindow(item) {
    const mode = (item.regMode || "auto").toLowerCase();
    if (mode === "manual") return !!item.manualOpen;

    const openAt  = toDateMaybe(item.regOpenAt);
    const closeAt = toDateMaybe(item.regCloseAt);
    if (!openAt || !closeAt) return false;

    const n = nowKyiv();
    return n >= openAt && n <= closeAt;
  }

  // -------- UI state: submit enable/disable --------
  function getPickedValue() {
    return document.querySelector('input[name="stagePick"]:checked')?.value || "";
  }
  function getFoodValue() {
    return document.querySelector('input[name="food"]:checked')?.value || "";
  }
  function isRulesOk() {
    return !!rulesCb?.checked;
  }

  function validateFormForSubmit() {
    // вибір змагання
    const picked = getPickedValue();
    if (!picked) return false;

    // перевірка що вибране саме "відкрите"
    const [competitionId, stageKeyRaw] = String(picked).split("||");
    const stageId = (stageKeyRaw || "").trim() || null;
    const it = lastItems.find(x => x.compId === competitionId && (x.stageKey || null) === stageId);
    if (!it || !isOpenWindow(it)) return false;

    // харчування
    const food = getFoodValue();
    if (!food) return false;

    if (food === "Так") {
      const q = Number(foodQtyInput?.value || "0");
      if (!q || q < 1 || q > 6) return false;
    }

    // правила
    if (!isRulesOk()) return false;

    return true;
  }

  function updateSubmitState() {
    if (!submitBtn) return;
    submitBtn.disabled = !validateFormForSubmit();
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
      updateSubmitState();
    }

    radios.forEach(r => r.addEventListener("change", update));
    foodQtyInput.addEventListener("input", updateSubmitState);
    update();
  }

  if (rulesCb) rulesCb.addEventListener("change", updateSubmitState);

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

  function detectKind(it) {
    // потрібні різні кольори:
    // етапи = stage, фінал = final, звичайні змагання = oneoff, stalker = stalker
    if (it.isFinal) return "final";
    if (it.stageKey) return "stage"; // етап сезону
    const t = `${it.compTitle || ""} ${it.brand || ""}`.toLowerCase();
    if ((it.type || "").toLowerCase() === "stalker" || t.includes("stalker")) return "stalker";
    return "oneoff";
  }

  async function loadCompetitions() {
    if (!eventOptionsEl) return;

    eventOptionsEl.innerHTML = `<p class="form__hint">Завантаження змагань...</p>`;
    const cacheKey = "sc_competitions_v2";

    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && (Date.now() - cached.t < 60_000) && Array.isArray(cached.items)) {
        lastItems = cached.items;
        renderCompetitionItems(lastItems);
        return;
      }
    } catch {}

    try {
      const snap = await db.collection("competitions").get();
      const items = [];

      snap.forEach(docSnap => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const year  = c.year || c.seasonYear || "";
        const title = c.title || c.name || (year ? `Season ${year}` : compId);

        const type  = (c.type || "").toLowerCase(); // season / oneoff / stalker ...
        const stagesArr = c.stages; // (якщо ти десь ще маєш іншу структуру — скажеш, підлаштую)

        if (Array.isArray(stagesArr) && stagesArr.length) {
          stagesArr.forEach((st, idx) => {
            const stageKey = st.stageId || st.id || `stage-${idx + 1}`;
            const stageTitle = st.title || st.name || st.label || (st.isFinal ? "Фінал" : `Етап ${idx + 1}`);

            items.push({
              compId,
              compTitle: title,
              brand,
              year,
              type: type || "season",
              stageKey,
              stageTitle,
              isFinal: !!st.isFinal,

              startAt: toDateMaybe(st.startAt || st.startDate),
              endAt:   toDateMaybe(st.endAt || st.endDate),

              regMode: st.regMode || c.regMode || "auto",
              manualOpen: !!(st.manualOpen ?? c.manualOpen),
              regOpenAt:  st.regOpenAt || null,
              regCloseAt: st.regCloseAt || null,
            });
          });
        } else {
          items.push({
            compId,
            compTitle: title,
            brand,
            year,
            type: type || "oneoff",
            stageKey: null,
            stageTitle: null,
            isFinal: false,

            startAt: toDateMaybe(c.startAt || c.startDate),
            endAt:   toDateMaybe(c.endAt || c.endDate),

            regMode: c.regMode || "auto",
            manualOpen: !!c.manualOpen,
            regOpenAt:  c.regOpenAt || null,
            regCloseAt: c.regCloseAt || null,
          });
        }
      });

      // Сортування (нові зверху)
      items.sort((a, b) => {
        const ay = String(a.year || "");
        const by = String(b.year || "");
        if (ay !== by) return by.localeCompare(ay, "uk");
        const at = (a.compTitle || "").toString();
        const bt = (b.compTitle || "").toString();
        if (at !== bt) return at.localeCompare(bt, "uk");
        return String(a.stageKey || "").localeCompare(String(b.stageKey || ""), "uk");
      });

      lastItems = items;
      sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
      renderCompetitionItems(items);
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ або акаунт).</p>';
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function wireActiveHighlight() {
    // підсвітка вибраного
    const radios = document.querySelectorAll('input[name="stagePick"]');
    radios.forEach(r => {
      r.addEventListener("change", () => {
        document.querySelectorAll(".event-item").forEach(el => el.classList.remove("is-active"));
        const lbl = r.closest(".event-item");
        if (lbl) lbl.classList.add("is-active");
        updateSubmitState();
      });
    });
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
      const kind = detectKind(it);
      const value = `${it.compId}||${it.stageKey || ""}`;

      const dateLine = `${fmtDate(it.startAt)} — ${fmtDate(it.endAt)}`;

      const regOpenD  = toDateMaybe(it.regOpenAt);
      const regCloseD = toDateMaybe(it.regCloseAt);
      const regLine = (regOpenD && regCloseD)
        ? `Реєстрація: ${fmtDate(regOpenD)} — ${fmtDate(regCloseD)}`
        : `Реєстрація: —`;

      const titleText =
        `${it.brand ? `${it.brand} · ` : ""}${it.compTitle}${it.stageTitle ? ` — ${it.stageTitle}` : ""}`;

      const typeLabel =
        kind === "final"  ? "ФІНАЛ" :
        kind === "stage"  ? "ЕТАП" :
        kind === "stalker"? "STALKER" :
                            "ЗМАГАННЯ";

      const el = document.createElement("label");
      el.className = "event-item" + (open ? "" : " is-closed");

      el.innerHTML = `
        <input type="radio" name="stagePick" value="${value}" ${open ? "" : "disabled"}>
        <div class="event-body">
          <div class="event-title">
            <div class="text">${titleText}</div>
            <div class="event-badges">
              <span class="pill-b ${open ? "pill-b--open" : "pill-b--closed"}">${open ? "ВІДКРИТО" : "ЗАКРИТО"}</span>
              <span class="pill-b ${
                kind === "final" ? "pill-b--final" :
                kind === "stage" ? "pill-b--stage" :
                kind === "stalker" ? "pill-b--stalker" :
                "pill-b--oneoff"
              }">${typeLabel}</span>
            </div>
          </div>
          <div class="event-meta">${dateLine}<br>${regLine}</div>
        </div>
      `;

      eventOptionsEl.appendChild(el);
    });

    wireActiveHighlight();
    updateSubmitState();
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
      updateSubmitState();
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
      if (!validateFormForSubmit()) {
        setMsg("Перевірте: вибір змагання, харчування та регламент.", false);
        return;
      }

      const picked = getPickedValue();
      const food = getFoodValue();

      let foodQty = null;
      if (food === "Так") {
        const q = Number(foodQtyInput?.value || "0");
        foodQty = q;
      }

      const [competitionId, stageKeyRaw] = String(picked).split("||");
      const stageId = (stageKeyRaw || "").trim() || null;

      try {
        setLoading(true);
        if (submitBtn) submitBtn.disabled = true;
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
        document.querySelectorAll(".event-item").forEach(el => el.classList.remove("is-active"));
        initFoodLogic();
        updateSubmitState();
      } catch (err) {
        console.error("submit error:", err);
        setMsg("Помилка відправки заявки (Rules/доступ).", false);
      } finally {
        setLoading(false);
        updateSubmitState();
      }
    });
  }
})();
