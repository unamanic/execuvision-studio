/**
 * Controller shared by the modern and DOS interfaces. EVStudio (aliased S)
 * supplies pure raster/project operations; EVVideo owns recorder lifetimes.
 *
 * State changes follow: checkpoint -> mutate current slide -> refresh affected UI.
 * Canvas overlays, drag previews, and selections are temporary interaction state;
 * they must not leak into saved pixels. Native-format limits live in
 * public/RECONSTRUCTION.md. Script order and DOM IDs are defined in index.html.
 */
'use strict';
const S = EVStudio;
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

// Persistent presentation state. Undo snapshots share untouched slides; use
// checkpoint() before editing pixels, palette, names, order, or motion settings.
let slides = S.demo();
let index = 0;
let title = 'A new way to present';
let tool = 'pencil';
let color = 3;

// Transient interaction state: selection is a pixel rectangle; clipboard owns
// a copied raster; pending is an uncommitted placement; drag describes a gesture.
let selection = null;
let clipboard = null;
let pending = null;
let drag = null;
let library = [];
let dirty = false;
let mode = 'create';
let history = [];
let future = [];

// Monotonic import token. A later import/clear/cancel invalidates older async work.
let generation = 0;

// DOS two-point tools remember the first corner until Enter completes it or
// Esc/tool/slide changes cancel it. Cursor coordinates always use native pixels.
let keyboardAnchor = null;
let activeMotion = -1;
let keyboard = { x: 160, y: 100 };

// Playback has its own slide index; advancing the show does not change the
// selected editor slide. Video export from Run uses the playback index.
let runIndex = 0;
let auto = false;
let runStart = 0;
let runFrame = 0;
let runAnimation = null;

const toolDefs = [
  ['pencil', '✎', 'Pencil', 'P'],
  ['erase', '⌫', 'Erase', 'E'],
  ['line', '╱', 'Line', 'L'],
  ['rect', '□', 'Box', 'B'],
  ['ellipse', '○', 'Ellipse', 'O'],
  ['fill', '▨', 'Fill', 'F'],
  ['select', '⌗', 'Select', 'S'],
  ['text', 'T', 'Text', 'T'],
  ['chart', '▥', 'PLOT', 'G'],
  ['eyedrop', '⌁', 'Pick', 'I'],
];
const rgbNames = [
  'Black',
  'Blue',
  'Green',
  'Cyan',
  'Red',
  'Magenta',
  'Brown',
  'Light gray',
  'Dark gray',
  'Bright blue',
  'Bright green',
  'Bright cyan',
  'Bright red',
  'Bright magenta',
  'Yellow',
  'White',
];
const current = () => slides[index];
const palette = (s) =>
  ExecuVision.cgaPalette(s.palette.background, s.palette.family, s.palette.intensity);
// Copy mutable values owned by a slide. Original source bytes are immutable
// provenance, so snapshots can share that buffer without copying it again.
const copySlide = (s) => ({
  ...s,
  pixels: s.pixels.slice(),
  palette: { ...s.palette },
  motions: S.motionList(s).map((m) => ({ ...m })),
});
function status(s) {
  $('status').textContent = s;
}

/**
 * Save the pre-edit state, discard redo, then detach the slide being edited.
 * Callers must obtain current() after this call, rather than mutate an older
 * reference that is now part of history. A whole pointer gesture uses one entry.
 */
function checkpoint() {
  history.push({ slides: slides.slice(), index, title });
  if (history.length > 40) {
    history.shift();
  }
  future = [];
  slides = slides.slice();
  slides[index] = copySlide(current());
  dirty = true;
  syncUndo();
}

// Undo and redo use the same stack transfer. Clear transient selection/placement
// because those rectangles may refer to a slide state that no longer exists.
function restore(from, to) {
  if (!from.length) {
    return;
  }
  to.push({ slides: slides.slice(), index, title });
  const old = from.pop();
  slides = old.slides.slice();
  index = old.index;
  title = old.title;
  selection = pending = null;
  activeMotion = -1;
  dirty = true;
  refresh();
  status('Presentation restored.');
}

function syncUndo() {
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
}

function paint(c, r, p = palette(current())) {
  const cx = c.getContext('2d');
  c.width = r.width;
  c.height = r.height;
  cx.putImageData(new ImageData(ExecuVision.rgba(r, p), r.width, r.height), 0, 0);
}

// Paint from slide data each time. Pending placements use a temporary raster;
// selection borders and the keyboard cursor are canvas-only decorations.
function render() {
  dosCanvasHint();
  const s = current();
  let r = s;
  if (pending) {
    r = S.clone(s);
    S.blit(r, pending.raster, pending.x, pending.y, $('mix').checked);
  }
  paint(canvas, r, palette(s));
  if (selection) {
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width - 1, selection.height - 1);
    ctx.lineDashOffset = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width - 1, selection.height - 1);
    ctx.restore();
  }
  if (document.activeElement === canvas && !drag) {
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(keyboard.x - 3.5, keyboard.y + 0.5);
    ctx.lineTo(keyboard.x + 4.5, keyboard.y + 0.5);
    ctx.moveTo(keyboard.x + 0.5, keyboard.y - 3.5);
    ctx.lineTo(keyboard.x + 0.5, keyboard.y + 4.5);
    ctx.stroke();
  }
  syncSelection();
}

function renderPalette() {
  const p = palette(current());
  $('swatches').replaceChildren(
    ...p.map((c, i) => {
      let b = document.createElement('button');
      b.style.backgroundColor = `rgb(${c})`;
      b.className = i === color ? 'active' : '';
      b.title = `Color ${i + 1}: RGB ${c.join(', ')} (key ${i + 1})`;
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(i === color));
      b.innerHTML = `<span>${i + 1}</span>`;
      b.onclick = () => {
        color = i;
        renderPalette();
      };
      return b;
    }),
  );
  $('paletteFamily').value = `${current().palette.family},${current().palette.intensity}`;
  $('background').value = current().palette.background;
}

function thumb(s) {
  const c = document.createElement('canvas');
  paint(c, s, palette(s));
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// Rendering and selection state
function renderSlides() {
  $('slideCount').textContent = String(slides.length).padStart(2, '0');
  $('slides').replaceChildren(
    ...slides.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'slide-card' + (i === index ? ' active' : '');
      b.setAttribute('aria-label', `Slide ${i + 1}: ${s.name}`);
      b.setAttribute('aria-current', String(i === index));
      b.append(thumb(s));
      const label = document.createElement('span');
      const n = document.createElement('b');
      n.textContent = String(i + 1).padStart(2, '0');
      label.append(n, document.createTextNode(s.name));
      b.append(label);
      b.onclick = () => selectSlide(i);
      return b;
    }),
  );
  if (mode === 'prepare') {
    renderPrepare();
  }
}

function syncSelection() {
  const has = !!selection;
  for (const id of ['copy', 'cut', 'deleteSelection', 'savePix', 'clearSelection']) {
    $(id).disabled = !has;
  }
  $('paste').disabled = !clipboard;
  $('plotSelection').disabled = !has;
  $('selectionInfo').textContent = has
    ? `${selection.width} × ${selection.height} at ${selection.x}, ${selection.y}. Drag inside to move.`
    : 'Drag a selection to copy, move, or save a picture.';
  $('setMotion').disabled =
    !has || (activeMotion < 0 && S.motionList(current()).length >= S.MAX_MOTIONS);
  $('setMotion').textContent = activeMotion < 0 ? 'Add motion' : 'Update motion';
  $('removeMotion').disabled = activeMotion < 0;
}

function renderMotionList() {
  const motions = S.motionList(current());
  if (activeMotion >= motions.length) {
    activeMotion = -1;
  }
  $('motionCount').textContent = motions.length + ' / ' + S.MAX_MOTIONS;
  $('motionList').replaceChildren(
    ...motions.map((m, i) => {
      const b = document.createElement('button');
      b.className = 'motion-item' + (i === activeMotion ? ' active' : '');
      b.setAttribute('aria-pressed', String(i === activeMotion));
      b.setAttribute('aria-label', `Edit motion ${i + 1}: ${m.name || 'Motion ' + (i + 1)}`);
      const name = document.createElement('strong');
      const detail = document.createElement('span');
      name.textContent = `${i + 1}. ${m.name || 'Motion ' + (i + 1)}`;
      detail.textContent = `${m.width}×${m.height} · move ${m.dx}, ${m.dy} · speed ${m.speed} · start ${(m.delay || 0) / 1000}s${m.trail ? ' · trails' : ''}`;
      b.append(name, detail);
      b.onclick = () => editMotion(i);
      return b;
    }),
  );
  $('motionInfo').textContent =
    activeMotion >= 0
      ? `Editing motion ${activeMotion + 1}. Adjust the settings and choose Update motion.`
      : motions.length
        ? `${motions.length} motions on this slide. Select another region to add one, or choose a motion above to edit.`
        : 'Select a picture region, then choose Add motion.';
  syncSelection();
}

// Selecting a motion restores its source rectangle and controls; it does not
// add a motion or alter the raster until the user commits an edit.
function editMotion(i) {
  const m = S.motionList(current())[i];
  if (!m) {
    return;
  }
  activeMotion = i;
  pending = null;
  selection = { x: m.x, y: m.y, width: m.width, height: m.height };
  setTool('select');
  $('motionName').value = m.name || 'Motion ' + (i + 1);
  $('motionX').value = m.dx;
  $('motionY').value = m.dy;
  $('motionSpeed').value = m.speed;
  $('motionDelay').value = (m.delay || 0) / 1000;
  $('motionTrail').checked = m.trail;
  renderMotionList();
  status(`Editing ${m.name || 'motion ' + (i + 1)}. Its region is selected on the canvas.`);
}

function refresh() {
  render();
  renderPalette();
  renderSlides();
  syncUndo();
  $('slideName').value = current().name;
  renderMotionList();
}

function selectSlide(i) {
  keyboardAnchor = null;
  index = S.clamp(i, 0, slides.length - 1);
  selection = pending = null;
  activeMotion = -1;
  refresh();
}

function setTool(name) {
  keyboardAnchor = null;
  tool = name;
  pending = null;
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === name);
    b.setAttribute('aria-pressed', String(b.dataset.tool === name));
  });
  $('textOptions').hidden = name !== 'text';
  $('chartOptions').hidden = name !== 'chart';
  const hints = {
    pencil: 'Pencil · drag to draw. Shift + arrow keys for precision.',
    erase: 'Erase · drag to paint with the background color.',
    line: 'Line · drag from start to end.',
    rect: 'Box · drag to define the shape. Use Filled shapes for a solid box.',
    ellipse: 'Ellipse · drag to define the shape.',
    fill: 'Fill · click a connected area to replace its color.',
    select: 'Select · drag a box. Drag inside it to move; Copy or Cut to reuse.',
    text: 'Text · choose a style and click where the text should start.',
    chart:
      'PLOT · enter data for a pie, bar, or line graph. Plot in a selection or click to place.',
    eyedrop: 'Pick · click a pixel to use its color.',
  };
  $('toolHint').textContent = hints[name];
  render();
}
for (const [id, icon, label, key] of toolDefs) {
  const b = document.createElement('button');
  b.dataset.tool = id;
  b.innerHTML = `<b aria-hidden="true">${icon}</b>${label}`;
  b.title = `${label} (${key})`;
  b.onclick = () => setTool(id);
  $('tools').append(b);
}
S.fontNames.forEach((name, i) => $('fontStyle').add(new Option(name, i)));
rgbNames.forEach((n, i) => $('background').add(new Option(n, i)));
for (let i = 1; i <= 9; i++) {
  $('motionSpeed').add(new Option(i, i));
}
$('motionSpeed').value = 5;
// CSS can scale the canvas (including DOS fullscreen). Convert pointer positions
// back to the 320 x 200 grid before applying any drawing operation.
function coords(e) {
  const b = canvas.getBoundingClientRect();
  return {
    x: S.clamp(Math.floor(((e.clientX - b.left) / b.width) * 320), 0, 319),
    y: S.clamp(Math.floor(((e.clientY - b.top) / b.height) * 200), 0, 199),
  };
}

// Pointer/keyboard corners are inclusive; add one when converting to pixel counts.
function bounds(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
  };
}

function inside(p, b) {
  return b && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
}

// Mouse and keyboard drawing
function drawShape(r, start, end) {
  const c = tool === 'erase' ? 0 : color;
  const size = Number($('brush').value);
  if (tool === 'pencil' || tool === 'erase' || tool === 'line') {
    S.line(r, start.x, start.y, end.x, end.y, c, size);
  } else if (tool === 'rect' || tool === 'ellipse') {
    const b = bounds(start, end);
    S[tool](r, b.x, b.y, b.width, b.height, c, $('filled').checked);
  }
}

function dosCanvasHint() {
  if (!document.body?.classList?.contains?.('dos-mode')) {
    const normal = {
      pencil: 'Pencil · drag to draw. Shift + arrow keys for precision.',
      erase: 'Erase · drag to paint with the background color.',
      line: 'Line · drag from start to end.',
      rect: 'Box · drag to define the shape.',
      ellipse: 'Ellipse · drag to define the shape.',
      fill: 'Fill · click a connected area to replace its color.',
      select: 'Select · drag a region to copy or move.',
      text: 'Text · choose a style and click where text should start.',
      chart: 'PLOT · enter data, then click to place a graph.',
      eyedrop: 'Pick · click a pixel to use its color.',
    };
    $('toolHint').textContent = normal[tool] || '';
    return;
  }
  const labels = {
    pencil: 'Enter paints one point; Shift + arrows draws.',
    erase: 'Enter erases one point; Shift + arrows erases.',
    line: 'Enter sets the start; move with arrows; Enter draws the line.',
    rect: 'Enter sets one corner; arrows move; Enter draws the box.',
    ellipse: 'Enter sets one corner; arrows move; Enter draws the ellipse.',
    select: 'Enter sets one corner; arrows move; Enter selects the region.',
    fill: 'Enter fills the area at the cursor.',
    eyedrop: 'Enter picks the color at the cursor.',
    text: 'Set text in Create > Toolbox; Enter on canvas places it.',
    chart: 'Set data in Create > Toolbox; Enter on canvas places the graph.',
  };
  $('toolHint').textContent = pending
    ? 'Arrows position the picture; Enter places it; Esc cancels.'
    : (labels[tool] || '') + ' Arrows move the cursor. Esc cancels.';
}

function studioInterfaceChanged() {
  keyboardAnchor = null;
  render();
}

// Enter first commits a pending paste, then handles two-corner tools, then
// point tools. This mirrors mouse operations without synthesizing pointer events.
function dosCanvasEnter() {
  const p = { ...keyboard };
  try {
    if (pending) {
      checkpoint();
      S.blit(current(), pending.raster, p.x, p.y, $('mix').checked);
      selection = {
        x: p.x,
        y: p.y,
        width: Math.min(pending.raster.width, 320 - p.x),
        height: Math.min(pending.raster.height, 200 - p.y),
      };
      pending = null;
      keyboardAnchor = null;
      activeMotion = -1;
      refresh();
      status('Picture placed with the keyboard.');
      return;
    }
    if (tool === 'eyedrop') {
      color = current().pixels[p.y * 320 + p.x];
      renderPalette();
      status('Color picked at the cursor.');
      return;
    }
    if (['line', 'rect', 'ellipse', 'select'].includes(tool)) {
      if (!keyboardAnchor || keyboardAnchor.slide !== current() || keyboardAnchor.tool !== tool) {
        keyboardAnchor = { ...p, slide: current(), tool };
        status('First point set. Move with arrows and press Enter again; Esc cancels.');
        render();
        return;
      }
      const start = keyboardAnchor;
      keyboardAnchor = null;
      activeMotion = -1;
      if (tool === 'select') {
        selection = bounds(start, p);
        $('motionName').value = '';
        render();
        renderMotionList();
        status('Region selected. Use Create to copy, cut or save PIX.');
        return;
      }
      checkpoint();
      selection = null;
      drawShape(current(), start, p);
      refresh();
      status('Shape drawn with the keyboard.');
      return;
    }
    const piece = tool === 'chart' ? chartRaster() : null;
    checkpoint();
    selection = null;
    activeMotion = -1;
    if (piece) {
      S.blit(current(), piece, p.x, p.y, $('mix').checked);
    } else if (tool === 'text') {
      S.text(
        current(),
        $('textValue').value,
        p.x,
        p.y,
        color,
        Number($('fontSize').value),
        Number($('fontStyle').value),
      );
    } else if (tool === 'fill') {
      S.fill(current(), p.x, p.y, color);
    } else {
      drawShape(current(), p, p);
    }
    refresh();
    status('Keyboard ' + tool + ' applied at ' + p.x + ', ' + p.y + '.');
  } catch (err) {
    status(err.message);
  }
}

function chartRaster(width = 180, height = 112) {
  return S.plot($('chartType').value, S.parsePlotData($('chartData').value), width, height);
}
$('plotSelection').onclick = () => {
  if (!selection) {
    return;
  }
  try {
    if (selection.width < 60 || selection.height < 50) {
      throw Error('Choose an area at least 60 × 50 pixels so the graph is legible.');
    }
    const plot = chartRaster(selection.width, selection.height);
    checkpoint();
    S.blit(current(), plot, selection.x, selection.y, false);
    refresh();
    status('PLOT generated the graph inside the selected area.');
  } catch (err) {
    status(err.message);
  }
};
$('plotExample').onclick = () => {
  $('chartType').value = 'stacked';
  $('chartData').value =
    'PC, Cost, Margin, Distribution\nA, 200, 80, 120\nB, 800, 200, 400\nC, 1200, 300, 500';
  status('Price-components data ready. Choose an area or click the canvas to plot.');
};

// One checkpoint begins each modifying gesture. Store its starting bitmap so
// shape/move previews can be redrawn without accumulating intermediate marks.
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) {
    return;
  }
  e.preventDefault();
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const p = coords(e);
  keyboard = p;
  try {
    if (pending) {
      activeMotion = -1;
      checkpoint();
      S.blit(current(), pending.raster, p.x, p.y, $('mix').checked);
      selection = {
        x: p.x,
        y: p.y,
        width: Math.min(pending.raster.width, 320 - p.x),
        height: Math.min(pending.raster.height, 200 - p.y),
      };
      pending = null;
      render();
      renderSlides();
      status('Picture placed.');
      return;
    }
    if (tool === 'eyedrop') {
      color = current().pixels[p.y * 320 + p.x];
      renderPalette();
      return;
    }
    if (tool === 'select') {
      if (inside(p, selection)) {
        const b = { ...selection };
        const piece = S.crop(current(), b);
        checkpoint();
        S.rect(current(), b.x, b.y, b.width, b.height, 0, true);
        drag = { start: p, base: current().pixels.slice(), piece, box: b, moving: true };
      } else {
        activeMotion = -1;
        $('motionName').value = '';
        selection = bounds(p, p);
        drag = { start: p, selecting: true };
        renderMotionList();
      }
      render();
      return;
    }
    if (tool === 'text' || tool === 'chart') {
      const piece = tool === 'chart' ? chartRaster() : null;
      checkpoint();
      if (piece) {
        S.blit(current(), piece, p.x, p.y, $('mix').checked);
      } else {
        S.text(
          current(),
          $('textValue').value,
          p.x,
          p.y,
          color,
          Number($('fontSize').value),
          Number($('fontStyle').value),
        );
      }
      selection = null;
      refresh();
      status(tool === 'text' ? 'Text placed.' : 'PLOT generated the graph.');
      return;
    }
    checkpoint();
    selection = null;
    activeMotion = -1;
    if (tool === 'fill') {
      S.fill(current(), p.x, p.y, color);
      refresh();
      return;
    }
    drag = { start: p, last: p, base: current().pixels.slice() };
    drawShape(current(), p, p);
    render();
  } catch (err) {
    status(err.message);
  }
});
// Pencil/erase accumulate strokes; geometric shapes and moved selections
// restore the gesture baseline on every move. Selection-only gestures do not edit.
canvas.addEventListener('pointermove', (e) => {
  const p = coords(e);
  $('coords').textContent = `X ${String(p.x).padStart(3, '0')} / Y ${String(p.y).padStart(3, '0')}`;
  if (pending) {
    pending.x = p.x;
    pending.y = p.y;
    render();
    return;
  }
  if (!drag) {
    return;
  }
  keyboard = p;
  if (drag.selecting) {
    selection = bounds(drag.start, p);
  } else if (drag.moving) {
    current().pixels = drag.base.slice();
    selection = {
      ...drag.box,
      x: S.clamp(drag.box.x + p.x - drag.start.x, 0, 320 - drag.box.width),
      y: S.clamp(drag.box.y + p.y - drag.start.y, 0, 200 - drag.box.height),
    };
    S.blit(current(), drag.piece, selection.x, selection.y, $('mix').checked);
  } else {
    if (tool !== 'pencil' && tool !== 'erase') {
      current().pixels = drag.base.slice();
    }
    drawShape(current(), tool === 'pencil' || tool === 'erase' ? drag.last : drag.start, p);
    drag.last = p;
  }
  render();
});
// Finish pointer-up, cancellation, and capture loss through the same path.
// Moving a selected motion also moves its source region within the same undo step.
function endDrag() {
  if (!drag) {
    return;
  }
  const moved = !drag.selecting;
  if (drag.moving && activeMotion >= 0) {
    Object.assign(current().motions[activeMotion], selection);
  }
  drag = null;
  render();
  if (moved) {
    renderSlides();
  }
  renderMotionList();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('blur', render);
canvas.addEventListener('focus', render);
$('undo').onclick = () => restore(history, future);
$('redo').onclick = () => restore(future, history);
$('copy').onclick = () => {
  if (!selection) {
    return;
  }
  clipboard = S.crop(current(), selection);
  syncSelection();
  status(`Copied ${clipboard.width} × ${clipboard.height} pixels.`);
};
$('cut').onclick = () => {
  if (!selection) {
    return;
  }
  $('copy').onclick();
  checkpoint();
  S.rect(current(), selection.x, selection.y, selection.width, selection.height, 0, true);
  refresh();
  status('Picture cut. Choose Paste and click to place it.');
};
$('paste').onclick = () => {
  if (!clipboard) {
    return;
  }
  pending = { raster: S.clone(clipboard), x: selection?.x ?? 20, y: selection?.y ?? 20 };
  selection = null;
  activeMotion = -1;
  render();
  renderMotionList();
  status('Click the canvas to place the picture. Escape cancels.');
};
$('deleteSelection').onclick = () => {
  if (!selection) {
    return;
  }
  checkpoint();
  S.rect(current(), selection.x, selection.y, selection.width, selection.height, 0, true);
  selection = null;
  refresh();
};
$('clearSelection').onclick = () => {
  selection = null;
  pending = null;
  activeMotion = -1;
  render();
  renderMotionList();
};
$('paletteFamily').onchange = () => {
  checkpoint();
  const [family, intensity] = $('paletteFamily').value.split(',').map(Number);
  Object.assign(current().palette, { family, intensity });
  refresh();
};
$('background').onchange = () => {
  checkpoint();
  current().palette.background = Number($('background').value);
  refresh();
};
$('slideName').onchange = () => {
  checkpoint();
  current().name = $('slideName').value.trim() || 'Untitled slide';
  refresh();
};
$('zoom').onchange = () => {
  const z = $('zoom').value;
  canvas.parentElement.style.width = z === 'fit' ? '' : `${320 * Number(z)}px`;
  canvas.parentElement.style.maxWidth = z === 'fit' ? '960px' : 'none';
  status(z === 'fit' ? 'Canvas fits the workspace.' : `Canvas at ${z}× native resolution.`);
};
function addSlide(s) {
  if (slides.length >= 100) {
    status('This presentation has reached its 100-slide limit.');
    return;
  }
  checkpoint();
  slides.splice(index + 1, 0, s);
  index++;
  selection = pending = null;
  activeMotion = -1;
  refresh();
}

// Slide ordering and motion editing
$('addSlide').onclick = () =>
  addSlide({
    ...S.raster(),
    name: `Untitled ${slides.length + 1}`,
    palette: { ...current().palette },
    source: null,
  });
$('duplicateSlide').onclick = () => {
  let s = copySlide(current());
  s.name += ' copy';
  addSlide(s);
};
$('deleteSlide').onclick = () => {
  if (slides.length === 1) {
    status('Keep at least one slide. Use New project to start fresh.');
    return;
  }
  checkpoint();
  slides.splice(index, 1);
  index = Math.min(index, slides.length - 1);
  selection = pending = null;
  activeMotion = -1;
  refresh();
  status('Slide deleted. Undo restores it.');
};
function renderPrepare() {
  $('prepareGrid').replaceChildren(
    ...slides.map((s, i) => {
      const box = document.createElement('article');
      box.className = 'prepare-card';
      box.append(thumb(s));
      const label = document.createElement('strong');
      label.textContent = `${String(i + 1).padStart(2, '0')} / ${s.name}`;
      box.append(label);
      const row = document.createElement('div');
      for (const [text, delta] of [
        ['←', -1],
        ['→', 1],
      ]) {
        const b = document.createElement('button');
        b.textContent = text;
        b.title = delta < 0 ? 'Move earlier' : 'Move later';
        b.disabled = i + delta < 0 || i + delta >= slides.length;
        b.onclick = () => {
          checkpoint();
          [slides[i], slides[i + delta]] = [slides[i + delta], slides[i]];
          if (index === i) {
            index += delta;
          } else if (index === i + delta) {
            index = i;
          }
          refresh();
        };
        row.append(b);
      }
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.textContent = 'Edit slide';
      edit.onclick = () => {
        selectSlide(i);
        setMode('create');
      };
      row.append(edit);
      box.append(row);
      return box;
    }),
  );
}

function setMode(m) {
  if (m === 'run') {
    startRun();
    return;
  }
  if (m === 'print') {
    printDeck();
    return;
  }
  mode = m;
  document
    .querySelectorAll('[data-mode]')
    .forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $('workspace').hidden = m !== 'create';
  $('prepareView').hidden = m !== 'prepare';
  if (m === 'prepare') {
    renderPrepare();
  }
}
document
  .querySelectorAll('[data-mode]')
  .forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$('newMotion').onclick = () => {
  activeMotion = -1;
  selection = pending = null;
  $('motionName').value = '';
  $('motionX').value = 160;
  $('motionY').value = 0;
  $('motionSpeed').value = 5;
  $('motionDelay').value = 0;
  $('motionTrail').checked = false;
  setTool('select');
  renderMotionList();
  status('Drag a box around another graphic, then choose Add motion.');
};
$('setMotion').onclick = () => {
  if (!selection) {
    return;
  }
  try {
    const motions = S.motionList(current());
    if (activeMotion < 0 && motions.length >= S.MAX_MOTIONS) {
      throw Error('This slide has reached its 32-motion limit.');
    }
    const delayText = $('motionDelay').value;
    if (delayText.trim() === '') {
      throw Error('Enter a start time in seconds.');
    }
    const delay = Number(delayText) * 1000;
    if (!Number.isFinite(delay)) {
      throw Error('Enter a valid start time.');
    }
    const motion = S.validateMotion(
      {
        ...selection,
        name:
          $('motionName').value.trim() ||
          'Motion ' + (activeMotion < 0 ? motions.length + 1 : activeMotion + 1),
        dx: Number($('motionX').value),
        dy: Number($('motionY').value),
        speed: Number($('motionSpeed').value),
        trail: $('motionTrail').checked,
        delay: Math.round(delay),
      },
      activeMotion < 0 ? motions.length : activeMotion,
    );
    const editing = activeMotion >= 0;
    checkpoint();
    if (editing) {
      current().motions[activeMotion] = motion;
    } else {
      current().motions.push(motion);
      activeMotion = current().motions.length - 1;
    }
    refresh();
    editMotion(activeMotion);
    status(`${motion.name} ${editing ? 'updated' : 'added'}. Preview slide plays all motions.`);
  } catch (err) {
    status(err.message);
  }
};
$('removeMotion').onclick = () => {
  if (activeMotion < 0) {
    return;
  }
  checkpoint();
  current().motions.splice(activeMotion, 1);
  activeMotion = -1;
  selection = null;
  refresh();
  status('Motion removed. The picture stays on the slide; Undo restores the motion.');
};
$('previewMotion').onclick = () => startRun();

// Project downloads and original-media import
function download(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  status(`Downloaded ${name}`);
}
const safeName = (s) => s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'slide';
$('saveProject').onclick = () => {
  download(S.projectJSON(slides, title), safeName(title) + '.evstudio', 'application/json');
  dirty = false;
};
$('openProject').onclick = () => $('projectFile').click();
$('projectFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) {
    return;
  }
  try {
    if (f.size > 32 * 1024 * 1024) {
      throw Error('Project exceeds 32 MiB');
    }
    const p = S.readProject(await f.text());
    checkpoint();
    slides = p.slides;
    title = p.title;
    index = 0;
    selection = pending = null;
    activeMotion = -1;
    refresh();
    status(`Opened ${f.name}. Undo returns to the previous presentation.`);
  } catch (err) {
    status(err.message);
  }
  e.target.value = '';
};
$('newProject').onclick = () => {
  checkpoint();
  slides = [
    {
      ...S.raster(),
      name: 'Untitled slide',
      palette: { background: 0, family: 1, intensity: 1 },
      source: null,
    },
  ];
  title = 'Untitled presentation';
  index = 0;
  selection = pending = null;
  activeMotion = -1;
  refresh();
  status('New presentation. Undo restores the previous one.');
};
$('exportEV').onclick = () => {
  try {
    const s = current();
    download(S.encodeEV(s, 1, s.source), `SLIDE${String(index + 1).padStart(3, '0')}.EV`);
    status('Native raster exported. Use Save project to retain chosen colors and web motion.');
  } catch (err) {
    status(err.message);
  }
};
$('savePix').onclick = () => {
  if (!selection) {
    return;
  }
  download(S.encodeEV(S.crop(current(), selection), 2), 'PIX001.EV');
  status('Selection exported as PIX001.EV. Palette settings remain in the project.');
};
$('exportPNG').onclick = () => {
  const c = thumb(current());
  c.toBlob((b) => {
    if (b) {
      download(b, safeName(current().name) + '.png', 'image/png');
    }
  }, 'image/png');
};
$('exportDeck').onclick = () => {
  try {
    const entries = slides.map((s, i) => ({
      name: `SLIDE${String(i + 1).padStart(3, '0')}.EV`,
      bytes: S.encodeEV(s, 1, s.source),
    }));
    entries.push(
      { name: 'EVSLIDE.TOC', bytes: S.makeToc(slides.map((s) => s.name)) },
      {
        name: 'PRESENTATION.evstudio',
        bytes: new TextEncoder().encode(S.projectJSON(slides, title)),
      },
      {
        name: 'READ-ME.txt',
        bytes: new TextEncoder().encode(
          'ExecuVision Studio export\r\nEV files contain inferred native raster records. New containers and TOCs have not been validated in the original DOS program. Imported opaque metadata is retained and can disagree with edited pixels. Open PRESENTATION.evstudio for the chosen palettes and web animation.\r\n',
        ),
      },
    );
    download(S.zipStore(entries), 'EXECUVISION-MEDIA.zip', 'application/zip');
  } catch (err) {
    status(err.message);
  }
};
function libraryRender() {
  const q = $('librarySearch').value.toLowerCase().trim();
  $('libraryCount').textContent = String(library.length).padStart(2, '0');
  $('clearLibrary').hidden = !library.length;
  if (!library.length) {
    return;
  }
  const entries = library.filter((e) => (e.title + ' ' + e.path).toLowerCase().includes(q));
  const cards = entries.slice(0, 100).map((e) => {
    const a = document.createElement('article');
    a.className = 'library-card';
    const c = document.createElement('canvas');
    paint(c, e.decoded, palette(current()));
    const name = document.createElement('strong');
    name.textContent = e.title;
    const meta = document.createElement('small');
    meta.textContent = `${e.decoded.kind === 1 ? 'SLIDE' : 'PIX'} / ${e.decoded.width}×${e.decoded.height} / ${e.path}`;
    a.append(c, name, meta);
    const controls = document.createElement('div');
    const add = document.createElement('button');
    const place = document.createElement('button');
    add.textContent = '＋ Slide';
    add.title = 'Add this graphic as a new slide';
    add.onclick = () => {
      const d = e.decoded;
      const s = {
        ...S.raster(),
        name: e.title,
        palette: { ...current().palette },
        source: d.kind === 1 && d.width === 320 && d.height === 200 ? e.bytes : null,
      };
      S.blit(s, d, 0, 0);
      addSlide(s);
      setMode('create');
      status(`Added ${e.title} as a slide.`);
    };
    place.textContent = 'Place PIX';
    place.onclick = () => {
      pending = { raster: S.clone(e.decoded), x: 0, y: 0 };
      selection = null;
      activeMotion = -1;
      setMode('create');
      render();
      renderMotionList();
      status('Click to place the library picture. Pixmix skips background pixels.');
    };
    controls.append(add, place);
    a.append(controls);
    return a;
  });
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'subtle';
    p.textContent = 'No matching pictures.';
    cards.push(p);
  }
  if (entries.length > 100) {
    const p = document.createElement('p');
    p.className = 'subtle';
    p.textContent = 'Showing the first 100 matches. Search to narrow the library.';
    cards.push(p);
  }
  $('library').replaceChildren(...cards);
}
$('librarySearch').oninput = libraryRender;
$('importMedia').onclick = () => $('mediaFiles').click();
const initialLibrary = $('library').innerHTML;
$('clearLibrary').onclick = () => {
  generation++;
  EVSevenZip.cancel();
  library = [];
  $('library').innerHTML = initialLibrary;
  $('importProgress').hidden = true;
  $('importReport').hidden = true;
  libraryRender();
  status('Library cleared. Slides are unchanged.');
};
$('cancelImport').onclick = () => {
  generation++;
  EVSevenZip.cancel();
  $('importProgress').hidden = true;
  status('Import cancelled. Previous library retained.');
};
/**
 * Stage an import entirely in memory, then replace the library only if readable
 * graphics were found and this is still the newest request. Existing slides are
 * independent of the library. Bounds apply across nested containers, not just
 * to each individual file; recoverable per-file errors are collected for the UI.
 */
async function importMedia(files) {
  const mine = ++generation;
  EVSevenZip.cancel();
  $('importProgress').hidden = false;
  $('importReport').hidden = true;
  status('Reading original media on this device…');
  const entries = [];
  const errors = [];
  const tables = new Map();
  const counts = new Map();
  let total = 0;
  let expanded = 0;
  try {
    if (files.length > 500) {
      throw Error('Choose no more than 500 input files.');
    }
    for (const f of files) {
      total += f.size;
      if (total > 64 * 1024 * 1024) {
        throw Error('Input batch exceeds 64 MiB.');
      }
    }
    async function expand(name, bytes, depth = 0) {
      if (mine !== generation) {
        throw Error('Import cancelled.');
      }
      expanded += bytes.length;
      if (expanded > 128 * 1024 * 1024) {
        throw Error('Expanded import exceeds 128 MiB.');
      }
      if (/\.(ev|toc)$/i.test(name)) {
        if (bytes.length > 1024 * 1024) {
          throw Error('EV/TOC file exceeds 1 MiB.');
        }
        if (entries.length >= 600) {
          throw Error('Too many EV/TOC entries.');
        }
        entries.push({ name, bytes });
        return;
      }
      if (depth > 2) {
        throw Error('Archive nesting exceeds two levels.');
      }
      let children;
      if (/\.zip$/i.test(name)) {
        children = await EVZip.read(bytes);
      } else if (/\.7z$/i.test(name)) {
        children = await EVSevenZip.read(bytes);
      } else if (/\.img$/i.test(name)) {
        children = S.diskFiles(bytes);
      } else {
        return;
      }
      for (const child of children) {
        if (/\.(ev|toc|zip|img)$/i.test(child.name)) {
          await expand(name + '!/' + child.name, child.bytes, depth + 1);
        }
      }
    }
    for (const f of files) {
      if (mine !== generation) {
        return;
      }
      try {
        if (!/\.(ev|toc|zip|7z|img)$/i.test(f.name)) {
          errors.push(`${f.name}: unsupported type.`);
          continue;
        }
        await expand(f.name, new Uint8Array(await f.arrayBuffer()));
      } catch (e) {
        errors.push(f.name + ': ' + e.message);
      }
    }
    if (mine !== generation) {
      return;
    }
    // Names are scoped to the containing directory/archive. Duplicate TOCs or EV
    // filenames must not silently attach an unrelated title from another disk.
    for (const e of entries) {
      const slash = e.name.lastIndexOf('/');
      const scope = e.name.slice(0, slash + 1);
      const name = e.name.slice(slash + 1).toUpperCase();
      e.scope = scope;
      e.basename = name;
      const key = scope + '|' + name;
      if (/\.TOC$/.test(name)) {
        if (name !== 'EVSLIDE.TOC' && name !== 'EVPIX.TOC') {
          continue;
        }
        if (tables.has(key)) {
          tables.set(key, null);
          errors.push(`${e.name}: duplicate table; names disabled.`);
        } else {
          tables.set(key, S.parseToc(e.bytes));
        }
      } else {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const accepted = [];
    for (const e of entries) {
      if (!/\.EV$/i.test(e.name)) {
        continue;
      }
      if (accepted.length >= 500) {
        errors.push('500-graphic limit reached.');
        break;
      }
      try {
        const d = ExecuVision.decodeEV(e.bytes);
        const m = /^(SLIDE|PIX)(\d+)\.EV$/.exec(e.basename);
        const table =
          m && tables.get(e.scope + '|' + (m[1] === 'PIX' ? 'EVPIX.TOC' : 'EVSLIDE.TOC'));
        accepted.push({
          bytes: e.bytes,
          decoded: d,
          path: e.name,
          title:
            (m && counts.get(e.scope + '|' + e.basename) === 1 && table?.get(Number(m[2]))) ||
            e.basename,
        });
      } catch (err) {
        errors.push(e.name + ': ' + err.message);
      }
    }
    if (!accepted.length) {
      throw Error(
        'No readable EV graphics found. Include EV files, a graphics disk ZIP, or a raw DOS disk image.',
      );
    }
    // Publish one complete result. Failed/cancelled imports keep the old library.
    library = accepted;
    $('librarySearch').value = '';
    libraryRender();
    status(
      `Opened ${accepted.length} graphics${errors.length ? ` · ${errors.length} import notes` : ''}. Choose ＋ Slide or Place PIX.`,
    );
  } catch (err) {
    if (mine === generation) {
      errors.push(err.message);
      status(err.message);
    }
  } finally {
    if (mine === generation) {
      $('importProgress').hidden = true;
      $('importReport').hidden = !errors.length;
      $('importErrors').textContent = errors.join('\n');
    }
  }
}
$('mediaFiles').onchange = (e) => {
  importMedia(Array.from(e.target.files));
  e.target.value = '';
};
let dropDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dropDepth++;
    $('dropOverlay').hidden = false;
  }
});
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
  }
});
document.addEventListener('dragleave', () => {
  if (--dropDepth <= 0) {
    $('dropOverlay').hidden = true;
  }
});
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files.length) {
    return;
  }
  e.preventDefault();
  dropDepth = 0;
  $('dropOverlay').hidden = true;
  const files = Array.from(e.dataTransfer.files);
  if (files.length === 1 && /\.(evstudio|json)$/i.test(files[0].name)) {
    status('Use Open project for .evstudio files.');
  } else {
    importMedia(files);
  }
});
function resetSkip() {
  const remaining = slides.length - 1 - runIndex;
  $('runSkipCount').value = '1';
  $('runSkipCount').max = String(Math.max(1, remaining));
  $('runSkipCount').disabled = $('runSkip').disabled = remaining === 0;
  $('runSkipStatus').textContent = '';
  $('runSkipCount').setAttribute('aria-invalid', 'false');
}

// This control advances by a relative number of positions, not an absolute
// slide number. Validate against remaining slides before changing playback state.
function skipRun() {
  if (!$('runDialog').open) {
    return;
  }
  const raw = $('runSkipCount').value.trim();
  const count = Number(raw);
  const remaining = slides.length - 1 - runIndex;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(count) || count < 1 || count > remaining) {
    $('runSkipStatus').textContent = remaining
      ? `Enter a whole number from 1 to ${remaining}.`
      : 'Already at the last slide. Use Previous to move backward.';
    $('runSkipCount').setAttribute('aria-invalid', 'true');
    return;
  }
  runIndex += count;
  resetRun();
  $('runSkipStatus').textContent =
    `Moved forward ${count} slide${count === 1 ? '' : 's'}. Now showing slide ${runIndex + 1} of ${slides.length}.`;
}
$('runSkip').onclick = skipRun;
$('runSkipCount').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (!e.repeat) {
      skipRun();
    }
  }
});

// Live slideshow playback
function startRun() {
  runIndex = index;
  auto = false;
  resetRun();
  $('runDialog').showModal();
  runFrame = requestAnimationFrame(frame);
  $('autoRun').textContent = '▶ Auto run';
  $('autoRun').classList.remove('active');
}

// Every slide boundary starts a fresh animation clock and trail cache.
function resetRun() {
  resetSkip();
  runStart = performance.now();
  runAnimation = S.createAnimation(slides[runIndex]);
  $('runTitle').textContent = slides[runIndex].name;
  $('runCounter').textContent = `${runIndex + 1} / ${slides.length}`;
  $('prevRun').disabled = runIndex === 0;
  $('nextRun').disabled = runIndex === slides.length - 1;
}

function frame(now) {
  if (!$('runDialog').open) {
    return;
  }
  const s = slides[runIndex];
  paint($('runCanvas'), runAnimation.frame(now - runStart), palette(s));
  if (auto && now - runStart >= Number($('interval').value) * 1000) {
    if (runIndex < slides.length - 1) {
      runIndex++;
      resetRun();
    } else {
      auto = false;
      $('autoRun').textContent = '▶ Replay';
      $('autoRun').classList.remove('active');
    }
  }
  runFrame = requestAnimationFrame(frame);
}

function closeRun() {
  resetSkip();
  cancelAnimationFrame(runFrame);
  auto = false;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  if ($('runDialog').open) {
    $('runDialog').close();
  }
}
$('closeRun').onclick = closeRun;
$('runDialog').addEventListener('cancel', closeRun);
$('runDialog').addEventListener('close', () => cancelAnimationFrame(runFrame));
$('nextRun').onclick = () => {
  if (runIndex < slides.length - 1) {
    runIndex++;
    resetRun();
  }
};
$('prevRun').onclick = () => {
  if (runIndex > 0) {
    runIndex--;
    resetRun();
  }
};
$('autoRun').onclick = () => {
  auto = !auto;
  if (auto) {
    if (runIndex === slides.length - 1) {
      runIndex = 0;
    }
    resetRun();
  }
  $('autoRun').textContent = auto ? 'Ⅱ Pause' : '▶ Auto run';
  $('autoRun').classList.toggle('active', auto);
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await $('runDialog').requestFullscreen();
    }
  } catch (e) {
    status(
      'Fullscreen is unavailable in this browser; the presentation still runs in this window.',
    );
  }
};

// Video export controls
let videoAbort = null;
let videoURL = null;
let videoBusy = false;
let videoSlideIndex = 0;
const videoFields = [
  'videoScope',
  'videoSeconds',
  'videoScale',
  'videoFps',
  'videoFormat',
  'videoFinish',
];
const videoDuration = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};
// UI controls use seconds; the timeline/animation internals use milliseconds.
function videoOptions() {
  return {
    seconds: Number($('videoSeconds').value),
    scale: Number($('videoScale').value),
    fps: Number($('videoFps').value),
    format: $('videoFormat').value,
    finishMotions: $('videoFinish').checked,
  };
}

function videoSlides() {
  return $('videoScope').value === 'current' ? [slides[videoSlideIndex]] : slides;
}

function videoEstimate() {
  try {
    const p = EVVideo.timeline(videoSlides(), videoOptions());
    $('videoEstimate').textContent =
      `${p.entries.length} slide${p.entries.length === 1 ? '' : 's'} · ${p.width} × ${p.height} · ${videoDuration(p.total)} video · ${p.fps} fps`;
    $('startVideo').disabled = videoBusy || !$('videoFormat').value;
  } catch (e) {
    $('videoEstimate').textContent = e.message;
    $('startVideo').disabled = true;
  }
}

// Object URLs keep their Blob alive. Revoke the previous result before opening
// another export or closing its dialog to avoid retaining large video buffers.
function clearVideoResult() {
  if (videoURL) {
    $('videoResult').pause();
    $('videoResult').removeAttribute('src');
    $('videoResult').load();
    URL.revokeObjectURL(videoURL);
    videoURL = null;
  }
  $('videoResult').hidden = true;
  $('videoDownload').hidden = true;
}

function setVideoBusy(busy) {
  videoBusy = busy;
  for (const id of videoFields) {
    $(id).disabled = busy;
  }
  $('cancelVideo').hidden = !busy;
  $('videoProgress').hidden = !busy;
  videoEstimate();
}

function openVideo() {
  videoSlideIndex = $('runDialog').open ? runIndex : index;
  if ($('runDialog').open) {
    closeRun();
  }
  const formats = EVVideo.formats();
  $('videoFormat').replaceChildren(...formats.map((f) => new Option(f.label, f.id)));
  $('videoSeconds').value = $('interval').value;
  $('videoStatus').textContent = formats.length
    ? 'Choose settings, then Create video.'
    : 'Video export is unavailable in this browser. Try a browser with canvas recording support.';
  $('videoDialog').showModal();
  videoEstimate();
}

function closeVideo() {
  videoAbort?.abort();
  clearVideoResult();
  if ($('videoDialog').open) {
    $('videoDialog').close();
  }
}
$('exportVideo').onclick = openVideo;
$('runExportVideo').onclick = openVideo;
$('closeVideo').onclick = closeVideo;
$('videoDialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  closeVideo();
});
for (const id of videoFields) {
  $(id).onchange = videoEstimate;
}
$('cancelVideo').onclick = () => videoAbort?.abort();
// Record a detached snapshot so UI state and later edits cannot alter frames
// midway through an asynchronous export. EVVideo.record owns stream cleanup.
$('startVideo').onclick = async () => {
  if (videoBusy) {
    return;
  }
  clearVideoResult();
  const snapshot = videoSlides().map((s) => ({
    ...s,
    pixels: s.pixels.slice(),
    palette: { ...s.palette },
    motions: S.motionList(s).map((m) => ({ ...m })),
  }));
  const options = videoOptions();
  const name = safeName($('videoScope').value === 'current' ? snapshot[0].name : title);
  const controller = new AbortController();
  videoAbort = controller;
  setVideoBusy(true);
  $('videoCanvas').hidden = false;
  $('videoProgress').value = 0;
  $('videoStatus').textContent = 'Starting video export…';
  let lastSecond = -1;
  try {
    const result = await EVVideo.record({
      slides: snapshot,
      options,
      canvas: $('videoCanvas'),
      signal: controller.signal,
      onProgress: (p) => {
        $('videoProgress').value = p.elapsed / p.total;
        const second = Math.floor(p.elapsed / 1000);
        if (second !== lastSecond) {
          lastSecond = second;
          $('videoStatus').textContent =
            `Recording slide ${p.index + 1} of ${p.count}: ${p.name} · ${videoDuration(p.elapsed)} / ${videoDuration(p.total)}`;
        }
      },
    });
    videoURL = URL.createObjectURL(result.blob);
    $('videoResult').src = videoURL;
    $('videoResult').hidden = false;
    $('videoDownload').href = videoURL;
    $('videoDownload').download = name + '.' + result.extension;
    $('videoDownload').hidden = false;
    $('videoDownload').textContent = 'Download ' + result.extension.toUpperCase() + ' ↓';
    $('videoStatus').textContent =
      `Video ready · ${videoDuration(result.duration)} · ${(result.blob.size / 1024 / 1024).toFixed(1)} MiB. Preview it or download below.`;
    status('Video export complete. Choose Download in the export dialog.');
  } catch (e) {
    $('videoStatus').textContent = e.message;
    status(
      e.name === 'AbortError'
        ? 'Video export cancelled. Your presentation is unchanged.'
        : e.message,
    );
  } finally {
    videoAbort = null;
    setVideoBusy(false);
    $('videoCanvas').hidden = true;
  }
};
function printDeck() {
  $('printPages').replaceChildren(
    ...slides.map((s, i) => {
      const a = document.createElement('article');
      const h = document.createElement('h2');
      const img = document.createElement('img');
      const p = document.createElement('p');
      h.textContent = s.name;
      img.src = thumb(s).toDataURL();
      img.alt = s.name;
      p.textContent = `${i + 1} / ${slides.length} · ExecuVision Studio`;
      a.append(h, img, p);
      return a;
    }),
  );
  requestAnimationFrame(() => window.print());
}
$('help').onclick = () => $('guide').showModal();
document
  .querySelectorAll('[data-close]')
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));

// Shared editing shortcuts
// Give active dialogs and text inputs their native keys first. DOS menu handling
// runs in the capture phase and consumes keys before this shared editor handler.
document.addEventListener('keydown', (e) => {
  if ($('videoDialog').open) {
    return;
  }
  if ($('runDialog').open) {
    if (
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
      e.target.isContentEditable ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.isComposing
    ) {
      return;
    }
    if (e.key === 'ArrowRight') {
      $('nextRun').onclick();
      e.preventDefault();
    }
    if (e.key === 'ArrowLeft') {
      $('prevRun').onclick();
      e.preventDefault();
    }
    if (e.key === ' ' && !/INPUT|SELECT|BUTTON/.test(e.target.tagName)) {
      $('autoRun').onclick();
      e.preventDefault();
    }
    return;
  }
  if ($('guide').open) {
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
    return;
  }
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    restore(e.shiftKey ? future : history, e.shiftKey ? history : future);
    return;
  }
  if (cmd && e.key.toLowerCase() === 's') {
    e.preventDefault();
    $('saveProject').onclick();
    return;
  }
  if (cmd && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
    const id = { c: 'copy', x: 'cut', v: 'paste' }[e.key.toLowerCase()];
    if (!$(id).disabled) {
      e.preventDefault();
      $(id).onclick();
    }
    return;
  }
  if (cmd) {
    return;
  }
  if (
    e.key === 'Enter' &&
    document.activeElement === canvas &&
    document.body?.classList?.contains?.('dos-mode')
  ) {
    e.preventDefault();
    if (!e.repeat) {
      dosCanvasEnter();
    }
    return;
  }
  if (e.key === 'Escape') {
    keyboardAnchor = null;
    pending = selection = null;
    activeMotion = -1;
    render();
    renderMotionList();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection) {
      e.preventDefault();
      $('deleteSelection').onclick();
    }
    return;
  }
  if (/^[1-4]$/.test(e.key)) {
    color = Number(e.key) - 1;
    renderPalette();
    return;
  }
  if (document.activeElement === canvas && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const prev = { ...keyboard };
    keyboard.x = S.clamp(
      keyboard.x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0),
      0,
      319,
    );
    keyboard.y = S.clamp(
      keyboard.y + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0),
      0,
      199,
    );
    if (
      e.shiftKey &&
      (!document.body?.classList?.contains?.('dos-mode') || ['pencil', 'erase'].includes(tool))
    ) {
      checkpoint();
      S.line(current(), prev.x, prev.y, keyboard.x, keyboard.y, tool === 'erase' ? 0 : color);
      renderSlides();
    }
    if (pending) {
      pending.x = keyboard.x;
      pending.y = keyboard.y;
    }
    $('coords').textContent =
      `X ${String(keyboard.x).padStart(3, '0')} / Y ${String(keyboard.y).padStart(3, '0')}`;
    render();
    return;
  }
  const t = toolDefs.find((x) => x[3].toLowerCase() === e.key.toLowerCase());
  if (t) {
    setTool(t[0]);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty || videoBusy) {
    e.preventDefault();
    e.returnValue = '';
  }
});
setTool('pencil');
refresh();
