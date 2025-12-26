// assets/js/judge_qr_admin.js
(function(){
  const out = document.getElementById("qrOut");
  if(!out) return;

  function randToken(len=24){
    const abc="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s="";
    for(let i=0;i<len;i++) s+=abc[Math.floor(Math.random()*abc.length)];
    return s;
  }

  async function createToken(stageId, zone){
    const token = randToken(28);
    const ref = window.scDb.collection("judgeTokens").doc(token);

    const now = new Date();
    const expires = new Date(now.getTime() + 24*60*60*1000); // +24h

    await ref.set({
      stageId,
      zone,
      used:false,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: window.firebase.firestore.Timestamp.fromDate(expires)
    });

    return token;
  }

  async function getActiveStageId(){
    // якщо в тебе settings.activeStageId — підставиш тут.
    // тимчасово: читаємо settings/main
    const doc = await window.scDb.collection("settings").doc("main").get();
    const d = doc.exists ? doc.data() : {};
    return d.activeStageId || d.activeStage || null;
  }

  async function gen(zone){
    out.textContent = "Генерую...";
    const stageId = await getActiveStageId();
    if(!stageId){
      out.textContent = "Не знайдено activeStageId у settings/main";
      return;
    }

    const token = await createToken(stageId, zone);
    const url = `${location.origin}/judge.html?t=${token}`;

    // Поки без картинки QR — просто лінк (QR згенеруємо наступним кроком).
    out.innerHTML = `
      <div style="margin-top:8px;">
        <b>Зона ${zone}</b><br>
        <a href="${url}" target="_blank">${url}</a><br>
        <span style="opacity:.8;">Одноразовий вхід. Діє 24 год.</span>
      </div>
    `;
  }

  document.getElementById("genA")?.addEventListener("click", () => gen("A"));
  document.getElementById("genB")?.addEventListener("click", () => gen("B"));
  document.getElementById("genC")?.addEventListener("click", () => gen("C"));
})();
