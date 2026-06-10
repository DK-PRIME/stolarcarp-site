// assets/js/draw_admin.js
// STOLAR CARP • Admin draw (mobile-first cards)
// ✅ competitions -> stageSelect
// ✅ loads ALL confirmed registrations once, filters locally
// ✅ unique sectors A1..C8
// ✅ per-row save/clear: drawKey/drawZone/drawSector/bigFishTotal/drawAt
// ✅ if sector = empty -> removes team from draw
// ✅ keeps selected stage (localStorage restore)
// ✅ after save/clear -> sorts A..C + sector
// ✅ after each save/clear -> updates stageResults/{activeKey} + settings/app.activeKey (LIVE)

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
    ["A", "B", "C"].forEach(z => {
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
      return { compId: comp, stageKey: stage ? stage : null };
    },

    currentStageValue: () => els.stageSelect?.value || "",

    getCompIdFromReg: (x) =>
      x.competitionId || x.compId || x.competition || x.seasonId || x.season || x.eventCompetitionId || "",

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
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }
  };

  const authModule = {
    requireAdmin: async (user) => {
      if (!user) return false;
      if (user.uid === CONFIG.ADMIN_UID) return true;
      const snap = await db.collection(CONFIG.COLLECTIONS.USERS).doc(user.uid).get();
      const role = (snap.exists ? (snap.data() || {}).role : "") || "";
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
        const opts = Array.from(els.stageSelect.options || []);
        const ok = opts.find((o) => String(o.value) === String(keep));
        if (ok) els.stageSelect.value = keep;
      }
    },

    loadAllConfirmed: async () => {
      utils.setMsg("Завантаження підтверджених заявок…", true);

      const snap = await db
        .collection(CONFIG.COLLECTIONS.REGISTRATIONS)
        .where("status", "==", "confirmed")
        .get();

      state.regsAllConfirmed = [];
      snap.forEach((d) => {
        const x = d.data() || {};
        state.regsAllConfirmed.push({
          _id: d.id,
          teamId: utils.norm(x.teamId || ""),
          teamName: x.teamName || x.team || x.name || "",
          captain: x.captain || x.captainName || "",
          phone: x.phone || x.captainPhone || "",
          compId: utils.norm(utils.getCompIdFromReg(x)),
          stageId: utils.getStageIdFromReg(x),
          drawKey: utils.norm(x.drawKey || ""),
          bigFishTotal: !!x.bigFishTotal
        });
      });

      utils.setMsg("", true);
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
        if (utils.norm(r.drawKey)) state.usedSectorSet.add(utils.norm(r.drawKey));
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
        if (stageKey && utils.norm(r.stageId) !== utils.norm(stageKey)) return false;
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
        els.countInfo.textContent = `Для вибраного: ${totalSel} команд (з підтверджених ${totalAll})`;
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
      <div class="draw-row" data-docid="${r._id}">
        <div class="draw-team">
          ${utils.esc(r.teamName || "—")}
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
        icon === "saving" ? "⏳" : icon === "ok" ? "✅" : icon === "err" ? "⚠️" : "💾";
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

      utils.saveStageToLS(els.stageSelect?.value || "");

      const docId = wrap.getAttribute("data-docid");
      const sectorVal = utils.norm(wrap.querySelector(".sectorPick")?.value || "");
      const bigFish = !!wrap.querySelector(".bigFishChk")?.checked;
      const ts = window.firebase.firestore.FieldValue.serverTimestamp();

      if (!docId) return;

      // ✅ NEW: якщо вибрано "— Оберіть сектор —", очищаємо жеребкування команди
      if (!sectorVal) {
        try {
          render.setRowState(wrap, "is-saving");
          render.setBtnIcon(wrap, "saving");
          render.showRowMsg(wrap, "Очищення…", true);

          const del = window.firebase.firestore.FieldValue.delete();

          await db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(docId).update({
            drawKey: del,
            drawZone: del,
            drawSector: del,
            bigFishTotal: bigFish,
            drawAt: ts
          });

          await db
            .collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS)
            .doc(docId)
            .set(
              {
                drawKey: del,
                drawZone: del,
                drawSector: del,
                bigFishTotal: bigFish,
                drawAt: ts
              },
              { merge: true }
            );

          const a = state.regsAllConfirmed.find((x) => x._id === docId);
          if (a) {
            a.drawKey = "";
            a.bigFishTotal = bigFish;
          }

          render.setRowState(wrap, "is-ok");
          render.setBtnIcon(wrap, "ok");
          render.showRowMsg(wrap, `Очищено ${utils.fmtTimeNow()}`, true);

          filters.apply();
          await firestore.publishStageResultsTeams();

          utils.setMsg("✅ Команду забрано з сектора, Live оновлено", true);
          setTimeout(() => utils.setMsg("", true), 1200);
        } catch (err) {
          console.error(err);
          render.setRowState(wrap, "is-err");
          render.setBtnIcon(wrap, "err");
          render.showRowMsg(wrap, "Помилка очищення", false);
          utils.setMsg("Помилка очищення жеребкування", false);

          setTimeout(() => {
            render.setRowState(wrap, null);
            render.setBtnIcon(wrap, "save");
          }, 1700);
        }

        return;
      }

      if (state.usedSectorSet.has(sectorVal)) {
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

      const zone = sectorVal[0];
      const sectorNum = parseInt(sectorVal.slice(1), 10);

      try {
        render.setRowState(wrap, "is-saving");
        render.setBtnIcon(wrap, "saving");
        render.showRowMsg(wrap, "Збереження…", true);

        await db.collection(CONFIG.COLLECTIONS.REGISTRATIONS).doc(docId).update({
          drawKey: sectorVal,
          drawZone: zone,
          drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
          bigFishTotal: bigFish,
          drawAt: ts
        });

        await db
          .collection(CONFIG.COLLECTIONS.PUBLIC_PARTICIPANTS)
          .doc(docId)
          .set(
            {
              drawKey: sectorVal,
              drawZone: zone,
              drawSector: Number.isFinite(sectorNum) ? sectorNum : null,
              bigFishTotal: bigFish,
              drawAt: ts
            },
            { merge: true }
          );

        const a = state.regsAllConfirmed.find((x) => x._id === docId);
        if (a) {
          a.drawKey = sectorVal;
          a.bigFishTotal = bigFish;
        }

        render.setRowState(wrap, "is-ok");
        render.setBtnIcon(wrap, "ok");
        render.showRowMsg(wrap, `Збережено ${utils.fmtTimeNow()}`, true);

        filters.apply();
        await firestore.publishStageResultsTeams();

        utils.setMsg("✅ Live оновлено", true);
        setTimeout(() => utils.setMsg("", true), 900);
      } catch (err) {
        console.error(err);
        render.setRowState(wrap, "is-err");
        render.setBtnIcon(wrap, "err");
        render.showRowMsg(wrap, "Помилка (Rules/доступ)", false);
        utils.setMsg("Помилка збереження", false);

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
        if (els.stageSelect) els.stageSelect.innerHTML = `<option value="">Увійдіть як адмін</option>`;
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
          const opts = Array.from(els.stageSelect.options || []);
          const ok = opts.find((o) => String(o.value) === String(saved));
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
