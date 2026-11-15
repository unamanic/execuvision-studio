/**
 * Startup title card. Keep it independent of project/history state: dismissal
 * only chooses an interface and moves focus. No timer, storage, or network work.
 * This deferred script runs after both editor controllers have initialized.
 */
(() => {
  'use strict';
  const dialog = document.getElementById('splash');
  const modern = document.getElementById('splashModern');
  const dos = document.getElementById('splashDos');

  function enter(useDos = false) {
    if (!dialog.open) {
      return;
    }
    dialog.close();
    if (useDos) {
      // Forward to the existing mode handler; fullscreen stays an explicit choice.
      document.getElementById('dosToggle').click();
    } else {
      document.getElementById('canvas').focus({ preventScroll: true });
    }
  }

  modern.addEventListener('click', () => enter());
  dos.addEventListener('click', () => enter(true));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    enter();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!dialog.open) {
        return;
      }
      // Tab can briefly leave document.activeElement on body, even in a modal.
      // Capture at window so no startup key reaches either editor controller.
      // Native Tab/Shift+Tab navigation and Space activation still work normally.
      event.stopImmediatePropagation();
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return;
      }
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' || event.key.toLowerCase() === 'd') {
        event.preventDefault();
        enter(event.key.toLowerCase() === 'd' || document.activeElement === dos);
      }
    },
    true,
  );

  // The declarative open state covers the editor while deferred scripts load.
  // Upgrade it synchronously to a modal so native focus trapping/inertness apply.
  dialog.removeAttribute('open');
  dialog.showModal();
  modern.focus({ preventScroll: true });
})();
