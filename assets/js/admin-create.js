// assets/js/admin-create.js
// STOLAR CARP • Create/Edit competitions
// ✅ create/edit
// ✅ no overwrite in create mode
// ✅ role admin check
// ✅ compatible with register_firebase.js
// ✅ writes flat + nested Firestore fields

(function () {
  "use strict";

  const DRAFT_KEY = "sc_admin_create_draft_v3";
  const $ = (id) => document.getElementById(id);

  const setStatus = (t) => {
    const e = $("createStatus");
    if (e) e.textContent = t || "";
  };

  const setDebug = (t) => {
    const e = $("createDebug");
    if (e) e.textContent = t || "";
  };

  const setMsg = (html) => {
    const e = $("createMsg");
    if (e) e.innerHTML = html || "";
  };

  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  async function waitForFirebase() {
    for (let i = 0; i < 140; i++) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb.");
  }

  let auth = null;
  let db = null;
  let fb = null;

  const url = new URL(location.href);
  const mode = (url.searchParams.get("mode") || "create").toLowerCase();
  const isEditMode = mode === "edit";

  const gate = $("createGate");
  const app = $("createApp");

  const tabCreate = $("tabCreate");
  const tabEdit = $("tabEdit");
  const editPicker = $("editPicker");
  const deleteWrap = $("deleteWrap");

  const inpType = $("inpType");
  const inpYear = $("inpYear");
  const inpName = $("inpName");
  const inpFormat = $("inpFormat");
  const inpLake = $("inpLake");

  const inpStartAt = $("inpStartAt");
  const inpFinishAt = $("inpFinishAt");

  const outDuration = $("outDuration");
  const outDurationHours = $("outDurationHours");
  const outDurationDays = $("outDurationDays");

  const seasonOnly = $("seasonOnly");
  const inpStagesCount = $("inpStagesCount");
  const inpHasFinal = $("inpHasFinal");

  const inpRegMode = $("inpRegMode");
  const inpPayEnabled = $("inpPayEnabled");
  const inpRegOpen = $("inpRegOpen");
  const inpRegClose = $("inpRegClose");
  const inpPrice = $("inpPrice");
  const inpCurrency = $("inpCurrency");
  const inpPayDetails = $("inpPayDetails");
  const regPreview = $("regPreview");

  const btnSave = $("btnSave");
  const btnMakeActive = $("btnMakeActive");
  const btnResetDraft = $("btnResetDraft");
  const btnDelete = $("btnDelete");

  const selCompetition = $("selCompetition");
  const btnReloadList = $("btnReloadList");
  const editPickerMsg = $("editPickerMsg");

  function getDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setDraft(data) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function parseLocalDateTime(v) {
    const s = String(v || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return null;

    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toDateTimeLocalValue(date) {
    if (!date) return "";
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${yy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function dateOnlyFromInput() {
    const d = parseLocalDateTime(inpStartAt?.value || "");
    if (!d) return "";
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + days);

    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function autoRegOpen(startDate) {
    return startDate ? addDays(startDate, -28) : "";
  }

  function autoRegClose(startDate) {
    return startDate ? addDays(startDate, -14) : "";
  }

  function diffMinutes(a, b) {
    if (!a || !b) return null;
    return Math.floor((b.getTime() - a.getTime()) / 60000);
  }

  function normalizeDate(v) {
    const s = String(v || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function slugify(s) {
    return String(s || "competition")
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42);
  }

  function rand4() {
    return Math.random().toString(36).slice(2, 6);
  }

  function makeCompId(form) {
    const year = form.yearStr;
    const slug = slugify(form.name);

    if (form.type === "season") {
      return `season-${year}-${slug}-${rand4()}`;
    }

    return `competition-${year}-${slug}-${rand4()}`;
  }

  async function requireAdmin(user) {
    if (!user) return false;
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      const role = snap.exists ? String((snap.data() || {}).role || "").toLowerCase() : "";
      return role === "admin";
    } catch {
      return false;
    }
  }

  function setActiveTab(isEdit) {
    if (tabCreate) tabCreate.classList.toggle("pill--active", !isEdit);
    if (tabEdit) tabEdit.classList.toggle("pill--active", isEdit);
    if (editPicker) (isEdit ? show : hide)(editPicker);
    if (deleteWrap) (isEdit ? show : hide)(deleteWrap);
  }

  function gotoMode(nextMode) {
    const u = new URL(location.href);
    if (nextMode === "edit") u.searchParams.set("mode", "edit");
    else u.searchParams.delete("mode");
    location.href = u.toString();
  }

  async function loadLakes() {
    if (!inpLake) return;

    inpLake.innerHTML = `<option value="">Завантаження водойм…</option>`;

    try {
      const snap = await db.collection("lakes").get();

      const items = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          name: x.name || d.id
        };
      });

      items.sort((a, b) => a.name.localeCompare(b.name, "uk"));

      if (!items.length) {
        inpLake.innerHTML = `<option value="">Нема водойм у lakes</option>`;
        return;
      }

      inpLake.innerHTML =
        `<option value="">— вибери водойму —</option>` +
        items.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`).join("");
    } catch (e) {
      inpLake.innerHTML = `<option value="">Помилка завантаження водойм</option>`;
      setDebug(e?.message || String(e));
    }
  }

  async function getLakeSnapshot(lakeId) {
    if (!lakeId) return null;

    try {
      const doc = await db.collection("lakes").doc(lakeId).get();
      if (!doc.exists) return { id: lakeId, name: lakeId };

      const d = doc.data() || {};
      return {
        id: lakeId,
        name: d.name || lakeId
      };
    } catch {
      return { id: lakeId, name: lakeId };
    }
  }

  async function loadCompetitionsList() {
    if (!selCompetition) return;

    selCompetition.innerHTML = `<option value="">Завантаження…</option>`;
    if (editPickerMsg) editPickerMsg.textContent = "";

    let activeId = "";
    try {
      const s = await db.collection("settings").doc("app").get();
      if (s.exists) activeId = String((s.data() || {}).activeCompetitionId || "");
    } catch {}

    const snap = await db.collection("competitions").get();

    const items = snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        year: Number(d.seasonYear || d.year || 0),
        type: d.type || "",
        kind: d.kind || "",
        name: d.name || doc.id,
        active: doc.id === activeId
      };
    });

    items.sort((a, b) =>
      (b.year - a.year) ||
      String(a.name).localeCompare(String(b.name), "uk")
    );

    if (!items.length) {
      selCompetition.innerHTML = `<option value="">Нема змагань</option>`;
      return;
    }

    selCompetition.innerHTML =
      `<option value="">— вибери змагання —</option>` +
      items.map((x) => {
        const label = `${x.active ? "✅ " : ""}${x.id} — ${x.name} (${x.year})`;
        return `<option value="${esc(x.id)}">${esc(label)}</option>`;
      }).join("");
  }

  function setSeasonVisibility() {
    const type = inpType?.value || "season";
    if (seasonOnly) {
      if (type === "season") show(seasonOnly);
      else hide(seasonOnly);
    }
  }

  function updateDurationUI() {
    const a = parseLocalDateTime(inpStartAt?.value || "");
    const b = parseLocalDateTime(inpFinishAt?.value || "");
    const mins = diffMinutes(a, b);

    if (!a || !b || mins === null) {
      if (outDuration) outDuration.value = "—";
      if (outDurationHours) outDurationHours.value = "—";
      if (outDurationDays) outDurationDays.value = "—";
      return;
    }

    if (mins <= 0) {
      if (outDuration) outDuration.value = "❌ Фініш має бути після старту";
      if (outDurationHours) outDurationHours.value = "—";
      if (outDurationDays) outDurationDays.value = "—";
      return;
    }

    const hours = mins / 60;
    const days = hours / 24;

    if (outDuration) outDuration.value = `${Math.round(hours)} год (${days.toFixed(2)} доби)`;
    if (outDurationHours) outDurationHours.value = hours.toFixed(2);
    if (outDurationDays) outDurationDays.value = days.toFixed(2);
  }

  function getRegistrationBlock() {
    const mode = inpRegMode?.value || "auto";
    const startD = dateOnlyFromInput();

    if (mode === "manual") {
      return {
        mode: "manual",
        openDate: normalizeDate(inpRegOpen?.value || ""),
        closeDate: normalizeDate(inpRegClose?.value || "")
      };
    }

    return {
      mode: "auto",
      openDate: autoRegOpen(startD),
      closeDate: autoRegClose(startD)
    };
  }

  function updateRegUI() {
    const reg = getRegistrationBlock();

    if (reg.mode === "manual") {
      if (inpRegOpen) inpRegOpen.disabled = false;
      if (inpRegClose) inpRegClose.disabled = false;
      if (regPreview) {
        regPreview.innerHTML = `Реєстрація: <b>MANUAL</b> (${esc(reg.openDate || "—")} → ${esc(reg.closeDate || "—")})`;
      }
      return;
    }

    if (inpRegOpen) inpRegOpen.disabled = true;
    if (inpRegClose) inpRegClose.disabled = true;

    if (regPreview) {
      regPreview.innerHTML = `Реєстрація: <b>${esc(reg.openDate || "—")}</b> → <b>${esc(reg.closeDate || "—")}</b>`;
    }
  }

  function normalizeFormat(v) {
    const raw = String(v || "classic").trim();
    const map = {
      threeTables: "threeTables",
      stalkerTeams: "stalkerTeams",
      trophy15: "trophy15",
      classic: "classic"
    };
    return map[raw] || raw || "classic";
  }

  function collectForm() {
    const type = inpType?.value || "season";
    const yearStr = String(inpYear?.value || "").trim();
    const name = String(inpName?.value || "").trim();
    const format = normalizeFormat(inpFormat?.value || "classic");
    const lakeId = String(inpLake?.value || "").trim();

    const startDt = parseLocalDateTime(inpStartAt?.value || "");
    const finishDt = parseLocalDateTime(inpFinishAt?.value || "");

    const stagesCount = type === "season" ? Number(inpStagesCount?.value || 3) : 1;
    const hasFinal = type === "season" ? (inpHasFinal?.value || "yes") === "yes" : false;

    const payEnabled = (inpPayEnabled?.value || "yes") === "yes";

    const priceRaw = String(inpPrice?.value || "").trim().replace(",", ".");
    const price = priceRaw ? Number(priceRaw) : null;

    return {
      type,
      kind: type === "season" ? "tour" : "teams",
      entryType: "team",
      yearStr,
      seasonYear: /^\d{4}$/.test(yearStr) ? Number(yearStr) : null,
      name,
      format,
      lakeId,
      startDt,
      finishDt,
      stagesCount,
      hasFinal,
      registration: getRegistrationBlock(),
      payEnabled,
      price: price === null || Number.isFinite(price) ? price : NaN,
      currency: String(inpCurrency?.value || "UAH").trim().toUpperCase(),
      payDetails: String(inpPayDetails?.value || "").trim()
    };
  }

  function validate(form) {
    if (!/^\d{4}$/.test(form.yearStr)) throw new Error("Вкажи рік, наприклад 2026.");
    if (!form.name) throw new Error("Вкажи назву змагання.");
    if (!form.lakeId) throw new Error("Вибери водойму.");
    if (!form.startDt) throw new Error("Заповни старт.");
    if (!form.finishDt) throw new Error("Заповни фініш.");
    if (form.finishDt <= form.startDt) throw new Error("Фініш має бути після старту.");

    if (form.type === "season") {
      if (!Number.isFinite(form.stagesCount) || form.stagesCount < 2 || form.stagesCount > 8) {
        throw new Error("Для сезону к-сть етапів має бути 2–8.");
      }
    }

    if (form.registration.mode === "manual") {
      if (!form.registration.openDate || !form.registration.closeDate) {
        throw new Error("Manual: вкажи відкриття і закриття реєстрації.");
      }

      if (form.registration.closeDate < form.registration.openDate) {
        throw new Error("Дата закриття реєстрації не може бути раніше відкриття.");
      }
    }

    if (form.payEnabled && Number.isNaN(form.price)) {
      throw new Error("Внесок має бути числом.");
    }
  }

  function buildEvents(form) {
    if (form.type !== "season") return [];

    const events = [];

    for (let i = 1; i <= form.stagesCount; i++) {
      events.push({
        key: `stage-${i}`,
        stageId: `stage-${i}`,
        title: `Етап ${i}`,
        name: `Етап ${i}`,
        isFinal: false,

        entryType: "team",

        startAt: fb.firestore.Timestamp.fromDate(form.startDt),
        finishAt: fb.firestore.Timestamp.fromDate(form.finishDt),

        regMode: form.registration.mode,
        regOpenDate: form.registration.openDate,
        regCloseDate: form.registration.closeDate,
        manualOpen: false,

        payEnabled: !!form.payEnabled,
        price: form.price === 0 || form.price ? form.price : null,
        currency: form.currency,
        payDetails: form.payDetails
      });
    }

    if (form.hasFinal) {
      events.push({
        key: "final",
        stageId: "final",
        title: "Фінал",
        name: "Фінал",
        isFinal: true,

        entryType: "team",

        startAt: fb.firestore.Timestamp.fromDate(form.startDt),
        finishAt: fb.firestore.Timestamp.fromDate(form.finishDt),

        regMode: form.registration.mode,
        regOpenDate: form.registration.openDate,
        regCloseDate: form.registration.closeDate,
        manualOpen: false,

        payEnabled: !!form.payEnabled,
        price: form.price === 0 || form.price ? form.price : null,
        currency: form.currency,
        payDetails: form.payDetails
      });
    }

    return events;
  }

  async function buildCompetitionData(compId, form, existing) {
    const lake = await getLakeSnapshot(form.lakeId);
    const mins = diffMinutes(form.startDt, form.finishDt);
    const durationHours = mins !== null ? Number((mins / 60).toFixed(2)) : null;
    const now = fb.firestore.FieldValue.serverTimestamp();

    const startTs = fb.firestore.Timestamp.fromDate(form.startDt);
    const finishTs = fb.firestore.Timestamp.fromDate(form.finishDt);

    const data = {
      compId,
      type: form.type,
      kind: form.kind,

      year: form.seasonYear,
      seasonYear: form.seasonYear,

      name: form.name,
      title: form.name,
      brand: "STOLAR CARP",
      format: form.format,

      entryType: form.entryType,

      lake: lake ? { id: lake.id, name: lake.name } : null,
      lakeId: lake?.id || form.lakeId,

      startAt: startTs,
      endAt: finishTs,
      finishAt: finishTs,

      schedule: {
        startAt: startTs,
        finishAt: finishTs,
        durationHours
      },

      regMode: form.registration.mode,
      regOpenDate: form.registration.openDate,
      regCloseDate: form.registration.closeDate,
      manualOpen: false,

      registration: {
        mode: form.registration.mode,
        openDate: form.registration.openDate,
        closeDate: form.registration.closeDate
      },

      payEnabled: !!form.payEnabled,
      price: form.price === 0 || form.price ? form.price : null,
      currency: form.currency,
      payDetails: form.payDetails,

      payment: {
        enabled: !!form.payEnabled,
        price: form.price === 0 || form.price ? form.price : null,
        currency: form.currency,
        details: form.payDetails
      },

      stagesCount: form.type === "season" ? form.stagesCount : 1,
      hasFinal: form.type === "season" ? !!form.hasFinal : false,

      events: buildEvents(form),

      engine: {
        baseFormat: form.format
      },

      updatedAt: now
    };

    if (!existing) data.createdAt = now;

    return data;
  }

  async function getUniqueCompId(form) {
    for (let i = 0; i < 10; i++) {
      const id = makeCompId(form);
      const snap = await db.collection("competitions").doc(id).get();
      if (!snap.exists) return id;
    }

    throw new Error("Не вдалося створити унікальний ID. Спробуй ще раз.");
  }

  async function saveCompetition(editingCompId) {
    const form = collectForm();
    validate(form);

    const compId = editingCompId || await getUniqueCompId(form);
    const ref = db.collection("competitions").doc(compId);
    const snap = await ref.get();

    if (!editingCompId && snap.exists) {
      throw new Error(`Змагання ${compId} вже існує. Спробуй ще раз.`);
    }

    const data = await buildCompetitionData(compId, form, snap.exists);

    await ref.set(data, { merge: true });

    saveDraftNow();

    return compId;
  }

  async function makeActive(compId) {
    await db.collection("settings").doc("app").set({
      activeCompetitionId: compId,
      updatedAt: fb.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function deleteCompetition(compId) {
    const typed = prompt(`УВАГА! Видалення без відновлення.\nВведи точно ID:\n\n${compId}`);
    if (typed !== compId) throw new Error("Видалення скасовано.");

    try {
      const s = await db.collection("settings").doc("app").get();
      const activeId = s.exists ? String((s.data() || {}).activeCompetitionId || "") : "";

      if (activeId === compId) {
        await db.collection("settings").doc("app").set({
          activeCompetitionId: "",
          updatedAt: fb.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch {}

    await db.collection("competitions").doc(compId).delete();
  }

  function applyForm(data) {
    if (!data) return;

    if (inpType) inpType.value = data.type || "season";
    if (inpYear) inpYear.value = data.yearStr || data.year || data.seasonYear || "";
    if (inpName) inpName.value = data.name || "";
    if (inpFormat) inpFormat.value = data.format || "classic";
    if (inpLake) inpLake.value = data.lakeId || data.lake?.id || "";

    if (inpStartAt) inpStartAt.value = data.startAtLocal || "";
    if (inpFinishAt) inpFinishAt.value = data.finishAtLocal || "";

    if (inpStagesCount) inpStagesCount.value = String(data.stagesCount || 3);
    if (inpHasFinal) inpHasFinal.value = data.hasFinal === false ? "no" : "yes";

    if (inpRegMode) inpRegMode.value = data.regMode || data.registration?.mode || "auto";
    if (inpPayEnabled) inpPayEnabled.value = data.payEnabled === false || data.payment?.enabled === false ? "no" : "yes";
    if (inpRegOpen) inpRegOpen.value = data.manualOpen || data.registration?.openDate || data.regOpenDate || "";
    if (inpRegClose) inpRegClose.value = data.manualClose || data.registration?.closeDate || data.regCloseDate || "";
    if (inpPrice) inpPrice.value = data.price === 0 || data.price ? String(data.price) : data.payment?.price || "";
    if (inpCurrency) inpCurrency.value = data.currency || data.payment?.currency || "UAH";
    if (inpPayDetails) inpPayDetails.value = data.payDetails || data.payment?.details || "";
  }

  function saveDraftNow() {
    const d = collectForm();

    setDraft({
      type: d.type,
      yearStr: d.yearStr,
      name: d.name,
      format: d.format,
      lakeId: d.lakeId,
      startAtLocal: inpStartAt?.value || "",
      finishAtLocal: inpFinishAt?.value || "",
      stagesCount: d.stagesCount,
      hasFinal: d.hasFinal,
      regMode: d.registration.mode,
      payEnabled: d.payEnabled,
      manualOpen: d.registration.openDate,
      manualClose: d.registration.closeDate,
      price: d.price,
      currency: d.currency,
      payDetails: d.payDetails,
      ts: Date.now()
    });
  }

  async function loadCompetition(compId) {
    if (!compId) return;

    setStatus("Завантаження…");
    setMsg("");

    try {
      const doc = await db.collection("competitions").doc(compId).get();
      if (!doc.exists) throw new Error(`Не знайдено competitions/${compId}`);

      const d = doc.data() || {};

      const startAt = d.schedule?.startAt?.toDate
        ? d.schedule.startAt.toDate()
        : d.startAt?.toDate
          ? d.startAt.toDate()
          : null;

      const finishAt = d.schedule?.finishAt?.toDate
        ? d.schedule.finishAt.toDate()
        : d.finishAt?.toDate
          ? d.finishAt.toDate()
          : d.endAt?.toDate
            ? d.endAt.toDate()
            : null;

      applyForm({
        type: d.type || (d.kind === "tour" ? "season" : "oneoff"),
        yearStr: String(d.seasonYear || d.year || ""),
        name: d.name || "",
        format: d.format || "classic",
        lakeId: d.lake?.id || d.lakeId || "",
        startAtLocal: startAt ? toDateTimeLocalValue(startAt) : "",
        finishAtLocal: finishAt ? toDateTimeLocalValue(finishAt) : "",
        stagesCount: d.stagesCount || 3,
        hasFinal: !!d.hasFinal,
        regMode: d.registration?.mode || d.regMode || "auto",
        payEnabled: d.payment?.enabled ?? d.payEnabled ?? true,
        manualOpen: d.registration?.openDate || d.regOpenDate || "",
        manualClose: d.registration?.closeDate || d.regCloseDate || "",
        price: d.payment?.price ?? d.price ?? null,
        currency: d.payment?.currency || d.currency || "UAH",
        payDetails: d.payment?.details || d.payDetails || ""
      });

      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();

      setStatus("Завантажено ✅");
      setDebug("");
    } catch (e) {
      setStatus("Помилка завантаження ❌");
      setDebug(e?.message || String(e));
    }
  }

  function resetForm() {
    clearDraft();

    if (inpType) inpType.value = "season";
    if (inpYear) inpYear.value = "";
    if (inpName) inpName.value = "";
    if (inpFormat) inpFormat.value = "classic";
    if (inpLake) inpLake.value = "";
    if (inpStartAt) inpStartAt.value = "";
    if (inpFinishAt) inpFinishAt.value = "";
    if (inpStagesCount) inpStagesCount.value = "3";
    if (inpHasFinal) inpHasFinal.value = "yes";
    if (inpRegMode) inpRegMode.value = "auto";
    if (inpPayEnabled) inpPayEnabled.value = "yes";
    if (inpRegOpen) inpRegOpen.value = "";
    if (inpRegClose) inpRegClose.value = "";
    if (inpPrice) inpPrice.value = "";
    if (inpCurrency) inpCurrency.value = "UAH";
    if (inpPayDetails) inpPayDetails.value = "";

    setSeasonVisibility();
    updateDurationUI();
    updateRegUI();
    setMsg(`<span class="ok">✅ Чернетку скинуто</span>`);
  }

  function bindUI() {
    if (tabCreate) tabCreate.onclick = () => gotoMode("create");
    if (tabEdit) tabEdit.onclick = () => gotoMode("edit");

    if (inpType) {
      inpType.addEventListener("change", () => {
        setSeasonVisibility();
        saveDraftNow();
      });
    }

    [
      inpYear, inpName, inpFormat, inpLake,
      inpStartAt, inpFinishAt,
      inpStagesCount, inpHasFinal,
      inpRegMode, inpPayEnabled, inpRegOpen, inpRegClose,
      inpPrice, inpCurrency, inpPayDetails
    ].forEach((el) => {
      if (!el) return;

      el.addEventListener("change", () => {
        updateDurationUI();
        updateRegUI();
        saveDraftNow();
      });

      el.addEventListener("input", () => {
        updateDurationUI();
        updateRegUI();
        saveDraftNow();
      });
    });

    if (btnResetDraft) btnResetDraft.onclick = resetForm;

    if (btnReloadList) {
      btnReloadList.onclick = async () => {
        if (editPickerMsg) editPickerMsg.textContent = "Оновлення…";
        await loadCompetitionsList();
        if (editPickerMsg) editPickerMsg.textContent = "";
      };
    }

    if (selCompetition) {
      selCompetition.onchange = async () => {
        const id = selCompetition.value;
        if (id) await loadCompetition(id);
      };
    }

    if (btnSave) {
      btnSave.onclick = async () => {
        setMsg(`<span class="muted">Збереження…</span>`);

        try {
          const editingId = isEditMode && selCompetition ? selCompetition.value : "";
          const compId = await saveCompetition(editingId || "");

          setMsg(`<span class="ok">✅ Збережено:</span> ${esc(compId)}`);
          setStatus("Збережено ✅");

          if (isEditMode) await loadCompetitionsList();
        } catch (e) {
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
          setStatus("Помилка ❌");
          setDebug(e?.message || String(e));
        }
      };
    }

    if (btnMakeActive) {
      btnMakeActive.onclick = async () => {
        setMsg(`<span class="muted">Зберігаю і роблю активним…</span>`);

        try {
          const editingId = isEditMode && selCompetition ? selCompetition.value : "";
          const compId = await saveCompetition(editingId || "");

          await makeActive(compId);

          setMsg(`<span class="ok">✅ Активне:</span> ${esc(compId)}`);
          setStatus("Активне змагання оновлено ✅");

          if (isEditMode) await loadCompetitionsList();
        } catch (e) {
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
          setStatus("Помилка ❌");
          setDebug(e?.message || String(e));
        }
      };
    }

    if (btnDelete) {
      btnDelete.onclick = async () => {
        try {
          if (!isEditMode) throw new Error("Видалення доступне тільки в режимі редагування.");

          const compId = selCompetition?.value || "";
          if (!compId) throw new Error("Вибери змагання для видалення.");

          setMsg(`<span class="muted">Видаляю…</span>`);
          await deleteCompetition(compId);

          setMsg(`<span class="ok">✅ Видалено:</span> ${esc(compId)}`);
          await loadCompetitionsList();
          clearDraft();
        } catch (e) {
          setMsg(`<span class="err">❌</span> ${esc(e?.message || String(e))}`);
        }
      };
    }
  }

  async function init() {
    try {
      await waitForFirebase();
      auth = window.scAuth;
      db = window.scDb;
      fb = window.firebase;
    } catch (e) {
      setStatus("Firebase не запустився ❌");
      setDebug(e?.message || String(e));
      show(gate);
      hide(app);
      return;
    }

    bindUI();

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setStatus("Нема сесії. Увійди через admin.html");
        show(gate);
        hide(app);
        return;
      }

      const ok = await requireAdmin(user);
      if (!ok) {
        setStatus("Доступ заборонено ❌");
        setDebug("Цей акаунт не має role = admin.");
        show(gate);
        hide(app);
        return;
      }

      hide(gate);
      show(app);

      setActiveTab(isEditMode);
      setStatus(isEditMode ? "Режим: Редагування" : "Режим: Створення");
      setDebug("");

      await loadLakes();

      if (!isEditMode) {
        const draft = getDraft();
        if (draft) {
          applyForm(draft);
          setStatus("Чернетку відновлено ✅");
        }
      }

      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();

      if (isEditMode) {
        await loadCompetitionsList();

        const pre = url.searchParams.get("compId");
        if (pre && selCompetition) {
          selCompetition.value = pre;
          await loadCompetition(pre);
        }
      }
    });
  }

  window.addEventListener("error", (e) => {
    setStatus("Помилка JS ❌");
    setDebug(e?.message || "Помилка");
  });

  window.addEventListener("unhandledrejection", (e) => {
    setStatus("Помилка Promise ❌");
    setDebug(e?.reason?.message || String(e?.reason || "Promise error"));
  });

  init();
})();
