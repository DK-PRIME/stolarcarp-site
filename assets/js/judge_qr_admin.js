// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • QR generator for judges
// ▶ creates judgeTokens/{token}
// ▶ TTL-based access
// ▶ zone restricted
// ▶ links to weigh_judge.html (anonymous)

(function(){
  "use strict";

  const ADMIN_UID = "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  const auth = window.scAuth;
  const db   = window.scDb;
  const fb   = window.firebase;

  const $ = (id)=>document.getElementById(id);

  const stageSelect = $("stageSelect");
  const zoneSelect  = $("zoneSelect");
  const ttlSelect   = $("ttlSelect");
  const btnGenerate = $("btnGenerate");

  const msgEl       = $("msg");
  const authPill    = $("authPill");

  const resultCard  = $("resultCard");
  const qrBox       = $("qr");
  const qrUrlEl     = $("qrUrl");

  function norm(v){ return String(v ?? "").trim(); }
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m])); }

  function setMsg(t, ok=true){
    if(!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = "muted " + (t ? (ok ? "ok":"err") : "");
  }

  async function requireAdmin(user){
    if(!user) return false;
    if(user.uid === ADMIN_UID) return true;

    const snap = await db.collection("users").doc(user.uid).get();
    const role = (snap.exists ? (snap.data()||{}).role : "") || "";
    return role === "admin";
  }

  // ===== load competitions/stages =====
  async function loadStages(){
    stageSelect.innerHTML = `<option value="">— завантаження… —</option>`;
    const items = [];

    const snap = await db.collection("competitions").get();
    snap.forEach(docSnap=>{
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year  = c.year || c.seasonYear || "";
      const title = c.name || c.title || (year ? `Season ${year}` : compId);

      const events = Array.isArray(c.events) ? c.events : [];
      events.forEach((ev, i)=>{
        const key = String(ev.key || ev.stageId || ev.id || `stage-${i+1}`);
        const stageTitle = ev.title || ev.name || `Етап ${i+1}`;
        items.push({
          value: `${compId}||${key}`,
          label: `${brand} · ${title} — ${stageTitle}`
        });
      });
    });

    items.sort((a,b)=>a.label.localeCompare(b.label,"uk"));

    stageSelect.innerHTML =
      `<option value="">— обери етап —</option>` +
      items.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
  }

  function randomToken(){
    return "SC-" + Math.random().toString(36).slice(2,10).toUpperCase();
  }

  function addHours(h){
    const d = new Date();
    d.setHours(d.getHours() + Number(h || 24));
    return fb.firestore.Timestamp.fromDate(d);
  }

  // ===== generate QR =====
  async function generateQR(){
    const stageVal = norm(stageSelect.value);
    const zone     = norm(zoneSelect.value).toUpperCase();
    const ttlHrs   = Number(ttlSelect.value || 24);

    if(!stageVal){
      setMsg("Оберіть етап.", false);
      return;
    }
    if(!["A","B","C"].includes(zone)){
      setMsg("Неправильна зона.", false);
      return;
    }

    const [compId, stageId] = stageVal.split("||");
    const token = randomToken();
    const expiresAt = addHours(ttlHrs);

    setMsg("Генерую QR…", true);

    await db.collection("judgeTokens").doc(token).set({
      token,
      enabled: true,
      compId,
      stageId,
      key: stageVal,
      allowedZones: [zone],
      expiresAt,
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    const url =
      `${location.origin}/weigh_judge.html` +
      `?zone=${encodeURIComponent(zone)}` +
      `&token=${encodeURIComponent(token)}` +
      `&key=${encodeURIComponent(stageVal)}`;

    // render
    qrBox.innerHTML = "";
    new QRCode(qrBox, {
      text: url,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel.M
    });

    qrUrlEl.textContent = url;
    resultCard.style.display = "block";

    setMsg(`✅ QR створено (${zone}, ${ttlHrs} год)`, true);
  }

  // ===== boot =====
  async function boot(){
    if(!auth || !db || !fb){
      setMsg("Firebase не ініціалізувався.", false);
      return;
    }

    auth.onAuthStateChanged(async (user)=>{
      if(!user){
        authPill.textContent = "auth: ❌";
        setMsg("Увійдіть як адмін.", false);
        return;
      }

      const ok = await requireAdmin(user);
      if(!ok){
        authPill.textContent = "auth: ❌";
        setMsg("Цей акаунт не адмін.", false);
        return;
      }

      authPill.textContent = "auth: ✅ адмін";
      await loadStages();
      setMsg("Готово. Оберіть етап і зону.", true);
    });

    btnGenerate.addEventListener("click", generateQR);
  }

  boot();
})();
