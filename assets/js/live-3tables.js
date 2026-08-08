// assets/js/live-3tables.js
// STOLAR CARP • Формат "3 таблиці"
//
// ТАБЛИЦЯ 1 — ЗАГАЛЬНА ВАГА
// - більша загальна вага = краще місце;
// - якщо вага однакова — команди ділять місця;
//   приклад: 5 і 6 місце -> по 5.5 бала;
// - команда без риби йде в самий кінець.
//
// ТАБЛИЦЯ 2 — 5 ВЕЛИКИХ
// - Big Fish НЕ входить у п'ятірку;
// - після Big Fish беруться максимум наступні 5 найбільших риб;
// - НЕ ПОТРІБНО чекати, поки команда закриє всі 5 риб;
// - якщо є хоча б одна риба в цій таблиці,
//   її поточна вага вже бере участь у рейтингу;
// - більша поточна вага = краще місце;
// - однакова вага = спільне середнє місце;
// - немає жодної риби в "5 великих" = останні місця.
//
// ТАБЛИЦЯ 3 — BIG FISH
// - більший Big Fish = краще місце;
// - однаковий Big Fish = спільне середнє місце;
// - немає Big Fish = останні місця.
//
// ФІНАЛ:
// totalPoints + top5Points + bigFishPoints
// Менша сума = краще місце.
//
// Усі розрахунки виконуються ОКРЕМО
// для зон A / B / C.
//
// Модуль нічого не записує у Firebase.

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

  function roundPoints(value) {
    return (
      Math.round(
        (num(value) + Number.EPSILON) * 100
      ) / 100
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

      fishType:
        isAmur
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

    const zone =
      getZone(row);

    const sector =
      getSector(row);

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
   * COLLECT TEAMS
   * ============================================================
   */

  function collectTeams(
    regRows,
    weighingDocs
  ) {
    const teams = new Map();

    /*
     * Спочатку створюємо всі команди.
     */
    (regRows || []).forEach((row) => {
      const teamId =
        getTeamId(row);

      if (!teamId) {
        return;
      }

      teams.set(teamId, {
        teamId,

        teamName:
          getTeamName(row),

        zone:
          getZone(row),

        sector:
          getSector(row),

        zoneLabel:
          getZoneLabel(row),

        fish: []
      });
    });

    /*
     * Додаємо всі риби з submitted weighing.
     */
    (weighingDocs || []).forEach(
      (doc) => {
        const teamId =
          getTeamId(doc);

        if (!teamId) {
          return;
        }

        if (!teams.has(teamId)) {
          teams.set(teamId, {
            teamId,

            teamName:
              getTeamName(doc),

            zone:
              getZone(doc),

            sector:
              getSector(doc),

            zoneLabel:
              getZoneLabel(doc),

            fish: []
          });
        }

        const team =
          teams.get(teamId);

        const fish =
          normalizeFishArray(
            doc?.weights ||
            doc?.fish ||
            []
          );

        team.fish.push(...fish);

        if (!team.zone) {
          team.zone =
            getZone(doc);
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
      }
    );

    return Array.from(
      teams.values()
    );
  }

  /*
   * ============================================================
   * CALCULATE TEAM
   * ============================================================
   */

  function calculateTeam(team) {
    /*
     * Від найбільшої риби
     * до найменшої.
     */
    const sortedFish =
      [...team.fish].sort(
        (a, b) =>
          compareNumberDesc(
            a.kg,
            b.kg
          )
      );

    /*
     * BIG FISH
     *
     * Найбільша риба команди.
     */
    const bigFishItem =
      sortedFish[0] || null;

    const bigFish =
      bigFishItem
        ? roundWeight(
            bigFishItem.kg
          )
        : 0;

    /*
     * 5 ВЕЛИКИХ
     *
     * Big Fish забираємо.
     * Беремо наступні максимум 5 риб.
     *
     * ВАЖЛИВО:
     * навіть якщо є тільки 1, 2, 3 або 4,
     * їх поточна вага бере участь у рейтингу.
     */
    const top5FishItems =
      sortedFish.slice(1, 6);

    const top5Fish =
      top5FishItems.map(
        (fish) =>
          roundWeight(fish.kg)
      );

    /*
     * Всі риби.
     */
    const allFish =
      sortedFish.map(
        (fish) =>
          roundWeight(fish.kg)
      );

    const fishCount =
      allFish.length;

    const top5Count =
      top5Fish.length;

    /*
     * Загальна вага.
     */
    const totalWeight =
      roundWeight(
        allFish.reduce(
          (sum, kg) =>
            sum + kg,
          0
        )
      );

    /*
     * Поточна вага 5 великих.
     */
    const top5Weight =
      roundWeight(
        top5Fish.reduce(
          (sum, kg) =>
            sum + kg,
          0
        )
      );

    const top5LargestFish =
      top5Fish[0] || 0;

    /*
     * Результат існує,
     * якщо є реальна вага.
     */
    const hasTotalResult =
      totalWeight > 0;

    const hasTop5Result =
      top5Weight > 0;

    const hasBigFishResult =
      bigFish > 0;

    return {
      teamId:
        team.teamId,

      teamName:
        team.teamName,

      zone:
        team.zone,

      sector:
        team.sector,

      zoneLabel:
        team.zoneLabel,

      fishCount,
      allFish,

      totalWeight,
      hasTotalResult,

      bigFish,

      bigFishType:
        bigFishItem?.fishType || "",

      hasBigFishResult,

      top5Fish,
      top5Count,
      top5Weight,
      top5LargestFish,
      hasTop5Result,

      totalPlace: 0,
      totalPoints: 0,

      top5Place: 0,
      top5Points: 0,

      bigFishPlace: 0,
      bigFishPoints: 0,

      pointsSum: 0,
      finalPlace: 0,

      /*
       * Використовується тільки
       * для фінального тайбрейку.
       */
      tieWeight:
        roundWeight(
          totalWeight +
          top5Weight +
          bigFish
        )
    };
  }

  /*
   * ============================================================
   * COMPARATORS
   * ============================================================
   */

  /*
   * ЗАГАЛЬНА ВАГА
   *
   * Основний критерій — ВАГА.
   */
  function compareTotalTable(a, b) {
    let diff =
      compareNumberDesc(
        a.totalWeight,
        b.totalWeight
      );

    if (diff !== 0) {
      return diff;
    }

    /*
     * Далі — тільки стабільне
     * сортування для відображення.
     *
     * На бали це НЕ впливає,
     * бо однакова вага буде
     * вважатись нічиєю.
     */
    diff =
      compareNumberDesc(
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
   * 5 ВЕЛИКИХ
   *
   * Основний критерій —
   * поточна сума риб у цій таблиці.
   */
  function compareTop5Table(a, b) {
    let diff =
      compareNumberDesc(
        a.top5Weight,
        b.top5Weight
      );

    if (diff !== 0) {
      return diff;
    }

    diff =
      compareNumberDesc(
        a.top5LargestFish,
        b.top5LargestFish
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
   * BIG FISH
   *
   * Основний критерій —
   * вага найбільшої риби.
   */
  function compareBigFishTable(a, b) {
    let diff =
      compareNumberDesc(
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
   * SHARED PLACES
   * ============================================================
   *
   * Якщо однаковий результат займає
   * декілька позицій — команди ділять
   * середнє арифметичне цих місць.
   *
   * Приклад:
   *
   * 1 місце
   * 2 місце
   * 3 місце
   * 4 місце
   *
   * дві однакові команди займають
   * позиції 5 і 6:
   *
   * (5 + 6) / 2 = 5.5
   *
   * обидві отримують 5.5 бала.
   */

  function assignSharedPlaces({
    rows,
    comparator,
    qualifies,
    valueGetter,
    placeKey,
    pointsKey
  }) {
    const qualified =
      rows
        .filter(qualifies)
        .sort(comparator);

    const unqualified =
      rows
        .filter(
          (row) =>
            !qualifies(row)
        )
        .sort(
          (a, b) =>
            compareText(
              a.teamName,
              b.teamName
            )
        );

    /*
     * ----------------------------------------------------------
     * ВАЛІДНІ РЕЗУЛЬТАТИ
     * ----------------------------------------------------------
     */

    let index = 0;

    while (
      index < qualified.length
    ) {
      const currentValue =
        roundWeight(
          valueGetter(
            qualified[index]
          )
        );

      let endIndex =
        index;

      /*
       * Шукаємо всі команди
       * з абсолютно однаковою вагою.
       */
      while (
        endIndex + 1 <
          qualified.length &&
        roundWeight(
          valueGetter(
            qualified[
              endIndex + 1
            ]
          )
        ) === currentValue
      ) {
        endIndex++;
      }

      /*
       * Реальні позиції:
       *
       * index 0 -> місце 1
       * index 1 -> місце 2
       */
      const firstPlace =
        index + 1;

      const lastPlace =
        endIndex + 1;

      /*
       * Середнє місце.
       */
      const sharedPlace =
        roundPoints(
          (
            firstPlace +
            lastPlace
          ) / 2
        );

      for (
        let i = index;
        i <= endIndex;
        i++
      ) {
        qualified[i][placeKey] =
          sharedPlace;

        qualified[i][pointsKey] =
          sharedPlace;
      }

      index =
        endIndex + 1;
    }

    /*
     * ----------------------------------------------------------
     * БЕЗ РЕЗУЛЬТАТУ
     * ----------------------------------------------------------
     *
     * Вони займають усі місця,
     * які залишилися внизу таблиці,
     * і також ділять їх між собою.
     *
     * Наприклад:
     *
     * 6 команд.
     * 4 мають результат.
     * 2 без результату.
     *
     * Вони займають 5 і 6 місця:
     * (5 + 6) / 2 = 5.5.
     */

    if (unqualified.length) {
      const firstEmptyPlace =
        qualified.length + 1;

      const lastEmptyPlace =
        rows.length;

      const sharedEmptyPlace =
        roundPoints(
          (
            firstEmptyPlace +
            lastEmptyPlace
          ) / 2
        );

      unqualified.forEach(
        (row) => {
          row[placeKey] =
            sharedEmptyPlace;

          row[pointsKey] =
            sharedEmptyPlace;
        }
      );
    }

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
     * Менша сума балів.
     */
    if (
      a.pointsSum !==
      b.pointsSum
    ) {
      return (
        a.pointsSum -
        b.pointsSum
      );
    }

    /*
     * 2.
     * При рівній сумі балів —
     * більша загальна вага.
     */
    let diff =
      compareNumberDesc(
        a.totalWeight,
        b.totalWeight
      );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 3.
     * Більша вага 5 великих.
     */
    diff =
      compareNumberDesc(
        a.top5Weight,
        b.top5Weight
      );

    if (diff !== 0) {
      return diff;
    }

    /*
     * 4.
     * Більший Big Fish.
     */
    diff =
      compareNumberDesc(
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
   * CALCULATE ZONE
   * ============================================================
   */

  function calculateZone(
    zone,
    zoneRows
  ) {
    const rows =
      zoneRows.map(
        (row) => ({
          ...row
        })
      );

    const teamsCount =
      rows.length;

    /*
     * ----------------------------------------------------------
     * TABLE 1 — TOTAL
     * ----------------------------------------------------------
     */

    const totalTable =
      assignSharedPlaces({
        rows,

        comparator:
          compareTotalTable,

        qualifies: (row) =>
          row.hasTotalResult === true,

        valueGetter: (row) =>
          row.totalWeight,

        placeKey:
          "totalPlace",

        pointsKey:
          "totalPoints"
      });

    /*
     * ----------------------------------------------------------
     * TABLE 2 — TOP 5
     * ----------------------------------------------------------
     *
     * ВАЖЛИВО:
     *
     * тепер НЕ треба top5Count === 5.
     *
     * Якщо є хоча б якась вага
     * після вилучення Big Fish —
     * команда вже ранжується.
     */

    const top5Table =
      assignSharedPlaces({
        rows,

        comparator:
          compareTop5Table,

        qualifies: (row) =>
          row.hasTop5Result === true,

        valueGetter: (row) =>
          row.top5Weight,

        placeKey:
          "top5Place",

        pointsKey:
          "top5Points"
      });

    /*
     * ----------------------------------------------------------
     * TABLE 3 — BIG FISH
     * ----------------------------------------------------------
     */

    const bigFishTable =
      assignSharedPlaces({
        rows,

        comparator:
          compareBigFishTable,

        qualifies: (row) =>
          row.hasBigFishResult === true,

        valueGetter: (row) =>
          row.bigFish,

        placeKey:
          "bigFishPlace",

        pointsKey:
          "bigFishPoints"
      });

    /*
     * ----------------------------------------------------------
     * POINTS SUM
     * ----------------------------------------------------------
     */

    rows.forEach(
      (row) => {
        row.pointsSum =
          roundPoints(
            num(
              row.totalPoints
            ) +
            num(
              row.top5Points
            ) +
            num(
              row.bigFishPoints
            )
          );
      }
    );

    /*
     * ----------------------------------------------------------
     * FINAL
     * ----------------------------------------------------------
     */

    const finalTable =
      [...rows]
        .sort(
          compareFinalTable
        )
        .map(
          (row, index) => {
            row.finalPlace =
              index + 1;

            return row;
          }
        );

    return {
      zone,
      teamsCount,

      totalTable,
      top5Table,
      bigFishTable,

      finalTable
    };
  }

  /*
   * ============================================================
   * BUILD
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
      ).map(
        calculateTeam
      );

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
      format:
        "3tables",

      generatedAt:
        new Date(),

      teamsCount:
        zones.A.teamsCount +
        zones.B.teamsCount +
        zones.C.teamsCount,

      zones,

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
