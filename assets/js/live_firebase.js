// assets/js/live_firebase.js
// STOLAR CARP • Live (public)
// читає settings/app + stageResults/{docId}
// зони A/B/C + fallback з жеребкування
// зважування W1–W4 компактною таблицею (сектор / команда / зона / риби 1..N)

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl    = document.getElementById("liveStageName");
  const zonesWrap  = document.getElementById("zonesContainer");
  const totalTbody = document.querySelector("#totalTable tbody"); // може бути null
  const updatedEl  = document.getElementById("liveUpdatedAt");

  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");

  // елементи зважувань
  const w1Btn = document.getElementById("wBtn1");
  const w2Btn = document.getElementById("wBtn2");
  const w3Btn = document.getElementById("wBtn3");
  const w4Btn = document.getElementById("wBtn4");
  const weighTableBody = document.querySelector("#weighTable tbody");
  const weighInfoEl    = document.getElementById("weighInfo");

  if (!db) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  // ---------- helpers ----------

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

  // формат для «одна вага» (вага однієї риби або сумарна вага)
  function fmtWObject(w) {
    if (!w) return "";
    const kg = w.weight ?? w.kg ?? w.w ?? w.totalWeight ?? null;
    const c  = w.count ?? w.c ?? w.qty ?? null;

    const num = (val) => {
      if (typeof val === "number") {
        return String(val.toFixed(3)).replace(".", ",");
      }
      return String(val);
    };

    if (kg != null) return num(kg);
    if (c  != null) return num(c);
    return "";
  }

  // формат для W1–W4 і «Разом» в зонах:
  // "к-сть - вага" => "5 - 26,780"
  function fmtWCatchPair(w) {
    if (!w || typeof w !== "object") return "—";

    const c  = w.count ?? w.c ?? w.qty ?? null;
    const kg = w.weight ?? w.kg ?? w.w ?? w.totalWeight ?? null;

    if (c == null && kg == null) return "—";

    const num = (val, digits = 3) => {
      if (val == null) return "—";
      if (typeof val === "number") {
        return String(val.toFixed(digits)).replace(".", ",");
      }
      return String(val);
    };

    const cStr  = num(c, 0);
    const kgStr = num(kg, 3);

    if (c != null && kg != null) return `${cStr} - ${kgStr}`;
    if (c != null) return cStr;
    return kgStr;
  }

  function normZoneItem(x) {
    return {
      place:  x.place ?? x.p ?? "—",
      team:   x.team ?? x.teamName ?? "—",

      w1:     x.w1 ?? x.W1 ?? null,
      w2:     x.w2 ?? x.W2 ?? null,
      w3:     x.w3 ?? x.W3 ?? null,
      w4:     x.w4 ?? x.W4 ?? null,
      total:  x.total ?? x.sum ?? null,

      big:    x.big ?? x.BIG ?? x.bigFish ?? "—",
      weight: x.weight ?? x.totalWeight ?? (x.total?.weight ?? "") ?? "—",

      zone:   x.zone ?? x.drawZone ?? ""
    };
  }

  // ---------- зони A/B/C ----------

  function renderZones(zonesData) {
  const container = document.getElementById("zonesContainer");
  if (!container) return;

  container.innerHTML = "";

  const zoneKeys = ["A", "B", "C"];

  zoneKeys.forEach((key) => {
    const list = Array.isArray(zonesData[key]) ? zonesData[key] : [];

    const card = document.createElement("div");
    card.className = "card";

    const titleRow = document.createElement("div");
    titleRow.className = "live-zone-title";
    titleRow.innerHTML = `
      <h3 style="margin:0;">Зона ${key}</h3>
      <span class="badge">команд: ${list.length}</span>
    `;
    card.appendChild(titleRow);

    if (!list.length) {
      const p = document.createElement("p");
      p.className = "live-note";
      p.textContent = "Результати для цієї зони ще не заповнені.";
      card.appendChild(p);
      container.appendChild(card);
      return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.style.overflowX = "auto";

    const table = document.createElement("table");
    table.className = "table table-sm";

    table.innerHTML = `
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
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    tbody.innerHTML = list
      .map((row) => {
        const zoneLabel = row.zoneLabel || row.zone || key || "—";

        return `
          <tr>
            <td>${fmt(zoneLabel)}</td>
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
        `;
      })
      .join("");

    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    container.appendChild(card);
  });
  }

  // ---------- загальна таблиця (підсумок по етапу) ----------

  function renderTotal(total) {
    if (!totalTbody) return; // таблицю могли прибрати з HTML

    const arr = Array.isArray(total) ? total.map(normZoneItem) : [];

    if (!arr.length) {
      totalTbody.innerHTML =
        `<tr><td colspan="6">Дані ще не заповнені.</td></tr>`;
      return;
    }

    totalTbody.innerHTML = arr.map((row) => {
      let totalCount = null;
      if (row.total && typeof row.total === "object") {
        totalCount = row.total.count ?? row.total.c ?? row.total.qty ?? null;
      }

      const totalCountStr = totalCount == null ? "—" : fmt(totalCount);

      const weightStr =
        row.weight && row.weight !== "—"
          ? fmtWObject({ weight: row.weight })
          : "—";

      return `
        <tr>
          <td>${fmt(row.zone)}</td>
          <td class="team-col">${fmt(row.team)}</td>
          <td>${totalCountStr}</td>
          <td>${fmt(row.big)}</td>
          <td>${weightStr}</td>
          <td>${fmt(row.place)}</td>
        </tr>
      `;
    }).join("");
  }

  // ---------- ЗВАЖУВАННЯ ----------

  let currentWIndex = 1;
  let currentStageWeighings = [];

  function setActiveWeighTab(idx) {
    currentWIndex = idx;
    [w1Btn, w2Btn, w3Btn, w4Btn].forEach((btn, i) => {
      if (!btn) return;
      btn.classList.toggle("btn--pill-active", i + 1 === idx);
    });
  }

  function normWeighRow(x) {
    const wIndex =
      x.wIndex ?? x.wi ?? x.index ?? x.round ?? x.weighIndex ?? 1;

    const sector =
      x.sector ?? x.sectorNum ?? x.drawSector ?? x.sectorNumber ?? null;

    const zone = (x.zone ?? x.drawZone ?? "").toString().toUpperCase();
    const team = x.teamName ?? x.team ?? x.name ?? "—";

    let weightObj = null;
    if (x.w && typeof x.w === "object") {
      weightObj = x.w;
    } else if (typeof x.weight === "object") {
      weightObj = x.weight;
    } else if (x.weightKg || x.kg || x.w || x.totalWeight) {
      weightObj = { weight: x.weightKg ?? x.kg ?? x.w ?? x.totalWeight };
    } else if (x.fishWeight || x.fish) {
      weightObj = { weight: x.fishWeight ?? x.fish };
    }

    return { wIndex, sector, zone, team, weightObj };
  }

  function groupWeighingsBySector(allWeighings, wIndex) {
    const normAll = Array.isArray(allWeighings)
      ? allWeighings.map(normWeighRow)
      : [];

    const filtered = normAll.filter(
      (r) => Number(r.wIndex) === Number(wIndex)
    );

    const map = new Map(); // key = zone|sector

    filtered.forEach((r) => {
      if (r.sector == null) return;

      // ключ за зоною і сектором
      const key = `${r.zone || ""}|${r.sector}`;
      let entry = map.get(key);
      const weightStr = fmtWObject(r.weightObj);

      if (!entry) {
        entry = {
          sector: r.sector,
          zone: r.zone || "",
          team: r.team || "—",
          fishes: []
        };
        map.set(key, entry);
      }
      entry.fishes.push(weightStr || "");
    });

    const rows = Array.from(map.values());
    rows.sort((a, b) => {
      if (a.zone === b.zone) return (a.sector ?? 0) - (b.sector ?? 0);
      return String(a.zone).localeCompare(String(b.zone), "uk");
    });

    const maxFish = rows.reduce(
      (m, r) => Math.max(m, r.fishes.length),
      0
    );

    return { rows, maxFish };
  }

  function renderWeighings(allWeighings, wIndex) {
    if (!weighTableBody) return;

    const { rows, maxFish } = groupWeighingsBySector(allWeighings, wIndex);

    if (!rows.length) {
      weighTableBody.innerHTML =
        `<tr><td colspan="4">Для W${wIndex} ще немає зважувань.</td></tr>`;
      if (weighInfoEl) {
        weighInfoEl.textContent =
          `Оберіть W1–W4, щоб переглянути зважування. № = номер сектору.`;
      }
      return;
    }

    const html = rows.map((r) => {
      const fishes = [];
      for (let i = 0; i < maxFish; i++) {
        const val = r.fishes[i] || "";
        fishes.push(
          `<td class="cell-fish">${val ? fmt(val) : " "}</td>`
        );
      }
      return `
        <tr>
          <td class="cell-num">${fmt(r.sector)}</td>
          <td class="team-col">${fmt(r.team)}</td>
          <td class="cell-zone">${fmt(r.zone)}</td>
          ${fishes.join("")}
        </tr>
      `;
    }).join("");

    weighTableBody.innerHTML = html;

    if (weighInfoEl) {
      weighInfoEl.textContent =
        `Показано зважування W${wIndex}. № = сектор, колонки 1–… = окремі риби.`;
    }

    const thead = document.querySelector("#weighTable thead tr");
    if (thead) {
      // залишаємо тільки перші три (№, Команда, Зона)
      while (thead.children.length > 3) {
        thead.removeChild(thead.lastElementChild);
      }
      // додаємо колонки 1..maxFish
      for (let i = 1; i <= maxFish; i++) {
        const th = document.createElement("th");
        th.textContent = String(i); // 1,2,3...
        th.className = "cell-fish";
        thead.appendChild(th);
      }
    }
  }

  function handleWeighTabClick(idx) {
    setActiveWeighTab(idx);
    renderWeighings(currentStageWeighings, currentWIndex);
  }

  // ---------- Firestore subscriptions ----------

  let unsubSettings = null;
  let unsubStage    = null;

  function showError(text) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent   = text;
    }
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "none";
  }

  function showContent() {
    if (errorEl)   errorEl.style.display   = "none";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "grid";
  }

  function stopStageSub() {
    if (unsubStage) {
      unsubStage();
      unsubStage = null;
    }
  }

  function stageDocIdFromApp(app) {
    const key = app?.activeKey || app?.activeStageKey;
    if (key) return String(key);

    const compId  = app?.activeCompetitionId || app?.competitionId || "";
    const stageId = app?.activeStageId || app?.stageId || "";
    if (compId && stageId) return `${compId}||${stageId}`;
    if (compId && !stageId) return `${compId}||main`;
    return "";
  }

  function buildFallbackFromTeams(teamsRaw) {
    const teams = Array.isArray(teamsRaw) ? teamsRaw : [];
    const zones = { A: [], B: [], C: [] };
    const total = [];

    teams.forEach((t) => {
      const drawKey = (t.drawKey || t.sector || "").toString().toUpperCase();
      const zone = (t.drawZone || t.zone || (drawKey ? drawKey[0] : "") || "").toUpperCase();
      if (!["A","B","C"].includes(zone)) return;

      const base = {
        place: "—",
        team: t.teamName || t.team || "—",
        zone,
        w1: null,
        w2: null,
        w3: null,
        w4: null,
        total: null,
        big: "—",
        weight: "—"
      };

      zones[zone].push(base);
      total.push(base);
    });

    return { zones, total };
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
        if (!snap.exists) {
          showError("Live ще не опублікований для цього етапу (нема stageResults).");
          return;
        }

        const data = snap.data() || {};

        const stageName = data.stageName || data.stage || data.title || docId;
        if (stageEl) stageEl.textContent = stageName;

        const updatedAt = data.updatedAt || data.updated || data.ts || null;
        if (updatedEl) updatedEl.textContent = `Оновлено: ${fmtTs(updatedAt)}`;

        const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

        let zonesData  = data.zones || { A: [], B: [], C: [] };
        let totalData  = Array.isArray(data.total) ? data.total : [];

        const hasZoneData =
          (zonesData.A && zonesData.A.length) ||
          (zonesData.B && zonesData.B.length) ||
          (zonesData.C && zonesData.C.length);

        if (!hasZoneData && !totalData.length && teamsRaw.length) {
          const fb = buildFallbackFromTeams(teamsRaw);
          zonesData = fb.zones;
          totalData = fb.total;
        }

        renderZones(zonesData);
        renderTotal(totalData);

        // зважування
        currentStageWeighings = Array.isArray(data.weighings) ? data.weighings : [];
        setActiveWeighTab(currentWIndex || 1);
        renderWeighings(currentStageWeighings, currentWIndex);

        showContent();
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
        const app = snap.exists ? (snap.data() || {}) : {};
        const docId = stageDocIdFromApp(app);
        startStageSub(docId);
      },
      (err) => {
        console.error(err);
        showError("Помилка читання settings/app.");
      }
    );

  // таби W1–W4
  if (w1Btn) w1Btn.addEventListener("click", () => handleWeighTabClick(1));
  if (w2Btn) w2Btn.addEventListener("click", () => handleWeighTabClick(2));
  if (w3Btn) w3Btn.addEventListener("click", () => handleWeighTabClick(3));
  if (w4Btn) w4Btn.addEventListener("click", () => handleWeighTabClick(4));

  // компактний CSS для таблиць
  (function injectLiveCSS () {
    const css = `
      .live-zone .table-wrap,
      #weighTableWrap {
        width: 100%;
        overflow-x: auto;
      }

      .live-zone .table-sm,
      #weighTable.table-sm {
        width: 100%;
        border-collapse: collapse;
      }

      .live-zone .table-sm th,
      .live-zone .table-sm td,
      #weighTable.table-sm th,
      #weighTable.table-sm td {
        padding: 2px 3px;
        font-size: 11px;
        white-space: nowrap;
      }

      .team-col {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cell-num, .cell-zone { text-align: center; }
      .cell-fish    { min-width: 36px; text-align: center; }

      @media (max-width: 480px) {
        .live-zone .table-sm th,
        .live-zone .table-sm td,
        #weighTable.table-sm th,
        #weighTable.table-sm td {
          font-size: 10px;
        }
      }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();
})();
