/* STOLAR CARP helpers */
(function(){
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if(burger && nav){ burger.addEventListener('click', () => nav.classList.toggle('open')); }
  // === Inject favicon & app icon for all pages ===
  (function injectIcons(){
    const head = document.head;

    function addLink(rel, href, type){
      if (![...head.querySelectorAll(`link[rel="${rel}"]`)].length) {
        const l = document.createElement('link');
        l.rel = rel;
        l.href = href;
        if (type) l.type = type;
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

  function parseCSV(text){
    const rows = text.trim().split(/\r?\n/).map(r => r.split(/;|,/).map(c => c.trim()));
    return rows.filter(r => r.length && r.join('').length);
  }
  function toNum(x){
    const v = (x||'').toString().replace(',', '.').replace(/\s+/g,'');
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // LIVE PAGE
  const paste = document.getElementById('csv-paste');
  const renderBtn = document.getElementById('render-csv');
  const liveBody = document.getElementById('live-body');
  const csvUrlInput = document.getElementById('csv-url');
  const fetchBtn = document.getElementById('fetch-csv');
  const autoToggle = document.getElementById('auto-refresh');
  let autoTimer = null;

  function renderLiveTable(rows){
    if(!liveBody) return;
    liveBody.innerHTML = rows.map(r => `<tr>${r.map(c => `<td>${c||''}</td>`).join('')}</tr>`).join('');
  }

  async function fetchCSV(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('Fetch error: '+res.status);
    const text = await res.text();
    return parseCSV(text);
  }

  if(renderBtn && paste && liveBody){
    renderBtn.addEventListener('click', () => {
      try{
        const rows = parseCSV(paste.value);
        renderLiveTable(rows);
      }catch(e){ alert('Помилка CSV: ' + e.message); }
    });
  }
  if(fetchBtn && csvUrlInput){
    fetchBtn.addEventListener('click', async () => {
      try{
        const url = csvUrlInput.value.trim();
        if(!url) return alert('Вкажіть посилання на CSV');
        const rows = await fetchCSV(url);
        renderLiveTable(rows);
      }catch(e){ alert('Не вдалося отримати CSV: ' + e.message); }
    });
  }
  if(autoToggle && csvUrlInput){
    autoToggle.addEventListener('change', async (e) => {
      if(e.target.checked){
        const tick = async () => {
          try{
            if(!csvUrlInput.value.trim()) return;
            const rows = await fetchCSV(csvUrlInput.value.trim());
            renderLiveTable(rows);
          }catch(_){ /* silent */ }
        };
        await tick();
        autoTimer = setInterval(tick, 60000);
      }else{
        if(autoTimer) clearInterval(autoTimer);
        autoTimer = null;
      }
    });
  }

  // RATING + AWARDS
  const rateCSV = document.getElementById('rating-csv');
  const calcBtn = document.getElementById('calc-awards');
  const topLake = document.getElementById('top-lake');
  const zonesWrap = document.getElementById('zones-awards');

  function groupByZone(rows){
    const byZ = {A:[],B:[],C:[]};
    rows.forEach(r => {
      const team = r[0]||'';
      const zone = (r[1]||'').toUpperCase();
      const weight = toNum(r[4]);
      if(['A','B','C'].includes(zone)){
        byZ[zone].push({team, weight});
      }
    });
    for(const z of ['A','B','C']){
      byZ[z].sort((a,b) => b.weight - a.weight);
    }
    return byZ;
  }

  function renderTopLake(byZ){
    if(!topLake) return;
    const winners = ['A','B','C'].map(z => byZ[z][0]).filter(Boolean);
    winners.sort((a,b) => b.weight - a.weight);
    topLake.innerHTML = winners.map((w,i) => `
      <tr><td>${i+1}</td><td>${w.team}</td><td>${w.weight}</td></tr>
    `).join('');
  }

  function renderZonesAwards(byZ){
    if(!zonesWrap) return;
    zonesWrap.innerHTML = ['A','B','C'].map(z => {
      const arr = byZ[z];
      const awards = [arr[1], arr[2], arr[3]].filter(Boolean);
      const rows = awards.length
        ? awards.map((w, i) => `<tr><td>${i+1}</td><td>${w.team}</td><td>${w.weight}</td></tr>`).join('')
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

  if(calcBtn && rateCSV && topLake && zonesWrap){
    calcBtn.addEventListener('click', () => {
      try{
        const rows = parseCSV(rateCSV.value);
        const body = rows[0] && rows[0][0].toLowerCase().includes('команда') ? rows.slice(1) : rows;
        const byZ = groupByZone(body);
        renderTopLake(byZ);
        renderZonesAwards(byZ);
        document.getElementById('awards-ready').style.display = 'block';
      }catch(e){ alert('Помилка CSV: ' + e.message); }
    });
  }

  // Registration storing
  const form = document.getElementById('register-form');
  if(form){
    form.addEventListener('submit', (e) => {
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
      window.location.href = 'thanks.html';
    });
  }
})();
