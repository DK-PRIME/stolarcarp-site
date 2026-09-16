// assets/js/cabinet.js
// STOLAR CARP — Кабінет учасника
// Firebase compat 10.12.2
//
// ✅ firstName = Ім'я
// ✅ lastName = Прізвище
// ✅ fullName = Прізвище Ім'я
// ✅ legacy fullName не розбиваємо автоматично
// ✅ SOLO public_participants синхронізується при зміні ПІБ
// ✅ TEAM-заявки не перейменовуються
// ✅ "Моя участь" показує ТІЛЬКИ активне змагання/етап
// ✅ activeCompetitionId + activeStageId беремо з settings/app
// ✅ public_participants читаємо одним запитом по activeCompetitionId
// ✅ team/members не перепідписуються при кожній зміні users/{uid}
// ✅ competition meta кешується

(function () {
  "use strict";

  console.log("✅ cabinet.js LOADED v20260916-active-only-v5");

  // =========================
  // BURGER MENU
  // =========================

  const burger = document.getElementById("burger");
  const nav = document.querySelector(".nav");

  if (burger && nav) {
    burger.addEventListener(
      "click",
      () => nav.classList.toggle("open")
    );

    nav.addEventListener(
      "click",
      (e) => {
        if (
          e.target.classList.contains(
            "nav__link"
          )
        ) {
          nav.classList.remove("open");
        }
      }
    );
  }

  const ADMIN_UID =
    "5Dt6fN64c3aWACYV1WacxV2BHDl2";

  // =========================
  // FIREBASE WAIT
  // =========================

  async function waitFirebase(
    maxMs = 12000
  ) {
    const t0 = Date.now();

    while (
      Date.now() - t0 <
      maxMs
    ) {
      if (
        window.scAuth &&
        window.scDb
      ) {
        return;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );
    }

    throw new Error(
      "Firebase не готовий"
    );
  }

  // =========================
  // CACHE SYSTEM
  // =========================

  const Cache = {
    data: {
      user: null,
      team: null,
      members: [],
      competitions: [],
      userLastUpdate: 0,
      compsLastUpdate: 0
    },

    isUserValid(
      maxAgeMs = 60000
    ) {
      return Boolean(
        this.data.userLastUpdate &&
        Date.now() -
          this.data.userLastUpdate <
          maxAgeMs
      );
    },

    isCompsValid(
      maxAgeMs = 300000
    ) {
      return Boolean(
        this.data.compsLastUpdate &&
        Date.now() -
          this.data.compsLastUpdate <
          maxAgeMs
      );
    },

    setUser(value) {
      this.data.user =
        value;

      this.data.userLastUpdate =
        Date.now();
    },

    setTeam(value) {
      this.data.team =
        value;
    },

    setMembers(value) {
      this.data.members =
        value;
    },

    setComps(value) {
      this.data.competitions =
        value;

      this.data.compsLastUpdate =
        Date.now();
    },

    get(key) {
      return this.data[key];
    },

    clear() {
      this.data = {
        user: null,
        team: null,
        members: [],
        competitions: [],
        userLastUpdate: 0,
        compsLastUpdate: 0
      };
    }
  };

  // =========================
  // DOM
  // =========================

  const statusEl =
    document.getElementById(
      "cabinetStatus"
    );

  const contentEl =
    document.getElementById(
      "cabinetContent"
    );

  const teamNameEl =
    document.getElementById(
      "teamNameText"
    );

  const userFullNameEl =
    document.getElementById(
      "userFullName"
    );

  const userCityEl =
    document.getElementById(
      "userCity"
    );

  const captainTextEl =
    document.getElementById(
      "captainText"
    );

  const userRoleEl =
    document.getElementById(
      "userRoleText"
    );

  const userPhoneEl =
    document.getElementById(
      "userPhoneText"
    );

  const joinCodePillEl =
    document.getElementById(
      "joinCodePill"
    );

  const joinCodeTextEl =
    document.getElementById(
      "joinCodeText"
    );

  const avatarWrapper =
    document.getElementById(
      "avatarWrapper"
    );

  const avatarImgEl =
    document.getElementById(
      "cabinetAvatarImg"
    );

  const avatarPhEl =
    document.getElementById(
      "cabinetAvatarPlaceholder"
    );

  const membersEl =
    document.getElementById(
      "membersContainer"
    );

  const myPartListEl =
    document.getElementById(
      "myCompetitions"
    );

  // =========================
  // PROFILE EDIT DOM
  // =========================

  const editProfileBtn =
    document.getElementById(
      "editProfileBtn"
    );

  const saveProfileBtn =
    document.getElementById(
      "saveProfileBtn"
    );

  const cancelProfileBtn =
    document.getElementById(
      "cancelProfileBtn"
    );

  const profileEditBox =
    document.getElementById(
      "profileEditBox"
    );

  const lastNameInput =
    document.getElementById(
      "lastNameInput"
    );

  const firstNameInput =
    document.getElementById(
      "firstNameInput"
    );

  const phoneInput =
    document.getElementById(
      "phoneInput"
    );

  const cityInput =
    document.getElementById(
      "cityInput"
    );

  const profileEditMsg =
    document.getElementById(
      "profileEditMsg"
    );

  // =========================
  // STATE
  // =========================

  let isEditingProfile =
    false;

  let isSavingProfile =
    false;

  let lastProfileSnap =
    null;

  let unsubUser =
    null;

  let unsubTeam =
    null;

  let unsubMembers =
    null;

  let activeTeamId =
    "__INIT__";

  let activeParticipationKey =
    "";

  let participationLoadSeq =
    0;

  let activeAppContextPromise =
    null;

  const competitionDocCache =
    new Map();

  const competitionMetaCache =
    new Map();

  // =========================
  // HELPERS
  // =========================

  function setStatus(t) {
    if (
      statusEl
    ) {
      statusEl.textContent =
        t || "";
    }
  }

  function showContent() {
    if (
      contentEl
    ) {
      contentEl.style.display =
        "block";
    }
  }

  function hideContent() {
    if (
      contentEl
    ) {
      contentEl.style.display =
        "none";
    }
  }

  function norm(v) {
    return String(
      v ?? ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  function normLower(v) {
    return norm(v)
      .toLowerCase();
  }

  function roleText(role) {
    return (
      role === "admin"
        ? "Адміністратор"
        : role === "judge"
          ? "Суддя"
          : role === "captain"
            ? "Капітан команди"
            : "Учасник команди"
    );
  }

  function escapeHtml(str) {
    return String(
      str || ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function serverTimestamp() {
    try {
      return window
        .firebase
        .firestore
        .FieldValue
        .serverTimestamp();

    } catch {
      return null;
    }
  }

  // =========================
  // NAME HELPERS
  // =========================

  function cleanNamePart(v) {
    return String(
      v || ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      )
      .slice(
        0,
        40
      );
  }

  function buildFullName(
    lastName,
    firstName
  ) {
    const last =
      cleanNamePart(
        lastName
      );

    const first =
      cleanNamePart(
        firstName
      );

    if (
      !last ||
      !first
    ) {
      return "";
    }

    return (
      `${last} ${first}`
    );
  }

  function getDisplayName(u) {
    const data =
      u || {};

    const canonical =
      buildFullName(
        data.lastName,
        data.firstName
      );

    if (
      canonical
    ) {
      return canonical;
    }

    return (
      norm(
        data.fullName
      ) ||
      norm(
        data.name
      ) ||
      ""
    );
  }

  function cleanPhone(v) {
    return String(
      v || ""
    )
      .trim()
      .replace(
        /[^\d+\-\s()]/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .slice(
        0,
        25
      );
  }

  function cleanCity(v) {
    return String(
      v || ""
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      )
      .slice(
        0,
        40
      );
  }

  // =========================
  // ACTIVE COMPETITION / STAGE
  // =========================

  async function getActiveAppContext(
    db,
    force = false
  ) {
    if (
      !force &&
      activeAppContextPromise
    ) {
      return activeAppContextPromise;
    }

    activeAppContextPromise =
      (async () => {
        try {
          const snap =
            await db
              .collection(
                "settings"
              )
              .doc(
                "app"
              )
              .get();

          if (
            !snap.exists
          ) {
            return {
              competitionId:
                "",
              stageId:
                ""
            };
          }

          const data =
            snap.data() ||
            {};

          return {
            competitionId:
              norm(
                data.activeCompetitionId
              ),

            stageId:
              norm(
                data.activeStageId
              ) ||
              "main"
          };

        } catch (
          err
        ) {
          console.warn(
            "[cabinet] settings/app:",
            err
          );

          return {
            competitionId:
              "",
            stageId:
              ""
          };
        }
      })();

    return activeAppContextPromise;
  }

  function stageMatches(
    rowStageId,
    activeStageId
  ) {
    const rowStage =
      norm(
        rowStageId
      ) ||
      "main";

    const wanted =
      norm(
        activeStageId
      ) ||
      "main";

    const rowRaw =
      rowStage.replace(
        /^stage-/,
        ""
      );

    const wantedRaw =
      wanted.replace(
        /^stage-/,
        ""
      );

    return (
      rowStage ===
        wanted
      ||
      rowStage ===
        `stage-${wantedRaw}`
      ||
      rowRaw ===
        wantedRaw
      ||
      (
        wanted ===
          "main"
        &&
        rowStage ===
          "main"
      )
    );
  }

  // =========================
  // SOLO PUBLIC SYNC
  // =========================

  function isSoloPublicDoc(
    docId,
    data
  ) {
    const d =
      data || {};

    if (
      normLower(
        d.entryType
      ) ===
      "solo"
    ) {
      return true;
    }

    if (
      norm(
        docId
      ).includes(
        "__solo__"
      )
    ) {
      return true;
    }

    return false;
  }

  async function syncSoloPublicParticipants(
    db,
    uid,
    firstName,
    lastName,
    fullName
  ) {
    const userUid =
      norm(
        uid
      );

    if (
      !userUid
    ) {
      return {
        found:
          0,
        updated:
          0
      };
    }

    const snap =
      await db
        .collection(
          "public_participants"
        )
        .where(
          "uid",
          "==",
          userUid
        )
        .get();

    if (
      snap.empty
    ) {
      return {
        found:
          0,
        updated:
          0
      };
    }

    const refs =
      [];

    snap.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        if (
          !isSoloPublicDoc(
            doc.id,
            data
          )
        ) {
          return;
        }

        refs.push(
          doc.ref
        );
      }
    );

    if (
      !refs.length
    ) {
      return {
        found:
          snap.size,
        updated:
          0
      };
    }

    const batch =
      db.batch();

    refs.forEach(
      ref => {
        batch.set(
          ref,
          {
            firstName,
            lastName,
            fullName,

            participantName:
              fullName,

            displayName:
              fullName,

            captain:
              fullName
          },
          {
            merge:
              true
          }
        );
      }
    );

    await batch.commit();

    console.log(
      "✅ SOLO public_participants synced:",
      refs.length,
      fullName
    );

    return {
      found:
        snap.size,
      updated:
        refs.length
    };
  }

  // =========================
  // AVATAR
  // =========================

  function setAvatarUrl(url) {
    if (
      !avatarImgEl ||
      !avatarPhEl
    ) {
      return;
    }

    if (
      url
    ) {
      avatarImgEl.src =
        url;

      avatarImgEl.style.display =
        "block";

      avatarPhEl.style.display =
        "none";

      if (
        avatarWrapper
      ) {
        avatarWrapper.style.cursor =
          "pointer";
      }

    } else {
      avatarImgEl.style.display =
        "none";

      avatarPhEl.style.display =
        "block";

      if (
        avatarWrapper
      ) {
        avatarWrapper.style.cursor =
          "default";
      }
    }
  }

  // =========================
  // CLEANUP
  // =========================

  function stopTeamSubscriptions() {
    if (
      typeof unsubTeam ===
      "function"
    ) {
      unsubTeam();
    }

    if (
      typeof unsubMembers ===
      "function"
    ) {
      unsubMembers();
    }

    unsubTeam =
      null;

    unsubMembers =
      null;
  }

  function cleanup() {
    if (
      typeof unsubUser ===
      "function"
    ) {
      unsubUser();
    }

    unsubUser =
      null;

    stopTeamSubscriptions();

    activeTeamId =
      "__INIT__";

    activeParticipationKey =
      "";

    activeAppContextPromise =
      null;

    participationLoadSeq +=
      1;
  }

  // =========================
  // PROFILE EDIT
  // =========================

  function setEditMsg(
    txt,
    type
  ) {
    if (
      !profileEditMsg
    ) {
      return;
    }

    profileEditMsg.textContent =
      txt || "";

    profileEditMsg.classList.remove(
      "ok",
      "err"
    );

    if (
      type === "ok"
    ) {
      profileEditMsg.classList.add(
        "ok"
      );
    }

    if (
      type === "err"
    ) {
      profileEditMsg.classList.add(
        "err"
      );
    }
  }

  function fillProfileInputs(u) {
    const data =
      u || {};

    /*
     * Старий fullName
     * НЕ розділяємо автоматично.
     */

    if (
      lastNameInput
    ) {
      lastNameInput.value =
        norm(
          data.lastName
        );
    }

    if (
      firstNameInput
    ) {
      firstNameInput.value =
        norm(
          data.firstName
        );
    }

    if (
      phoneInput
    ) {
      phoneInput.value =
        norm(
          data.phone
        );
    }

    if (
      cityInput
    ) {
      cityInput.value =
        norm(
          data.city
        );
    }
  }

  function openEditProfile(u) {
    if (
      !profileEditBox ||
      !lastNameInput ||
      !firstNameInput ||
      !phoneInput ||
      !cityInput
    ) {
      return;
    }

    isEditingProfile =
      true;

    lastProfileSnap =
      u ||
      lastProfileSnap;

    profileEditBox.style.display =
      "block";

    if (
      editProfileBtn
    ) {
      editProfileBtn.style.display =
        "none";
    }

    if (
      saveProfileBtn
    ) {
      saveProfileBtn.style.display =
        "inline-flex";
    }

    if (
      cancelProfileBtn
    ) {
      cancelProfileBtn.style.display =
        "inline-flex";
    }

    fillProfileInputs(
      u ||
      {}
    );

    if (
      getDisplayName(
        u
      )
      &&
      (
        !norm(
          u?.lastName
        )
        ||
        !norm(
          u?.firstName
        )
      )
    ) {
      setEditMsg(
        "Вкажіть окремо прізвище та імʼя. Старий ПІБ автоматично не розділяється.",
        ""
      );

    } else {
      setEditMsg(
        "",
        ""
      );
    }
  }

  function closeEditProfile() {
    isEditingProfile =
      false;

    if (
      profileEditBox
    ) {
      profileEditBox.style.display =
        "none";
    }

    if (
      editProfileBtn
    ) {
      editProfileBtn.style.display =
        "inline-flex";
    }

    if (
      saveProfileBtn
    ) {
      saveProfileBtn.style.display =
        "none";
    }

    if (
      cancelProfileBtn
    ) {
      cancelProfileBtn.style.display =
        "none";
    }

    setEditMsg(
      "",
      ""
    );
  }

  // =========================
  // USER RENDER
  // =========================

  function renderUserInfo(u) {
    const name =
      getDisplayName(
        u
      ) ||
      "Без імені";

    const city =
      norm(
        u?.city
      );

    if (
      userFullNameEl
    ) {
      userFullNameEl.textContent =
        name;
    }

    if (
      userCityEl
    ) {
      if (
        city
      ) {
        userCityEl.textContent =
          city;

        userCityEl.style.display =
          "block";

      } else {
        userCityEl.textContent =
          "";

        userCityEl.style.display =
          "none";
      }
    }

    if (
      captainTextEl
    ) {
      captainTextEl.textContent =
        name +
        (
          city
            ? ` · ${city}`
            : ""
        );
    }

    if (
      userRoleEl
    ) {
      userRoleEl.textContent =
        roleText(
          u?.role
        );
    }

    if (
      userPhoneEl
    ) {
      userPhoneEl.textContent =
        u?.phone ||
        "—";
    }

    setAvatarUrl(
      u?.avatarUrl ||
      ""
    );

    if (
      !isEditingProfile
    ) {
      fillProfileInputs(
        u
      );
    }
  }

  // =========================
  // POPUP SYSTEM
  // =========================

  function openImagePopup(
    imageUrl
  ) {
    const popup =
      document.getElementById(
        "avatarPopup"
      );

    const popupImg =
      document.getElementById(
        "avatarPopupImg"
      );

    if (
      !popup ||
      !popupImg
    ) {
      return;
    }

    popupImg.src =
      imageUrl;

    popup.style.display =
      "flex";

    document.body.style.overflow =
      "hidden";
  }

  function closeImagePopup() {
    const popup =
      document.getElementById(
        "avatarPopup"
      );

    if (
      !popup
    ) {
      return;
    }

    popup.style.display =
      "none";

    document.body.style.overflow =
      "";
  }

  function enableAvatarPopup() {
    const popup =
      document.getElementById(
        "avatarPopup"
      );

    if (
      !popup
    ) {
      return;
    }

    if (
      avatarWrapper &&
      avatarImgEl
    ) {
      avatarWrapper.addEventListener(
        "click",
        () => {
          if (
            avatarImgEl.style.display !==
              "none"
            &&
            avatarImgEl.src
          ) {
            openImagePopup(
              avatarImgEl.src
            );
          }
        }
      );
    }

    popup.addEventListener(
      "click",
      closeImagePopup
    );

    document.addEventListener(
      "keydown",
      e => {
        if (
          e.key ===
          "Escape"
        ) {
          closeImagePopup();
        }
      }
    );
  }

  // =========================
  // MEMBERS
  // =========================

  function renderMembers(list) {
    if (
      !membersEl
    ) {
      return;
    }

    membersEl.innerHTML =
      "";

    if (
      !list ||
      list.length ===
        0
    ) {
      membersEl.innerHTML =
        '<div class="form__hint">Склад команди поки порожній.</div>';

      return;
    }

    list.forEach(
      m => {
        const name =
          getDisplayName(
            m
          ) ||
          m.email ||
          "Учасник";

        const role =
          roleText(
            m.role
          );

        const avatarUrl =
          m.avatarUrl ||
          "";

        const hasAvatar =
          Boolean(
            avatarUrl
          );

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "card";

        row.style.cssText =
          "padding:12px;margin-top:10px;display:flex;align-items:center;gap:12px;";

        const avatarHtml =
          hasAvatar
            ? `
              <div
                class="member-avatar-wrap"
                style="
                  width:50px;
                  height:50px;
                  border-radius:50%;
                  overflow:hidden;
                  border:2px solid #facc15;
                  cursor:pointer;
                "
              >
                <img
                  src="${escapeHtml(
                    avatarUrl
                  )}"
                  style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                  "
                  alt=""
                >
              </div>
            `
            : `
              <div
                style="
                  width:50px;
                  height:50px;
                  border-radius:50%;
                  background:#1f2937;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  font-size:24px;
                "
              >
                👤
              </div>
            `;

        row.innerHTML = `
          ${avatarHtml}

          <div>
            <div style="font-weight:800">
              ${escapeHtml(
                name
              )}
            </div>

            <div class="form__hint">
              ${escapeHtml(
                role
              )}
            </div>
          </div>
        `;

        if (
          hasAvatar
        ) {
          const avatarWrap =
            row.querySelector(
              ".member-avatar-wrap"
            );

          if (
            avatarWrap
          ) {
            avatarWrap.addEventListener(
              "click",
              () => {
                openImagePopup(
                  avatarUrl
                );
              }
            );
          }
        }

        membersEl.appendChild(
          row
        );
      }
    );
  }

  // =========================
  // CACHE RENDER
  // =========================

  function renderCompsFromCache() {
    const comps =
      Cache.get(
        "competitions"
      );

    if (
      !Cache.isCompsValid()
    ) {
      return false;
    }

    renderMyParticipation(
      Array.isArray(
        comps
      )
        ? comps
        : []
    );

    return true;
  }

  function renderFromCache() {
    const user =
      Cache.get(
        "user"
      );

    const team =
      Cache.get(
        "team"
      );

    const members =
      Cache.get(
        "members"
      );

    if (
      !Cache.isUserValid() ||
      !user
    ) {
      return false;
    }

    renderUserInfo(
      user
    );

    if (
      team &&
      teamNameEl
    ) {
      teamNameEl.textContent =
        team.name ||
        "Команда";

      if (
        team.joinCode &&
        joinCodePillEl &&
        joinCodeTextEl
      ) {
        joinCodePillEl.style.display =
          "inline-flex";

        joinCodeTextEl.textContent =
          team.joinCode;
      }
    }

    renderMembers(
      members
    );

    return true;
  }

  // =========================
  // COMPETITION META
  // =========================

  async function getCompetitionDoc(
    db,
    compId
  ) {
    const id =
      norm(
        compId
      );

    if (
      !id
    ) {
      return null;
    }

    if (
      competitionDocCache.has(
        id
      )
    ) {
      return competitionDocCache.get(
        id
      );
    }

    const promise =
      db
        .collection(
          "competitions"
        )
        .doc(
          id
        )
        .get()
        .then(
          snap =>
            snap.exists
              ? (
                  snap.data() ||
                  {}
                )
              : null
        )
        .catch(
          err => {
            console.warn(
              "[cabinet] competition meta:",
              id,
              err
            );

            return null;
          }
        );

    competitionDocCache.set(
      id,
      promise
    );

    return promise;
  }

  async function getCompetitionMeta(
    db,
    compId,
    stageId
  ) {
    const id =
      norm(
        compId
      );

    const st =
      norm(
        stageId
      ) ||
      "main";

    const key =
      `${id}||${st}`;

    if (
      competitionMetaCache.has(
        key
      )
    ) {
      return competitionMetaCache.get(
        key
      );
    }

    const promise =
      (async () => {
        const c =
          await getCompetitionDoc(
            db,
            id
          );

        if (
          !c
        ) {
          return {
            compTitle:
              id ||
              "Змагання",

            stageTitle:
              st ===
                "main"
                ? ""
                : st
          };
        }

        const compTitle =
          norm(
            c.name ||
            c.title ||
            id ||
            "Змагання"
          );

        const events =
          Array.isArray(
            c.events
          )
            ? c.events
            : [];

        const ev =
          events.find(
            e => {
              const eventId =
                norm(
                  e?.key ||
                  e?.stageId ||
                  e?.id
                );

              return (
                eventId ===
                st
              );
            }
          );

        let stageTitle =
          norm(
            ev?.title ||
            ev?.name ||
            ev?.label ||
            ""
          );

        if (
          !stageTitle &&
          st !== "main"
        ) {
          stageTitle =
            st;
        }

        return {
          compTitle,
          stageTitle
        };
      })();

    competitionMetaCache.set(
      key,
      promise
    );

    return promise;
  }

  // =========================
  // MY PARTICIPATION
  // =========================

  function niceTitleOnly(it) {
    const comp =
      norm(
        it.compTitle ||
        it.competitionTitle ||
        it.competitionName ||
        it.competitionId ||
        "Змагання"
      );

    const st =
      norm(
        it.stageTitle ||
        (
          it.stageId &&
          it.stageId !==
            "main"
            ? it.stageId
            : ""
        ) ||
        ""
      );

    return st
      ? `${escapeHtml(
          comp
        )} · ${escapeHtml(
          st
        )}`
      : escapeHtml(
          comp
        );
  }

  function renderMyParticipation(
    items
  ) {
    if (
      !myPartListEl
    ) {
      return;
    }

    myPartListEl.innerHTML =
      "";

    if (
      !items ||
      items.length ===
        0
    ) {
      myPartListEl.innerHTML =
        '<div class="cabinet-small-muted">Немає участі в активному змаганні.</div>';

      return;
    }

    items.forEach(
      it => {
        const compId =
          norm(
            it.competitionId
          );

        const stageId =
          norm(
            it.stageId
          ) ||
          "main";

        const href =
          `participation.html?comp=${encodeURIComponent(
            compId
          )}` +
          `&stage=${encodeURIComponent(
            stageId
          )}`;

        const row =
          document.createElement(
            "a"
          );

        row.href =
          href;

        row.className =
          "card";

        row.style.cssText =
          "display:block;padding:14px;margin-top:10px;text-decoration:none;";

        row.innerHTML = `
          <div
            style="
              font-weight:950;
              line-height:1.25;
              text-align:center;
              background:linear-gradient(
                90deg,
                #facc15 0%,
                #7f1d1d 100%
              );
              -webkit-background-clip:text;
              background-clip:text;
              color:transparent;
              -webkit-text-fill-color:transparent;
            "
          >
            ${niceTitleOnly(
              it
            )}
          </div>
        `;

        myPartListEl.appendChild(
          row
        );
      }
    );
  }

  function rowBelongsToUser(
    docId,
    data,
    teamId,
    uid
  ) {
    const d =
      data ||
      {};

    const isSolo =
      isSoloPublicDoc(
        docId,
        d
      );

    if (
      isSolo
    ) {
      return (
        norm(
          d.uid
        ) ===
        uid
      );
    }

    return Boolean(
      teamId
      &&
      norm(
        d.teamId
      ) ===
      teamId
    );
  }

  async function loadMyParticipation(
    db,
    teamId,
    uid,
    options = {}
  ) {
    if (
      !myPartListEl
    ) {
      return;
    }

    const force =
      options.force ===
      true;

    const cleanTeamId =
      norm(
        teamId
      );

    const cleanUid =
      norm(
        uid
      );

    if (
      !cleanTeamId &&
      !cleanUid
    ) {
      activeParticipationKey =
        "";

      Cache.setComps(
        []
      );

      renderMyParticipation(
        []
      );

      return;
    }

    const seq =
      ++participationLoadSeq;

    try {
      /*
       * 1. Беремо тільки
       * активне змагання/етап.
       */
      const active =
        await getActiveAppContext(
          db,
          force
        );

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      const activeCompId =
        norm(
          active.competitionId
        );

      const activeStageId =
        norm(
          active.stageId
        ) ||
        "main";

      const contextKey =
        `${cleanUid}||${cleanTeamId}||${activeCompId}||${activeStageId}`;

      if (
        !force
        &&
        activeParticipationKey ===
          contextKey
        &&
        Cache.isCompsValid()
      ) {
        renderMyParticipation(
          Cache.get(
            "competitions"
          ) ||
          []
        );

        return;
      }

      activeParticipationKey =
        contextKey;

      /*
       * Нема активного competitionId —
       * нічого старого не показуємо.
       */
      if (
        !activeCompId
      ) {
        Cache.setComps(
          []
        );

        renderMyParticipation(
          []
        );

        return;
      }

      if (
        !Cache.isCompsValid() ||
        force
      ) {
        myPartListEl.innerHTML =
          '<div class="cabinet-small-muted">Завантаження…</div>';
      }

      /*
       * 2. ОДИН запит:
       * тільки activeCompetitionId.
       */
      const snap =
        await db
          .collection(
            "public_participants"
          )
          .where(
            "competitionId",
            "==",
            activeCompId
          )
          .get();

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      const rows =
        [];

      snap.forEach(
        doc => {
          const data =
            doc.data() ||
            {};

          /*
           * Тільки наша команда
           * або наш SOLO.
           */
          if (
            !rowBelongsToUser(
              doc.id,
              data,
              cleanTeamId,
              cleanUid
            )
          ) {
            return;
          }

          /*
           * Тільки активний етап.
           */
          if (
            !stageMatches(
              data.stageId,
              activeStageId
            )
          ) {
            return;
          }

          rows.push({
            id:
              doc.id,

            ...data
          });
        }
      );

      if (
        !rows.length
      ) {
        Cache.setComps(
          []
        );

        renderMyParticipation(
          []
        );

        return;
      }

      /*
       * На одному active competition/stage
       * показуємо один рядок.
       *
       * SOLO має пріоритет
       * над legacy TEAM-дублем.
       */
      rows.sort(
        (
          a,
          b
        ) => {
          const aSolo =
            isSoloPublicDoc(
              a.id,
              a
            )
              ? 1
              : 0;

          const bSolo =
            isSoloPublicDoc(
              b.id,
              b
            )
              ? 1
              : 0;

          return (
            bSolo -
            aSolo
          );
        }
      );

      const picked =
        rows[0];

      const meta =
        await getCompetitionMeta(
          db,
          activeCompId,
          activeStageId
        );

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      const result = [
        {
          ...picked,

          competitionId:
            activeCompId,

          stageId:
            activeStageId,

          compTitle:
            meta.compTitle ||
            picked.competitionTitle ||
            picked.competitionName ||
            activeCompId,

          stageTitle:
            meta.stageTitle ||
            picked.stageName ||
            ""
        }
      ];

      Cache.setComps(
        result
      );

      renderMyParticipation(
        result
      );

    } catch (
      err
    ) {
      console.error(
        "[cabinet] participation load:",
        err
      );

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      const cached =
        Cache.get(
          "competitions"
        );

      if (
        Array.isArray(
          cached
        )
        &&
        cached.length
      ) {
        renderMyParticipation(
          cached
        );

      } else {
        renderMyParticipation(
          []
        );
      }

      myPartListEl.insertAdjacentHTML(
        "beforeend",
        '<div class="cabinet-small-muted" style="color:#ef4444;margin-top:8px;">Не вдалося оновити активну участь.</div>'
      );
    }
  }

  // =========================
  // TEAM & USER SUBSCRIPTIONS
  // =========================

  function subscribeTeam(
    db,
    teamId
  ) {
    const id =
      norm(
        teamId
      );

    if (
      !id
    ) {
      Cache.setTeam(
        null
      );

      Cache.setMembers(
        []
      );

      if (
        teamNameEl
      ) {
        teamNameEl.textContent =
          "Без команди";
      }

      if (
        joinCodePillEl
      ) {
        joinCodePillEl.style.display =
          "none";
      }

      renderMembers(
        []
      );

      return;
    }

    unsubTeam =
      db
        .collection(
          "teams"
        )
        .doc(
          id
        )
        .onSnapshot(
          snap => {
            if (
              !snap.exists
            ) {
              Cache.setTeam(
                null
              );

              if (
                teamNameEl
              ) {
                teamNameEl.textContent =
                  "Команда";
              }

              return;
            }

            const t =
              snap.data() ||
              {};

            Cache.setTeam(
              t
            );

            if (
              teamNameEl
            ) {
              teamNameEl.textContent =
                t.name ||
                "Команда";
            }

            if (
              t.joinCode &&
              joinCodePillEl &&
              joinCodeTextEl
            ) {
              joinCodePillEl.style.display =
                "inline-flex";

              joinCodeTextEl.textContent =
                t.joinCode;

            } else if (
              joinCodePillEl
            ) {
              joinCodePillEl.style.display =
                "none";
            }
          },

          err => {
            console.warn(
              "[cabinet] team:",
              err
            );
          }
        );

    unsubMembers =
      db
        .collection(
          "users"
        )
        .where(
          "teamId",
          "==",
          id
        )
        .onSnapshot(
          qs => {
            const list =
              [];

            qs.forEach(
              d => {
                list.push({
                  id:
                    d.id,

                  ...(
                    d.data() ||
                    {}
                  )
                });
              }
            );

            Cache.setMembers(
              list
            );

            renderMembers(
              list
            );
          },

          err => {
            console.warn(
              "[cabinet] members:",
              err
            );

            renderMembers(
              Cache.get(
                "members"
              ) ||
              []
            );
          }
        );
  }

  function ensureTeamSubscription(
    db,
    teamId
  ) {
    const nextTeamId =
      norm(
        teamId
      );

    /*
     * teamId не змінився —
     * нічого не перепідписуємо.
     */
    if (
      nextTeamId ===
      activeTeamId
    ) {
      return false;
    }

    stopTeamSubscriptions();

    activeTeamId =
      nextTeamId;

    subscribeTeam(
      db,
      nextTeamId
    );

    return true;
  }

  function subscribeUser(
    auth,
    db,
    uid
  ) {
    renderCompsFromCache();

    const hasUserCache =
      renderFromCache();

    if (
      !hasUserCache
    ) {
      setStatus(
        "Завантаження…"
      );

      showContent();
    }

    unsubUser =
      db
        .collection(
          "users"
        )
        .doc(
          uid
        )
        .onSnapshot(
          snap => {
            if (
              !snap.exists
            ) {
              setStatus(
                "Анкета користувача не знайдена."
              );

              showContent();

              return;
            }

            const u =
              snap.data() ||
              {};

            const teamId =
              norm(
                u.teamId
              );

            Cache.setUser(
              u
            );

            lastProfileSnap =
              u;

            renderUserInfo(
              u
            );

            const teamChanged =
              ensureTeamSubscription(
                db,
                teamId
              );

            /*
             * Якщо listener users спрацював
             * через ПІБ / телефон / аватар,
             * участь вдруге не вантажимо.
             */
            if (
              teamChanged ||
              !activeParticipationKey
            ) {
              loadMyParticipation(
                db,
                teamId,
                uid,
                {
                  force:
                    teamChanged
                }
              );
            }

            setStatus(
              "Кабінет завантажено."
            );

            showContent();

            setTimeout(
              () => {
                if (
                  statusEl?.textContent ===
                  "Кабінет завантажено."
                ) {
                  statusEl.textContent =
                    "";
                }
              },
              700
            );
          },

          err => {
            console.error(
              err
            );

            if (
              !hasUserCache
            ) {
              setStatus(
                "Помилка читання профілю."
              );
            }

            showContent();
          }
        );
  }

  // =========================
  // CLOUDINARY WIDGET
  // =========================

  function setupCloudinaryWidget(
    auth,
    db
  ) {
    const CLOUDINARY_CLOUD =
      "dxlr12gzc";

    const CLOUDINARY_PRESET =
      "avatar_upload";

    const openWidgetBtn =
      document.getElementById(
        "openCloudinaryWidget"
      );

    const msgEl =
      document.getElementById(
        "avatarMsg"
      );

    if (
      !openWidgetBtn ||
      !window.cloudinary
    ) {
      console.warn(
        "Cloudinary Widget не доступний"
      );

      return;
    }

    function setMsg(
      txt,
      type
    ) {
      if (
        !msgEl
      ) {
        return;
      }

      msgEl.textContent =
        txt ||
        "";

      msgEl.classList.remove(
        "ok",
        "err"
      );

      if (
        type === "ok"
      ) {
        msgEl.classList.add(
          "ok"
        );
      }

      if (
        type === "err"
      ) {
        msgEl.classList.add(
          "err"
        );
      }
    }

    openWidgetBtn.addEventListener(
      "click",
      () => {
        const user =
          auth.currentUser;

        if (
          !user
        ) {
          setMsg(
            "Увійдіть у акаунт",
            "err"
          );

          return;
        }

        const widget =
          cloudinary
            .createUploadWidget(
              {
                cloudName:
                  CLOUDINARY_CLOUD,

                uploadPreset:
                  CLOUDINARY_PRESET,

                folder:
                  `avatars/${user.uid}`,

                sources: [
                  "local",
                  "camera"
                ],

                multiple:
                  false,

                maxFileSize:
                  5000000,

                cropping:
                  true,

                croppingAspectRatio:
                  1,

                showSkipCropButton:
                  false,

                language:
                  "uk",

                styles: {
                  palette: {
                    window:
                      "#0f172a",

                    sourceBg:
                      "#1e293b",

                    windowBorder:
                      "#facc15",

                    tabIcon:
                      "#facc15",

                    inactiveTabIcon:
                      "#94a3b8",

                    menuIcons:
                      "#facc15",

                    link:
                      "#facc15",

                    action:
                      "#facc15",

                    inProgress:
                      "#f97316",

                    complete:
                      "#22c55e",

                    error:
                      "#ef4444",

                    textDark:
                      "#020617",

                    textLight:
                      "#e2e8f0"
                  }
                }
              },

              async (
                error,
                result
              ) => {
                if (
                  error
                ) {
                  console.error(
                    error
                  );

                  setMsg(
                    "Помилка завантаження",
                    "err"
                  );

                  return;
                }

                if (
                  result.event !==
                  "success"
                ) {
                  return;
                }

                try {
                  setMsg(
                    "Зберігаю…"
                  );

                  await db
                    .collection(
                      "users"
                    )
                    .doc(
                      user.uid
                    )
                    .set(
                      {
                        avatarUrl:
                          result.info
                            .secure_url
                      },
                      {
                        merge:
                          true
                      }
                    );

                  setAvatarUrl(
                    result.info
                      .secure_url
                  );

                  setMsg(
                    "Аватар оновлено!",
                    "ok"
                  );

                  setTimeout(
                    () => {
                      setMsg(
                        "",
                        ""
                      );
                    },
                    3000
                  );

                } catch (
                  err
                ) {
                  console.error(
                    err
                  );

                  setMsg(
                    "Помилка збереження",
                    "err"
                  );
                }
              }
            );

        widget.open();
      }
    );
  }

  // =========================
  // PROFILE EDIT EVENTS
  // =========================

  function setupProfileEdit(
    auth,
    db
  ) {
    if (
      !editProfileBtn ||
      !saveProfileBtn ||
      !cancelProfileBtn ||
      !profileEditBox ||
      !lastNameInput ||
      !firstNameInput ||
      !phoneInput ||
      !cityInput
    ) {
      console.warn(
        "⚠️ Profile Edit UI not found in HTML"
      );

      return;
    }

    editProfileBtn.addEventListener(
      "click",
      () => {
        openEditProfile(
          lastProfileSnap ||
          Cache.get(
            "user"
          )
        );
      }
    );

    cancelProfileBtn.addEventListener(
      "click",
      () => {
        const u =
          lastProfileSnap ||
          Cache.get(
            "user"
          ) ||
          {};

        fillProfileInputs(
          u
        );

        closeEditProfile();
      }
    );

    saveProfileBtn.addEventListener(
      "click",
      async () => {
        if (
          isSavingProfile
        ) {
          return;
        }

        const user =
          auth.currentUser;

        if (
          !user
        ) {
          setEditMsg(
            "Увійдіть у акаунт.",
            "err"
          );

          return;
        }

        const lastName =
          cleanNamePart(
            lastNameInput.value
          );

        const firstName =
          cleanNamePart(
            firstNameInput.value
          );

        const phone =
          cleanPhone(
            phoneInput.value
          );

        const city =
          cleanCity(
            cityInput.value
          );

        if (
          !lastName
        ) {
          setEditMsg(
            "Вкажіть прізвище.",
            "err"
          );

          lastNameInput.focus();

          return;
        }

        if (
          !firstName
        ) {
          setEditMsg(
            "Вкажіть імʼя.",
            "err"
          );

          firstNameInput.focus();

          return;
        }

        if (
          !phone
        ) {
          setEditMsg(
            "Вкажіть номер телефону.",
            "err"
          );

          phoneInput.focus();

          return;
        }

        const fullName =
          buildFullName(
            lastName,
            firstName
          );

        if (
          !fullName
        ) {
          setEditMsg(
            "Не вдалося сформувати ПІБ.",
            "err"
          );

          return;
        }

        const previous =
          lastProfileSnap ||
          Cache.get(
            "user"
          ) ||
          {};

        const nameChanged =
          norm(
            previous.lastName
          ) !==
            lastName
          ||
          norm(
            previous.firstName
          ) !==
            firstName;

        try {
          isSavingProfile =
            true;

          saveProfileBtn.disabled =
            true;

          setEditMsg(
            "Зберігаю…"
          );

          const localUpd = {
            lastName,
            firstName,
            fullName,
            phone,

            city:
              city ||
              ""
          };

          const firestoreUpd = {
            ...localUpd
          };

          const ts =
            serverTimestamp();

          if (
            ts
          ) {
            firestoreUpd.updatedAt =
              ts;
          }

          // ===============================================
          // 1. USERS
          // ===============================================

          await db
            .collection(
              "users"
            )
            .doc(
              user.uid
            )
            .set(
              firestoreUpd,
              {
                merge:
                  true
              }
            );

          // ===============================================
          // 2. SOLO PUBLIC SYNC
          // ===============================================

          let publicSyncError =
            null;

          let publicSyncResult =
            null;

          if (
            nameChanged
          ) {
            try {
              publicSyncResult =
                await syncSoloPublicParticipants(
                  db,
                  user.uid,
                  firstName,
                  lastName,
                  fullName
                );

            } catch (
              syncErr
            ) {
              publicSyncError =
                syncErr;

              console.error(
                "❌ SOLO public_participants sync error:",
                syncErr
              );
            }
          }

          // ===============================================
          // 3. LOCAL CACHE
          // ===============================================

          lastProfileSnap = {
            ...previous,
            ...localUpd
          };

          Cache.setUser(
            lastProfileSnap
          );

          renderUserInfo(
            lastProfileSnap
          );

          // ===============================================
          // RESULT
          // ===============================================

          if (
            publicSyncError
          ) {
            setEditMsg(
              `Профіль збережено: ${fullName}. Але SOLO-список не синхронізовано. Перевірте Firestore Rules.`,
              "err"
            );

            return;
          }

          if (
            nameChanged &&
            publicSyncResult?.updated >
              0
          ) {
            setEditMsg(
              `Збережено: ${fullName}. SOLO-заявки оновлено.`,
              "ok"
            );

          } else {
            setEditMsg(
              `Збережено: ${fullName}`,
              "ok"
            );
          }

          setTimeout(
            () => {
              closeEditProfile();
            },
            700
          );

        } catch (
          e
        ) {
          console.error(
            e
          );

          setEditMsg(
            "Помилка збереження. Перевірте правила доступу.",
            "err"
          );

        } finally {
          isSavingProfile =
            false;

          saveProfileBtn.disabled =
            false;
        }
      }
    );
  }

  // =========================
  // INIT
  // =========================

  (async () => {
    try {
      const hasComps =
        renderCompsFromCache();

      const hasUser =
        renderFromCache();

      if (
        hasComps ||
        hasUser
      ) {
        showContent();

        setStatus(
          "Оновлення…"
        );

      } else {
        setStatus(
          "Завантаження…"
        );
      }

      await waitFirebase();

      const auth =
        window.scAuth;

      const db =
        window.scDb;

      auth.onAuthStateChanged(
        user => {
          cleanup();

          if (
            !user
          ) {
            Cache.clear();

            setStatus(
              "Ви не увійшли. Переходимо…"
            );

            hideContent();

            setTimeout(
              () => {
                window.location.href =
                  "auth.html";
              },
              400
            );

            return;
          }

          if (
            user.uid ===
            ADMIN_UID
          ) {
            setStatus(
              "Адмін-акаунт → перехід…"
            );

            hideContent();

            setTimeout(
              () => {
                window.location.href =
                  "admin.html";
              },
              200
            );

            return;
          }

          subscribeUser(
            auth,
            db,
            user.uid
          );
        }
      );

      setupCloudinaryWidget(
        auth,
        db
      );

      enableAvatarPopup();

      setupProfileEdit(
        auth,
        db
      );

    } catch (
      err
    ) {
      console.error(
        err
      );

      setStatus(
        "Помилка: " +
        (
          err?.message ||
          err
        )
      );

      showContent();
    }
  })();

})();
