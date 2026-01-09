// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • Judge QR A/B/C (72h)
// ✅ Draws QR images for each zone (A/B/C) + copy/open buttons
// ✅ Saves token to Firestore judgeTokens/{token} with expiresAt (+72h)
// ✅ Uses settings/app as source of active comp/stage/key
// ✅ Mobile portrait friendly layout (no overflow)

(function () {
  "use strict";

  const TOKEN_COL = "judgeTokens"; // judgeTokens/{token}
  const TOKEN_HOURS = 72;
  const DEFAULT_W = "W1";

  // --- expected DOM ---
  const tokenInput =
    document.getElementById("tokenInput") ||
    document.getElementById("token") ||
    document.querySelector("[data-judge-token]");

  const btnRandom =
    document.getElementById("btnRandomToken") ||
    document.getElementById("btnRandom") ||
    document.querySelector("[data-judge-random]");

  const btnGenerate =
    document.getElementById("btnGenerateLinks") ||
    document.getElementById("btnGenerate") ||
    document.querySelector("[data-judge-generate]");

  const out =
    document.getElementById("qrOut") ||
    document.getElementById("out") ||
    document.querySelector("[data-judge-out]");

  const msgEl =
    document.getElementById("msg") ||
    document.querySelector("[data-judge-msg]");

  if (!out) return;

  // --- helpers ---
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  function setMsg(t, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.style.color = t ? (ok ? "#8fe39a" : "#ff6c6c") : "";
  }

  function norm(v) { return String(v ?? "").trim(); }

  function randomToken() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "SC-";
    for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function nowMs(){ return Date.now(); }

  function pad2(n){ return String(n).padStart(2, "0"); }

  function fmtLocal(d){
    try{
      const dt = d instanceof Date ? d : new Date(d);
      return `${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}.${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }catch{ return "—"; }
  }

  function buildUrl(path, params) {
    const u = new URL(path, location.origin);
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null || v === "") return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  async function copyText(txt) {
    const s = String(txt || "");
    if (!s) return false;

    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(s); return true; } catch {}
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function injectCss(){
    if (document.getElementById("scJudgeQrCss")) return;
    document.head.insertAdjacentHTML("beforeend", `
      <style id="scJudgeQrCss">
        .jq-card{
          background: rgba(15,23,42,.92);
          border: 1px solid rgba(148,163,184,.25);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 18px 40px rgba(0,0,0,.45);
        }
        .jq-top{ display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
        .jq-title{ font-weight:900; font-size:1.05rem; }
        .jq-sub{ opacity:.78; font-size:.88rem; line-height:1.35; margin-top:6px; }
        .jq-badge{
          display:inline-flex; align-items:center; gap:8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,.25);
          background: rgba(2,6,23,.35);
          font-weight: 900;
          font-size: .86rem;
          white-space: nowrap;
        }
        .jq-badge.ok{ border-color: rgba(143,227,154,.35); }
        .jq-badge.err{ border-color: rgba(255,108,108,.35); }

        .jq-grid{
          display:grid;
          grid-template-columns: 1fr;
          gap:12px;
          margin-top:12px;
        }
        .jq-zoneCard{
          border: 1px solid rgba(148,163,184,.18);
          background: rgba(2,6,23,.25);
          border-radius: 16px;
          padding: 12px;
        }
        .jq-zoneHead{
          display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
        }
        .jq-zoneName{ font-weight: 900; font-size: 1rem; }
        .jq-qr{
          display:flex; align-items:center; justify-content:center;
          width: 210px; max-width: 100%;
          margin-top:10px;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,.18);
          background: rgba(2,6,23,.28);
        }
        .jq-url{
          margin-top:10px;
          font-size:.86rem;
          opacity:.9;
          word-break: break-word;
          overflow-wrap: anywhere;
          line-height:1.25;
        }
        .jq-actions{
          display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;
        }
        .jq-btn{
          appearance:none;
          border: 1px solid rgba(148,163,184,.25);
          background: rgba(2,6,23,.30);
          color: #e5e7eb;
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 900;
        }
        .jq-btn.primary{
          border: 0;
          background: linear-gradient(135deg, #fbbf24, #fb7185);
          color: #111827;
        }
        @media (max-width: 420px){
          .jq-btn{ width:100%; }
          .jq-qr{ width: 100%; }
        }
      </style>
    `);
  }

  async function waitFirebase(maxMs = 14000) {
    const t0 = nowMs();
    while (nowMs() - t0 < maxMs) {
      if (window.scDb && window.firebase && window.scAuth) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Firebase init не піднявся (scDb/firebase/scAuth).");
  }

  async function getAppCtx(db){
    const snap = await db.collection("settings").doc("app").get();
    const d = snap.exists ? (snap.data()||{}) : {};

    const compId = norm(d.activeCompetitionId || d.activeCompetition || d.competitionId || "");
    const stageId = norm(d.activeStageId || d.stageId || "stage-1") || "stage-1";
    const activeKey = norm(d.activeKey || "") || (compId && stageId ? `${compId}||${stageId}` : "");
    const status = norm(d.status || "weighing"); // weighing / finished / paused ...

    return { compId, stageId, activeKey, status };
  }

  async function upsertToken(db, token, ctx){
    const clean = norm(token);
    if(!clean) throw new Error("Порожній token.");

    const expiresAt = new Date(nowMs() + TOKEN_HOURS * 60 * 60 * 1000);

    await db.collection(TOKEN_COL).doc(clean).set({
      token: clean,
      compId: ctx.compId,
      stageId: ctx.stageId,
      activeKey: ctx.activeKey,
      expiresAt: window.firebase.firestore.Timestamp.fromDate(expiresAt),
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: window.scAuth?.currentUser?.uid || null
    }, { merge:true });

    return expiresAt;
  }

  function render(ctx, token, expiresAt, urls){
    injectCss();

    const okWeighing = String(ctx.status || "").toLowerCase() === "weighing";

    out.innerHTML = `
      <div class="jq-card">
        <div class="jq-top">
          <div>
            <div class="jq-title">QR доступ для суддів (A/B/C)</div>
            <div class="jq-sub">
              activeKey: <code>${esc(ctx.activeKey || "—")}</code><br>
              compId: <code>${esc(ctx.compId || "—")}</code> · stageId: <code>${esc(ctx.stageId || "—")}</code><br>
              token: <b>${esc(token)}</b><br>
              діє до: <b>${esc(fmtLocal(expiresAt))}</b> (72 год)
            </div>
          </div>

          <div class="jq-badge ${okWeighing ? "ok":"err"}">
            ${okWeighing ? "✅ зважування активне" : "⛔ зважування не активне"}
          </div>
        </div>

        <div class="jq-grid">
          ${["A","B","C"].map(z=>`
            <div class="jq-zoneCard" data-zonecard="${z}">
              <div class="jq-zoneHead">
                <div class="jq-zoneName">Зона ${z}</div>
                <div style="opacity:.75;font-size:.86rem;">QR + посилання</div>
              </div>

              <div class="jq-qr" id="qr_${z}"></div>

              <div class="jq-url" id="url_${z}">${esc(urls[z] || "")}</div>

              <div class="jq-actions">
                <button class="jq-btn primary" type="button" data-copy="${z}">Скопіювати посилання</button>
                <button class="jq-btn" type="button" data-open="${z}">Відкрити</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // draw QR
    ["A","B","C"].forEach(z=>{
      const box = document.getElementById(`qr_${z}`);
      const url = urls[z] || "";
      if(!box) return;

      box.innerHTML = "";
      if (window.QRCode) {
        // QRCode.js draws into element
        new window.QRCode(box, {
          text: url,
          width: 180,
          height: 180,
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } else {
        box.innerHTML = `<div style="opacity:.8;font-size:.9rem;">❌ Нема QRCode бібліотеки</div>`;
      }
    });

    // actions
    out.querySelectorAll("[data-copy]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const z = btn.getAttribute("data-copy");
        const ok = await copyText(urls[z] || "");
        setMsg(ok ? `✅ Скопійовано (зона ${z})` : `❌ Не вдалося скопіювати (зона ${z})`, ok);
        setTimeout(()=>setMsg("", true), 1200);
      });
    });

    out.querySelectorAll("[data-open]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const z = btn.getAttribute("data-open");
        const u = urls[z] || "";
        if(u) window.open(u, "_blank", "noopener");
      });
    });
  }

  (async function boot(){
    try{
      await waitFirebase();
      const db = window.scDb;

      // default token
      if (tokenInput && !norm(tokenInput.value)) tokenInput.value = randomToken();

      btnRandom?.addEventListener("click", ()=>{
        if(tokenInput) tokenInput.value = randomToken();
        setMsg("✅ Token згенеровано", true);
        setTimeout(()=>setMsg("", true), 900);
      });

      btnGenerate?.addEventListener("click", async ()=>{
        try{
          const token = norm(tokenInput?.value || "");
          if(!token || !token.startsWith("SC-")){
            setMsg("❌ Token має бути у форматі SC-XXXX", false);
            return;
          }

          const ctx = await getAppCtx(db);
          if(!ctx.compId || !ctx.stageId || !ctx.activeKey){
            setMsg("❌ Нема активного етапу. Перевір settings/app (activeCompetitionId + activeStageId/activeKey).", false);
            return;
          }

          setMsg("Зберігаю token…", true);
          const expiresAt = await upsertToken(db, token, ctx);

          // ВАЖЛИВО: шлях до сторінки судді
          // Якщо у тебе вона в /admin-weigh/weigh_judge.html — зміни тут:
          const judgePath = "/weigh_judge.html";

          const urls = {
            A: buildUrl(judgePath, { zone:"A", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
            B: buildUrl(judgePath, { zone:"B", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
            C: buildUrl(judgePath, { zone:"C", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
          };

          render(ctx, token, expiresAt, urls);
          setMsg("✅ QR та посилання згенеровано (A/B/C).", true);
          setTimeout(()=>setMsg("", true), 1400);

        }catch(e){
          console.error(e);
          setMsg("❌ " + (e?.message || e), false);
        }
      });

      // стартовий екран
      injectCss();
      out.innerHTML = `
        <div class="jq-card">
          <div class="jq-title">QR для суддів (A/B/C)</div>
          <div class="jq-sub">Згенеруй token → натисни “Згенерувати посилання/QR”.</div>
        </div>
      `;

    }catch(e){
      console.error(e);
      setMsg("❌ " + (e?.message || e), false);
    }
  })();

})();
