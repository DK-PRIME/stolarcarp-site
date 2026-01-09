// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • QR для суддів (A/B/C)
// ✅ створює токен в Firestore judgeTokens/{token} (72h за замовчуванням)
// ✅ генерує 3 QR (A/B/C): weigh_judge.html?zone=A&token=...&key=...&w=W1
// ✅ адаптив під вертикальний телефон
// ✅ QR НЕ залежить від подальших змін settings/app (бо key вшитий у QR)

(function(){
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";
  const DEFAULT_HOURS = 72;

  const tokenInput = document.getElementById("tokenInput");
  const hoursInput = document.getElementById("hoursInput");
  const btnRand = document.getElementById("btnRand");
  const btnGen  = document.getElementById("btnGen");
  const out     = document.getElementById("qrOut");
  const msgEl   = document.getElementById("msg");

  function setMsg(t, ok=true){
    if(!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok":"err") : "");
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

  function injectCSS(){
    if(document.getElementById("scJudgeQrCss")) return;
    const css = `
      <style id="scJudgeQrCss">
        .qrGrid{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        @media (max-width: 980px){ .qrGrid{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width: 640px){ .qrGrid{ grid-template-columns:1fr; } }

        .qrCard{
          background:rgba(15,23,42,.9);
          border:1px solid rgba(148,163,184,.25);
          border-radius:16px;
          padding:12px;
          box-shadow:0 18px 40px rgba(0,0,0,.45);
        }
        .qrTitle{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
        .badge{
          display:inline-flex; align-items:center; gap:8px;
          font-weight:900; border-radius:999px; padding:6px 10px;
          border:1px solid rgba(148,163,184,.25);
          background:rgba(2,6,23,.25);
          white-space:nowrap;
        }
        .dot{ width:10px; height:10px; border-radius:999px; opacity:.95; }
        .zA .dot{ background:#22c55e; }
        .zB .dot{ background:#3b82f6; }
        .zC .dot{ background:#f59e0b; }

        .qrBox{
          display:flex; align-items:center; justify-content:center;
          background:rgba(2,6,23,.25);
          border:1px solid rgba(148,163,184,.18);
          border-radius:14px;
          padding:10px;
        }
        .qrBox canvas, .qrBox img{ max-width:100%; height:auto; }

        .qrLinks{ margin-top:10px; display:grid; gap:8px; }
        .linkLine{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size:.85rem;
          padding:10px 10px;
          border-radius:12px;
          border:1px solid rgba(148,163,184,.18);
          background:rgba(2,6,23,.25);
          color:#e5e7eb;
          overflow-wrap:anywhere;
          word-break:break-word;
          user-select:text;
        }
        .miniBtns{ display:flex; gap:10px; flex-wrap:wrap; }
        .miniBtns .btn{ width:100%; max-width:240px; }
        @media (max-width: 420px){ .miniBtns .btn{ max-width:none; } }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  async function requireAdmin(){
    const auth = window.scAuth;
    const db = window.scDb;
    const user = auth?.currentUser;
    if(!user) return false;
    if(user.uid === ADMIN_UID) return true;
    try{
      const snap = await db.collection("users").doc(user.uid).get();
      const role = (snap.exists ? (snap.data()||{}).role : "") || "";
      return role === "admin";
    }catch{
      return false;
    }
  }

  function randToken(){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "SC-";
    for(let i=0;i<10;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }

  // беремо key з settings/app (activeKey або compId||stageId)
  async function getStageKey(){
    const db = window.scDb;
    const snap = await db.collection("settings").doc("app").get();
    if(!snap.exists) return null;
    const d = snap.data() || {};

    const activeKey = norm(d.activeKey || "");
    const compId = norm(d.activeCompetitionId || d.activeCompetition || d.competitionId || "");
    const stageId = norm(d.activeStageId || d.stageId || "stage-1");

    const key = activeKey || (compId && stageId ? `${compId}||${stageId}` : "");
    if(!key) return null;

    return { key, compId, stageId };
  }

  function baseUrl(){ return location.origin; }

  function makeJudgeUrl(zone, token, key){
    const u = new URL(baseUrl() + "/weigh_judge.html");
    u.searchParams.set("zone", zone);
    u.searchParams.set("token", token);
    u.searchParams.set("key", key);
    u.searchParams.set("w", "W1");
    return u.toString();
  }

  // ✅ важливо: пишемо ПОЛЕ key (не activeKey), щоб суддівський скрипт просто звіряв key
  async function writeTokenDoc(token, hours, ctx){
    const db = window.scDb;
    const user = window.scAuth.currentUser;

    const hrs = Math.max(1, Number(hours || DEFAULT_HOURS));
    const exp = new Date(Date.now() + hrs * 60 * 60 * 1000);

    const payload = {
      token,
      key: ctx.key,
      compId: ctx.compId || null,
      stageId: ctx.stageId || null,
      allowedZones: ["A","B","C"],
      enabled: true,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user?.uid || null,
      expiresAt: window.firebase.firestore.Timestamp.fromDate(exp)
    };

    await db.collection("judgeTokens").doc(token).set(payload, { merge:true });
    return payload;
  }

  function renderQrCards(token, ctx, hours){
    if(!out) return;

    injectCSS();

    if(!window.QRCode){
      out.innerHTML = `<div class="muted">❌ Нема QRCode бібліотеки (qrcode.min.js). Додай її в admin-qr.html</div>`;
      return;
    }

    const zones = ["A","B","C"];
    out.innerHTML = `
      <div class="qrGrid">
        ${zones.map(z=>{
          const url = makeJudgeUrl(z, token, ctx.key);
          const cls = z==="A" ? "zA" : z==="B" ? "zB" : "zC";
          return `
            <div class="qrCard ${cls}">
              <div class="qrTitle">
                <div class="badge"><span class="dot"></span> Зона ${esc(z)}</div>
                <div class="muted" style="font-size:.85rem;">${esc(hours)} год</div>
              </div>

              <div class="qrBox"><div id="qr_${esc(z)}"></div></div>

              <div class="qrLinks">
                <div class="muted" style="font-size:.85rem;">Посилання (як запасний варіант):</div>
                <div class="linkLine" id="ln_${esc(z)}">${esc(url)}</div>

                <div class="miniBtns">
                  <button class="btn btn--ghost" type="button" data-copy="${esc(z)}">Скопіювати</button>
                  <button class="btn btn--ghost" type="button" data-open="${esc(z)}">Відкрити</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    zones.forEach(z=>{
      const url = makeJudgeUrl(z, token, ctx.key);
      const el = document.getElementById("qr_" + z);
      if(el){
        el.innerHTML = "";
        new window.QRCode(el, {
          text: url,
          width: 240,
          height: 240,
          correctLevel: window.QRCode.CorrectLevel.M
        });
      }
    });

    out.querySelectorAll("[data-copy]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const z = btn.getAttribute("data-copy");
        const line = document.getElementById("ln_" + z);
        const txt = line ? line.textContent : "";
        try{
          await navigator.clipboard.writeText(txt);
          setMsg(`✅ Скопійовано для зони ${z}`, true);
          setTimeout(()=>setMsg("",true), 1100);
        }catch{
          setMsg("❌ Не можу скопіювати. Скопіюй вручну з поля.", false);
        }
      });
    });

    out.querySelectorAll("[data-open]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const z = btn.getAttribute("data-open");
        const line = document.getElementById("ln_" + z);
        const txt = line ? line.textContent : "";
        if(txt) window.open(txt, "_blank");
      });
    });
  }

  async function generateAll(){
    try{
      setMsg("Завантаження…", true);

      await waitFirebase();

      const isAdm = await requireAdmin();
      if(!isAdm){
        setMsg("❌ Нема адмін доступу. Увійди як адмін.", false);
        return;
      }

      const token = norm(tokenInput?.value || "");
      const hours = Number(norm(hoursInput?.value || String(DEFAULT_HOURS))) || DEFAULT_HOURS;

      if(!token || !token.startsWith("SC-") || token.length < 8){
        setMsg("❌ Вкажи token типу SC-XXXXXXXX.", false);
        return;
      }

      const ctx = await getStageKey();
      if(!ctx){
        setMsg("❌ Нема активного key. Перевір settings/app (activeKey або activeCompetitionId+activeStageId).", false);
        return;
      }

      await writeTokenDoc(token, hours, ctx);
      renderQrCards(token, ctx, hours);

      setMsg("✅ QR готові. Дай судді відсканувати QR його зони.", true);

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || e), false);
    }
  }

  btnRand?.addEventListener("click", ()=>{
    const t = randToken();
    if(tokenInput) tokenInput.value = t;
    setMsg("✅ Token згенеровано", true);
    setTimeout(()=>setMsg("",true), 700);
  });

  btnGen?.addEventListener("click", generateAll);

  if(tokenInput && !tokenInput.value) tokenInput.value = randToken();
  if(hoursInput && !hoursInput.value) hoursInput.value = String(DEFAULT_HOURS);

})();
