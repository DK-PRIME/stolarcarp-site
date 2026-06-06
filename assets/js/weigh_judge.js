// assets/js/weigh_judge.js
// STOLAR CARP • Judge • Weighings via QR (token-based, anonymous)
// ================================================================
// ✅ QR params: ?zone=A&token=SC-...&key=compId||stageId&w=W1
// ✅ Anonymous auth + Admin mode
// ✅ Token TTL + Zone restriction
// ✅ LIVE-compatible weighings documents

(function(){
  "use strict";

  // ==================== КОНФІГУРАЦІЯ ====================
  const CONFIG = {
    DEFAULT_MAX_W: 4,
    MAX_FISH_WEIGHT: 49.99,
    TOKEN_TTL_HOURS: 72,
    ZONES: ["A", "B", "C"]
  };

  // ==================== СТАН ДОДАТКУ ====================
  const State = {
    // Firebase
    db: null,
    auth: null,
    user: null,
    
    // Контекст з QR/URL
    zone: "",
    token: "",
    key: "",        // compId||stageId
    compId: "",
    stageId: "",
    viewW: 1,       // поточне видиме зважування
    
    // Дані
    teams: [],
    teamsMap: {},
    weighCache: {},
    currentW: CONFIG.DEFAULT_MAX_W,
    
    // UI елементи (ініціалізуються пізніше)
    elements: {}
  };

  // ==================== УТИЛІТИ ====================
  const Utils = {
    norm: (v) => String(v ?? "").trim(),
    
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", 
      '"': "&quot;", "'": "&#39;"
    }[m])),
    
    toNum: (val) => {
      const s = String(val ?? "").trim().replace(",", ".");
      return s ? Number(s) : NaN;
    },
    
    round2: (x) => Math.round(x * 100) / 100,
    
    isExpired: (ts) => {
      try {
        const d = ts?.toDate ? ts.toDate() : null;
        return d ? d.getTime() <= Date.now() : false;
      } catch {
        return false;
      }
    },
    
    parseZoneKey: (drawKey, drawZone, drawSector) => {
      const z = (drawZone || (drawKey ? String(drawKey)[0] : "") || "").toUpperCase();
      const n = Number(drawSector || (drawKey ? parseInt(String(drawKey).slice(1), 10) : 0) || 0);
      const label = drawKey ? String(drawKey).toUpperCase() : (z && n ? `${z}${n}` : (z || "—"));
      return { z, n, label };
    },
    
    weighingDocId: (teamId, wNo) => 
      `${State.compId}||${State.stageId}||W${Number(wNo)}||${teamId}`
  };

  // ==================== МЕНЕДЖЕР UI ====================
  const UIManager = {
    init() {
      // Кешування DOM елементів
      State.elements = {
        zoneTitle: document.getElementById("zoneTitle"),
        statusEl: document.getElementById("status"),
        msgEl: document.getElementById("msg"),
        authPill: document.getElementById("authPill"),
        bindInfo: document.getElementById("bindInfo"),
        btnOpen: document.getElementById("btnOpen"),
        weighCard: document.getElementById("weighCard"),
        wMsgEl: document.getElementById("wMsg"),
        curWEl: document.getElementById("curW"),
        teamsCountEl: document.getElementById("teamsCount"),
        teamsBox: document.getElementById("teamsBox"),
        netBadge: document.getElementById("netBadge"),
        wBtns: [
          { n: 1, el: document.getElementById("w1") },
          { n: 2, el: document.getElementById("w2") },
          { n: 3, el: document.getElementById("w3") },
          { n: 4, el: document.getElementById("w4") }
        ]
      };
      
      this.injectStyles();
      this.setupEventListeners();
    },

    setMsg(text, isOk = true) {
      const el = State.elements.msgEl;
      if (!el) return;
      el.textContent = text || "";
      el.className = "muted " + (text ? (isOk ? "ok" : "err") : "");
    },

    setWMsg(text, isOk = true) {
      const el = State.elements.wMsgEl;
      if (!el) return;
      el.textContent = text || "";
      el.className = "muted " + (text ? (isOk ? "ok" : "err") : "");
    },

    paintZoneTitle() {
      const el = State.elements.zoneTitle;
      if (!el) return;
      
      const z = State.zone.toUpperCase();
      el.classList.remove("zone-a", "zone-b", "zone-c");
      el.textContent = z ? `Зона ${z}` : "Зона —";
      
      if (z === "A") el.classList.add("zone-a");
      else if (z === "B") el.classList.add("zone-b");
      else if (z === "C") el.classList.add("zone-c");
    },

    renderBindInfo() {
      this.paintZoneTitle();
      const el = State.elements.bindInfo;
      if (el) {
        el.textContent = `zone=${State.zone || "—"} | key=${State.key || "—"} | token=${State.token ? State.token.slice(0, 6) + "…" : "—"}`;
      }
    },

    updateWButtons() {
      const { curWEl, wBtns } = State.elements;
      if (curWEl) curWEl.textContent = `W${State.viewW}`;
      
      wBtns.forEach(b => {
        if (!b.el) return;
        b.el.classList.toggle("isActive", b.n === State.viewW);
        b.el.disabled = (b.n > State.currentW);
      });
    },

    updateOnlineStatus() {
      const el = State.elements.netBadge;
      if (!el) return;
      
      const on = navigator.onLine;
      el.style.display = "inline-flex";
      el.textContent = on ? "● online" : "● offline";
      el.style.opacity = on ? "1" : ".55";
    },

    injectStyles() {
      if (document.getElementById("wjMobileStyles")) return;
      
      const css = `
        <style id="wjMobileStyles">
          .wj-wrapTable {
            border: 1px solid rgba(148,163,184,.18);
            border-radius: 16px;
            overflow: hidden;
            background: rgba(2,6,23,.25);
          }
          .wj-scroll {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          table.wj {
            width: 100%;
            border-collapse: collapse;
            min-width: 720px;
            font-size: 12px;
          }
          table.wj th, table.wj td {
            padding: 8px 10px;
            border-bottom: 1px solid rgba(148,163,184,.12);
            vertical-align: top;
          }
          table.wj thead th {
            background: rgba(2,6,23,.92);
            font-weight: 900;
          }
          .wj-col-sector { width: 92px; white-space: nowrap; }
          .wj-col-team { width: 280px; min-width: 0; }
          .wj-col-w { width: 110px; text-align: center; min-width: 0; }
          .wj-pill {
            display: inline-flex; align-items: center; justify-content: center;
            width: 44px; height: 44px; border-radius: 999px;
            border: 1px solid rgba(148,163,184,.25);
            background: rgba(2,6,23,.35);
            font-weight: 900;
          }
          .wj-teamName { font-weight: 900; margin-bottom: 6px; }
          .wj-fishesScroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 2px 0 6px; }
          .wj-fishes { display: flex; flex-wrap: nowrap; gap: 6px; width: max-content; }
          .wj-fish { flex: 0 0 auto; display: flex; gap: 6px; align-items: center; }
          .wj-inp { width: 62px; height: 34px; padding: 0 6px; font-size: 12px; border-radius: 10px; text-align: center; }
          .wj-quick { width: 84px; height: 34px; padding: 0 6px; font-size: 12px; border-radius: 10px; text-align: center; }
          .wj-miniBtn {
            width: 34px; height: 34px; border-radius: 10px;
            border: 1px solid rgba(148,163,184,.25);
            background: rgba(2,6,23,.25);
            color: #e5e7eb; font-weight: 900; font-size: 16px;
          }
          .wj-miniBtn:disabled { opacity: .45; }
          .wj-actions { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
          .wj-actions .btn { padding: 10px 14px; font-size: 13px; border-radius: 14px; font-weight: 900; }
          .wj-hint { font-size: 12px; margin-top: 6px; }
          .wj-sum { font-weight: 900; }
          .wj-sub { font-size: 11px; margin-top: 2px; opacity: .75; }
        </style>
      `;
      document.head.insertAdjacentHTML("beforeend", css);
    },

    setupEventListeners() {
      // Online/offline
      window.addEventListener("online", () => this.updateOnlineStatus());
      window.addEventListener("offline", () => this.updateOnlineStatus());
      
      // W buttons
      State.elements.wBtns.forEach(b => {
        b.el?.addEventListener("click", () => {
          if (b.n > State.currentW) return;
          State.viewW = b.n;
          this.updateWButtons();
          TableManager.render();
          this.setWMsg(`Активна колонка: W${State.viewW}.`, true);
        });
      });
    }
  };

  // ==================== МЕНЕДЖЕР АВТОРИЗАЦІЇ ====================
  const AuthManager = {
    async waitFirebase() {
      for (let i = 0; i < 140; i++) {
        if (window.scDb && window.scAuth && window.firebase) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error("Firebase init не підняв scAuth/scDb.");
    },

    async ensureAnonAuth() {
      try {
        if (State.auth.currentUser) return State.auth.currentUser;
        await State.auth.signInAnonymously();
        return State.auth.currentUser;
      } catch (e) {
        throw new Error("Не вдалося увійти (анонімно). Перевір Firebase Auth.");
      }
    },

    async verifyToken() {
      const { token, key, zone } = State;
      
      if (!token) throw new Error("Нема token у QR.");
      if (!key) throw new Error("Нема key у QR (етап).");
      if (!zone || !CONFIG.ZONES.includes(zone)) throw new Error("Неправильна зона у QR.");

      const snap = await State.db.collection("judgeTokens").doc(token).get();
      if (!snap.exists) throw new Error("Токен не знайдено або видалено.");

      const d = snap.data() || {};
      if (!d.enabled) throw new Error("Токен вимкнено.");
      if (d.key && Utils.norm(d.key) !== key) throw new Error("Токен не для цього етапу (key).");
      if (Array.isArray(d.allowedZones) && !d.allowedZones.includes(zone)) {
        throw new Error("Токен не дозволяє цю зону.");
      }
      if (d.expiresAt && Utils.isExpired(d.expiresAt)) {
        throw new Error("Термін токена вийшов.");
      }

      // Fallback для compId/stageId
      if (!State.compId || !State.stageId) {
        State.compId = Utils.norm(d.compId || State.compId || "");
        State.stageId = Utils.norm(d.stageId || State.stageId || "");
      }
      
      if (!State.compId || !State.stageId) {
        if (key.includes("||")) {
          const parts = key.split("||");
          State.compId = Utils.norm(parts[0] || "");
          State.stageId = Utils.norm(parts.slice(1).join("||") || "");
        }
      }

      return d;
    },

    async init() {
      await this.waitFirebase();
      State.db = window.scDb;
      State.auth = window.scAuth;

      return new Promise((resolve) => {
        const unsub = State.auth.onAuthStateChanged(u => {
          unsub();
          resolve(u);
        });
      });
    }
  };

  // ==================== МЕНЕДЖЕР КОМАНД ====================
  const TeamManager = {
    async loadForZone() {
      const snap = await State.db.collection("stageResults").doc(State.key).get();
      if (!snap.exists) return [];

      const data = snap.data() || {};
      const teamsRaw = Array.isArray(data.teams) ? data.teams : [];

      const rows = [];
      teamsRaw.forEach(t => {
        const teamId = Utils.norm(t.teamId || "");
        if (!teamId) return;

        const hasDraw = !!(t.drawKey || t.drawZone || t.drawSector);
        if (!hasDraw) return;

        const zinfo = Utils.parseZoneKey(t.drawKey, t.drawZone, t.drawSector);
        if (zinfo.z !== State.zone) return;

        rows.push({
          teamId,
          teamName: Utils.norm(t.teamName || t.team || "—"),
          sector: zinfo.n || 0,
          drawKey: zinfo.label
        });
      });

      rows.sort((a, b) => 
        (a.sector || 0) - (b.sector || 0) || 
        (a.teamName || "").localeCompare(b.teamName || "", "uk")
      );

      return rows;
    },

    buildMap(teams) {
      return teams.reduce((m, x) => { m[x.teamId] = x; return m; }, {});
    }
  };

  // ==================== МЕНЕДЖЕР ЗВАЖУВАНЬ ====================
  const WeighingManager = {
    async load(teamId, wNo) {
      const id = Utils.weighingDocId(teamId, wNo);
      const snap = await State.db.collection("weighings").doc(id).get();
      return snap.exists ? (snap.data() || null) : null;
    },

    async preload(teams) {
      for (const t of teams) {
        State.weighCache[t.teamId] = State.weighCache[t.teamId] || {};
        for (let w = 1; w <= CONFIG.DEFAULT_MAX_W; w++) {
          State.weighCache[t.teamId][w] = await this.load(t.teamId, w);
        }
      }
    },

    cleanWeights(rawArr) {
      return (Array.isArray(rawArr) ? rawArr : [])
        .map(Utils.toNum)
        .map(n => Number.isFinite(n) ? Utils.round2(Math.max(0, Math.min(n, CONFIG.MAX_FISH_WEIGHT))) : NaN)
        .filter(n => Number.isFinite(n) && n > 0);
    },

    calcFromWeights(weights) {
      const fishCount = weights.length;
      const total = Utils.round2(weights.reduce((a, b) => a + b, 0));
      const big = fishCount ? Math.max(...weights) : 0;
      return { fishCount, totalWeightKg: total, bigFishKg: Utils.round2(big) };
    },

    async save(team, wNo, weightsRaw) {
      if (!State.compId || !State.stageId) {
        throw new Error("Нема compId/stageId (перевір key/token).");
      }

      const id = Utils.weighingDocId(team.teamId, wNo);
      const ts = window.firebase.firestore.FieldValue.serverTimestamp();

      const weights = this.cleanWeights(weightsRaw);
      const calc = this.calcFromWeights(weights);

      await State.db.collection("weighings").doc(id).set({
        // LIVE fields
        compId: State.compId,
        stageId: State.stageId,
        weighNo: Number(wNo),
        teamId: team.teamId,
        weights,

        // Extra для live tables
        zone: State.zone,
        sector: Number(team.sector || 0),
        teamName: team.teamName || "",
        fishCount: calc.fishCount,
        totalWeightKg: calc.totalWeightKg,
        bigFishKg: calc.bigFishKg,
        status: "submitted",
        updatedAt: ts,

        // Token-based access
        judgeToken: State.token,
        updatedBy: State.user?.uid || ""
      }, { merge: true });

      // Оновлення кешу
      State.weighCache[team.teamId] = State.weighCache[team.teamId] || {};
      State.weighCache[team.teamId][wNo] = {
        weights,
        fishCount: calc.fishCount,
        totalWeightKg: calc.totalWeightKg,
        bigFishKg: calc.bigFishKg,
        status: "submitted"
      };

      return calc;
    }
  };

  // ==================== МЕНЕДЖЕР ТАБЛИЦІ ====================
  const TableManager = {
    cellSummary(doc) {
      const weights = Array.isArray(doc?.weights) ? doc.weights : [];
      if (!weights.length) return `<span class="muted">—</span>`;
      
      const total = Utils.round2(weights.reduce((a, b) => a + b, 0)).toFixed(2);
      const c = weights.length;
      return `<div class="wj-sum">${Utils.esc(total)}</div><div class="wj-sub">🐟 ${c}</div>`;
    },

    editorCell(team, doc) {
      const weights = Array.isArray(doc?.weights) ? doc.weights : [];
      const safe = weights.length ? weights : [""];

      return `
        <div class="wj-editor" data-team="${Utils.esc(team.teamId)}">
          <div class="wj-fishesScroll">
            <div class="wj-fishes">
              ${safe.map((v) => `
                <div class="wj-fish">
                  <input class="inp wj-inp" inputmode="decimal" placeholder="вага"
                    value="${Utils.esc(v === "" ? "" : Number(v).toFixed(2))}">
                  <button class="wj-miniBtn wj-del" type="button" title="Видалити" ${safe.length <= 1 ? "disabled" : ""}>×</button>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="wj-actions">
            <input class="inp wj-quick" inputmode="decimal" placeholder="+ вага" value="">
            <button class="wj-miniBtn wj-add" type="button" title="Додати">+</button>
            <button class="btn btn--primary wj-save" type="button">OK</button>
          </div>

          <div class="muted wj-hint"></div>
        </div>
      `;
    },

    render() {
      const { teamsBox } = State.elements;
      if (!teamsBox) return;

      const teams = State.teams;
      
      if (!teams.length) {
        teamsBox.innerHTML = `<div class="muted">Нема команд у зоні ${Utils.esc(State.zone)} (перевір жереб у stageResults/${Utils.esc(State.key)}).</div>`;
        return;
      }

      const html = `
        <div class="wj-wrapTable">
          <div class="wj-scroll">
            <table class="wj">
              <thead>
                <tr>
                  <th class="wj-col-sector">Зона</th>
                  <th class="wj-col-team">Команда</th>
                  ${[1, 2, 3, 4].map(n => `<th class="wj-col-w">W${n}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${teams.map(t => {
                  const cells = [1, 2, 3, 4].map(n => {
                    const doc = State.weighCache?.[t.teamId]?.[n] || null;
                    return `<td class="wj-col-w">${this.cellSummary(doc)}</td>`;
                  }).join("");

                  const activeDoc = State.weighCache?.[t.teamId]?.[State.viewW] || null;

                  return `
                    <tr>
                      <td class="wj-col-sector"><span class="wj-pill">${Utils.esc(State.zone)}${Utils.esc(t.sector)}</span></td>
                      <td class="wj-col-team">
                        <div class="wj-teamName">${Utils.esc(t.teamName)}</div>
                        ${this.editorCell(t, activeDoc)}
                      </td>
                      ${cells}
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      teamsBox.innerHTML = html;
      this.attachEditorHandlers();
    },

    attachEditorHandlers() {
      const { teamsBox } = State.elements;
      
      teamsBox.querySelectorAll(".wj-editor").forEach(ed => {
        const teamId = ed.getAttribute("data-team");
        const hint = ed.querySelector(".wj-hint");
        const fishes = ed.querySelector(".wj-fishes");

        const refreshDel = () => {
          const dels = ed.querySelectorAll(".wj-del");
          if (dels.length === 1) dels[0].disabled = true;
          else dels.forEach(b => b.disabled = false);
        };

        // Enter у quick-полі
        ed.querySelector(".wj-quick")?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            ed.querySelector(".wj-add")?.click();
          }
        });

        // Додати рибу
        ed.querySelector(".wj-add")?.addEventListener("click", () => {
          const quick = ed.querySelector(".wj-quick");
          let v = quick ? String(quick.value || "").trim() : "";
          
          if (!v) {
            const lastInp = fishes?.querySelector(".wj-fish:last-child .wj-inp");
            v = lastInp ? String(lastInp.value || "").trim() : "";
          }

          const wrap = document.createElement("div");
          wrap.className = "wj-fish";
          wrap.innerHTML = `
            <input class="inp wj-inp" inputmode="decimal" placeholder="вага" value="${Utils.esc(v)}">
            <button class="wj-miniBtn wj-del" type="button" title="Видалити">×</button>
          `;
          
          if (fishes) fishes.appendChild(wrap);
          if (quick) quick.value = "";
          if (hint) hint.textContent = "";
          refreshDel();

          const newInp = wrap.querySelector(".wj-inp");
          setTimeout(() => { newInp?.focus(); newInp?.select(); }, 0);
        });

        // Видалити рибу
        ed.addEventListener("click", (e) => {
          if (e.target?.classList?.contains("wj-del")) {
            const row = e.target.closest(".wj-fish");
            if (row) {
              row.remove();
              if (hint) hint.textContent = "";
              refreshDel();
            }
          }
        });

        // Зберегти
        ed.querySelector(".wj-save")?.addEventListener("click", async () => {
          try {
            if (hint) {
              hint.textContent = "Збереження…";
              hint.className = "muted wj-hint";
            }

            const team = State.teamsMap[teamId];
            if (!team) throw new Error("Команда не знайдена.");

            const raw = Array.from(ed.querySelectorAll(".wj-inp")).map(i => i.value);
            const calc = await WeighingManager.save(team, State.viewW, raw);

            if (hint) {
              hint.textContent = `✅ OK: 🐟 ${calc.fishCount} • кг ${calc.totalWeightKg.toFixed(2)} • Big ${calc.bigFishKg.toFixed(2)}`;
              hint.className = "muted wj-hint ok";
            }

            // Перезавантажити дані та оновити таблицю
            await WeighingManager.preload(State.teams);
            this.render();
            UIManager.setWMsg("✅ Збережено у Firestore.", true);

          } catch (err) {
            console.error(err);
            if (hint) {
              hint.textContent = "❌ " + (err?.message || err);
              hint.className = "muted wj-hint err";
            }
            UIManager.setWMsg("❌ Помилка збереження.", false);
          }
        });

        refreshDel();
      });
    }
  };

  // ==================== МЕНЕДЖЕР ЗОНИ ====================
  const ZoneManager = {
    async open() {
      UIManager.renderBindInfo();

      const isAdmin = State.user && !State.user.isAnonymous;

      // Перевірка доступу
      if (isAdmin) {
        if (!State.key) {
          throw new Error("Адмін: не вибрано етап (key порожній). Відкрий зважування з етапу.");
        }
        // Адмін ігнорує перевірку токена
      } else {
        if (!State.zone || !State.token || !State.key) {
          throw new Error("Нема параметрів QR (zone/token/key).");
        }
        await AuthManager.verifyToken();
      }

      // Завантаження команд
      State.teams = await TeamManager.loadForZone();
      State.teamsMap = TeamManager.buildMap(State.teams);

      // Налаштування вагувань
      State.currentW = CONFIG.DEFAULT_MAX_W;
      if (State.viewW > State.currentW) State.viewW = State.currentW;
      UIManager.updateWButtons();

      // Оновлення UI
      const { teamsCountEl, statusEl, weighCard, netBadge } = State.elements;
      if (teamsCountEl) teamsCountEl.textContent = `Команд: ${State.teams.length}`;
      if (statusEl) statusEl.textContent = State.teams.length ? "✅ Зона відкрита." : "⚠️ Команди не знайдені (перевір жереб).";
      if (weighCard) weighCard.style.display = "block";
      if (netBadge) netBadge.style.display = "inline-flex";

      // Завантаження та рендер
      await WeighingManager.preload(State.teams);
      TableManager.render();
      UIManager.setWMsg(`Активна колонка: W${State.viewW}.`, true);
    }
  };

  // ==================== ПАРСЕР ПАРАМЕТРІВ ====================
  const ParamParser = {
    read() {
      const p = new URLSearchParams(location.search);
      
      State.zone = Utils.norm((p.get("zone") || "").toUpperCase());
      State.token = Utils.norm(p.get("token") || "");
      State.key = Utils.norm(p.get("key") || "");
      
      const w = Utils.norm((p.get("w") || "").toUpperCase());
      State.viewW = (w === "W2") ? 2 : (w === "W3") ? 3 : (w === "W4") ? 4 : 1;

      if (State.key.includes("||")) {
        const parts = State.key.split("||");
        State.compId = Utils.norm(parts[0] || "");
        State.stageId = Utils.norm(parts.slice(1).join("||") || "");
      }
    }
  };

  // ==================== ІНІЦІАЛІЗАЦІЯ ====================
  async function init() {
    try {
      // Ініціалізація UI
      UIManager.init();
      
      // Чекаємо Firebase та авторизацію
      State.user = await AuthManager.init();
      UIManager.updateOnlineStatus();
      
      // Читаємо параметри URL
      ParamParser.read();
      UIManager.renderBindInfo();

      // Визначаємо режим (Адмін чи Суддя)
      const isAdmin = State.user && !State.user.isAnonymous;
      const { btnOpen, authPill } = State.elements;

      if (isAdmin) {
        // 👑 РЕЖИМ АДМІНА
        if (authPill) authPill.textContent = "auth: ✅ адмін";
        UIManager.setMsg("👑 Вітаємо, Адмін. Натисніть «Увійти» для керування зоною.", true);
        
        if (btnOpen) {
          btnOpen.style.display = "inline-flex";
          btnOpen.onclick = async () => {
            try {
              btnOpen.disabled = true;
              UIManager.setMsg("Завантаження даних...", true);
              await ZoneManager.open();
              UIManager.setMsg("Доступ надано (Admin Mode)", true);
            } catch (err) {
              UIManager.setMsg("❌ " + err.message, false);
            } finally {
              btnOpen.disabled = false;
            }
          };
        }
      } else {
        // 👨‍⚖️ РЕЖИМ СУДДІ (QR)
        if (btnOpen) btnOpen.style.display = "none";
        
        try {
          UIManager.setMsg("Авторизація судді...", true);
          State.user = await AuthManager.ensureAnonAuth();
          if (authPill) authPill.textContent = "auth: ✅ суддя (QR)";
          
          UIManager.setMsg("Перевірка QR-токена...", true);
          await AuthManager.verifyToken();
          
          await ZoneManager.open();
          UIManager.setMsg("Зона завантажена", true);
        } catch (err) {
          UIManager.setMsg("❌ Доступ заборонено: " + err.message, false);
          if (authPill) authPill.textContent = "auth: ❌";
        }
      }

    } catch (err) {
      console.error(err);
      const { statusEl, weighCard, authPill } = State.elements;
      if (statusEl) statusEl.textContent = "❌ " + (err?.message || err);
      UIManager.setMsg("❌ " + (err?.message || err), false);
      if (weighCard) weighCard.style.display = "none";
      if (authPill) authPill.textContent = "auth: ❌";
    }
  }

  // Запуск
  init();

})();
