// assets/js/live_firebase.js
// STOLAR CARP • Live (public)

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl      = document.getElementById("liveStageName");
  const zonesWrap    = document.getElementById("zonesContainer");
  const weighTableEl = document.getElementById("totalTable");
  const weighInfoEl  = document.getElementById("weighInfo");
  const updatedEl    = document.getElementById("liveUpdatedAt");

  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");

  const wBtn1 = document.getElementById("wBtn1");
  const wBtn2 = document.getElementById("wBtn2");
  const wBtn3 = document.getElementById("wBtn3");
  const wBtn4 = document.getElementById("wBtn4");

  // ===== LIVE WEIGH TABLE (fish list per W button) =====
let activeCompId = "";
let activeStageId = "";
let unsubRegs = null;
let unsubWeigh = null;

let regRows = [];            // [{zoneLabel, sortKey, teamId, teamName}]
let weighByTeam = new Map(); // teamId -> weights[]

function stopWeighSubs(){
  if (unsubRegs) { unsubRegs(); unsubRegs = null; }
  if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }
}

function parseZoneKey(drawKey, drawZone, drawSector){
  const z = (drawZone || (drawKey ? String(drawKey)[0] : "") || "").toUpperCase();
  const n = Number(drawSector || (drawKey ? parseInt(String(drawKey).slice(1), 10) : 0) || 0);
  const label = drawKey ? String(drawKey).toUpperCase() : (z && n ? `${z}${n}` : (z || "—"));
  const zoneOrder = z === "A" ? 1 : z === "B" ? 2 : z === "C" ? 3 : 9;
  const sortKey = zoneOrder * 100 + (isFinite(n) ? n : 99);
  return { label, sortKey };
}

function fmtNum(x){
  const n = Number(x);
  if (!isFinite(n)) return "—";
  return n.toFixed(3);
}

function setWeighButtons(activeKey){
  const map = { W1:wBtn1, W2:wBtn2, W3:wBtn3, W4:wBtn4 };
  Object.entries(map).forEach(([k,btn])=>{
    if(!btn) return;
    btn.classList.toggle("btn--accent", k===activeKey);
    btn.classList.toggle("btn--ghost",  k!==activeKey);
  });
  if (weighInfoEl) weighInfoEl.textContent = `${activeKey} — список риб`;
}

function startWeighingsFor(no){
  if (!window.scDb) return;
  if (!activeCompId || !activeStageId) return;

  // registrations: порядок секторів
  if (!unsubRegs) {
    unsubRegs = window.scDb
      .collection("registrations")
      .where("competitionId", "==", activeCompId)
      .where("stageId", "==", activeStageId)
      .where("status", "==", "confirmed")
      .onSnapshot((qs) => {
        const rows = [];
        qs.forEach((doc) => {
          const d = doc.data() || {};
          const teamId = d.teamId || "";
          const teamName = d.teamName || d.team || "—";
          const drawKey = d.drawKey || "";
          const drawZone = d.drawZone || d.zone || "";
          const drawSector = d.drawSector || d.sector || "";
          const z = parseZoneKey(drawKey, drawZone, drawSector);
          rows.push({ zoneLabel: z.label, sortKey: z.sortKey, teamId, teamName });
        });
        rows.sort((a,b)=>a.sortKey-b.sortKey);
        regRows = rows;
        renderWeighTable();
      });
  }

  // weighings: конкретний W
  if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }
  weighByTeam = new Map();

  unsubWeigh = window.scDb
    .collection("weighings")
    .where("compId", "==", activeCompId)
    .where("stageId", "==", activeStageId)
    .where("weighNo", "==", no)
    .onSnapshot((qs) => {
      const map = new Map();
      qs.forEach((doc) => {
        const d = doc.data() || {};
        const teamId = d.teamId || "";
        const weights = Array.isArray(d.weights) ? d.weights : [];
        if (teamId) map.set(teamId, weights);
      });
      weighByTeam = map;
      renderWeighTable();
    });
}

  if (!db) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  const fmt = (v) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  const fmtTs = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!d) return "—";
      return d.toLocaleString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit"
      });
    } catch {
      return "—";
    }
  };

  function fmtW(w) {
    if (!w) return "—";
    const c  = w.count ?? w.c ?? w.qty ?? "";
    const kg = w.weight ?? w.kg ?? w.w ?? "";
    if (c === "" && kg === "") return "—";
    return `${fmt(c)} / ${fmt(kg)}`;
  }

  function normZoneItem(x) {
    const zoneRaw = x.zone ?? x.drawZone ?? "";
    const sector  = x.drawSector ?? x.sector ?? null;
    const drawKey = x.drawKey || "";

    let zoneLabel = x.zoneLabel || "";
    if (!zoneLabel) {
      if (drawKey) zoneLabel = String(drawKey);
      else if (zoneRaw && sector) zoneLabel = `${zoneRaw}${sector}`;
      else zoneLabel = zoneRaw || "—";
    }

    return {
      zoneLabel,
      team:   x.team ?? x.teamName ?? "—",
      w1:     x.w1 ?? x.W1 ?? null,
      w2:     x.w2 ?? x.W2 ?? null,
      w3:     x.w3 ?? x.W3 ?? null,
      w4:     x.w4 ?? x.W4 ?? null,
      total:  x.total ?? x.sum ?? null,
      big:    x.big ?? x.BIG ?? x.bigFish ?? "—",
      weight: x.weight ?? x.totalWeight ?? (x.total?.weight ?? "") ?? "—",
      place:  x.place ?? x.p ?? "—"
    };
  }

  // ---------- ЗОНИ ----------
  function renderZones(zonesData, teamsRaw) {
    if (!zonesWrap) return;

    const zoneNames = ["A", "B", "C"];
    let useZones = zonesData || {};

    const hasZoneData =
      (useZones.A && useZones.A.length) ||
      (useZones.B && useZones.B.length) ||
      (useZones.C && useZones.C.length);

    // fallback з teams
    if (!hasZoneData && Array.isArray(teamsRaw) && teamsRaw.length) {
      const fb = { A: [], B: [], C: [] };
      teamsRaw.forEach((t) => {
        const drawKey = (t.drawKey || "").toString().toUpperCase();
        const zone    = (t.drawZone || t.zone || (drawKey ? drawKey[0] : "") || "").toUpperCase();
        const sector  = t.drawSector || t.sector || (drawKey ? parseInt(drawKey.slice(1),10) : null);
        if (!["A","B","C"].includes(zone)) return;

        fb[zone].push({
          teamName: t.teamName || t.team || "—",
          zone,
          drawZone: zone,
          drawSector: sector,
          drawKey,
          place: "—",
          w1: null, w2: null, w3: null, w4: null,
          total: null,
          big: "—",
          weight: "—"
        });
      });
      useZones = fb;
    }

    zonesWrap.innerHTML = zoneNames.map((z) => {
      const listRaw = (useZones && useZones[z]) ? useZones[z] : [];
      const list    = listRaw.map(normZoneItem);

      if (!list.length) {
        return `
          <div class="live-zone card">
            <div class="live-zone-title">
              <h3 style="margin:0;">Зона ${z}</h3>
              <span class="badge">немає даних</span>
            </div>
            <p class="form__hint">Результати для цієї зони ще не заповнені.</p>
          </div>
        `;
      }

      const rowsHtml = list.map((row) => `
        <tr>
          <td>${fmt(row.zoneLabel)}</td>
          <td class="team-col">${fmt(row.team)}</td>
          <td>${fmtW(row.w1)}</td>
          <td>${fmtW(row.w2)}</td>
          <td>${fmtW(row.w3)}</td>
          <td>${fmtW(row.w4)}</td>
          <td>${fmtW(row.total)}</td>
          <td>${fmt(row.big)}</td>
          <td>${fmt(row.weight)}</td>
          <td>${fmt(row.place)}</td>
        </tr>
      `).join("");

      return `
        <div class="live-zone card">
          <div class="live-zone-title">
            <h3 style="margin:0;">Зона ${z}</h3>
            <span class="badge badge--warn">команд: ${list.length}</span>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Зона</th>
                  <th>Команда</th>
                  <th>W1</th>
                  <th>W2</th>
                  <th>W3</th>
                  <th>W4</th>
                  <th>Разом</th>
                  <th>BIG</th>
                  <th>Вага</th>
                  <th>Місце</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- ЗВАЖУВАННЯ ----------
  let currentWeighKey = "W1";
  let lastWeighings = null;

  function setActiveWeighButton(key) {
    currentWeighKey = key;
    const map = { W1: wBtn1, W2: wBtn2, W3: wBtn3, W4: wBtn4 };
    Object.keys(map).forEach((k) => {
      const btn = map[k];
      if (!btn) return;
      if (k === key) {
        btn.classList.add("btn--accent");
        btn.classList.remove("btn--ghost");
      } else {
        btn.classList.add("btn--ghost");
        btn.classList.remove("btn--accent");
      }
    });
    renderWeighTable();
  }

  function renderWeighTable() {
    if (!weighTableEl) return;

    const src = lastWeighings || {};
    const key = currentWeighKey;
    const raw = src[key] || src[key.toUpperCase()] || src[key.toLowerCase()] || [];

    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === "object") {
      list = Object.values(raw);
    }

    // якщо нічого – показуємо заглушку
    if (!list.length) {
      weighTableEl.innerHTML = `
        <thead>
          <tr>
            <th>Зона</th>
            <th>Команда</th>
            <th>Риби (кг)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="3">Для ${key} ще немає зважувань.</td></tr>
        </tbody>
      `;
      if (weighInfoEl) {
        weighInfoEl.textContent = `${key} — зважування. Поки що немає записаних риб.`;
      }
      return;
    }

    const rows = list.map((item) => {
      const zoneLabel = item.zoneLabel || item.zone || item.drawKey || "—";
      const teamName  = item.teamName || item.team || "—";
      const weights   = Array.isArray(item.weights) ? item.weights : [];
      return { zoneLabel, teamName, weights };
    });

    const maxLen = rows.reduce((m, r) => Math.max(m, r.weights.length), 0);

    let theadHtml = `
      <thead>
        <tr>
          <th>Зона</th>
          <th>Команда</th>
    `;
    for (let i = 1; i <= maxLen; i++) {
      theadHtml += `<th>Риба ${i}</th>`;
    }
    theadHtml += `
        </tr>
      </thead>
    `;

    const bodyHtml = rows.map((r) => {
      const cells = r.weights.map((w) => `<td>${fmt(w)}</td>`).join("");
      const padCount = maxLen - r.weights.length;
      const pads = padCount > 0 ? "<td></td>".repeat(padCount) : "";
      return `
        <tr>
          <td>${fmt(r.zoneLabel)}</td>
          <td class="team-col">${fmt(r.teamName)}</td>
          ${cells}${pads}
        </tr>
      `;
    }).join("");

    weighTableEl.innerHTML = theadHtml + `<tbody>${bodyHtml}</tbody>`;

    if (weighInfoEl) {
      weighInfoEl.textContent = `${key} — зважування. Показано всі риби по секторам.`;
    }
  }

  // ---------- СТАН / Firestore ----------

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent   = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid"; // щоб хоч щось показати
  }

  function showContent() {
    if (errorEl)   errorEl.style.display   = "none";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  let unsubSettings = null;
  let unsubStage    = null;

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  function stageDocIdFromApp(app) {
  const key = app?.activeKey;
  if (key) return String(key);

  const compId =
    app?.activeCompetitionId ||
    app?.activeCompetition ||
    app?.competitionId ||
    "";

  const stageId =
    app?.activeStageId ||
    app?.stageId ||
    "stage-1";

  if (compId && stageId) return `${compId}||${stageId}`;
  return "";
  }

  function startStageSub(docId) {
    stopStageSub();

    if (!docId) {
      showError("Нема активного етапу (settings/app).");
      return;
    }

    const ref = db.collection("stageResults").doc(docId);

    unsubStage = ref.onSnapshot(
      (snap) => {
        try {
          if (!snap.exists) {
            showError("Live ще не опублікований для цього етапу (нема stageResults).");
            return;
          }

          const data = snap.data() || {};

          const stageName = data.stageName || data.stage || data.title || docId;
          if (stageEl) stageEl.textContent = stageName;

          const updatedAt = data.updatedAt || data.updated || data.ts || null;
          if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

          const zonesData = data.zones || { A: [], B: [], C: [] };
          const teamsRaw  = Array.isArray(data.teams) ? data.teams : [];

          renderZones(zonesData, teamsRaw);

          lastWeighings = data.weighings || null;
          renderWeighTable();

          showContent();
        } catch (e) {
          console.error("Render error in stageResults snapshot:", e);
          showError("Помилка відображення даних Live.");
        }
      },
      (err) => {
        console.error(err);
        showError("Помилка читання Live (stageResults).");
      }
    );
  }

  unsubSettings = db
    .collection("settings")
    .doc("app")
    .onSnapshot(
      (snap) => {
        try {
          const app = snap.exists ? (snap.data() || {}) : {};
          const docId = stageDocIdFromApp(app);
          startStageSub(docId);
        } catch (e) {
          console.error("settings/app error:", e);
          showError("Помилка читання settings/app.");
        }
      },
      (err) => {
        console.error(err);
        showError("Помилка читання settings/app.");
      }
    );

  // кнопки W1–W4
  if (wBtn1) wBtn1.addEventListener("click", () => setActiveWeighButton("W1"));
  if (wBtn2) wBtn2.addEventListener("click", () => setActiveWeighButton("W2"));
  if (wBtn3) wBtn3.addEventListener("click", () => setActiveWeighButton("W3"));
  if (wBtn4) wBtn4.addEventListener("click", () => setActiveWeighButton("W4"));

  setActiveWeighButton("W1");
})();
