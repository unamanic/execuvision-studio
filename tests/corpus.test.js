const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  cp = require('node:child_process'),
  os = require('node:os');
const S = require('../dist/core.js'),
  EV = require('../dist/execuvision.js'),
  ZIP = require('../dist/zip-reader.js');
const root = path.resolve(__dirname, '..'),
  samples = process.env.EVSTUDIO_CORPUS_DIR;
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
(async () => {
  if (!samples || !fs.existsSync(samples))
    throw Error(
      'Set EVSTUDIO_CORPUS_DIR to the local samples directory; historical files are not bundled.',
    );
  let count = 0,
    disks = 0,
    files = 0,
    extended = 0;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evstudio-codec-'));
  try {
    const manifest = [];
    for (const filename of walk(samples).filter((n) => /\.img$/i.test(n))) {
      const data = new Uint8Array(fs.readFileSync(filename)),
        extracted = S.diskFiles(data),
        stem = path.basename(filename, '.img'),
        libraryDir = path.resolve(path.dirname(filename), '../..'),
        zipPath = path.join(libraryDir, 'Files', stem + '.zip');
      const archive = await ZIP.read(new Uint8Array(fs.readFileSync(zipPath)));
      for (const e of extracted) {
        const matching = archive.find(
          (z) => path.basename(z.name).toUpperCase() === e.name.toUpperCase(),
        );
        assert.ok(matching, `${filename} ${e.name}`);
        assert.deepEqual(e.bytes, matching.bytes);
        files++;
        if (!/\.EV$/i.test(e.name)) continue;
        const d = EV.decodeEV(e.bytes),
          out = S.encodeEV(d, d.kind, e.bytes),
          decoded = EV.decodeEV(out);
        assert.deepEqual(decoded.bitmap, d.bitmap);
        assert.deepEqual(decoded.pixels, d.pixels);
        assert.deepEqual(out.subarray(4, 50), e.bytes.subarray(4, 50));
        assert.deepEqual(out.subarray(decoded.rasterEnd), e.bytes.subarray(d.rasterEnd));
        assert.equal(decoded.outerSize - d.outerSize, decoded.compressedSize - d.compressedSize);
        if (e.bytes.length - d.rasterEnd === 521) extended++;
        const wrapped = new Uint8Array(e.bytes.length + 9);
        wrapped.set(e.bytes, 5);
        assert.deepEqual(EV.decodeEV(wrapped.subarray(5, 5 + e.bytes.length)).bitmap, d.bitmap);
        const edited = { ...d, pixels: d.pixels.slice() };
        edited.pixels[0] = (edited.pixels[0] + 1) % 4;
        const edit = S.encodeEV(edited, d.kind, e.bytes);
        assert.deepEqual(EV.decodeEV(edit).pixels, edited.pixels);
        const output = path.join(temp, String(count) + '.ev');
        fs.writeFileSync(output, out);
        manifest.push({
          file: output,
          hash: crypto.createHash('sha256').update(d.pixels).digest('hex'),
        });
        count++;
      }
      disks++;
    }
    fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify(manifest));
    const py = `import sys,json,hashlib\nsys.path.insert(0,sys.argv[1])\nfrom reference_ev_rle import decode_ev\nfor row in json.load(open(sys.argv[2])):\n d=decode_ev(open(row['file'],'rb').read())\n assert hashlib.sha256(d['pixels']).hexdigest()==row['hash']\nprint('Independent Python decoder verified all emitted rasters.')\n`;
    const r = cp.spawnSync(
      process.env.EVSTUDIO_PYTHON || 'python3',
      ['-c', py, path.join(root, 'tools'), path.join(temp, 'manifest.json')],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr || String(r.error));
    assert.equal(count, 268);
    assert.equal(disks, 6);
    assert.equal(files, 280);
    assert.equal(extended, 24);
    console.log(r.stdout.trim());
    console.log(
      `Corpus checks passed: ${count} EV rasters, ${extended} extended trailers, ${disks} DOS disks / ${files} files identical to supplied ZIPs.`,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
