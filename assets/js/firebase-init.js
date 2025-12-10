// assets/js/firebase-init.js
// Firebase для сайту STOLAR CARP (compat-версія, щоб працювали auth.js і cabinet.js)

// Підтягуємо COMPAT SDK (старий стиль, але остання версія)
import firebase from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js";
import "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore-compat.js";

// ⚠️ ТУТ ВСТАВЛЯЄШ СВОЮ КОНФІГУРАЦІЮ З FIREBASE CONSOLE
// Можеш просто СКОПІЮВАТИ firebaseConfig з dk-prime (firebase-config.js)
const firebaseConfig = {
  apiKey:        "ТУТ_ТВІЙ_apiKey",
  authDomain:    "ТУТ_ТВІЙ_authDomain",
  projectId:     "ТУТ_ТВІЙ_projectId",
  storageBucket: "ТУТ_ТВІЙ_storageBucket",
  messagingSenderId: "ТУТ_ТВІЙ_messagingSenderId",
  appId:         "ТУТ_ТВІЙ_appId"
};

// Ініціалізація
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Головні сервіси
const auth = firebase.auth();
const db   = firebase.firestore();

// Виводимо в глобальний scope (для auth.js, cabinet.js)
window.firebase = firebase;
window.auth     = auth;
window.db       = db;

// І експортимо для модульних скриптів (register_firebase.js)
export { firebase, auth, db };
