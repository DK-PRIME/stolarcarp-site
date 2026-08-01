// assets/js/live-3tables.js
// STOLAR CARP • Формат "3 таблиці"
//
// 1. Загальна вага — сума всіх риб команди
// 2. П'ять великих — 5 найбільших риб без Big Fish
// 3. Big Fish — одна найбільша риба
//
// Усі місця та бали визначаються окремо
// в зонах A / B / C.
//
// Цей модуль нічого не записує у Firebase.
// Він отримує команди + weighings і повертає готовий результат для Live.

(function () {
  "use strict";

  const VALID_ZONES = ["A", "B", "C"];

  function num(value) {
    const parsed = Number(
      String(value ?? "")
        .trim()
        .replace(",", ".")
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundWeight(value) {
    return Math.round((num(value) + Number.EPSILON) * 1000) / 1000;
  }

  function compareNumberDesc(a, b) {
    return num(b) - num(a);
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(
      String(b || ""),
      "uk",
      { sensitivity: "base" }
    );
  }

  function fishKg(fish) {
    if (typeof fish === "number" || typeof fish === "string") {
      return num(fish);
    }

    return num(
      fish?.kg ??
      fish?.weight ??
      fish?.value
    );
  }

  function normalizeFishItem(fish) {
    const kg = roundWeight(fishKg(fish));

    if (kg <= 0) return null;

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
      fishType: isAmur ? "amur" : "carp",
      isAmur
    };
  }

  function normalizeFishArray(arr) {
    if (!Array.isArray(arr)) return [];

    return arr
      .map(normalizeFishItem)
      .filter(Boolean);
  }

  function getZone(row) {
    const drawKey = String(row?.drawKey || "")
      .trim()
      .toUpperCase();

    const zoneLabel = String(row?.zoneLabel || "")
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

    return VALID_ZONES.includes(zone) ? zone : "";
  }

  function getSector(row) {
    const drawKey = String(row?.drawKey || "")
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

    if (existing) return existing;

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

  function collectTeams(regRows, weighingDocs) {
    const teams = new Map();

    /*
     * Спочатку створюємо повний список команд.
     * Навіть команда без жодної риби повинна бути в таблиці.
     */
    (regRows || []).forEach(row => {
      const teamId = getTeamId(row);
      if (!teamId) return;

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
     * Потім додаємо всі риби з усіх W1–W4.
     */
    (weighingDocs || []).forEach(doc => {
      const teamId = getTeamId(doc);
      if (!teamId) return;

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

      /*
       * Основне поле — weights.
       * fish залишено як fallback для сумісності.
       */
      const fish = normalizeFishArray(
        doc?.weights ||
        doc?.fish ||
        []
      );

      team.fish.push(...fish);

      /*
       * Якщо в реєстрації ще не було зони або назви,
       * беремо їх зі зважування.
       */
      if (!team.zone) {
        team.zone = getZone(doc);
      }

      if (
        !team.zoneLabel ||
        team.zoneLabel === "—"
      ) {
        team.zoneLabel = getZoneLabel(doc);
      }

      if (
        !team.teamName ||
        team.teamName === "Команда"
      ) {
        team.teamName = getTeamName(doc);
      }
    });

    return Array.from(teams.values());
  }

  function calculateTeam(team) {
    const sortedFish = [...team.fish]
      .sort((a, b) => compareNumberDesc(a.kg, b.kg));

    /*
     * Перша, найбільша риба — тільки Big Fish.
     * У таблицю "5 великих" вона не входить.
     */
    const bigFishItem = sortedFish[0] || null;
    const bigFish = bigFishItem
      ? roundWeight(bigFishItem.kg)
      : 0;

    /*
     * Наступні максимум 5 риб після Big Fish.
     */
    const top5FishItems = sortedFish.slice(1, 6);

    const top5Fish = top5FishItems.map(fish =>
      roundWeight(fish.kg)
    );

    const allFish = sortedFish.map(fish =>
      roundWeight(fish.kg)
    );

    const totalWeight = roundWeight(
      allFish.reduce(
        (sum, kg) => sum + kg,
        0
      )
    );

    const top5Weight = roundWeight(
      top5Fish.reduce(
        (sum, kg) => sum + kg,
        0
      )
    );

    const top5LargestFish = top5Fish[0] || 0;

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      zone: team.zone,
      sector: team.sector,
      zoneLabel: team.zoneLabel,

      fishCount: allFish.length,
      allFish,

      totalWeight,

      bigFish,
      bigFishType: bigFishItem?.fishType || "",

      top5Fish,
      top5Count: top5Fish.length,
      top5Weight,
      top5LargestFish,

      totalPlace: 0,
      totalPoints: 0,

      top5Place: 0,
      top5Points: 0,

      bigFishPlace: 0,
      bigFishPoints: 0,

      pointsSum: 0,
      finalPlace: 0,

      /*
       * Останній тайбрейк, погоджений для випадку,
       * коли сума балів команд однакова.
       *
       * Загальна вага вже включає всю рибу.
       * Додаткове додавання top5 і Big Fish тут
       * є свідомим коефіцієнтом тайбрейку.
       */
      tieWeight: roundWeight(
        totalWeight +
        top5Weight +
        bigFish
      )
    };
  }

  /*
   * ТАБЛИЦЯ 1 — ЗАГАЛЬНА ВАГА
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
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );
    if (diff !== 0) return diff;

    return compareText(a.teamName, b.teamName);
  }

  /*
   * ТАБЛИЦЯ 2 — П'ЯТЬ ВЕЛИКИХ
   *
   * 1. Більша сума п'яти великих.
   * 2. Більша кількість закритих риб.
   * 3. Більша риба серед цієї п'ятірки.
   * 4. Більший Big Fish команди.
   */
  function compareTop5Table(a, b) {
    let diff = compareNumberDesc(
      a.top5Weight,
      b.top5Weight
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.top5Count,
      b.top5Count
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.top5LargestFish,
      b.top5LargestFish
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );
    if (diff !== 0) return diff;

    return compareText(a.teamName, b.teamName);
  }

  /*
   * ТАБЛИЦЯ 3 — BIG FISH
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
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );
    if (diff !== 0) return diff;

    return compareText(a.teamName, b.teamName);
  }

  function assignUniquePlaces(
    rows,
    comparator,
    placeKey,
    pointsKey
  ) {
    const sorted = [...rows].sort(comparator);

    sorted.forEach((row, index) => {
      const place = index + 1;

      row[placeKey] = place;
      row[pointsKey] = place;
    });

    return sorted;
  }

  function compareFinalTable(a, b) {
    /*
     * 1. Менша сума місць/балів.
     */
    if (a.pointsSum !== b.pointsSum) {
      return a.pointsSum - b.pointsSum;
    }

    /*
     * 2. При однакових балах — погоджена
     * сумарна вага трьох показників.
     */
    let diff = compareNumberDesc(
      a.tieWeight,
      b.tieWeight
    );
    if (diff !== 0) return diff;

    /*
     * 3. Додаткові технічні тайбрейки.
     * Вони потрібні, щоб місця завжди були унікальні.
     */
    diff = compareNumberDesc(
      a.totalWeight,
      b.totalWeight
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.top5Weight,
      b.top5Weight
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.bigFish,
      b.bigFish
    );
    if (diff !== 0) return diff;

    diff = compareNumberDesc(
      a.fishCount,
      b.fishCount
    );
    if (diff !== 0) return diff;

    return compareText(a.teamName, b.teamName);
  }

  function calculateZone(zone, zoneRows) {
    const rows = zoneRows.map(row => ({
      ...row
    }));

    const totalTable = assignUniquePlaces(
      rows,
      compareTotalTable,
      "totalPlace",
      "totalPoints"
    );

    const top5Table = assignUniquePlaces(
      rows,
      compareTop5Table,
      "top5Place",
      "top5Points"
    );

    const bigFishTable = assignUniquePlaces(
      rows,
      compareBigFishTable,
      "bigFishPlace",
      "bigFishPoints"
    );

    rows.forEach(row => {
      row.pointsSum =
        num(row.totalPoints) +
        num(row.top5Points) +
        num(row.bigFishPoints);
    });

    const finalTable = [...rows]
      .sort(compareFinalTable)
      .map((row, index) => {
        row.finalPlace = index + 1;
        return row;
      });

    return {
      zone,
      teamsCount: rows.length,

      /*
       * Готові окремі таблиці.
       */
      totalTable,
      top5Table,
      bigFishTable,

      /*
       * Готовий фінальний підсумок.
       */
      finalTable
    };
  }

  function buildThreeTables(regRows, weighingDocs) {
    const calculatedTeams = collectTeams(
      regRows,
      weighingDocs
    ).map(calculateTeam);

    const zoneRows = {
      A: [],
      B: [],
      C: []
    };

    calculatedTeams.forEach(team => {
      if (!VALID_ZONES.includes(team.zone)) {
        return;
      }

      zoneRows[team.zone].push(team);
    });

    const zones = {
      A: calculateZone("A", zoneRows.A),
      B: calculateZone("B", zoneRows.B),
      C: calculateZone("C", zoneRows.C)
    };

    return {
      format: "3tables",
      generatedAt: new Date(),

      teamsCount:
        zones.A.teamsCount +
        zones.B.teamsCount +
        zones.C.teamsCount,

      zones,

      /*
       * Зручний спільний список усіх команд.
       * Він не визначає переможців між зонами.
       */
      teams: [
        ...zones.A.finalTable,
        ...zones.B.finalTable,
        ...zones.C.finalTable
      ]
    };
  }

  window.SCThreeTables = {
    build: buildThreeTables,
    normalizeFishArray
  };
})();
