// assets/js/live_firebase.js
// STOLAR CARP • Live (public)
// ✅ читає тільки settings/app + stageResults/{docId}
// ✅ показує зони A/B/C (підсумки по етапу)
// ✅ BigFish Total окремим скриптом
// ✅ "Зважування по етапу" з перемикачем W1–W4:
//    №(сектор) / Команда / Зона / W (шт/кг)
// ✅ навіть якщо немає зважувань, у таблиці будуть усі команди (по зоні/сектору)
// ✅ компактні таблиці для мобілок

(function () {
  "use strict";

  const db = window.scDb;

  const stageEl    = document.getElementById("liveStageName");
  const zonesWrap  = document.getElementById("zonesContainer");
  const updatedEl  = document.getElementById("liveUpdatedAt");

  const loadingEl  = document.getElementById("liveLoading");
  const contentEl  = document.getElementById("liveContent");
  const errorEl    = document.getElementById("liveError");

  // НОВЕ: таблиця зважувань
  const weighTableBody = document.querySelector("#weighTable tbody");
  const wFilterWrap    = document.getElementById("wFilter");

  if (!db) {
    if (errorEl) {
      errorEl.style.display = "block";
      errorEl.textContent = "Firebase init не завантажився.";
    }
    if (loadingEl) loadingEl.style.display = "none";
    return;
  }

  // --- компактні таблиці для live ---
  (function injectLiveCSS () {
    const css = `
      .live-zone .table-sm th,
      .live-zone .table-sm td,
      #weighTable.table-sm th,
      #weighTable.table-sm td {
        padding: 4px 6px;
        font-size: 12px;
        white-space: nowrap;
      }

      .live-zone .table-wrap,
      .card .table-wrap {
        overflow-x: auto;
      }

      @media (max-width: 600px) {
        .live-zone .table-sm th,
        .live-zone .table-sm td,
        #weighTable.table-sm th,
        #weighTable.table-sm td {
          font-size: 11px;
        }
      }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();

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

  // W formatting: {count, weight} => "к-сть / кг"
  function fmtW(w) {
    if (!w) return "—";
    const c  = w.count  ?? w.c   ?? w.qty ?? "";
    const kg = w.weight ?? w.kg  ?? w.w   ?? "";
    if (c === "" && kg === "") return "—";
    return `${fmt(c)} / ${fmt(kg)}`;
  }

  // сортування зон
  function zoneRank(z) {
    if (z === "A") return 1;
    if (z === "B") return 2;
    if (z === "C") return 3;
    return 9;
  }

  // Нормалізуємо 1 рядок (і для зони, і для total)
  function normZoneItem(x) {
    const drawKey = (x.drawKey || x.sectorKey || "").toString().toUpperCase();

    let zoneRaw = x.zone || x.drawZone || (drawKey ? drawKey[0] : "") || "";
    const zone = zoneRaw ? String(zoneRaw).toUpperCase() : "";

    let sector = x.sector ?? x.drawSector ?? null;
    if (!sector && drawKey) {
      const m = drawKey.match(/[A-C](\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n)) sector = n;
      }
    }

    return {
      place:  x.place ?? x.p ?? "—",
      team:   x.team ?? x.teamName ?? "—",

      w1: x.w1 ?? x.W1 ?? null,
      w2: x.w2 ?? x.W2 ?? null,
      w3: x.w3 ?? x.W3 ?? null,
      w4: x.w4 ?? x.W4 ?? null,

      total: x.total ?? x.sum ?? null,

      big:    x.big ?? x.BIG ?? x.bigFish ?? "—",
      weight: x.weight ?? x.totalWeight ?? (x.total?.weight ?? "") ?? "—",

      zone,
      sector
    };
  }

  // --- ЗОНИ A/B/C (підсумки етапу) ---
  function renderZones(zones) {
    const zoneNames = ["A", "B", "C"];

    zonesWrap.innerHTML = zoneNames.map((z) => {
      const listRaw = zones?.[z] || [];
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
          <td>${fmt(row.place)}</td>
          <td class="team-col">${fmt(row.team)}</td>
          <td>${fmt(row.sector)}</td>
          <td>${fmtW(row.w1)}</td>
          <td>${fmtW(row.w2)}</td>
          <td>${fmtW(row.w3)}</td>
          <td>${fmtW(row.w4)}</td>
          <td>${fmtW(row.total)}</td>
          <td>${fmt(row.big)}</td>
          <td>${fmt(row.weight)}</td>
        </tr>
      `).join("");

      return `
        <div class="live-zone card">
          <div class="live-zone-title">
            <h3 style="margin:0;">Зона ${z}</h3>
            <span class="badge badge--warn">команд: ${list.length}</span>
          </div>
          <div class="table-wrap">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Команда</th>
                  <th>Сектор</th>
                  <th>W1</th>
                  <th>W2</th>
                  <th>W3</th>
                  <th>W4</th>
                  <th>Разом</th>
                  <th>BIG</th>
                  <th>Вага</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- ЗВАЖУВАННЯ W1–W4 (загальна таблиця) ----------

  let currentWKey = "W1";
  let weighingsByKey = { W1: [], W2: [], W3: [], W4: [] };
  let teamsBaseForWeigh = []; // список команд з зон: {zone, sector, team}

  function normWeighItem(x) {
    const drawKey = (x.drawKey || x.sectorKey || "").toString().toUpperCase();

    let zoneRaw = x.zone || x.drawZone || (drawKey ? drawKey[0] : "") || "";
    const zone = zoneRaw ? String(zoneRaw).toUpperCase() : "";

    let sector = x.sector ?? x.drawSector ?? null;
    if (!sector && drawKey) {
      const m = drawKey.match(/[A-C](\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n)) sector = n;
      }
    }

    const team   = x.team || x.teamName || "—";
    const count  = x.count  ?? x.c   ?? x.qty ?? x.fish ?? null;
    const weight = x.weight ?? x.kg  ?? x.w   ?? null;

    return { zone, sector, team, count, weight };
  }

  function renderWeighings() {
    if (!weighTableBody) return;

    // 1) базові рядки з команд (зон/секторів), навіть якщо немає зважувань
    const base = new Map();
    teamsBaseForWeigh.forEach((t) => {
      const key = `${t.zone}|${t.sector}`;
      base.set(key, {
        zone:   t.zone,
        sector: t.sector,
        team:   t.team,
        count:  null,
        weight: null
      });
    });

    // 2) поверх додаємо фактичні зважування для поточного W
    const listRaw = weighingsByKey[currentWKey] || [];
    listRaw.forEach((w) => {
      const n = normWeighItem(w);
      const key = `${n.zone}|${n.sector}`;
      const item = base.get(key) || {
        zone: n.zone,
        sector: n.sector,
        team: n.team,
        count: null,
        weight: null
      };
      item.team   = n.team || item.team;
      item.count  = n.count;
      item.weight = n.weight;
      base.set(key, item);
    });

    const arr = Array.from(base.values());

    if (!arr.length) {
      weighTableBody.innerHTML =
        `<tr><td colspan="4">Для ${currentWKey} ще немає зважувань і команд.</td></tr>`;
      return;
    }

    // сортуємо: зона A/B/C → сектор 1..8
    arr.sort((a, b) => {
      const zr = zoneRank(a.zone) - zoneRank(b.zone);
      if (zr) return zr;
      const sa = Number.isFinite(a.sector) ? a.sector : 999;
      const sb = Number.isFinite(b.sector) ? b.sector : 999;
      if (sa !== sb) return sa - sb;
      return (a.team || "").localeCompare(b.team || "", "uk");
    });

    weighTableBody.innerHTML = arr.map((row) => `
      <tr>
        <td>${fmt(row.sector)}</td>
        <td class="team-col">${fmt(row.team)}</td>
        <td>${fmt(row.zone)}</td>
        <td>${fmtW({ count: row.count, weight: row.weight })}</td>
      </tr>
    `).join("");
  }

  // клік по кнопках W1–W4
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-w-key]");
    if (!btn) return;
    const key = btn.getAttribute("data-w-key");
    if (!key) return;

    currentWKey = key;

    // підсвітити активну кнопку
    if (wFilterWrap) {
      wFilterWrap.querySelectorAll("[data-w-key]").forEach((b) => {
        b.classList.toggle("btn--accent", b === btn);
        b.classList.toggle("btn--ghost", b !== btn);
      });
    }

    renderWeighings();
  });

  // ---- Підписки: settings/app -> activeKey -> stageResults/{docId} ----
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

  // fallback: з масиву teams робимо "порожні" зони/total
  function buildFallbackFromTeams(teamsRaw) {
    const teams = Array.isArray(teamsRaw) ? teamsRaw : [];
    const zones = { A: [], B: [], C: [] };
    const total = [];

    teams.forEach((t) => {
      const drawKey = (t.drawKey || t.sector || "").toString().toUpperCase();

      let zone = (t.drawZone || t.zone || (drawKey ? drawKey[0] : "") || "").toUpperCase();
      if (!["A","B","C"].includes(zone)) return;

      let sector = t.drawSector ?? t.sector ?? null;
      if (!sector && drawKey) {
        const m = drawKey.match(/[A-C](\d+)/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (Number.isFinite(n)) sector = n;
        }
      }

      const base = {
        place: "—",
        team: t.teamName || t.team || "—",
        zone,
        sector,
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

        // Якщо зважування ще нічого не записали, але є команди — показуємо fallback
        if (!hasZoneData && !totalData.length && teamsRaw.length) {
          const fb = buildFallbackFromTeams(teamsRaw);
          zonesData = fb.zones;
          totalData = fb.total;
        }

        // 1) рендер зон (підсумки)
        renderZones(zonesData);

        // 2) підготовка бази команд для "Зважування по етапу"
        teamsBaseForWeigh = [];
        ["A","B","C"].forEach((z) => {
          const list = (zonesData[z] || []).map(normZoneItem);
          list.forEach((row) => {
            if (!["A","B","C"].includes(row.zone)) return;
            if (!row.sector) return;
            teamsBaseForWeigh.push({
              zone:   row.zone,
              sector: row.sector,
              team:   row.team
            });
          });
        });

        // 3) зчитуємо публічні зважування зі stageResults
        const wSrc = data.weighings || data.W || {};
        weighingsByKey = {
          W1: Array.isArray(wSrc.W1) ? wSrc.W1 : [],
          W2: Array.isArray(wSrc.W2) ? wSrc.W2 : [],
          W3: Array.isArray(wSrc.W3) ? wSrc.W3 : [],
          W4: Array.isArray(wSrc.W4) ? wSrc.W4 : []
        };

        // 4) оновлюємо таблицю зважувань
        renderWeighings();

        showContent();
      },
      (err) => {
        console.error(err);
        showError("Помилка читання Live (stageResults).");
      }
    );
  }

  // settings/app — публічний
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
})();
