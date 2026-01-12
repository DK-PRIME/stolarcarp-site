// assets/js/weigh_judge.js
// STOLAR CARP • Judge • Weighings via QR (token-based, anonymous)
// ✅ QR params: ?zone=A&token=SC-...&key=compId||stageId&w=W1
// ✅ does NOT depend on settings/app (no "Нема активного етапу" після завершення)
// ✅ anonymous auth (judge doesn't need team registration)
// ✅ token TTL (72h) + zone restriction
// ✅ writes LIVE-compatible weighings documents

(function(){
  "use strict";

  const DEFAULT_MAX_W = 4;

  // UI refs (має співпасти з твоїм weigh_judge.html)
  const zoneTitle = document.getElementById("zoneTitle");
  const statusEl  = document.getElementById("status");
  const msgEl     = document.getElementById("msg");
  const authPill  = document.getElementById("authPill");
  const bindInfo  = document.getElementById("bindInfo");

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

  // Firebase
  let db = null;
  let auth = null;
  let me = null;

  // context from QR
  let zone = "";
  let token = "";
  let key = "";     // stageResults docId: compId||stageId
  let compId = "";
  let stageId = "";

  let maxW = DEFAULT_MAX_W;
  let currentW = 1;
  let viewW = 1;

  const weighCache = Object.create(null);
  let teamsArr = [];
  let teamsMap = {};

  // ---------- helpers ----------
  function norm(v){ return String(v ?? "").trim(); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
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

  async function waitFirebase(){
    for(let i=0;i<140;i++){
      if(window.scDb && window.scAuth && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb.");
  }

  function readParams(){
    const p = new URLSearchParams(location.search);
    zone  = norm((p.get("zone")||"").toUpperCase());
    token = norm(p.get("token")||"");
    key   = norm(p.get("key")||"");
    const w = norm((p.get("w")||"").toUpperCase());
    if(w === "W2") viewW = 2;
    else if(w === "W3") viewW = 3;
    else if(w === "W4") viewW = 4;
    else viewW = 1;

    if(key.includes("||")){
      const parts = key.split("||");
      compId = norm(parts[0] || "");
      stageId = norm(parts.slice(1).join("||") || "");
    }
  }

  function paintZoneTitle(){
    if(!zoneTitle) return;
    const z = (zone || "").toUpperCase();
    zoneTitle.classList.remove("zone-a","zone-b","zone-c");
    zoneTitle.textContent = z ? `Зона ${z}` : "Зона —";
    if(z==="A") zoneTitle.classList.add("zone-a");
    else if(z==="B") zoneTitle.classList.add("zone-b");
    else if(z==="C") zoneTitle.classList.add("zone-c");
  }

  function renderBindInfo(){
    paintZoneTitle();
    if(bindInfo){
      bindInfo.textContent = `zone=${zone||"—"} | key=${key||"—"} | token=${token? token.slice(0,6)+"…": "—"}`;
    }
  }

  function injectStyles(){
    if(document.getElementById("wjMobileStyles")) return;
    const css = `
      <style id="wjMobileStyles">
        .wj-wrapTable{
          border:1px solid rgba(148,163,184,.18);
          border-radius:16px;
          overflow:hidden;
          background:rgba(2,6,23,.25);
        }
        .wj-scroll{
          overflow-x:auto;
          -webkit-overflow-scrolling:touch;
        }
        table.wj{
          width:100%;
          border-collapse:collapse;
          min-width:720px;
          font-size:12px;
        }
        table.wj th, table.wj td{
          padding:8px 10px;
          border-bottom:1px solid rgba(148,163,184,.12);
          vertical-align:top;
        }
        table.wj thead th{
          background:rgba(2,6,23,.92);
          font-weight:900;
        }
        .wj-col-sector{ width:92px; white-space:nowrap; }
        .wj-col-team{ width:280px; min-width:0; }
        .wj-col-w{ width:110px; text-align:center; min-width:0; }
        .wj-pill{
          display:inline-flex;align-items:center;justify-content:center;
          width:44px;height:44px;border-radius:999px;
          border:1px solid rgba(148,163,184,.25);
          background:rgba(2,6,23,.35);
          font-weight:900;
        }
        .wj-teamName{ font-weight:900; margin-bottom:6px; }

        .wj-fishesScroll{ width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; padding:2px 0 6px; }
        .wj-fishes{ display:flex; flex-wrap:nowrap; gap:6px; width:max-content; }
        .wj-fish{ flex:0 0 auto; display:flex; gap:6px; align-items:center; }
        .wj-inp{ width:62px; height:34px; padding:0 6px; font-size:12px; border-radius:10px; text-align:center; }
        .wj-quick{ width:84px; height:34px; padding:0 6px; font-size:12px; border-radius:10px; text-align:center; }
        .wj-miniBtn{
          width:34px;height:34px;border-radius:10px;
          border:1px solid rgba(148,163,184,.25);
          background:rgba(2,6,23,.25);
          color:#e5e7eb;font-weight:900;font-size:16px;
        }
        .wj-miniBtn:disabled{ opacity:.45; }

        .wj-actions{ display:flex; gap:10px; align-items:center; margin-top:6px; flex-wrap:wrap; }
        .wj-actions .btn{ padding:10px 14px; font-size:13px; border-radius:14px; font-weight:900; }

        .wj-hint{ font-size:12px; margin-top:6px; }
        .wj-sum{ font-weight:900; }
        .wj-sub{ font-size:11px; margin-top:2px; opacity:.75; }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  // ---------- auth & token ----------
  async function ensureAnonAuth(){
    try{
      if(auth.currentUser) return auth.currentUser;
      await auth.signInAnonymously();
      return auth.currentUser;
    }catch(e){
      throw new Error("Не вдалося увійти (анонімно). Перевір Firebase Auth.");
    }
  }

  function isExpired(ts){
    try{
      const d = ts?.toDate ? ts.toDate() : null;
      if(!d) return false;
      return d.getTime() <= Date.now();
    }catch{
      return false;
    }
  }

  async function verifyToken(){
    if(!token) throw new Error("Нема token у QR.");
    if(!key) throw new Error("Нема key у QR (етап).");
    if(!zone || !["A","B","C"].includes(zone)) throw new Error("Неправильна зона у QR.");

    const snap = await db.collection("judgeTokens").doc(token).get();
    if(!snap.exists) throw new Error("Токен не знайдено або видалено.");

    const d = snap.data() || {};
    if(!d.enabled) throw new Error("Токен вимкнено.");
    if(d.key && norm(d.key) !== key) throw new Error("Токен не для цього етапу (key).");
    if(Array.isArray(d.allowedZones) && !d.allowedZones.includes(zone)) throw new Error("Токен не дозволяє цю зону.");
    if(d.expiresAt && isExpired(d.expiresAt)) throw new Error("Термін токена вийшов.");

    // комп/етап можна підтягнути з токена (на випадок якщо в key щось криве)
    if(!compId || !stageId){
      compId = norm(d.compId || compId || "");
      stageId = norm(d.stageId || stageId || "");
    }
    if(!compId || !stageId){
      // останній fallback — парсимо з key
      if(key.includes("||")){
        const parts = key.split("||");
        compId = norm(parts[0]||"");
        stageId = norm(parts.slice(1).join("||")||"");
      }
    }

    return d;
  }

  // ---------- stage teams ----------
  function parseZoneKey(drawKey, drawZone, drawSector){
    const z = (drawZone || (drawKey ? String(drawKey)[0] : "") || "").toUpperCase();
    const n = Number(drawSector || (drawKey ? parseInt(String(drawKey).slice(1),10) : 0) || 0);
    const label = drawKey ? String(drawKey).toUpperCase() : (z && n ? `${z}${n}` : (z || "—"));
    return { z, n, label };
  }

  async function loadTeamsForZone(){
    const snap = await db.collection("stageResults").doc(key).get();
    if(!snap.exists) return [];

    const data = snap.data() || {};
    const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

    const rows = [];
    teamsRaw.forEach(t=>{
      const teamId = norm(t.teamId || "");
      if(!teamId) return;

      const hasDraw = !!(t.drawKey || t.drawZone || t.drawSector);
      if(!hasDraw) return;

      const zinfo = parseZoneKey(t.drawKey, t.drawZone, t.drawSector);
      if(zinfo.z !== zone) return;

      rows.push({
        teamId,
        teamName: norm(t.teamName || t.team || "—"),
        sector: zinfo.n || 0,
        drawKey: zinfo.label
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
    // 0 = нема риби → не пишемо нулі
    return (Array.isArray(rawArr) ? rawArr : [])
      .map(toNum)
      .map(n => Number.isFinite(n) ? round2(Math.max(0, Math.min(n, 999.99))) : NaN)
      .filter(n => Number.isFinite(n) && n > 0);
  }

  function calcFromWeights(weights){
    const fishCount = weights.length;
    const total = round2(weights.reduce((a,b)=>a+b,0));
    const big = fishCount ? Math.max(...weights) : 0;
    return { fishCount, totalWeightKg: total, bigFishKg: round2(big) };
  }

  async function saveWeighingWeights(team, wNo, weightsRaw){
    if(!compId || !stageId) throw new Error("Нема compId/stageId (перевір key/token).");

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

      // extra for live tables
      zone,
      sector: Number(team.sector||0),
      teamName: team.teamName || "",
      fishCount: calc.fishCount,
      totalWeightKg: calc.totalWeightKg,
      bigFishKg: calc.bigFishKg,
      status: "submitted",
      updatedAt: ts,

      // important for token-based access rules
      judgeToken: token,
      updatedBy: me?.uid || ""
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

  async function preloadWeighings(teams){
    for(const t of teams){
      weighCache[t.teamId] = weighCache[t.teamId] || {};
      for(let w=1; w<=DEFAULT_MAX_W; w++){
        weighCache[t.teamId][w] = await loadWeighing(t.teamId, w);
      }
    }
  }

  function updateWButtons(){
    if(curWEl) curWEl.textContent = `W${currentW}`;
    wBtns.forEach(b=>{
      if(!b.el) return;
      b.el.classList.toggle("isActive", b.n === viewW);
      b.el.disabled = (b.n > currentW);
    });
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
    const safe = (weights.length ? weights : [""]); // мін 1 інпут

    return `
      <div class="wj-editor" data-team="${esc(team.teamId)}">
        <div class="wj-fishesScroll">
          <div class="wj-fishes">
            ${safe.map((v)=>`
              <div class="wj-fish">
                <input class="inp wj-inp" inputmode="decimal" placeholder="вага"
                  value="${esc(v === "" ? "" : Number(v).toFixed(2))}">
                <button class="wj-miniBtn wj-del" type="button" title="Видалити" ${safe.length<=1 ? "disabled":""}>×</button>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="wj-actions">
          <input class="inp wj-quick" inputmode="decimal" placeholder="+ вага" value="">
          <button class="wj-miniBtn wj-add" type="button" title="Додати">+</button>
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
      teamsBox.innerHTML = `<div class="muted">Нема команд у зоні ${esc(zone)} (перевір жереб у stageResults/${esc(key)}).</div>`;
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

    teamsBox.querySelectorAll(".wj-editor").forEach(ed=>{
      const teamId = ed.getAttribute("data-team");
      const hint = ed.querySelector(".wj-hint");
      const fishes = ed.querySelector(".wj-fishes");

      function refreshDel(){
        const dels = ed.querySelectorAll(".wj-del");
        if(dels.length === 1) dels[0].disabled = true;
        else dels.forEach(b=> b.disabled = false);
      }

      ed.querySelector(".wj-quick")?.addEventListener("keydown", (e)=>{
        if(e.key === "Enter"){ e.preventDefault(); ed.querySelector(".wj-add")?.click(); }
      });

      ed.querySelector(".wj-add")?.addEventListener("click", ()=>{
        const quick = ed.querySelector(".wj-quick");
        let v = (quick ? String(quick.value || "").trim() : "");
        if(!v){
          const lastInp = fishes ? fishes.querySelector(".wj-fish:last-child .wj-inp") : null;
          v = lastInp ? String(lastInp.value || "").trim() : "";
        }

        const wrap = document.createElement("div");
        wrap.className = "wj-fish";
        wrap.innerHTML = `
          <input class="inp wj-inp" inputmode="decimal" placeholder="вага" value="${esc(v)}">
          <button class="wj-miniBtn wj-del" type="button" title="Видалити">×</button>
        `;
        if(fishes) fishes.appendChild(wrap);

        if(quick) quick.value = "";
        if(hint) hint.textContent = "";
        refreshDel();

        const newInp = wrap.querySelector(".wj-inp");
        setTimeout(()=>{ newInp?.focus(); newInp?.select(); }, 0);
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
          if(hint){ hint.textContent = "Збереження…"; hint.className = "muted wj-hint"; }

          const team = (teamsMap || {})[teamId];
          if(!team) throw new Error("Команда не знайдена.");

          const raw = Array.from(ed.querySelectorAll(".wj-inp")).map(i => i.value);
          await saveWeighingWeights(team, viewW, raw);

          const d = weighCache?.[teamId]?.[viewW] || {};
          if(hint){
            hint.textContent = `✅ OK: 🐟 ${d.fishCount||0} • кг ${(d.totalWeightKg||0).toFixed(2)} • Big ${(d.bigFishKg||0).toFixed(2)}`;
            hint.className = "muted wj-hint ok";
          }

          await preloadWeighings(teamsArr || []);
          renderTable(teamsArr || []);
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

  async function openZone(){
    renderBindInfo();

    if(!zone || !token || !key){
      setMsg("❌ Нема параметрів QR (zone/token/key). Скануй QR ще раз.", false);
      if(weighCard) weighCard.style.display = "none";
      return;
    }

    // teams
    const teams = await loadTeamsForZone();
    teamsArr = teams;
    teamsMap = teams.reduce((m,x)=> (m[x.teamId]=x, m), {});

    maxW = DEFAULT_MAX_W;
    currentW = DEFAULT_MAX_W; // судді можуть вносити до 4х (контроль можеш обмежити логікою пізніше)
    if(viewW > currentW) viewW = currentW;
    updateWButtons();

    if(teamsCountEl) teamsCountEl.textContent = `Команд: ${teams.length}`;
    if(statusEl) statusEl.textContent = teams.length ? "✅ Зона відкрита." : "⚠️ Команди не знайдені (перевір жереб).";

    if(weighCard) weighCard.style.display = "block";
    if(netBadge) netBadge.style.display = "inline-flex";

    await preloadWeighings(teams);
    renderTable(teams);

    setWMsg(`Активна колонка: W${viewW}.`, true);
  }

  // ---------- init ----------
  (async function init(){
    try{
      await waitFirebase();
      db = window.scDb;
      auth = window.scAuth;

      // online badge
      function updateOnline(){
        if(!netBadge) return;
        const on = navigator.onLine;
        netBadge.style.display = "inline-flex";
        netBadge.textContent = on ? "● online" : "● offline";
        netBadge.style.opacity = on ? "1" : ".55";
      }
      window.addEventListener("online", updateOnline);
      window.addEventListener("offline", updateOnline);
      updateOnline();

      readParams();
      renderBindInfo();

      // anon auth
      if(authPill) authPill.textContent = "auth: ⏳";
      me = await ensureAnonAuth();
      if(authPill) authPill.textContent = "auth: ✅ суддя (QR)";

      // verify access
if (me.isAnonymous) {
  // суддя по QR
  setMsg("Перевіряю QR-доступ…", true);
  await verifyToken();
  setMsg("✅ QR доступ підтверджено. Завантажую зону…", true);
} else {
  // адмін
  setMsg("✅ Адмін-доступ. Завантажую зону…", true);
}

await openZone();
setMsg("", true);

      // W buttons
      wBtns.forEach(b=>{
        b.el?.addEventListener("click", async ()=>{
          if(b.n > currentW) return;
          viewW = b.n;
          updateWButtons();
          renderTable(teamsArr || []);
          setWMsg(`Активна колонка: W${viewW}.`, true);
        });
      });

    }catch(err){
      console.error(err);
      if(statusEl) statusEl.textContent = "❌ " + (err?.message || err);
      setMsg("❌ " + (err?.message || err), false);
      if(weighCard) weighCard.style.display = "none";
      if(authPill) authPill.textContent = "auth: ❌";
    }
  })();

})();
