const assert = require('node:assert/strict');
const S = require('../dist/core.js'),
  EV = require('../dist/execuvision.js'),
  ZIP = require('../dist/zip-reader.js');
(async () => {
  for (const [w, h] of [
    [1, 1],
    [3, 2],
    [4, 63],
    [4, 64],
    [4, 127],
    [4, 128],
    [4, 185],
    [8, 127],
    [5, 200],
    [320, 200],
  ]) {
    const r = S.raster(w, h);
    r.pixels.forEach((_, i) => (r.pixels[i] = (i * 7 + Math.floor(i / 3)) % 4));
    for (const kind of [1, 2]) {
      const bytes = S.encodeEV(r, kind),
        d = EV.decodeEV(bytes);
      assert.equal(d.kind, kind);
      assert.equal(d.width, w);
      assert.equal(d.height, h);
      assert.deepEqual(d.pixels, r.pixels);
    }
  }
  const r = S.raster(20, 20);
  S.rect(r, 2, 2, 12, 12, 1);
  S.fill(r, 4, 4, 2);
  assert.equal(r.pixels[4 * 20 + 4], 2);
  assert.equal(r.pixels[0], 0);
  assert.equal(r.pixels[2 * 20 + 2], 1);
  let piece = S.crop(r, { x: 2, y: 2, width: 4, height: 4 }),
    dest = S.raster(8, 8);
  dest.pixels.fill(3);
  S.blit(dest, piece, 1, 1, true);
  assert.equal(dest.pixels[0], 3);
  assert.equal(dest.pixels[9], 1);
  assert.equal(dest.pixels[18], 2);
  assert.throws(() => S.chart('bar', [-1, 2]));
  assert.throws(() => S.chart('bar', [NaN]));
  assert.throws(() => S.chart('pie', [0]));
  for (const kind of ['bar', 'line', 'pie'])
    assert.equal(
      S.chart(kind, [4, 8, 16], ['A', 'B', 'C']).pixels.some((x) => x > 0),
      true,
    );
  const slides = S.demo(),
    json = S.projectJSON(slides, 'Example'),
    p = S.readProject(json);
  assert.equal(p.title, 'Example');
  assert.deepEqual(
    p.slides,
    slides.map((s) => ({ ...s, motions: s.motions || [] })),
  );
  for (const change of [
    (o) => (o.slides[0].width = 1),
    (o) => (o.slides[0].palette.background = 16),
    (o) => (o.slides[0].pixels = 'AA=='),
    (o) => (o.slides[2].motions[0].x = 999),
  ]) {
    const o = JSON.parse(json);
    change(o);
    assert.throws(() => S.readProject(JSON.stringify(o)));
  }
  const data = S.parsePlotData(
    'PC, Cost, Margin, Distribution\nA, 200, 80, 120\nB, 800, 200, 400\nC, 1200, 300, 500',
  );
  assert.deepEqual(data.series, [
    [200, 800, 1200],
    [80, 200, 300],
    [120, 400, 500],
  ]);
  assert.deepEqual(data.names, ['Cost', 'Margin', 'Distribution']);
  for (const type of ['bar', 'stacked', 'line']) {
    const g = S.plot(type, data, 160, 100);
    assert.equal(g.width, 160);
    assert.equal(g.height, 100);
    assert.ok(g.pixels.includes(1) && g.pixels.includes(2) && g.pixels.includes(3));
  }
  assert.throws(() => S.plot('pie', data), /one value column/);
  const pie = S.parsePlotData('A, 25%\nB, 75%');
  assert.ok(S.plot('pie', pie).pixels.some((x) => x > 0));
  assert.throws(() => S.parsePlotData('A, 1, 2\nB, 3'), /same number/);
  assert.throws(() => S.parsePlotData('A, -1\nB, 4'), /nonnegative/);
  assert.throws(() => S.parsePlotData('A, 0\nB, 0'), /greater than zero/);
  const toc = S.makeToc(['One', 'Two']);
  assert.equal(S.parseToc(toc).get(1), 'ONE');
  assert.equal(S.parseToc(toc).get(2), 'TWO');
  assert.equal(S.parseToc(toc).size, 2);
  let lines = new TextDecoder().decode(toc).split('\r\n');
  lines[1] = '9'.repeat(29);
  assert.equal(S.parseToc(new TextEncoder().encode(lines.join('\r\n'))).get(2), 'TWO');
  const entries = [
      { name: 'SLIDE001.EV', bytes: S.encodeEV(slides[0]) },
      { name: 'EVSLIDE.TOC', bytes: toc },
    ],
    back = await ZIP.read(S.zipStore(entries));
  assert.deepEqual(back, entries);
  const disk = new Uint8Array(163840);
  disk.set([254, 255, 255, 255, 15], 512);
  disk.set(disk.subarray(512, 1024), 1024);
  disk.set(new TextEncoder().encode('TEST    EV '), 1536);
  const v = new DataView(disk.buffer);
  v.setUint16(1536 + 26, 2, true);
  v.setUint32(1536 + 28, 4, true);
  disk.set([1, 2, 3, 4], 3584);
  assert.deepEqual(S.diskFiles(disk), [{ name: 'TEST.EV', bytes: new Uint8Array([1, 2, 3, 4]) }]);
  let bad = disk.slice();
  bad[1024] ^= 1;
  assert.throws(() => S.diskFiles(bad), /FAT copies/);
  bad = disk.slice();
  bad[515] = 2;
  bad[516] = 0;
  bad.set(bad.subarray(512, 1024), 1024);
  assert.throws(() => S.diskFiles(bad), /termination/);
  bad = disk.slice();
  bad.set(bad.subarray(1536, 1568), 1568);
  assert.throws(() => S.diskFiles(bad), /crosslinked/);
  assert.throws(() => S.diskFiles(disk.slice(1)), /160 or 320/);
  console.log(
    'Core checks passed: native round trips and count boundaries, crop/composition/fill, PLOT pie/bar/line/stacked graphs and data validation, project validation, TOC slots, ZIP CRC round trip, FAT corruption.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
