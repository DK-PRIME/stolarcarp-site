// assets/js/live-3tables.js
// STOLAR CARP • Формат "3 таблиці"
//
// ТАБЛИЦЯ 1 — ЗАГАЛЬНА ВАГА
// - більша загальна вага = краще місце;
// - команда без риби отримує ОСТАННЄ місце зони.
//
// ТАБЛИЦЯ 2 — 5 ВЕЛИКИХ
// - Big Fish НЕ входить у п'ятірку;
// - після Big Fish беруться наступні 5 найбільших риб;
// - результат у цій таблиці зараховується ТІЛЬКИ,
//   якщо команда закрила всі 5 риб;
// - незакрита п'ятірка отримує ОСТАННЄ місце зони.
//
// ТАБЛИЦЯ 3 — BIG FISH
// - більша найбільша риба = краще місце;
// - команда без риби отримує ОСТАННЄ місце зони.
//
// Приклад:
// якщо в зоні 7 команд:
// - немає загальної ваги -> 7 балів;
// - не закрито 5 великих -> 7 балів;
// - немає Big Fish -> 7 балів.
//
// Фінальний результат:
// totalPlace + top5Place + bigFishPlace.
// Менша сума = краще підсумкове місце.
//
// Усі розрахунки виконуються ОКРЕМО
// для зон A / B / C.
//
// Модуль нічого не записує у Firebase.
// Отримує regRows + weighingDocs
// і повертає готовий результат для Live.

(function () {
  "use strict";

  const VALID_ZONES = ["A", "B", "C"];

  /*
   * ============================================================
   * BASIC HELPERS
   * ============================================================
   */

  function num(value) {
    const parsed = Number(
      String(value ?? "")
        .trim()
        .replace(",", ".")
    );

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  function roundWeight(value) {
    return (
      Math.round(
        (num(value) + Number.EPSILON) * 1000
      ) / 1000
    );
  }

  function compareNumberDesc(a, b) {
    return num(b) - num(a);
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(
      String(b || ""),
      "uk",
      {
        sensitivity: "base"
      }
    );
  }

  /*
   * ============================================================
   * FISH
   * ============================================================
   */

  function fishKg(fish) {
    if (
      typeof fish === "number" ||
      typeof fish === "string"
    ) {
      return num(fish);
    }

    return num(
      fish?.kg ??
      fish?.weight ??
      fish?.value
    );
  }

  function normalizeFishItem(fish) {
    const kg = roundWeight(
      fishKg(fish)
    );

    if (kg <= 0) {
      return null;
    }

    const isAmur =
      fish &&
      typeof fish === "object" &&
      (
        fish.isAmur === true ||
        fish.fishType === "amur" ||
        fish.type === "amur"
      );

    return {
      kg,
      fishType: isAmur
        ? "amur"
        : "carp",
      isAmur
    };
  }

  function normalizeFishArray(arr) {
    if (!Array.isArray(arr)) {
      return [];
    }

    return arr
      .map(normalizeFishItem)
      .filter(Boolean);
  }

  /*
   * ============================================================
   * TEAM / ZONE HELPERS
   * ============================================================
   */

  function getZone(row) {
    const drawKey = String(
      row?.drawKey || ""
    )
      .trim()
      .toUpperCase();

    const zoneLabel = String(
      row?.zoneLabel || ""
    )
      .trim()
      .toUpperCase();

    const zone = String(
      row?.zone ||
      row?.drawZone ||
      zoneLabel[0] ||
      drawKey[0] ||
      ""
    )
      .trim()
      .toUpperCase();

    return VALID_ZONES.includes(zone)
      ? zone
      : "";
  }

  function getSector(row) {
    const drawKey = String(
      row?.drawKey || ""
    )
      .trim()
      .toUpperCase();

    const fromDrawKey = drawKey
      ? drawKey.slice(1)
      : "";

    return String(
      row?.sector ??
      row?.drawSector ??
      fromDrawKey ??
      ""
    ).trim();
  }

  function getZoneLabel(row) {
    const existing = String(
      row?.zoneLabel ||
      row?.drawKey ||
      ""
    )
      .trim()
      .toUpperCase();

    if (existing) {
      return existing;
    }

    const zone = getZone(row);
    const sector = getSector(row);

    return zone
      ? `${zone}${sector}`
      : sector || "—";
  }

  function getTeamId(row) {
    return String(
      row?.teamId ||
      row?.uid ||
      row?.id ||
      ""
    ).trim();
  }

  function getTeamName(row) {
    return String(
      row?.teamName ||
      row?.team ||
      row?.name ||
      "Команда"
    ).trim();
  }

  /*
   * ============================================================
   * COLLECT TEAMS + WEIGHINGS
   * ============================================================
   */

  function collectTeams(
    regRows,
    weighingDocs
  ) {
    const teams = new Map();

    /*
     * Спочатку беремо всі команди із жеребкування.
     *
     * Команда залишається у Live навіть тоді,
     * коли ще не має жодної риби.
     */
    (regRows || []).forEach((row) => {
      const teamId = getTeamId(row);

      if (!teamId) {
        return;
      }

      teams.set(teamId, {
        teamId,
        teamName: getTeamName(row),

        zone: getZone(row),
        sector: getSector(row),
        zoneLabel: getZoneLabel(row),

        fish: []
      });
    });

    /*
     * Додаємо всі submitted-зважування W1–W4.
     */
    (weighingDocs || []).forEach((doc) => {
      const teamId = getTeamId(doc);

      if (!teamId) {
        return;
      }

      if (!teams.has(teamId)) {
        teams.set(teamId, {
          teamId,
          teamName: getTeamName(doc),

          zone: getZone(doc),
          sector: getSector(doc),
          zoneLabel: getZoneLabel(doc),

          fish: []
        });
      }

      const team = teams.get(teamId);

      const fish = normalizeFishArray(
        doc?.weights ||
        doc?.fish ||
        []
      );

      team.fish.push(...fish);

      /*
       * Fallback на дані weighing,
       * якщо їх не було в registration/stageResults.
       */
      if (!team.zone) {
        team.zone = getZone(doc);
      }

      if (
        !team.zoneLabel ||
        team.zoneLabel === "—"
      ) {
        team.zoneLabel =
          getZoneLabel(doc);
      }

      if (
        !team.teamName ||
        team.teamName === "Команда"
      ) {
        team.teamName =
          getTeamName(doc);
      }
    });

    return Array.from(
      teams.values()
    );
  }

  /*
   * ============================================================
   * CALCULATE ONE TEAM
   * ============================================================
   */

  function calculateTeam(team) {
    /*
     * Усі риби від найбільшої до найменшої.
     */
    const sortedFish = [...team.fish]
      .sort((a, b) =>
        compareNumberDesc(
          a.kg,
          b.kg
        )
      );

    /*
     * BIG FISH
     *
     * Найбільша риба команди.
     * Вона НЕ входить у 5 великих.
     */
    const bigFishItem =
      sortedFish[0] || null;

    const bigFish = bigFishItem
      ? roundWeight(bigFishItem.kg)
      : 0;

    /*
     * 5 ВЕЛИКИХ
     *
     * Після вилучення Big Fish
     * беремо максимум наступні 5 риб.
     */
    const top5FishItems =
      sortedFish.slice(1, 6);

    const top5Fish =
      top5FishItems.map((fish) =>
        roundWeight(fish.kg)
      );

    /*
     * Усі риби.
     */
    const allFish =
      sortedFish.map((fish) =>
        roundWeight(fish.kg)
      );

    /*
     * Загальна вага.
     */
    const totalWeight =
      roundWeight(
        allFish.reduce(
          (sum, kg) => sum + kg,
          0
        )
      );

    /*
     * Сума 5 великих
     * БЕЗ Big Fish.
     */
    const top5Weight =
      roundWeight(
        top5Fish.reduce(
          (sum, kg) => sum + kg,
          0
        )
      );

    const top5LargestFish =
      top5Fish[0] || 0;

    const fishCount =
      allFish.length;

    const top5Count =
      top5Fish.length;

    /*
     * ЧИ Є РЕЗУЛЬТАТ У КОЖНІЙ ТАБЛИЦІ
     */

    const hasTotalResult =
      totalWeight > 0 &&
      fishCount > 0;

    /*
     * П'ять великих вважаються ЗАКРИТИМИ
     * тільки коли є всі п'ять риб
     * після вилучення Big Fish.
     *
     * Тобто фактично команді потрібно
     * мінімум 6 залікових риб:
     * 1 Big Fish + 5 великих.
     */
    const hasTop5Result =
      top5Count === 5 &&
      top5Weight > 0;

    const hasBigFishResult =
      bigFish > 0;

    return {
      teamId: team.teamId,
      teamName: team.teamName,

      zone: team.zone,
      sector: team.sector,
      zoneLabel: team.zoneLabel,

      /*
       * Риби.
       */
      fishCount,
      allFish,

      /*
       * Загальна вага.
       */
      totalWeight,
      hasTotalResult,

      /*
       * Big Fish.
       */
      bigFish,
      bigFishType:
        bigFishItem?.fishType || "",
      hasBigFishResult,

      /*
       * 5 великих.
       */
      top5Fish,
      top5Count,
      top5Weight,
      top5LargestFish,
      hasTop5Result,

      /*
       * Місця / бали.
       */
      totalPlace: 0,
      totalPoints: 0,

      top5Place: 0,
      top5Points: 0,

      bigFishPlace: 0,
      bigFishPoints: 0,

      pointsSum: 0,
      finalPlace: 0,

      /*
       * Тайбрейк фінального результату.
       */
      tieWeight: roundWeight(
        totalWeight +
        top5Weight +
        bigFish
      )
    };
  }

  /*
   * ============================================================
   * TABLE 1 — TOTAL WEIGHT
   * ============================================================
   *
   * Тільки команди з реальною вагою
   * беруть участь у нормальному ранжуванні.
   *
   * 1. Більша загальна вага.
   * 2. Більша кількість риб.
   * 3. Більший Big Fish.
   */

  function compareTotalTable(a, b) {
    let diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );

    if (diff !== 0) {
      return diff;
    }

    return compareText(
      a.teamName,
      b.teamName
    );
  }

  /*
   * ============================================================
   * TABLE 2 — TOP 5
   * ============================================================
   *
   * Сюди потрапляє ТІЛЬКИ
   * повністю закрита п'ятірка.
   *
   * 1. Більша сума 5 риб.
   * 2. Більша риба серед цієї п'ятірки.
   * 3. Більший Big Fish.
   * 4. Більша загальна вага.
   */

  function compareTop5Table(a, b) {
    let diff = compareNumberDesc(
      a.top5Weight,
      b.top5Weight
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.top5LargestFish,
      b.top5LargestFish
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );

    if (diff !== 0) {
      return diff;
    }

    return compareText(
      a.teamName,
      b.teamName
    );
  }

  /*
   * ============================================================
   * TABLE 3 — BIG FISH
   * ============================================================
   *
   * 1. Більший Big Fish.
   * 2. Більша загальна вага.
   * 3. Більша кількість риб.
   */

  function compareBigFishTable(a, b) {
    let diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );

    if (diff !== 0) {
      return diff;
    }

    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );

    if (diff !== 0) {
      return diff;
    }

    return compareText(
      a.teamName,
      b.teamName
    );
  }

  /*
   * ============================================================
   * ASSIGN PLACES WITH LAST-PLACE PENALTY
   * ============================================================
   *
   * ОСНОВНА ЗМІНА.
   *
   * qualified:
   * команди, які мають валідний результат.
   *
   * unqualified:
   * команди без результату / з незакритою таблицею.
   *
   * qualified:
   * 1, 2, 3, ...
   *
   * unqualified:
   * ВСІ отримують teamsCount.
   *
   * При 7 командах:
   * 1,2,3,4,5,7,7
   *
   * а НЕ:
   * 1,2,3,4,5,6,7
   */

  function assignPlacesWithLastPenalty({
    rows,
    comparator,
    qualifies,
    placeKey,
    pointsKey,
    lastPlace
  }) {
    const qualified = rows
      .filter(qualifies)
      .sort(comparator);

    const unqualified = rows
      .filter((row) => !qualifies(row))
      .sort((a, b) => {
        return compareText(
          a.teamName,
          b.teamName
        );
      });

    /*
     * Тільки валідні результати:
     * 1, 2, 3...
     */
    qualified.forEach(
      (row, index) => {
        const place = index + 1;

        row[placeKey] = place;
        row[pointsKey] = place;
      }
    );

    /*
     * Усі без результату:
     * останнє місце зони.
     */
    unqualified.forEach((row) => {
      row[placeKey] = lastPlace;
      row[pointsKey] = lastPlace;
    });

    return [
      ...qualified,
      ...unqualified
    ];
  }

  /*
   * ============================================================
   * FINAL TABLE
   * ============================================================
   */

  function compareFinalTable(a, b) {
    /*
     * 1.
     * Менша сума трьох місць.
     */
    if (a.pointsSum !== b.pointsSum) {
      return (
        a.pointsSum -
        b.pointsSum
      );
    }

    /*
     * 2.
     * При рівних балах —
     * більша сукупна вага
     * трьох показників.
     */
    let diff = compareNumberDesc(
      a.tieWeight,
      b.tieWeight
    );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 3.
     * Більша загальна вага.
     */
    diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 4.
     * Більша сума 5 великих.
     */
    diff = compareNumberDesc(
      a.top5Weight,
      b.top5Weight
    );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 5.
     * Більший Big Fish.
     */
    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 6.
     * Більше риб.
     */
    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );

    if (diff !== 0) {
      return diff;
    }

    /*
     * Технічний стабільний тайбрейк.
     */
    return compareText(
      a.teamName,
      b.teamName
    );
  }

  /*
   * ============================================================
   * CALCULATE ONE ZONE
   * ============================================================
   */

  function calculateZone(
    zone,
    zoneRows
  ) {
    /*
     * Робимо окремі row objects,
     * щоб не мутувати зовнішній масив.
     */
    const rows = zoneRows.map(
      (row) => ({
        ...row
      })
    );

    const teamsCount =
      rows.length;

    /*
     * Якщо в зоні 7 команд —
     * lastPlace = 7.
     */
    const lastPlace =
      Math.max(teamsCount, 1);

    /*
     * ----------------------------------------------------------
     * ТАБЛИЦЯ 1
     * ЗАГАЛЬНА ВАГА
     * ----------------------------------------------------------
     */

    const totalTable =
      assignPlacesWithLastPenalty({
        rows,

        comparator:
          compareTotalTable,

        qualifies: (row) =>
          row.hasTotalResult === true,

        placeKey:
          "totalPlace",

        pointsKey:
          "totalPoints",

        lastPlace
      });

    /*
     * ----------------------------------------------------------
     * ТАБЛИЦЯ 2
     * 5 ВЕЛИКИХ
     * ----------------------------------------------------------
     *
     * НЕЗАКРИТА П'ЯТІРКА
     * не отримує 2,3,4,5...
     *
     * Вона одразу отримує
     * останнє місце зони.
     */

    const top5Table =
      assignPlacesWithLastPenalty({
        rows,

        comparator:
          compareTop5Table,

        qualifies: (row) =>
          row.hasTop5Result === true,

        placeKey:
          "top5Place",

        pointsKey:
          "top5Points",

        lastPlace
      });

    /*
     * ----------------------------------------------------------
     * ТАБЛИЦЯ 3
     * BIG FISH
     * ----------------------------------------------------------
     */

    const bigFishTable =
      assignPlacesWithLastPenalty({
        rows,

        comparator:
          compareBigFishTable,

        qualifies: (row) =>
          row.hasBigFishResult === true,

        placeKey:
          "bigFishPlace",

        pointsKey:
          "bigFishPoints",

        lastPlace
      });

    /*
     * ----------------------------------------------------------
     * СУМА БАЛІВ
     * ----------------------------------------------------------
     */

    rows.forEach((row) => {
      row.pointsSum =
        num(row.totalPoints) +
        num(row.top5Points) +
        num(row.bigFishPoints);
    });

    /*
     * ----------------------------------------------------------
     * ПІДСУМКОВА ТАБЛИЦЯ
     * ----------------------------------------------------------
     */

    const finalTable = [...rows]
      .sort(compareFinalTable)
      .map((row, index) => {
        row.finalPlace =
          index + 1;

        return row;
      });

    return {
      zone,
      teamsCount,
      lastPlace,

      totalTable,
      top5Table,
      bigFishTable,

      finalTable
    };
  }

  /*
   * ============================================================
   * BUILD ALL THREE ZONES
   * ============================================================
   */

  function buildThreeTables(
    regRows,
    weighingDocs
  ) {
    const calculatedTeams =
      collectTeams(
        regRows,
        weighingDocs
      ).map(calculateTeam);

    const zoneRows = {
      A: [],
      B: [],
      C: []
    };

    calculatedTeams.forEach(
      (team) => {
        if (
          !VALID_ZONES.includes(
            team.zone
          )
        ) {
          return;
        }

        zoneRows[
          team.zone
        ].push(team);
      }
    );

    const zones = {
      A: calculateZone(
        "A",
        zoneRows.A
      ),

      B: calculateZone(
        "B",
        zoneRows.B
      ),

      C: calculateZone(
        "C",
        zoneRows.C
      )
    };

    return {
      format: "3tables",

      generatedAt:
        new Date(),

      teamsCount:
        zones.A.teamsCount +
        zones.B.teamsCount +
        zones.C.teamsCount,

      zones,

      /*
       * Спільний список для зручності.
       * Місця тут НЕ порівнюються
       * між різними зонами.
       */
      teams: [
        ...zones.A.finalTable,
        ...zones.B.finalTable,
        ...zones.C.finalTable
      ]
    };
  }

  /*
   * ============================================================
   * PUBLIC API
   * ============================================================
   */

  window.SCThreeTables = {
    build:
      buildThreeTables,

    normalizeFishArray
  };
})();
