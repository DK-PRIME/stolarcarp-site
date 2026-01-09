// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • Judge QR (A/B/C) • 72h tokens
// ✅ creates/updates judgeTokens/{token} with expiresAt (+72h)
// ✅ builds links to weigh_judge.html?zone=A&token=SC-XXXX&compId=...&stageId=...&w=W1
// ✅ mobile friendly output: wrapped boxes + copy buttons
// ✅ reads settings/app to show current activeKey + status ("weighing" enables judges; "finished" stops)

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const TOKEN_COL = "judgeTokens";       // judgeTokens/{token}
  const APP_DOC = "settings/app";        // settings/app
  const DEFAULT_W = "W1";
  const TOKEN_HOURS = 72;

  // ---------- UI (expected ids on the page) ----------
  // input for token:
  const tokenInput = document.getElementById("tokenInput") || document.getElementById("token") || document.querySelector("[data-judge-token]");
  // buttons:
  const btnRandom = document.getElementById("btnRandomToken") || document.getElementById("btnRandom") || document.querySelector("[data-judge-random]");
  const btnGenerate = document.getElementById("btnGenerateLinks") || document.getElementById("btnGenerate") || document.querySelector("[data-judge-generate]");
  // output:
  const out = document.getElementById("qrOut") || document.getElementById("out") || document.querySelector("[data-judge-out]");
  const msgEl = document.getElementById("msg") || document.querySelector("[data-judge-msg]");

  // If page doesn't have required nodes, do nothing.
  if (!out) return;

  // ---------- helpers ----------
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

  function nowMs() { return Date.now(); }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function fmtLocal(dt) {
    try {
      const d = dt instanceof Date ? dt : new Date(dt);
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    } catch { return "—"; }
  }

  function randomToken() {
    // SC- + 10-12 chars
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "SC-";
    for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function buildUrl(base, params) {
    const u = new URL(base, location.origin);
    Object.keys(params).forEach((k) => {
      if (params[k] === undefined || params[k] === null || params[k] === "") return;
      u.searchParams.set(k, String(params[k]));
    });
    return u.toString();
  }

  function copyText(txt) {
    const s = String(txt || "");
    if (!s) return Promise.resolve(false);

    // modern
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).then(() => true).catch(() => fallbackCopy(s));
    }
    return fallbackCopy(s);

    function fallbackCopy(text) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return Promise.resolve(!!ok);
      } catch {
        return Promise.resolve(false);
      }
    }
  }

  function injectMobileCss() {
    if (document.getElementById("scJudgeQrCss")) return;

    const css = `
      <style id="scJudgeQrCss">
        .jq-card{
          background: rgba(15,23,42,.92);
          border: 1px solid rgba(148,163,184,.25);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 18px 40px rgba(0,0,0,.45);
        }
        .jq-row{ display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
        .jq-title{ font-weight: 900; font-size: 1.02rem; }
        .jq-sub{ opacity:.78; font-size:.88rem; line-height:1.35; }
        .jq-badge{
          display:inline-flex; align-items:center; gap:8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,.25);
          background: rgba(2,6,23,.35);
          font-weight: 800;
          font-size: .86rem;
        }
        .jq-badge.ok{ border-color: rgba(143,227,154,.35); }
        .jq-badge.err{ border-color: rgba(255,108,108,.35); }
        .jq-box{
          margin-top: 12px;
          border: 1px solid rgba(148,163,184,.20);
          background: rgba(2,6,23,.25);
          border-radius: 14px;
          padding: 10px;
        }
        .jq-line{ display:flex; gap:10px; align-items:flex-start; justify-content:space-between; }
        .jq-zone{ font-weight: 900; width: 26px; flex: 0 0 auto; opacity:.9; }
        .jq-url{
          flex: 1 1 auto;
          min-width: 0;
          word-break: break-word;
          overflow-wrap: anywhere;
          font-size: .88rem;
          line-height: 1.25;
          opacity: .92;
        }
        .jq-actions{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
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
        .jq-btn:active{ transform: translateY(1px); }
        .jq-small{ font-size:.84rem; opacity:.8; }
        @media (max-width: 420px){
          .jq-btn{ width:100%; }
        }
      </style>
    `;
    document.head.insertAdjacentHTML("beforeend", css);
  }

  // ---------- Firebase wait ----------
  async function waitFirebase(maxMs = 14000) {
    const t0 = nowMs();
    while (nowMs() - t0 < maxMs) {
      if (window.scDb && window.firebase && window.scAuth) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Firebase init не піднявся (scDb/firebase/scAuth).");
  }

  // ---------- read active ctx ----------
  async function getAppCtx(db) {
    const snap = await db.collection("settings").doc("app").get();
    const d = snap.exists ? (snap.data() || {}) : {};

    const compId =
      norm(d.activeCompetitionId || d.activeCompetition || d.competitionId || "");

    const stageId =
      norm(d.activeStageId || d.stageId || "stage-1") || "stage-1";

    // activeKey: якщо нема — збираємо як compId||stageId
    const activeKey = norm(d.activeKey || "") || (compId && stageId ? `${compId}||${stageId}` : "");

    const status = norm(d.status || "weighing"); // default for safety

    return { compId, stageId, activeKey, status };
  }

  // ---------- token write ----------
  async function upsertToken(db, token, ctx, zone) {
    const cleanToken = norm(token);
    if (!cleanToken) throw new Error("Порожній token.");

    const expiresAt = new Date(nowMs() + TOKEN_HOURS * 60 * 60 * 1000);

    await db.collection(TOKEN_COL).doc(cleanToken).set({
      token: cleanToken,
      compId: ctx.compId,
      stageId: ctx.stageId,
      activeKey: ctx.activeKey,
      zone: zone, // "A"/"B"/"C" або null для універсального
      expiresAt: window.firebase.firestore.Timestamp.fromDate(expiresAt),
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: window.scAuth?.currentUser?.uid || null
    }, { merge: true });

    return expiresAt;
  }

  // ---------- render ----------
  function renderLinks(ctx, token, urls, expiresAt) {
    injectMobileCss();

    const okWeighing = String(ctx.status || "").toLowerCase() === "weighing";

    out.innerHTML = `
      <div class="jq-card">
        <div class="jq-row">
          <div>
            <div class="jq-title">QR / посилання для суддів (A/B/C)</div>
            <div class="jq-sub" style="margin-top:6px;">
              activeKey: <code>${esc(ctx.activeKey || "—")}</code><br>
              compId: <code>${esc(ctx.compId || "—")}</code> · stageId: <code>${esc(ctx.stageId || "—")}</code><br>
              Token діє до: <b>${esc(fmtLocal(expiresAt))}</b> (72 години)
            </div>
          </div>

          <div class="jq-badge ${okWeighing ? "ok" : "err"}">
            ${okWeighing ? "✅ Зважування активне" : "⛔ Зважування не активне"}
          </div>
        </div>

        ${okWeighing ? "" : `
          <div class="jq-box" style="margin-top:12px;">
            <div class="jq-sub">
              Увага: <b>status ≠ weighing</b>. Суддя побачить посилання, але запис даних має бути заблокований (це робиться у weigh_judge.js + Rules).
            </div>
          </div>
        `}

        ${["A","B","C"].map(z => `
          <div class="jq-box">
            <div class="jq-line">
              <div class="jq-zone">${z}:</div>
              <div class="jq-url" id="url_${z}">${esc(urls[z] || "")}</div>
            </div>
            <div class="jq-actions">
              <button class="jq-btn primary" type="button" data-copy="${z}">Скопіювати посилання ${z}</button>
              <button class="jq-btn" type="button" data-open="${z}">Відкрити ${z}</button>
            </div>
          </div>
        `).join("")}

        <div class="jq-box">
          <div class="jq-sub">
            Порада: зроби QR-код з посиланням потрібної зони (A/B/C). Суддя сканує → одразу попадає у свою зону.
          </div>
        </div>
      </div>
    `;

    // events
    out.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const z = btn.getAttribute("data-copy");
        const u = urls[z] || "";
        const ok = await copyText(u);
        if (ok) setMsg(`✅ Скопійовано посилання ${z}`, true);
        else setMsg(`❌ Не вдалося скопіювати ${z}`, false);
        setTimeout(() => setMsg("", true), 1200);
      });
    });

    out.querySelectorAll("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const z = btn.getAttribute("data-open");
        const u = urls[z] || "";
        if (u) window.open(u, "_blank", "noopener");
      });
    });
  }

  // ---------- main ----------
  (async function boot() {
    try {
      await waitFirebase();
      const db = window.scDb;

      // ВАЖЛИВО: тут адмін сторінка, тому юзер вже має бути залогінений як адмін у вашій адмінці
      // Якщо не залогінений — просто не дасть створити токен.
      const user = window.scAuth?.currentUser || null;
      if (!user) {
        setMsg("❌ Увійди в адмінці (auth), щоб генерувати токени.", false);
      }

      // restore / set default token
      if (tokenInput && !norm(tokenInput.value)) tokenInput.value = randomToken();

      // random token
      btnRandom?.addEventListener("click", () => {
        if (tokenInput) tokenInput.value = randomToken();
        setMsg("✅ Token згенеровано", true);
        setTimeout(() => setMsg("", true), 900);
      });

      // generate links
      btnGenerate?.addEventListener("click", async () => {
        try {
          setMsg("Зберігаю token…", true);

          const token = norm(tokenInput?.value || "");
          if (!token || !token.startsWith("SC-")) {
            setMsg("❌ Token має бути у форматі SC-XXXX", false);
            return;
          }

          const ctx = await getAppCtx(db);
          if (!ctx.compId || !ctx.stageId || !ctx.activeKey) {
            setMsg("❌ Нема активного етапу. Перевір settings/app (activeCompetitionId + activeStageId/activeKey).", false);
            return;
          }

          // створюємо універсальний токен (без прив’язки до зони) — бо URL вже має zone=A/B/C
          const expiresAt = await upsertToken(db, token, ctx, null);

          // build URLs
          const baseJudge = "/weigh_judge.html"; // ✅ твоя сторінка судді
          const urls = {
            A: buildUrl(baseJudge, { zone: "A", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
            B: buildUrl(baseJudge, { zone: "B", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
            C: buildUrl(baseJudge, { zone: "C", token, compId: ctx.compId, stageId: ctx.stageId, w: DEFAULT_W }),
          };

          renderLinks(ctx, token, urls, expiresAt);

          setMsg("✅ Готово. Згенерував посилання A/B/C.", true);
          setTimeout(() => setMsg("", true), 1400);

        } catch (e) {
          console.error(e);
          setMsg("❌ " + (e?.message || e), false);
        }
      });

      // initial info card (optional)
      try {
        const ctx = await getAppCtx(db);
        out.innerHTML = `
          <div class="jq-card">
            <div class="jq-title">QR для суддів (A/B/C)</div>
            <div class="jq-sub" style="margin-top:8px;">
              Активний етап береться з <code>settings/app</code>.<br>
              Зараз: <code>${esc(ctx.activeKey || "—")}</code><br>
              status: <b>${esc(ctx.status || "—")}</b>
            </div>
            <div class="jq-sub" style="margin-top:10px;">Введи/згенеруй token і натисни “Згенерувати посилання A/B/C”.</div>
          </div>
        `;
        injectMobileCss();
      } catch {}

    } catch (e) {
      console.error(e);
      setMsg("❌ " + (e?.message || e), false);
    }
  })();
})();
