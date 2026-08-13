// assets/js/final_invite.js
// STOLAR CARP • Final Invite compatibility layer
//
// =========================================================
// ВАЖЛИВО
// =========================================================
//
// Цей файл БІЛЬШЕ НЕ:
// • створює окремий блок фіналу в "Мій кабінет";
// • не підтверджує участь;
// • не відмовляє від участі;
// • не створює registrations;
// • не створює public_participants;
// • не змінює finalInvites.
//
// Вся фінальна реєстрація тепер працює через:
//
// assets/js/register_firebase.js
//
// Там:
// • звичайні етапи доступні всім;
// • тільки final перевіряє finalInvites;
// • invited  -> можна реєструватися;
// • reserve  -> очікує;
// • declined -> заблокований;
// • confirmed / існуюча registration -> повторна заявка заборонена.
//
// =========================================================
// ЧОМУ ФАЙЛ ЗАЛИШАЄМО
// =========================================================
//
// Старі HTML-сторінки можуть ще містити:
//
// <script src="assets/js/final_invite.js"></script>
//
// Тому файл не видаляємо фізично,
// а залишаємо як безпечний compatibility layer.
//
// =========================================================

(function () {
  "use strict";

  const LOG_PREFIX =
    "[STOLAR CARP final_invite]";

  // =========================================================
  // REMOVE OLD UI
  // =========================================================

  function removeLegacyFinalInviteUI() {
    const oldCard =
      document.getElementById(
        "finalInviteCard"
      );

    if (oldCard) {
      oldCard.remove();
    }

    const oldContent =
      document.getElementById(
        "finalInviteContent"
      );

    if (
      oldContent &&
      oldContent.parentElement
    ) {
      oldContent.parentElement.remove();
    }
  }

  // =========================================================
  // REMOVE OLD STYLES
  // =========================================================

  function removeLegacyStyles() {
    const oldStyle =
      document.getElementById(
        "sc-final-invite-styles"
      );

    if (oldStyle) {
      oldStyle.remove();
    }
  }

  // =========================================================
  // CLEANUP
  // =========================================================

  function cleanupLegacyFinalInvite() {
    removeLegacyFinalInviteUI();
    removeLegacyStyles();
  }

  // =========================================================
  // DEBUG INFO
  // =========================================================

  function printInfo() {
    console.info(
      `${LOG_PREFIX} disabled. ` +
      `Final registration is handled by register_firebase.js`
    );
  }

  // =========================================================
  // START
  // =========================================================

  function init() {
    cleanupLegacyFinalInvite();

    /*
     * Якщо якийсь старий JS повторно
     * вставить legacy block після DOM load,
     * прибираємо ще раз.
     */
    setTimeout(
      cleanupLegacyFinalInvite,
      250
    );

    setTimeout(
      cleanupLegacyFinalInvite,
      1000
    );

    printInfo();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

})();
