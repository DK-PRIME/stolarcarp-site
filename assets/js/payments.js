// assets/js/payments.js — Сонічка
// Налаштування оплати
const PAYMENT_PROVIDER = 'monobank';
const PAYMENT_AMOUNT   = 3000; // грн — за потреби зміни
const CURRENCY         = 'UAH';

// Прив’язка до елементів на сторінці
const FORM_ID      = 'regForm';      // твоя форма
const PAY_BTN_ID   = 'payButton';
const STATUS_EL_ID = 'payStatus';
const LS_KEY       = 'stolar_pay_session';

// Утиліти блокування/розблокування
function disableFormUntilPaid() {
  const form = document.getElementById(FORM_ID);
  if (!form) return;
  [...form.elements].forEach(el => {
    if (el.id === PAY_BTN_ID) return; // кнопку оплати лишаємо активною
    el.disabled = true;
  });
}
function enableForm() {
  const form = document.getElementById(FORM_ID);
  if (!form) return;
  [...form.elements].forEach(el => (el.disabled = false));
}
function setStatus(text) {
  const el = document.getElementById(STATUS_EL_ID);
  if (el) el.textContent = text;
}

// API-запити до Netlify Functions
async function createCheckoutSession(meta) {
  const res = await fetch('/.netlify/functions/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: PAYMENT_PROVIDER,
      amount: PAYMENT_AMOUNT,
      currency: CURRENCY,
      meta
    })
  });
  if (!res.ok) throw new Error('Не вдалося створити платіжну сесію');
  return res.json(); // { checkoutUrl, sessionId }
}
async function verifyPaid(sessionId) {
  const res = await fetch('/.netlify/functions/verify-payment?sessionId=' + encodeURIComponent(sessionId));
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.paid;
}

// Старт оплати
async function startPaymentFlow() {
  try {
    disableFormUntilPaid();
    setStatus('Готуємо оплату…');

    // Метадані з ТВОЇХ полів
    const form = document.getElementById(FORM_ID);
    const fd   = new FormData(form);
    const team = {
      teamName: fd.get('team_name') || '',
      captain:  fd.get('captain')   || '',
      phone:    (fd.get('phone') || '').toString(),
      email:    '' // якщо додаси поле email — впиши його name і сюди
    };

    const { checkoutUrl, sessionId } = await createCheckoutSession(team);
    localStorage.setItem(LS_KEY, sessionId);
    setStatus('Переходимо на сторінку оплати…');
    window.location.href = checkoutUrl; // Monobank checkout
  } catch (e) {
    console.error(e);
    setStatus('Помилка під час створення оплати. Спробуйте ще раз.');
    enableForm();
  }
}

// Повернення з платіжної сторінки → перевірка
async function resumeIfReturnedFromProvider() {
  const url       = new URL(window.location.href);
  const returned  = url.searchParams.get('return');
  const sessionId = url.searchParams.get('sessionId') || localStorage.getItem(LS_KEY);
  if (!sessionId) return;

  if (returned) {
    setStatus('Перевіряємо оплату…');
    const paid = await verifyPaid(sessionId);
    if (paid) {
      setStatus('Оплату підтверджено ✅ Можна завершити реєстрацію.');
      enableForm();
    } else {
      setStatus('Оплата не підтверджена. Якщо списання було — зачекайте 20–60 с або натисніть «Перевірити оплату».');
    }
  }
}

// Ручна перевірка
async function manualCheck() {
  const sessionId = localStorage.getItem(LS_KEY);
  if (!sessionId) return setStatus('Немає платіжної сесії. Натисніть «Оплатити внесок».');
  setStatus('Перевіряємо оплату…');
  const paid = await verifyPaid(sessionId);
  if (paid) {
    setStatus('Оплату підтверджено ✅ Можна завершити реєстрацію.');
    enableForm();
  } else {
    setStatus('Оплата ще не підтверджена. Спробуйте трохи пізніше.');
  }
}

// Ініціалізація
window.addEventListener('DOMContentLoaded', () => {
  disableFormUntilPaid();
  resumeIfReturnedFromProvider();

  const payBtn = document.getElementById(PAY_BTN_ID);
  if (payBtn) payBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startPaymentFlow();
  });

  const checkBtn = document.getElementById('checkPayment');
  if (checkBtn) checkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    manualCheck();
  });
});
