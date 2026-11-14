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

const press = (key, opts = {}) => {
  const e = {
    key,
    target: elements.canvas,
    preventDefault() {
      this.prevented = true;
    },
    ...opts,
  };
  document.listeners.keydown(e);
  return e;
};
const at = (x, y) => run(`keyboard={x:${x},y:${y}}`);
elements.canvas.focus();
click('newProject');
run("setTool('pencil')");
at(5, 5);
press('Enter');
assert.equal(run('current().pixels[5*320+5]'), 3);
run("setTool('erase')");
press('Enter');
assert.equal(run('current().pixels[5*320+5]'), 0);
run("setTool('line')");
at(10, 10);
press('Enter');
at(15, 10);
press('Enter');
assert.equal(run('current().pixels[10*320+13]'), 3);
assert.equal(run('keyboardAnchor'), null);
run("setTool('rect')");
at(20, 20);
press('Enter');
const old = run('current().pixels.slice()');
press('ArrowRight', { shiftKey: true });
assert.deepEqual(run('current().pixels'), old);
press('ArrowDown');
press('Enter');
assert.equal(run('current().pixels[21*320+21]'), 3);
run("setTool('select')");
at(10, 10);
press('Enter');
at(15, 10);
press('Enter');
assert.equal(run('selection.width'), 6);
assert.equal(run('selection.height'), 1);
click('copy');
click('paste');
at(30, 30);
press('ArrowRight');
assert.equal(run('pending.x'), 31);
press('Enter');
assert.equal(run('pending'), null);
assert.equal(run('current().pixels[30*320+33]'), 3);
run("setTool('eyedrop');color=1");
at(33, 30);
press('Enter');
assert.equal(run('color'), 3);
click('newProject');
run("setTool('fill');color=2");
at(0, 0);
press('Enter');
assert.ok(run('current().pixels.every(x=>x===2)'));
click('newProject');
elements.textValue.value = 'A';
elements.fontSize.value = '1';
run("setTool('text');color=3");
at(5, 5);
press('Enter');
assert.ok(run('current().pixels.some(x=>x!==0)'));
click('newProject');
run("setTool('chart')");
at(0, 0);
press('Enter');
assert.ok(run('current().pixels.some(x=>x!==0)'));
run("setTool('ellipse')");
at(100, 100);
press('Enter');
assert.ok(run('keyboardAnchor'));
press('Escape');
assert.equal(run('keyboardAnchor'), null);
run("setTool('line')");
press('Enter');
run("setTool('pencil')");
assert.equal(run('keyboardAnchor'), null);
const before = run('current().pixels.slice()');
document.dosEnabled = false;
at(300, 190);
press('Enter');
assert.deepEqual(run('current().pixels'), before);
console.log(
  'DOS actual-controller tools passed: points/erase, line/box, two-corner selection, copy/paste placement, picker, fill, text, chart, anchor cancel and modern Enter unchanged.',
);
