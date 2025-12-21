// assets/js/draw_admin.js
(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const stageSelect = document.getElementById("stageSelect"); // <select>
  const listPaid = document.getElementById("paidList");       // div
  const listPicked = document.getElementById("pickedList");   // div
  const msg = document.getElementById("msg");

  if (!auth || !db || !window.firebase) return;

  const SECTORS = (() => {
    const out = [];
    ["A","B","C"].forEach(z => {
      for (let i=1;i<=8;i++) out.push(`${z}${i}`);
    });
    return out;
  })();

  const escapeHtml = (s) => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const setMsg = (t, ok=true) => {
    if (!msg) return;
    msg.textContent = t || "";
    msg.classList.remove("ok","err");
    if (t) msg.classList.add(ok ? "ok" : "err");
  };

  // --- helpers: stageId normalize ---
  // Ми будемо використовувати stageId як ключ: `${competitionId}__${stageId||"main"}`
  const makeStageKey = (competitionId, stageId) =>
    `${competitionId}__${(stageId || "main").replace(/[^\w-]/g, "_")}`;

  // --- load stages from competitions (same logic as register) ---
  async function loadStages() {
    stageSelect.innerHTML = `<option value="">Оберіть етап…</option>`;
    const snap = await db.collection("competitions").get();

    snap.forEach(docSnap => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;
      const brand = c.brand || "STOLAR CARP";
      const compTitle = c.title || c.name || compId;

      if (Array.isArray(c.events) && c.events.length) {
        c.events.forEach((ev, idx) => {
          const stageId = ev.key || ev.stageId || ev.id || `stage-${idx+1}`;
          const stageTitle = ev.title || ev.name || (String(stageId).toLowerCase().includes("final") ? "Фінал" : `Етап ${idx+1}`);
          const value = JSON.stringify({ competitionId: compId, stageId });
          const label = `${brand} · ${compTitle} — ${stageTitle}`;
          stageSelect.insertAdjacentHTML("beforeend", `<option value='${escapeHtml(value)}'>${escapeHtml(label)}</option>`);
        });
      } else {
        const value = JSON.stringify({ competitionId: compId, stageId: null });
        const label = `${brand} · ${compTitle}`;
        stageSelect.insertAdjacentHTML("beforeend", `<option value='${escapeHtml(value)}'>${escapeHtml(label)}</option>`);
      }
    });
  }

  // --- listen stage selection ---
  let unsubPaid = null;
  let unsubPicks = null;

  function clearSubs() {
    if (unsubPaid) unsubPaid(); unsubPaid = null;
    if (unsubPicks) unsubPicks(); unsubPicks = null;
  }

  function renderPaid(regs, usedSet, stageKey) {
    if (!listPaid) return;
    if (!regs.length) {
      listPaid.innerHTML = `<div class="form__hint">Немає оплачених команд для жеребкування.</div>`;
      return;
    }

    listPaid.innerHTML = regs.map(r => {
      const regId = r.id;
      const team = r.teamName || "—";
      const captain = r.captain || "";
      const phone = r.phone || "";

      const options = SECTORS
        .filter(s => !usedSet.has(s))
        .map(s => `<option value="${s}">${s}</option>`)
        .join("");

      return `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;font-size:18px;">${escapeHtml(team)}</div>
              <div class="form__hint">Капітан: ${escapeHtml(captain)} • ${escapeHtml(phone)}</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <select class="select" data-pick="${regId}" style="min-width:140px;">
                <option value="">Сектор…</option>
                ${options}
              </select>
              <button class="btn btn--primary" data-assign="${regId}">Призначити</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    listPaid.querySelectorAll("[data-assign]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const regId = btn.getAttribute("data-assign");
        const sel = listPaid.querySelector(`[data-pick="${regId}"]`);
        const sector = sel?.value || "";
        if (!sector) return setMsg("Обери сектор.", false);

        const zone = sector.charAt(0);

        // atomic lock: create draws/{stageKey}/picks/{sector}
        const pickRef = db.collection("draws").doc(stageKey).collection("picks").doc(sector);
        const regRef = db.collection("registrations").doc(regId);

        try {
          setMsg("Зберігаю…");
          await db.runTransaction(async (tx) => {
            const pickSnap = await tx.get(pickRef);
            if (pickSnap.exists) throw new Error("Цей сектор вже зайнятий.");

            const regSnap = await tx.get(regRef);
            if (!regSnap.exists) throw new Error("Заявка не знайдена.");
            const reg = regSnap.data() || {};
            if (reg.status !== "paid") throw new Error("Команда не в статусі 'paid'.");

            tx.set(pickRef, {
              regId,
              teamId: reg.teamId || null,
              teamName: reg.teamName || "",
              zone,
              sector,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              createdBy: auth.currentUser?.uid || null
            });

            tx.update(regRef, {
              status: "drawn",
              draw: {
                zone, sector,
                drawnAt: firebase.firestore.FieldValue.serverTimestamp(),
                drawnBy: auth.currentUser?.uid || null
              }
            });
          });

          setMsg(`Призначено: ${sector} ✅`, true);
        } catch (e) {
          console.error(e);
          setMsg(e.message || "Помилка жеребкування.", false);
        }
      });
    });
  }

  function renderPicked(picks, stageKey) {
    if (!listPicked) return;
    if (!picks.length) {
      listPicked.innerHTML = `<div class="form__hint">Ще немає призначених секторів.</div>`;
      return;
    }

    // sort A1..A8,B1..,C1..
    picks.sort((a,b) => (a.sector||"").localeCompare(b.sector||"", "uk"));

    listPicked.innerHTML = picks.map(p => {
      return `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${escapeHtml(p.teamName || "—")}</div>
              <div class="form__hint">Сектор: <b>${escapeHtml(p.sector)}</b> • Зона: <b>${escapeHtml(p.zone)}</b></div>
            </div>
            <button class="btn btn--ghost" data-unpick="${escapeHtml(p.sector)}">Звільнити</button>
          </div>
        </div>
      `;
    }).join("");

    listPicked.querySelectorAll("[data-unpick]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sector = btn.getAttribute("data-unpick");
        if (!sector) return;

        const pickRef = db.collection("draws").doc(stageKey).collection("picks").doc(sector);

        try {
          setMsg("Видаляю…");
          // знайдемо regId з pick doc, щоб повернути статус назад в paid
          const pickSnap = await pickRef.get();
          if (!pickSnap.exists) return setMsg("Цей сектор вже вільний.", false);

          const regId = (pickSnap.data() || {}).regId;
          await db.runTransaction(async (tx) => {
            tx.delete(pickRef);
            if (regId) {
              const regRef = db.collection("registrations").doc(regId);
              const regSnap = await tx.get(regRef);
              if (regSnap.exists) {
                tx.update(regRef, { status: "paid", draw: firebase.firestore.FieldValue.delete() });
              }
            }
          });

          setMsg(`Сектор ${sector} звільнено ✅`, true);
        } catch (e) {
          console.error(e);
          setMsg("Помилка звільнення.", false);
        }
      });
    });
  }

  function bindStage(stageKey, competitionId, stageId) {
    clearSubs();
    setMsg("");

    // 1) live picks
    unsubPicks = db.collection("draws").doc(stageKey).collection("picks")
      .onSnapshot((snap) => {
        const picks = [];
        const used = new Set();
        snap.forEach(d => {
          const p = d.data() || {};
          p.sector = d.id;
          picks.push(p);
          if (p.sector) used.add(p.sector);
        });

        renderPicked(picks, stageKey);

        // 2) live paid regs (only those not drawn)
        if (unsubPaid) unsubPaid();

        let q = db.collection("registrations")
          .where("competitionId", "==", competitionId)
          .where("status", "==", "paid");

        if (stageId) q = q.where("stageId", "==", stageId);
        else q = q.where("stageId", "==", null);

        unsubPaid = q.onSnapshot((rsnap) => {
          const regs = [];
          rsnap.forEach(r => regs.push({ id: r.id, ...(r.data()||{}) }));
          renderPaid(regs, used, stageKey);
        });
      });
  }

  stageSelect?.addEventListener("change", () => {
    const v = stageSelect.value || "";
    if (!v) return clearSubs();

    const parsed = JSON.parse(v);
    const competitionId = parsed.competitionId;
    const stageId = parsed.stageId || null;
    const stageKey = makeStageKey(competitionId, stageId);

    bindStage(stageKey, competitionId, stageId);
  });

  // init
  auth.onAuthStateChanged(async (u) => {
    if (!u) return setMsg("Увійди як адмін.", false);
    await loadStages();
  });
})();
