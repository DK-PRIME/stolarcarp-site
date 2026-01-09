// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • QR для суддів (A/B/C)
// ✅ створює токен в Firestore judgeTokens/{token} (72h за замовчуванням)
// ✅ генерує 3 QR (A/B/C): weigh_judge.html?zone=A&token=...&key=...&w=W1
// ✅ адаптив під вертикальний телефон
// ✅ токен "прив’язаний" до activeKey (етап) — після завершення/зміни activeKey перестане пускати

(function(){
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

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
    // SC- + 10 символів
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "SC-";
    for(let i=0;i<10;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }

  async function getActiveCtx(){
    const db = window.scDb;
    const snap = await db.collection("settings").doc("app").get();
    if(!snap.exists) return null;
    const d = snap.data() || {};

    const activeKey = norm(d.activeKey || "");
    const compId = norm(d.activeCompetitionId || d.activeCompetition || d.competitionId || "");
    const stageId = norm(d.activeStageId || d.stageId || "stage-1");

    const key = activeKey || (compId && stageId ? `${compId}||${stageId}` : "");
    if(!key) return null;

    return { activeKey: key, compId, stageId };
  }

  function baseUrl(){
    // Netlify без / в кінці
    return location.origin;
  }

  function makeJudgeUrl(zone, token, key){
    // w=W1 стартово, суддя потім перемикає
    const u = new URL(baseUrl() + "/weigh_judge.html");
    u.searchParams.set("zone", zone);
    u.searchParams.set("token", token);
    u.searchParams.set("key", key);
    u.searchParams.set("w", "W1");
    return u.toString();
  }

  async function writeTokenDoc(token, hours, ctx){
    const db = window.scDb;
    const user = window.scAuth.currentUser;

    const now = Date.now();
    const ms = Math.max(1, Number(hours || 72)) * 60 * 60 * 1000;
    const exp = new Date(now + ms);

    const payload = {
      token,
      activeKey: ctx.activeKey,
      compId: ctx.compId || null,
      stageId: ctx.stageId || null,
      allowedZones: ["A","B","C"],        // один токен — 3 QR
      enabled: true,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user?.uid || null,
      expiresAt: window.firebase.firestore.Timestamp.fromDate(exp)
    };

    await db.collection("judgeTokens").doc(token).set(payload, { merge:true });
    return payload;
  }

  function zoneBadgeClass(z){
    if(z==="A") return "badge";
    if(z==="B") return "badge";
    return "badge";
  }

  function renderQrCards(token, ctx, hours){
    if(!out) return;

    const zones = ["A","B","C"];
    out.innerHTML = zones.map(z=>{
      const url = makeJudgeUrl(z, token, ctx.activeKey);

      return `
        <div class="qrCard">
          <div class="qrTitle">
            <div class="${zoneBadgeClass(z)}">Зона ${esc(z)}</div>
            <div class="muted" style="font-size:.85rem;">${esc(hours)} год</div>
          </div>

          <div class="qrBox">
            <div id="qr_${esc(z)}"></div>
          </div>

          <div class="qrLinks">
            <div class="muted" style="font-size:.85rem;">Посилання (для Viber/Telegram):</div>
            <div class="linkLine" id="ln_${esc(z)}">${esc(url)}</div>

            <div class="miniBtns">
              <button class="btn btn--ghost" type="button" data-copy="${esc(z)}">Скопіювати</button>
              <button class="btn btn--ghost" type="button" data-open="${esc(z)}">Відкрити</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    zones.forEach(z=>{
      const url = makeJudgeUrl(z, token, ctx.activeKey);
      const el = document.getElementById("qr_" + z);
      if(el){
        el.innerHTML = "";
        // QR оптимально для телефону: 220px
        new window.QRCode(el, {
          text: url,
          width: 220,
          height: 220,
          correctLevel: window.QRCode.CorrectLevel.M
        });
      }
    });

    // buttons
    out.querySelectorAll("[data-copy]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const z = btn.getAttribute("data-copy");
        const line = document.getElementById("ln_" + z);
        const txt = line ? line.textContent : "";
        try{
          await navigator.clipboard.writeText(txt);
          setMsg(`✅ Скопійовано посилання для зони ${z}`, true);
          setTimeout(()=>setMsg("",true), 1200);
        }catch{
          setMsg("❌ Не можу скопіювати (браузер). Виділи і скопіюй вручну.", false);
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
      const hours = Number(norm(hoursInput?.value || "72")) || 72;

      if(!token || !token.startsWith("SC-") || token.length < 8){
        setMsg("❌ Вкажи нормальний token (наприклад SC-XXXXXXXX).", false);
        return;
      }

      const ctx = await getActiveCtx();
      if(!ctx){
        setMsg("❌ Нема активного етапу. Перевір settings/app (activeKey або activeCompetitionId+activeStageId).", false);
        return;
      }

      await writeTokenDoc(token, hours, ctx);

      renderQrCards(token, ctx, hours);
      setMsg("✅ QR створено. Скинь суддям QR їх зон.", true);

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || e), false);
    }
  }

  // events
  btnRand?.addEventListener("click", ()=>{
    const t = randToken();
    if(tokenInput) tokenInput.value = t;
    setMsg("✅ Token згенеровано", true);
    setTimeout(()=>setMsg("",true), 700);
  });

  btnGen?.addEventListener("click", generateAll);

  // авто-підставити token при першому вході
  if(tokenInput && !tokenInput.value) tokenInput.value = randToken();

})();
