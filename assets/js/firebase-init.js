// assets/js/firebase-init.js
// Ініціалізація Firebase (COMPAT) для STOLAR CARP

// Переконуємось, що глобальний об'єкт firebase є
if (typeof firebase === "undefined") {
  console.error("Firebase SDK (compat) не завантажено. Перевір скрипти в auth.html");
} else {
  // Твій config
  const firebaseConfig = {
    apiKey: "AIzaSyBU7BSwGl0laDvHGhrvu14nJWpabsjSoNo",
    authDomain: "stolar-carp.firebaseapp.com",
    projectId: "stolar-carp",
    storageBucket: "stolar-carp.firebasestorage.app",
    messagingSenderId: "1019636788370",
    appId: "1:1019636788370:web:af1c1ecadb683df212ca4b",
    measurementId: "G-VWC07QNS7P"
  };

  // Якщо ще не ініціалізовано — ініціалізуємо
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  // Створюємо сервіси
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Виносимо в window, щоб ними користувалися інші скрипти
  window.firebase = firebase;
  window.auth = auth;
  window.db   = db;

  console.log("Firebase STOLAR CARP ініціалізовано");
}
