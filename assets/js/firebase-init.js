// assets/js/firebase-init.js
// ЄДИНА ініціалізація Firebase для STOLAR CARP + DK PRIME

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b"
  };

  // Ініціалізуємо додаток один раз
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // Глобальні змінні для всього проекту
  window.scAuth = auth;
  window.scDb = db;
  window.scStorage = storage;

  // Для сумісності, якщо десь ще використовується window.auth / db / storage
  window.auth = auth;
  window.db = db;
  window.storage = storage;
})();
