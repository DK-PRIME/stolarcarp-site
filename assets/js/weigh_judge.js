// assets/js/weigh_judge.js
// STOLAR CARP • Суддя • Зважування (таблиця як у Google Sheet)
// - bind тільки zone (A/B/C) через ?zone=A + localStorage
// - активний етап беремо з settings/app
// - команди беремо з registrations (confirmed) + drawZone/drawSector
// - ваги пишемо в weighings у LIVE-сумісному форматі

(function(){
  "use strict";

  const LS_KEY = "sc_judge_zone_v1";
  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const DEFAULT_MAX_W = 4;

  // ===== UI refs (існують у твоєму HTML) =====
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

  // ===== Active stage (settings/app) =====
  let compId = "";
  let stageId = "";
  let activeKey = ""; // compId||stageId (для settings weighing_*)
  let zone = ""; // A/B/C

  let maxW = DEFAULT_MAX_W;
  let currentW = 1; // поточне для зони (авто)
  let viewW = 1;    // яку колонку зараз вводимо

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
    unsubApp = db.collection("settings").doc("app").onSnapshot((snap)=>{
      const app = snap.exists ? (snap.data()||{}) : {};

      compId  = norm(app.activeCompetitionId || app.activeCompetition || app.competitionId || "");
      stageId = norm(app.activeStageId || app.stageId || "") || "stage-1";
      activeKey = norm(app.activeKey || "") || computeActiveKey(compId, stageId);

      renderBindInfo();

      // якщо таблиця вже відкрита — перезавантажимо
      if(weighCard && weighCard.style.display !== "none" && zone){
        openZone().catch(e=>{
          setWMsg("Помилка оновлення активного етапу: " + (e?.message || e), false);
        });
      }
    }, (err)=>{
      console.error(err);
      statusEl.textContent = "❌ Не читається settings/app.";
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

  // ---------- weighing settings (per activeKey) ----------
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
      b.el.disabled = (b.n > currentW);
    });
  }

  // ---------- load teams (registrations) ----------
  function parseZoneFromReg(d){
    // пріоритет: drawZone
    const z1 = norm(d.drawZone || "").toUpperCase();
    if(z1) return z1;
    // запасний: drawKey типу A6
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

  // ---------- weighings (LIVE compatible) ----------
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

  // тут “простий режим” як у твоєму старому варіанті: одне поле “вага”
  // якщо хочеш “кожну рибу окремо” — скажи, я переключу на weights:[...]
  async function saveWeighingTotal(team, wNo, totalKg){
    const id = weighingDocId(team.teamId, wNo);
    const ts = window.firebase.firestore.FieldValue.serverTimestamp();

    const w = round2(totalKg);

    await db.collection("weighings").doc(id).set({
      // LIVE ключові поля:
      compId,
      stageId,
      weighNo: Number(wNo),
      teamId: team.teamId,

      // Для простого лайву:
      totalWeightKg: w,

      // Додатково:
      zone,
      sector: Number(team.sector||0),
      teamName: team.teamName || "",
      status: "submitted",
      updatedAt: ts,
      updatedBy: me.uid
    }, { merge:true });

    weighCache[team.teamId] = weighCache[team.teamId] || {};
    weighCache[team.teamId][wNo] = { totalWeightKg: w, status:"submitted" };
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

  // ---------- render table ----------
  function renderTable(teams){
    if(!teamsBox) return;

    const head = `
      <div style="overflow:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(148,163,184,.22);">Сектор</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid rgba(148,163,184,.22);">Команда</th>
              ${[1,2,3,4].map(n=>`
                <th style="text-align:center; padding:10px; border-bottom:1px solid rgba(148,163,184,.22);">W${n}</th>
              `).join("")}
            </tr>
          </thead>
          <tbody id="tblBody"></tbody>
        </table>
      </div>
    `;

    teamsBox.innerHTML = head;

    const body = teamsBox.querySelector("#tblBody");
    body.innerHTML = teams.map(t=>{
      const cells = [1,2,3,4].map(n=>{
        const active = (n === viewW);

        // значення з кешу (може бути null)
        const d = (weighCache[t.teamId] && weighCache[t.teamId][n]) ? weighCache[t.teamId][n] : null;
        const v = (d && Number.isFinite(Number(d.totalWeightKg))) ? Number(d.totalWeightKg).toFixed(2) : "";

        if(active){
          return `
            <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.12);">
              <div style="display:flex; gap:8px; align-items:center; justify-content:center;">
                <input class="inp" inputmode="decimal" data-inp="${esc(t.teamId)}" placeholder="0.00" value="${esc(v)}"
                  style="min-width:92px; max-width:120px; text-align:center;">
                <button class="btn btn--primary" data-save="${esc(t.teamId)}" style="padding:10px 12px; border-radius:12px;">OK</button>
              </div>
            </td>
          `;
        }

        // неактивна колонка — тільки показ
        const show = v ? `<b>${esc(v)}</b>` : `<span class="muted">—</span>`;
        return `<td style="padding:8px; text-align:center; border-bottom:1px solid rgba(148,163,184,.12);">${show}</td>`;
      }).join("");

      return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid rgba(148,163,184,.12);">
            <span class="pill">A${esc(t.sector)}</span>
          </td>
          <td style="padding:10px; border-bottom:1px solid rgba(148,163,184,.12); font-weight:900;">
            ${esc(t.teamName)}
          </td>
          ${cells}
        </tr>
      `;
    }).join("");

    // кнопки save
    body.querySelectorAll("[data-save]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const teamId = btn.getAttribute("data-save");
        const inp = body.querySelector(`[data-inp="${CSS.escape(teamId)}"]`);
        const raw = inp ? inp.value : "";
        const num = toNum(raw);

        if(!Number.isFinite(num) || num < 0){
          setWMsg("❌ Введи вагу числом, напр. 5.080", false);
          return;
        }

        const teamsMap = teams.reduce((m,x)=> (m[x.teamId]=x, m), {});
        const team = teamsMap[teamId];
        if(!team){
          setWMsg("❌ Не знайшов команду в списку.", false);
          return;
        }

        try{
          setWMsg(`Зберігаю ${team.teamName} W${viewW}…`, true);
          await saveWeighingTotal(team, viewW, num);
          setWMsg(`✅ Збережено: ${team.teamName} W${viewW} = ${round2(num).toFixed(2)}`, true);

          const advanced = await maybeAdvanceAuto(teams);
          if(advanced){
            const s = await getOrCreateWeighingSettings();
            maxW = Number(s.data.maxW || DEFAULT_MAX_W);
            currentW = getCurrentWForZone(s.data);
            if(viewW > currentW) viewW = currentW;
            updateWButtons();
            setWMsg(`Авто: всі здані → переключив на W${currentW}`, true);
          }

          // перерендер таблиці, щоб інші колонки показали значення
          await preloadWeighings(teams);
          renderTable(teams);

        }catch(e){
          console.error(e);
          setWMsg("❌ Помилка збереження: " + (e?.message || e), false);
        }
      });
    });
  }

  async function preloadWeighings(teams){
    // підтягуємо усі W1..W4 (щоб таблиця одразу була “як у Sheet”)
    for(const t of teams){
      weighCache[t.teamId] = weighCache[t.teamId] || {};
      for(let w=1; w<=4; w++){
        // якщо вже є — не чіпаємо
        if(weighCache[t.teamId].hasOwnProperty(w)) continue;
        weighCache[t.teamId][w] = await loadWeighing(t.teamId, w);
      }
    }
  }

  // ---------- open zone ----------
  async function openZone(){
    if(!zone){
      setMsg("Нема зони. Відкрий посилання типу ?zone=A", false);
      return;
    }
    if(!compId || !stageId || !activeKey){
      setMsg("Нема активного етапу (settings/app).", false);
      return;
    }

    // settings per activeKey
    const s = await getOrCreateWeighingSettings();
    maxW = Number(s.data.maxW || DEFAULT_MAX_W);
    currentW = getCurrentWForZone(s.data);
    if(viewW > currentW) viewW = currentW;
    updateWButtons();

    // teams + weighings
    const teams = await loadTeamsForZone();

    if(teamsCountEl) teamsCountEl.textContent = `Команд: ${teams.length}`;
    if(statusEl) statusEl.textContent = teams.length ? "✅ Зона відкрита." : "⚠️ Команди не знайдені (confirmed + drawZone/drawSector).";

    weighCard.style.display = "block";
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
      if(zone && zoneTitle) zoneTitle.textContent = `Зона ${zone}`;

      auth.onAuthStateChanged(async (user)=>{
        if(!user){
          authPill.textContent = "auth: ❌ увійди (суддя)";
          if(statusEl) statusEl.textContent = "Потрібен вхід судді/адміна.";
          weighCard.style.display = "none";
          return;
        }

        me = user;
        authPill.textContent = "auth: ✅ " + (user.email || user.uid);

        const ok = await requireJudgeOrAdmin(user);
        if(!ok){
          if(statusEl) statusEl.textContent = "⛔ Нема доступу (потрібна роль judge/admin).";
          weighCard.style.display = "none";
          return;
        }

        if(statusEl) statusEl.textContent = "✅ Доступ судді підтверджено.";
        setMsg("Готово. Натисни «Відкрити мою зону».", true);

        watchApp();
        renderBindInfo();
      });

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
          await openZone();
          renderBindInfo();
          setMsg("Зона відкрита.", true);
        }catch(e){
          setMsg("Помилка: " + (e?.message || e), false);
        }
      });

      btnReset.addEventListener("click", ()=>{
        clearBindZone();
        zone = "";
        renderBindInfo();
        weighCard.style.display = "none";
        setMsg("Прив’язку скинуто.", true);
      });

      btnSaveHint.addEventListener("click", ()=>{
        alert("Android/Chrome: ⋮ → «Додати на головний екран». iPhone/Safari: Share → Add to Home Screen.");
      });

      // W buttons
      wBtns.forEach(b=>{
        if(!b.el) return;
        b.el.addEventListener("click", async ()=>{
          if(b.n > currentW) return;
          viewW = b.n;
          updateWButtons();
          try{
            const teams = await loadTeamsForZone();
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
