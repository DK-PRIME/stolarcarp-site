// assets/js/my_participation.js
(function () {
  const box = document.getElementById("myCompetitions");
  if (!box) return;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Firebase not ready");
  }

  function formatDate(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("uk-UA");
  }

  function pill(text, cls = "") {
    return `<span class="meta-pill ${cls}">${text}</span>`;
  }

  async function loadParticipation(user) {
    const db = window.scDb;

    // отримуємо користувача → teamId
    const uSnap = await db.collection("users").doc(user.uid).get();
    if (!uSnap.exists) {
      box.innerHTML = `<div class="cabinet-small-muted">Немає профілю користувача</div>`;
      return;
    }

    const userData = uSnap.data();
    if (!userData.teamId) {
      box.innerHTML = `<div class="cabinet-small-muted">Ви ще не в команді</div>`;
      return;
    }

    // шукаємо заявки цієї команди
    const qSnap = await db
      .collection("registrations")
      .where("teamId", "==", userData.teamId)
      .orderBy("createdAt", "desc")
      .get();

    if (qSnap.empty) {
      box.innerHTML = `<div class="cabinet-small-muted">Заявок ще немає</div>`;
      return;
    }

    let html = "";

    qSnap.forEach(doc => {
      const r = doc.data();

      html += `
        <div class="meta-pill" style="display:block;margin-bottom:8px;">
          <strong>${r.teamName || "Команда"}</strong><br>
          ${r.competitionName || "STOLAR CARP"} · ${r.stageName || "Етап"}<br>
          Дата подачі: ${formatDate(r.createdAt)}<br>
          Статус: <strong>${r.status || "очікує підтвердження"}</strong>
        </div>
      `;
    });

    box.innerHTML = html;
  }

  (async () => {
    try {
      await waitFirebase();

      window.scAuth.onAuthStateChanged(async (user) => {
        if (!user) {
          box.innerHTML = `<div class="cabinet-small-muted">Увійдіть у акаунт</div>`;
          return;
        }
        await loadParticipation(user);
      });

    } catch (e) {
      console.error(e);
      box.innerHTML = `<div class="cabinet-small-muted">Помилка завантаження участі</div>`;
    }
  })();
})();
