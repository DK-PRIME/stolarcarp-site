// STOLAR CARP — Архів сезону
// Читає готовий архів: seasonResults/{year}/stages

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
    return `${c} / ${fmtWeight(w)}`;
  }

  function stageSortValue(id, data){
    const raw = String(data.stageId || id || "");
    const m = raw.match(/(\d+)/);
    return m ? Number(m[1]) : 999;
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
        const name = d.stageName || d.stageId || x.id;

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
    stageMeta.textContent = `${data.stageName || stageDocId} · Команд: ${rows.length}`;

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
          <td>${esc(sector)}</td>
          <td class="team-col">${esc(r.team || "—")}</td>
          <td>${fmtW(r.w1)}</td>
          <td>${fmtW(r.w2)}</td>
          <td>${fmtW(r.w3)}</td>
          <td>${fmtW(r.w4)}</td>
          <td>${fmt(num(r.totalCount) || "—")}</td>
          <td>${fmtWeight(r.bigFish)}</td>
          <td><b>${fmtWeight(r.totalWeight)}</b></td>
          <td><b>${zonePlace}</b></td>
        </tr>
      `;
    }).join("");

    return `
      <div class="live-zone card" style="margin:14px 0;">
        <div class="live-zone-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="margin:0;">Зона ${esc(zone)}</h3>
          <span class="badge badge--warn">команд: ${sorted.length}</span>
        </div>

        <div class="table-wrap" style="overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch;">
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
            <tbody>
              ${body || `<tr><td colspan="10">Немає команд у зоні ${esc(zone)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  await loadStages();
})();
