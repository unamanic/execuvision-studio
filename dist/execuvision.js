/* Independently inferred ExecuVision decoder. No network or external dependencies.
 * Reads only the first raster; palette and later slide records remain unresolved.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExecuVision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fail(message) { throw new Error(message); }
  function decompress(stream, expected) {
    if (!(stream instanceof Uint8Array)) fail('Expected a byte array');
    if (!Number.isInteger(expected) || expected < 0 || expected > 16000) fail('Unreasonable raster size');
    let pos = stream.length - 1, written = 0;
    const reverse = new Uint8Array(expected);
    function count(run) {
      let total = 0;
      for (;;) {
        if (pos < 0) fail('Truncated suffix count');
        const b = stream[pos--];
        total += b & 127;
        if (total > expected + 64) fail('Count exceeds output limit');
        if (!(b & 128)) {
          const flag = !!run && !!(b & 64);
          return [total - (flag ? 64 : 0), flag];
        }
      }
    }
    let literal = count(false)[0];
    for (;;) {
      if (literal > pos + 1 || written + literal > expected) fail('Literal count out of bounds');
      for (let i = 0; i < literal; i++) reverse[written++] = stream[pos--];
      if (pos < 0) break;
      const run = count(true);
      literal = run[1] ? count(false)[0] : 0;
      if (pos < 0 || run[0] === 0 || written + run[0] > expected) fail('Run count out of bounds');
      reverse.fill(stream[pos--], written, written + run[0]);
      written += run[0];
    }
    if (written !== expected) fail('Decoded length does not match dimensions');
    return reverse.reverse();
  }
  function decodeEV(data) {
    if (!(data instanceof Uint8Array)) fail('Choose a binary .EV file');
    if (data.length < 59) fail('Truncated EV file');
    if (data.length > 1024 * 1024) fail('EV file exceeds the 1 MiB safety limit');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const word = off => view.getUint16(off, true);
    const kind = word(0), outerSize = word(2);
    if (kind !== 1 && kind !== 2) fail('Unsupported EV kind (expected slide or picture)');
    const recordSize = word(50), height = word(52), end = 51 + recordSize;
    if (recordSize < 3 || end + 4 > data.length) fail('Raster record bounds invalid');
    const bits = word(end), storedSize = word(end + 2);
    if (!bits || bits % 2 || bits > 640 || !height || height > 200) fail('Unsupported raster dimensions (maximum 320 × 200)');
    const width = bits / 2, stride = Math.ceil(bits / 8), expected = stride * height;
    if (storedSize !== expected + 3) fail('Uncompressed size and dimensions disagree');
    const bitmap = decompress(data.subarray(54, end), expected);
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      pixels[y * width + x] = (bitmap[y * stride + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;
    }
    const warnings = ['Colors are interpretations; the original palette metadata is unresolved.'];
    if (kind === 1) warnings.push('Only the raster is decoded; editable objects and animation metadata are not interpreted.');
    if (data[data.length - 1] !== 26) warnings.push('Expected DOS EOF marker is absent.');
    return {kind, width, height, stride, bitmap, pixels, rasterEnd: end + 4,
      outerSize, compressedSize: end - 54, warnings};
  }
  const RGBI = [
    [0,0,0],[0,0,170],[0,170,0],[0,170,170],
    [170,0,0],[170,0,170],[170,85,0],[170,170,170],
    [85,85,85],[85,85,255],[85,255,85],[85,255,255],
    [255,85,85],[255,85,255],[255,255,85],[255,255,255]
  ];
  function cgaPalette(background, palette, intensity) {
    if (!Number.isInteger(background) || background < 0 || background > 15 ||
        ![0,1].includes(palette) || ![0,1].includes(intensity)) fail('Invalid CGA palette selection');
    const indices = palette ? [3,5,7] : [2,4,6];
    return [RGBI[background].slice(), ...indices.map(i => RGBI[i + intensity * 8].slice())];
  }
  function grayscalePalette() { return [[0,0,0],[85,85,85],[170,170,170],[255,255,255]]; }
  function rgba(decoded, palette) {
    if (!decoded || !(decoded.pixels instanceof Uint8Array) ||
        decoded.pixels.length > 64000 || !Number.isInteger(decoded.width) ||
        !Number.isInteger(decoded.height) || decoded.width * decoded.height !== decoded.pixels.length) fail('Invalid decoded raster');
    if (!Array.isArray(palette) || palette.length !== 4 || palette.some(c => !Array.isArray(c) || c.length !== 3 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255))) fail('Palette must contain four RGB triplets');
    const out = new Uint8ClampedArray(decoded.pixels.length * 4);
    decoded.pixels.forEach((index, i) => {
      if (index > 3) fail('Invalid pixel index');
      out.set(palette[index], i * 4); out[i * 4 + 3] = 255;
    });
    return out;
  }
  return Object.freeze({decodeEV, rgba, cgaPalette, grayscalePalette});
});
