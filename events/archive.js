// STOLAR CARP — Архів сезону
// Читає готовий архів: seasonResults/{year}/stages
// Компактні таблиці зон A/B/C для телефону
// ✅ stageId типу season-2026_stage-1 показує як "Етап 1"

(async function(){
  "use strict";

  const $ = id => document.getElementById(id);

  const pageTitle = $("pageTitle");
  const msg = $("msg");
  const stagesList = $("stagesList");
  const resultSection = $("resultSection");
  const stageTitle = $("stageTitle");
  const stageMeta = $("stageMeta");
  const zonesWrap = $("zonesWrap");

  injectCompactArchiveCss();

  try {
    if (window.scReady) await window.scReady;
  } catch (e) {
    if (msg) {
      msg.textContent = "Firebase не ініціалізувався: " + e.message;
      msg.className = "err";
    }
    return;
  }

  const db = window.scDb;

  if (!db) {
    if (msg) {
      msg.textContent = "Firestore не знайдено.";
      msg.className = "err";
    }
    return;
  }

  if (!stagesList) return;

  const params = new URLSearchParams(window.location.search);
  const seasonYear = params.get("year") || "2026";

  if (pageTitle) pageTitle.textContent = `Архів сезону ${seasonYear}`;

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[m]));
  }

  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(v){
    return v === null || v === undefined || v === "" ? "—" : String(v);
  }

  function fmtWeight(v){
    const n = num(v);
    return n > 0 ? n.toFixed(2).replace(/\.?0+$/, "") : "—";
  }

  function fmtW(slot){
    const c = num(slot?.c);
    const w = num(slot?.w);
    if (!c && !w) return "—";
    return `${c}/${fmtWeight(w)}`;
  }

  function stageSortValue(id, data){
    const raw = String(data.stageId || data.stageName || id || "");
    const m = raw.match(/stage-(\d+)|етап\s*(\d+)|(\d+)/i);
    return m ? Number(m[1] || m[2] || m[3]) : 999;
  }

  function stageDisplayName(id, data){
    const savedName = String(data.stageName || "").trim();

    if (savedName && !savedName.includes("season-")) {
      return savedName;
    }

    const raw = String(data.stageId || id || "");
    const m = raw.match(/stage-(\d+)|етап\s*(\d+)|(\d+)/i);

    if (m) {
      return `Етап ${Number(m[1] || m[2] || m[3])}`;
    }

    return savedName || raw || "Етап";
  }

  async function loadStages(){
    try {
      msg.textContent = "Завантажую архів…";
      msg.className = "muted";

      const snap = await db
        .collection("seasonResults")
        .doc(seasonYear)
        .collection("stages")
        .get();

      if (snap.empty) {
        msg.textContent = `Немає архівованих етапів сезону ${seasonYear}.`;
        return;
      }

      const stages = [];

      snap.forEach(doc => {
        stages.push({
          id: doc.id,
          data: doc.data() || {}
        });
      });

      stages.sort((a,b) => stageSortValue(a.id, a.data) - stageSortValue(b.id, b.data));

      msg.textContent = `Знайдено етапів: ${stages.length}`;
      msg.className = "ok";

      stagesList.innerHTML = stages.map(x => {
        const d = x.data || {};
        const summary = d.summary || {};
        const name = stageDisplayName(x.id, d);

        return `
          <button class="stage-btn" type="button" data-stage="${esc(x.id)}">
            <div style="font-size:1rem;font-weight:900;">${esc(name)}</div>
            <div class="muted" style="margin-top:5px;font-size:.85rem;">
              Команд: ${esc(summary.teamsCount || 0)} ·
              Вага: ${fmtWeight(summary.totalWeight)} ·
              BIG: ${fmtWeight(summary.maxBigFish)}
            </div>
          </button>
        `;
      }).join("");

      stagesList.querySelectorAll("[data-stage]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-stage");
          const item = stages.find(x => x.id === id);
          if (item) renderStage(item.id, item.data);
        });
      });

    } catch(e) {
      console.error(e);
      msg.innerHTML = `<span class="err">Помилка читання архіву: ${esc(e.message)}</span>`;
    }
  }

  function renderStage(stageDocId, data){
    const rows = Array.isArray(data.standings) ? data.standings.slice() : [];

    if (!rows.length) {
      zonesWrap.innerHTML = `<div class="archive-card err">У цьому етапі немає standings.</div>`;
      return;
    }

    resultSection.style.display = "block";
    stageTitle.textContent = "Зони A / B / C";
    stageMeta.textContent = `${stageDisplayName(stageDocId, data)} · Команд: ${rows.length}`;

    const zones = { A:[], B:[], C:[] };

    rows.forEach(r => {
      const z = String(r.zone || "").toUpperCase();
      if (zones[z]) zones[z].push(r);
    });

    zonesWrap.innerHTML =
      renderZone("A", zones.A) +
      renderZone("B", zones.B) +
      renderZone("C", zones.C);

    resultSection.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function renderZone(zone, rows){
    const sorted = rows.slice().sort((a,b) => {
      if (num(b.totalWeight) !== num(a.totalWeight)) return num(b.totalWeight) - num(a.totalWeight);
      if (num(b.bigFish) !== num(a.bigFish)) return num(b.bigFish) - num(a.bigFish);
      return num(b.totalCount) - num(a.totalCount);
    });

    const body = sorted.map((r, idx) => {
      const sectorRaw = String(r.sector || "");
      const sector = sectorRaw ? `${zone}${sectorRaw}` : zone;
      const zonePlace = idx + 1;

      return `
        <tr>
          <td class="a-sector">${esc(sector)}</td>
          <td class="a-team">${esc(r.team || "—")}</td>
          <td>${fmtW(r.w1)}</td>
          <td>${fmtW(r.w2)}</td>
          <td>${fmtW(r.w3)}</td>
          <td>${fmtW(r.w4)}</td>
          <td>${fmt(num(r.totalCount) || "—")}</td>
          <td>${fmtWeight(r.bigFish)}</td>
          <td class="a-weight">${fmtWeight(r.totalWeight)}</td>
          <td class="a-place">${zonePlace}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="archive-zone-card">
        <div class="archive-zone-head">
          <h3>Зона ${esc(zone)}</h3>
          <span>команд: ${sorted.length}</span>
        </div>

        <div class="archive-table-wrap">
          <table class="archive-compact-table">
            <thead>
              <tr>
                <th>З</th>
                <th>Команда</th>
                <th>W1</th>
                <th>W2</th>
                <th>W3</th>
                <th>W4</th>
                <th>Р</th>
                <th>BIG</th>
                <th>кг</th>
                <th>М</th>
              </tr>
            </thead>
            <tbody>
              ${body || `<tr><td colspan="10">Немає команд у зоні ${esc(zone)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function injectCompactArchiveCss(){
    if (document.getElementById("archiveCompactCss")) return;

    const style = document.createElement("style");
    style.id = "archiveCompactCss";
    style.textContent = `
      .archive-zone-card{
        margin:14px 0;
        padding:10px;
        border-radius:18px;
        border:1px solid rgba(148,163,184,.22);
        background:#11111a;
      }

      .archive-zone-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:8px;
      }

      .archive-zone-head h3{
        margin:0;
        font-size:clamp(26px,7vw,42px);
        line-height:1;
        font-weight:950;
        color:#f8fafc;
      }

      .archive-zone-head span{
        flex:0 0 auto;
        padding:6px 10px;
        border-radius:999px;
        border:1px solid rgba(148,163,184,.28);
        color:#d1d5db;
        background:#111827;
        font-size:.78rem;
        font-weight:800;
      }

      .archive-table-wrap{
        width:100%;
        overflow:visible;
      }

      .archive-compact-table{
        width:100%;
        min-width:0 !important;
        table-layout:fixed;
        border-collapse:collapse;
        font-size:9px;
        line-height:1.05;
      }

      .archive-compact-table th,
      .archive-compact-table td{
        border:1px solid rgba(148,163,184,.20);
        padding:2px 1px;
        text-align:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        height:18px;
        color:#d1d5db;
      }

      .archive-compact-table th{
        background:#191923;
        color:#e5e7eb;
        font-weight:950;
        font-size:9px;
      }

      .archive-compact-table td{
        background:#11111a;
        font-weight:700;
      }

      .archive-compact-table .a-sector{
        color:#facc15;
        font-weight:950;
      }

      .archive-compact-table .a-team{
        text-align:left;
        font-size:8px;
        font-weight:800;
      }

      .archive-compact-table .a-weight,
      .archive-compact-table .a-place{
        color:#f8fafc;
        font-weight:950;
      }

      .archive-compact-table th:nth-child(1),
      .archive-compact-table td:nth-child(1){
        width:25px;
      }

      .archive-compact-table th:nth-child(2),
      .archive-compact-table td:nth-child(2){
        width:auto;
      }

      .archive-compact-table th:nth-child(3),
      .archive-compact-table td:nth-child(3),
      .archive-compact-table th:nth-child(4),
      .archive-compact-table td:nth-child(4),
      .archive-compact-table th:nth-child(5),
      .archive-compact-table td:nth-child(5),
      .archive-compact-table th:nth-child(6),
      .archive-compact-table td:nth-child(6){
        width:46px;
      }

      .archive-compact-table th:nth-child(7),
      .archive-compact-table td:nth-child(7){
        width:28px;
      }

      .archive-compact-table th:nth-child(8),
      .archive-compact-table td:nth-child(8){
        width:34px;
      }

      .archive-compact-table th:nth-child(9),
      .archive-compact-table td:nth-child(9){
        width:42px;
      }

      .archive-compact-table th:nth-child(10),
      .archive-compact-table td:nth-child(10){
        width:25px;
      }

      @media(max-width:420px){
        .archive-zone-card{
          padding:8px;
          border-radius:16px;
        }

        .archive-compact-table{
          font-size:8px;
        }

        .archive-compact-table th,
        .archive-compact-table td{
          height:17px;
          padding:1px;
        }

        .archive-compact-table th{
          font-size:8px;
        }

        .archive-compact-table .a-team{
          font-size:7.4px;
        }

        .archive-compact-table th:nth-child(3),
        .archive-compact-table td:nth-child(3),
        .archive-compact-table th:nth-child(4),
        .archive-compact-table td:nth-child(4),
        .archive-compact-table th:nth-child(5),
        .archive-compact-table td:nth-child(5),
        .archive-compact-table th:nth-child(6),
        .archive-compact-table td:nth-child(6){
          width:42px;
        }

        .archive-compact-table th:nth-child(8),
        .archive-compact-table td:nth-child(8){
          width:32px;
        }

        .archive-compact-table th:nth-child(9),
        .archive-compact-table td:nth-child(9){
          width:40px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  await loadStages();
})();
