// assets/js/cabinet.js

document.addEventListener('DOMContentLoaded', () => {
  const guestView = document.getElementById('guestView');
  const userView  = document.getElementById('userView');
  const errorView = document.getElementById('errorView');

  const teamNameEl    = document.getElementById('teamNameValue');
  const captainNameEl = document.getElementById('captainNameValue');
  const phoneEl       = document.getElementById('phoneValue');
  const emailEl       = document.getElementById('emailValue');
  const roleEl        = document.getElementById('roleValue');
  const appsBody      = document.getElementById('applicationsBody');

  if (!window.auth || !window.db) {
    console.error('Firebase не ініціалізований');
    guestView.style.display = 'block';
    userView.style.display  = 'none';
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Немає входу — показуємо гостьовий блок
      guestView.style.display = 'block';
      userView.style.display  = 'none';
      errorView.style.display = 'none';
      return;
    }

    // Є користувач — показуємо кабінет
    guestView.style.display = 'none';
    userView.style.display  = 'grid';
    errorView.style.display = 'none';

    emailEl.textContent = user.email || '—';

    try {
      // 1. Тягнемо профіль учасника
      const participantSnap = await db.collection('participants').doc(user.uid).get();

      if (!participantSnap.exists) {
        teamNameEl.textContent    = 'Профіль ще не заповнено';
        captainNameEl.textContent = '—';
        phoneEl.textContent       = '—';
        roleEl.textContent        = '—';
        appsBody.innerHTML = `
          <tr><td colspan="4">Немає заявок або профіль ще не завершено.</td></tr>
        `;
        return;
      }

      const p = participantSnap.data();
      const teamId = p.teamId || null;

      roleEl.textContent = p.role === 'captain'
        ? 'Капітан'
        : (p.role === 'member' ? 'Учасник' : '—');

      phoneEl.textContent = p.phone || '—';

      // 2. Тягнемо команду
      if (teamId) {
        const teamSnap = await db.collection('teams').doc(teamId).get();
        if (teamSnap.exists) {
          const t = teamSnap.data();
          teamNameEl.textContent    = t.name || '—';
          captainNameEl.textContent = t.captainName || p.fullName || '—';
        } else {
          teamNameEl.textContent    = 'Команда не знайдена';
          captainNameEl.textContent = p.fullName || '—';
        }
      } else {
        teamNameEl.textContent    = 'Без команди';
        captainNameEl.textContent = p.fullName || '—';
      }

      // 3. Заявки на етапи
      if (teamId) {
        const appsSnap = await db.collection('applications')
          .where('teamId', '==', teamId)
          .orderBy('createdAt', 'asc')
          .get();

        if (appsSnap.empty) {
          appsBody.innerHTML = `
            <tr><td colspan="4">Поки що немає поданих заявок.</td></tr>
          `;
        } else {
          let rows = '';
          appsSnap.forEach(doc => {
            const a = doc.data();
            const status = a.status || 'в обробці';
            const pay    = a.paymentStatus || 'очікує';
            const sector = a.sector || '—';
            const zone   = a.zone ? `Зона ${a.zone}` : '—';

            const statusClass = status === 'підтверджено'
              ? 'status-pill status-pill--ok'
              : 'status-pill status-pill--pending';

            rows += `
              <tr>
                <td>${a.stageName || 'Етап'}</td>
                <td>
                  <span class="${statusClass}">${status}</span>
                </td>
                <td>${pay}</td>
                <td>${sector} / ${zone}</td>
              </tr>
            `;
          });
          appsBody.innerHTML = rows;
        }
      } else {
        appsBody.innerHTML = `
          <tr><td colspan="4">Спочатку приєднайтесь до команди.</td></tr>
        `;
      }

    } catch (err) {
      console.error('Помилка кабінету:', err);
      errorView.style.display = 'block';
    }
  });
});
