// assets/js/firebase-init.js
// Єдиний Firebase для сайту STOLAR CARP

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ⚠️ ВАЖЛИВО:
// Скопіюй звідси дані з того ж проекту Firebase,
// де працює DK PRIME (firebase-config.js у репозиторії DK-Prime).
const firebaseConfig = {
  apiKey: "СКОПІЮЙ_ІЗ_DK_PRIME",
  authDomain: "СКОПІЮЙ_ІЗ_DK_PRIME",
  projectId: "СКОПІЮЙ_ІЗ_DK_PRIME",
  storageBucket: "СКОПІЮЙ_ІЗ_DK_PRIME",
  messagingSenderId: "СКОПІЮЙ_ІЗ_DK_PRIME",
  appId: "СКОПІЮЙ_ІЗ_DK_PRIME",
};

// 1 спільний app
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Експортуємо для всіх модулів
export { app, auth, db };

// Якщо десь ще потрібні глобальні змінні (старі скрипти) — лишаю:
window.stolarApp  = app;
window.stolarAuth = auth;
window.stolarDb   = db;
