// assets/js/live_solo.js
// STOLAR CARP — SOLO adapter for LIVE
// Firebase compat 10.12.2
//
// ✅ Тільки SOLO
// ✅ public_participants
// ✅ Прізвище Ім'я
// ✅ sector A7 -> zone A
// ✅ confirmed / paid / payment_confirmed
// ✅ stage-1 == 1
// ✅ нічого не записує у Firestore
// ✅ не ламає TEAM live
//
// Використання:
// const rows = await window.scSoloLive.load({
//   competitionId,
//   stageId
// });

(function () {
  "use strict";

  console.log(
    "✅ live_solo.js LOADED v20260916-1"
  );

  // =========================================================
  // HELPERS
  // =========================================================

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

  function cleanNamePart(v) {
    return norm(v)
      .slice(
        0,
        40
      );
  }

  function canonicalName(data) {
    const d =
      data || {};

    const firstName =
      cleanNamePart(
        d.firstName
      );

    const lastName =
      cleanNamePart(
        d.lastName
      );

    if (
      firstName &&
      lastName
    ) {
      return (
        `${lastName} ${firstName}`
      );
    }

    /*
     * Legacy fallback.
     *
     * Два слова НЕ переставляємо.
     */
    return (
      norm(
        d.participantName
      )
      ||
      norm(
        d.displayName
      )
      ||
      norm(
        d.fullName
      )
      ||
      norm(
        d.name
      )
      ||
      "Учасник"
    );
  }

  function isPaidStatus(status) {
    const s =
      normLower(
        status
      );

    return (
      s === "confirmed"
      ||
      s === "paid"
      ||
      s === "payment_confirmed"
    );
  }

  // =========================================================
  // STAGE
  // =========================================================

  function normalizeStageId(v) {
    return (
      norm(v) ||
      "main"
    );
  }

  function stageMatches(
    rowStageId,
    wantedStageId
  ) {
    const rowStage =
      normalizeStageId(
        rowStageId
      );

    const wanted =
      normalizeStageId(
        wantedStageId
      );

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
      rowRaw ===
        wantedRaw
      ||
      rowStage ===
        `stage-${wantedRaw}`
      ||
      wanted ===
        `stage-${rowRaw}`
    );
  }

  // =========================================================
  // SOLO DETECTION
  // =========================================================

  function isSoloRow(
    docId,
    data
  ) {
    const d =
      data || {};

    if (
      normLower(
        d.entryType
      ) === "solo"
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

  // =========================================================
  // SECTOR / ZONE
  // =========================================================

  function normalizeSector(value) {
    return norm(value)
      .toUpperCase()
      .replace(
        /\s+/g,
        ""
      );
  }

  function zoneFromSector(
    sector
  ) {
    const s =
      normalizeSector(
        sector
      );

    const match =
      s.match(
        /^([ABC])/
      );

    return match
      ? match[1]
      : "";
  }

  function normalizeZone(
    zone,
    sector
  ) {
    const z =
      norm(zone)
        .toUpperCase();

    if (
      ["A", "B", "C"].includes(
        z
      )
    ) {
      return z;
    }

    return zoneFromSector(
      sector
    );
  }

  // =========================================================
  // COMPETITION META
  // =========================================================

  async function getCompetition(
    db,
    competitionId
  ) {
    const id =
      norm(
        competitionId
      );

    if (
      !id
    ) {
      return null;
    }

    try {
      const snap =
        await db
          .collection(
            "competitions"
          )
          .doc(id)
          .get();

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

    } catch (err) {
      console.warn(
        "[live_solo] competition:",
        err
      );

      return null;
    }
  }

  function findEvent(
    competition,
    stageId
  ) {
    const c =
      competition || {};

    const events =
      Array.isArray(
        c.events
      )
        ? c.events
        : [];

    const wanted =
      normalizeStageId(
        stageId
      );

    return (
      events.find(
        ev => {
          const evId =
            normalizeStageId(
              ev?.key ||
              ev?.stageId ||
              ev?.id
            );

          return stageMatches(
            evId,
            wanted
          );
        }
      )
      ||
      null
    );
  }

  function normalizeFormat(v) {
    return normLower(v)
      .replace(
        /_/g,
        "-"
      )
      .replace(
        /\s+/g,
        ""
      );
  }

  function competitionIsSolo(
    competition,
    stageId
  ) {
    const c =
      competition || {};

    const ev =
      findEvent(
        c,
        stageId
      );

    const explicit =
      normLower(
        ev?.entryType ||
        c.entryType ||
        ""
      );

    if (
      explicit === "solo"
    ) {
      return true;
    }

    if (
      explicit === "team"
    ) {
      return false;
    }

    const format =
      normalizeFormat(
        ev?.format ||
        ev?.engine?.baseFormat ||
        c.format ||
        c.engine?.baseFormat ||
        ""
      );

    return (
      format ===
      "stalker-solo"
    );
  }

  // =========================================================
  // ROW NORMALIZATION
  // =========================================================

  function normalizeSoloRow(
    docId,
    data
  ) {
    const d =
      data || {};

    const uid =
      norm(
        d.uid ||
        d.participantUid ||
        d.userId ||
        d.registeredByUid
      );

    const sector =
      normalizeSector(
        d.sector
      );

    const zone =
      normalizeZone(
        d.zone,
        sector
      );

    const name =
      canonicalName(
        d
      );

    /*
     * Для LIVE SOLO поводимося
     * як "одна особа = одна команда".
     *
     * teamId тут технічний ключ.
     */
    const liveId =
      uid ||
      norm(docId);

    return {
      id:
        docId,

      uid:
        uid,

      teamId:
        liveId,

      team:
        name,

      teamName:
        name,

      participantName:
        name,

      displayName:
        name,

      entryType:
        "solo",

      competitionId:
        norm(
          d.competitionId
        ),

      stageId:
        normalizeStageId(
          d.stageId
        ),

      zone:
        zone,

      sector:
        sector,

      status:
        norm(
          d.status
        ),

      confirmed:
        isPaidStatus(
          d.status
        ),

      firstName:
        norm(
          d.firstName
        ),

      lastName:
        norm(
          d.lastName
        ),

      createdAt:
        d.createdAt ||
        null,

      updatedAt:
        d.updatedAt ||
        null,

      source:
        "public_participants"
    };
  }

  // =========================================================
  // LOAD
  // =========================================================

  async function loadSoloParticipants(
    options = {}
  ) {
    const db =
      window.scDb;

    if (
      !db
    ) {
      throw new Error(
        "scDb не готовий"
      );
    }

    const competitionId =
      norm(
        options.competitionId
      );

    const stageId =
      normalizeStageId(
        options.stageId
      );

    if (
      !competitionId
    ) {
      return [];
    }

    /*
     * Спочатку перевіряємо,
     * чи вибране змагання/етап SOLO.
     */
    const competition =
      await getCompetition(
        db,
        competitionId
      );

    if (
      competition &&
      !competitionIsSolo(
        competition,
        stageId
      )
    ) {
      return [];
    }

    /*
     * Один простий запит
     * по competitionId.
     *
     * stage/solo/status
     * фільтруємо локально.
     */
    const snap =
      await db
        .collection(
          "public_participants"
        )
        .where(
          "competitionId",
          "==",
          competitionId
        )
        .get();

    const rows =
      [];

    snap.forEach(
      doc => {
        const data =
          doc.data() ||
          {};

        /*
         * SOLO визначаємо:
         * 1. по самому запису
         * 2. або по competition format
         *
         * Це підтримує старі записи,
         * де entryType міг бути "team".
         */
        const soloByRow =
          isSoloRow(
            doc.id,
            data
          );

        const soloByCompetition =
          competition
            ? competitionIsSolo(
                competition,
                stageId
              )
            : false;

        if (
          !soloByRow &&
          !soloByCompetition
        ) {
          return;
        }

        if (
          !stageMatches(
            data.stageId,
            stageId
          )
        ) {
          return;
        }

        /*
         * У LIVE беремо тільки
         * підтверджених/оплачених.
         */
        if (
          !isPaidStatus(
            data.status
          )
        ) {
          return;
        }

        const row =
          normalizeSoloRow(
            doc.id,
            data
          );

        /*
         * Без сектора після жеребу
         * у зону ще не ставимо.
         */
        if (
          !row.sector ||
          !row.zone
        ) {
          return;
        }

        rows.push(
          row
        );
      }
    );

    /*
     * A1..A20,
     * B1..,
     * C1..
     */
    rows.sort(
      (a, b) => {
        const zoneOrder = {
          A: 1,
          B: 2,
          C: 3
        };

        const az =
          zoneOrder[
            a.zone
          ] || 99;

        const bz =
          zoneOrder[
            b.zone
          ] || 99;

        if (
          az !== bz
        ) {
          return az - bz;
        }

        const an =
          Number(
            String(
              a.sector
            ).replace(
              /\D+/g,
              ""
            )
          ) || 9999;

        const bn =
          Number(
            String(
              b.sector
            ).replace(
              /\D+/g,
              ""
            )
          ) || 9999;

        if (
          an !== bn
        ) {
          return an - bn;
        }

        return a.team.localeCompare(
          b.team,
          "uk"
        );
      }
    );

    console.log(
      "✅ SOLO LIVE participants:",
      rows
    );

    return rows;
  }

  // =========================================================
  // PUBLIC API
  // =========================================================

  window.scSoloLive = {
    load:
      loadSoloParticipants,

    isSoloCompetition:
      competitionIsSolo,

    stageMatches,
    normalizeSoloRow,
    zoneFromSector
  };

})();
