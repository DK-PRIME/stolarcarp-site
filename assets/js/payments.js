/* ================================
   STOLAR CARP — payments.js
   - Paywall знімається після "Я оплатив(ла)"
   - Фіксована сума 1500 ₴
   - Коментар до оплати (обовʼязковий)
   - Валідації, анти-спам, відправка у Google Sheets
================================ */

/* Ключі в localStorage */
const PAY_OK_KEY   = 'sc_pay_ok_v1';
const PAY_MARK_KEY = 'sc_pay_mark_ts_v1';
const COOLDOWN_KEY = 'sc_reg_cooldown_until';
const DONE_FP_KEY  = 'sc_reg_done_fp';

/* Антиспам */
const MIN_TIME_ON_PAGE_MS = 4000;
const PAGE_LOADED_AT = Date.now();

/* 💰 ФІКСОВАНА СУМА (незмінна ніде) */
const FIXED_AMOUNT = 1500;

/* Твій Apps Script endpoint */
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwfc8-XTU7hXh9ermqg_zxpnqVivWTuTDW_12guSuzU0R-bC4-3R6xp29W12ZOai8B3yg/exec";

/* Якщо додаси серверну перевірку платежу — вкажи URL тут */
const OPTIONAL_VERIFY_URL = ""; // напр.: 'https://script.google.com/macros/s/XXXX/exec?action=verify'

/* DOM */
const formEl      = document.getElementById('regForm');
const msgEl       = document.getElementById('msg');
const spinnerEl   = document.getElementById('spinner');
const submitBtn   = document.getElementById('submitBtn');

const paywallEl   = document.getElementById('paywall');
const payStatusEl = document.getElementById('payStatus');
const payBtn      = document.getElementById('payButton');
const iPaidBtn    = document.getElementById('iPaid');
const checkBtn    = document.getElementById('checkPayment');

const phoneHidden = document.getElementById('phone');
const phoneRest   = document.getElementById('phone_rest');
const commentEl   = document.getElementById('payment_comment'); // textarea (може не існувати)

/* UI helpers */
function flash(type, text){
  msgEl.className = 'form-msg ' + (type || '');
  msgEl.textContent = text || '';
}
function setBusy(b){
  submitBtn.disabled = b;
  spinnerEl.classList.toggle('spinner--on', b);
}

/* Fingerprint */
(function setFP(){
  const src = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join('|');
  let h = 2166136261;
  for (let i=0;i<src.length;i++){ h ^= src.charCodeAt(i); h = (h*16777619)>>>0; }
  document.getElementById('fp').value = 'fp_' + h.toString(16);
})();

/* Телефон: видиме поле -> приховане +380XXXXXXXXX */
function syncPhone(){
  const digits = (phoneRest.value || '').replace(/\D+/g,'').slice(0,9);
  phoneRest.value = digits;
  phoneHidden.value = digits.length === 9 ? '+380' + digits : '';
}
phoneRest.addEventListener('input', syncPhone);
syncPhone();

/* Харчування: кількість порцій — лише якщо "Так" */
const foodRadios = [...formEl.querySelectorAll('input[name="food"]')];
const qtyInput   = document.getElementById('food_qty');
const qtyField   = document.getElementById('foodQtyField');
function updateQtyState(){
  const need = (foodRadios.find(r=>r.checked)?.value === 'Так');
  qtyInput.disabled = !need;
  qtyInput.required = need;
  if (!need) qtyInput.value = '';
  qtyField.classList.toggle('field--disabled', !need);
}
foodRadios.forEach(r => r.addEventListener('change', updateQtyState));
updateQtyState();

/* Paywall state */
function setPayUnlockedUI(){
  paywallEl?.classList.add('paywall--ok');
  payStatusEl.textContent = 'Оплату підтверджено на цьому пристрої. Можете надсилати заявку.';
}
function setPayLockedUI(){
  paywallEl?.classList.remove('paywall--ok');
  payStatusEl.textContent = 'Щоб зареєструватись, спочатку оплатіть внесок.';
}
function isPaidOnThisDevice(){ return localStorage.getItem(PAY_OK_KEY) === '1'; }
function markPaidOnThisDevice(){
  localStorage.setItem(PAY_OK_KEY, '1');
  localStorage.setItem(PAY_MARK_KEY, Date.now().toString());
  setPayUnlockedUI();
}
(function initPaywallState(){
  if (isPaidOnThisDevice()) setPayUnlockedUI(); else setPayLockedUI();
})();

/* Кнопки paywall */
payBtn?.addEventListener('click', ()=>{/* відкриття модалки робить скрипт у register.html */});
iPaidBtn?.addEventListener('click', ()=>{
  markPaidOnThisDevice();
  flash('ok','Дякуємо! Статус оплати зафіксовано на цьому пристрої.');
});
checkBtn?.addEventListener('click', async ()=>{
  if (isPaidOnThisDevice()){
    flash('ok','Оплата вже підтверджена на цьому пристрої — надішліть заявку.');
    return;
  }
  if (!OPTIONAL_VERIFY_URL){
    flash('', 'Після оплати натисніть «Я оплатив(ла)». За потреби — зверніться до організатора.');
    return;
  }
  try{
    const phone = phoneHidden.value;
    if (!/^\+380\d{9}$/.test(phone)){
      flash('err','Вкажіть номер телефону (9 цифр після +380) — перевіримо по ньому.');
      return;
    }
    const baseSep = OPTIONAL_VERIFY_URL.includes('?') ? '&' : '?';
    const url = OPTIONAL_VERIFY_URL + baseSep + 'phone=' + encodeURIComponent(phone);
    const res = await fetch(url);
    const data = await res.json();
    if (data?.paid){ markPaidOnThisDevice(); flash('ok','Оплату знайдено. Можете надсилати заявку.'); }
    else { flash('','Поки не знайдено платіж. Якщо вже сплатили — натисніть «Я оплатив(ла)».'); }
  }catch(e){
    flash('err','Не вдалося перевірити платіж. Спробуйте ще раз.');
  }
});

/* Надсилання форми */
let inFlight = false;

formEl.addEventListener('submit', async (e)=>{
  e.preventDefault();
  flash('','');
  if (inFlight) return;

  /* Антибот-таймер */
  if (Date.now() - PAGE_LOADED_AT < MIN_TIME_ON_PAGE_MS){
    flash('err','Будь ласка, заповніть форму уважно і повторіть через кілька секунд.');
    return;
  }

  /* Оплата обовʼязкова */
  if (!isPaidOnThisDevice()){
    flash('err','Спершу оплатіть внесок і натисніть «Я оплатив(ла)».');
    return;
  }

  /* HTML5-валідація */
  if (!formEl.checkValidity()){
    flash('err','Перевірте обов’язкові поля форми.');
    formEl.reportValidity?.();
    return;
  }

  /* Телефон */
  syncPhone();
  if (!/^\+380\d{9}$/.test(phoneHidden.value)){
    flash('err','Введіть 9 цифр після +380 (разом буде +380XXXXXXXXX).');
    return;
  }

  /* Харчування */
  if (formEl.food.value === 'Так' && !formEl.food_qty.value){
    flash('err','Вкажіть кількість порцій.');
    return;
  }

  /* Коментар до оплати (обовʼязковий) */
  const paymentComment = (commentEl?.value || '').trim();
  if (!paymentComment){
    flash('err','Додайте коментар до оплати: назву команди, від імені якої оплачено.');
    commentEl?.focus();
    return;
  }

  /* Антидублі */
  const fp = document.getElementById('fp').value;
  if (localStorage.getItem(DONE_FP_KEY) === fp){
    flash('err','З цього пристрою вже подано заявку.');
    return;
  }
  const until = localStorage.getItem(COOLDOWN_KEY);
  if (until && Date.now() < +until){
    flash('err','Заявка вже була надіслана. Спробуйте пізніше.');
    return;
  }

  /* Збір даних і відправка */
  formEl.hp.value = ''; // honeypot
  const fd = new FormData(formEl);
  fd.append('ts', Date.now().toString());
  fd.append('ua', navigator.userAgent.slice(0,200));
  fd.append('amount', FIXED_AMOUNT);          // 💰 фіксована сума
  fd.append('payment_comment', paymentComment); // 💬 коментар до оплати

  inFlight = true; setBusy(true);
  try{
    const res = await fetch(ENDPOINT, { method:'POST', body: fd });
    const data = await res.json();

    if (data.ok){
      flash('ok','Дякуємо! Заявку надіслано та збережено.');
      const cd = Date.now() + 24*60*60000; // 24 год
      localStorage.setItem(COOLDOWN_KEY, cd.toString());
      localStorage.setItem(DONE_FP_KEY, fp);
      formEl.reset(); updateQtyState();
    }else{
      const MAP = {
        LIMIT:'Ліміт місць вичерпано.',
        DUPLICATE_TEAM:'Команда з такою назвою вже зареєстрована.',
        DUPLICATE_PHONE:'З цього номера вже подано заявку.',
        DUPLICATE_DEVICE:'З цього пристрою вже подано заявку.',
        BAD_TEAM:'Невірна назва команди.',
        BAD_CAPTAIN:'Вкажіть капітана.',
        BAD_PHONE:'Невірний телефон. Формат: +380XXXXXXXXX.',
        BAD_MEMBERS:'Кількість учасників: від 1 до 4.',
        BAD_FOOD_QTY:'Вкажіть кількість порцій 1–20.'
      };
      flash('err', MAP[data.code] || data.error || 'Сталася помилка при надсиланні.');
    }
  }catch(err){
    flash('err','Не вдалося надіслати форму: ' + err.message);
  }finally{
    setBusy(false); inFlight = false;
  }
});
