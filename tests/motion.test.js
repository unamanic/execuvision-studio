const assert = require('node:assert/strict'),
  S = require('../dist/core.js');
const slide = {
  ...S.raster(),
  name: 'Two objects',
  palette: { background: 0, family: 1, intensity: 1 },
  source: null,
  motions: [],
};
S.rect(slide, 10, 20, 3, 3, 1, true);
S.rect(slide, 60, 40, 3, 3, 2, true);
S.pixel(slide, 150, 150, 3);
slide.motions = [
  { name: 'A', x: 10, y: 20, width: 3, height: 3, dx: 20, dy: 0, speed: 9, delay: 0, trail: false },
  {
    name: 'B',
    x: 60,
    y: 40,
    width: 3,
    height: 3,
    dx: -20,
    dy: 10,
    speed: 5,
    delay: 1000,
    trail: false,
  },
];
const at = (r, x, y) => r.pixels[y * r.width + x],
  original = slide.pixels.slice(),
  a = S.createAnimation(slide);
assert.equal(a.duration, 7000);
assert.deepEqual(a.frame(0).pixels, slide.pixels);
let f = a.frame(1000);
assert.equal(at(f, 20, 20), 1);
assert.equal(at(f, 60, 40), 2);
assert.equal(at(f, 10, 20), 0);
assert.equal(at(f, 150, 150), 3);
f = a.frame(4000);
assert.equal(at(f, 30, 20), 1);
assert.equal(at(f, 50, 45), 2);
assert.equal(at(f, 60, 40), 0);
f = a.frame(9000);
assert.equal(at(f, 30, 20), 1);
assert.equal(at(f, 40, 50), 2);
assert.deepEqual(slide.pixels, original);
assert.deepEqual(a.frame(0).pixels, original);
// Independently layered trails retain path pixels, even when intermediate frames are skipped.
slide.motions[0].trail = true;
const coarse = S.createAnimation(slide),
  fine = S.createAnimation(slide);
for (let t = 0; t <= 8000; t += 20) fine.frame(t);
assert.deepEqual(coarse.frame(8000).pixels, fine.frame(8000).pixels);
assert.equal(at(coarse.frame(8000), 10, 20), 1);
assert.equal(at(coarse.frame(8000), 25, 20), 1);
assert.deepEqual(coarse.frame(0).pixels, original);
// Later motions layer on top. Their source regions are captured before any clearing.
const overlap = {
  ...slide,
  pixels: original.slice(),
  motions: [
    { ...slide.motions[0], dx: 20, trail: false },
    { ...slide.motions[1], dx: -30, dy: -20, speed: 9, delay: 0 },
  ],
};
assert.equal(at(S.createAnimation(overlap).frame(2000), 30, 20), 2);
const sameSource = {
  ...slide,
  motions: [
    { ...slide.motions[0], trail: false },
    { ...slide.motions[0], name: 'Copy', dx: 40, trail: false },
  ],
};
assert.equal(at(S.createAnimation(sameSource).frame(2000), 30, 20), 1);
assert.equal(at(S.createAnimation(sameSource).frame(2000), 50, 20), 1);
// Multiple settings survive save/reopen; edits on one motion do not mutate others.
const json = S.projectJSON([slide], 'Motions'),
  read = S.readProject(json);
assert.equal(JSON.parse(json).version, 2);
assert.deepEqual(read.slides[0], slide);
const copy = read.slides[0].motions.map((m) => ({ ...m }));
copy[0].dx = 90;
assert.equal(copy[1].dx, -20);
assert.equal(slide.motions[0].dx, 20);
// Projects saved by the old one-motion build migrate without losing the motion.
const legacy = JSON.parse(json);
legacy.version = 1;
legacy.slides[0].motion = { ...slide.motions[0] };
delete legacy.slides[0].motion.name;
delete legacy.slides[0].motion.delay;
delete legacy.slides[0].motions;
const migrated = S.readProject(JSON.stringify(legacy));
assert.equal(migrated.slides[0].motions.length, 1);
assert.equal(migrated.slides[0].motions[0].name, 'Motion 1');
assert.equal(migrated.slides[0].motions[0].delay, 0);
assert.equal(migrated.slides[0].motions[0].trail, true);
assert.deepEqual(S.readProject(S.projectJSON(migrated.slides, 'Migrated')).slides, migrated.slides);
for (const mutation of [
  (o) => (o.slides[0].motions = null),
  (o) => (o.slides[0].motions = Array(33).fill(slide.motions[0])),
  (o) => (o.slides[0].motions[1].delay = -1),
  (o) => (o.slides[0].motions[1].delay = 240001),
  (o) => (o.slides[0].motions[1].delay = '1'),
  (o) => (o.slides[0].motions[0].width = 999),
]) {
  const o = JSON.parse(json);
  mutation(o);
  assert.throws(() => S.readProject(JSON.stringify(o)));
}
// Every one of the supported 32 motions survives round trip and renders.
const many = {
  ...slide,
  motions: Array.from({ length: 32 }, (_, i) => ({
    ...slide.motions[0],
    name: 'M' + i,
    dx: i,
    trail: false,
  })),
};
assert.equal(S.readProject(S.projectJSON([many], 'Many')).slides[0].motions.length, 32);
assert.equal(S.createAnimation(many).frame(9999).pixels.length, 64000);
assert.deepEqual(S.createAnimation({ ...slide, motions: [] }).frame(100).pixels, original);
console.log(
  'Motion checks passed: independent paths, speeds, delays, overlap, trails across frame rates, restart, 32 motions, v2 round trip and v1 migration.',
);
