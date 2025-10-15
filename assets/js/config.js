/* STOLAR CARP helpers */
(function(){
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if (burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));

  // === Inject favicon & app icon for all pages ===
  (function injectIcons(){
    const head = document.head;
    function addLink(rel, href, type){
      if (!head.querySelector(`link[rel="${rel}"]`)) {
        const l = document.createElement('link');
        l.rel = rel; l.href = href; if (type) l.type = type;
        head.appendChild(l);
      }
    }
    function addMeta(name, content){
      let m = head.querySelector(`meta[name="${name}"]`);
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); head.appendChild(m); }
      m.setAttribute('content', content);
    }
    addLink('icon', 'assets/favicon.png', 'image/png');
    addLink('apple-touch-icon', 'assets/favicon.png');
    addMeta('theme-color', '#1a1a1a');
  })();

  /* ===== Helpers ===== */
  function parseCSV(text){
    const lines = String(text||'').replace(/\r/g,'').split('\n').filter(l=>l.trim().length);
    return lines.map(line=>{
      const sep = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
      return line.split(sep).map(c => c.trim().replace(/^"(.*)"$/,'$1'));
    });
  }
  function toNum(x){
    const v = (x||'').toString().replace(',', '.').replace(/\s+/g,'');
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  const kg = v => toNum(v).toFixed(3);

  /* ===== LIVE PAGE ===== */
  (function(){
    const paste = document.getElementById('csv-paste');
    const renderBtn = document.getElementById('render-csv');
    const liveBody = document.getElementById('live-body');
    const csvUrlInput = document.getElementById('csv-url');
    const fetchBtn = document.getElementById('fetch-csv');
    const autoToggle = document.getElementById('auto-refresh');
    const statusText = document.getElementById('statusText');
    const statusDot  = document.getElementById('statusDot');
    let autoTimer = null;

    function setStatus(type, text){
      if (!statusText || !statusDot) return;
      statusDot.classList.remove('ok','err');
      if (type==='ok') statusDot.classList.add('ok');
      if (type==='err') statusDot.classList.add('err');
      statusText.textContent = text;
    }

    function renderLiveTable(rows){
      if(!liveBody) return;
      liveBody.innerHTML = rows.map(r => `<tr>${r.map(c => `<td>${c||''}</td>`).join('')}</tr>`).join('');
    }

    async function fetchCSV(url){
      const res = await fetch(url, {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      return parseCSV(await res.text());
    }

    async function tick(){
      const url = (csvUrlInput?.value||'').trim();
      if (!url) return;
      try{
        setStatus('', 'Завантаження…');
        const rows = await fetchCSV(url);
        renderLiveTable(rows);
        setStatus('ok', 'Оновлено: ' + new Date().toLocaleTimeString('uk-UA'));
      }catch(e){
        setStatus('err', 'Помилка: ' + e.message);
      }
    }

    if (renderBtn && paste && liveBody){
      renderBtn.addEventListener('click', ()=>{
        try{
          const rows = parseCSV(paste.value);
          renderLiveTable(rows);
          setStatus('ok', 'Оновлено з буфера');
        }catch(e){
          setStatus('err', 'Помилка CSV: ' + e.message);
        }
      });
    }
    if (fetchBtn && csvUrlInput){
      fetchBtn.addEventListener('click', async ()=>{
        const url = csvUrlInput.value.trim();
        if (!url) return alert('Вкажіть посилання на CSV');
        localStorage.setItem('live_url', url);
        await tick();
      });
    }
    if (autoToggle && csvUrlInput){
      autoToggle.addEventListener('change', async (e)=>{
        const on = e.target.checked;
        localStorage.setItem('live_auto', on ? '1' : '0');
        if (autoTimer){ clearInterval(autoTimer); autoTimer = null; }
        if (on){
          await tick();
          autoTimer = setInterval(tick, 60000);
        }
      });
      // init saved
      const savedUrl  = localStorage.getItem('live_url') || '';
      const savedAuto = localStorage.getItem('live_auto') === '1';
      if (csvUrlInput) csvUrlInput.value = savedUrl;
      if (autoToggle)  autoToggle.checked = savedAuto;
      if (savedUrl && savedAuto) { tick(); autoTimer = setInterval(tick, 60000); }
    }
  })();

  /* ===== RATING + AWARDS ===== */
  (function(){
    const rateCSV  = document.getElementById('rating-csv');
    const calcBtn  = document.getElementById('calc-awards');
    const topLake  = document.getElementById('top-lake');
    const zonesWrap= document.getElementById('zones-awards');

    if (!calcBtn || !rateCSV) return;

    function groupByZone(rows){
      const byZ = {A:[],B:[],C:[]};
      rows.forEach(r=>{
        const team = r[0]||'';
        const zone = (r[1]||'').toUpperCase();
        const weight = toNum(r[4]);
        if (team && ['A','B','C'].includes(zone)) byZ[zone].push({team, weight});
      });
      ['A','B','C'].forEach(z => byZ[z].sort((a,b)=>b.weight-a.weight));
      return byZ;
    }

    function renderTopLake(byZ){
      if (!topLake) return;
      const winners = ['A','B','C'].map(z => byZ[z][0]).filter(Boolean);
      winners.sort((a,b)=>b.weight-a.weight);
      topLake.innerHTML = winners.length
        ? winners.map((w,i)=>`<tr><td>${i+1}</td><td>${w.team}</td><td>${kg(w.weight)}</td></tr>`).join('')
        : `<tr><td colspan="3">Немає даних</td></tr>`;
    }

    function renderZonesAwards(byZ){
      if (!zonesWrap) return;
      zonesWrap.innerHTML = ['A','B','C'].map(z=>{
        const arr = byZ[z];
        const awards = [arr[1], arr[2], arr[3]].filter(Boolean);
        const rows = awards.length
          ? awards.map((w,i)=>`<tr><td>${i+1}</td><td>${w.team}</td><td>${kg(w.weight)}</td></tr>`).join('')
          : '<tr><td colspan="3">Недостатньо даних</td></tr>';
        return `
          <div class="card">
            <h3>Зона ${z} — нагородження (2→1, 3→2, 4→3)</h3>
            <table class="table">
              <thead><tr><th>Місце</th><th>Команда</th><th>Вага, кг</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }).join('');
    }

    calcBtn.addEventListener('click', ()=>{
      try{
        const rows = parseCSV(rateCSV.value);
        const body = rows[0] && /команда/i.test(rows[0][0]||'') ? rows.slice(1) : rows;
        const byZ = groupByZone(body);
        renderTopLake(byZ);
        renderZonesAwards(byZ);
        const ready = document.getElementById('awards-ready');
        if (ready) ready.style.display = 'block';
      }catch(e){
        alert('Помилка CSV: ' + e.message);
      }
    });
  })();

  /* ===== OPTIONAL localstore registration (opt-in) =====
     Працює лише якщо форма має data-localstore,
     і підхоплює #register-form або #regForm.
  */
  (function(){
    const form = document.getElementById('register-form') || document.getElementById('regForm');
    if (!form || !form.hasAttribute('data-localstore')) return;

    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if(!data.team || !data.captain || !data.phone){
        alert('Будь ласка, заповніть мінімальні поля: Команда, Капітан, Телефон.');
        return;
      }
      const key = 'sc_registrations';
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      prev.push({...data, created_at: new Date().toISOString()});
      localStorage.setItem(key, JSON.stringify(prev));
      location.href = 'thanks.html';
    });
  })();
})();

/* ====== AUTO REGISTRATION WINDOWS (events/turnir-2026.html) ====== */
(function(){
  const stagesWrap = document.getElementById('stages');
  if(!stagesWrap) return;

  const DAY = 86400000;
  const toDate = s => s ? new Date(s + 'T00:00:00') : null;

  stagesWrap.querySelectorAll('.card[data-id][data-start]').forEach(card=>{
    const id = card.dataset.id;
    const s  = toDate(card.dataset.start);
    const e  = toDate(card.dataset.end || card.dataset.start);
    if (!id || !s){ console.warn('Stage card пропущена (нема id/start):', card); return; }

    // дозволяємо перевизначити в HTML
    const open  = card.dataset.regOpen  ? toDate(card.dataset.regOpen)  : new Date(s.getTime() - 14*DAY);
    const close = card.dataset.regClose ? toDate(card.dataset.regClose) : new Date(s.getTime() - 6*3600*1000);

    // кнопка «Реєстрація»
    let regBtn = card.querySelector('[data-reg]');
    if(!regBtn){
      const btns = card.querySelector('.btns') || card.appendChild(Object.assign(document.createElement('div'), {className:'btns'}));
      regBtn = document.createElement('a');
      regBtn.className = 'btn btn--primary';
      regBtn.setAttribute('data-reg','');
      regBtn.href = `register.html?stage=${encodeURIComponent(id)}`;
      btns.prepend(regBtn);
    }

    const now = new Date();
    if (now < open){
      regBtn.textContent = 'Реєстрація скоро';
      regBtn.title = `Відкриється: ${open.toLocaleDateString('uk-UA')}`;
      regBtn.setAttribute('aria-disabled','true'); regBtn.setAttribute('tabindex','-1');
      regBtn.style.opacity = '.6'; regBtn.style.pointerEvents = 'none';
    } else if (now > close){
      regBtn.textContent = 'Реєстрацію закрито';
      regBtn.setAttribute('aria-disabled','true'); regBtn.setAttribute('tabindex','-1');
      regBtn.style.opacity = '.6'; regBtn.style.pointerEvents = 'none';
    } else {
      regBtn.textContent = 'Реєстрація';
      regBtn.removeAttribute('aria-disabled'); regBtn.removeAttribute('tabindex');
      regBtn.style.opacity = ''; regBtn.style.pointerEvents = '';
    }
  });
})();
