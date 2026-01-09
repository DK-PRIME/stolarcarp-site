// assets/js/auth-tabs.js
// STOLAR CARP • Tabs (Login/Signup) + Captain/Member fields
(function () {
  "use strict";

  const tabLogin   = document.getElementById("tabLogin");
  const tabSignup  = document.getElementById("tabSignup");
  const panelLogin = document.getElementById("panelLogin");
  const panelSignup= document.getElementById("panelSignup");

  const captainFields = document.getElementById("captainFields");
  const memberFields  = document.getElementById("memberFields");

  function has(el){ return !!el; }

  function open(which){
    // якщо якихось блоків нема — не падаємо
    if (!has(tabLogin) || !has(tabSignup) || !has(panelLogin) || !has(panelSignup)) return;

    if (which === "signup"){
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      panelSignup.classList.remove("hidden");
      panelLogin.classList.add("hidden");
    } else {
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      panelLogin.classList.remove("hidden");
      panelSignup.classList.add("hidden");
    }
  }

  function updateRoleFields(){
    const v = document.querySelector('input[name="signupRole"]:checked')?.value || "captain";
    if (v === "captain"){
      captainFields && captainFields.classList.remove("hidden");
      memberFields  && memberFields.classList.add("hidden");
    } else {
      memberFields  && memberFields.classList.remove("hidden");
      captainFields && captainFields.classList.add("hidden");
    }
  }

  // Таби
  tabLogin  && tabLogin.addEventListener("click", () => open("login"));
  tabSignup && tabSignup.addEventListener("click", () => open("signup"));

  // Ролі
  document.querySelectorAll('input[name="signupRole"]').forEach(r=>{
    r.addEventListener("change", updateRoleFields);
  });

  // Стартовий стан (у твоїй HTML активний "Вхід")
  open("login");
  updateRoleFields();
})();
