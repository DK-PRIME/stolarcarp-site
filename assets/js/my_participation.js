// assets/js/my_participation.js
// STOLAR CARP • Cabinet: show only stages where TEAM already has registrations
(function () {

  const box = document.getElementById("myCompetitions");
  if (!box) return;

  const esc = (s) => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");

  function setText(t){
    box.innerHTML = `<div class="cabinet-small-muted">${esc(t)}</div>`;
  }

  async function waitFirebase(maxMs = 12000){
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready");
  }

  function fmtTs(ts){
    try {
      const d = ts?.toDate ? ts.toDate() : null;
      return d ? d.toLocaleString("uk-UA") : "—";
    } catch {
      return "—";
    }
  }

  function statusLabel(s){
    return s === "confirmed" ? "Підтверджено"
      : s === "pending_payment" ? "Очікує оплату"
      : s === "cancelled" ? "Скасовано"
      : (s || "—");
  }

  function statusColor(s){
    if (s === "confirmed") return "#22c55e";
    if (s === "pending_payment") return "#facc15";
    if (s === "cancelled") return "#ef4444";
    return "#9ca3af";
  }

  async function loadStageMap(db){
    const map = new Map();
    const snap = await db.collection("competitions").get();

    snap.forEach(docSnap => {
      const c = docSnap.data() || {};
      const compId = docSnap.id;

      const brand = c.brand || "STOLAR CARP";
      const year  = c.year || "";
      const title = c.name || c.title || (year ? `Season ${year}` : compId);

      const events = Array.isArray(c.events) ? c.events : null;
      if (events && events.length){
        events.forEach((ev, i) => {
          const stageId = String(ev.key || ev.stageId || ev.id || `stage-${i+1}`);
          const stageTitle = ev.title || ev.name || ev.label || `Етап ${i+1}`;
          map.set(`${compId}||${stageId}`, `${brand} · ${title} — ${stageTitle}`);
        });
      } else {
        map.set(`${compId}||`, `${brand} · ${title}`);
      }
    });

    return map;
  }

  async function init(){
    try {
      setText("Завантаження участі…");
      await waitFirebase();

      const auth = window.scAuth;
      const db   = window.scDb;

      auth.onAuthStateChanged(async (user) => {
        if (!user){
          setText("Увійдіть у акаунт, щоб бачити участь.");
          return;
        }

        try {
          // user → teamId
          const uSnap = await db.collection("users").doc(user.uid).get();
          const u = uSnap.data() || {};
          const teamId = u.teamId;

          if (!teamId){
            setText("Ви ще не в команді.");
            return;
          }

          const stageMap = await loadStageMap(db);

          const snap = await db.collection("registrations")
            .where("teamId", "==", teamId)
            .get();

          const best = new Map();
          const rank = s => s === "confirmed" ? 3 : s === "pending_payment" ? 2 : 1;

          snap.forEach(d => {
            const r = d.data() || {};
            if (r.status === "cancelled") return;

            const key = `${r.competitionId || ""}||${r.stageId || ""}`;
            const prev = best.get(key);
            if (!prev || rank(r.status) > rank(prev.status)) {
              best.set(key, { id: d.id, ...r });
            }
          });

          const items = Array.from(best.values());

          if (!items.length){
            setText("Поки що немає поданих заявок.");
            return;
          }

          items.sort((a,b)=>
            (b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)
          );

          box.innerHTML = items.map(r => {
            const key = `${r.competitionId || ""}||${r.stageId || ""}`;
            const label = stageMap.get(key) || key;

            return `
              <div class="meta-pill" style="display:block;padding:10px 12px;margin:8px 0;">
                <div style="font-weight:700;margin-bottom:4px;">
                  ${esc(label)}
                </div>
                <div style="font-size:.82rem;color:#9ca3af;display:flex;gap:10px;flex-wrap:wrap;">
                  <span>Команда: <b style="color:#e5e7eb">${esc(r.teamName||"—")}</b></span>
                  <span>Подано: <b style="color:#e5e7eb">${esc(fmtTs(r.createdAt))}</b></span>
                  <span>Статус:
                    <b style="color:${statusColor(r.status)}">${esc(statusLabel(r.status))}</b>
                  </span>
                </div>
              </div>
            `;
          }).join("");

        } catch (e){
          console.error(e);
          setText("Помилка завантаження участі.");
        }
      });

    } catch (e){
      console.error(e);
      setText("Firebase не готовий.");
    }
  }

  init();
})();
