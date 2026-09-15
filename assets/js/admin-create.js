// assets/js/admin-create.js
// STOLAR CARP • admin-create (Create/Edit competitions)
//
// ✅ season / oneoff
// ✅ formats
// ✅ TEAM / SOLO entryType
// ✅ stalker-solo => solo
// ✅ інші формати => team
// ✅ entryType пишеться в competition / events / engine
// ✅ final завжди TEAM у поточній системі qualification
//
// =========================================================
// ONE-OFF DELETE
// =========================================================
//
// Для type === "oneoff":
//
// Після натискання "Видалити змагання"
// виконується HARD DELETE.
//
// Видаляється:
// • competitions
// • registrations
// • registrations_deleted
// • public_participants
// • weighings
// • stageResults
// • stageResults/{doc}/teams
// • judgeTokens
// • mealOrders
// • mealSettings
// • випадкові хвости у seasonResults
// • випадкові хвости у finalQualifications
//
// НІЧОГО НЕ АРХІВУЄТЬСЯ.
//
// Для type === "season":
// стара логіка не змінюється.
//
// =========================================================

(function(){
  "use strict";

  const DRAFT_KEY =
    "sc_admin_create_draft_v1";

  const $ =
    (id)=>
      document.getElementById(id);

  const setStatus =
    (t)=>{
      const e =
        $("createStatus");

      if(e){
        e.textContent =
          t;
      }
    };

  const setDebug =
    (t)=>{
      const e =
        $("createDebug");

      if(e){
        e.textContent =
          t || "";
      }
    };

  const setMsg =
    (html)=>{
      const e =
        $("createMsg");

      if(e){
        e.innerHTML =
          html || "";
      }
    };

  function show(el){
    el &&
    el.classList.remove(
      "hidden"
    );
  }

  function hide(el){
    el &&
    el.classList.add(
      "hidden"
    );
  }

  function esc(s){
    return String(
      s || ""
    ).replace(
      /[&<>"']/g,
      m=>({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
      }[m])
    );
  }

  // =========================================================
  // FIREBASE
  // =========================================================

  async function waitForFirebase(){
    for(
      let i=0;
      i<140;
      i++
    ){
      if(
        window.scAuth &&
        window.scDb &&
        window.firebase
      ){
        return;
      }

      await new Promise(
        r=>
          setTimeout(
            r,
            100
          )
      );
    }

    throw new Error(
      "Firebase init не підняв scAuth/scDb. Перевір assets/js/firebase-init.js."
    );
  }

  let auth =
    null;

  let db =
    null;

  let fb =
    null;

  let currentSavedCompId =
    "";

  // =========================================================
  // MODE
  // =========================================================

  const url =
    new URL(
      location.href
    );

  const mode =
    (
      url.searchParams.get(
        "mode"
      ) ||
      "create"
    ).toLowerCase();

  const isEditMode =
    mode ===
    "edit";

  // =========================================================
  // DOM
  // =========================================================

  const gate =
    $("createGate");

  const app =
    $("createApp");

  const tabCreate =
    $("tabCreate");

  const tabEdit =
    $("tabEdit");

  const editPicker =
    $("editPicker");

  const deleteWrap =
    $("deleteWrap");

  const inpType =
    $("inpType");

  const inpYear =
    $("inpYear");

  const inpName =
    $("inpName");

  const inpFormat =
    $("inpFormat");

  const inpLake =
    $("inpLake");

  const inpStartAt =
    $("inpStartAt");

  const inpFinishAt =
    $("inpFinishAt");

  const outDuration =
    $("outDuration");

  const outDurationHours =
    $("outDurationHours");

  const outDurationDays =
    $("outDurationDays");

  const seasonOnly =
    $("seasonOnly");

  const inpStagesCount =
    $("inpStagesCount");

  const inpHasFinal =
    $("inpHasFinal");

  const inpRegMode =
    $("inpRegMode");

  const inpPayEnabled =
    $("inpPayEnabled");

  const inpRegOpen =
    $("inpRegOpen");

  const inpRegClose =
    $("inpRegClose");

  const inpPrice =
    $("inpPrice");

  const inpCurrency =
    $("inpCurrency");

  const inpPayDetails =
    $("inpPayDetails");

  const regPreview =
    $("regPreview");

  const btnSave =
    $("btnSave");

  const btnMakeActive =
    $("btnMakeActive");

  const btnResetDraft =
    $("btnResetDraft");

  const btnDelete =
    $("btnDelete");

  const selCompetition =
    $("selCompetition");

  const btnReloadList =
    $("btnReloadList");

  const editPickerMsg =
    $("editPickerMsg");

  const formatFieldsEl =
    $("formatFields");

  let activeFormatName =
    "";

  let activeFormat =
    null;

  // =========================================================
  // FORMAT UI
  // =========================================================

  function renderFormatSpecificFields(
    html
  ){
    if(
      !formatFieldsEl
    ){
      return;
    }

    formatFieldsEl.innerHTML =
      html || "";
  }

  function getRegistry(){
    const sc =
      window.SC_FORMATS ||
      null;

    if(!sc){
      return null;
    }

    if(
      typeof sc.get ===
      "function"
    ){
      return sc;
    }

    if(
      sc.registry &&
      typeof sc.registry.get ===
        "function"
    ){
      return sc.registry;
    }

    return null;
  }

  function getPreset(
    name
  ){
    const reg =
      getRegistry();

    const key =
      String(
        name || ""
      ).toLowerCase();

    if(
      !reg ||
      !key
    ){
      return null;
    }

    try{
      return (
        reg.get(
          key
        ) ||
        null
      );

    }catch(_){
      return null;
    }
  }

  // =========================================================
  // ENTRY TYPE
  // =========================================================

  function entryTypeFromFormat(
    formatName
  ){
    const format =
      String(
        formatName || ""
      )
        .trim()
        .toLowerCase();

    return (
      format ===
      "stalker-solo"
    )
      ? "solo"
      : "team";
  }

  async function activateFormat(
    formatName,
    opts
  ){
    const requested =
      String(
        formatName ||
        "classic"
      ).toLowerCase();

    const preset =
      getPreset(
        requested
      );

    activeFormatName =
      requested ||
      "classic";

    activeFormat =
      preset ||
      null;

    renderFormatSpecificFields(
      ""
    );

    if(
      !activeFormat
    ){
      return;
    }

    if(
      typeof activeFormat.init ===
      "function"
    ){
      await activeFormat.init({
        render:
          renderFormatSpecificFields,

        $,
        esc
      });
    }

    if(
      opts &&
      opts.deserializeData &&
      typeof activeFormat.deserialize ===
        "function"
    ){
      try{
        await activeFormat.deserialize(
          opts.deserializeData,
          {
            render:
              renderFormatSpecificFields,

            $,
            esc
          }
        );

      }catch(e){
        console.warn(
          "deserialize error:",
          e
        );
      }
    }
  }

  // =========================================================
  // DRAFT
  // =========================================================

  function getDraft(){
    try{
      return JSON.parse(
        localStorage.getItem(
          DRAFT_KEY
        ) ||
        "null"
      );

    }catch{
      return null;
    }
  }

  function setDraft(
    data
  ){
    try{
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify(
          data
        )
      );

    }catch{}
  }

  function clearDraft(){
    try{
      localStorage.removeItem(
        DRAFT_KEY
      );

    }catch{}
  }

  // =========================================================
  // CACHE
  // =========================================================

  function clearCompetitionCaches(){
    try{
      Object
        .keys(
          localStorage
        )
        .forEach(
          key=>{
            if(
              key.startsWith(
                "sc_competitions_cache_"
              )
            ){
              localStorage.removeItem(
                key
              );
            }
          }
        );

    }catch(e){
      console.warn(
        "[admin-create] competition cache cleanup:",
        e
      );
    }
  }

  // =========================================================
  // DATE HELPERS
  // =========================================================

  function parseLocalDateTime(
    v
  ){
    const s =
      (
        v || ""
      ).trim();

    if(!s){
      return null;
    }

    const m =
      s.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      );

    if(!m){
      return null;
    }

    const dt =
      new Date(
        +m[1],
        +m[2]-1,
        +m[3],
        +m[4],
        +m[5],
        0,
        0
      );

    return Number.isNaN(
      dt.getTime()
    )
      ? null
      : dt;
  }

  function toDateTimeLocalValue(
    date
  ){
    if(!date){
      return "";
    }

    const pad =
      (n)=>
        String(n)
          .padStart(
            2,
            "0"
          );

    return (
      `${date.getFullYear()}-` +
      `${pad(date.getMonth()+1)}-` +
      `${pad(date.getDate())}T` +
      `${pad(date.getHours())}:` +
      `${pad(date.getMinutes())}`
    );
  }

  function toDateOnly(
    date
  ){
    if(!date){
      return "";
    }

    const pad =
      (n)=>
        String(n)
          .padStart(
            2,
            "0"
          );

    return (
      `${date.getFullYear()}-` +
      `${pad(date.getMonth()+1)}-` +
      `${pad(date.getDate())}`
    );
  }

  function timestampToDate(
    ts
  ){
    if(!ts){
      return null;
    }

    if(
      ts instanceof Date
    ){
      return ts;
    }

    if(
      typeof ts.toDate ===
      "function"
    ){
      return ts.toDate();
    }

    if(
      typeof ts ===
        "string" ||
      typeof ts ===
        "number"
    ){
      const d =
        new Date(
          ts
        );

      return Number.isFinite(
        d.getTime()
      )
        ? d
        : null;
    }

    if(
      ts.seconds
    ){
      const d =
        new Date(
          ts.seconds *
          1000
        );

      return Number.isFinite(
        d.getTime()
      )
        ? d
        : null;
    }

    return null;
  }

  function diffMinutes(
    a,
    b
  ){
    if(
      !a ||
      !b
    ){
      return null;
    }

    const ms =
      b.getTime() -
      a.getTime();

    return Number.isFinite(
      ms
    )
      ? Math.floor(
          ms / 60000
        )
      : null;
  }

  function normDate(
    v
  ){
    const s =
      (
        v || ""
      ).trim();

    if(!s){
      return "";
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(
      s
    )
      ? s
      : "";
  }

  function addDays(
    dateStr,
    days
  ){
    const [
      y,
      m,
      d
    ] =
      dateStr
        .split("-")
        .map(Number);

    const dt =
      new Date(
        Date.UTC(
          y,
          m-1,
          d,
          12,
          0,
          0
        )
      );

    dt.setUTCDate(
      dt.getUTCDate() +
      days
    );

    const pad =
      (n)=>
        String(n)
          .padStart(
            2,
            "0"
          );

    return (
      `${dt.getUTCFullYear()}-` +
      `${pad(dt.getUTCMonth()+1)}-` +
      `${pad(dt.getUTCDate())}`
    );
  }

  function regOpenFromStartDate(
    startDateStr
  ){
    return startDateStr
      ? addDays(
          startDateStr,
          -28
        )
      : "";
  }

  function regCloseFromStartDate(
    startDateStr
  ){
    return startDateStr
      ? addDays(
          startDateStr,
          -14
        )
      : "";
  }

  function startDateOnly(){
    const dt =
      parseLocalDateTime(
        inpStartAt?.value ||
        ""
      );

    return dt
      ? toDateOnly(
          dt
        )
      : "";
  }

  function registrationStatusFromBlock(
    regBlock
  ){
    const today =
      toDateOnly(
        new Date()
      );

    const open =
      regBlock.openDate ||
      "";

    const close =
      regBlock.closeDate ||
      "";

    if(
      open &&
      today < open
    ){
      return "pending";
    }

    if(
      close &&
      today > close
    ){
      return "closed";
    }

    return "open";
  }

  function firstMoneyValue(
    ...values
  ){
    for(
      const value of
      values
    ){
      if(
        value === 0
      ){
        return 0;
      }

      if(
        value === null ||
        value === undefined ||
        value === ""
      ){
        continue;
      }

      const num =
        Number(
          String(
            value
          ).replace(
            ",",
            "."
          )
        );

      if(
        Number.isFinite(
          num
        )
      ){
        return num;
      }
    }

    return null;
  }

  // =========================================================
  // ADMIN
  // =========================================================

  async function requireAdmin(
    user
  ){
    if(!user){
      return false;
    }

    try{
      const snap =
        await db
          .collection(
            "users"
          )
          .doc(
            user.uid
          )
          .get();

      return (
        String(
          (
            snap.data() ||
            {}
          ).role ||
          ""
        ).toLowerCase() ===
        "admin"
      );

    }catch(_){
      return false;
    }
  }

  // =========================================================
  // TABS
  // =========================================================

  function setActiveTab(
    isEdit
  ){
    if(
      tabCreate &&
      tabEdit
    ){
      tabCreate.classList.toggle(
        "pill--active",
        !isEdit
      );

      tabEdit.classList.toggle(
        "pill--active",
        isEdit
      );
    }

    if(
      editPicker
    ){
      (
        isEdit
          ? show
          : hide
      )(
        editPicker
      );
    }

    if(
      deleteWrap
    ){
      (
        isEdit
          ? show
          : hide
      )(
        deleteWrap
      );
    }
  }

  function gotoMode(
    nextMode
  ){
    const u =
      new URL(
        location.href
      );

    if(
      nextMode ===
      "edit"
    ){
      u.searchParams.set(
        "mode",
        "edit"
      );

    }else{
      u.searchParams.delete(
        "mode"
      );
    }

    location.href =
      u.toString();
  }

  // =========================================================
  // LAKES
  // =========================================================

  async function loadLakes(){
    if(
      !inpLake
    ){
      return;
    }

    inpLake.innerHTML =
      `<option value="">Завантаження…</option>`;

    try{
      const snap =
        await db
          .collection(
            "lakes"
          )
          .get();

      const items =
        snap.docs.map(
          d=>({
            id:
              d.id,

            name:
              (
                d.data() ||
                {}
              ).name ||
              d.id
          })
        );

      items.sort(
        (a,b)=>
          (
            a.name ||
            ""
          ).localeCompare(
            b.name ||
            "",
            "uk"
          )
      );

      if(
        !items.length
      ){
        inpLake.innerHTML =
          `<option value="">Нема водойм</option>`;

        return;
      }

      inpLake.innerHTML =
        `<option value="">— вибери водойму —</option>` +
        items.map(
          it=>
            `<option value="${esc(it.id)}">${esc(it.name)}</option>`
        ).join("");

    }catch(e){
      inpLake.innerHTML =
        `<option value="">Помилка</option>`;

      setDebug(
        e?.message ||
        String(e)
      );
    }
  }

  // =========================================================
  // COMPETITIONS LIST
  // =========================================================

  async function loadCompetitionsList(){
    if(
      !selCompetition
    ){
      return;
    }

    selCompetition.innerHTML =
      `<option value="">Завантаження…</option>`;

    if(
      editPickerMsg
    ){
      editPickerMsg.textContent =
        "";
    }

    let activeId =
      "";

    try{
      const s =
        await db
          .collection(
            "settings"
          )
          .doc(
            "app"
          )
          .get();

      if(
        s.exists
      ){
        activeId =
          (
            s.data() ||
            {}
          ).activeCompetitionId ||
          "";
      }

    }catch(_){}

    const snap =
      await db
        .collection(
          "competitions"
        )
        .get();

    const items =
      snap.docs.map(
        doc=>{
          const d =
            doc.data() ||
            {};

          return {
            id:
              doc.id,

            year:
              d.year ||
              0,

            name:
              d.name ||
              doc.id,

            active:
              doc.id ===
              activeId
          };
        }
      );

    items.sort(
      (a,b)=>
        (
          b.year -
          a.year
        ) ||
        (
          a.name ||
          ""
        ).localeCompare(
          b.name ||
          "",
          "uk"
        )
    );

    if(
      !items.length
    ){
      selCompetition.innerHTML =
        `<option value="">Нема змагань</option>`;

      return;
    }

    selCompetition.innerHTML =
      `<option value="">— вибери —</option>` +
      items.map(
        it=>{
          const label =
            `${
              it.active
                ? "✅ "
                : ""
            }${it.id} — ${it.name}`;

          return (
            `<option value="${esc(it.id)}">` +
            `${esc(label)}` +
            `</option>`
          );
        }
      ).join("");
  }

  // =========================================================
  // UI
  // =========================================================

  function setSeasonVisibility(){
    const type =
      inpType?.value ||
      "season";

    if(
      seasonOnly
    ){
      (
        type === "season"
          ? show
          : hide
      )(
        seasonOnly
      );
    }
  }

  function updateDurationUI(){
    const a =
      parseLocalDateTime(
        inpStartAt?.value ||
        ""
      );

    const b =
      parseLocalDateTime(
        inpFinishAt?.value ||
        ""
      );

    const mins =
      diffMinutes(
        a,
        b
      );

    if(
      !a ||
      !b ||
      mins === null
    ){
      if(
        outDuration
      ){
        outDuration.value =
          "—";
      }

      if(
        outDurationHours
      ){
        outDurationHours.value =
          "—";
      }

      if(
        outDurationDays
      ){
        outDurationDays.value =
          "—";
      }

      return;
    }

    if(
      mins <= 0
    ){
      if(
        outDuration
      ){
        outDuration.value =
          "❌ Фініш після старту";
      }

      if(
        outDurationHours
      ){
        outDurationHours.value =
          "—";
      }

      if(
        outDurationDays
      ){
        outDurationDays.value =
          "—";
      }

      return;
    }

    const hours =
      mins / 60;

    const days =
      hours / 24;

    if(
      outDuration
    ){
      outDuration.value =
        `${Math.round(hours)} год (${days.toFixed(2)} доби)`;
    }

    if(
      outDurationHours
    ){
      outDurationHours.value =
        hours.toFixed(
          2
        );
    }

    if(
      outDurationDays
    ){
      outDurationDays.value =
        days.toFixed(
          2
        );
    }
  }

  function updateRegUI(){
    const mode =
      inpRegMode?.value ||
      "auto";

    if(
      mode === "manual"
    ){
      if(
        inpRegOpen
      ){
        inpRegOpen.disabled =
          false;
      }

      if(
        inpRegClose
      ){
        inpRegClose.disabled =
          false;
      }

      if(
        regPreview
      ){
        const o =
          normDate(
            inpRegOpen?.value
          ) ||
          "—";

        const c =
          normDate(
            inpRegClose?.value
          ) ||
          "—";

        const status =
          registrationStatusFromBlock({
            openDate:
              o === "—"
                ? ""
                : o,

            closeDate:
              c === "—"
                ? ""
                : c
          });

        const label =
          status === "open"
            ? "✅ ВІДКРИТО"
            : (
                status === "closed"
                  ? "❌ Закрито"
                  : "⏳ Очікується"
              );

        regPreview.innerHTML =
          `Реєстрація: <b>MANUAL</b> (${esc(o)} → ${esc(c)}) <b>${label}</b>`;
      }

      return;
    }

    if(
      inpRegOpen
    ){
      inpRegOpen.disabled =
        true;
    }

    if(
      inpRegClose
    ){
      inpRegClose.disabled =
        true;
    }

    const startD =
      startDateOnly();

    if(
      !startD
    ){
      if(
        regPreview
      ){
        regPreview.textContent =
          "Реєстрація: —";
      }

      return;
    }

    const o =
      regOpenFromStartDate(
        startD
      );

    const c =
      regCloseFromStartDate(
        startD
      );

    const status =
      registrationStatusFromBlock({
        openDate:
          o,

        closeDate:
          c
      });

    const statusHtml =
      status === "open"
        ? `<span style="color:#7CFFB2;">✅ ВІДКРИТО</span>`
        : (
            status === "pending"
              ? `<span style="color:#FFD700;">⏳ Очікується</span>`
              : `<span style="color:#ff6c6c;">❌ Закрито</span>`
          );

    if(
      regPreview
    ){
      regPreview.innerHTML =
        `Реєстрація: <b>${o}</b> → <b>${c}</b> ${statusHtml}`;
    }
  }

  // =========================================================
  // FORM
  // =========================================================

  function collectForm(){
    const type =
      inpType?.value ||
      "season";

    const yearStr =
      (
        inpYear?.value ||
        ""
      ).trim();

    const name =
      (
        inpName?.value ||
        ""
      ).trim();

    const format =
      (
        inpFormat?.value ||
        "classic"
      ).trim() ||
      "classic";

    const entryType =
      entryTypeFromFormat(
        format
      );

    const lakeId =
      (
        inpLake?.value ||
        ""
      ).trim();

    const startDt =
      parseLocalDateTime(
        inpStartAt?.value ||
        ""
      );

    const finishDt =
      parseLocalDateTime(
        inpFinishAt?.value ||
        ""
      );

    const stagesCount =
      type === "season"
        ? Number(
            inpStagesCount?.value ||
            3
          )
        : 1;

    const hasFinal =
      type === "season"
        ? (
            (
              inpHasFinal?.value ||
              "yes"
            ) === "yes"
          )
        : false;

    const regMode =
      inpRegMode?.value ||
      "auto";

    const payEnabled =
      (
        inpPayEnabled?.value ||
        "yes"
      ) === "yes";

    const manualOpen =
      normDate(
        inpRegOpen?.value ||
        ""
      );

    const manualClose =
      normDate(
        inpRegClose?.value ||
        ""
      );

    const priceRaw =
      (
        inpPrice?.value ||
        ""
      ).trim();

    const price =
      priceRaw
        ? Number(
            String(
              priceRaw
            ).replace(
              ",",
              "."
            )
          )
        : null;

    const currency =
      (
        inpCurrency?.value ||
        "UAH"
      )
        .trim()
        .toUpperCase();

    const payDetails =
      (
        inpPayDetails?.value ||
        ""
      ).trim();

    return {
      type,
      yearStr,
      name,
      format,
      entryType,
      lakeId,

      startDt,
      finishDt,

      stagesCount,
      hasFinal,

      regMode,
      payEnabled,

      manualOpen,
      manualClose,

      priceRaw,
      price,
      currency,
      payDetails
    };
  }

  function applyForm(
    data
  ){
    if(
      !data
    ){
      return;
    }

    if(
      inpType
    ){
      inpType.value =
        data.type ||
        "season";
    }

    if(
      inpYear
    ){
      inpYear.value =
        data.yearStr ||
        data.year ||
        "";
    }

    if(
      inpName
    ){
      inpName.value =
        data.name ||
        "";
    }

    if(
      inpFormat
    ){
      inpFormat.value =
        data.format ||
        "classic";
    }

    if(
      inpLake
    ){
      inpLake.value =
        data.lakeId ||
        "";
    }

    if(
      inpStartAt
    ){
      inpStartAt.value =
        data.startAtLocal ||
        "";
    }

    if(
      inpFinishAt
    ){
      inpFinishAt.value =
        data.finishAtLocal ||
        "";
    }

    if(
      inpStagesCount
    ){
      inpStagesCount.value =
        String(
          data.stagesCount ||
          3
        );
    }

    if(
      inpHasFinal
    ){
      inpHasFinal.value =
        data.hasFinal ===
          false
          ? "no"
          : "yes";
    }

    if(
      inpRegMode
    ){
      inpRegMode.value =
        data.regMode ||
        "auto";
    }

    if(
      inpPayEnabled
    ){
      inpPayEnabled.value =
        data.payEnabled ===
          false
          ? "no"
          : "yes";
    }

    if(
      inpRegOpen
    ){
      inpRegOpen.value =
        data.manualOpen ||
        "";
    }

    if(
      inpRegClose
    ){
      inpRegClose.value =
        data.manualClose ||
        "";
    }

    if(
      inpPrice
    ){
      inpPrice.value =
        (
          data.price === 0 ||
          data.price
        )
          ? String(
              data.price
            )
          : "";
    }

    if(
      inpCurrency
    ){
      inpCurrency.value =
        (
          data.currency ||
          "UAH"
        ).toUpperCase();
    }

    if(
      inpPayDetails
    ){
      inpPayDetails.value =
        data.payDetails ||
        data.paymentDetails ||
        "";
    }
  }

  function saveDraftNow(){
    const d =
      collectForm();

    let engine =
      {};

    try{
      engine =
        (
          activeFormat &&
          typeof activeFormat.serialize ===
            "function"
        )
          ? (
              activeFormat.serialize({
                $,

                format:
                  activeFormatName
              }) ||
              {}
            )
          : {};

    }catch(e){
      console.warn(
        "draft serialize error:",
        e
      );
    }

    const draft = {
      type:
        d.type,

      yearStr:
        d.yearStr,

      name:
        d.name,

      format:
        d.format,

      entryType:
        d.entryType,

      lakeId:
        d.lakeId,

      startAtLocal:
        inpStartAt?.value ||
        "",

      finishAtLocal:
        inpFinishAt?.value ||
        "",

      stagesCount:
        d.stagesCount,

      hasFinal:
        d.hasFinal,

      regMode:
        d.regMode,

      payEnabled:
        d.payEnabled,

      manualOpen:
        d.manualOpen,

      manualClose:
        d.manualClose,

      price:
        d.price,

      currency:
        d.currency,

      payDetails:
        d.payDetails,

      engine,

      ts:
        Date.now()
    };

    setDraft(
      draft
    );
  }

  // =========================================================
  // IDS
  // =========================================================

  function rand4(){
    return Math.random()
      .toString(36)
      .slice(
        2,
        6
      );
  }

  function slugify(
    s
  ){
    return String(
      s ||
      "event"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9а-яіїєґ]+/gi,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      )
      .slice(
        0,
        50
      );
  }

  function compIdFrom(
    type,
    yearStr,
    name
  ){
    const slug =
      slugify(
        name
      );

    const rnd =
      rand4();

    if(
      type ===
      "season"
    ){
      return (
        `season-${yearStr}-` +
        `${slug || "season"}-` +
        `${rnd}`
      );
    }

    return (
      `oneoff-${yearStr}-` +
      `${slug || "event"}-` +
      `${rnd}`
    );
  }

  // =========================================================
  // VALIDATE
  // =========================================================

  function validate(
    form
  ){
    if(
      !/^\d{4}$/.test(
        form.yearStr
      )
    ){
      throw new Error(
        "Вкажи рік (4 цифри)."
      );
    }

    if(
      !form.name
    ){
      throw new Error(
        "Вкажи назву змагання."
      );
    }

    if(
      !form.startDt
    ){
      throw new Error(
        "Заповни старт."
      );
    }

    if(
      !form.finishDt
    ){
      throw new Error(
        "Заповни фініш."
      );
    }

    if(
      form.finishDt.getTime() <=
      form.startDt.getTime()
    ){
      throw new Error(
        "Фініш має бути після старту."
      );
    }

    if(
      form.regMode ===
      "manual"
    ){
      if(
        form.manualOpen &&
        !form.manualClose
      ){
        throw new Error(
          "Manual: заповни закриття."
        );
      }

      if(
        !form.manualOpen &&
        form.manualClose
      ){
        throw new Error(
          "Manual: заповни відкриття."
        );
      }

      if(
        form.manualOpen &&
        form.manualClose &&
        form.manualOpen >
          form.manualClose
      ){
        throw new Error(
          "Manual: відкриття не може бути пізніше закриття."
        );
      }
    }

    if(
      form.payEnabled &&
      form.priceRaw &&
      !Number.isFinite(
        form.price
      )
    ){
      throw new Error(
        "Внесок має бути числом."
      );
    }
  }

  // =========================================================
  // LAKE SNAPSHOT
  // =========================================================

  async function getLakeSnapshot(
    lakeId
  ){
    if(
      !lakeId
    ){
      return null;
    }

    try{
      const doc =
        await db
          .collection(
            "lakes"
          )
          .doc(
            lakeId
          )
          .get();

      if(
        !doc.exists
      ){
        return {
          id:
            lakeId,

          name:
            lakeId
        };
      }

      return {
        id:
          lakeId,

        name:
          (
            doc.data() ||
            {}
          ).name ||
          lakeId
      };

    }catch(_){
      return {
        id:
          lakeId,

        name:
          lakeId
      };
    }
  }

  // =========================================================
  // REGISTRATION BLOCK
  // =========================================================

  function computeRegistrationBlock(
    form
  ){
    if(
      form.regMode ===
      "manual"
    ){
      return {
        mode:
          "manual",

        openDate:
          form.manualOpen ||
          "",

        closeDate:
          form.manualClose ||
          ""
      };
    }

    const startD =
      form.startDt
        ? toDateOnly(
            form.startDt
          )
        : "";

    return {
      mode:
        "auto",

      openDate:
        startD
          ? regOpenFromStartDate(
              startD
            )
          : "",

      closeDate:
        startD
          ? regCloseFromStartDate(
              startD
            )
          : ""
    };
  }

  // =========================================================
  // PAYMENT BLOCK
  // =========================================================

  function paymentBlock(
    form
  ){
    return {
      enabled:
        !!form.payEnabled,

      price:
        (
          form.price === 0 ||
          form.price
        )
          ? form.price
          : null,

      currency:
        (
          form.currency ||
          "UAH"
        ).toUpperCase(),

      details:
        form.payDetails ||
        ""
    };
  }

  function paymentLegacyFields(
    form
  ){
    const price =
      (
        form.price === 0 ||
        form.price
      )
        ? form.price
        : null;

    const currency =
      (
        form.currency ||
        "UAH"
      ).toUpperCase();

    const details =
      form.payDetails ||
      "";

    const enabled =
      !!form.payEnabled;

    return {
      payEnabled:
        enabled,

      paymentEnabled:
        enabled,

      price,

      fee:
        price,

      entryFee:
        price,

      amount:
        price,

      paymentAmount:
        price,

      contribution:
        price,

      contributionAmount:
        price,

      currency,

      paymentCurrency:
        currency,

      payDetails:
        details,

      paymentDetails:
        details,

      paymentText:
        details,

      requisites:
        details,

      bankDetails:
        details,

      card:
        details,

      cardNumber:
        details
    };
  }

  function dateLegacyFields(
    form
  ){
    return {
      startAt:
        fb.firestore.Timestamp
          .fromDate(
            form.startDt
          ),

      finishAt:
        fb.firestore.Timestamp
          .fromDate(
            form.finishDt
          ),

      startDate:
        toDateOnly(
          form.startDt
        ),

      finishDate:
        toDateOnly(
          form.finishDt
        )
    };
  }

  // =========================================================
  // EVENTS
  // =========================================================

  function buildEventsForCompetition(
    form,
    regBlock
  ){
    if(
      form.type !==
      "season"
    ){
      return [];
    }

    const events =
      [];

    const count =
      Math.max(
        1,
        Number(
          form.stagesCount ||
          1
        )
      );

    const pay =
      paymentBlock(
        form
      );

    const payLegacy =
      paymentLegacyFields(
        form
      );

    const dateLegacy =
      dateLegacyFields(
        form
      );

    const status =
      registrationStatusFromBlock(
        regBlock
      );

    for(
      let i=1;
      i<=count;
      i++
    ){
      const key =
        `stage-${i}`;

      const title =
        `Етап ${i}`;

      events.push({
        key,

        stageId:
          key,

        id:
          key,

        order:
          i,

        stageOrder:
          i,

        index:
          i,

        entryType:
          form.entryType ||
          "team",

        format:
          form.format ||
          "classic",

        title,

        name:
          title,

        label:
          title,

        ...dateLegacy,

        schedule: {
          startAt:
            fb.firestore.Timestamp
              .fromDate(
                form.startDt
              ),

          finishAt:
            fb.firestore.Timestamp
              .fromDate(
                form.finishDt
              )
        },

        registration: {
          ...regBlock
        },

        regMode:
          regBlock.mode,

        regOpen:
          regBlock.openDate ||
          "",

        regClose:
          regBlock.closeDate ||
          "",

        registrationOpenDate:
          regBlock.openDate ||
          "",

        registrationCloseDate:
          regBlock.closeDate ||
          "",

        payment: {
          ...pay
        },

        ...payLegacy,

        status,

        registrationStatus:
          status,

        isOpen:
          status ===
          "open",

        open:
          status ===
          "open"
      });
    }

    if(
      form.hasFinal
    ){
      const order =
        count + 1;

      events.push({
        key:
          "final",

        stageId:
          "final",

        id:
          "final",

        order,

        stageOrder:
          order,

        index:
          order,

        entryType:
          "team",

        format:
          form.format ||
          "classic",

        title:
          "Фінал",

        name:
          "Фінал",

        label:
          "Фінал",

        ...dateLegacy,

        schedule: {
          startAt:
            fb.firestore.Timestamp
              .fromDate(
                form.startDt
              ),

          finishAt:
            fb.firestore.Timestamp
              .fromDate(
                form.finishDt
              )
        },

        registration: {
          ...regBlock
        },

        regMode:
          regBlock.mode,

        regOpen:
          regBlock.openDate ||
          "",

        regClose:
          regBlock.closeDate ||
          "",

        registrationOpenDate:
          regBlock.openDate ||
          "",

        registrationCloseDate:
          regBlock.closeDate ||
          "",

        payment: {
          ...pay
        },

        ...payLegacy,

        status,

        registrationStatus:
          status,

        isOpen:
          status ===
          "open",

        open:
          status ===
          "open"
      });
    }

    return events;
  }

  // =========================================================
  // LOAD COMPETITION
  // =========================================================

  async function loadCompetition(
    compId
  ){
    if(
      !compId
    ){
      return;
    }

    setMsg(
      ""
    );

    setStatus(
      "Завантаження…"
    );

    try{
      const doc =
        await db
          .collection(
            "competitions"
          )
          .doc(
            compId
          )
          .get();

      if(
        !doc.exists
      ){
        throw new Error(
          `Не знайдено ${compId}`
        );
      }

      const d =
        doc.data() ||
        {};

      const startAt =
        timestampToDate(
          d.schedule?.startAt
        ) ||
        timestampToDate(
          d.startAt
        ) ||
        timestampToDate(
          d.startDate
        );

      const finishAt =
        timestampToDate(
          d.schedule?.finishAt
        ) ||
        timestampToDate(
          d.finishAt
        ) ||
        timestampToDate(
          d.finishDate
        );

      const reg =
        d.registration ||
        {};

      const pay =
        d.payment ||
        {};

      const loadedPrice =
        firstMoneyValue(
          pay.price,
          d.price,
          d.entryFee,
          d.fee,
          d.paymentAmount,
          d.amount
        );

      applyForm({
        type:
          d.type ||
          "season",

        yearStr:
          String(
            d.year ||
            ""
          ),

        name:
          d.name ||
          "",

        format:
          d.format ||
          "classic",

        lakeId:
          d.lake?.id ||
          d.lakeId ||
          "",

        startAtLocal:
          startAt
            ? toDateTimeLocalValue(
                startAt
              )
            : "",

        finishAtLocal:
          finishAt
            ? toDateTimeLocalValue(
                finishAt
              )
            : "",

        stagesCount:
          d.stagesCount ||
          (
            Array.isArray(
              d.events
            )
              ? d.events.filter(
                  e=>
                    String(
                      e.key ||
                      e.stageId ||
                      ""
                    ).startsWith(
                      "stage-"
                    )
                ).length
              : 3
          ),

        hasFinal:
          d.hasFinal !==
          false,

        regMode:
          reg.mode ||
          d.regMode ||
          "auto",

        payEnabled:
          (
            pay.enabled ??
            d.payEnabled ??
            d.paymentEnabled
          ) !== false,

        manualOpen:
          reg.openDate ||
          d.regOpen ||
          d.registrationOpenDate ||
          "",

        manualClose:
          reg.closeDate ||
          d.regClose ||
          d.registrationCloseDate ||
          "",

        price:
          loadedPrice,

        currency:
          pay.currency ||
          d.currency ||
          d.paymentCurrency ||
          "UAH",

        payDetails:
          pay.details ||
          d.payDetails ||
          d.paymentDetails ||
          d.paymentText ||
          d.requisites ||
          d.bankDetails ||
          d.card ||
          d.cardNumber ||
          ""
      });

      await activateFormat(
        d.format ||
        "classic",
        {
          deserializeData:
            d.engine ||
            {}
        }
      );

      setSeasonVisibility();
      updateDurationUI();
      updateRegUI();

      setStatus(
        "Завантажено ✅"
      );

      setDebug(
        ""
      );

    }catch(e){
      setStatus(
        "Помилка ❌"
      );

      setDebug(
        e?.message ||
        String(e)
      );
    }
  }

  // =========================================================
  // SAVE COMPETITION
  // =========================================================

  async function saveCompetition(
    editingCompId
  ){
    const form =
      collectForm();

    validate(
      form
    );

    let formatExtra =
      {};

    if(
      activeFormat &&
      typeof activeFormat.validate ===
        "function"
    ){
      await activeFormat.validate({
        $,

        format:
          form.format
      });
    }

    if(
      activeFormat &&
      typeof activeFormat.serialize ===
        "function"
    ){
      formatExtra =
        await activeFormat.serialize({
          $,

          format:
            form.format
        }) ||
        {};
    }

    const compId =
      editingCompId ||
      compIdFrom(
        form.type,
        form.yearStr,
        form.name
      );

    const lakeSnap =
      form.lakeId
        ? await getLakeSnapshot(
            form.lakeId
          )
        : null;

    const regBlock =
      computeRegistrationBlock(
        form
      );

    const regStatus =
      registrationStatusFromBlock(
        regBlock
      );

    const payBlock =
      paymentBlock(
        form
      );

    const payLegacy =
      paymentLegacyFields(
        form
      );

    const dateLegacy =
      dateLegacyFields(
        form
      );

    const mins =
      diffMinutes(
        form.startDt,
        form.finishDt
      );

    const durationHours =
      mins !== null
        ? mins / 60
        : null;

    const ref =
      db
        .collection(
          "competitions"
        )
        .doc(
          compId
        );

    const snap =
      await ref.get();

    if(
      !editingCompId &&
      snap.exists
    ){
      throw new Error(
        `Змагання ${compId} вже існує. Натисни Save ще раз або зміни назву.`
      );
    }

    const engine = {
      baseFormat:
        form.format ||
        "classic",

      ...formatExtra,

      entryType:
        form.entryType ||
        "team"
    };

    const data = {
      compId,

      type:
        form.type,

      entryType:
        form.entryType ||
        "team",

      year:
        Number(
          form.yearStr
        ),

      name:
        form.name,

      title:
        form.name,

      brand:
        "STOLAR CARP",

      format:
        form.format,

      engine,

      lake:
        lakeSnap
          ? {
              id:
                lakeSnap.id,

              name:
                lakeSnap.name
            }
          : (
              form.lakeId
                ? {
                    id:
                      form.lakeId,

                    name:
                      form.lakeId
                  }
                : {
                    id:
                      "",

                    name:
                      ""
                  }
            ),

      lakeId:
        form.lakeId ||
        "",

      schedule: {
        startAt:
          fb.firestore.Timestamp
            .fromDate(
              form.startDt
            ),

        finishAt:
          fb.firestore.Timestamp
            .fromDate(
              form.finishDt
            ),

        durationHours:
          durationHours !== null
            ? Number(
                durationHours.toFixed(
                  2
                )
              )
            : null
      },

      ...dateLegacy,

      stagesCount:
        form.type ===
          "season"
          ? Number(
              form.stagesCount
            )
          : 1,

      hasFinal:
        form.type ===
          "season"
          ? !!form.hasFinal
          : false,

      registration: {
        mode:
          regBlock.mode,

        openDate:
          regBlock.openDate ||
          "",

        closeDate:
          regBlock.closeDate ||
          ""
      },

      regMode:
        regBlock.mode,

      regOpen:
        regBlock.openDate ||
        "",

      regClose:
        regBlock.closeDate ||
        "",

      registrationOpenDate:
        regBlock.openDate ||
        "",

      registrationCloseDate:
        regBlock.closeDate ||
        "",

      status:
        regStatus,

      registrationStatus:
        regStatus,

      isOpen:
        regStatus ===
        "open",

      open:
        regStatus ===
        "open",

      payment:
        payBlock,

      ...payLegacy,

      events:
        form.type ===
          "season"
          ? buildEventsForCompetition(
              form,
              regBlock
            )
          : [],

      updatedAt:
        fb.firestore
          .FieldValue
          .serverTimestamp()
    };

    if(
      !snap.exists
    ){
      data.createdAt =
        fb.firestore
          .FieldValue
          .serverTimestamp();
    }

    await ref.set(
      data,
      {
        merge:
          true
      }
    );

    saveDraftNow();

    clearCompetitionCaches();

    return compId;
  }

  // =========================================================
  // ACTIVE
  // =========================================================

  async function makeActive(
    compId
  ){
    const check =
      await db
        .collection(
          "competitions"
        )
        .doc(
          compId
        )
        .get();

    if(
      !check.exists
    ){
      throw new Error(
        `Змагання ${compId} не існує.`
      );
    }

    await db
      .collection(
        "settings"
      )
      .doc(
        "app"
      )
      .set(
        {
          activeCompetitionId:
            compId,

          updatedAt:
            fb.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge:
            true
        }
      );

    clearCompetitionCaches();
  }

  // =========================================================
  // ONE-OFF HARD DELETE HELPERS
  // =========================================================

  function normalizeId(
    value
  ){
    return String(
      value ??
      ""
    ).trim();
  }

  function parseCompetitionYear(
    compId,
    competition
  ){
    const direct =
      Number(
        competition?.year
      );

    if(
      Number.isFinite(
        direct
      ) &&
      direct >= 2000 &&
      direct <= 3000
    ){
      return String(
        Math.trunc(
          direct
        )
      );
    }

    const match =
      String(
        compId ||
        ""
      ).match(
        /\b(20\d{2})\b/
      );

    return match
      ? match[1]
      : "";
  }

  function docIdBelongsToCompetition(
    docId,
    compId
  ){
    const id =
      normalizeId(
        docId
      );

    const target =
      normalizeId(
        compId
      );

    if(
      !id ||
      !target
    ){
      return false;
    }

    if(
      id === target
    ){
      return true;
    }

    const prefixes = [
      `${target}__`,
      `${target}||`,
      `${target}|`,
      `${target}--`,
      `${target}::`
    ];

    return prefixes.some(
      prefix=>
        id.startsWith(
          prefix
        )
    );
  }

  function dataBelongsToCompetition(
    data,
    compId
  ){
    const d =
      data ||
      {};

    const target =
      normalizeId(
        compId
      );

    if(
      !target
    ){
      return false;
    }

    const directValues = [
      d.competitionId,
      d.compId,
      d.originalCompetitionId,
      d.competitionKey,

      d.competition?.id,
      d.competition?.competitionId,

      d.source?.competitionId,
      d.source?.compId,

      d.event?.competitionId,
      d.event?.compId
    ];

    return directValues.some(
      value=>
        normalizeId(
          value
        ) ===
        target
    );
  }

  function documentBelongsToCompetition(
    doc,
    compId
  ){
    if(
      !doc
    ){
      return false;
    }

    return (
      docIdBelongsToCompetition(
        doc.id,
        compId
      ) ||
      dataBelongsToCompetition(
        doc.data?.() ||
        {},
        compId
      )
    );
  }

  // =========================================================
  // DELETE REFS IN CHUNKS
  // =========================================================

  async function deleteRefsInChunks(
    refs
  ){
    const unique =
      new Map();

    (
      refs ||
      []
    ).forEach(
      ref=>{
        if(
          ref?.path
        ){
          unique.set(
            ref.path,
            ref
          );
        }
      }
    );

    const list =
      [
        ...unique.values()
      ];

    if(
      !list.length
    ){
      return 0;
    }

    /*
     * Firestore batch max = 500.
     * Беремо 400 із запасом.
     */
    const CHUNK_SIZE =
      400;

    let deleted =
      0;

    for(
      let i=0;
      i<list.length;
      i+=CHUNK_SIZE
    ){
      const chunk =
        list.slice(
          i,
          i +
          CHUNK_SIZE
        );

      const batch =
        db.batch();

      chunk.forEach(
        ref=>{
          batch.delete(
            ref
          );
        }
      );

      await batch.commit();

      deleted +=
        chunk.length;
    }

    return deleted;
  }

  // =========================================================
  // FIND DOCS IN TOP LEVEL COLLECTION
  // =========================================================

  async function findCompetitionDocuments(
    collectionName,
    compId
  ){
    let snap;

    try{
      /*
       * Навмисно читаємо колекцію
       * і фільтруємо самі.
       *
       * Так не залежимо від
       * Firestore indexes.
       */
      snap =
        await db
          .collection(
            collectionName
          )
          .get();

    }catch(e){
      throw new Error(
        `Не вдалося перевірити ${collectionName}: ${
          e?.message ||
          e
        }`
      );
    }

    return snap.docs.filter(
      doc=>
        documentBelongsToCompetition(
          doc,
          compId
        )
    );
  }

  // =========================================================
  // DELETE FROM SIMPLE COLLECTION
  // =========================================================

  async function deleteFromSimpleCollection(
    collectionName,
    compId
  ){
    const docs =
      await findCompetitionDocuments(
        collectionName,
        compId
      );

    if(
      !docs.length
    ){
      console.info(
        "[admin-create] clean:",
        collectionName,
        "0"
      );

      return 0;
    }

    const deleted =
      await deleteRefsInChunks(
        docs.map(
          doc=>
            doc.ref
        )
      );

    console.info(
      "[admin-create] clean:",
      collectionName,
      deleted
    );

    return deleted;
  }

  // =========================================================
  // STAGE RESULTS
  // =========================================================

  async function deleteStageResultTeams(
    stageRef
  ){
    try{
      const teamsSnap =
        await stageRef
          .collection(
            "teams"
          )
          .get();

      if(
        teamsSnap.empty
      ){
        return 0;
      }

      return await deleteRefsInChunks(
        teamsSnap.docs.map(
          doc=>
            doc.ref
        )
      );

    }catch(e){
      throw new Error(
        `Не вдалося очистити ${stageRef.path}/teams: ${
          e?.message ||
          e
        }`
      );
    }
  }

  function possibleStageResultIds(
    compId,
    competition
  ){
    const ids =
      new Set([
        compId,

        `${compId}__main`,

        `${compId}__stage-1`,

        `${compId}__final`
      ]);

    const events =
      Array.isArray(
        competition?.events
      )
        ? competition.events
        : [];

    events.forEach(
      event=>{
        const stageKey =
          normalizeId(
            event?.key ||
            event?.stageId ||
            event?.id
          );

        if(
          stageKey
        ){
          ids.add(
            `${compId}__${stageKey}`
          );
        }
      }
    );

    return [
      ...ids
    ];
  }

  async function deleteStageResultsForCompetition(
    compId,
    competition
  ){
    const collection =
      db.collection(
        "stageResults"
      );

    const foundDocs =
      await findCompetitionDocuments(
        "stageResults",
        compId
      );

    const refs =
      new Map();

    foundDocs.forEach(
      doc=>{
        refs.set(
          doc.ref.path,
          doc.ref
        );
      }
    );

    /*
     * Важливо:
     *
     * Firestore може мати subcollection
     * навіть якщо parent документ уже
     * колись був видалений.
     *
     * Тому окремо перевіряємо відомі
     * можливі stageResults IDs.
     */
    possibleStageResultIds(
      compId,
      competition
    ).forEach(
      id=>{
        const ref =
          collection.doc(
            id
          );

        refs.set(
          ref.path,
          ref
        );
      }
    );

    let deleted =
      0;

    /*
     * Спочатку teams subcollection.
     */
    for(
      const stageRef of
      refs.values()
    ){
      deleted +=
        await deleteStageResultTeams(
          stageRef
        );
    }

    /*
     * Потім видаляємо тільки ті parent
     * документи, які реально існують
     * або були знайдені у collection scan.
     *
     * delete() на неіснуючий doc теж
     * допустимий, тому можемо видалити
     * всі candidate refs.
     */
    deleted +=
      await deleteRefsInChunks(
        [
          ...refs.values()
        ]
      );

    console.info(
      "[admin-create] clean stageResults:",
      deleted
    );

    return deleted;
  }

  // =========================================================
  // FINAL QUALIFICATIONS LEGACY CLEANUP
  // =========================================================

  async function deleteFinalQualificationsForCompetition(
    compId,
    competition
  ){
    const year =
      parseCompetitionYear(
        compId,
        competition
      );

    if(
      !year
    ){
      return 0;
    }

    const teamsRef =
      db
        .collection(
          "finalQualifications"
        )
        .doc(
          year
        )
        .collection(
          "teams"
        );

    let snap;

    try{
      snap =
        await teamsRef.get();

    }catch(e){
      throw new Error(
        `Не вдалося перевірити finalQualifications/${year}/teams: ${
          e?.message ||
          e
        }`
      );
    }

    const refs =
      snap.docs
        .filter(
          doc=>
            documentBelongsToCompetition(
              doc,
              compId
            )
        )
        .map(
          doc=>
            doc.ref
        );

    const deleted =
      await deleteRefsInChunks(
        refs
      );

    console.info(
      "[admin-create] clean finalQualifications:",
      deleted
    );

    return deleted;
  }

  // =========================================================
  // SEASON RESULTS LEGACY CLEANUP
  // =========================================================

  async function deleteSeasonResultsForCompetition(
    compId,
    competition
  ){
    const year =
      parseCompetitionYear(
        compId,
        competition
      );

    if(
      !year
    ){
      return 0;
    }

    const stagesRef =
      db
        .collection(
          "seasonResults"
        )
        .doc(
          year
        )
        .collection(
          "stages"
        );

    let snap;

    try{
      snap =
        await stagesRef.get();

    }catch(e){
      throw new Error(
        `Не вдалося перевірити seasonResults/${year}/stages: ${
          e?.message ||
          e
        }`
      );
    }

    const refs =
      snap.docs
        .filter(
          doc=>
            documentBelongsToCompetition(
              doc,
              compId
            )
        )
        .map(
          doc=>
            doc.ref
        );

    const deleted =
      await deleteRefsInChunks(
        refs
      );

    console.info(
      "[admin-create] clean seasonResults:",
      deleted
    );

    return deleted;
  }

  // =========================================================
  // ACTIVE COMPETITION CLEANUP
  // =========================================================

  async function clearActiveCompetitionIfNeeded(
    compId
  ){
    const settingsRef =
      db
        .collection(
          "settings"
        )
        .doc(
          "app"
        );

    const snap =
      await settingsRef.get();

    if(
      !snap.exists
    ){
      return false;
    }

    const activeId =
      normalizeId(
        (
          snap.data() ||
          {}
        ).activeCompetitionId
      );

    if(
      activeId !==
      compId
    ){
      return false;
    }

    await settingsRef.set(
      {
        activeCompetitionId:
          "",

        updatedAt:
          fb.firestore
            .FieldValue
            .serverTimestamp()
      },
      {
        merge:
          true
      }
    );

    return true;
  }

  // =========================================================
  // HARD DELETE ONE-OFF
  // =========================================================

  async function hardDeleteOneoffCompetition(
    compId,
    competition
  ){
    let deleted =
      0;

    /*
     * Усі відомі top-level колекції,
     * де one-off може мати свої
     * робочі документи.
     *
     * teams / users / lakes
     * НЕ ЧІПАЄМО.
     */
    const collections = [
      "registrations",

      /*
       * Старий сміттєвий архів
       * реєстрацій.
       *
       * Для oneoff він нам
       * взагалі не потрібен.
       */
      "registrations_deleted",

      "public_participants",

      "weighings",

      "judgeTokens",

      "mealOrders",

      "mealSettings"
    ];

    for(
      const collectionName of
      collections
    ){
      deleted +=
        await deleteFromSimpleCollection(
          collectionName,
          compId
        );
    }

    /*
     * stageResults має teams
     * subcollection.
     */
    deleted +=
      await deleteStageResultsForCompetition(
        compId,
        competition
      );

    /*
     * ONE-OFF взагалі не повинен
     * потрапляти сюди.
     *
     * Але якщо старий код залишив
     * слід — прибираємо.
     */
    deleted +=
      await deleteFinalQualificationsForCompetition(
        compId,
        competition
      );

    deleted +=
      await deleteSeasonResultsForCompetition(
        compId,
        competition
      );

    /*
     * activeCompetitionId
     */
    await clearActiveCompetitionIfNeeded(
      compId
    );

    /*
     * competition видаляємо ОСТАННІМ.
     *
     * Якщо будь-який cleanup вище
     * впаде — сам competition
     * залишиться, і видалення
     * можна повторити.
     */
    await db
      .collection(
        "competitions"
      )
      .doc(
        compId
      )
      .delete();

    deleted +=
      1;

    clearCompetitionCaches();

    return deleted;
  }

  // =========================================================
  // SEASON / NORMAL DOCUMENT DELETE
  // =========================================================

  async function deleteCompetitionDocumentOnly(
    compId
  ){
    await clearActiveCompetitionIfNeeded(
      compId
    );

    await db
      .collection(
        "competitions"
      )
      .doc(
        compId
      )
      .delete();

    clearCompetitionCaches();

    return 1;
  }

  // =========================================================
  // DELETE COMPETITION
  // =========================================================

  async function deleteCompetition(
    compId
  ){
    if(
      !compId
    ){
      throw new Error(
        "Не визначено ID змагання."
      );
    }

    /*
     * Спочатку читаємо competition,
     * щоб знати його тип.
     */
    const ref =
      db
        .collection(
          "competitions"
        )
        .doc(
          compId
        );

    const snap =
      await ref.get();

    if(
      !snap.exists
    ){
      throw new Error(
        `Змагання ${compId} не знайдено.`
      );
    }

    const competition =
      snap.data() ||
      {};

    const type =
      normalizeId(
        competition.type
      ).toLowerCase();

    /*
     * Старі oneoff могли не мати type,
     * тому ID теж використовуємо
     * як fallback.
     */
    const isOneoff =
      type ===
        "oneoff" ||
      (
        !type &&
        String(
          compId
        ).startsWith(
          "oneoff-"
        )
      );

    const warning =
      isOneoff
        ? (
            `УВАГА!\n\n` +

            `ONE-OFF змагання буде СТЕРТО ПОВНІСТЮ.\n\n` +

            `${compId}\n\n` +

            `Будуть видалені всі пов'язані дані:\n\n` +

            `• competitions\n` +
            `• registrations\n` +
            `• registrations_deleted\n` +
            `• public_participants\n` +
            `• weighings\n` +
            `• stageResults + teams\n` +
            `• judgeTokens\n` +
            `• mealOrders / mealSettings\n` +
            `• випадкові хвости у seasonResults\n` +
            `• випадкові хвости у finalQualifications\n\n` +

            `НІЧОГО НЕ АРХІВУЄТЬСЯ.\n\n` +

            `Для підтвердження введи: DELETE`
          )
        : (
            `УВАГА! Видалення без відновлення.\n\n` +
            `Змагання:\n${compId}\n\n` +
            `Для підтвердження введи: DELETE`
          );

    const typed =
      prompt(
        warning
      );

    if(
      String(
        typed ||
        ""
      )
        .trim()
        .toUpperCase() !==
      "DELETE"
    ){
      throw new Error(
        "Видалення скасовано."
      );
    }

    if(
      isOneoff
    ){
      const deleted =
        await hardDeleteOneoffCompetition(
          compId,
          competition
        );

      console.info(
        "[admin-create] ONE-OFF fully deleted:",
        compId,
        "documents:",
        deleted
      );

      return {
        type:
          "oneoff",

        deleted
      };
    }

    /*
     * SEASON:
     * залишаємо попередню поведінку.
     */
    const deleted =
      await deleteCompetitionDocumentOnly(
        compId
      );

    return {
      type:
        type ||
        "season",

      deleted
    };
  }

  // =========================================================
  // UI BIND
  // =========================================================

  function bindUI(){
    if(
      tabCreate
    ){
      tabCreate.onclick =
        ()=>
          gotoMode(
            "create"
          );
    }

    if(
      tabEdit
    ){
      tabEdit.onclick =
        ()=>
          gotoMode(
            "edit"
          );
    }

    if(
      inpType
    ){
      inpType.addEventListener(
        "change",
        ()=>{
          setSeasonVisibility();

          saveDraftNow();
        }
      );
    }

    if(
      inpFormat
    ){
      inpFormat.addEventListener(
        "change",
        async ()=>{
          await activateFormat(
            inpFormat.value
          );

          saveDraftNow();
        }
      );
    }

    [
      inpYear,
      inpName,
      inpLake,

      inpStartAt,
      inpFinishAt,

      inpStagesCount,
      inpHasFinal,

      inpRegMode,
      inpPayEnabled,

      inpRegOpen,
      inpRegClose,

      inpPrice,
      inpCurrency,
      inpPayDetails
    ].forEach(
      el=>{
        if(
          !el
        ){
          return;
        }

        el.addEventListener(
          "change",
          ()=>{
            updateDurationUI();

            updateRegUI();

            saveDraftNow();
          }
        );

        el.addEventListener(
          "input",
          ()=>{
            updateDurationUI();

            updateRegUI();

            saveDraftNow();
          }
        );
      }
    );

    // =======================================================
    // RESET DRAFT
    // =======================================================

    if(
      btnResetDraft
    ){
      btnResetDraft.onclick =
        async ()=>{
          clearDraft();

          currentSavedCompId =
            "";

          if(
            inpType
          ){
            inpType.value =
              "season";
          }

          if(
            inpYear
          ){
            inpYear.value =
              "";
          }

          if(
            inpName
          ){
            inpName.value =
              "";
          }

          if(
            inpFormat
          ){
            inpFormat.value =
              "classic";
          }

          if(
            inpLake
          ){
            inpLake.value =
              "";
          }

          if(
            inpStartAt
          ){
            inpStartAt.value =
              "";
          }

          if(
            inpFinishAt
          ){
            inpFinishAt.value =
              "";
          }

          if(
            inpStagesCount
          ){
            inpStagesCount.value =
              "3";
          }

          if(
            inpHasFinal
          ){
            inpHasFinal.value =
              "yes";
          }

          if(
            inpRegMode
          ){
            inpRegMode.value =
              "auto";
          }

          if(
            inpPayEnabled
          ){
            inpPayEnabled.value =
              "yes";
          }

          if(
            inpRegOpen
          ){
            inpRegOpen.value =
              "";
          }

          if(
            inpRegClose
          ){
            inpRegClose.value =
              "";
          }

          if(
            inpPrice
          ){
            inpPrice.value =
              "";
          }

          if(
            inpCurrency
          ){
            inpCurrency.value =
              "UAH";
          }

          if(
            inpPayDetails
          ){
            inpPayDetails.value =
              "";
          }

          renderFormatSpecificFields(
            ""
          );

          await activateFormat(
            "classic"
          );

          setSeasonVisibility();

          updateDurationUI();

          updateRegUI();

          setMsg(
            `<span class="ok">✅ Чернетку скинуто</span>`
          );
        };
    }

    // =======================================================
    // RELOAD LIST
    // =======================================================

    if(
      btnReloadList
    ){
      btnReloadList.onclick =
        async ()=>{
          if(
            editPickerMsg
          ){
            editPickerMsg.textContent =
              "Оновлення…";
          }

          await loadCompetitionsList();

          if(
            editPickerMsg
          ){
            editPickerMsg.textContent =
              "";
          }
        };
    }

    // =======================================================
    // SELECT COMPETITION
    // =======================================================

    if(
      selCompetition
    ){
      selCompetition.onchange =
        async ()=>{
          const id =
            selCompetition.value;

          if(
            !id
          ){
            return;
          }

          await loadCompetition(
            id
          );
        };
    }

    // =======================================================
    // SAVE
    // =======================================================

    if(
      btnSave
    ){
      btnSave.onclick =
        async ()=>{
          setMsg(
            `<span class="muted">Збереження…</span>`
          );

          try{
            const editingId =
              (
                isEditMode &&
                selCompetition &&
                selCompetition.value
              )
                ? selCompetition.value
                : "";

            const compId =
              await saveCompetition(
                editingId ||
                currentSavedCompId ||
                ""
              );

            currentSavedCompId =
              compId;

            setMsg(
              `<span class="ok">✅ Збережено:</span> ${esc(compId)}`
            );

            setStatus(
              "Збережено ✅"
            );

          }catch(e){
            setMsg(
              `<span class="err">❌</span> ${esc(e?.message || String(e))}`
            );

            setStatus(
              "Помилка ❌"
            );

            setDebug(
              e?.message ||
              String(e)
            );
          }
        };
    }

    // =======================================================
    // MAKE ACTIVE
    // =======================================================

    if(
      btnMakeActive
    ){
      btnMakeActive.onclick =
        async ()=>{
          setMsg(
            `<span class="muted">Активуємо…</span>`
          );

          try{
            const editingId =
              (
                isEditMode &&
                selCompetition &&
                selCompetition.value
              )
                ? selCompetition.value
                : "";

            let compId =
              editingId ||
              currentSavedCompId;

            if(
              !compId
            ){
              compId =
                await saveCompetition(
                  ""
                );

              currentSavedCompId =
                compId;
            }

            await makeActive(
              compId
            );

            setMsg(
              `<span class="ok">✅ Активне:</span> ${esc(compId)}`
            );

          }catch(e){
            setMsg(
              `<span class="err">❌</span> ${esc(e?.message || String(e))}`
            );
          }
        };
    }

    // =======================================================
    // DELETE
    // =======================================================

    if(
      btnDelete
    ){
      btnDelete.onclick =
        async ()=>{
          try{
            if(
              !isEditMode
            ){
              throw new Error(
                "Тільки в edit."
              );
            }

            const compId =
              selCompetition?.value ||
              "";

            if(
              !compId
            ){
              throw new Error(
                "Вибери змагання."
              );
            }

            setMsg(
              `<span class="muted">Видаляю…</span>`
            );

            setStatus(
              "Видалення…"
            );

            const result =
              await deleteCompetition(
                compId
              );

            await loadCompetitionsList();

            clearDraft();

            currentSavedCompId =
              "";

            if(
              selCompetition
            ){
              selCompetition.value =
                "";
            }

            if(
              result?.type ===
              "oneoff"
            ){
              setMsg(
                `<span class="ok">✅ ONE-OFF видалено повністю.</span> ` +
                `Очищено документів: <b>${esc(result.deleted)}</b>`
              );

              setStatus(
                "ONE-OFF очищено ✅"
              );

            }else{
              setMsg(
                `<span class="ok">✅ Видалено</span>`
              );

              setStatus(
                "Видалено ✅"
              );
            }

            setDebug(
              ""
            );

          }catch(e){
            setMsg(
              `<span class="err">❌</span> ${esc(e?.message || String(e))}`
            );

            setStatus(
              "Помилка видалення ❌"
            );

            setDebug(
              e?.message ||
              String(e)
            );
          }
        };
    }
  }

  // =========================================================
  // INIT
  // =========================================================

  async function init(){
    try{
      await waitForFirebase();

      auth =
        window.scAuth;

      db =
        window.scDb;

      fb =
        window.firebase;

    }catch(e){
      setStatus(
        "Firebase ❌"
      );

      setDebug(
        e?.message ||
        String(e)
      );

      show(
        gate
      );

      hide(
        app
      );

      return;
    }

    bindUI();

    auth.onAuthStateChanged(
      async user=>{
        if(
          !user
        ){
          setStatus(
            "Нема сесії"
          );

          show(
            gate
          );

          hide(
            app
          );

          return;
        }

        const ok =
          await requireAdmin(
            user
          );

        if(
          !ok
        ){
          setStatus(
            "Доступ заборонено ❌"
          );

          show(
            gate
          );

          hide(
            app
          );

          return;
        }

        hide(
          gate
        );

        show(
          app
        );

        setStatus(
          isEditMode
            ? "Редагування"
            : "Створення"
        );

        setActiveTab(
          isEditMode
        );

        await loadLakes();

        const draft =
          getDraft();

        if(
          draft &&
          !isEditMode
        ){
          applyForm(
            draft
          );

          await activateFormat(
            draft.format ||
            "classic",
            {
              deserializeData:
                draft.engine ||
                {}
            }
          );

          setStatus(
            "Чернетку відновлено ✅"
          );

        }else{
          await activateFormat(
            (
              inpFormat &&
              inpFormat.value
            )
              ? inpFormat.value
              : "classic"
          );
        }

        setSeasonVisibility();

        updateDurationUI();

        updateRegUI();

        if(
          isEditMode
        ){
          await loadCompetitionsList();

          const pre =
            url.searchParams.get(
              "compId"
            );

          if(
            pre &&
            selCompetition
          ){
            selCompetition.value =
              pre;

            await loadCompetition(
              pre
            );
          }
        }
      }
    );
  }

  // =========================================================
  // ERRORS
  // =========================================================

  window.addEventListener(
    "error",
    e=>{
      setStatus(
        "JS ❌"
      );

      setDebug(
        e?.message ||
        "Помилка"
      );
    }
  );

  window.addEventListener(
    "unhandledrejection",
    e=>{
      setStatus(
        "Promise ❌"
      );

      setDebug(
        e?.reason?.message ||
        String(
          e?.reason ||
          "Promise error"
        )
      );
    }
  );

  init();

})();
