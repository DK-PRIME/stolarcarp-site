const db = window.scDb;

const sectorList = [];
["A","B","C"].forEach(z=>{
  for(let i=1;i<=8;i++) sectorList.push(`${z}${i}`);
});

let usedSectors = new Set();

function renderRow(reg) {
  const row = document.createElement("div");
  row.className = "draw-row";

  const sectorSelect = document.createElement("select");
  sectorSelect.innerHTML =
    `<option value="">— сектор —</option>` +
    sectorList.map(s =>
      `<option value="${s}" ${usedSectors.has(s) ? "disabled" : ""}>${s}</option>`
    ).join("");

  if (reg.sector) {
    sectorSelect.value = reg.sector;
    usedSectors.add(reg.sector);
  }

  sectorSelect.onchange = () => {
    usedSectors.clear();
    document.querySelectorAll(".draw-row select").forEach(sel=>{
      if (sel.value) usedSectors.add(sel.value);
    });
    refreshAllSelects();
  };

  const bigFish = document.createElement("select");
  bigFish.innerHTML = `
    <option value="">ні</option>
    <option value="yes">так</option>
  `;
  bigFish.value = reg.bigFishTotal ? "yes" : "";

  row.innerHTML = `<b>${reg.teamName}</b>`;
  row.appendChild(sectorSelect);
  row.appendChild(bigFish);

  row.dataset.id = reg.id;

  return row;
}

function refreshAllSelects() {
  document.querySelectorAll(".draw-row").forEach(row=>{
    const sel = row.querySelector("select");
    const current = sel.value;
    sel.innerHTML =
      `<option value="">— сектор —</option>` +
      sectorList.map(s =>
        `<option value="${s}"
          ${usedSectors.has(s) && s!==current ? "disabled" : ""}>
          ${s}
        </option>`
      ).join("");
    sel.value = current;
  });
}

async function loadDraw(stageId) {
  const wrap = document.getElementById("drawList");
  wrap.innerHTML = "";
  usedSectors.clear();

  const snap = await db.collection("registrations")
    .where("stageId","==",stageId)
    .where("status","==","paid")
    .get();

  snap.forEach(doc=>{
    const data = doc.data();
    const row = renderRow({ id: doc.id, ...data });
    wrap.appendChild(row);
  });
}

async function saveDraw() {
  const rows = document.querySelectorAll(".draw-row");
  for (const row of rows) {
    const id = row.dataset.id;
    const sector = row.querySelector("select").value;
    const bigFish = row.querySelectorAll("select")[1].value === "yes";

    if (!sector) continue;

    await db.collection("registrations").doc(id).update({
      sector,
      zone: sector[0],
      bigFishTotal: bigFish
    });
  }
  alert("Жеребкування збережено ✅");
}
