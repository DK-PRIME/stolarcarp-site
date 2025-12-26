// assets/js/judge_page.js
(function () {
  const $ = (id) => document.getElementById(id);

  const errEl = $("judgeError");
  const metaEl = $("judgeMeta");
  const contentEl = $("judgeContent");
  const logoutBtn = $("judgeLogout");

  const teamsTBody = $("teamsTable")?.querySelector("tbody");
  const teamSelect = $("teamSelect");
  const fishInp = $("fishWeight");
  const addBtn = $("addFish");
  const fishBody = $("fishList")?.querySelector("tbody");
  const clearBtn = $("clearW");
  const statusEl = $("status");
  const activeWEl = $("activeW");

  let activeW = "W1";
  let session = null; // {stageId, zone}
  let teams = []; // [{teamId, teamName, sector}]

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
    return u.searchParams.get("t");
  }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready");
  }

  function saveSession(s) {
    localStorage.setItem("sc_judge_session", JSON.stringify(s));
  }
  function loadSession() {
    try {
      const s = localStorage.getItem("sc_judge_session");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  function clearSession() {
    localStorage.removeItem("sc_judge_session");
  }

  // Одноразова активація токена
  async function activateToken(token) {
    const ref = window.scDb.collection("judgeTokens").doc(token);

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new Error("Токен не знайдено");
      const d = doc.data() || {};

      if (d.used) throw new Error("Цей QR вже використаний");
      if (d.expiresAt && d.expiresAt.toDate && d.expiresAt.toDate() < new Date()) {
        throw new Error("Токен протермінований");
      }

      // mark used NOW
      tx.set(ref, {
        used: true,
        usedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      session = { stageId: d.stageId, zone: d.zone };
    });

    return session;
  }

  // Завантажити команди зони
  async function loadZoneTeams(stageId, zone) {
    // ВАЖЛИВО: тут ми беремо з жеребкування/учасників.
    // Універсальний варіант: collection "draw" або "registrations" + поле zone/sector.
    // Я роблю через "draw" (як у вас жеребкування).
    const snap = await window.scDb.collection("draw")
      .where("stageId", "==", stageId)
      .where("zone", "==", zone)
      .get();

    const list = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      list.push({
        teamId: x.teamId || d.id,
        teamName: x.teamName || x.team || "—",
        sector: x.sector || ""
      });
    });

    // fallback якщо draw ще нема — тоді пусто
    return list;
  }

  function renderTeams() {
    // table
    if (teamsTBody) {
      if (!teams.length) {
        teamsTBody.innerHTML = `<tr><td colspan="2">Немає команд у цій зоні.</td></tr>`;
      } else {
        teamsTBody.innerHTML = teams.map(t => `
          <tr>
            <td>${t.sector || "—"}</td>
            <td>${t.teamName}</td>
          </tr>
        `).join("");
      }
    }

    // select
    if (teamSelect) {
      teamSelect.innerHTML = "";
      teams.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.teamId;
        opt.textContent = `${t.sector ? (t.sector + " · ") : ""}${t.teamName}`;
        teamSelect.appendChild(opt);
      });
    }
  }

  function setActiveW(w) {
    activeW = w;
    if (activeWEl) activeWEl.textContent = "Активне: " + w;

    document.querySelectorAll("[data-w]").forEach((b) => {
      b.classList.remove("btn--accent","btn--ghost");
      b.classList.add(b.getAttribute("data-w") === w ? "btn--accent" : "btn--ghost");
    });

    loadFishList();
  }

  function stageResultDocId(stageId, teamId) {
    // якщо у тебе інший docId — замінимо цей 1 рядок
    return `${stageId}_${teamId}`;
  }

  async function loadFishList() {
    if (!session || !teamSelect?.value || !fishBody) return;
    const stageId = session.stageId;
    const teamId = teamSelect.value;

    const ref = window.scDb.collection("stageResults").doc(stageResultDocId(stageId, teamId));
    const doc = await ref.get();
    const data = doc.exists ? (doc.data() || {}) : {};
    const weighings = data.weighings || {};
    const arr = Array.isArray(weighings[activeW]) ? weighings[activeW] : [];

    if (!arr.length) {
      fishBody.innerHTML = `<tr><td colspan="3">Поки що немає записів.</td></tr>`;
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

  async function addFish() {
    hideErr();
    const kg = parseKg(fishInp?.value);
    if (!kg) return showErr("Введи вагу, напр. 5.120");
    if (!session || !teamSelect?.value) return showErr("Немає сесії або команди");

    const stageId = session.stageId;
    const teamId = teamSelect.value;
    const ref = window.scDb.collection("stageResults").doc(stageResultDocId(stageId, teamId));

    setStatus("Записую…");

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.exists ? (doc.data() || {}) : {};
      const w = Object.assign({ W1: [], W2: [], W3: [], W4: [] }, (data.weighings || {}));

      const arr = Array.isArray(w[activeW]) ? w[activeW].slice() : [];
      arr.push(kg);
      w[activeW] = arr;

      tx.set(ref, {
        weighings: w,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    fishInp.value = "";
    await loadFishList();
    setStatus("Додано ✅");
  }

  async function deleteFish(idx) {
    if (!session || !teamSelect?.value) return;
    const stageId = session.stageId;
    const teamId = teamSelect.value;

    const ref = window.scDb.collection("stageResults").doc(stageResultDocId(stageId, teamId));
    setStatus("Видаляю…");

    await window.scDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const data = doc.exists ? (doc.data() || {}) : {};
      const w = Object.assign({ W1: [], W2: [], W3: [], W4: [] }, (data.weighings || {}));

      const arr = Array.isArray(w[activeW]) ? w[activeW].slice() : [];
      arr.splice(idx, 1);
      w[activeW] = arr;

      tx.set(ref, { weighings: w, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });

    await loadFishList();
    setStatus("Готово ✅");
  }

  async function clearW() {
    if (!session || !teamSelect?.value) return;
    const stageId = session.stageId;
    const teamId = teamSelect.value;

    const ref = window.scDb.collection("stageResults").doc(stageResultDocId(stageId, teamId));
    setStatus("Очищаю…");

    await ref.set({
      weighings: { [activeW]: [] },
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

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

      const cached = loadSession();
      const token = getTokenFromUrl();

      if (cached && cached.stageId && cached.zone) {
        session = cached;
      } else {
        if (!token) throw new Error("Немає токена (QR)");
        await activateToken(token);
        saveSession(session);
      }

      metaEl.textContent = `Етап: ${session.stageId} · Зона: ${session.zone}`;

      teams = await loadZoneTeams(session.stageId, session.zone);
      renderTeams();

      contentEl.style.display = "";
      setActiveW("W1");
      await loadFishList();

      // events
      document.querySelectorAll("[data-w]").forEach((b) => {
        b.addEventListener("click", () => setActiveW(b.getAttribute("data-w")));
      });

      addBtn?.addEventListener("click", addFish);
      fishInp?.addEventListener("keydown", (e) => { if (e.key === "Enter") addFish(); });

      fishBody?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del]");
        if (!btn) return;
        const idx = Number(btn.getAttribute("data-del"));
        if (!Number.isFinite(idx)) return;
        deleteFish(idx);
      });

      clearBtn?.addEventListener("click", clearW);
      logoutBtn?.addEventListener("click", logout);

    } catch (e) {
      console.error(e);
      showErr(e.message || "Помилка");
      metaEl.textContent = "Доступ не активовано";
    }
  })();
})();
