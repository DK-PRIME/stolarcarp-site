// assets/js/firebase-init.js
// ЄДИНА ініціалізація Firebase для STOLAR CARP + DK Prime
// Використовуємо compat-версію SDK (10.12.2) і глобальний об'єкт firebase.

(function () {
  // Конфігурація саме твого проекту STOLAR CARP
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b"
  };

  // Ініціалізуємо додаток лише один раз
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  // Базові сервіси
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // Глобальні посилання для ВСЬОГО проекту
  window.scAuth = auth;
  window.scDb = db;
  window.scStorage = storage;

  // Для сумісності, якщо десь уже використовуєш ці імена
  window.auth = auth;
  window.db = db;
  window.storage = storage;
})();
