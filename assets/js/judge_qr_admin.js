// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • Judge Weighings Control (A/B/C)
// ✅ source: settings/app -> activeCompetitionId/activeStageId/(activeKey optional)
// ✅ teams order: stageResults/{activeKey || compId||stageId}.teams
// ✅ shows 3 tables (A,B,C) with W1..W4
// ✅ edit weights as "5.15, 5.20" -> recalculates fishCount/totalWeightKg/bigFishKg
// ✅ "0 = нема улову" -> 0 НЕ записуємо у weights (порожній масив = нема риби)
// ✅ writes LIVE-compatible weighings fields (merge)

(function () {
  "use strict";

  const out = document.getElementById("qrOut");
  if (!out) return;

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  // ---------- helpers ----------
  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  // Escape string for attribute selector: [data-wtxt="..."]
  function selAttrVal(v){
    return String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Firebase not ready (scDb/firebase)");
  }

  async function ensureAuth() {
    try {
      if (window.scAuth && !window.scAuth.currentUser) {
        await window.scAuth.signInAnonymously();
      }
    } catch {}
  }

  async function requireAdmin(){
    const user = window.scAuth?.currentUser;
    if (!user) return false;
    if (user.uid === ADMIN_UID) return true;

    try{
      const snap = await window.scDb.collection("users").doc(user.uid).get();
      const role = (snap.exists ? (snap.data()||{}).role : "") || "";
      return role === "admin";
    }catch{
      return false;
    }
  }

  function fmtTs(ts){
    try{
      const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      if(!d) return "—";
      return d.toLocaleString("uk-UA", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
    }catch{ return "—"; }
  }

  function kgShort(x){
    const n = Number(x || 0);
    if(!isFinite(n)) return "0";
    return n.toFixed(2).replace(/\.?0+$/,"");
  }

  // "0 = нема улову" -> 0 НЕ включаємо в масив
  function parseWeightsText(txt){
    const raw = String(txt || "")
      .replace(/;/g, ",")
      .split(",")
      .map(s => s.trim().replace(",", "."))
      .filter(Boolean);

    const arr = [];
    raw.forEach(v=>{
      const n = Number(v);
      if (!isFinite(n)) return;
      if (n <= 0) return; // ключове: 0 та мінус ігноруємо
      arr.push(Math.round(n*1000)/1000);
    });
    return arr;
  }

  function calcFromWeights(arr){
    const a = Array.isArray(arr) ? arr : [];
    const fishCount = a.length;
    const totalWeightKg = Math.round(a.reduce((s,x)=>s + Number(x||0), 0) * 1000) / 1000;
    const bigFishKg = fishCount ? Math.max(...a.map(x=>Number(x||0))) : 0;
    return { fishCount, totalWeightKg, bigFishKg };
  }

  // ===== active context from settings/app =====
  async function getActiveCtx() {
    const snap = await window.scDb.collection("settings").doc("app").get();
    if (!snap.exists) return null;

    const d = snap.data() || {};
    const compId  = String(d.activeCompetitionId || "");
    const stageId = String(d.activeStageId || "");
    const activeKey = String(d.activeKey || ""); // може бути порожній

    if (!compId || !stageId) return null;

    // fallback key:
    const stageKey = `${compId}||${stageId}`;
    return { compId, stageId, activeKey: activeKey || stageKey, stageKey };
  }

  // ===== team order from stageResults/{key}.teams =====
  function normalizeTeam(t){
    const teamId = String(t.teamId || t.regId || t.id || "").trim();
    const teamName = String(t.teamName || t.team || "—");
    const drawZone = String(t.drawZone || t.zone || (t.drawKey ? String(t.drawKey)[0] : "") || "").toUpperCase();
    const drawSector = Number(t.drawSector || t.sector || (t.drawKey ? parseInt(String(t.drawKey).slice(1),10) : 0) || 0);
    const drawKey = String(t.drawKey || (drawZone && drawSector ? `${drawZone}${drawSector}` : "") || "");
    return { teamId, teamName, drawZone, drawSector, drawKey };
  }

  function sortTeams(list){
    const order = z => (z==="A"?1 : z==="B"?2 : z==="C"?3 : 9);
    return list.slice().sort((a,b)=>{
      const ao = order(a.drawZone), bo = order(b.drawZone);
      if (ao !== bo) return ao - bo;
      return (a.drawSector||0) - (b.drawSector||0);
    });
  }

  // ===== UI render =====
  function renderShell(ctx){
    out.innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;font-size:1.05rem;">Адмін • Контроль зважувань суддів</div>
            <div style="opacity:.8;font-size:.85rem;margin-top:4px;">
              compId: <code>${esc(ctx.compId)}</code> · stageId: <code>${esc(ctx.stageId)}</code> · key: <code>${esc(ctx.activeKey)}</code>
            </div>
          </div>
          <div id="admStatus" style="opacity:.85;font-size:.9rem;">Підключаюсь…</div>
        </div>
      </div>

      <div id="admTables" style="display:grid; gap:12px;"></div>

      <div style="opacity:.65;font-size:.85rem;margin-top:10px; line-height:1.35;">
        Формат редагування ваг: <b>5.15, 5.20</b> (кома або крапка).<br>
        <b>0 = нема улову</b> → 0 не записується в ваги (порожній список = нема риби).
      </div>
    `;
  }

  function zoneCardHtml(zone, rowsHtml){
    return `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;">Зона ${zone}</div>
          <div style="opacity:.75;font-size:.9rem;">Редагування live-сумісних weighings</div>
        </div>

        <div class="table-wrap" style="overflow:auto; max-width:100%; -webkit-overflow-scrolling:touch; margin-top:10px;">
          <table class="table table-sm" style="width:max-content; min-width:100%;">
            <thead>
              <tr>
                <th>Сектор</th>
                <th>Команда</th>
                <th>W1 (к/вага/big)</th>
                <th>W2 (к/вага/big)</th>
                <th>W3 (к/вага/big)</th>
                <th>W4 (к/вага/big)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" style="opacity:.75;">Нема команд у зоні.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function cellHtml(t, wNo, doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    const { fishCount, totalWeightKg, bigFishKg } = calcFromWeights(weights);

    const summary = `${fishCount} / ${kgShort(totalWeightKg)} / ${fishCount ? kgShort(bigFishKg) : "—"}`;
    const txt = weights.length ? weights.map(x=>kgShort(x)).join(", ") : "";

    const key = `${t.teamId}||${wNo}`;

    return `
      <div style="display:grid; gap:6px; min-width:260px;">
        <div style="opacity:.9;font-size:.9rem;">${esc(summary)}</div>

        <input
          class="mini"
          data-wtxt="${esc(key)}"
          placeholder="5.15, 5.20"
          value="${esc(txt)}"
          style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid rgba(148,163,184,.25); background:rgba(2,6,23,.35); color:#e5e7eb;"
        />

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn--accent" type="button"
            data-savew="${esc(key)}"
            data-team="${esc(t.teamId)}"
            data-zone="${esc(t.drawZone)}"
            data-sector="${esc(String(t.drawSector||""))}"
            data-teamname="${esc(t.teamName)}"
            data-wno="${esc(String(wNo))}"
          >Зберегти</button>

          <button class="btn btn--ghost" type="button"
            data-clearw="${esc(key)}"
            data-team="${esc(t.teamId)}"
            data-zone="${esc(t.drawZone)}"
            data-sector="${esc(String(t.drawSector||""))}"
            data-teamname="${esc(t.teamName)}"
            data-wno="${esc(String(wNo))}"
          >Очистити</button>
        </div>

        <div style="opacity:.6;font-size:.78rem;">
          ${doc?.updatedAt ? `Оновлено: ${esc(fmtTs(doc.updatedAt))}` : "—"}
        </div>
      </div>
    `;
  }

  function renderTables(ctx, teamsByZone, weighMap){
    const wrap = document.getElementById("admTables");
    if(!wrap) return;

    const zones = ["A","B","C"];

    const html = zones.map(z=>{
      const teams = teamsByZone[z] || [];
      const rowsHtml = teams.map(t=>{
        const w1 = weighMap.get(`${t.teamId}||1`) || null;
        const w2 = weighMap.get(`${t.teamId}||2`) || null;
        const w3 = weighMap.get(`${t.teamId}||3`) || null;
        const w4 = weighMap.get(`${t.teamId}||4`) || null;

        return `
          <tr>
            <td>${esc(String(t.drawSector || ""))}</td>
            <td class="team-col">${esc(t.teamName)}</td>
            <td>${cellHtml(t, 1, w1)}</td>
            <td>${cellHtml(t, 2, w2)}</td>
            <td>${cellHtml(t, 3, w3)}</td>
            <td>${cellHtml(t, 4, w4)}</td>
          </tr>
        `;
      }).join("");

      return zoneCardHtml(z, rowsHtml);
    }).join("");

    wrap.innerHTML = html;
  }

  function setAdmStatus(txt, ok=true){
    const el = document.getElementById("admStatus");
    if(!el) return;
    el.textContent = txt || "—";
    el.style.color = ok ? "#8fe39a" : "#ff6c6c";
  }

  // ===== subscriptions =====
  let unsubTeams = null;
  let unsubWeigh = null;

  function stopSubs(){
    if(unsubTeams){ unsubTeams(); unsubTeams=null; }
    if(unsubWeigh){ unsubWeigh(); unsubWeigh=null; }
  }

  async function writeWeighing(ctx, payload){
    const weights = Array.isArray(payload.weights) ? payload.weights : [];
    const { fishCount, totalWeightKg, bigFishKg } = calcFromWeights(weights);

    const docId = `${ctx.compId}||${ctx.stageId}||W${Number(payload.weighNo)}||${payload.teamId}`;

    await window.scDb.collection("weighings").doc(docId).set({
      compId: ctx.compId,
      stageId: ctx.stageId,
      weighNo: Number(payload.weighNo),

      teamId: String(payload.teamId),
      zone: String(payload.zone || ""),
      sector: Number(payload.sector || 0) || null,
      teamName: String(payload.teamName || "—"),

      weights,
      fishCount,
      totalWeightKg,
      bigFishKg,

      status: "submitted",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (window.scAuth?.currentUser?.uid || ADMIN_UID || null)
    }, { merge:true });

    return docId;
  }

  async function clearWeighing(ctx, payload){
    const docId = `${ctx.compId}||${ctx.stageId}||W${Number(payload.weighNo)}||${payload.teamId}`;

    await window.scDb.collection("weighings").doc(docId).set({
      compId: ctx.compId,
      stageId: ctx.stageId,
      weighNo: Number(payload.weighNo),

      teamId: String(payload.teamId),
      zone: String(payload.zone || ""),
      sector: Number(payload.sector || 0) || null,
      teamName: String(payload.teamName || "—"),

      weights: [],
      fishCount: 0,
      totalWeightKg: 0,
      bigFishKg: 0,

      status: "submitted",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (window.scAuth?.currentUser?.uid || ADMIN_UID || null)
    }, { merge:true });

    return docId;
  }

  // ===== init =====
  (async function boot(){
    try{
      out.innerHTML = `<div class="card">Завантаження…</div>`;
      await waitFirebase();
      await ensureAuth();

      const isAdmin = await requireAdmin();
      if(!isAdmin){
        out.innerHTML =
          `<div class="card"><b style="color:#ff6c6c;">Нема доступу</b>` +
          `<div style="opacity:.85;margin-top:6px;">Увійди адміном (auth.html) або перевір роль у users.</div></div>`;
        return;
      }

      const ctx = await getActiveCtx();
      if(!ctx){
        out.innerHTML =
          `<div class="card"><b style="color:#ff6c6c;">Нема активного етапу</b>` +
          `<div style="opacity:.8;margin-top:6px;">Перевір settings/app: activeCompetitionId + activeStageId</div></div>`;
        return;
      }

      renderShell(ctx);

      const teamsByZone = { A:[], B:[], C:[] };
      const weighMap = new Map(); // key teamId||weighNo -> docData

      // 1) subscribe teams
      unsubTeams = window.scDb.collection("stageResults").doc(ctx.activeKey).onSnapshot((snap)=>{
        const data = snap.exists ? (snap.data()||{}) : {};
        const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

        const norm = teamsRaw
          .map(normalizeTeam)
          .filter(t=>t.teamId && ["A","B","C"].includes(t.drawZone));

        const sorted = sortTeams(norm);

        teamsByZone.A = sorted.filter(t=>t.drawZone==="A");
        teamsByZone.B = sorted.filter(t=>t.drawZone==="B");
        teamsByZone.C = sorted.filter(t=>t.drawZone==="C");

        renderTables(ctx, teamsByZone, weighMap);
        setAdmStatus("Підключено ✅", true);
      }, (err)=>{
        console.error(err);
        setAdmStatus("Помилка stageResults ❌", false);
      });

      // 2) subscribe weighings for active stage
      unsubWeigh = window.scDb.collection("weighings")
        .where("compId","==", ctx.compId)
        .where("stageId","==", ctx.stageId)
        .onSnapshot((qs)=>{
          weighMap.clear();
          qs.forEach(doc=>{
            const d = doc.data() || {};
            const teamId = String(d.teamId || "");
            const weighNo = Number(d.weighNo);
            if(!teamId) return;
            if(!(weighNo>=1 && weighNo<=4)) return;
            weighMap.set(`${teamId}||${weighNo}`, d);
          });

          renderTables(ctx, teamsByZone, weighMap);
        }, (err)=>{
          console.error(err);
          setAdmStatus("Помилка weighings ❌", false);
        });

      // UI events (save / clear)
      document.addEventListener("click", async (e)=>{
        const btnSave = e.target.closest("[data-savew]");
        const btnClear = e.target.closest("[data-clearw]");
        if(!btnSave && !btnClear) return;

        e.preventDefault();

        const ctx2 = await getActiveCtx();
        if(!ctx2) return;

        const payloadFromBtn = (btn)=>({
          teamId: btn.getAttribute("data-team") || "",
          zone: btn.getAttribute("data-zone") || "",
          sector: btn.getAttribute("data-sector") || "",
          teamName: btn.getAttribute("data-teamname") || "—",
          weighNo: Number(btn.getAttribute("data-wno") || 1) || 1
        });

        try{
          if(btnSave){
            const key = btnSave.getAttribute("data-savew") || "";
            const inp = document.querySelector(`[data-wtxt="${selAttrVal(key)}"]`);
            const weights = parseWeightsText(inp?.value || "");

            setAdmStatus("Зберігаю…", true);
            await writeWeighing(ctx2, { ...payloadFromBtn(btnSave), weights });
            setAdmStatus("Збережено ✅", true);
          }

          if(btnClear){
            const ok = confirm("Очистити ваги для цього W?");
            if(!ok) return;

            setAdmStatus("Очищаю…", true);
            await clearWeighing(ctx2, payloadFromBtn(btnClear));
            setAdmStatus("Очищено ✅", true);
          }
        }catch(err){
          console.error(err);
          setAdmStatus("Помилка збереження ❌", false);
        }
      });

    }catch(e){
      console.error(e);
      out.innerHTML =
        `<div class="card"><b style="color:#ff6c6c;">Помилка</b>` +
        `<div style="opacity:.85;margin-top:6px;">${esc(e.message || e)}</div></div>`;
      stopSubs();
    }
  })();

})();
