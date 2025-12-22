// assets/js/register_firebase.js
// STOLAR CARP • Registration
// ✅ Team vs Solo
// ✅ Anti-duplicate via deterministic docId (duplicate becomes UPDATE -> denied by rules)
// ✅ Better error diagnostics (shows err.code + err.message)
// ✅ Payload строго під rules: uid==auth.uid, entryType, teamId==users.teamId for TEAM
// ✅ No undefined fields (uses null)

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

  let currentUser = null;
  let profile = null;

  let lastItems = [];
  let nearestUpcomingValue = null;

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

  function nowKyiv() {
    return new Date();
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

    const ok = !!(picked && rulesOk && selectedItem && isOpenWindow(selectedItem));
    submitBtn.disabled = !ok;
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
              regCloseAt
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
            regCloseAt: c.regCloseAt || c.regCloseDate || null
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
    } catch (e) {
      console.error("loadCompetitions error:", e);
      eventOptionsEl.innerHTML =
        '<p class="form__hint" style="color:#ff6c6c;">Не вдалося завантажити змагання (Rules/доступ).</p>';
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function renderItems(items) {
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
    if (e.target.name === "stagePick" || e.target.id === "rules") refreshSubmitState();
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
          setMsg("Це командний етап. Спочатку приєднайтесь до команди (в «Акаунт»).", false);
          return;
        }
        if (!profile.teamName) {
          setMsg("Не знайдено назву команди. Перевір teams/{teamId}.name", false);
          return;
        }
      }

      // SOLO ім'я
      const participantName = (profile.fullName || profile.captain || profile.email || "").trim();

      const docId = buildRegDocId({ competitionId, stageId, entryType });
      const ref = db.collection("registrations").doc(docId);

      // ВАЖЛИВО: не відправляємо undefined — тільки null/""
      const payload = {
        uid: profile.uid,
        competitionId,
        stageId: stageId || null,
        entryType, // "team" | "solo"

        teamId: entryType === "team" ? profile.teamId : null,
        teamName: entryType === "team" ? profile.teamName : null,

        participantName: entryType === "solo" ? participantName : null,

        captain: entryType === "team" ? profile.captain : participantName,
        phone: profile.phone || "",

        food,
        foodQty: foodQty === null ? null : Number(foodQty),

        status: "pending_payment",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        setLoading(true);
        setMsg("");

        // ✅ Працює з твоїми rules:
        // - 1-й раз: це CREATE -> дозволено
        // - 2-й раз: це UPDATE -> заборонено (і це і є "антидубль")
        await ref.set(payload, { merge: false });

        setMsg("Заявка подана ✔ Підтвердження після оплати.", true);
        form.reset();
        initFoodLogic();
      } catch (err) {
        console.error("submit error:", err);

        const code = String(err?.code || "");
        const message = String(err?.message || "");

        // Показуємо реальну причину (це критично, щоб не гадати)
        console.warn("REG SUBMIT FAIL:", { code, message, payload, docId });

        // Найчастіше:
        // 1) Дубль: документ вже існує -> set стає UPDATE -> rules блокує -> permission-denied
        // 2) TEAM: teamId у payload не дорівнює users/{uid}.teamId -> rules блокує -> permission-denied
        if (String(code).toLowerCase().includes("permission")) {
          setMsg(
            "Нема доступу (permission-denied). " +
            "99% це або ДУБЛЬ (заявка вже існує), або teamId в заявці ≠ teamId у users/{uid}. " +
            "Відкрий консоль — там є код/текст помилки.",
            false
          );
        } else {
          setMsg(`Помилка відправки заявки. Перевір консоль. (${code || "no-code"})`, false);
        }
      } finally {
        setLoading(false);
      }
    });
  }
})();
