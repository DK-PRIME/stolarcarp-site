// активи/js/firebase-init.js

// 1. Підтягуємо Firebase SDK (v11)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 2. ТВОЯ конфігурація з консолі Firebase (Project settings → Web app)
const firebaseConfig = {
  apiKey: "ТУТ_ТВІЙ_apiKey",
  authDomain: "ТУТ_ТВІЙ_authDomain",
  projectId: "ТУТ_ТВІЙ_projectId",
  storageBucket: "ТУТ_ТВІЙ_storageBucket",
  messagingSenderId: "ТУТ_ТВІЙ_messagingSenderId",
  appId: "ТУТ_ТВІЙ_appId"
  // якщо є measurementId — можна теж додати
};

// 3. Ініціалізація одного спільного app для всього сайту STOLAR CARP
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// 4. Експортуємо, щоб інші файли могли використати
export { app, auth, db };
