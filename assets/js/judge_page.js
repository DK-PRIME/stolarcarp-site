// assets/js/judge_page.js
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
  let teams = [];     // [{teamId, teamName, sector}]

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

  function parseKg(v) {
    const s = String(v || "").trim().replace(",", ".");
    const n = Number(s);
    if (!isFinite(n) || n <= 0) return null;
    return Math.round(n * 1000) / 1000;
  }

  function getTokenFromUrl() {
    const u = new URL(window.location.href);
    // ✅ новий стандарт
    const a = u.searchParams.get("token");
    // ✅ підтримка старого (щоб старі QR не вмерли)
    const b = u.searchParams.get("t");
    return a || b;
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
    // якщо rules вимагають request.auth (часто так) — краще анонімний вхід
    try {
      if (window.scAuth && !window.scAuth.currentUser) {
        await window.scAuth.signInAnonymously();
      }
    } catch {
      // якщо auth не підключений/заблокований — просто ігноруємо
    }
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

  function wToNo(w) {
    const n = Number(String(w || "").replace("W", ""));
    return n >= 1 && n <= 4 ? n : 1;
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

      // ✅ під твою структуру
      const isUsed = !!d.used || !!d.usedAt;
      if (isUsed) throw new Error("Цей QR вже використаний");

      if (d.isActive === false) throw new Error("Токен не активний");
      if (d.expiresAt && d.expiresAt.toDate && d.expiresAt.toDate() < new Date()) {
        throw new Error("Токен протермінований");
      }

      // ✅ stageId + compId ОБОВ'ЯЗКОВІ
      const compId  = String(d.compId || "");
      const stageId = String(d.stageId || "");
      const zone    = String(d.zone || "");

      if (!compId || !stageId || !zone) {
        throw new Error("Токен без compId/stageId/zone");
      }

      // mark used NOW
      tx.set(
        ref,
        {
          used: true,
          usedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          isActive: false,
          usedBy: window.scAuth?.currentUser?.uid || null,
        },
        { merge: true }
      );

      session = { compId, stageId, zone, token };
    });

    return session;
  }

  // =========================
  // TEAMS LOADING (draw -> fallback registrations)
  // =========================

  function zoneFromReg(d) {
    const drawKey = String(d.drawKey || "").toUpperCase();
    const z = String(d.drawZone || d.zone || (drawKey ? drawKey[0] : "") || "").toUpperCase();
    const sector = Number(d.drawSector || d.sector || (drawKey ? parseInt(drawKey.slice(1), 10) : 0) || 0);
    const label = drawKey ? drawKey : (z && sector ? `${z}${sector}` : z);
    return { z, sector: sector || "", label };
  }

  async function loadZoneTeams(compId, stageId, zone) {
    // 1) пробуємо "draw"
    try {
      const snap = await window.scDb
        .collection("draw")
        .where("stageId", "==", stageId)
        .where("zone", "==", zone)
        .get();

      const list = [];
      snap.forEach((d) => {
        const x = d.data() || {};
        list.push({
          teamId: x.teamId || d.id,
          teamName: x.teamName || x.team || "—",
          sector: x.sector || x.drawSector || ""
        });
      });

      if (list.length) return list;
    } catch (e) {
      // якщо draw не існує/індекс — ідемо на fallback
      console.warn("draw load failed, fallback to registrations", e);
    }

    // 2) fallback: registrations confirmed (як у live)
    const snap2 = await window.scDb
      .collection("registrations")
      .where("competitionId", "==", compId)
      .where("stageId", "==", stageId)
      .where("status", "==", "confirmed")
      .get();

    const list2 = [];
    snap2.forEach((doc) => {
      const d = doc.data() || {};
      const z = zoneFromReg(d);
      if (z.z !== String(zone).toUpperCase()) return;

      list2.push({
        teamId: d.teamId || doc.id,
        teamName: d.teamName || d.team || "—",
        sector: z.sector || ""
      });
    });

    // сорт по сектору
    list2.sort((a, b) => Number(a.sector || 0) - Number(b.sector || 0));
    return list2;
  }

  function renderTeams() {
    // table
    if (teamsTBody) {
      if (!teams.length) {
        teamsTBody.innerHTML = `<tr><td colspan="2">Немає команд у цій зоні.</td></tr>`;
      } else {
        teamsTBody.innerHTML = teams
          .map(
            (t) => `
          <tr>
            <td>${t.sector || "—"}</td>
            <td>${t.teamName}</td>
          </tr>
        `
          )
          .join("");
      }
    }

    // select
    if (teamSelect) {
      teamSelect.innerHTML = "";
      teams.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.teamId;
        opt.textContent = `${t.sector ? t.sector + " · " : ""}${t.teamName}`;
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
  // WEIGHINGS IO (correct for LIVE)
  // =========================

  function weighDocId(compId, stageId, teamId, weighNo) {
    return `${compId}__${stageId}__${teamId}__W${Number(weighNo)}`;
  }

  async function loadFishList() {
    if (!session || !teamSelect?.value || !fishBody) return;

    const compId = session.compId;
    const stageId = session.stageId;
    const zone = session.zone;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    const ref = window.scDb.collection("weighings").doc(weighDocId(compId, stageId, teamId, weighNo));
    const doc = await ref.get();
    const data = doc.exists ? doc.data() || {} : {};
    const arr = Array.isArray(data.weights) ? data.weights : [];

    if (!arr.length) {
      fishBody.innerHTML = `<tr><td colspan="3">Поки що немає записів.</td></tr>`;
      return;
    }

    fishBody.innerHTML = arr
      .map(
        (kg, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${Number(kg).toFixed(3)}</td>
        <td style="text-align:right;">
          <button class="btn btn--ghost" data-del="${i}" type="button">✕</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  async function addFish() {
    hideErr();
    const kg = parseKg(fishInp?.value);
    if (!kg) return showErr("Введи вагу, напр. 5.120");
    if (!session || !teamSelect?.value) return showErr("Немає сесії або команди");

    const compId  = session.compId;
    const stageId = session.stageId;
    const zone    = session.zone;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    const ref = window.scDb.collection("weighings").doc(weighDocId(compId, stageId, teamId, weighNo));

    setStatus("Записую…");

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.exists ? doc.data() || {} : {};
      const arr = Array.isArray(data.weights) ? data.weights.slice() : [];
      arr.push(kg);

      tx.set(
        ref,
        {
          compId,
          stageId,
          weighNo: Number(weighNo),
          teamId: String(teamId),
          zone: String(zone || ""),
          weights: arr,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    fishInp.value = "";
    await loadFishList();
    setStatus("Додано ✅");
  }

  async function deleteFish(idx) {
    if (!session || !teamSelect?.value) return;

    const compId  = session.compId;
    const stageId = session.stageId;
    const zone    = session.zone;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    const ref = window.scDb.collection("weighings").doc(weighDocId(compId, stageId, teamId, weighNo));
    setStatus("Видаляю…");

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.exists ? doc.data() || {} : {};
      const arr = Array.isArray(data.weights) ? data.weights.slice() : [];
      arr.splice(idx, 1);

      tx.set(
        ref,
        {
          compId,
          stageId,
          weighNo: Number(weighNo),
          teamId: String(teamId),
          zone: String(zone || ""),
          weights: arr,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await loadFishList();
    setStatus("Готово ✅");
  }

  async function clearW() {
    if (!session || !teamSelect?.value) return;

    const compId  = session.compId;
    const stageId = session.stageId;
    const zone    = session.zone;

    const teamId = teamSelect.value;
    const weighNo = wToNo(activeW);

    const ref = window.scDb.collection("weighings").doc(weighDocId(compId, stageId, teamId, weighNo));
    setStatus("Очищаю…");

    await ref.set(
      {
        compId,
        stageId,
        weighNo: Number(weighNo),
        teamId: String(teamId),
        zone: String(zone || ""),
        weights: [],
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await loadFishList();
    setStatus("Очищено ✅");
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

      // ✅ кеш валідний тільки якщо є compId/stageId/zone
      if (cached && cached.compId && cached.stageId && cached.zone) {
        session = cached;
      } else {
        if (!token) throw new Error("Немає токена (QR)");
        await activateToken(token);
        saveSession(session);
      }

      if (metaEl) metaEl.textContent = `compId: ${session.compId} · stageId: ${session.stageId} · Зона: ${session.zone}`;

      teams = await loadZoneTeams(session.compId, session.stageId, session.zone);
      renderTeams();

      if (contentEl) contentEl.style.display = "";
      setActiveW("W1");
      await loadFishList();

      // events
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
