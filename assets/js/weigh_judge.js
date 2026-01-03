// assets/js/weigh_judge.js
// STOLAR CARP • Суддя • Зважування (таблиця як на LIVE + додавання кількох риб)
// - bind тільки zone (A/B/C) через ?zone=A + localStorage
// - активний етап беремо з settings/app (activeCompetitionId/activeStageId/activeKey)
// - команди беремо з registrations (confirmed) + drawZone/drawSector
// - ваги пишемо в weighings (LIVE-сумісно): compId, stageId, weighNo, teamId, weights:[...]
// - + додає поле риби, × видаляє
// - OK створює/оновлює документ (merge)

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

      if(weighCard && weighCard.style.display !== "none" && zone){
        try{ await openZone(false); } catch(e){
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
      // ВАЖЛИВО: перемикання дозволяємо до currentW (як у тебе було)
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
        weighCache[t.teamId][w] = await loadWeighing(t.teamId, w);
      }
    }
  }

  // ---------- TABLE like LIVE ----------
  function injectStyles(){
    if(document.getElementById("wjLiveTableStyles")) return;

    const css = `
      <style id="wjLiveTableStyles">
        table.wj{
  min-width:560px;
  font-size:14px;
}
table.wj th, table.wj td{
  padding:8px 10px;
}
.wj-col-team{ width:260px; }
.wj-col-w{ width:110px; }

.wj-pill{
  width:44px;
  height:44px;
  font-size:13px;
}

.wj-fishes{
  display:flex;
  flex-direction:row;   /* 🔴 жорстко ряд */
  flex-wrap:nowrap;     /* 🔴 заборона стовпця */
  gap:4px;
  overflow-x:auto;      /* якщо не влазить */
  -webkit-overflow-scrolling:touch;
}

.wj-inp{
  width:40px;          /* компактно */
  height:20px;         /* 🔴 клітинка 20 */
  padding:0;
  font-size:8px;       /* 🔴 шрифт 8 */
  line-height:20px;
  text-align:center;
  border-radius:6px;
}

.wj-miniBtn{
  width:20px;
  height:20px;
  font-size:10px;
  border-radius:6px;
  padding:0;
}

.wj-editor{
  margin-top:4px;
  gap:4px;
}

.wj-actions{
  gap:6px;
}

.wj-actions .btn{
  padding:4px 8px;
  font-size:11px;
}
.wj-hint{ font-size:.8rem; }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  function cellSummary(doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    if(!weights.length) return `<span class="muted">—</span>`;
    const total = round2(weights.reduce((a,b)=>a+b,0)).toFixed(2);
    const c = weights.length;
    return `<div class="wj-sum">${esc(total)}</div><div class="wj-sub">🐟 ${c}</div>`;
  }

  function editorCell(team, doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    const safe = (weights.length ? weights : [""]); // мінімум 1 інпут

    return `
      <div class="wj-editor" data-team="${esc(team.teamId)}">
        <div class="wj-fishes">
          ${safe.map((v,idx)=>`
            <div class="wj-fish">
              <input class="inp wj-inp" inputmode="decimal" placeholder="вага"
                value="${esc(v === "" ? "" : Number(v).toFixed(2))}" data-i="${idx}">
              <button class="wj-miniBtn wj-del" type="button" title="Видалити" ${safe.length<=1 ? "disabled":""}>×</button>
            </div>
          `).join("")}
        </div>

        <div class="wj-actions">
          <button class="wj-miniBtn wj-add" type="button" title="Додати рибу">+</button>
          <button class="btn btn--primary wj-save" type="button">OK</button>
        </div>

        <div class="muted wj-hint"></div>
      </div>
    `;
  }

  function renderTable(teams){
    injectStyles();

    if(!teamsBox) return;

    if(!teams.length){
      teamsBox.innerHTML = `<div class="muted">Нема команд у зоні ${esc(zone)} (перевір confirmed + drawZone/drawSector).</div>`;
      return;
    }

    const html = `
      <div class="wj-wrapTable">
        <div class="wj-scroll">
          <table class="wj">
            <thead>
              <tr>
                <th class="wj-col-sector">Зона</th>
                <th class="wj-col-team">Команда</th>
                ${[1,2,3,4].map(n=>`<th class="wj-col-w">W${n}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${teams.map(t=>{
                const cells = [1,2,3,4].map(n=>{
  const doc = weighCache?.[t.teamId]?.[n] || null;
  return `<td class="wj-col-w">${cellSummary(doc)}</td>`;
}).join("");

const activeDoc = weighCache?.[t.teamId]?.[viewW] || null;

return `
  <tr>
    <td class="wj-col-sector"><span class="wj-pill">${esc(zone)}${esc(t.sector)}</span></td>

    <td class="wj-col-team">
      <div class="wj-teamName">${esc(t.teamName)}</div>
      ${editorCell(t, activeDoc)}
    </td>

    ${cells}
  </tr>
`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    teamsBox.innerHTML = html;

    // events in editors
    teamsBox.querySelectorAll(".wj-editor").forEach(ed=>{
      const teamId = ed.getAttribute("data-team");
      const hint = ed.querySelector(".wj-hint");
      const fishes = ed.querySelector(".wj-fishes");

      function refreshDel(){
        const dels = ed.querySelectorAll(".wj-del");
        if(dels.length === 1) dels[0].disabled = true;
        else dels.forEach(b=> b.disabled = false);
      }

      ed.querySelector(".wj-add")?.addEventListener("click", ()=>{
        const wrap = document.createElement("div");
        wrap.className = "wj-fish";
        wrap.innerHTML = `
          <input class="inp wj-inp" inputmode="decimal" placeholder="вага" value="">
          <button class="wj-miniBtn wj-del" type="button" title="Видалити">×</button>
        `;
        fishes.appendChild(wrap);
        if(hint) hint.textContent = "";
        refreshDel();
      });

      ed.addEventListener("click", (e)=>{
        const btn = e.target;
        if(btn && btn.classList && btn.classList.contains("wj-del")){
          const row = btn.closest(".wj-fish");
          if(row){
            row.remove();
            if(hint) hint.textContent = "";
            refreshDel();
          }
        }
      });

      ed.querySelector(".wj-save")?.addEventListener("click", async ()=>{
        try{
          if(hint){
            hint.textContent = "Збереження…";
            hint.className = "muted wj-hint";
          }

          const team = (window.__scTeamsMap || {})[teamId];
          if(!team) throw new Error("Команда не знайдена у списку.");

          const raw = Array.from(ed.querySelectorAll(".wj-inp")).map(i => i.value);

          await saveWeighingWeights(team, viewW, raw);

          const d = weighCache?.[teamId]?.[viewW] || {};
          if(hint){
            hint.textContent = `✅ OK: 🐟 ${d.fishCount||0} • кг ${(d.totalWeightKg||0).toFixed(2)} • Big ${(d.bigFishKg||0).toFixed(2)}`;
            hint.className = "muted wj-hint ok";
          }

          // авто-прогрес W, якщо всі здали
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

        }catch(err){
          console.error(err);
          if(hint){
            hint.textContent = "❌ " + (err?.message || err);
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
          if(b.n > currentW) return; // як домовлялись: тільки до поточного
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
