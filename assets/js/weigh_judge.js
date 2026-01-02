// assets/js/weigh_judge.js
// STOLAR CARP • Суддя • Зважування (таблиця як Google Sheet + кілька риб)
// - bind тільки zone (A/B/C) через ?zone=A + localStorage
// - активний етап беремо з settings/app
// - команди беремо з registrations (confirmed) + drawZone/drawSector
// - ваги пишемо в weighings у LIVE-сумісному форматі: compId, stageId, weighNo, teamId, weights:[...]
// - кнопка + додає поле риби, × видаляє
// - OK створює або оновлює документ (merge)

(function(){
  "use strict";

  const LS_KEY = "sc_judge_zone_v1";
  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const DEFAULT_MAX_W = 4;

  // ===== UI refs =====
  const zoneTitle = document.getElementById("zoneTitle");
  const statusEl  = document.getElementById("status");
  const bindInfo  = document.getElementById("bindInfo");
  const msgEl     = document.getElementById("msg");
  const authPill  = document.getElementById("authPill");

  const btnOpen   = document.getElementById("btnOpen");
  const btnReset  = document.getElementById("btnReset");
  const btnSaveHint = document.getElementById("btnSaveHint");

  const weighCard = document.getElementById("weighCard");
  const wMsgEl = document.getElementById("wMsg");
  const curWEl = document.getElementById("curW");
  const teamsCountEl = document.getElementById("teamsCount");
  const teamsBox = document.getElementById("teamsBox");
  const netBadge = document.getElementById("netBadge");

  const wBtns = [
    { n:1, el: document.getElementById("w1") },
    { n:2, el: document.getElementById("w2") },
    { n:3, el: document.getElementById("w3") },
    { n:4, el: document.getElementById("w4") },
  ];

  // ===== Firebase =====
  let db = null;
  let me = null;

  // ===== Active stage =====
  let compId = "";
  let stageId = "";
  let activeKey = "";
  let zone = "";

  let maxW = DEFAULT_MAX_W;
  let currentW = 1;
  let viewW = 1;

  // cache: weighings[teamId][wNo] = doc
  const weighCache = Object.create(null);

  // ---------- helpers ----------
  function setMsg(t, ok=true){
    if(!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok":"err") : "");
  }
  function setWMsg(t, ok=true){
    if(!wMsgEl) return;
    wMsgEl.textContent = t || "";
    wMsgEl.className = "muted " + (t ? (ok ? "ok":"err") : "");
  }
  function norm(v){ return String(v ?? "").trim(); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

  async function waitFirebase(){
    for(let i=0;i<140;i++){
      if(window.scDb && window.scAuth && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb.");
  }

  async function requireJudgeOrAdmin(user){
    if(!user) return false;
    if(user.uid === ADMIN_UID) return true;
    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data()||{}).role : "") || "";
    return role === "judge" || role === "admin";
  }

  // ---------- bind zone ----------
  function readBindZone(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  }
  function writeBindZone(z){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ zone:z })); }catch{}
  }
  function clearBindZone(){
    try{ localStorage.removeItem(LS_KEY); }catch{}
  }
  function zoneFromUrl(){
    const p = new URLSearchParams(location.search);
    return norm((p.get("zone")||"").toUpperCase());
  }

  // ---------- active from settings/app ----------
  function computeActiveKey(cId, sId){
    if(!cId) return "";
    return `${cId}||${sId || "stage-1"}`;
  }

  let unsubApp = null;
  function watchApp(){
    if(unsubApp) unsubApp();
    unsubApp = db.collection("settings").doc("app").onSnapshot(async (snap)=>{
      const app = snap.exists ? (snap.data()||{}) : {};

      compId  = norm(app.activeCompetitionId || app.activeCompetition || app.competitionId || "");
      stageId = norm(app.activeStageId || app.stageId || "") || "stage-1";
      activeKey = norm(app.activeKey || "") || computeActiveKey(compId, stageId);

      renderBindInfo();

      // якщо вже відкрито — оновимо
      if(weighCard && weighCard.style.display !== "none" && zone){
        try{
          await openZone(false); // без зайвих msg
        }catch(e){
          setWMsg("Помилка оновлення активного етапу: " + (e?.message || e), false);
        }
      }
    }, (err)=>{
      console.error(err);
      if(statusEl) statusEl.textContent = "❌ Не читається settings/app.";
    });
  }

  function renderBindInfo(){
    const z = zone || "—";
    const c = compId || "—";
    const s = stageId || "—";
    const ak = activeKey || "—";
    if(zoneTitle) zoneTitle.textContent = zone ? `Зона ${zone}` : "Зона —";
    if(bindInfo) bindInfo.textContent = `zone=${z} | compId=${c} | stageId=${s} | activeKey=${ak}`;
  }

  // ---------- weighing settings per activeKey ----------
  function settingsDocId(){
    return `weighing_${activeKey}`;
  }

  async function getOrCreateWeighingSettings(){
    if(!activeKey) throw new Error("Нема activeKey. Перевір settings/app.");
    const ref = db.collection("settings").doc(settingsDocId());
    const snap = await ref.get();
    if(snap.exists) return { ref, data:(snap.data()||{}) };

    const init = {
      activeKey,
      compId,
      stageId,
      maxW: DEFAULT_MAX_W,
      current: { A:1, B:1, C:1 },
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(init, { merge:true });
    return { ref, data:init };
  }

  function getCurrentWForZone(d){
    const cur = d.current || {};
    const mW = Number(d.maxW || DEFAULT_MAX_W);
    const w = Number(cur[zone] || 1);
    return Math.min(Math.max(w,1), mW);
  }

  async function setCurrentWForZone(nextW){
    const ref = db.collection("settings").doc(settingsDocId());
    await db.runTransaction(async (tx)=>{
      const snap = await tx.get(ref);
      const d = snap.data() || {};
      const mW = Number(d.maxW || DEFAULT_MAX_W);
      const cur = Object.assign({A:1,B:1,C:1}, d.current || {});
      const safe = Math.min(Math.max(Number(nextW||1),1), mW);
      cur[zone] = safe;
      tx.set(ref, {
        current: cur,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    });
  }

  function updateWButtons(){
    if(curWEl) curWEl.textContent = `W${currentW}`;
    wBtns.forEach(b=>{
      if(!b.el) return;
      b.el.classList.toggle("isActive", b.n === viewW);
      // ✅ дозволяємо перемикати тільки до поточного W
      b.el.disabled = (b.n > currentW);
    });
  }

  // ---------- teams (registrations) ----------
  function parseZoneFromReg(d){
    const z1 = norm(d.drawZone || "").toUpperCase();
    if(z1) return z1;
    const k = norm(d.drawKey || "").toUpperCase();
    if(k && /^[ABC]\d+/.test(k)) return k[0];
    return "";
  }
  function parseSectorFromReg(d){
    const s1 = Number(d.drawSector || 0);
    if(s1) return s1;
    const k = norm(d.drawKey || "").toUpperCase();
    const n = parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? n : 0;
  }

  async function loadTeamsForZone(){
    if(!compId || !stageId) throw new Error("Нема compId/stageId з settings/app.");

    const snap = await db.collection("registrations")
      .where("competitionId","==",compId)
      .where("stageId","==",stageId)
      .where("status","==","confirmed")
      .get();

    const rows = [];
    snap.forEach(doc=>{
      const d = doc.data() || {};
      const z = parseZoneFromReg(d);
      if(z !== zone) return;

      const teamId = norm(d.teamId || "");
      if(!teamId) return;

      rows.push({
        teamId,
        teamName: norm(d.teamName || d.team || "—"),
        sector: parseSectorFromReg(d),
      });
    });

    rows.sort((a,b)=> (a.sector||0)-(b.sector||0) || (a.teamName||"").localeCompare(b.teamName||"", "uk"));
    return rows;
  }

  // ---------- weighings ----------
  function weighingDocId(teamId, wNo){
    // якщо LIVE очікує саме так — лишаємо
    return `${compId}||${stageId}||W${Number(wNo)}||${teamId}`;
  }

  async function loadWeighing(teamId, wNo){
    const id = weighingDocId(teamId, wNo);
    const snap = await db.collection("weighings").doc(id).get();
    return snap.exists ? (snap.data()||null) : null;
  }

  function toNum(val){
    const s = String(val ?? "").trim().replace(",", ".");
    if(!s) return NaN;
    return Number(s);
  }
  function round2(x){ return Math.round(x*100)/100; }

  function cleanWeights(rawArr){
    const arr = (Array.isArray(rawArr) ? rawArr : [])
      .map(toNum)
      .map(n => Number.isFinite(n) ? round2(Math.max(0, Math.min(n, 999.99))) : NaN)
      .filter(n => Number.isFinite(n) && n > 0);
    return arr;
  }

  function calcFromWeights(weights){
    const fishCount = weights.length;
    const total = round2(weights.reduce((a,b)=>a+b,0));
    const big = fishCount ? Math.max(...weights) : 0;
    return { fishCount, totalWeightKg: total, bigFishKg: round2(big) };
  }

  async function saveWeighingWeights(team, wNo, weightsRaw){
    const id = weighingDocId(team.teamId, wNo);
    const ts = window.firebase.firestore.FieldValue.serverTimestamp();

    const weights = cleanWeights(weightsRaw);
    const calc = calcFromWeights(weights);

    await db.collection("weighings").doc(id).set({
      // LIVE fields
      compId,
      stageId,
      weighNo: Number(wNo),
      teamId: team.teamId,
      weights,

      // extra
      zone,
      sector: Number(team.sector||0),
      teamName: team.teamName || "",
      fishCount: calc.fishCount,
      totalWeightKg: calc.totalWeightKg,
      bigFishKg: calc.bigFishKg,
      status: "submitted",
      updatedAt: ts,
      updatedBy: me.uid
    }, { merge:true });

    weighCache[team.teamId] = weighCache[team.teamId] || {};
    weighCache[team.teamId][wNo] = {
      weights,
      fishCount: calc.fishCount,
      totalWeightKg: calc.totalWeightKg,
      bigFishKg: calc.bigFishKg,
      status:"submitted"
    };
  }

  async function maybeAdvanceAuto(teams){
    if(currentW >= maxW) return false;
    if(!teams.length) return false;

    const wsnap = await db.collection("weighings")
      .where("compId","==",compId)
      .where("stageId","==",stageId)
      .where("weighNo","==",Number(currentW))
      .where("zone","==",zone)
      .where("status","==","submitted")
      .get();

    const got = new Set();
    wsnap.forEach(doc=>{
      const d = doc.data() || {};
      if(d.teamId) got.add(String(d.teamId));
    });

    for(const t of teams){
      if(!got.has(String(t.teamId))) return false;
    }

    await setCurrentWForZone(currentW + 1);
    return true;
  }

  // ---------- preload ----------
  async function preloadWeighings(teams){
    for(const t of teams){
      weighCache[t.teamId] = weighCache[t.teamId] || {};
      for(let w=1; w<=4; w++){
        if(weighCache[t.teamId].hasOwnProperty(w)) continue;
        weighCache[t.teamId][w] = await loadWeighing(t.teamId, w);
      }
    }
  }

  // ---------- TABLE (Google Sheet style) ----------
  function cellSummary(doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    if(!weights.length) return `<span class="muted">—</span>`;
    const total = round2(weights.reduce((a,b)=>a+b,0)).toFixed(2);
    const c = weights.length;
    return `<b>${esc(total)}</b><div class="muted" style="font-size:.75rem;margin-top:2px;">🐟 ${c}</div>`;
  }

  function activeCellEditor(team, doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    const safe = (weights.length ? weights : [""]); // мін 1 поле

    return `
      <div class="wj-editor" data-team="${esc(team.teamId)}">
        <div class="wj-fish">
          ${safe.map((v)=>`
            <div class="wj-fishrow">
              <input class="inp wj-inp" inputmode="decimal" placeholder="Вага (кг)" value="${esc(v === "" ? "" : Number(v).toFixed(2))}">
              <button class="wbtn wj-del" type="button" title="Видалити" ${safe.length<=1 ? "disabled":""}>×</button>
            </div>
          `).join("")}
        </div>

        <div class="wj-controls">
          <button class="wbtn wj-add" type="button">+</button>
          <button class="btn btn--primary wj-save" type="button">OK</button>
        </div>

        <div class="muted wj-hint" style="margin-top:6px;font-size:.85rem;"></div>
      </div>
    `;
  }

  function injectTableStyles(){
    if(document.getElementById("wjTableStyles")) return;

    const css = `
      <style id="wjTableStyles">
        .wj-tableWrap{ overflow:auto; border:1px solid rgba(148,163,184,.18); border-radius:14px; }
        table.wj-table{ width:100%; border-collapse:separate; border-spacing:0; min-width:760px; }
        .wj-table th, .wj-table td{
          padding:10px 12px;
          border-bottom:1px solid rgba(148,163,184,.12);
          vertical-align:top;
        }
        .wj-table thead th{
          position:sticky; top:0;
          background:rgba(2,6,23,.92);
          backdrop-filter: blur(8px);
          z-index:2;
          border-bottom:1px solid rgba(148,163,184,.22);
          font-weight:900;
        }
        .wj-table th:first-child, .wj-table td:first-child{ position:sticky; left:0; z-index:1; background:rgba(2,6,23,.92); }
        .wj-table th:nth-child(2), .wj-table td:nth-child(2){ position:sticky; left:110px; z-index:1; background:rgba(2,6,23,.92); }
        .wj-table th:first-child{ left:0; }
        .wj-table th:nth-child(2){ left:110px; }

        .wj-sector{ width:110px; white-space:nowrap; }
        .wj-team{ width:260px; }
        .wj-wcol{ width:170px; text-align:center; }

        .wj-pill{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px;
          border:1px solid rgba(148,163,184,.25); background:rgba(2,6,23,.35); color:#e5e7eb; font-weight:900; }
        .wj-teamName{ font-weight:900; }

        .wbtn{
          border:1px solid rgba(148,163,184,.25);
          background:rgba(2,6,23,.25);
          color:#e5e7eb;
          border-radius:12px;
          padding:10px 12px;
          font-weight:900;
          cursor:pointer;
          user-select:none;
        }
        .wbtn:disabled{ opacity:.45; cursor:not-allowed; }

        .wj-editor{ min-width:160px; }
        .wj-fishrow{ display:flex; gap:8px; align-items:center; justify-content:center; margin-bottom:8px; }
        .wj-inp{ max-width:140px; text-align:center; }
        .wj-controls{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
        @media (max-width:720px){
          table.wj-table{ min-width:720px; }
          .wj-team{ width:220px; }
          .wj-wcol{ width:160px; }
        }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  function renderTable(teams){
    if(!teamsBox) return;
    injectTableStyles();

    if(!teams.length){
      teamsBox.innerHTML = `<div class="muted">Нема команд у зоні ${esc(zone)} (перевір confirmed + drawZone/drawSector).</div>`;
      return;
    }

    const table = `
      <div class="wj-tableWrap">
        <table class="wj-table">
          <thead>
            <tr>
              <th class="wj-sector">Сектор</th>
              <th class="wj-team">Команда</th>
              ${[1,2,3,4].map(n=>`<th class="wj-wcol">W${n}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${teams.map(t=>{
              const tRow = [1,2,3,4].map(n=>{
                const doc = weighCache?.[t.teamId]?.[n] || null;
                if(n === viewW){
                  return `<td class="wj-wcol">${activeCellEditor(t, doc)}</td>`;
                }
                return `<td class="wj-wcol">${cellSummary(doc)}</td>`;
              }).join("");

              return `
                <tr>
                  <td class="wj-sector"><span class="wj-pill">${esc(zone)}${esc(t.sector)}</span></td>
                  <td class="wj-team"><div class="wj-teamName">${esc(t.teamName)}</div></td>
                  ${tRow}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    teamsBox.innerHTML = table;

    // events in active editors
    teamsBox.querySelectorAll(".wj-editor").forEach(editor=>{
      const teamId = editor.getAttribute("data-team");
      const hint = editor.querySelector(".wj-hint");
      const fishWrap = editor.querySelector(".wj-fish");

      function refreshDel(){
        const dels = editor.querySelectorAll(".wj-del");
        if(dels.length === 1) dels[0].disabled = true;
        else dels.forEach(b=> b.disabled = false);
      }

      editor.querySelector(".wj-add")?.addEventListener("click", ()=>{
        const row = document.createElement("div");
        row.className = "wj-fishrow";
        row.innerHTML = `
          <input class="inp wj-inp" inputmode="decimal" placeholder="Вага (кг)" value="">
          <button class="wbtn wj-del" type="button" title="Видалити">×</button>
        `;
        fishWrap.appendChild(row);
        refreshDel();
        if(hint) hint.textContent = "";
      });

      editor.addEventListener("click", (e)=>{
        const btn = e.target;
        if(btn && btn.classList && btn.classList.contains("wj-del")){
          const row = btn.closest(".wj-fishrow");
          if(row){
            row.remove();
            refreshDel();
            if(hint) hint.textContent = "";
          }
        }
      });

      editor.querySelector(".wj-save")?.addEventListener("click", async ()=>{
        try{
          if(hint){
            hint.textContent = "Збереження…";
            hint.className = "muted wj-hint";
          }

          const team = (window.__scTeamsMap || {})[teamId];
          if(!team) throw new Error("Команда не знайдена у списку.");

          const raw = Array.from(editor.querySelectorAll(".wj-inp")).map(i => i.value);

          await saveWeighingWeights(team, viewW, raw);

          const d = weighCache?.[teamId]?.[viewW] || {};
          if(hint){
            hint.textContent = `✅ OK: 🐟 ${d.fishCount||0} • кг ${(d.totalWeightKg||0).toFixed(2)} • Big ${(d.bigFishKg||0).toFixed(2)}`;
            hint.className = "muted wj-hint ok";
          }

          const teamsAll = window.__scTeamsArr || [];
          const advanced = await maybeAdvanceAuto(teamsAll);
          if(advanced){
            const s = await getOrCreateWeighingSettings();
            maxW = Number(s.data.maxW || DEFAULT_MAX_W);
            currentW = getCurrentWForZone(s.data);
            if(viewW > currentW) viewW = currentW;
            updateWButtons();
            setWMsg(`Авто: всі здані → переключив на W${currentW}`, true);
          }

          await preloadWeighings(window.__scTeamsArr || []);
          renderTable(window.__scTeamsArr || []);
          setWMsg("✅ Збережено у Firestore.", true);

        }catch(e){
          console.error(e);
          if(hint){
            hint.textContent = "❌ " + (e?.message || e);
            hint.className = "muted wj-hint err";
          }
          setWMsg("❌ Помилка збереження.", false);
        }
      });

      refreshDel();
    });
  }

  // ---------- open zone ----------
  async function openZone(withMsgs=true){
    if(!zone){
      if(withMsgs) setMsg("Нема зони. Відкрий посилання типу ?zone=A", false);
      return;
    }
    if(!compId || !stageId || !activeKey){
      if(withMsgs) setMsg("Нема активного етапу (settings/app).", false);
      return;
    }

    const s = await getOrCreateWeighingSettings();
    maxW = Number(s.data.maxW || DEFAULT_MAX_W);
    currentW = getCurrentWForZone(s.data);

    // ✅ старт завжди W1, але перемикати можна до currentW
    if(!viewW) viewW = 1;
    if(viewW > currentW) viewW = currentW;

    updateWButtons();

    const teams = await loadTeamsForZone();
    window.__scTeamsArr = teams;
    window.__scTeamsMap = teams.reduce((m,x)=> (m[x.teamId]=x, m), {});

    if(teamsCountEl) teamsCountEl.textContent = `Команд: ${teams.length}`;
    if(statusEl) statusEl.textContent = teams.length ? "✅ Зона відкрита." : "⚠️ Команди не знайдені (confirmed + drawZone/drawSector).";

    if(weighCard) weighCard.style.display = "block";
    if(netBadge) netBadge.style.display = "inline-flex";

    await preloadWeighings(teams);
    renderTable(teams);

    setWMsg(`Активна колонка: W${viewW}. Поточне: W${currentW}.`, true);
  }

  // ---------- init ----------
  (async function init(){
    try{
      await waitFirebase();
      db = window.scDb;
      const auth = window.scAuth;

      // zone from url or storage
      const zUrl = zoneFromUrl();
      if(zUrl) writeBindZone(zUrl);

      const bind = readBindZone();
      zone = bind?.zone ? String(bind.zone).toUpperCase() : "";

      renderBindInfo();

      auth.onAuthStateChanged(async (user)=>{
        if(!user){
          if(authPill) authPill.textContent = "auth: ❌ увійди (суддя)";
          if(statusEl) statusEl.textContent = "Потрібен вхід судді/адміна.";
          if(weighCard) weighCard.style.display = "none";
          return;
        }

        me = user;
        if(authPill) authPill.textContent = "auth: ✅ " + (user.email || user.uid);

        const ok = await requireJudgeOrAdmin(user);
        if(!ok){
          if(statusEl) statusEl.textContent = "⛔ Нема доступу (потрібна роль judge/admin).";
          if(weighCard) weighCard.style.display = "none";
          return;
        }

        if(statusEl) statusEl.textContent = "✅ Доступ судді підтверджено.";
        setMsg("Готово. Натисни «Відкрити мою зону».", true);

        watchApp();
      });

      if(btnOpen){
        btnOpen.addEventListener("click", async ()=>{
          try{
            if(!zone){
              const z = zoneFromUrl();
              if(z) { zone = z; writeBindZone(z); }
            }
            if(!zone){
              setMsg("Нема зони (?zone=A).", false);
              return;
            }
            setMsg("Відкриваю…", true);
            await openZone(true);
            renderBindInfo();
            setMsg("Зона відкрита.", true);
          }catch(e){
            setMsg("Помилка: " + (e?.message || e), false);
          }
        });
      }

      if(btnReset){
        btnReset.addEventListener("click", ()=>{
          clearBindZone();
          zone = "";
          renderBindInfo();
          if(weighCard) weighCard.style.display = "none";
          setMsg("Прив’язку скинуто.", true);
        });
      }

      if(btnSaveHint){
        btnSaveHint.addEventListener("click", ()=>{
          alert("Android/Chrome: ⋮ → «Додати на головний екран». iPhone/Safari: Share → Add to Home Screen.");
        });
      }

      // W buttons
      wBtns.forEach(b=>{
        if(!b.el) return;
        b.el.addEventListener("click", async ()=>{
          if(b.n > currentW) return;
          viewW = b.n;
          updateWButtons();
          try{
            const teams = window.__scTeamsArr || await loadTeamsForZone();
            await preloadWeighings(teams);
            renderTable(teams);
            setWMsg(`Активна колонка: W${viewW}`, true);
          }catch(e){
            setWMsg("Помилка перемикання: " + (e?.message || e), false);
          }
        });
      });

    }catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = "❌ init: " + (e?.message || e);
    }
  })();

})();
