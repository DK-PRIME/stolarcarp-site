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

  // ===== helpers =====
  const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

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

  function fmtNum(x) {
  const n = Number(x);
  if (!isFinite(n)) return null;
  return n.toFixed(2).replace(/\.?0+$/, "");
  }

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent   = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  function showContent() {
    if (errorEl)   errorEl.style.display   = "none";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  // ======== AUTO ZONES (from weighings) ========

function kgShort(x) {
  const n = Number(x || 0);
  if (!isFinite(n)) return "0";
  return n.toFixed(2).replace(/\.?0+$/, ""); // 23.900 -> 23.9 ; 31.560 -> 31.56
}

function wCell(hasDoc, weightsArr) {
  // якщо зважування ще не відбулося — "-"
  if (!hasDoc) return "-";

  const arr = Array.isArray(weightsArr) ? weightsArr : [];
  const cnt = arr.length;
  const sum = arr.reduce((a, b) => a + Number(b || 0), 0);

  // якщо документ є, але риби нема — 0/0
  if (cnt === 0) return "0 / 0";
  return `${cnt} / ${kgShort(sum)}`;
}

function buildZonesAuto(regRows, weighDocs) {
  const zones = { A: [], B: [], C: [] };

  // teamId -> { has:{1..4}, w:{1..4} }
  const byTeam = new Map();
  (weighDocs || []).forEach((d) => {
    const teamId = d.teamId || "";
    if (!teamId) return;

    const no = Number(d.weighNo);
    if (!(no >= 1 && no <= 4)) return;

    if (!byTeam.has(teamId)) {
      byTeam.set(teamId, {
        has: { 1: false, 2: false, 3: false, 4: false },
        w: { 1: [], 2: [], 3: [], 4: [] }
      });
    }
    const t = byTeam.get(teamId);
    t.has[no] = true;
    t.w[no] = Array.isArray(d.weights) ? d.weights : [];
  });

  // будуємо рядки по порядку секторів з registrations
  (regRows || []).forEach((r) => {
    const zoneLetter = (r.zoneLabel || "")[0]?.toUpperCase();
    if (!["A", "B", "C"].includes(zoneLetter)) return;

    const t = byTeam.get(r.teamId) || {
      has: { 1: false, 2: false, 3: false, 4: false },
      w: { 1: [], 2: [], 3: [], 4: [] }
    };

    let totalCount = 0;
    let totalWeight = 0;
    let bigFish = 0;

    [1, 2, 3, 4].forEach((n) => {
      if (!t.has[n]) return; // якщо W ще не було — не рахуємо нічого

      const arr = t.w[n] || [];
      totalCount += arr.length;

      const sum = arr.reduce((a, b) => a + Number(b || 0), 0);
      totalWeight += sum;

      arr.forEach((x) => (bigFish = Math.max(bigFish, Number(x || 0))));
    });

    const row = {
      zoneLabel: r.zoneLabel,
      team: r.teamName,

      w1: wCell(t.has[1], t.w[1]),
      w2: wCell(t.has[2], t.w[2]),
      w3: wCell(t.has[3], t.w[3]),
      w4: wCell(t.has[4], t.w[4]),

      total: totalCount,                         // Разом = тільки кількість
      big: bigFish ? kgShort(bigFish) : "—",      // BIG
      weight: totalWeight ? kgShort(totalWeight) : "—", // Вага

      _tw: totalWeight,
      _bf: bigFish,
      _tc: totalCount,
    };

    zones[zoneLetter].push(row);
  });

  // місця в зоні: вага -> big -> кількість
  ["A", "B", "C"].forEach((z) => {
    zones[z].sort((a, b) => {
      if (b._tw !== a._tw) return b._tw - a._tw;
      if (b._bf !== a._bf) return b._bf - a._bf;
      return b._tc - a._tc;
    });
    zones[z].forEach((r, i) => (r.place = i + 1));
  });

  return zones;
}

function startAllWeighingsSub() {
  if (!window.scDb) return;
  if (!activeCompId || !activeStageId) return;

  if (unsubAllWeigh) unsubAllWeigh();

  unsubAllWeigh = window.scDb
    .collection("weighings")
    .where("compId", "==", activeCompId)
    .where("stageId", "==", activeStageId)
    .onSnapshot((qs) => {
      const arr = [];
      qs.forEach((doc) => arr.push(doc.data() || {}));
      allWeighDocs = arr;

      // якщо stageResults.zones пусті — оновлюємо зони автоматом
      renderZones(buildZonesAuto(regRows, allWeighDocs), []);
    });
}

  // ======== ZONES (as було) ========
  function fmtW(w) {
  if (w === null || w === undefined || w === "") return "—";

  // якщо вже готовий рядок: "5 / 23.9", "0 / 0", "-"
  if (typeof w === "string") return w;

  // якщо число (наприклад total = 5)
  if (typeof w === "number") return String(w);

  // старий формат обʼєкта {count, weight}
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

  // ======== LIVE WEIGH TABLE (з Firestore weighings) ========
  let activeCompId  = "";
  let activeStageId = "";

  let currentWeighNo  = 1;
let currentWeighKey = "W1";

  let regRows = [];            // [{zoneLabel, sortKey, teamId, teamName}]
  let weighByTeam = new Map(); // teamId -> weights[]

  let unsubRegs  = null;
let unsubWeigh = null;

  let allWeighDocs = [];     // ВСІ документи weighings W1..W4
let unsubAllWeigh = null;  // підписка на weighings (всі W)

  function stopWeighSubs(){
  if (unsubRegs) { unsubRegs(); unsubRegs = null; }
  if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }
  if (unsubAllWeigh) { unsubAllWeigh(); unsubAllWeigh = null; }
  }

  function parseZoneKey(drawKey, drawZone, drawSector){
    const z = (drawZone || (drawKey ? String(drawKey)[0] : "") || "").toUpperCase();
    const n = Number(drawSector || (drawKey ? parseInt(String(drawKey).slice(1), 10) : 0) || 0);
    const label = drawKey ? String(drawKey).toUpperCase() : (z && n ? `${z}${n}` : (z || "—"));
    const zoneOrder = z === "A" ? 1 : z === "B" ? 2 : z === "C" ? 3 : 9;
    const sortKey = zoneOrder * 100 + (isFinite(n) ? n : 99);
    return { label, sortKey };
  }

  function setWeighButtons(activeKey){
    const map = { W1:wBtn1, W2:wBtn2, W3:wBtn3, W4:wBtn4 };
    Object.entries(map).forEach(([k,btn])=>{
      if(!btn) return;
      btn.classList.toggle("btn--accent", k===activeKey);
      btn.classList.toggle("btn--ghost",  k!==activeKey);
    });
  }

  function setActiveWeigh(no){
  const n = Number(no);
  currentWeighNo  = (n >= 1 && n <= 4) ? n : 1;
  currentWeighKey = `W${currentWeighNo}`;
  setWeighButtons(currentWeighKey);
  startWeighingsFor(currentWeighNo);
  }

  function startWeighingsFor(weighNo) {
  const db = window.scDb;
  if (!db) return;
  if (!activeCompId || !activeStageId) return;

    // registrations: порядок секторів
    if (!unsubRegs) {
      unsubRegs = db
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
        }, (err) => {
          console.error("registrations snapshot err:", err);
        });
    }

    // weighings: конкретний W
if (unsubWeigh) { unsubWeigh(); unsubWeigh = null; }
weighByTeam = new Map();

unsubWeigh = db
  .collection("weighings")
  .where("compId", "==", activeCompId)
  .where("stageId", "==", activeStageId)
  .where("weighNo", "==", Number(weighNo))
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
  }, (err) => {
    console.error("weighings snapshot err:", err);
  });

if (weighInfoEl) weighInfoEl.textContent = `${currentWeighKey} — список риб по секторам`;

function renderWeighTable() {
  if (!weighTableEl) return;

  // якщо ще не підтягнуло порядок секторів
  if (!regRows.length) {
    weighTableEl.innerHTML = `
      <div class="table-wrap weigh-wrap">
        <table class="table table-sm live-weigh-table">
          <thead>
            <tr>
              <th class="sticky-col">Зона</th>
              <th class="sticky-col-2">Команда</th>
              <th>🐟</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="3">Очікую список команд…</td></tr>
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  // рядки в правильному порядку
  const rows = regRows.map((r) => {
    const weights = weighByTeam.get(r.teamId) || [];
    const nums = weights.map(fmtNum).filter(Boolean);
    return { zoneLabel: r.zoneLabel, teamName: r.teamName, nums };
  });

  // скільки максимум риб є серед команд у цьому W
  const maxFish = Math.max(1, ...rows.map((r) => r.nums.length));

  const bodyHtml = rows.map((r) => {
    const tds = [];
    for (let i = 0; i < maxFish; i++) {
      const v = r.nums[i];
      tds.push(`<td class="fish-td">${v ? v : "—"}</td>`);
    }

    return `
      <tr>
        <td>${fmt(r.zoneLabel)}</td>
        <td class="team-col">${fmt(r.teamName)}</td>
        ${tds.join("")}
      </tr>
    `;
  }).join("");

  const fishHeaders = Array.from({ length: maxFish }, (_, i) =>
    `<th class="fish-th">🐟${i + 1}</th>`
  ).join("");

  weighTableEl.innerHTML = `
    <div class="table-wrap weigh-wrap">
      <table class="table table-sm live-weigh-table">
        <thead>
          <tr>
            <th class="sticky-col">Зона</th>
            <th class="sticky-col-2">Команда</th>
            ${fishHeaders}
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}
  // ======== STAGE RESULTS SUB (як було) ========
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

  function readActiveIdsFromApp(app){
    const compId =
      app?.activeCompetitionId ||
      app?.activeCompetition ||
      app?.competitionId ||
      "";

    const stageId =
      app?.activeStageId ||
      app?.stageId ||
      "stage-1";

    activeCompId = String(compId || "");
    activeStageId = String(stageId || "");
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
            // навіть якщо stageResults нема — таблиця зважувань все одно може працювати
            if (stageEl) stageEl.textContent = docId;
            if (updatedEl) updatedEl.textContent = "";
            showContent();
            return;
          }

          const data = snap.data() || {};

          const stageName = data.stageName || data.stage || data.title || docId;
          if (stageEl) stageEl.textContent = stageName;

          const updatedAt = data.updatedAt || data.updated || data.ts || null;
          if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

          const zonesData = data.zones || { A: [], B: [], C: [] };
const teamsRaw  = Array.isArray(data.teams) ? data.teams : [];

// якщо суддя колись заповнить zones вручну — показуємо їх
const hasStageZones =
  (zonesData.A && zonesData.A.length) ||
  (zonesData.B && zonesData.B.length) ||
  (zonesData.C && zonesData.C.length);

// якщо нема ручних зон — рахуємо автоматично з weighings
if (hasStageZones) {
  renderZones(zonesData, teamsRaw);
} else {
  renderZones(buildZonesAuto(regRows, allWeighDocs), teamsRaw);
}

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

  // ======== INIT ========
  if (!db) {
    showError("Firebase init не завантажився.");
    return;
  }

  unsubSettings = db
    .collection("settings")
    .doc("app")
    .onSnapshot(
      (snap) => {
        try {
          const app = snap.exists ? (snap.data() || {}) : {};

          // ВАЖЛИВО: ставимо activeCompId/activeStageId для таблиці зважувань
          readActiveIdsFromApp(app);

          // старт підписки на stageResults (зони/рейтинги)
          const docId = stageDocIdFromApp(app);
          startStageSub(docId);

// нижня таблиця зважувань (W1–W4, список ...)
stopWeighSubs();
setActiveWeigh(currentWeighNo);

// верхня таблиця ЗОНИ A / B / C (авто з weighings)
startAllWeighingsSub();

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
  if (wBtn1) wBtn1.addEventListener("click", () => setActiveWeigh(1));
  if (wBtn2) wBtn2.addEventListener("click", () => setActiveWeigh(2));
  if (wBtn3) wBtn3.addEventListener("click", () => setActiveWeigh(3));
  if (wBtn4) wBtn4.addEventListener("click", () => setActiveWeigh(4));

  // дефолт
  setActiveWeigh(1);
})();
