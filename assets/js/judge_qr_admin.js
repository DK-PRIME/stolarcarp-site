// assets/js/judge_qr_admin.js
(function () {
  const out = document.getElementById("qrOut");
  if (!out) return;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready (scDb/firebase)");
  }

  function randToken(len = 28) {
    const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  // ✅ Єдине джерело правди: settings/app
  async function getActiveCtx() {
    const snap = await window.scDb.collection("settings").doc("app").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    const compId = String(d.activeCompetitionId || "");
    const stageId = String(d.activeStageId || "");
    const stageKey = compId && stageId ? `${compId}||${stageId}` : "";
    return { compId, stageId, stageKey };
  }

  async function createToken(ctx, zone) {
    const token = randToken(28);
    const ref = window.scDb.collection("judgeTokens").doc(token);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

    await ref.set({
      token,
      zone: String(zone || ""),
      compId: ctx.compId || "",
      stageId: ctx.stageId || "",
      stageKey: ctx.stageKey || "",
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: window.firebase.firestore.Timestamp.fromDate(expiresAt),
      usedAt: null,
      usedBy: null,
      isActive: true,
    });

    // ✅ judge.html в корені сайту
    const urlObj = new URL("/judge.html", location.origin);
    urlObj.searchParams.set("token", token);
    // зона дублюємо в URL (не обов'язково, але зручно)
    urlObj.searchParams.set("zone", zone);

    return urlObj.toString();
  }

  async function gen(zone) {
    try {
      out.textContent = "Генерую…";
      await waitFirebase();

      const ctx = await getActiveCtx();
      if (!ctx || !ctx.compId || !ctx.stageId) {
        out.innerHTML =
          `<div class="msg err">Немає activeCompetitionId / activeStageId у <b>settings/app</b>.</div>`;
        return;
      }

      const url = await createToken(ctx, zone);

      out.innerHTML = `
        <div style="margin-top:8px;">
          <b>Зона ${zone}</b><br>
          <div style="opacity:.85; font-size:12px; margin:4px 0 6px;">
            compId: <code>${ctx.compId}</code><br>
            stageId: <code>${ctx.stageId}</code>
          </div>
          <a href="${url}" target="_blank" rel="noopener">${url}</a><br>
          <span style="opacity:.8;">Одноразовий вхід. Діє 24 год.</span>
        </div>
      `;
    } catch (e) {
      console.error(e);
      out.innerHTML = `<div class="msg err">${String(e.message || e)}</div>`;
    }
  }

  document.getElementById("genA")?.addEventListener("click", () => gen("A"));
  document.getElementById("genB")?.addEventListener("click", () => gen("B"));
  document.getElementById("genC")?.addEventListener("click", () => gen("C"));
})();
