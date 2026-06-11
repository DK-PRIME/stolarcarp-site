// assets/js/draw_admin.js
// STOLAR CARP • Admin draw (mobile-first cards)
// ✅ registrations + fallback public_participants
// ✅ if team deleted from registrations -> save restores it
// ✅ unique sectors A1..C8
// ✅ per-row save/clear
// ✅ after each save/clear -> updates stageResults/{activeKey} + settings/app.activeKey

(function () {
  "use strict";

  const CONFIG = {
    ADMIN_UID: "5Dt6fN64c3aWACYV1WacxV2BHDl2",
    LS_KEY_STAGE: "sc_draw_selected_stage_v2",
    COLLECTIONS: {
      REGISTRATIONS: "registrations",
      COMPETITIONS: "competitions",
      USERS: "users",
      STAGE_RESULTS: "stageResults",
      SETTINGS: "settings",
      PUBLIC_PARTICIPANTS: "public_participants"
    }
  };

  const SECTORS = (() => {
    const arr = [];
    ["A", "B", "C"].forEach((z) => {
      for (let i = 1; i <= 8; i++) arr.push(`${z}${i}`);
    });
    return arr;
  })();

  const state = {
    isAdmin: false,
    stageNameByKey: new Map(),
    regsAllConfirmed: [],
    regsFiltered: [],
    usedSectorSet: new Set()
  };

  const els = {
    stageSelect: document.getElementById("stageSelect"),
    qInput: document.getElementById("q"),
    msg: document.getElementById("msg"),
    drawRows: document.getElementById("drawRows"),
    countInfo: document.getElementById("countInfo")
  };

  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    if (els.msg) els.msg.textContent = "Firebase init не завантажився.";
    return;
  }

  const utils = {
    esc: (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;"),

    setMsg: (text, ok = true) => {
      if (!els.msg) return;
      els.msg.textContent = text || "";
      els.msg.style.color = text ? (ok ? "#8fe39a" : "#ff6c6c") : "";
    },

    norm: (v) => String(v ?? "").trim(),

    parseStageValue: (v) => {
      const [compId, stageKeyRaw] = String(v || "").split("||");
      const comp = utils.norm(compId);
      const stage = utils.norm(stageKeyRaw);
      return { compId: comp, stageKey: stage || null };
    },

    currentStageValue: () => els.stageSelect?.value || "",

    getCompIdFromReg: (x) =>
      x.competitionId ||
      x.compId ||
      x.competition ||
      x.seasonId ||
      x.season ||
      x.eventCompetitionId ||
      "",

    getStageIdFromReg: (x) => {
      const v = x.stageId || x.stageKey || x.stage || x.eventId || x.eventKey || x.roundId || "";
      return utils.norm(v) || null;
    },

    parseSector: (drawKey) => {
      const s = utils.norm(drawKey).toUpperCase();
      if (!s) return null;
      const z = s[0];
      const n = parseInt(s.slice(1), 10);
      if (!["A", "B", "C"].includes(z) || !Number.isFinite(n)) return null;
      return { z, n };
    },

    zoneRank: (z) => (z === "A" ? 1 : z === "B" ? 2 : z === "C" ? 3 : 9),

    sortByDraw: (a, b) => {
      const sa = utils.parseSector(a.drawKey);
      const sb = utils.parseSector(b.drawKey);

      if (!!sa && !sb) return -1;
      if (!sa && !!sb) return 1;
      if (!sa && !sb) return (a.teamName || "").localeCompare(b.teamName || "", "uk");

      const zr = utils.zoneRank(sa.z) - utils.zoneRank(sb.z);
      if (zr) return zr;

      const nr = sa.n - sb.n;
      if (nr) return nr;

      return (a.teamName || "").localeCompare(b.teamName || "", "uk");
    },

    saveStageToLS: (v) => {
      try {
        localStorage.setItem(CONFIG.LS_KEY_STAGE, String(v || ""));
      } catch {}
    },

    loadStageFromLS: () => {
      try {
        return localStorage.getItem(CONFIG.LS_KEY_STAGE) || "";
      } catch {
        return "";
      }
    },

    fmtTimeNow: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    }
  };

  const authModule = {
    requireAdmin: async (user) => {
      if (!user) return false;
      if (user.uid === CONFIG.ADMIN_UID) return true;

      const snap = await db.collection(CONFIG.COLLECTIONS.USERS).doc(user.uid).get();
      const role = snap.exists ? (snap.data() || {}).role || "" : "";
      return role === "admin";
    }
  };

  const firestore = {
    loadStagesToSelect: async () => {
      if (!els.stageSelect) return;

      const keep = els.stageSelect.value || utils.loadStageFromLS();

      els.stageSelect.innerHTML = `<option value="">Завантаження…</option>`;
      state.stageNameByKey = new Map();

      const items = [];
      const snap = await db.collection(CONFIG.COLLECTIONS.COMPETITIONS).get();

      snap.forEach((docSnap) => {
        const c = docSnap.data() || {};
        const compId = docSnap.id;

        const brand = c.brand || "STOLAR CARP";
        const year = c.year || c.seasonYear || "";
        const compTitle = c.name || c.title || (year ? `Season ${year}` : compId);
        const eventsArr = Array.isArray(c.events) ? c.events : null;

        if (eventsArr && eventsArr.length) {
          eventsArr.forEach((ev, idx) => {
            const key = String(ev.key || ev.stageId || ev.id || `stage-${idx + 1}`);
            const stageTitle = ev.title || ev.name || ev.label || `Етап ${idx + 1}`;
            const label = `${brand} · ${compTitle} — ${stageTitle}`;
            const value = `${compId}||${key}`;

            items.push({ value, label });
            state.stageNameByKey.set(value, label);
          });
        } else {
          const label = `${brand} · ${compTitle}`;
          const value = `${compId}||main`;

          items.push({ value, label });
          state.stageNameByKey.set(value, label);
        }
      });

      items.sort((a, b) => a.label.localeCompare(b.label, "uk"));

      els.stageSelect.innerHTML =
        `<option value="">— Оберіть —</option>` +
        items.map((x) => `<option value="${utils.esc(x.value)}">${utils.esc(x.label)}</option>`).join("");

      if (keep) {
        const ok = Array.from(els.stageSelect.options || []).find((o) => String(o.value) === String(keep));
        if (ok) els.stageSelect.value = keep;
      }
    },

    normalizeReg: (id, x, source) => ({
      _id: id,
      _source: source,
      teamId: utils.norm(x.teamId || ""),
      teamName: x.teamName || x.team || x.name || "",
      captain: x.captain || x.captainName || "",
      phone: x.phone || x.captainPhone || "",
      compId: utils.norm(utils.getCompIdFromReg(x)),
      stageId: utils.getStageIdFromReg(x),
      drawKey: utils.norm(x.drawKey || ""),
      bigFishTotal: !!x.bigFishTotal
    }),

    loadAllConfirmed: async () => {
      utils.setMsg("Завантаження підтверджених заявок…", true);

      const byId = new Map();

      const regSnap = await db
        .collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .where("status", "==", "confirmed")
        .get();

      regSnap.forEach((d) => {
        byId.set(d.id, firestore.normalizeReg(d.id, d.data() || {}, "registrations"));
      });

      // Резерв: команда могла бути стерта з registrations, але залишилась тут.
      const pubSnap = await db.collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS).get();

      pubSnap.forEach((d) => {
        if (byId.has(d.id)) return;

        const x = d.data() || {};
        const status = utils.norm(x.status || "").toLowerCase();

        if (["cancelled", "canceled", "deleted", "rejected"].includes(status)) return;

        byId.set(d.id, firestore.normalizeReg(d.id, x, "public_participants"));
      });

      state.regsAllConfirmed = Array.from(byId.values());

      utils.setMsg("", true);
    },

    restoreOrSaveRegistration: async ({ docId, reg, compId, stageKey, sectorVal, zone, sectorNum, bigFish, ts, del }) => {
      const base = {
        status: "confirmed",
        competitionId: reg.compId || compId || null,
        stageId: reg.stageId || stageKey || "main",
        teamId: reg.teamId || "",
        teamName: reg.teamName || "",
        captain: reg.captain || "",
        phone: reg.phone || "",
        bigFishTotal: bigFish,
        drawAt: ts,
        restoredAt: reg._source === "public_participants" ? ts : undefined
      };

      Object.keys(base).forEach((k) => {
        if (base[k] === undefined) delete base[k];
      });

      if (!sectorVal) {
        await db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(docId).set(
          {
            ...base,
            drawKey: del,
            drawZone: del,
            drawSector: del
          },
          { merge: true }
        );

        return;
      }

      await db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(docId).set(
        {
          ...base,
          drawKey: sectorVal,
          drawZone: zone,
          drawSector: Number.isFinite(sectorNum) ? sectorNum : null
        },
        { merge: true }
      );
    },

    publishPublicParticipant: async ({ docId, reg, compId, stageKey, sectorVal, zone, sectorNum, bigFish, ts, del }) => {
      const base = {
        status: "confirmed",
        competitionId: reg.compId || compId || null,
        stageId: reg.stageId || stageKey || "main",
        teamId: reg.teamId || "",
        teamName: reg.teamName || "",
        captain: reg.captain || "",
        phone: reg.phone || "",
        bigFishTotal: bigFish,
        drawAt: ts
      };

      if (!sectorVal) {
        await db.collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS).doc(docId).set(
          {
            ...base,
            drawKey: del,
            drawZone: del,
            drawSector: del
          },
          { merge: true }
        );

        return;
      }

      await db.collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS).doc(docId).set(
        {
          ...base,
          drawKey: sectorVal,
          drawZone: zone,
          drawSector: Number.isFinite(sectorNum) ? sectorNum : null
        },
        { merge: true }
      );
    },

    publishStageResultsTeams: async () => {
      if (!state.isAdmin) return;

      const selVal = utils.currentStageValue();
      if (!selVal) return;

      const { compId, stageKey } = utils.parseStageValue(selVal);
      if (!compId) return;

      const docId = stageKey ? `${compId}||${stageKey}` : `${compId}||main`;
      const stageName = state.stageNameByKey.get(selVal) || "";

      const teams = state.regsFiltered.map((r) => {
        const drawKey = utils.norm(r.drawKey);
        const zone = drawKey ? drawKey[0] : null;
        const n = drawKey ? parseInt(drawKey.slice(1), 10) : null;

        return {
          regId: r._id,
          teamId: utils.norm(r.teamId || ""),
          teamName: r.teamName || "",
          drawKey: drawKey || null,
          drawZone: zone || null,
          drawSector: Number.isFinite(n) ? n : null,
          bigFishTotal: !!r.bigFishTotal
        };
      });

      const bigFishTotal = teams
        .filter((t) => t.bigFishTotal)
        .map((t) => ({
          regId: t.regId,
          teamId: t.teamId || null,
          team: t.teamName,
          big1Day: null,
          big2Day: null,
          maxBig: null,
          isMax: false
        }));

      const ts = window.firebase.firestore.FieldValue.serverTimestamp();

      await db.collection(CONFIG.COLLECTIONS.STAGE_RESULTS).doc(docId).set(
        {
          compId,
          stageKey: stageKey || null,
          stageName,
          updatedAt: ts,
          teams,
          bigFishTotal,
          zones: { A: [], B: [], C: [] },
          total: []
        },
        { merge: true }
      );

      await db.collection(CONFIG.COLLECTIONS.SETTINGS).doc("app").set(
        {
          activeKey: docId,
          activeCompetitionId: compId,
          activeStageId: stageKey || null,
          updatedAt: ts
        },
        { merge: true }
      );
    }
  };

  const filters = {
    rebuildUsedSectors: () => {
      state.usedSectorSet = new Set();

      state.regsFiltered.forEach((r) => {
        const key = utils.norm(r.drawKey);
        if (key) state.usedSectorSet.add(key);
      });
    },

    apply: () => {
      const selVal = utils.currentStageValue();
      const { compId, stageKey } = utils.parseStageValue(selVal);

      if (!compId) {
        state.regsFiltered = [];
        state.usedSectorSet = new Set();
        render.list();
        if (els.countInfo) els.countInfo.textContent = "";
        return;
      }

      state.regsFiltered = state.regsAllConfirmed.filter((r) => {
        if (utils.norm(r.compId) !== utils.norm(compId)) return false;

        if (stageKey && utils.norm(r.stageId || "main") !== utils.norm(stageKey)) return false;
        if (!stageKey && r.stageId) return false;

        return true;
      });

      const q = utils.norm(els.qInput?.value || "").toLowerCase();

      if (q) {
        state.regsFiltered = state.regsFiltered.filter((r) => {
          const t = `${r.teamName} ${r.phone} ${r.captain}`.toLowerCase();
          return t.includes(q);
        });
      }

      state.regsFiltered.sort(utils.sortByDraw);

      filters.rebuildUsedSectors();
      render.list();

      if (els.countInfo) {
        const totalAll = state.regsAllConfirmed.length;
        const totalSel = state.regsFiltered.length;
        const restored = state.regsFiltered.filter((x) => x._source === "public_participants").length;

        els.countInfo.textContent =
          `Для вибраного: ${totalSel} команд (з підтверджених/резерву ${totalAll})` +
          (restored ? ` · до відновлення: ${restored}` : "");
      }
    }
  };

  const render = {
    sectorOptionsHTML: (cur, docId) => {
      const current = utils.norm(cur);

      return `
        <select class="select sectorPick" data-docid="${utils.esc(docId)}">
          <option value="">— Оберіть сектор —</option>
          ${SECTORS.map((s) => {
            const taken = state.usedSectorSet.has(s) && s !== current;
            return `<option value="${s}" ${s === current ? "selected" : ""} ${taken ? "disabled" : ""}>
              ${s}${taken ? " (зайнято)" : ""}
            </option>`;
          }).join("")}
        </select>
      `;
    },

    rowHTML: (r) => `
      <div class="draw-row" data-docid="${utils.esc(r._id)}">
        <div class="draw-team">
          ${utils.esc(r.teamName || "—")}
          ${
            r._source === "public_participants"
              ? `<span class="muted"> · буде відновлено</span>`
              : ""
          }
        </div>

        ${render.sectorOptionsHTML(r.drawKey, r._id)}

        <input
          type="checkbox"
          class="chk bigFishChk"
          ${r.bigFishTotal ? "checked" : ""}
        >

        <button
          class="btn-icon saveBtnRow"
          type="button"
          title="Зберегти"
        >💾</button>

        <div class="rowMsg"></div>
      </div>
    `,

    list: () => {
      if (!els.drawRows) return;

      if (!state.regsFiltered.length) {
        els.drawRows.innerHTML = `<div class="muted" style="padding:12px 2px;">Нема команд для жеребкування.</div>`;
        return;
      }

      els.drawRows.innerHTML = `<div class="draw-wrap">${state.regsFiltered.map(render.rowHTML).join("")}</div>`;
    },

    showRowMsg: (wrap, text, ok = true) => {
      const el = wrap.querySelector(".rowMsg");
      if (!el) return;

      el.textContent = text || "";
      el.classList.toggle("ok", !!ok);
      el.classList.toggle("err", !ok);
    },

    setRowState: (wrap, stateName) => {
      wrap.classList.remove("is-saving", "is-ok", "is-err");
      if (stateName) wrap.classList.add(stateName);
    },

    setBtnIcon: (wrap, icon) => {
      const btn = wrap.querySelector(".saveBtnRow");
      if (!btn) return;

      btn.textContent =
        icon === "saving" ? "⏳" :
        icon === "ok" ? "✅" :
        icon === "err" ? "⚠️" :
        "💾";
    }
  };

  const handlers = {
    saveRow: async (e) => {
      const btn = e.target.closest(".saveBtnRow");
      if (!btn) return;

      const wrap = e.target.closest(".draw-row");
      if (!wrap) return;

      if (!state.isAdmin) {
        render.setRowState(wrap, "is-err");
        render.setBtnIcon(wrap, "err");
        render.showRowMsg(wrap, "Нема адмін-доступу", false);

        setTimeout(() => {
          render.setRowState(wrap, null);
          render.setBtnIcon(wrap, "save");
        }, 1400);

        return;
      }

      const selVal = utils.currentStageValue();
      const { compId, stageKey } = utils.parseStageValue(selVal);

      if (!compId) {
        utils.setMsg("Оберіть змагання/етап.", false);
        return;
      }

      utils.saveStageToLS(selVal);

      const docId = wrap.getAttribute("data-docid");
      const sectorVal = utils.norm(wrap.querySelector(".sectorPick")?.value || "");
      const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;
      const ts = window.firebase.firestore.FieldValue.serverTimestamp();
      const del = window.firebase.firestore.FieldValue.delete();

      if (!docId) return;

      const reg = state.regsAllConfirmed.find((x) => x._id === docId);

      if (!reg) {
        utils.setMsg("Команду не знайдено в локальному списку.", false);
        return;
      }

      if (sectorVal && state.usedSectorSet.has(sectorVal)) {
        const other = state.regsFiltered.find(
          (r) => utils.norm(r.drawKey) === sectorVal && r._id !== docId
        );

        if (other) {
          render.setRowState(wrap, "is-err");
          render.setBtnIcon(wrap, "err");
          render.showRowMsg(wrap, `Зайнято: ${other.teamName}`, false);

          setTimeout(() => {
            render.setRowState(wrap, null);
            render.setBtnIcon(wrap, "save");
          }, 1700);

          return;
        }
      }

      const zone = sectorVal ? sectorVal[0] : null;
      const sectorNum = sectorVal ? parseInt(sectorVal.slice(1), 10) : null;

      try {
        render.setRowState(wrap, "is-saving");
        render.setBtnIcon(wrap, "saving");
        render.showRowMsg(wrap, sectorVal ? "Збереження…" : "Очищення…", true);

        await firestore.restoreOrSaveRegistration({
          docId,
          reg,
          compId,
          stageKey,
          sectorVal,
          zone,
          sectorNum,
          bigFish,
          ts,
          del
        });

        await firestore.publishPublicParticipant({
          docId,
          reg,
          compId,
          stageKey,
          sectorVal,
          zone,
          sectorNum,
          bigFish,
          ts,
          del
        });

        reg._source = "registrations";
        reg.compId = reg.compId || compId;
        reg.stageId = reg.stageId || stageKey || "main";
        reg.drawKey = sectorVal || "";
        reg.bigFishTotal = bigFish;

        filters.apply();
        await firestore.publishStageResultsTeams();

        render.setRowState(wrap, "is-ok");
        render.setBtnIcon(wrap, "ok");
        render.showRowMsg(wrap, sectorVal ? `Збережено ${utils.fmtTimeNow()}` : `Очищено ${utils.fmtTimeNow()}`, true);

        utils.setMsg(
          sectorVal
            ? "✅ Збережено. Якщо команда була видалена — її відновлено. Live оновлено."
            : "✅ Команду забрано з сектора. Live оновлено.",
          true
        );

        setTimeout(() => utils.setMsg("", true), 1400);
      } catch (err) {
        console.error(err);

        render.setRowState(wrap, "is-err");
        render.setBtnIcon(wrap, "err");
        render.showRowMsg(wrap, "Помилка (Rules/доступ)", false);
        utils.setMsg("Помилка збереження. Перевір Firestore Rules.", false);

        setTimeout(() => {
          render.setRowState(wrap, null);
          render.setBtnIcon(wrap, "save");
        }, 1700);
      }
    }
  };

  const bindEvents = () => {
    document.addEventListener("click", handlers.saveRow);

    els.stageSelect?.addEventListener("change", () => {
      utils.saveStageToLS(els.stageSelect.value || "");
      filters.apply();
    });

    els.qInput?.addEventListener("input", () => filters.apply());
  };

  const boot = () => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        utils.setMsg("Увійдіть як адмін.", false);

        if (els.stageSelect) {
          els.stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
        }

        state.regsAllConfirmed = [];
        state.regsFiltered = [];
        render.list();
        return;
      }

      try {
        state.isAdmin = await authModule.requireAdmin(user);

        if (!state.isAdmin) {
          utils.setMsg("Доступ заборонено. Цей акаунт не адмін.", false);
          state.regsAllConfirmed = [];
          state.regsFiltered = [];
          render.list();
          return;
        }

        await firestore.loadStagesToSelect();
        await firestore.loadAllConfirmed();

        const saved = utils.loadStageFromLS();

        if (saved) {
          const ok = Array.from(els.stageSelect.options || []).find((o) => String(o.value) === String(saved));
          if (ok) els.stageSelect.value = saved;
        }

        if (els.stageSelect?.value) {
          filters.apply();
          utils.setMsg("", true);
        } else {
          utils.setMsg("Оберіть змагання/етап.", true);
        }
      } catch (e) {
        console.error(e);
        utils.setMsg("Помилка завантаження/перевірки адміна.", false);
      }
    });
  };

  bindEvents();
  boot();
})();
