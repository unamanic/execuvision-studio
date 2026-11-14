/* Optional DOS-inspired command surface. Uses existing controls, local only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const bar = $('dosMenuBar');
  const toggle = $('dosToggle');
  const keys = $('dosKeys');
  const help = $('dosHelp');
  if (!bar || !toggle || !keys || !help) {
    return;
  }
  const byID = (id) => () => $(id);
  const mode = (m) => () => document.querySelector(`[data-mode="${m}"]`);
  const tool = (t) => () => document.querySelector(`[data-tool="${t}"]`);
  const command = (label, target, key = '') => ({ label, target, key });
  const focusCommand = (label, panel, selector, key = '') => ({
    label,
    action: () => focusPanel(panel, selector),
    key,
  });
  // The five task names are documented; submenu grouping is a new reconstruction.
  // Commands resolve existing modern controls lazily. Reusing their handlers
  // keeps validation, undo checkpoints, and disabled states identical in both UIs.
  const defs = [
    [
      'Create',
      [
        command('Create workspace', mode('create'), 'F7'),
        ...[
          'pencil',
          'erase',
          'line',
          'rect',
          'ellipse',
          'fill',
          'select',
          'text',
          'chart',
          'eyedrop',
        ].map((t, i) =>
          command(
            [
              'Pencil',
              'Erase',
              'Line',
              'Box',
              'Ellipse',
              'Fill',
              'Select region',
              'Text',
              'PLOT chart',
              'Pick color',
            ][i],
            tool(t),
          ),
        ),
        command('Copy', byID('copy'), 'Ctrl/Cmd C'),
        command('Cut', byID('cut'), 'Ctrl/Cmd X'),
        command('Paste', byID('paste'), 'Ctrl/Cmd V'),
        command('Delete selection', byID('deleteSelection'), 'Del'),
        command('Deselect', byID('clearSelection')),
        command('Save PIX', byID('savePix')),
        focusCommand('Palette family', 'palette', '#paletteFamily', 'F9'),
        focusCommand('Background color', 'palette', '#background'),
        focusCommand('Drawing color', 'palette', '#swatches button'),
        focusCommand('Drawing canvas', 'canvas', '#canvas'),
        focusCommand('Toolbox', 'tools', '#tools button'),
        focusCommand('Picture library', 'library', '#librarySearch'),
        command('Open original media', byID('importMedia'), 'F4'),
        command('New slide', byID('addSlide')),
        command('Duplicate slide', byID('duplicateSlide')),
      ],
    ],
    [
      'Prepare',
      [
        command('Order slides', mode('prepare'), 'F6'),
        focusCommand('Slide directory', 'slides', '#addSlide'),
        command('New motion', byID('newMotion')),
        focusCommand('Motion controls', 'motion', '#newMotion'),
        command('Preview slide', byID('previewMotion')),
      ],
    ],
    ['Print', [command('Print slide handouts', mode('print'), 'F8')]],
    ['Run', [command('Run presentation', mode('run'), 'F5')]],
    [
      'Quit',
      [],
      () => {
        setEnabled(false);
        toggle.focus();
      },
    ],
    [
      'Studio extras',
      [
        command('Open project (web)', byID('openProject'), 'F3'),
        command('Save project (web)', byID('saveProject'), 'F2'),
        command('New project (web)', byID('newProject')),
        command('Undo (web)', byID('undo'), 'Ctrl/Cmd Z'),
        command('Redo (web)', byID('redo'), 'Ctrl/Cmd Shift Z'),
        command('Export PNG (web)', byID('exportPNG')),
        command('Export video (web)', byID('exportVideo')),
        command('Export native EV (experimental)', byID('exportEV')),
        command('Export EV media ZIP (experimental)', byID('exportDeck')),
        { label: 'Enter full screen (browser)', action: enterFullscreen, key: '' },
        { label: 'Exit full screen (browser)', action: exitFullscreen, key: '' },
        { label: 'DOS keyboard help (web)', action: showHelp, key: 'F1' },
        command('Field guide (web)', byID('help')),
      ],
    ],
  ];
  let enabled = false;
  let active = -1;
  let origin = null;
  let helpOrigin = null;
  const menus = [];
  // DOS mode is a layout state; browser fullscreen is independent and may fail.
  // ownsFullscreen prevents leaving fullscreen that this interface did not enter.
  let fullscreenBusy = false;
  let ownsFullscreen = false;
  function screenStatus(message) {
    if ($('dosScreenStatus')) {
      $('dosScreenStatus').textContent = message;
    }
  }

  function syncFullscreen() {
    const full = !!document.fullscreenElement;
    document.body.classList.toggle('dos-fullscreen', enabled && full);
    if ($('dosFullscreen')) {
      $('dosFullscreen').disabled = fullscreenBusy || full;
      $('dosFullscreen').hidden = full;
      $('dosFullscreen').textContent = 'Enter full screen';
    }
    if ($('dosExitFullscreen')) {
      $('dosExitFullscreen').disabled = fullscreenBusy || !full;
      $('dosExitFullscreen').hidden = !full;
    }
  }

  async function enterFullscreen() {
    if (fullscreenBusy || document.fullscreenElement) {
      return;
    }
    if (typeof document.documentElement?.requestFullscreen !== 'function') {
      screenStatus('Full screen is unavailable in this browser. DOS mode still fills the page.');
      return;
    }
    fullscreenBusy = true;
    syncFullscreen();
    try {
      await document.documentElement.requestFullscreen();
      ownsFullscreen = true;
      screenStatus('Full screen. Use Exit full screen or the browser’s Esc key to leave.');
    } catch (_) {
      screenStatus(
        'The browser did not allow full screen. Try the full-screen button again; DOS mode still works in this window.',
      );
    } finally {
      fullscreenBusy = false;
      syncFullscreen();
    }
  }

  async function exitFullscreen() {
    if (fullscreenBusy || !document.fullscreenElement) {
      return;
    }
    fullscreenBusy = true;
    syncFullscreen();
    try {
      await document.exitFullscreen();
      ownsFullscreen = false;
      screenStatus('Windowed DOS mode.');
    } catch (_) {
      screenStatus('Unable to leave full screen here. Use the browser’s Esc key.');
    } finally {
      fullscreenBusy = false;
      syncFullscreen();
    }
  }

  // A single data-dos-panel value controls transient windows in dos-mode.css.
  // Showing a panel changes focus/layout only, never the presentation data.
  function focusPanel(panel, selector) {
    mode('create')()?.click();
    document.body.dataset.dosPanel = panel;
    if ($('dosPanelClose')) {
      $('dosPanelClose').hidden = panel === 'canvas';
    }
    const target = document.querySelector(selector);
    target?.focus();
    target?.scrollIntoView?.({ block: 'nearest' });
  }

  function closePanel() {
    document.body.dataset.dosPanel = 'canvas';
    if ($('dosPanelClose')) {
      $('dosPanelClose').hidden = true;
    }
    $('canvas')?.focus();
    if (typeof dosCanvasHint === 'function') {
      dosCanvasHint();
    }
  }

  function editable(el) {
    return (
      !!el &&
      (el.isContentEditable ||
        !!el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
    );
  }

  function modal() {
    return !!document.querySelector('dialog[open]');
  }

  function consume(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function restore(el) {
    if (el && el.isConnected && !el.disabled) {
      el.focus();
    }
  }

  function close(restoreOrigin = false) {
    const wasMenu = active >= 0 || bar.contains(document.activeElement);
    menus.forEach((m) => {
      m.popup.hidden = true;
      m.trigger.setAttribute('aria-expanded', 'false');
    });
    active = -1;
    if (restoreOrigin && wasMenu) {
      restore(origin);
    }
  }

  // Recheck targets each time a menu opens; selection/clipboard state may have
  // changed since the command elements were constructed.
  function synchronize(m) {
    m.items.forEach(({ button, def }) => {
      const target = def.target?.();
      button.disabled = !!def.target && (!target || target.disabled);
      button.setAttribute('aria-disabled', String(button.disabled));
    });
  }

  function items(m) {
    return m.items.filter((x) => !x.button.disabled).map((x) => x.button);
  }

  // Only one top-level task is in the Tab sequence; arrows move between tasks.
  function rove(index) {
    menus.forEach((m, i) => (m.trigger.tabIndex = i === index ? 0 : -1));
  }

  function open(index, edge = 0) {
    if (!enabled || modal()) {
      return;
    }
    if (!bar.contains(document.activeElement)) {
      origin = document.activeElement;
    }
    close();
    active = (index + menus.length) % menus.length;
    const m = menus[active];
    if (m.action) {
      rove(active);
      active = -1;
      m.trigger.focus();
      return;
    }
    synchronize(m);
    rove(active);
    m.popup.hidden = false;
    m.trigger.setAttribute('aria-expanded', 'true');
    const available = items(m);
    (edge < 0 ? available.at(-1) : available[0])?.focus();
  }

  function invoke(def) {
    const target = def.target?.();
    if (def.target && (!target || target.disabled)) {
      return;
    }
    close(true);
    if (def.action) {
      def.action();
    } else {
      if (target.dataset.tool) {
        mode('create')()?.click();
        document.body.dataset.dosPanel = ['text', 'chart'].includes(target.dataset.tool)
          ? 'tools'
          : 'canvas';
        if ($('dosPanelClose')) {
          $('dosPanelClose').hidden = document.body.dataset.dosPanel === 'canvas';
        }
      }
      target.click();
    }
  }

  function showHelp() {
    close(true);
    helpOrigin = document.activeElement;
    help.showModal();
    $('dosHelpClose')?.focus();
  }

  // Switch interfaces without recreating the editor or clearing its undo stack.
  // Quit deliberately calls this path rather than resetting the project.
  function setEnabled(value) {
    close();
    enabled = !!value;
    if (enabled && !document.body.dataset.dosPanel) {
      document.body.dataset.dosPanel = 'canvas';
    }
    document.body.classList.toggle('dos-mode', enabled);
    bar.hidden = keys.hidden = !enabled;
    if ($('dosTitleBar')) {
      $('dosTitleBar').hidden = !enabled;
    }
    if ($('dosPanelClose')) {
      $('dosPanelClose').hidden = !enabled || document.body.dataset.dosPanel === 'canvas';
    }
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Modern interface' : 'DOS interface';
    if (enabled && !document.body.dataset.dosPanel) {
      document.body.dataset.dosPanel = 'canvas';
    }
    if (!enabled && ownsFullscreen) {
      exitFullscreen();
    }
    syncFullscreen();
    if (!enabled && bar.contains(document.activeElement)) {
      toggle.focus();
    }
    if (enabled) {
      closePanel();
      screenStatus('Keyboard mode: F10 menus, F1 help, Tab controls.');
    }
    if (typeof studioInterfaceChanged === 'function') {
      studioInterfaceChanged();
    }
  }
  defs.forEach(([label, commands, action], i) => {
    const group = document.createElement('div');
    group.className = 'dos-menu-group';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dos-menu-trigger';
    trigger.textContent = label;
    trigger.id = 'dosMenuTrigger' + i;
    trigger.tabIndex = i ? -1 : 0;
    trigger.setAttribute('role', 'menuitem');
    if (!action) {
      trigger.setAttribute('aria-haspopup', 'menu');
    }
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'dosPopup' + i);
    const popup = document.createElement('div');
    popup.className = 'dos-popup';
    popup.id = 'dosPopup' + i;
    popup.hidden = true;
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-labelledby', trigger.id);
    const m = { trigger, popup, items: [], action };
    menus.push(m);
    for (const def of commands) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dos-command';
      button.tabIndex = -1;
      button.setAttribute('role', 'menuitem');
      const name = document.createElement('span');
      name.className = 'dos-command-label';
      name.textContent = def.label;
      const key = document.createElement('span');
      key.className = 'dos-command-key';
      key.textContent = def.key;
      key.setAttribute('aria-hidden', 'true');
      button.append(name, key);
      button.onclick = () => invoke(def);
      popup.append(button);
      m.items.push({ button, def });
    }
    trigger.onpointerdown = () => {
      if (!bar.contains(document.activeElement)) {
        origin = document.activeElement;
      }
    };
    trigger.onclick = () => (action ? action() : active === i ? close(true) : open(i));
    group.append(trigger, popup);
    bar.append(group);
  });
  const shortcuts = {
    F1: { action: showHelp },
    F2: command('Save', byID('saveProject')),
    F3: command('Open', byID('openProject')),
    F4: command('Media', byID('importMedia')),
    F5: command('Run', mode('run')),
    F6: command('Prepare', mode('prepare')),
    F7: command('Create', mode('create')),
    F8: command('Print', mode('print')),
    F9: focusCommand('Palette', 'palette', '#paletteFamily'),
  };
  for (const [key, def] of Object.entries(shortcuts)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = key + ' ' + (def.label || 'Help');
    b.onclick = () => invoke(def);
    keys.append(b);
  }
  const menuKey = document.createElement('span');
  menuKey.textContent = 'Keyboard mode · F10 Menus · F1 Help · Tab Controls · Esc Back';
  keys.append(menuKey);
  for (const eventName of ['pointerdown', 'pointermove', 'pointerup']) {
    $('canvas')?.addEventListener(
      eventName,
      (e) => {
        if (!enabled) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        if (eventName === 'pointerdown') {
          $('canvas').focus();
        }
      },
      true,
    );
  }
  toggle.onclick = () => setEnabled(!enabled);
  if ($('dosModern')) {
    $('dosModern').onclick = () => setEnabled(false);
  }
  if ($('dosPanelClose')) {
    $('dosPanelClose').onclick = closePanel;
  }
  if ($('dosFullscreen')) {
    $('dosFullscreen').onclick = enterFullscreen;
  }
  if ($('dosExitFullscreen')) {
    $('dosExitFullscreen').onclick = exitFullscreen;
  }
  document.addEventListener('fullscreenchange', () => {
    syncFullscreen();
    if (!document.fullscreenElement) {
      ownsFullscreen = false;
      screenStatus('Windowed DOS mode.');
    }
  });
  syncFullscreen();
  $('dosHelpClose').onclick = () => help.close();
  help.addEventListener('close', () => restore(helpOrigin));
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (enabled) {
        consume(e);
        return;
      }
      if (active >= 0 && !bar.contains(e.target)) {
        close();
      }
    },
    true,
  );
  // detail > 0 identifies pointer-generated clicks. Keyboard activation and
  // programmatic command forwarding must remain available in keyboard-only mode.
  document.addEventListener(
    'click',
    (e) => {
      if (enabled && e.detail > 0) {
        consume(e);
      }
    },
    true,
  );
  bar.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !bar.contains(e.relatedTarget)) {
      close();
    }
  });
  // Capture-phase routing runs before app.js shortcuts. Editing controls, IME,
  // and dialogs retain native keys; menu keys are consumed to avoid drawing.
  // Keep this precedence when adding new shortcuts or modal interfaces.
  document.addEventListener(
    'keydown',
    (e) => {
      if (help.open) {
        e.stopImmediatePropagation();
        return;
      }
      if (
        !enabled ||
        e.defaultPrevented ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        modal() ||
        editable(e.target)
      ) {
        return;
      }
      const focused = menus.findIndex((m) => m.trigger === document.activeElement);
      const inside = bar.contains(document.activeElement);
      if (e.key === 'F10') {
        consume(e);
        if (active >= 0 || inside) {
          close(true);
        } else {
          origin = document.activeElement;
          rove(0);
          menus[0].trigger.focus();
        }
        return;
      }
      if (e.key === 'Escape' && (active >= 0 || inside)) {
        consume(e);
        close(true);
        return;
      }
      if (inside) {
        const index = active >= 0 ? active : Math.max(0, focused);
        const m = menus[index];
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          consume(e);
          const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
          if (active >= 0) {
            open(next);
          } else {
            rove(next);
            menus[next].trigger.focus();
          }
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          consume(e);
          if (active < 0) {
            if (e.key === 'Home' || e.key === 'End') {
              const n = e.key === 'Home' ? 0 : menus.length - 1;
              rove(n);
              menus[n].trigger.focus();
            } else {
              open(index, e.key === 'ArrowUp' ? -1 : 0);
            }
            return;
          }
          const available = items(m);
          const current = available.indexOf(document.activeElement);
          let next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? available.length - 1
                : (current + (e.key === 'ArrowDown' ? 1 : -1) + available.length) %
                  available.length;
          available[next]?.focus();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          consume(e);
          if (focused >= 0) {
            if (menus[focused].action) {
              menus[focused].action();
            } else {
              open(focused);
            }
          } else {
            document.activeElement?.click();
          }
          return;
        }
        if (e.key === 'Tab') {
          m.trigger.focus();
          close();
          return;
        }
        // Prevent existing drawing-tool and color shortcuts while a menu is active.
        if (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace') {
          consume(e);
          return;
        }
      }
      if (e.key === 'Escape' && document.body.dataset.dosPanel !== 'canvas') {
        consume(e);
        closePanel();
        return;
      }
      if (shortcuts[e.key]) {
        consume(e);
        if (!e.repeat) {
          invoke(shortcuts[e.key]);
        }
      }
    },
    true,
  );
})();
