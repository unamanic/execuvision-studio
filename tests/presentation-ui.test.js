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
document.body = { classList: { contains: (name) => name === 'dos-mode' && document.dosEnabled } };
document.dosEnabled = true;
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

const press = (key, target = elements.runCanvas, opts = {}) => {
  const e = {
    key,
    target,
    preventDefault() {
      this.prevented = true;
    },
    ...opts,
  };
  document.listeners.keydown(e);
  return e;
};
run('startRun()');
assert.equal(elements.runDialog.open, true);
assert.equal(run('runIndex'), 0);
for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
  const e = press('ArrowRight', { tagName: tag });
  assert.ok(!e.prevented);
  assert.equal(run('runIndex'), 0);
}
assert.ok(!press('ArrowRight', { tagName: 'SPAN', isContentEditable: true }).prevented);
for (const prop of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
  assert.ok(!press('ArrowRight', elements.runCanvas, { [prop]: true }).prevented);
  assert.equal(run('runIndex'), 0);
}
assert.ok(press('ArrowRight').prevented);
assert.equal(run('runIndex'), 1);
assert.ok(press('ArrowLeft').prevented);
assert.equal(run('runIndex'), 0);
press('ArrowLeft');
assert.equal(run('runIndex'), 0);
run('runIndex=slides.length-1');
press('ArrowRight');
assert.equal(run('runIndex'), run('slides.length-1'));
console.log(
  'Presentation controls passed: native input/select/contenteditable arrows, modifiers and IME preserved; presentation arrows and boundaries work.',
);

run('closeRun();slides=slides.slice(0,3);index=0;startRun()');
assert.equal(elements.runSkipCount.value, '1');
assert.equal(elements.runSkipCount.max, '2');
for (const value of ['', '0', '-1', '1.5', '99', 'hello', '1e0']) {
  elements.runSkipCount.value = value;
  click('runSkip');
  assert.equal(run('runIndex'), 0);
  assert.equal(elements.runSkipCount.attributes['aria-invalid'], 'true');
  assert.match(elements.runSkipStatus.textContent, /whole number/);
}
elements.runSkipCount.value = '2';
click('runSkip');
assert.equal(run('runIndex'), 2);
assert.equal(elements.runSkip.disabled, true);
assert.equal(elements.runSkipCount.value, '1');
assert.match(elements.runSkipStatus.textContent, /slide 3 of 3/);
press('ArrowLeft');
assert.equal(run('runIndex'), 1);
assert.equal(elements.runSkip.disabled, false);
assert.equal(elements.runSkipCount.max, '1');
assert.equal(elements.runSkipStatus.textContent, '');
elements.runSkipCount.value = '1';
const enter = {
  key: 'Enter',
  preventDefault() {
    this.prevented = true;
  },
};
elements.runSkipCount.listeners.keydown(enter);
assert.ok(enter.prevented);
assert.equal(run('runIndex'), 2);
run('closeRun();index=0;startRun()');
elements.runSkipCount.value = '2';
elements.runSkipCount.listeners.keydown({ key: 'Enter', repeat: true, preventDefault() {} });
assert.equal(run('runIndex'), 0);
elements.runSkipCount.value = 'bad';
click('runSkip');
elements.runDialog.listeners.cancel();
assert.equal(elements.runDialog.open, false);
assert.equal(elements.runSkipStatus.textContent, '');
assert.equal(elements.runSkipCount.value, '1');
run('startRun();auto=true');
elements.runSkipCount.value = '1';
click('runSkip');
assert.equal(run('runIndex'), 1);
assert.equal(run('auto'), true);
assert.equal(run('runStart'), 1000);
console.log(
  'Relative advance passed: index+=N, input bounds/invalid feedback, Enter, repeat suppression, last-slide state, navigation reset, cancellation/reopening and timed playback continuity.',
);
