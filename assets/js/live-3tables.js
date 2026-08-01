// assets/js/live-3tables.js
// STOLAR CARP • Розрахунок формату "3 таблиці"
// Таблиця 1: загальна вага всіх риб
// Таблиця 2: 5 найбільших риб БЕЗ Big Fish
// Таблиця 3: Big Fish — одна найбільша риба
// Місця визначаються окремо в кожній зоні A / B / C

(function () {
  "use strict";

  function num(value) {
    const n = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function fishKg(fish) {
    if (typeof fish === "number" || typeof fish === "string") {
      return num(fish);
    }

    return num(fish?.kg ?? fish?.weight ?? fish?.value);
  }

  function normalizeFishArray(arr) {
    if (!Array.isArray(arr)) return [];

    return arr
      .map(fish => {
        const kg = fishKg(fish);
        return kg > 0 ? kg : null;
      })
      .filter(kg => kg !== null);
  }

  function getZone(row) {
    const drawKey = String(row?.drawKey || "").toUpperCase();

    return String(
      row?.zone ||
      row?.drawZone ||
      row?.zoneLabel?.[0] ||
      drawKey[0] ||
      ""
    ).toUpperCase();
  }

  function collectTeams(regRows, weighingDocs) {
    const teams = new Map();

    (regRows || []).forEach(row => {
      const teamId = String(row?.teamId || "").trim();
      if (!teamId) return;

      teams.set(teamId, {
        teamId,
        teamName: String(row?.teamName || row?.team || "Команда"),
        zone: getZone(row),
        zoneLabel: String(
          row?.zoneLabel ||
          row?.drawKey ||
          `${getZone(row)}${row?.sector || row?.drawSector || ""}`
        ),
        fish: []
      });
    });

    (weighingDocs || []).forEach(doc => {
      const teamId = String(doc?.teamId || "").trim();
      if (!teamId) return;

      if (!teams.has(teamId)) {
        teams.set(teamId, {
          teamId,
          teamName: String(doc?.teamName || doc?.team || "Команда"),
          zone: getZone(doc),
          zoneLabel: String(
            doc?.drawKey ||
            `${getZone(doc)}${doc?.sector || ""}`
          ),
          fish: []
        });
      }

      const team = teams.get(teamId);
      team.fish.push(...normalizeFishArray(doc?.weights || doc?.fish || []));
    });

    return Array.from(teams.values());
  }

  function calculateTeam(team) {
    const sortedFish = [...team.fish].sort((a, b) => b - a);

    // Найбільша риба виключається з таблиці "5 великих"
    const bigFish = sortedFish[0] || 0;
    const top5Fish = sortedFish.slice(1, 6);

    const totalWeight = sortedFish.reduce((sum, kg) => sum + kg, 0);
    const top5Weight = top5Fish.reduce((sum, kg) => sum + kg, 0);

    return {
      ...team,

      fishCount: sortedFish.length,
      allFish: sortedFish,

      totalWeight,

      bigFish,

      top5Fish,
      top5Count: top5Fish.length,
      top5Weight,

      totalPlace: 0,
      top5Place: 0,
      bigFishPlace: 0,

      totalPoints: 0,
      finalPlace: 0,

      // Використовується лише при повній рівності балів
      tieWeight: totalWeight + top5Weight + bigFish
    };
  }

  function assignPlaces(rows, valueKey, placeKey) {
    const sorted = [...rows].sort((a, b) => {
      const diff = num(b[valueKey]) - num(a[valueKey]);
      if (diff !== 0) return diff;

      // Стабільний порядок при однаковій вазі
      return String(a.teamName).localeCompare(String(b.teamName), "uk");
    });

    sorted.forEach((row, index) => {
      row[placeKey] = index + 1;
    });
  }

  function calculateZone(zoneRows) {
    assignPlaces(zoneRows, "totalWeight", "totalPlace");
    assignPlaces(zoneRows, "top5Weight", "top5Place");
    assignPlaces(zoneRows, "bigFish", "bigFishPlace");

    zoneRows.forEach(row => {
      row.totalPoints =
        row.totalPlace +
        row.top5Place +
        row.bigFishPlace;
    });

    zoneRows.sort((a, b) => {
      // 1. Менша сума балів — вище місце
      if (a.totalPoints !== b.totalPoints) {
        return a.totalPoints - b.totalPoints;
      }

      // 2. При рівних балах — сумарна вага трьох показників
      if (b.tieWeight !== a.tieWeight) {
        return b.tieWeight - a.tieWeight;
      }

      // 3. Остаточний стабільний порядок
      return String(a.teamName).localeCompare(String(b.teamName), "uk");
    });

    zoneRows.forEach((row, index) => {
      row.finalPlace = index + 1;
    });

    return zoneRows;
  }

  function buildThreeTables(regRows, weighingDocs) {
    const teams = collectTeams(regRows, weighingDocs).map(calculateTeam);

    const zones = {
      A: [],
      B: [],
      C: []
    };

    teams.forEach(team => {
      if (zones[team.zone]) {
        zones[team.zone].push(team);
      }
    });

    Object.keys(zones).forEach(zone => {
      zones[zone] = calculateZone(zones[zone]);
    });

    return zones;
  }

  window.SCThreeTables = {
    build: buildThreeTables,
    normalizeFishArray
  };
})();
