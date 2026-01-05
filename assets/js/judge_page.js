// assets/js/judge_page.js
// STOLAR CARP • Judge page (token) — LIVE compatible + minimal sources
// ✅ reads: settings/app (activeKey optional) + stageResults/{activeKey OR compId||stageId}.teams
// ✅ writes: weighings docId `${compId}||${stageId}||W{weighNo}||${teamId}` (LIVE-compatible)
// ✅ computes fishCount/totalWeightKg/bigFishKg, sets status="submitted"
// ✅ "0 = нема улову": 0 НЕ додаємо як вагу; немає риби => weights=[]

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const errEl     = $("judgeError");
  const metaEl    = $("judgeMeta");
  const contentEl = $("judgeContent");
  const logoutBtn = $("judgeLogout");

  const teamsTBody = $("teamsTable")?.querySelector("tbody");
  const teamSelect = $("teamSelect");
  const fishInp    = $("fishWeight");
  const addBtn     = $("addFish");
  const fishBody   = $("fishList")?.querySelector("tbody");
  const clearBtn   = $("clearW");
  const statusEl   = $("status");
  const activeWEl  = $("activeW");

  let activeW = "W1";
  let session = null; // { compId, stageId, zone, token }
  let teams = [];     // [{teamId, teamName, sector, zone, zoneLabel}]

  function showErr(msg) {
    if (!errEl) return;
    errEl.style.display = "";
    errEl.textContent = msg;
  }
  function hideErr() {
    if (!errEl) return;
    errEl.style.display = "none";
    errEl.textContent = "";
  }
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || "—";
  }

  // 0 = нема улову -> не приймаємо як вагу риби
  function parseKg(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    const n = Number(s);
    if (!isFinite(n)) return null;
    if (n <= 0) return null; // <=0 не додаємо як вагу
    return Math.round(n * 1000) / 1000;
  }

  function wToNo(w) {
    const n = Number(String(w || "").replace("W", ""));
    return n >= 1 && n <= 4 ? n : 1;
  }

  function getTokenFromUrl() {
    const u = new URL(window.location.href);
    return u.searchParams.get("token") || u.searchParams.get("t");
  }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Firebase not ready (scDb/firebase)");
  }

  async function ensureAuth() {
    try {
      if (window.scAuth && !window.scAuth.currentUser) {
        await window.scAuth.signInAnonymously();
      }
    } catch {}
  }

  function saveSession(s) {
    localStorage.setItem("sc_judge_session", JSON.stringify(s));
  }
  function loadSession() {
    try {
      const s = localStorage.getItem("sc_judge_session");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }
  function clearSession() {
    localStorage.removeItem("sc_judge_session");
  }

  // =========================
  // ACTIVE CONTEXT (settings/app)
  // =========================
  async function getActiveCtx() {
    const snap = await window.scDb.collection("settings").doc("app").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    const compId  = String(d.activeCompetitionId || "");
    const stageId = String(d.activeStageId || "");
    const activeKey = String(d.activeKey || ""); // може бути порожній
    if (!compId || !stageId) return null;
    return { compId, stageId, stageKey: `${compId}||${stageId}`, activeKey };
  }

  function stageDocIdFromCtxOrSession(ctx, s){
    // пріоритет: activeKey (якщо є), інакше canonical compId||stageId
    if (ctx && ctx.activeKey) return String(ctx.activeKey);
    if (ctx && ctx.stageKey) return String(ctx.stageKey);
    return `${s.compId}||${s.stageId}`;
  }

  // =========================
  // TOKEN (judgeTokens)
  // =========================
  async function activateToken(token) {
    const ref = window.scDb.collection("judgeTokens").doc(token);

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error("Токен не знайдено");

      const d = doc.data() || {};
      const isUsed = !!d.used || !!d.usedAt;
      if (isUsed) throw new Error("Цей QR вже використаний");

      if (d.isActive === false) throw new Error("Токен не активний");
      if (d.expiresAt && d.expiresAt.toDate && d.expiresAt.toDate() < new Date()) {
        throw new Error("Токен протермінований");
      }

      const compId  = String(d.compId || "");
      const stageId = String(d.stageId || "");
      const zone    = String(d.zone || "").toUpperCase();

      if (!compId || !stageId || !zone) {
        throw new Error("Токен без compId/stageId/zone");
      }

      tx.set(ref, {
        used: true,
        usedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        isActive: false,
        usedBy: window.scAuth?.currentUser?.uid || null,
      }, { merge: true });

      session = { compId, stageId, zone, token };
    });

    return session;
  }

  // =========================
  // TEAMS (stageResults doc)
  // =========================
  function normalizeTeam(t){
    const teamId = String(t.teamId || t.regId || "").trim();
    const teamName = String(t.teamName || t.team || "—");
    const drawZone = String(t.drawZone || t.zone || (t.drawKey ? String(t.drawKey)[0] : "") || "").toUpperCase();
    const drawSector = Number(t.drawSector || t.sector || (t.drawKey ? parseInt(String(t.drawKey).slice(1),10) : 0) || 0);
    const zoneLabel = t.drawKey ? String(t.drawKey).toUpperCase() : (drawZone && drawSector ? `${drawZone}${drawSector}` : drawZone);
    return { teamId, teamName, zone: drawZone, sector: drawSector || "", zoneLabel };
  }

  async function loadTeamsFromStageResults(stageDocId, zone){
    const snap = await window.scDb.collection("stageResults").doc(String(stageDocId)).get();
    const data = snap.exists ? (snap.data()||{}) : {};
    const raw = Array.isArray(data.teams) ? data.teams : [];

    const list = raw.map(normalizeTeam)
      .filter(x => x.teamId && x.zone === String(zone).toUpperCase());

    list.sort((a,b)=>Number(a.sector||0) - Number(b.sector||0));
    return list;
  }

  function renderTeams() {
    if (teamsTBody) {
      if (!teams.length) {
        teamsTBody.innerHTML = `<tr><td colspan="2">Немає команд у цій зоні.</td></tr>`;
      } else {
        teamsTBody.innerHTML = teams.map(t => `
          <tr>
            <td>${t.zoneLabel || "—"}</td>
            <td>${t.teamName}</td>
          </tr>
        `).join("");
      }
    }

    if (teamSelect) {
      teamSelect.innerHTML = "";
      teams.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.teamId;
        opt.textContent = `${t.zoneLabel ? t.zoneLabel + " · " : ""}${t.teamName}`;
        teamSelect.appendChild(opt);
      });
    }
  }

  function setActiveW(w) {
    activeW = w;
    if (activeWEl) activeWEl.textContent = "Активне: " + w;

    document.querySelectorAll("[data-w]").forEach((b) => {
      b.classList.remove("btn--accent", "btn--ghost");
      b.classList.add(b.getAttribute("data-w") === w ? "btn--accent" : "btn--ghost");
    });

    loadFishList();
  }

  // =========================
  // WEIGHINGS (LIVE compatible)
  // =========================
  function weighDocId(compId, stageId, teamId, weighNo) {
    return `${compId}||${stageId}||W${Number(weighNo)}||${teamId}`;
  }

  function calcStats(weights){
    const arr = Array.isArray(weights) ? weights : [];
    const fishCount = arr.length;
    const totalWeightKg = Math.round(arr.reduce((s,x)=>s+Number(x||0),0)*1000)/1000;
    const bigFishKg = fishCount ? Math.max(...arr.map(x=>Number(x||0))) : 0;
    return { fishCount, totalWeightKg, bigFishKg };
  }

  async function loadFishList() {
    if (!session || !teamSelect?.value || !fishBody) return;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    const ref = window.scDb.collection("weighings").doc(weighDocId(session.compId, session.stageId, teamId, weighNo));
    const doc = await ref.get();
    const data = doc.exists ? (doc.data() || {}) : {};
    const arr = Array.isArray(data.weights) ? data.weights : [];

    if (!arr.length) {
      fishBody.innerHTML = `<tr><td colspan="3">Нема улову (0).</td></tr>`;
      return;
    }

    fishBody.innerHTML = arr.map((kg, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${Number(kg).toFixed(3)}</td>
        <td style="text-align:right;">
          <button class="btn btn--ghost" data-del="${i}" type="button">✕</button>
        </td>
      </tr>
    `).join("");
  }

  async function saveWeights(teamId, weighNo, weights){
    const team = teams.find(t=>t.teamId===teamId) || {};
    const { fishCount, totalWeightKg, bigFishKg } = calcStats(weights);

    const ref = window.scDb.collection("weighings").doc(
      weighDocId(session.compId, session.stageId, teamId, weighNo)
    );

    await ref.set({
      compId: session.compId,
      stageId: session.stageId,
      weighNo: Number(weighNo),

      teamId: String(teamId),
      zone: String(session.zone || ""),
      sector: Number(team.sector || 0) || null,
      teamName: String(team.teamName || "—"),

      weights: Array.isArray(weights) ? weights : [],
      fishCount,
      totalWeightKg,
      bigFishKg,

      status: "submitted",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: window.scAuth?.currentUser?.uid || null
    }, { merge:true });
  }

  async function addFish() {
    hideErr();

    const raw = String(fishInp?.value ?? "").trim();
    if (!raw) return showErr("Введи вагу, напр. 5.120");

    // 0 = нема улову -> не додаємо
    const kg = parseKg(raw);
    if (kg === null) return showErr("0 = нема улову. Не додаємо 0 як вагу — просто залиш порожньо або натисни «Очистити».");

    if (!session || !teamSelect?.value) return showErr("Немає сесії або команди");

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    setStatus("Записую…");

    const ref = window.scDb.collection("weighings").doc(weighDocId(session.compId, session.stageId, teamId, weighNo));
    const doc = await ref.get();
    const data = doc.exists ? (doc.data()||{}) : {};
    const arr = Array.isArray(data.weights) ? data.weights.slice() : [];

    arr.push(kg);
    await saveWeights(teamId, weighNo, arr);

    fishInp.value = "";
    await loadFishList();
    setStatus("Додано ✅");
  }

  async function deleteFish(idx) {
    if (!session || !teamSelect?.value) return;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    setStatus("Видаляю…");

    const ref = window.scDb.collection("weighings").doc(weighDocId(session.compId, session.stageId, teamId, weighNo));
    const doc = await ref.get();
    const data = doc.exists ? (doc.data()||{}) : {};
    const arr = Array.isArray(data.weights) ? data.weights.slice() : [];

    arr.splice(idx, 1);
    await saveWeights(teamId, weighNo, arr);

    await loadFishList();
    setStatus("Готово ✅");
  }

  async function clearW() {
    if (!session || !teamSelect?.value) return;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    setStatus("Очищаю…");
    await saveWeights(teamId, weighNo, []);

    await loadFishList();
    setStatus("Нема улову (0) ✅");
  }

  function logout() {
    clearSession();
    window.location.href = "/index.html";
  }

  // init
  (async function init() {
    try {
      await waitFirebase();
      await ensureAuth();

      const cached = loadSession();
      const token = getTokenFromUrl();

      if (cached && cached.compId && cached.stageId && cached.zone) {
        session = cached;
      } else {
        if (!token) throw new Error("Немає токена (QR)");
        await activateToken(token);
        saveSession(session);
      }

      const ctx = await getActiveCtx().catch(()=>null);
      const stageDocId = stageDocIdFromCtxOrSession(ctx, session);

      if (metaEl) {
        metaEl.textContent =
          `compId: ${session.compId} · stageId: ${session.stageId} · Зона: ${session.zone}` +
          (ctx ? ` · activeKey: ${ctx.activeKey || "—"}` : "");
      }

      teams = await loadTeamsFromStageResults(stageDocId, session.zone);
      renderTeams();

      if (contentEl) contentEl.style.display = "";
      setActiveW("W1");
      await loadFishList();

      document.querySelectorAll("[data-w]").forEach((b) => {
        b.addEventListener("click", () => setActiveW(b.getAttribute("data-w")));
      });

      addBtn?.addEventListener("click", addFish);
      fishInp?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addFish();
      });

      fishBody?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del]");
        if (!btn) return;
        const idx = Number(btn.getAttribute("data-del"));
        if (!Number.isFinite(idx)) return;
        deleteFish(idx);
      });

      clearBtn?.addEventListener("click", clearW);
      logoutBtn?.addEventListener("click", logout);
      teamSelect?.addEventListener("change", loadFishList);

    } catch (e) {
      console.error(e);
      showErr(e.message || "Помилка");
      if (metaEl) metaEl.textContent = "Доступ не активовано";
    }
  })();
})();
