(function () {
  "use strict";

  const db = window.scDb;
  const auth = window.scAuth;

  const stageSelect = document.getElementById("stageSelect");
  const drawList = document.getElementById("drawList");
  const saveBtn = document.getElementById("saveDrawBtn");

  let registrations = [];
  let usedSectors = new Set();

  const SECTORS = [];
  ["A", "B", "C"].forEach(z =>
    Array.from({ length: 8 }, (_, i) => SECTORS.push(`${z}${i + 1}`))
  );

  /* =========================
     Load stages
     ========================= */
  async function loadStages() {
    const snap = await db.collection("competitions").get();
    stageSelect.innerHTML = "";

    snap.forEach(doc => {
      const c = doc.data();
      (c.events || []).forEach(ev => {
        const opt = document.createElement("option");
        opt.value = `${doc.id}||${ev.key}`;
        opt.textContent = `${c.name} — ${ev.key}`;
        stageSelect.appendChild(opt);
      });
    });

    stageSelect.onchange = loadRegistrations;
    loadRegistrations();
  }

  /* =========================
     Load paid registrations
     ========================= */
  async function loadRegistrations() {
    drawList.innerHTML = "Завантаження...";
    usedSectors.clear();

    const [competitionId, stageId] = stageSelect.value.split("||");

    const snap = await db.collection("registrations")
      .where("competitionId", "==", competitionId)
      .where("stageId", "==", stageId)
      .where("status", "==", "paid")
      .get();

    registrations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderList();
  }

  /* =========================
     Render list
     ========================= */
  function renderList() {
    drawList.innerHTML = "";

    registrations.forEach(reg => {
      const row = document.createElement("div");
      row.className = "admin-card";

      const sectorSelect = document.createElement("select");
      sectorSelect.innerHTML = `<option value="">Сектор</option>` +
        SECTORS.map(s => `<option value="${s}">${s}</option>`).join("");

      sectorSelect.onchange = () => {
        usedSectors.clear();
        document.querySelectorAll("[data-sector]").forEach(sel => {
          if (sel.value) usedSectors.add(sel.value);
        });
        updateSectorLocks();
      };

      sectorSelect.dataset.sector = "1";

      const bigFish = document.createElement("select");
      bigFish.innerHTML = `
        <option value="no">BigFish Total — ні</option>
        <option value="yes">BigFish Total — так</option>
      `;

      row.innerHTML = `<b>${reg.teamName}</b>`;
      row.appendChild(sectorSelect);
      row.appendChild(bigFish);

      drawList.appendChild(row);

      reg._sectorSelect = sectorSelect;
      reg._bigFishSelect = bigFish;
    });
  }

  function updateSectorLocks() {
    document.querySelectorAll("[data-sector]").forEach(sel => {
      Array.from(sel.options).forEach(opt => {
        if (!opt.value) return;
        opt.disabled = usedSectors.has(opt.value) && sel.value !== opt.value;
      });
    });
  }

  /* =========================
     Save draw
     ========================= */
  saveBtn.onclick = async () => {
    for (const reg of registrations) {
      if (!reg._sectorSelect.value) {
        alert("Не всі команди мають сектор");
        return;
      }

      await db.collection("registrations").doc(reg.id).update({
        sector: reg._sectorSelect.value,
        zone: reg._sectorSelect.value[0],
        bigFishTotal: reg._bigFishSelect.value === "yes",
        drawCompleted: true
      });
    }

    alert("✅ Жеребкування збережено");
  };

  /* =========================
     Init
     ========================= */
  auth.onAuthStateChanged(user => {
    if (!user) return;
    loadStages();
  });

})();
