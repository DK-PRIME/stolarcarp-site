// assets/js/my_participation.js
// STOLAR CARP • Моя участь
// ✅ Показує тільки поточні та майбутні змагання
// ✅ Завершені етапи автоматично зникають
// ✅ Нічого не видаляє з Firestore
// ✅ Якщо дати немає — запис не ховається
// ✅ Підтримка дат у competition.events та основному документі competition

(function () {
  "use strict";

  const box = document.getElementById("myCompetitions");
  if (!box) return;

  let unsub = null;

  async function waitFirebase(maxMs = 12000) {
    const t0 = Date.now();

    while (Date.now() - t0 < maxMs) {
      if (window.scAuth && window.scDb && window.firebase) return;
      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error("Firebase not ready (scAuth/scDb)");
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMuted(text) {
    box.innerHTML = `<div class="cabinet-small-muted">${esc(text)}</div>`;
  }

  function showError(text) {
    box.innerHTML = `
      <div class="cabinet-small-muted" style="color:#ef4444;">
        ${esc(text)}
      </div>
    `;
  }

  function norm(v) {
    return String(v ?? "").trim();
  }

  function isPaidStatus(status) {
    const s = norm(status).toLowerCase();
    return s === "confirmed" || s === "paid";
  }

  function toMillis(v) {
    if (!v) return 0;

    try {
      if (typeof v.toMillis === "function") {
        return v.toMillis();
      }

      if (typeof v.toDate === "function") {
        return v.toDate().getTime();
      }

      if (v instanceof Date) {
        return v.getTime();
      }

      if (typeof v === "number") {
        return Number.isFinite(v) ? v : 0;
      }

      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();

    } catch {
      return 0;
    }
  }

  function dateValueToMillis(v, endOfDay = false) {
    if (!v) return 0;

    try {
      // Firestore Timestamp
      if (typeof v.toDate === "function") {
        const d = v.toDate();

        if (endOfDay) {
          d.setHours(23, 59, 59, 999);
        }

        return d.getTime();
      }

      // Date
      if (v instanceof Date) {
        const d = new Date(v.getTime());

        if (endOfDay) {
          d.setHours(23, 59, 59, 999);
        }

        return d.getTime();
      }

      // Number timestamp
      if (typeof v === "number") {
        const d = new Date(v);

        if (Number.isNaN(d.getTime())) return 0;

        if (endOfDay) {
          d.setHours(23, 59, 59, 999);
        }

        return d.getTime();
      }

      if (typeof v === "string") {
        const s = v.trim();

        if (!s) return 0;

        // YYYY-MM-DD
        const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (isoDate) {
          const year = Number(isoDate[1]);
          const month = Number(isoDate[2]) - 1;
          const day = Number(isoDate[3]);

          const d = endOfDay
            ? new Date(year, month, day, 23, 59, 59, 999)
            : new Date(year, month, day, 0, 0, 0, 0);

          return d.getTime();
        }

        // DD.MM.YYYY
        const ukDate = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

        if (ukDate) {
          const day = Number(ukDate[1]);
          const month = Number(ukDate[2]) - 1;
          const year = Number(ukDate[3]);

          const d = endOfDay
            ? new Date(year, month, day, 23, 59, 59, 999)
            : new Date(year, month, day, 0, 0, 0, 0);

          return d.getTime();
        }

        const parsed = new Date(s);

        if (!Number.isNaN(parsed.getTime())) {
          if (endOfDay) {
            parsed.setHours(23, 59, 59, 999);
          }

          return parsed.getTime();
        }
      }

    } catch (e) {
      console.warn("[my_participation] Date parse error:", v, e);
    }

    return 0;
  }

  function formatDate(ts) {
    if (!ts) return "—";

    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);

      if (Number.isNaN(d.getTime())) return "—";

      return d.toLocaleDateString("uk-UA");

    } catch {
      return "—";
    }
  }

  // =========================================================
  // COMPETITION META
  // =========================================================

  const metaCache = Object.create(null);

  function readStartDate(obj) {
    if (!obj) return null;

    return (
      obj.startDate ??
      obj.dateStart ??
      obj.startAt ??
      obj.dateFrom ??
      obj.fromDate ??
      obj.from ??
      obj.start ??
      obj.date ??
      null
    );
  }

  function readEndDate(obj) {
    if (!obj) return null;

    return (
      obj.endDate ??
      obj.dateEnd ??
      obj.endAt ??
      obj.dateTo ??
      obj.toDate ??
      obj.to ??
      obj.end ??
      obj.finishDate ??
      obj.finishAt ??
      obj.date ??
      null
    );
  }

  async function getCompetitionMeta(compId, stageId) {
    const st = norm(stageId) || "main";
    const key = `${compId}||${st}`;

    if (metaCache[key]) {
      return metaCache[key];
    }

    const db = window.scDb;

    let compTitle = "";
    let stageTitle = "";
    let startMillis = 0;
    let endMillis = 0;

    try {
      const cSnap = await db
        .collection("competitions")
        .doc(compId)
        .get();

      if (cSnap.exists) {
        const c = cSnap.data() || {};

        compTitle = norm(
          c.name ||
          c.title ||
          c.competitionName ||
          ""
        );

        const events = Array.isArray(c.events)
          ? c.events
          : [];

        const ev = events.find((e) => {
          const evId = norm(
            e?.key ||
            e?.stageId ||
            e?.id
          );

          return evId === st;
        });

        if (ev) {
          stageTitle = norm(
            ev.title ||
            ev.name ||
            ev.label ||
            ""
          );

          const startValue =
            readStartDate(ev) ||
            readStartDate(c);

          const endValue =
            readEndDate(ev) ||
            readEndDate(c) ||
            startValue;

          startMillis = dateValueToMillis(
            startValue,
            false
          );

          endMillis = dateValueToMillis(
            endValue,
            true
          );

        } else {
          const startValue = readStartDate(c);

          const endValue =
            readEndDate(c) ||
            startValue;

          startMillis = dateValueToMillis(
            startValue,
            false
          );

          endMillis = dateValueToMillis(
            endValue,
            true
          );

          if (st !== "main") {
            stageTitle = st;
          }
        }
      }

    } catch (e) {
      console.warn(
        "[my_participation] Competition meta read error:",
        compId,
        st,
        e
      );
    }

    const res = {
      compTitle,
      stageTitle,
      startMillis,
      endMillis
    };

    metaCache[key] = res;

    return res;
  }

  // =========================================================
  // TITLE
  // =========================================================

  function niceTitle(it) {
    let stage = norm(it.stageTitle);

    if (
      stage &&
      /^stage[-_ ]?\d+$/i.test(stage)
    ) {
      stage = "";
    }

    if (
      !stage &&
      it.stageId &&
      it.stageId !== "main"
    ) {
      const m = String(it.stageId).match(/\d+/);

      if (m) {
        stage = `Етап ${m[0]}`;
      }
    }

    return stage
      ? esc(stage)
      : esc(it.compTitle || "Змагання");
  }

  // =========================================================
  // FILTER
  // =========================================================

  function isCurrentOrFutureCompetition(it) {
    const now = Date.now();

    // Якщо дата завершення відома —
    // залишаємо тільки поточні та майбутні.
    if (it.endMillis > 0) {
      return it.endMillis >= now;
    }

    // Якщо є тільки дата початку —
    // майбутнє залишаємо.
    if (it.startMillis > 0) {
      return it.startMillis >= now;
    }

    // Якщо дати взагалі немає —
    // НЕ ховаємо запис.
    return true;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function renderItems(items) {
    if (!items || items.length === 0) {
      showMuted("Немає майбутніх змагань");
      return;
    }

    let html = "";

    items.forEach((it) => {
      const paid = isPaidStatus(it.status);
      const dot = paid
        ? "#22c55e"
        : "#ef4444";

      html += `
        <div
          class="stat-card"
          style="margin-bottom:10px;"
        >
          <div
            style="
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            "
          >
            <div style="min-width:0;">

              <div
                class="stat-label"
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                "
              >
                <span
                  style="
                    display:inline-block;
                    width:10px;
                    height:10px;
                    border-radius:999px;
                    background:${dot};
                    box-shadow:0 0 10px rgba(0,0,0,.25);
                  "
                ></span>

                <span
                  style="
                    min-width:0;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                  "
                >
                  ${niceTitle(it)}
                </span>
              </div>

              <div
                class="cabinet-small-muted"
                style="margin-top:6px;"
              >
                Команда:
                <strong style="color:#e5e7eb;">
                  ${esc(it.teamName || "—")}
                </strong>

                ${
                  it.updatedAt
                    ? ` · Оновлено: ${esc(formatDate(it.updatedAt))}`
                    : ""
                }
              </div>

              <div
                class="cabinet-small-muted"
                style="margin-top:6px;"
              >
                Статус:
                <strong
                  style="
                    color:${paid ? "#22c55e" : "#ef4444"};
                  "
                >
                  ${paid ? "Оплачено" : "Очікується"}
                </strong>
              </div>

            </div>

            <div style="flex-shrink:0;">
              <a
                class="btn btn--primary"
                href="participation.html?comp=${encodeURIComponent(
                  it.competitionId
                )}&stage=${encodeURIComponent(
                  it.stageId || "main"
                )}"
              >
                Відкрити
              </a>
            </div>

          </div>
        </div>
      `;
    });

    box.innerHTML = html;
  }

  // =========================================================
  // SUBSCRIPTION
  // =========================================================

  async function subscribeParticipation(user) {
    const db = window.scDb;

    const uSnap = await db
      .collection("users")
      .doc(user.uid)
      .get();

    if (!uSnap.exists) {
      showError("Немає профілю користувача");
      return;
    }

    const u = uSnap.data() || {};
    const teamId = norm(u.teamId);

    if (!teamId) {
      showMuted("Ви ще не в команді");
      return;
    }

    if (typeof unsub === "function") {
      unsub();
      unsub = null;
    }

    showMuted("Завантаження участі…");

    unsub = db
      .collection("public_participants")
      .where("teamId", "==", teamId)
      .where("entryType", "==", "team")
      .onSnapshot(
        async (qs) => {
          const rows = [];

          qs.forEach((d) => {
            rows.push({
              id: d.id,
              ...(d.data() || {})
            });
          });

          if (!rows.length) {
            showMuted(
              "Команда ще не подавала заявки на змагання"
            );
            return;
          }

          // =================================================
          // Прибираємо дублікати competition + stage
          // =================================================

          const map = Object.create(null);

          rows.forEach((r) => {
            const compId = norm(r.competitionId);
            const stageId =
              norm(r.stageId) || "main";

            if (!compId) return;

            const k =
              `${compId}||${stageId}`;

            if (!map[k]) {
              map[k] = r;
              return;
            }

            const current = map[k];

            const currentPaid =
              isPaidStatus(current.status);

            const newPaid =
              isPaidStatus(r.status);

            // Якщо один із дубльованих записів оплачений —
            // беремо оплачений.
            if (!currentPaid && newPaid) {
              map[k] = r;
              return;
            }

            // Якщо статус однаковий —
            // беремо новіший запис.
            if (currentPaid === newPaid) {
              const currentTime = toMillis(
                current.updatedAt ||
                current.confirmedAt ||
                current.createdAt
              );

              const newTime = toMillis(
                r.updatedAt ||
                r.confirmedAt ||
                r.createdAt
              );

              if (newTime > currentTime) {
                map[k] = r;
              }
            }
          });

          const uniq =
            Object.values(map);

          // =================================================
          // Завантажуємо назви + дати
          // =================================================

          for (const it of uniq) {
            const compId =
              norm(it.competitionId);

            const stageId =
              norm(it.stageId) || "main";

            const meta =
              await getCompetitionMeta(
                compId,
                stageId
              );

            it.compTitle =
              meta.compTitle ||
              it.competitionTitle ||
              it.competitionName ||
              "Змагання";

            it.stageTitle =
              meta.stageTitle ||
              it.stageName ||
              "";

            it.startMillis =
              meta.startMillis || 0;

            it.endMillis =
              meta.endMillis || 0;

            it.teamName =
              it.teamName ||
              u.teamName ||
              "";

            it.updatedAt =
              it.updatedAt ||
              it.confirmedAt ||
              it.createdAt ||
              null;

            it.stageId = stageId;
          }

          // =================================================
          // ✅ ГОЛОВНЕ:
          // залишаємо тільки поточні та майбутні змагання
          // =================================================

          const activeItems =
            uniq.filter(
              isCurrentOrFutureCompetition
            );

          if (!activeItems.length) {
            showMuted(
              "Немає майбутніх змагань"
            );
            return;
          }

          // =================================================
          // Сортування
          // Найближчі змагання першими
          // =================================================

          activeItems.sort((a, b) => {
            const aStart =
              a.startMillis ||
              Number.MAX_SAFE_INTEGER;

            const bStart =
              b.startMillis ||
              Number.MAX_SAFE_INTEGER;

            if (aStart !== bStart) {
              return aStart - bStart;
            }

            // Якщо дата однакова:
            // оплачені вище
            const ap =
              isPaidStatus(a.status);

            const bp =
              isPaidStatus(b.status);

            if (ap !== bp) {
              return ap ? -1 : 1;
            }

            // Потім новіші
            return (
              toMillis(b.updatedAt) -
              toMillis(a.updatedAt)
            );
          });

          renderItems(activeItems);
        },

        (err) => {
          console.warn(err);

          showError(
            "Не вдалося завантажити участь. Перевір правила доступу Firestore."
          );
        }
      );
  }

  // =========================================================
  // INIT
  // =========================================================

  (async () => {
    try {
      await waitFirebase();

      showMuted(
        "Завантаження участі…"
      );

      window.scAuth.onAuthStateChanged(
        async (user) => {

          if (typeof unsub === "function") {
            unsub();
            unsub = null;
          }

          if (!user) {
            showMuted(
              "Увійдіть у акаунт"
            );
            return;
          }

          try {
            await subscribeParticipation(user);

          } catch (e) {
            console.error(e);

            showError(
              "Помилка завантаження участі"
            );
          }
        }
      );

    } catch (e) {
      console.error(e);

      showError(
        "Помилка завантаження участі"
      );
    }
  })();

})();
