// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • Judge Weighings Control (mobile-first)
// ✅ settings/app -> activeCompetitionId/activeStageId/(activeKey optional)
// ✅ teams order: stageResults/{activeKey || compId||stageId}.teams
// ✅ mobile UI: zone cards + team cards + W1..W4 vertical blocks (no overflow)
// ✅ edit weights: "5.15, 5.20" ; "0 = нема улову" -> 0 не записуємо у weights
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

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb && window.firebase && window.scAuth) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Firebase not ready (scDb/firebase/scAuth)");
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
      if (n <= 0) return; // 0 та мінус ігноруємо
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

    const stageKey = `${compId}||${stageId}`;
    return { compId, stageId, activeKey: activeKey || stageKey, stageKey };
  }

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

  // ===== MOBILE-FIRST CSS =====
  (function injectCss(){
    if (document.getElementById("scJudgeQrAdminCssV3")) return;

    const css = `
      <style id="scJudgeQrAdminCssV3">
        .adm-head{
          display:flex; gap:10px; align-items:flex-start; justify-content:space-between;
          flex-wrap:wrap;
        }
        .adm-title{ font-weight:900; font-size:1.05rem; }
        .adm-sub{ opacity:.75; font-size:.86rem; margin-top:4px; line-height:1.35; }
        .adm-status{ font-weight:800; font-size:.9rem; }

        .zones{ display:grid; gap:12px; }
        .zoneCard{ background:rgba(15,23,42,.92); border:1px solid rgba(148,163,184,.22);
          border-radius:18px; padding:12px; box-shadow:0 18px 40px rgba(0,0,0,.45);
        }
        .zoneTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .zoneName{ font-weight:900; font-size:1.02rem; }
        .zoneCount{ opacity:.75; font-size:.9rem; }

        .teamList{ display:grid; gap:10px; margin-top:10px; }
        .teamCard{
          background: rgba(2,6,23,.35);
          border:1px solid rgba(148,163,184,.18);
          border-radius:16px;
          padding:12px;
        }
        .teamTop{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .teamName{ font-weight:900; font-size:1.0rem; line-height:1.15; }
        .teamMeta{ opacity:.75; font-size:.86rem; margin-top:4px; }
        .pill{ display:inline-flex; align-items:center; justify-content:center; padding:6px 10px;
          border-radius:999px; border:1px solid rgba(148,163,184,.25);
          background:rgba(2,6,23,.35); font-weight:900;
        }

        .wBlocks{ display:grid; gap:10px; margin-top:10px; }
        .wBlock{
          border:1px solid rgba(148,163,184,.16);
          border-radius:14px;
          padding:10px;
          background:rgba(2,6,23,.25);
        }
        .wTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .wName{ font-weight:900; }
        .wSum{ opacity:.9; font-size:.9rem; }

        .wInput{
          width:100%;
          margin-top:8px;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(148,163,184,.22);
          background:rgba(2,6,23,.35);
          color:#e5e7eb;
          outline:none;
        }

        .wBtns{ display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; }
        .wBtns .btn{ flex:1 1 140px; }

        .wFoot{ opacity:.65; font-size:.78rem; margin-top:6px; }

        @media (min-width: 980px){
          .zones{ grid-template-columns: repeat(3, 1fr); align-items:start; }
        }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  })();

  function setAdmStatus(txt, ok=true){
    const el = document.getElementById("admStatus");
    if(!el) return;
    el.textContent = txt || "—";
    el.style.color = ok ? "#8fe39a" : "#ff6c6c";
  }

  function shell(ctx){
    out.innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        <div class="adm-head">
          <div>
            <div class="adm-title">Адмін • Контроль зважувань суддів</div>
            <div class="adm-sub">
              compId: <code>${esc(ctx.compId)}</code> · stageId: <code>${esc(ctx.stageId)}</code><br>
              key: <code>${esc(ctx.activeKey)}</code>
            </div>
          </div>
          <div id="admStatus" class="adm-status">Підключаюсь…</div>
        </div>
      </div>

      <div class="zones" id="zones"></div>

      <div class="muted" style="opacity:.7;font-size:.86rem;margin-top:10px;line-height:1.35;">
        Формат ваг: <b>5.15, 5.20</b> (кома або крапка).<br>
        <b>0 = нема улову</b> → 0 не записуємо (порожній список = нема риби).
      </div>
    `;
  }

  function wSummary(doc){
    const weights = Array.isArray(doc?.weights) ? doc.weights : [];
    const { fishCount, totalWeightKg, bigFishKg } = calcFromWeights(weights);
    const sum = `${fishCount} 🐟 / ${kgShort(totalWeightKg)} кг / Big ${fishCount ? kgShort(bigFishKg) : "—"}`;
    const txt = weights.length ? weights.map(x=>kgShort(x)).join(", ") : "";
    return { sum, txt, fishCount, totalWeightKg, bigFishKg };
  }

  function renderZones(ctx, teamsByZone, weighMap){
    const wrap = document.getElementById("zones");
    if(!wrap) return;

    const zones = ["A","B","C"];

    wrap.innerHTML = zones.map(z=>{
      const teams = teamsByZone[z] || [];
      return `
        <div class="zoneCard">
          <div class="zoneTop">
            <div class="zoneName">Зона ${z}</div>
            <div class="zoneCount">команд: ${teams.length}</div>
          </div>

          <div class="teamList">
            ${teams.length ? teams.map(t=>{
              return `
                <div class="teamCard" data-team="${esc(t.teamId)}">
                  <div class="teamTop">
                    <div>
                      <div class="teamName">${esc(t.teamName)}</div>
                      <div class="teamMeta">Сектор: <span class="pill">${esc(String(t.drawSector||"—"))}</span></div>
                      <div class="teamMeta" style="opacity:.65;">teamId: ${esc(t.teamId || "—")}</div>
                    </div>
                    <div class="pill">${esc(t.drawZone)}${esc(String(t.drawSector||""))}</div>
                  </div>

                  <div class="wBlocks">
                    ${[1,2,3,4].map(wNo=>{
                      const doc = weighMap.get(`${t.teamId}||${wNo}`) || null;
                      const s = wSummary(doc);
                      return `
                        <div class="wBlock">
                          <div class="wTop">
                            <div class="wName">W${wNo}</div>
                            <div class="wSum">${esc(s.sum)}</div>
                          </div>

                          <input class="wInput"
                            data-wtxt="${esc(`${t.teamId}||${wNo}`)}"
                            placeholder="5.15, 5.20 (0 = нема улову)"
                            value="${esc(s.txt)}"
                          />

                          <div class="wBtns">
                            <button class="btn btn--accent"
                              type="button"
                              data-act="save"
                              data-team="${esc(t.teamId)}"
                              data-zone="${esc(t.drawZone)}"
                              data-sector="${esc(String(t.drawSector||""))}"
                              data-teamname="${esc(t.teamName)}"
                              data-wno="${esc(String(wNo))}"
                            >Зберегти</button>

                            <button class="btn btn--ghost"
                              type="button"
                              data-act="clear"
                              data-team="${esc(t.teamId)}"
                              data-zone="${esc(t.drawZone)}"
                              data-sector="${esc(String(t.drawSector||""))}"
                              data-teamname="${esc(t.teamName)}"
                              data-wno="${esc(String(wNo))}"
                            >Очистити</button>
                          </div>

                          <div class="wFoot">
                            ${doc?.updatedAt ? `Оновлено: ${esc(fmtTs(doc.updatedAt))}` : "—"}
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                </div>
              `;
            }).join("") : `<div class="muted" style="opacity:.8;">Нема команд у зоні.</div>`}
          </div>
        </div>
      `;
    }).join("");
  }

  async function writeWeighing(ctx, payload, weights){
    const arr = Array.isArray(weights) ? weights : [];
    const { fishCount, totalWeightKg, bigFishKg } = calcFromWeights(arr);

    const docId = `${ctx.compId}||${ctx.stageId}||W${Number(payload.weighNo)}||${payload.teamId}`;

    await window.scDb.collection("weighings").doc(docId).set({
      compId: ctx.compId,
      stageId: ctx.stageId,
      weighNo: Number(payload.weighNo),

      teamId: String(payload.teamId),
      zone: String(payload.zone || ""),
      sector: Number(payload.sector || 0) || null,
      teamName: String(payload.teamName || "—"),

      weights: arr,
      fishCount,
      totalWeightKg,
      bigFishKg,

      status: "submitted",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (window.scAuth?.currentUser?.uid || ADMIN_UID || null)
    }, { merge:true });
  }

  async function clearWeighing(ctx, payload){
    await writeWeighing(ctx, payload, []);
  }

  // ===== subscriptions =====
  let unsubTeams = null;
  let unsubWeigh = null;

  function stopSubs(){
    if(unsubTeams){ unsubTeams(); unsubTeams=null; }
    if(unsubWeigh){ unsubWeigh(); unsubWeigh=null; }
  }

  (async function boot(){
    try{
      out.innerHTML = `<div class="card">Завантаження…</div>`;
      await waitFirebase();

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
          `<div style="opacity:.8;margin-top:6px;">Перевір settings/app: activeCompetitionId + activeStageId + activeKey</div></div>`;
        return;
      }

      shell(ctx);

      const teamsByZone = { A:[], B:[], C:[] };
      const weighMap = new Map(); // key teamId||weighNo -> docData

      // 1) stageResults teams
      unsubTeams = window.scDb.collection("stageResults").doc(ctx.activeKey).onSnapshot((snap)=>{
        const data = snap.exists ? (snap.data()||{}) : {};
        const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

        const normed = teamsRaw
          .map(normalizeTeam)
          .filter(t=>t.teamId && ["A","B","C"].includes(t.drawZone));

        const sorted = sortTeams(normed);

        teamsByZone.A = sorted.filter(t=>t.drawZone==="A");
        teamsByZone.B = sorted.filter(t=>t.drawZone==="B");
        teamsByZone.C = sorted.filter(t=>t.drawZone==="C");

        renderZones(ctx, teamsByZone, weighMap);
        setAdmStatus("Підключено ✅", true);
      }, (err)=>{
        console.error(err);
        setAdmStatus("Помилка stageResults ❌", false);
      });

      // 2) weighings (active stage)
      unsubWeigh = window.scDb.collection("weighings")
        .where("compId","==", ctx.compId)
        .where("stageId","==", ctx.stageId)
        .onSnapshot((qs)=>{
          weighMap.clear();

          qs.forEach(doc=>{
            const d = doc.data() || {};

            let teamId = String(d.teamId || "").trim();
            if(!teamId){
              const parts = String(doc.id || "").split("||");
              teamId = parts.length >= 4 ? parts.slice(3).join("||") : "";
            }

            let weighNo = Number(d.weighNo);
            if(!(weighNo>=1 && weighNo<=4)){
              const m = String(doc.id||"").match(/\|\|W(\d+)\|\|/);
              weighNo = m ? Number(m[1]) : NaN;
            }

            if(!teamId) return;
            if(!(weighNo>=1 && weighNo<=4)) return;

            d._id = doc.id;
            weighMap.set(`${teamId}||${weighNo}`, d);
          });

          renderZones(ctx, teamsByZone, weighMap);
        }, (err)=>{
          console.error(err);
          setAdmStatus("Помилка weighings ❌", false);
        });

      // UI actions (save/clear)
      document.addEventListener("click", async (e)=>{
        const btn = e.target.closest("button[data-act]");
        if(!btn) return;

        e.preventDefault();

        const act = btn.getAttribute("data-act");
        const payload = {
          teamId: btn.getAttribute("data-team") || "",
          zone: btn.getAttribute("data-zone") || "",
          sector: btn.getAttribute("data-sector") || "",
          teamName: btn.getAttribute("data-teamname") || "—",
          weighNo: Number(btn.getAttribute("data-wno") || 1) || 1
        };

        const ctx2 = await getActiveCtx();
        if(!ctx2) return;

        try{
          if(act === "save"){
            const key = `${payload.teamId}||${payload.weighNo}`;
            const inp = document.querySelector(`input[data-wtxt="${CSS.escape(key)}"]`);
            const weights = parseWeightsText(inp?.value || "");

            setAdmStatus("Зберігаю…", true);
            await writeWeighing(ctx2, payload, weights);
            setAdmStatus("Збережено ✅", true);
          }

          if(act === "clear"){
            const ok = confirm("Очистити ваги для цього W?");
            if(!ok) return;

            setAdmStatus("Очищаю…", true);
            await clearWeighing(ctx2, payload);
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
