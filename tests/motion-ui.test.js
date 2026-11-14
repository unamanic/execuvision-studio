// Controller integration without a browser: real core + minimal DOM/event/canvas boundary.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  S = require('../dist/core.js');
const html = fs.readFileSync(require.resolve('../dist/index.html'), 'utf8'),
  ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1])),
  elements = {},
  all = [];
let raf = null;
class Element {
  constructor(tag = 'DIV') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    let value = '';
    Object.defineProperty(this, 'value', {
      get: () => value,
      set: (v) => {
        value = String(v);
      },
    });
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.open = false;
    this.parentElement = { style: {} };
    this.classList = { toggle() {}, add() {}, remove() {} };
    all.push(this);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  addEventListener(k, fn) {
    this.listeners[k] = fn;
  }
  add(option) {
    this.append(option);
    if (this.children.length === 1) this.value = String(option.value);
  }
  focus() {
    document.activeElement = this;
  }
  click() {
    if (!this.disabled) this.onclick?.({ target: this });
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 320, height: 200 };
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.listeners.close?.();
  }
  getContext() {
    return {
      putImageData: (d) => (this.image = d),
      save() {},
      restore() {},
      setLineDash() {},
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
    };
  }
  toBlob(cb) {
    cb(new Blob(['image']));
  }
  toDataURL() {
    return 'data:image/png;base64,';
  }
}
for (const id of ids) elements[id] = new Element(id.includes('canvas') ? 'canvas' : 'div');
const defaults = {
  brush: '1',
  fontSize: '2',
  fontStyle: '0',
  motionX: '160',
  motionY: '0',
  motionDelay: '0',
  motionSpeed: '5',
  zoom: 'fit',
  interval: '10',
  chartType: 'bar',
  chartData: 'Q1, 24\nQ2, 42',
  textValue: 'TEXT',
  paletteFamily: '1,1',
  background: '0',
};
for (const [id, v] of Object.entries(defaults)) elements[id].value = v;
elements.mix.checked = true;
const modes = ['create', 'prepare', 'run', 'print'].map((mode) => {
  let b = new Element('button');
  b.dataset.mode = mode;
  return b;
});
const document = {
  activeElement: null,
  fullscreenElement: null,
  getElementById(id) {
    assert.ok(ids.has(id), 'Missing HTML control: ' + id);
    return elements[id];
  },
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => ({ textContent: text }),
  querySelectorAll(q) {
    return q === '[data-tool]'
      ? all.filter((b) => b.dataset.tool)
      : q === '[data-mode]'
        ? modes
        : [];
  },
  listeners: {},
  addEventListener(k, fn) {
    this.listeners[k] = fn;
  },
};
const context = {
  document,
  window: { addEventListener() {}, print() {} },
  EVStudio: S,
  ExecuVision: require('../dist/execuvision.js'),
  EVZip: require('../dist/zip-reader.js'),
  EVSevenZip: { cancel() {} },
  Option: function (text, value) {
    this.text = text;
    this.value = value;
  },
  ImageData: function (data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  },
  Uint8Array,
  Uint8ClampedArray,
  TextEncoder,
  TextDecoder,
  Blob,
  Map,
  Set,
  console,
  performance: { now: () => 1000 },
  requestAnimationFrame: (fn) => {
    raf = fn;
    return 1;
  },
  cancelAnimationFrame: () => {
    raf = null;
  },
  setTimeout: (fn) => fn(),
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../dist/app.js'), 'utf8'), context);
const run = (code) => vm.runInContext(code, context),
  click = (id) => elements[id].click();
run('selectSlide(2)');
assert.equal(elements.motionList.children.length, 2);
assert.equal(elements.setMotion.disabled, true);
elements.motionList.children[0].click();
assert.equal(elements.setMotion.textContent, 'Update motion');
assert.equal(elements.setMotion.disabled, false);
assert.equal(elements.motionName.value, 'Red square');
elements.motionX.value = '120';
click('setMotion');
assert.equal(run('current().motions[0].dx'), 120);
assert.equal(run('current().motions[1].dx'), -220);
assert.equal(elements.motionList.children.length, 2);
// New selection adds, rather than replacing, the existing motions.
click('newMotion');
assert.equal(elements.setMotion.disabled, true);
const canvas = elements.canvas;
canvas.listeners.pointerdown({
  button: 0,
  clientX: 100,
  clientY: 20,
  pointerId: 1,
  preventDefault() {},
});
canvas.listeners.pointermove({ clientX: 130, clientY: 40 });
canvas.listeners.pointerup();
assert.equal(elements.setMotion.disabled, false);
assert.equal(elements.setMotion.textContent, 'Add motion');
elements.motionName.value = 'Title region';
elements.motionX.value = '-50';
elements.motionY.value = '60';
elements.motionDelay.value = '1.5';
elements.motionTrail.checked = true;
click('setMotion');
assert.equal(elements.motionList.children.length, 3);
assert.equal(run('current().motions[2].delay'), 1500);
assert.equal(run('current().motions[2].name'), 'Title region');
// Removal and undo preserve all other motions and restore the removed one.
click('removeMotion');
assert.equal(elements.motionList.children.length, 2);
click('undo');
assert.equal(elements.motionList.children.length, 3);
click('redo');
assert.equal(elements.motionList.children.length, 2);
// Selecting another slide cannot accidentally update a motion on the previous slide.
run('selectSlide(0)');
assert.equal(elements.motionList.children.length, 0);
assert.equal(elements.removeMotion.disabled, true);
assert.equal(elements.setMotion.disabled, true);
run('selectSlide(2)');
elements.motionList.children[1].click();
assert.equal(elements.motionName.value, 'Yellow disc');
assert.equal(Number(elements.motionDelay.value), 0.75);
assert.equal(Number(elements.motionX.value), -220);
// Moving a selected motion updates its source region together with the raster.
canvas.listeners.pointerdown({
  button: 0,
  clientX: 270,
  clientY: 80,
  pointerId: 1,
  preventDefault() {},
});
canvas.listeners.pointermove({ clientX: 260, clientY: 85 });
canvas.listeners.pointerup();
assert.equal(run('current().motions[1].x'), 256);
assert.equal(run('current().motions[1].y'), 83);
click('undo');
assert.equal(run('current().motions[1].x'), 266);
click('previewMotion');
assert.ok(elements.runDialog.open);
assert.ok(raf);
raf(2500);
assert.equal(elements.runCanvas.image.data.length, 256000);
click('closeRun');
assert.equal(elements.runDialog.open, false);
// Exporting the current slide from Run follows the visible presentation slide.
context.EVVideo = require('../dist/video.js');
run('selectSlide(0); startRun()');
click('nextRun');
elements.videoScope.value = 'current';
click('runExportVideo');
assert.equal(run('videoSlides()[0].name'), S.demo()[1].name);
assert.equal(run('index'), 0);
assert.equal(elements.runDialog.open, false);
assert.equal(elements.videoDialog.open, true);
click('closeVideo');
click('exportVideo');
assert.equal(run('videoSlides()[0].name'), S.demo()[0].name);
click('closeVideo');
// Reopen a v1 project saved by the previous public build through the actual file handler.
(async () => {
  const old = JSON.parse(S.projectJSON([S.demo()[2]], 'Old'));
  old.version = 1;
  old.slides[0].motion = old.slides[0].motions[0];
  delete old.slides[0].motions;
  const str = JSON.stringify(old);
  await elements.projectFile.onchange({
    target: {
      files: [{ name: 'old.evstudio', size: str.length, text: async () => str }],
      value: 'old',
    },
  });
  assert.equal(elements.motionList.children.length, 1);
  elements.motionList.children[0].click();
  assert.equal(elements.setMotion.textContent, 'Update motion');
  assert.equal(elements.setMotion.disabled, false);
  assert.equal(elements.motionName.value, 'Red square');
  console.log(
    'Controller checks passed: select/edit existing motion, add another, independent settings, remove/undo/redo, slide switching, move source, playback and legacy project loading.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
