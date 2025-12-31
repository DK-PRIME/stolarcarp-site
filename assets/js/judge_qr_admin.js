// assets/js/judge_qr_admin.js
(function () {
  "use strict";

  const out = document.getElementById("qrOut");
  if (!out) return;

  const db   = window.scDb;
  const auth = window.scAuth;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scDb && window.firebase) {
        // якщо є auth — добре, але не блокуємо, якщо сторінка без нього
        return;
      }
      await new Promise((r) => setTimeout(r, 120));
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
    const compId  = String(d.activeCompetitionId || "");
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
    urlObj.searchParams.set("zone", String(zone || ""));

    return urlObj.toString();
  }

  function renderOk({ zone, ctx, url }) {
    // ✅ word-break щоб нічого не вилазило на мобілці
    out.innerHTML = `
      <div style="margin-top:8px;">
        <b>Зона ${zone}</b><br>
        <div style="opacity:.85; font-size:12px; margin:4px 0 6px;">
          compId: <code>${ctx.compId}</code><br>
          stageId: <code>${ctx.stageId}</code>
        </div>

        <div style="padding:10px 12px; border-radius:12px; border:1px solid rgba(148,163,184,.22); background:rgba(2,6,23,.35);">
          <a href="${url}" target="_blank" rel="noopener"
             style="display:block; color:#cbd5e1; text-decoration:none; overflow-wrap:anywhere; word-break:break-word;">
            ${url}
          </a>
        </div>

        <div style="margin-top:6px; opacity:.8; font-size:12px;">
          Одноразовий вхід. Діє 24 год.
        </div>
      </div>
    `;
  }

  function renderErr(html) {
    out.innerHTML = `<div class="msg err">${html}</div>`;
  }

  async function gen(zone) {
    try {
      out.textContent = "Генерую…";
      await waitFirebase();

      const ctx = await getActiveCtx();
      if (!ctx || !ctx.compId || !ctx.stageId) {
        renderErr(`Немає activeCompetitionId / activeStageId у <b>settings/app</b>.`);
        return;
      }

      const url = await createToken(ctx, zone);
      renderOk({ zone, ctx, url });
    } catch (e) {
      console.error(e);
      renderErr(String(e.message || e));
    }
  }

  document.getElementById("genA")?.addEventListener("click", () => gen("A"));
  document.getElementById("genB")?.addEventListener("click", () => gen("B"));
  document.getElementById("genC")?.addEventListener("click", () => gen("C"));
})();
