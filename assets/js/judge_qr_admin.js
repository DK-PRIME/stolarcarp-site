// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • QR для суддів (A/B/C)
// ✅ Firestore judgeTokens/{token} (72h default)
// ✅ 3 QR (A/B/C) на /weigh_judge.html?zone=...&token=...&key=...&w=W1
// ✅ правильний абсолютний URL від кореня (без "admin-weighweigh")
// ✅ кнопки: копіювати лінк / відкрити / зберегти QR PNG
// ✅ токен прив’язаний до activeKey — після зміни activeKey доступ зникає

(function(){
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const tokenInput = document.getElementById("tokenInput");
  const hoursInput = document.getElementById("hoursInput");
  const btnRand = document.getElementById("btnRand");
  const btnGen  = document.getElementById("btnGen");
  const out     = document.getElementById("qrOut");
  const msgEl   = document.getElementById("msg");

  const ZONES = ["A","B","C"];

  function setMsg(t, ok=true){
    if(!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok":"err") : "");
  }

  function norm(v){ return String(v ?? "").trim(); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

  async function waitFirebase(){
    for(let i=0;i<160;i++){
      if(window.scDb && window.scAuth && window.firebase) return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Firebase init не підняв scAuth/scDb.");
  }

  function ensureQrLib(){
    if(!window.QRCode) throw new Error("Не підключена бібліотека QRCode. Додай qrcode.min.js у admin-qr.html.");
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

  function makeJudgeUrl(zone, token, key){
    // КРИТИЧНО: абсолютний шлях від кореня, щоб не злипалося "admin-weighweigh"
    const u = new URL("/weigh_judge.html", location.origin);
    u.searchParams.set("zone", zone);
    u.searchParams.set("token", token);
    u.searchParams.set("key", key);
    u.searchParams.set("w", "W1");
    return u.toString();
  }

  async function writeTokenDoc(token, hours, ctx){
    const db = window.scDb;
    const user = window.scAuth.currentUser;

    const h = Math.max(1, Number(hours || 72) || 72);
    const exp = new Date(Date.now() + h * 60 * 60 * 1000);

    const payload = {
      token,
      activeKey: ctx.activeKey,
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

  function zoneLabel(z){
    // якщо хочеш — тут можна зробити A зелений, B синій, C помаранчевий (пізніше)
    return `Зона ${z}`;
  }

  function getQrDataUrlFromBox(qrBoxEl){
    // qrcodejs може створити <img> або <canvas>
    const img = qrBoxEl.querySelector("img");
    if(img && img.src) return img.src;

    const canvas = qrBoxEl.querySelector("canvas");
    if(canvas){
      try{ return canvas.toDataURL("image/png"); }catch{}
    }
    return null;
  }

  async function copyText(txt){
    try{
      await navigator.clipboard.writeText(txt);
      return true;
    }catch{
      return false;
    }
  }

  function renderQrCards(token, ctx, hours){
    if(!out) return;
    ensureQrLib();

    out.innerHTML = ZONES.map(z=>{
      const url = makeJudgeUrl(z, token, ctx.activeKey);

      return `
        <div class="qrCard">
          <div class="qrTitle" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div class="badge">${esc(zoneLabel(z))}</div>
            <div class="muted" style="font-size:.85rem;">${esc(hours)} год</div>
          </div>

          <div class="qrBox" style="display:flex;justify-content:center;padding:10px 0 attaching;">
            <div id="qr_${esc(z)}"></div>
          </div>

          <div class="qrLinks">
            <div class="muted" style="font-size:.85rem;">Посилання (як запасний варіант):</div>
            <div class="linkLine" id="ln_${esc(z)}" style="word-break:break-all;">${esc(url)}</div>

            <div class="miniBtns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              <button class="btn btn--ghost" type="button" data-copy="${esc(z)}">Скопіювати лінк</button>
              <button class="btn btn--ghost" type="button" data-open="${esc(z)}">Відкрити</button>
              <button class="btn btn--primary" type="button" data-savepng="${esc(z)}">Зберегти QR PNG</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // draw QR
    ZONES.forEach(z=>{
      const url = makeJudgeUrl(z, token, ctx.activeKey);
      const holder = document.getElementById("qr_" + z);
      if(holder){
        holder.innerHTML = "";
        new window.QRCode(holder, {
          text: url,
          width: 240,
          height: 240,
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
        const ok = await copyText(txt);
        if(ok){
          setMsg(`✅ Лінк скопійовано для зони ${z}`, true);
          setTimeout(()=>setMsg("",true), 1200);
        }else{
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

    out.querySelectorAll("[data-savepng]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const z = btn.getAttribute("data-savepng");
        const box = document.getElementById("qr_" + z);
        if(!box){
          setMsg("❌ Не знайшов QR контейнер.", false);
          return;
        }
        const dataUrl = getQrDataUrlFromBox(box);
        if(!dataUrl){
          setMsg("❌ QR не згенерувався. Перевір qrcode.min.js.", false);
          return;
        }

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `SC_JUDGE_${z}_${token}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setMsg(`✅ PNG збережено: зона ${z}`, true);
        setTimeout(()=>setMsg("",true), 1200);
      });
    });
  }

  async function generateAll(){
    try{
      setMsg("Завантаження…", true);

      await waitFirebase();
      ensureQrLib();

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
      setMsg("✅ QR створено. Натисни “Зберегти QR PNG” і надішли суддям їхню зону.", true);

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

  // auto token
  if(tokenInput && !tokenInput.value) tokenInput.value = randToken();

})();
