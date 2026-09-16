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
// ✅ "Моя участь" = TEAM + SOLO
// ✅ завершені змагання ховаємо по competitions/{id}.schedule.finishAt
// ✅ settings/app більше НЕ використовується для "Моя участь"
// ✅ public_participants читається двома простими паралельними запитами
// ✅ team/members не перепідписуються при кожній зміні users/{uid}
// ✅ competition docs кешуються і читаються паралельно

(function () {
  "use strict";

  console.log(
    "✅ cabinet.js LOADED v20260916-current-participation-v6"
  );

  // =========================
  // BURGER MENU
  // =========================

  const burger =
    document.getElementById(
      "burger"
    );

  const nav =
    document.querySelector(
      ".nav"
    );

  if (
    burger &&
    nav
  ) {
    burger.addEventListener(
      "click",
      () =>
        nav.classList.toggle(
          "open"
        )
    );

    nav.addEventListener(
      "click",
      e => {
        if (
          e.target.classList.contains(
            "nav__link"
          )
        ) {
          nav.classList.remove(
            "open"
          );
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
    const t0 =
      Date.now();

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
        resolve =>
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
      user:
        null,

      team:
        null,

      members:
        [],

      competitions:
        [],

      userLastUpdate:
        0,

      compsLastUpdate:
        0
    },

    isUserValid(
      maxAgeMs = 60000
    ) {
      return Boolean(
        this.data
          .userLastUpdate &&
        Date.now() -
          this.data
            .userLastUpdate <
          maxAgeMs
      );
    },

    isCompsValid(
      maxAgeMs = 300000
    ) {
      return Boolean(
        this.data
          .compsLastUpdate &&
        Date.now() -
          this.data
            .compsLastUpdate <
          maxAgeMs
      );
    },

    setUser(
      value
    ) {
      this.data.user =
        value;

      this.data.userLastUpdate =
        Date.now();
    },

    setTeam(
      value
    ) {
      this.data.team =
        value;
    },

    setMembers(
      value
    ) {
      this.data.members =
        value;
    },

    setComps(
      value
    ) {
      this.data.competitions =
        value;

      this.data.compsLastUpdate =
        Date.now();
    },

    get(
      key
    ) {
      return this.data[
        key
      ];
    },

    clear() {
      this.data = {
        user:
          null,

        team:
          null,

        members:
          [],

        competitions:
          [],

        userLastUpdate:
          0,

        compsLastUpdate:
          0
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

  const competitionDocCache =
    new Map();

  // =========================
  // HELPERS
  // =========================

  function setStatus(
    t
  ) {
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

  function norm(
    v
  ) {
    return String(
      v ?? ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  function normLower(
    v
  ) {
    return norm(
      v
    )
      .toLowerCase();
  }

  function roleText(
    role
  ) {
    return (
      role ===
      "admin"
        ? "Адміністратор"
        : role ===
            "judge"
          ? "Суддя"
          : role ===
              "captain"
            ? "Капітан команди"
            : "Учасник команди"
    );
  }

  function escapeHtml(
    str
  ) {
    return String(
      str ||
      ""
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

  function toMillis(
    value
  ) {
    if (
      !value
    ) {
      return 0;
    }

    try {
      if (
        typeof value
          .toMillis ===
        "function"
      ) {
        return value
          .toMillis();
      }

      if (
        typeof value
          .toDate ===
        "function"
      ) {
        return value
          .toDate()
          .getTime();
      }

      if (
        typeof value ===
        "number"
      ) {
        return Number.isFinite(
          value
        )
          ? value
          : 0;
      }

      if (
        typeof value ===
          "object"
        &&
        Number.isFinite(
          value.seconds
        )
      ) {
        return (
          value.seconds *
          1000
        );
      }

      if (
        typeof value ===
          "object"
        &&
        Number.isFinite(
          value._seconds
        )
      ) {
        return (
          value._seconds *
          1000
        );
      }

      const d =
        new Date(
          value
        );

      const ms =
        d.getTime();

      return Number.isNaN(
        ms
      )
        ? 0
        : ms;

    } catch {
      return 0;
    }
  }

  // =========================
  // NAME HELPERS
  // =========================

  function cleanNamePart(
    v
  ) {
    return String(
      v ||
      ""
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

  function getDisplayName(
    u
  ) {
    const data =
      u ||
      {};

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
      )
      ||
      norm(
        data.name
      )
      ||
      ""
    );
  }

  function cleanPhone(
    v
  ) {
    return String(
      v ||
      ""
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

  function cleanCity(
    v
  ) {
    return String(
      v ||
      ""
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
  // SOLO PUBLIC SYNC
  // =========================

  function isSoloPublicDoc(
    docId,
    data
  ) {
    const d =
      data ||
      {};

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
        const upd = {
          firstName,
          lastName,
          fullName,

          participantName:
            fullName,

          displayName:
            fullName,

          captain:
            fullName
        };

        const ts =
          serverTimestamp();

        if (
          ts
        ) {
          upd.updatedAt =
            ts;
        }

        batch.set(
          ref,
          upd,
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

  function setAvatarUrl(
    url
  ) {
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
      txt ||
      "";

    profileEditMsg.classList.remove(
      "ok",
      "err"
    );

    if (
      type ===
      "ok"
    ) {
      profileEditMsg.classList.add(
        "ok"
      );
    }

    if (
      type ===
      "err"
    ) {
      profileEditMsg.classList.add(
        "err"
      );
    }
  }

  function fillProfileInputs(
    u
  ) {
    const data =
      u ||
      {};

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

  function openEditProfile(
    u
  ) {
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

  function renderUserInfo(
    u
  ) {
    const name =
      getDisplayName(
        u
      )
      ||
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

  function renderMembers(
    list
  ) {
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
          )
          ||
          m.email
          ||
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
      !Cache.isUserValid()
      ||
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
  // COMPETITIONS
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
          snap => {
            if (
              !snap.exists
            ) {
              return null;
            }

            return {
              id:
                snap.id,

              ...(
                snap.data() ||
                {}
              )
            };
          }
        )
        .catch(
          err => {
            console.warn(
              "[cabinet] competition:",
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

  function getCompetitionFinishMs(
    competition
  ) {
    const c =
      competition ||
      {};

    return (
      toMillis(
        c?.schedule?.finishAt
      )
      ||
      toMillis(
        c?.finishAt
      )
      ||
      toMillis(
        c?.endAt
      )
      ||
      0
    );
  }

  function getCompetitionStartMs(
    competition
  ) {
    const c =
      competition ||
      {};

    return (
      toMillis(
        c?.schedule?.startAt
      )
      ||
      toMillis(
        c?.startAt
      )
      ||
      0
    );
  }

  function isCompetitionFinished(
    competition
  ) {
    const c =
      competition ||
      {};

    /*
     * ГОЛОВНЕ ДЖЕРЕЛО:
     *
     * schedule.finishAt
     *
     * Якщо дата є —
     * status уже не вгадуємо.
     */
    const finishMs =
      getCompetitionFinishMs(
        c
      );

    if (
      finishMs >
      0
    ) {
      return (
        finishMs <
        Date.now()
      );
    }

    /*
     * Fallback тільки
     * для старих документів,
     * де finishAt відсутній.
     */
    const status =
      normLower(
        c.status ||
        c.state ||
        ""
      );

    return [
      "finished",
      "completed",
      "ended",
      "archived"
    ].includes(
      status
    );
  }

  function getCompetitionTitle(
    competition,
    fallbackId
  ) {
    const c =
      competition ||
      {};

    return norm(
      c.name ||
      c.title ||
      fallbackId ||
      "Змагання"
    );
  }

  function getStageTitle(
    competition,
    stageId,
    fallbackTitle = ""
  ) {
    const c =
      competition ||
      {};

    const st =
      norm(
        stageId
      ) ||
      "main";

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

    const fromCompetition =
      norm(
        ev?.title ||
        ev?.name ||
        ev?.label ||
        ""
      );

    if (
      fromCompetition
    ) {
      return fromCompetition;
    }

    if (
      norm(
        fallbackTitle
      )
    ) {
      return norm(
        fallbackTitle
      );
    }

    return (
      st ===
      "main"
        ? ""
        : st
    );
  }

  // =========================
  // MY PARTICIPATION
  // =========================

  function niceTitleOnly(
    it
  ) {
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
        )
        ||
        ""
      );

    return (
      st
        ? `${escapeHtml(
            comp
          )} · ${escapeHtml(
            st
          )}`
        : escapeHtml(
            comp
          )
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
        '<div class="cabinet-small-muted">Немає участі в актуальних змаганнях.</div>';

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
          )}`
          +
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

  function rowPreference(
    row
  ) {
    return (
      isSoloPublicDoc(
        row?.id,
        row
      )
        ? 2
        : 1
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

    const contextKey =
      `${cleanUid}||${cleanTeamId}`;

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

    if (
      !force &&
      activeParticipationKey ===
        contextKey &&
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

    const seq =
      ++participationLoadSeq;

    if (
      !Cache.isCompsValid()
      ||
      force
    ) {
      myPartListEl.innerHTML =
        '<div class="cabinet-small-muted">Завантаження…</div>';
    }

    try {

      // ===============================================
      // TEAM + SOLO ПАРАЛЕЛЬНО
      // ===============================================

      const teamPromise =
        cleanTeamId
          ? db
              .collection(
                "public_participants"
              )
              .where(
                "teamId",
                "==",
                cleanTeamId
              )
              .get()
              .catch(
                err => {
                  console.warn(
                    "[cabinet] TEAM participation:",
                    err
                  );

                  return null;
                }
              )
          : Promise.resolve(
              null
            );

      const uidPromise =
        cleanUid
          ? db
              .collection(
                "public_participants"
              )
              .where(
                "uid",
                "==",
                cleanUid
              )
              .get()
              .catch(
                err => {
                  console.warn(
                    "[cabinet] UID participation:",
                    err
                  );

                  return null;
                }
              )
          : Promise.resolve(
              null
            );

      const [
        teamSnap,
        uidSnap
      ] =
        await Promise.all([
          teamPromise,
          uidPromise
        ]);

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      // ===============================================
      // DEDUPE ПО DOC ID
      // ===============================================

      const byDocId =
        new Map();

      if (
        teamSnap
      ) {
        teamSnap.forEach(
          doc => {
            const data =
              doc.data() ||
              {};

            /*
             * По teamId
             * беремо лише TEAM.
             */
            if (
              normLower(
                data.entryType
              ) ===
                "solo"
              ||
              isSoloPublicDoc(
                doc.id,
                data
              )
            ) {
              return;
            }

            byDocId.set(
              doc.id,
              {
                id:
                  doc.id,

                ...data
              }
            );
          }
        );
      }

      if (
        uidSnap
      ) {
        uidSnap.forEach(
          doc => {
            const data =
              doc.data() ||
              {};

            byDocId.set(
              doc.id,
              {
                id:
                  doc.id,

                ...data
              }
            );
          }
        );
      }

      const allRows =
        Array.from(
          byDocId.values()
        );

      if (
        !allRows.length
      ) {
        Cache.setComps(
          []
        );

        renderMyParticipation(
          []
        );

        return;
      }

      // ===============================================
      // ONE COMPETITION/STAGE = ONE ROW
      // ===============================================

      const byCompetitionStage =
        new Map();

      allRows.forEach(
        row => {
          const compId =
            norm(
              row.competitionId
            );

          const stageId =
            norm(
              row.stageId
            ) ||
            "main";

          if (
            !compId
          ) {
            return;
          }

          const key =
            `${compId}||${stageId}`;

          const existing =
            byCompetitionStage.get(
              key
            );

          if (
            !existing
            ||
            rowPreference(
              row
            ) >
              rowPreference(
                existing
              )
          ) {
            byCompetitionStage.set(
              key,
              row
            );
          }
        }
      );

      const uniq =
        Array.from(
          byCompetitionStage
            .values()
        );

      if (
        !uniq.length
      ) {
        Cache.setComps(
          []
        );

        renderMyParticipation(
          []
        );

        return;
      }

      // ===============================================
      // COMPETITION DOCS ПАРАЛЕЛЬНО
      // ===============================================

      const uniqueCompIds =
        Array.from(
          new Set(
            uniq
              .map(
                row =>
                  norm(
                    row.competitionId
                  )
              )
              .filter(
                Boolean
              )
          )
        );

      const competitionPairs =
        await Promise.all(
          uniqueCompIds.map(
            async compId => {
              const competition =
                await getCompetitionDoc(
                  db,
                  compId
                );

              return [
                compId,
                competition
              ];
            }
          )
        );

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      const competitionMap =
        new Map(
          competitionPairs
        );

      // ===============================================
      // FILTER FINISHED
      // ===============================================

      const visible =
        [];

      uniq.forEach(
        row => {
          const compId =
            norm(
              row.competitionId
            );

          const competition =
            competitionMap.get(
              compId
            );

          /*
           * Якщо competition
           * вже видалений —
           * orphan не показуємо.
           */
          if (
            !competition
          ) {
            return;
          }

          /*
           * ГОЛОВНА ЛОГІКА:
           *
           * schedule.finishAt < now
           * = завершене
           * = не показуємо.
           */
          if (
            isCompetitionFinished(
              competition
            )
          ) {
            return;
          }

          const stageId =
            norm(
              row.stageId
            ) ||
            "main";

          visible.push({
            ...row,

            compTitle:
              getCompetitionTitle(
                competition,
                compId
              ),

            stageTitle:
              getStageTitle(
                competition,
                stageId,
                row.stageName ||
                row.stageTitle ||
                ""
              ),

            _competitionStart:
              getCompetitionStartMs(
                competition
              ),

            _competitionFinish:
              getCompetitionFinishMs(
                competition
              ),

            _registrationTime:
              toMillis(
                row.updatedAt
              )
              ||
              toMillis(
                row.confirmedAt
              )
              ||
              toMillis(
                row.createdAt
              )
              ||
              0
          });
        }
      );

      if (
        seq !==
        participationLoadSeq
      ) {
        return;
      }

      // ===============================================
      // SORT
      // ===============================================

      visible.sort(
        (
          a,
          b
        ) => {
          const aStart =
            a._competitionStart ||
            0;

          const bStart =
            b._competitionStart ||
            0;

          if (
            aStart &&
            bStart &&
            aStart !==
              bStart
          ) {
            return (
              aStart -
              bStart
            );
          }

          if (
            aStart &&
            !bStart
          ) {
            return -1;
          }

          if (
            !aStart &&
            bStart
          ) {
            return 1;
          }

          return (
            b._registrationTime -
            a._registrationTime
          );
        }
      );

      Cache.setComps(
        visible
      );

      renderMyParticipation(
        visible
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
        '<div class="cabinet-small-muted" style="color:#ef4444;margin-top:8px;">Не вдалося оновити список участі.</div>'
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

            const participationKey =
              `${uid}||${teamId}`;

            /*
             * Зміна ПІБ / телефона /
             * аватара не перезапускає
             * "Мою участь".
             */
            if (
              teamChanged
              ||
              activeParticipationKey !==
                participationKey
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
        type ===
        "ok"
      ) {
        msgEl.classList.add(
          "ok"
        );
      }

      if (
        type ===
        "err"
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
