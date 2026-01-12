// assets/js/judge_qr_admin.js
// STOLAR CARP • Admin • QR access for judges
// ✔ admin-only
// ✔ Firestore judgeTokens
// ✔ zone restricted
// ✔ TTL based
// ✔ QR + link rendering

(function () {
  "use strict";

  // ===== helpers =====
  const $ = (id) => document.getElementById(id);
  const norm = (v) => String(v ?? "").trim();
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );

  // ===== UI =====
  const stageSelect = $("stageSelect");
  const zoneSelect  = $("zoneSelect");
  const ttlSelect   = $("ttlSelect");
  const btnGenerate = $("btnGenerate");

  const msgEl      = $("msg");
  const authPill   = $("authPill");
  const resultCard = $("resultCard");
  const qrBox      = $("qr");
  const qrUrlEl    = $("qrUrl");

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.className = "muted " + (text ? (ok ? "ok" : "err") : "");
  }

  // ===== Firebase =====
  async function waitFirebase() {
    for (let i = 0; i < 150; i++) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Firebase не ініціалізувався");
  }

  let auth, db, fb;

  async function requireAdmin(user) {
    if (!user) return false;
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      const role = snap.exists ? (snap.data()?.role || "") : "";
      return role === "admin";
    } catch {
      return false;
    }
  }

  // ===== data =====
  async function loadStages() {
    stageSelect.innerHTML = `<option value="">— завантаження… —</option>`;

    const items = [];
    const snap = await db.collection("competitions").get();

    snap.forEach((doc) => {
      const c = doc.data() || {};
      const compId = doc.id;

      const brand = c.brand || "STOLAR CARP";
      const title = c.name || compId;

      (c.events || []).forEach((ev, i) => {
        const key = String(ev.key || `stage-${i + 1}`);
        const label = `${brand} · ${title} — ${ev.name || `Етап ${i + 1}`}`;

        items.push({
          value: `${compId}||${key}`,
          label,
        });
      });
    });

    items.sort((a, b) => a.label.localeCompare(b.label, "uk"));

    stageSelect.innerHTML =
      `<option value="">— обери етап —</option>` +
      items.map(
        (x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`
      ).join("");
  }

  function randomToken() {
    return "SC-" + Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  function expiresAfterHours(h) {
    const d = new Date();
    d.setHours(d.getHours() + Number(h || 24));
    return fb.firestore.Timestamp.fromDate(d);
  }

  // ===== generate QR =====
  async function generateQR() {
    const stageVal = norm(stageSelect.value);
    const zone     = norm(zoneSelect.value).toUpperCase();
    const ttlHrs   = Number(ttlSelect.value || 24);

    if (!stageVal) {
      setMsg("Оберіть етап.", false);
      return;
    }
    if (!["A", "B", "C"].includes(zone)) {
      setMsg("Неправильна зона.", false);
      return;
    }

    const [compId, stageId] = stageVal.split("||");
    const token = randomToken();

    setMsg("Генерую QR…", true);

    await db.collection("judgeTokens").doc(token).set({
      token,
      enabled: true,
      compId,
      stageId,
      key: stageVal,
      allowedZones: [zone],
      expiresAt: expiresAfterHours(ttlHrs),
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser.uid,
    });

    const url =
      `${location.origin}/weigh_judge.html` +
      `?zone=${encodeURIComponent(zone)}` +
      `&token=${encodeURIComponent(token)}` +
      `&key=${encodeURIComponent(stageVal)}`;

    // render QR
    qrBox.innerHTML = "";
    new QRCode(qrBox, {
      text: url,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel.M,
    });

    qrUrlEl.textContent = url;

    resultCard.style.display = "block";
    setMsg(`✅ QR створено (${zone}, ${ttlHrs} год)`, true);
  }

  // ===== boot =====
  async function boot() {
    try {
      await waitFirebase();
      auth = window.scAuth;
      db   = window.scDb;
      fb   = window.firebase;
    } catch (e) {
      setMsg(e.message || "Firebase error", false);
      return;
    }

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        authPill.textContent = "auth: ❌";
        setMsg("Увійдіть як адмін.", false);
        return;
      }

      const ok = await requireAdmin(user);
      if (!ok) {
        authPill.textContent = "auth: ❌";
        setMsg("Цей акаунт не адмін.", false);
        return;
      }

      authPill.textContent = "auth: ✅ адмін";
      await loadStages();
      setMsg("Готово. Оберіть етап, зону і термін.", true);
    });

    btnGenerate.addEventListener("click", generateQR);
  }

  boot();
})();
