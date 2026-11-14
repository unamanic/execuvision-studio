/**
 * Pure editing and serialization primitives, exported as EVStudio in the browser
 * and through CommonJS for tests. This module has no DOM or editor-selection state.
 * Drawing helpers mutate the supplied raster; crop/resize/animation return copies.
 * Native-format assumptions are recorded in public/RECONSTRUCTION.md.
 */

/**
 * A row-major image of palette indices, not RGB values. Coordinates are pixels
 * from the top-left; x increases rightward and y increases downward.
 * @typedef {Object} Raster
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} pixels Exactly width * height entries, each in 0..3.
 */

/**
 * @typedef {Object} Region
 * @property {number} x Left edge, inclusive.
 * @property {number} y Top edge, inclusive.
 * @property {number} width Pixel count, not the right coordinate.
 * @property {number} height Pixel count, not the bottom coordinate.
 */

/**
 * The selected interpretation of the raster's four indices. These values are
 * saved in web projects; they have not been decoded from native slide metadata.
 * @typedef {Object} Palette
 * @property {number} background RGBI color number, 0..15, for pixel index 0.
 * @property {number} family 0 for green/red/brown; 1 for cyan/magenta/gray.
 * @property {number} intensity 0 for normal foreground colors, 1 for bright.
 */

/**
 * @typedef {Object} MotionSettings
 * @property {string} [name]
 * @property {number} dx Horizontal travel in pixels, relative to the source.
 * @property {number} dy Vertical travel in pixels, relative to the source.
 * @property {number} speed Integer 1..9; higher values finish sooner.
 * @property {number} [delay] Start delay in milliseconds (the UI uses seconds).
 * @property {boolean} trail Whether traversed pixel positions remain painted.
 */
/** @typedef {Region & MotionSettings} Motion */

/**
 * @typedef {Object} SlideMetadata
 * @property {string} name
 * @property {Palette} palette
 * @property {Motion[]} [motions] Ordered back-to-front; preferred over legacy motion.
 * @property {Motion} [motion] Legacy project-v1 shape, normalized by motionList.
 * @property {Uint8Array|null} [source] Original EV bytes; retain without mutating.
 */
/** @typedef {Raster & SlideMetadata} Slide */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./execuvision.js') : root.ExecuVision);
  if (typeof module === 'object') {
    module.exports = api;
  }
  root.EVStudio = api;
})(globalThis, function (EV) {
  'use strict';
  const W = 320;
  const H = 200;
  /** Allocate a blank index-0 raster. @returns {Raster} */
  const raster = (width = W, height = H) => ({
    width,
    height,
    pixels: new Uint8Array(width * height),
  });
  // Pixel storage is copied; other metadata remains shared. See app.js copySlide
  // when palette and motion objects also need independent ownership.
  const clone = (r) => ({ ...r, pixels: r.pixels.slice() });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  /** Set a rounded coordinate, silently clipping writes outside the raster. */
  function pixel(r, x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < r.width && y < r.height) {
      r.pixels[y * r.width + x] = c;
    }
  }

  // Bresenham stepping keeps endpoints connected on the integer pixel grid.
  // Brush size stamps a square at each point rather than resampling a vector.
  function line(r, x0, y0, x1, y1, c, size = 1) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          pixel(r, x0 + i, y0 + j, c);
        }
      }
      if (x0 === x1 && y0 === y1) {
        break;
      }
      let e = 2 * err;
      if (e >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function rect(r, x, y, w, h, c, filled = false) {
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (filled) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          pixel(r, x + i, y + j, c);
        }
      }
    } else {
      line(r, x, y, x + w - 1, y, c);
      line(r, x, y + h - 1, x + w - 1, y + h - 1, c);
      line(r, x, y, x, y + h - 1, c);
      line(r, x + w - 1, y, x + w - 1, y + h - 1, c);
    }
  }

  function ellipse(r, x, y, w, h, c, filled = false) {
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    const rx = Math.max(0.5, w / 2);
    const ry = Math.max(0.5, h / 2);
    const cx = x + rx;
    const cy = y + ry;
    for (let py = Math.floor(y); py <= y + h; py++) {
      for (let px = Math.floor(x); px <= x + w; px++) {
        let d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
        if (
          d <= 1 &&
          (filled ||
            ((px - cx) / Math.max(0.2, rx - 1)) ** 2 + ((py - cy) / Math.max(0.2, ry - 1)) ** 2 >=
              1)
        ) {
          pixel(r, px, py, c);
        }
      }
    }
  }

  // Iterative four-neighbor flood fill avoids recursion on a 64,000-pixel slide.
  // Recolor before pushing a neighbor so the same pixel is not queued repeatedly.
  function fill(r, x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) {
      return;
    }
    let old = r.pixels[y * r.width + x];
    if (old === c) {
      return;
    }
    const stack = [y * r.width + x];
    r.pixels[stack[0]] = c;
    while (stack.length) {
      let p = stack.pop();
      let px = p % r.width;
      for (const n of [
        px > 0 ? p - 1 : -1,
        px < r.width - 1 ? p + 1 : -1,
        p - r.width,
        p + r.width,
      ]) {
        if (n >= 0 && n < r.pixels.length && r.pixels[n] === old) {
          r.pixels[n] = c;
          stack.push(n);
        }
      }
    }
  }

  /** Copy a region clamped to the source bounds. @returns {Raster} */
  function crop(r, b) {
    const x = clamp(Math.round(b.x), 0, r.width - 1);
    const y = clamp(Math.round(b.y), 0, r.height - 1);
    const width = clamp(Math.round(b.width), 1, r.width - x);
    const height = clamp(Math.round(b.height), 1, r.height - y);
    const out = raster(width, height);
    for (let j = 0; j < height; j++) {
      out.pixels.set(
        r.pixels.subarray((y + j) * r.width + x, (y + j) * r.width + x + width),
        j * width,
      );
    }
    return out;
  }

  /**
   * Composite into dst with integer nearest-neighbor scaling and clipped writes.
   * Pixmix transparency is index 0, regardless of the selected background RGB.
   * @param {Raster} dst Destination mutated in place.
   * @param {Raster} src Source pixels, normally distinct from dst.
   * @param {number} x Destination left edge.
   * @param {number} y Destination top edge.
   * @param {boolean} mix Skip source index-0 pixels when true.
   * @param {number} scale Positive integer magnification.
   */
  function blit(dst, src, x, y, mix = false, scale = 1) {
    for (let j = 0; j < src.height * scale; j++) {
      for (let i = 0; i < src.width * scale; i++) {
        const c = src.pixels[Math.floor(j / scale) * src.width + Math.floor(i / scale)];
        if (!mix || c !== 0) {
          pixel(dst, x + i, y + j, c);
        }
      }
    }
  }

  // A small independently specified block alphabet; ten geometric treatments, not historical font data.
  const glyphs = {
    A: '01110/10001/10001/11111/10001/10001/10001',
    B: '11110/10001/10001/11110/10001/10001/11110',
    C: '01111/10000/10000/10000/10000/10000/01111',
    D: '11110/10001/10001/10001/10001/10001/11110',
    E: '11111/10000/10000/11110/10000/10000/11111',
    F: '11111/10000/10000/11110/10000/10000/10000',
    G: '01111/10000/10000/10111/10001/10001/01110',
    H: '10001/10001/10001/11111/10001/10001/10001',
    I: '111/010/010/010/010/010/111',
    J: '00111/00010/00010/00010/10010/10010/01100',
    K: '10001/10010/10100/11000/10100/10010/10001',
    L: '10000/10000/10000/10000/10000/10000/11111',
    M: '10001/11011/10101/10101/10001/10001/10001',
    N: '10001/11001/10101/10011/10001/10001/10001',
    O: '01110/10001/10001/10001/10001/10001/01110',
    P: '11110/10001/10001/11110/10000/10000/10000',
    Q: '01110/10001/10001/10001/10101/10010/01101',
    R: '11110/10001/10001/11110/10100/10010/10001',
    S: '01111/10000/10000/01110/00001/00001/11110',
    T: '11111/00100/00100/00100/00100/00100/00100',
    U: '10001/10001/10001/10001/10001/10001/01110',
    V: '10001/10001/10001/10001/10001/01010/00100',
    W: '10001/10001/10001/10101/10101/10101/01010',
    X: '10001/10001/01010/00100/01010/10001/10001',
    Y: '10001/10001/01010/00100/00100/00100/00100',
    Z: '11111/00001/00010/00100/01000/10000/11111',
    0: '01110/10001/10011/10101/11001/10001/01110',
    1: '010/110/010/010/010/010/111',
    2: '01110/10001/00001/00010/00100/01000/11111',
    3: '11110/00001/00001/01110/00001/00001/11110',
    4: '00010/00110/01010/10010/11111/00010/00010',
    5: '11111/10000/10000/11110/00001/00001/11110',
    6: '01110/10000/10000/11110/10001/10001/01110',
    7: '11111/00001/00010/00100/01000/01000/01000',
    8: '01110/10001/10001/01110/10001/10001/01110',
    9: '01110/10001/10001/01111/00001/00001/01110',
    ' ': '000/000/000/000/000/000/000',
    '.': '0/0/0/0/0/1/1',
    ',': '00/00/00/00/00/01/10',
    ':': '0/1/1/0/1/1/0',
    '-': '000/000/000/111/000/000/000',
    '+': '000/010/010/111/010/010/000',
    '/': '00001/00010/00010/00100/01000/01000/10000',
    '%': '11001/11010/00010/00100/01000/01011/10011',
    '!': '1/1/1/1/1/0/1',
    '?': '01110/10001/00001/00010/00100/00000/00100',
    '(': '01/10/10/10/10/10/01',
    ')': '10/01/01/01/01/01/10',
    '&': '01100/10010/10100/01000/10101/10010/01101',
    "'": '1/1/0/0/0/0/0',
  };
  const fontNames = [
    'Classic',
    'Wide',
    'Tall',
    'Bold',
    'Slant',
    'Outline',
    'Shadow',
    'Dotted',
    'Extended',
    'Compact',
  ];
  // Text is painted into pixels immediately; no editable text object is retained.
  // The glyphs and geometric treatments are independent web implementations.
  function text(r, str, x, y, c = 3, scale = 1, style = 0) {
    let ox = x;
    scale = clamp(Math.round(scale), 1, 4);
    const sx = scale * ([1, 8].includes(style) ? 2 : 1);
    const sy = scale * (style === 2 ? 2 : 1);
    for (const ch of str.toUpperCase()) {
      if (ch === '\n') {
        y += 9 * sy;
        x = ox;
        continue;
      }
      const rows = (glyphs[ch] || glyphs['?']).split('/');
      for (let j = 0; j < 7; j++) {
        for (let i = 0; i < rows[j].length; i++) {
          if (rows[j][i] === '1') {
            let xx = x + i * sx + (style === 4 ? Math.floor((6 - j) / 2) : 0);
            let yy = y + j * sy;
            if (style === 6) {
              rect(r, xx + 1, yy + 1, sx, sy, (c % 3) + 1, true);
            }
            if (style === 5) {
              for (const [dx, dy] of [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ]) {
                pixel(r, xx + dx, yy + dy, c);
              }
            } else if (style !== 7 || (i + j) % 2 === 0) {
              rect(r, xx, yy, sx + (style === 3 ? 1 : 0), sy, c, true);
            }
          }
        }
      }
      x += (rows[0].length + (style === 9 ? 0 : style === 8 ? 2 : 1)) * sx;
    }
  }

  // Base-size single-series charts. plot() adds multi-series layouts and sizing.
  function chart(type, values, labels = []) {
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > 12 ||
      values.some((n) => !Number.isFinite(n) || n < 0) ||
      !values.some((n) => n > 0)
    ) {
      throw Error('Enter 1–12 nonnegative values, with at least one greater than zero.');
    }
    const r = raster(180, 112);
    const max = Math.max(...values);
    if (type === 'pie') {
      const total = values.reduce((a, b) => a + b, 0);
      let ends = [];
      let s = 0;
      for (const v of values) {
        s += v / total;
        ends.push(s);
      }
      for (let y = 2; y < 86; y++) {
        for (let x = 6; x < 90; x++) {
          let dx = x - 48;
          let dy = y - 44;
          if (dx * dx + dy * dy <= 40 * 40) {
            let a =
              ((Math.atan2(dy, dx) + Math.PI * 2 + Math.PI / 2) % (Math.PI * 2)) / (Math.PI * 2);
            pixel(
              r,
              x,
              y,
              (Math.max(
                0,
                ends.findIndex((e) => a < e),
              ) %
                3) +
                1,
            );
          }
        }
      }
      values.forEach((v, i) => {
        rect(r, 98, 4 + i * 9, 4, 5, (i % 3) + 1, true);
        text(
          r,
          `${(labels[i] || String(i + 1)).slice(0, 7)} ${Math.round((v / total) * 100)}%`,
          106,
          3 + i * 9,
          3,
        );
      });
    } else {
      line(r, 18, 6, 18, 91, 3);
      line(r, 18, 91, 176, 91, 3);
      for (let y = 21; y < 90; y += 23) {
        for (let x = 20; x < 177; x += 4) {
          pixel(r, x, y, 1);
        }
      }
      let prev;
      values.forEach((v, i) => {
        let x = 25 + (i * 148) / values.length;
        let h = (v / max) * 78;
        if (type === 'bar') {
          rect(
            r,
            Math.round(x),
            91 - Math.round(h),
            Math.max(2, Math.floor(120 / values.length)),
            Math.round(h),
            (i % 3) + 1,
            true,
          );
        } else {
          let pt = [Math.round(x + 4), 91 - Math.round(h)];
          if (prev) {
            line(r, ...prev, ...pt, 2, 2);
          }
          rect(r, pt[0] - 2, pt[1] - 2, 5, 5, 3, true);
          prev = pt;
        }
        text(
          r,
          (labels[i] || String(i + 1)).slice(0, Math.max(1, Math.floor(24 / values.length))),
          Math.round(x),
          97,
          3,
        );
      });
      text(r, String(Math.round(max)), 0, 1, 3);
    }
    return r;
  }

  /**
   * Parse simple comma/semicolon/tab-separated rows (not quoted CSV fields).
   * Return column-oriented series, matching labels, and optional header names.
   * Limits: 1..12 rows, 1..3 nonnegative numeric columns, at least one positive.
   */
  function parsePlotData(source) {
    const rows = source
      .trim()
      .split(/\n/)
      .filter((s) => s.trim())
      .map((s) => s.split(/[,;\t]/).map((c) => c.trim()));
    if (!rows.length) {
      throw Error('Enter labels and values first.');
    }
    const number = (s) => s !== '' && Number.isFinite(Number(s.replace(/%$/, '')));
    let names = [];
    if (rows[0].length > 1 && rows[0].slice(1).every((s) => !number(s))) {
      names = rows.shift().slice(1);
    }
    if (!rows.length || rows.length > 12) {
      throw Error('PLOT accepts 1–12 data rows.');
    }
    const labels = [];
    const series = [];
    let columns = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const items = row.length === 1 ? row : row.slice(1);
      if (i === 0) {
        columns = items.length;
        if (columns < 1 || columns > 3) {
          throw Error('Use one to three value columns.');
        }
        for (let k = 0; k < columns; k++) {
          series.push([]);
        }
      }
      if (items.length !== columns) {
        throw Error('Every row must have the same number of values.');
      }
      labels.push(row.length === 1 ? String(i + 1) : row[0]);
      items.forEach((v, k) => {
        if (!number(v) || Number(v.replace(/%$/, '')) < 0) {
          throw Error('PLOT needs nonnegative numbers, optionally ending in %.');
        }
        series[k].push(Number(v.replace(/%$/, '')));
      });
    }
    if (!series.flat().some((n) => n > 0)) {
      throw Error('At least one value must be greater than zero.');
    }
    return { labels, series, names: series.map((_, i) => names[i] || 'SERIES ' + (i + 1)) };
  }

  /** Return a nearest-neighbor copy; interpolation would invent palette indices. */
  function resize(r, width, height) {
    const out = raster(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out.pixels[y * width + x] =
          r.pixels[
            Math.min(r.height - 1, Math.floor((y * r.height) / height)) * r.width +
              Math.min(r.width - 1, Math.floor((x * r.width) / width))
          ];
      }
    }
    return out;
  }

  /** Rasterize validated PLOT data at the requested size. @returns {Raster} */
  function plot(type, data, width = 180, height = 112) {
    if (!['bar', 'stacked', 'line', 'pie'].includes(type)) {
      throw Error('Choose pie, bar or line.');
    }
    const { labels, series, names } = data;
    if (type === 'pie' && series.length !== 1) {
      throw Error('Pie graphs use one value column. Choose bars or lines for multiple series.');
    }
    let r;
    if (series.length === 1 && type !== 'stacked') {
      r = chart(type, series[0], labels);
    } else {
      r = raster(220, 132);
      const count = labels.length;
      const totals = labels.map((_, i) => series.reduce((n, s) => n + s[i], 0));
      const max = type === 'stacked' ? Math.max(...totals) : Math.max(...series.flat());
      const left = 24;
      const top = 8;
      const bottom = 100;
      const right = 214;
      const span = right - left;
      line(r, left, top, left, bottom, 3);
      line(r, left, bottom, right, bottom, 3);
      for (let y = 30; y < 100; y += 23) {
        for (let x = left + 2; x < right; x += 4) {
          pixel(r, x, y, 1);
        }
      }
      text(r, String(Math.round(max)), 0, 0, 3);
      series.forEach((s, k) => {
        let prev;
        for (let i = 0; i < count; i++) {
          const slot = span / count;
          const x = left + 3 + i * slot;
          const h = (s[i] / max) * 86;
          const c = k + 1;
          if (type === 'line') {
            const p = [Math.round(x + slot / 3), Math.round(bottom - h)];
            if (prev) {
              line(r, ...prev, ...p, c);
            }
            rect(r, p[0] - 1, p[1] - 1, 3, 3, c, true);
            prev = p;
          } else if (type === 'stacked') {
            const below = (series.slice(0, k).reduce((n, a) => n + a[i], 0) / max) * 86;
            rect(
              r,
              Math.round(x),
              Math.round(bottom - below - h),
              Math.max(2, Math.floor(slot - 7)),
              Math.round(h),
              c,
              true,
            );
          } else {
            rect(
              r,
              Math.round(x + (k * (slot - 5)) / series.length),
              Math.round(bottom - h),
              Math.max(1, Math.floor((slot - 5) / series.length) - 1),
              Math.round(h),
              c,
              true,
            );
          }
        }
      });
      labels.forEach((s, i) =>
        text(
          r,
          s.slice(0, Math.max(1, Math.floor(31 / count))),
          Math.round(left + 3 + (i * span) / count),
          105,
          3,
        ),
      );
      names.forEach((s, k) => {
        rect(r, k * 72 + 3, 122, 4, 5, k + 1, true);
        text(r, s.slice(0, 12), k * 72 + 10, 121, 3, 1, 9);
      });
    }
    return width === r.width && height === r.height ? r : resize(r, width, height);
  }

  /**
   * Write the recovered first-raster format using one literal suffix-count run.
   * This favors a simple, verifiable encoder over maximum compression.
   *
   * If source is present, preserve opaque header/trailer records and packed-row
   * padding. Kind and dimensions must match before that preservation is safe.
   * Retained records may no longer describe edited pixels; new web motions and
   * chosen palettes are not translated into native records.
   * @param {Raster} r
   * @param {number} kind 1 for SLIDE, 2 for PIX.
   * @param {Uint8Array|null} source Original native bytes, if available.
   * @returns {Uint8Array}
   */
  function encodeEV(r, kind = 1, source = null) {
    if (
      ![1, 2].includes(kind) ||
      !Number.isInteger(r.width) ||
      !Number.isInteger(r.height) ||
      r.width < 1 ||
      r.width > 320 ||
      r.height < 1 ||
      r.height > 200 ||
      !(r.pixels instanceof Uint8Array) ||
      r.pixels.length !== r.width * r.height ||
      r.pixels.some((n) => n > 3)
    ) {
      throw Error('Invalid EV raster');
    }
    let old = source ? EV.decodeEV(source) : null;
    if (old && (old.kind !== kind || old.width !== r.width || old.height !== r.height)) {
      throw Error('Cannot preserve metadata after changing native dimensions or kind');
    }
    // Native rows pack four 2-bit indices per byte, most-significant pair first.
    // Starting from the old bitmap keeps unused bits in a partial final byte.
    const stride = Math.ceil(r.width / 4);
    const bitmap = old ? old.bitmap.slice() : new Uint8Array(stride * r.height);
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const p = y * stride + (x >> 2);
        const shift = 6 - 2 * (x % 4);
        bitmap[p] = (bitmap[p] & ~(3 << shift)) | (r.pixels[y * r.width + x] << shift);
      }
    }
    // Counts are read backward by the decoder. Continuation bytes therefore
    // follow the terminating low-bit count in forward file order.
    let n = bitmap.length;
    let counts = [Math.min(n, 127)];
    n -= counts[0];
    while (n > 0) {
      counts.push(128 | Math.min(n, 127));
      n -= Math.min(n, 127);
    }
    const c = bitmap.length + counts.length;
    const prefix = old ? source.slice(0, 54) : new Uint8Array(54);
    const tail = old
      ? source.slice(old.rasterEnd)
      : kind === 1
        ? new Uint8Array(519)
        : new Uint8Array([26]);
    if (!old) {
      tail[tail.length - 1] = 26;
    }
    const out = new Uint8Array(58 + c + tail.length);
    const v = new DataView(out.buffer);
    out.set(prefix);
    // Update known little-endian record fields only. Preserve the unknown outer
    // size convention by adjusting its old value by the compressed-size delta.
    v.setUint16(0, kind, true);
    v.setUint16(2, old ? old.outerSize + c - old.compressedSize : c + 8, true);
    v.setUint16(50, c + 3, true);
    v.setUint16(52, r.height, true);
    out.set(bitmap, 54);
    out.set(counts, 54 + bitmap.length);
    v.setUint16(54 + c, r.width * 2, true);
    v.setUint16(56 + c, bitmap.length + 3, true);
    out.set(tail, 58 + c);
    return out;
  }

  /** Return names keyed by 1-based slot. Empty slots must not renumber later files. */
  function parseToc(bytes) {
    if (bytes.length > 1024 * 1024) {
      throw Error('TOC exceeds 1 MiB');
    }
    const map = new Map();
    new TextDecoder('windows-1252')
      .decode(bytes)
      .split('\r\n')
      .slice(1, 101)
      .forEach((s, i) => {
        let name = s.slice(0, -1).trim();
        if (name && !/^9+$/.test(name) && !name.includes('\x1a')) {
          map.set(i + 1, name);
        }
      });
    return map;
  }

  // Emit names in the inferred fixed-width, 100-slot directory layout. Full DOS
  // directory semantics remain unverified; the web project is the complete save.
  function makeToc(names) {
    if (names.length > 100) {
      throw Error('TOC supports at most 100 slots');
    }
    const clean = (s) =>
      s
        .toUpperCase()
        .replace(/[^A-Z0-9 ._-]/g, '')
        .slice(0, 28)
        .padEnd(28, ' ');
    return new TextEncoder().encode(
      String(names.length).padStart(3, ' ') +
        '            ' +
        String(names.length) +
        ' \r\n' +
        Array.from({ length: 100 }, (_, i) =>
          i < names.length ? clean(names[i]) + '9' : '9'.repeat(29),
        ).join('\r\n') +
        '\r\n\x1a',
    );
  }

  /**
   * Read the supported DOS 1.x 160/320 KiB layouts directly from image bytes.
   * These formats predate a reliable modern BPB, so geometry is chosen by size.
   * Both FAT copies must agree. The shared used-cluster set rejects cycles and
   * crosslinked files before bytes are returned; no host filesystem is written.
   * @returns {Array<{name: string, bytes: Uint8Array}>}
   */
  function diskFiles(data) {
    let rootEntries;
    let clusterSize;
    if (data.length === 327680) {
      rootEntries = 112;
      clusterSize = 1024;
    } else if (data.length === 163840) {
      rootEntries = 64;
      clusterSize = 512;
    } else {
      throw Error('Disk images must be raw DOS 1.x 160 or 320 KiB images');
    }
    if (!data.subarray(512, 1024).every((b, i) => b === data[1024 + i])) {
      throw Error('FAT copies disagree');
    }
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const fat = data.subarray(512, 1024);
    const base = 1536 + Math.ceil((rootEntries * 32) / 512) * 512;
    const max = Math.floor((data.length - base) / clusterSize) + 1;
    const used = new Set();
    const out = [];
    for (let i = 0; i < rootEntries; i++) {
      let p = 1536 + i * 32;
      if (data[p] === 0) {
        break;
      }
      if (data[p] === 229 || data[p + 11] & 24) {
        continue;
      }
      if (data[p + 11] & 192) {
        throw Error('Unsupported disk directory attributes');
      }
      const a = new TextDecoder().decode(data.subarray(p, p + 8)).trim();
      const b = new TextDecoder().decode(data.subarray(p + 8, p + 11)).trim();
      const name = a + (b ? '.' + b : '');
      let size = v.getUint32(p + 28, true);
      let cluster = v.getUint16(p + 26, true);
      if (size > data.length - base) {
        throw Error('Disk file exceeds data area');
      }
      if (!size && cluster !== 0) {
        throw Error('Invalid empty disk file');
      }
      const bytes = new Uint8Array(size);
      for (let done = 0; done < size; done += clusterSize) {
        if (cluster < 2 || cluster > max || cluster >= 4080 || used.has(cluster)) {
          throw Error('Invalid, cyclic or crosslinked FAT chain');
        }
        used.add(cluster);
        let off = base + (cluster - 2) * clusterSize;
        bytes.set(data.subarray(off, off + Math.min(clusterSize, size - done)), done);
        // FAT12 packs two cluster links into three bytes; odd entries use the
        // upper 12 bits and even entries use the lower 12 bits.
        let f = Math.floor((cluster * 3) / 2);
        if (f + 1 >= fat.length) {
          throw Error('FAT entry outside table');
        }
        let raw = fat[f] | (fat[f + 1] << 8);
        cluster = (cluster % 2 ? raw >> 4 : raw) & 4095;
        if (done + clusterSize >= size && cluster < 4088) {
          throw Error('Invalid FAT chain termination');
        }
      }
      out.push({ name, bytes });
    }
    return out;
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  function crc32(b) {
    let c = 0xffffffff;
    for (let x of b) {
      c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  /**
   * Make a deterministic, uncompressed ZIP with UTF-8 names and per-entry CRCs.
   * Used for media and release packages; callers supply bounded, safe entries.
   * Zeroed date fields intentionally avoid clock-dependent archive bytes.
   * @param {Array<{name: string, bytes: Uint8Array}>} entries
   * @returns {Uint8Array}
   */
  function zipStore(entries) {
    let offset = 0;
    let locals = [];
    let central = [];
    for (const e of entries) {
      const name = new TextEncoder().encode(e.name);
      const b = e.bytes;
      const crc = crc32(b);
      const l = new Uint8Array(30 + name.length + b.length);
      const v = new DataView(l.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 2048, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, b.length, true);
      v.setUint32(22, b.length, true);
      v.setUint16(26, name.length, true);
      l.set(name, 30);
      l.set(b, 30 + name.length);
      const c = new Uint8Array(46 + name.length);
      const w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true);
      w.setUint16(4, 20, true);
      w.setUint16(6, 20, true);
      w.setUint16(8, 2048, true);
      w.setUint32(16, crc, true);
      w.setUint32(20, b.length, true);
      w.setUint32(24, b.length, true);
      w.setUint16(28, name.length, true);
      w.setUint32(42, offset, true);
      c.set(name, 46);
      locals.push(l);
      central.push(c);
      offset += l.length;
    }
    const size = central.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(offset + size + 22);
    let p = 0;
    for (const b of [...locals, ...central]) {
      out.set(b, p);
      p += b.length;
    }
    const v = new DataView(out.buffer);
    v.setUint32(p, 0x06054b50, true);
    v.setUint16(p + 8, entries.length, true);
    v.setUint16(p + 10, entries.length, true);
    v.setUint32(p + 12, size, true);
    v.setUint32(p + 16, offset, true);
    return out;
  }

  // Projects use base64 for typed arrays so browser downloads and Node tests
  // share one JSON representation without numeric-array expansion.
  const b64 = (b) => {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b).toString('base64');
    }
    let s = '';
    for (let x of b) {
      s += String.fromCharCode(x);
    }
    return btoa(s);
  };
  const unb64 = (s) => {
    if (typeof s !== 'string' || s.length > 1400000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
      throw Error('Invalid project byte encoding');
    }
    return typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(s, 'base64'))
      : Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  };
  const MAX_MOTIONS = 32;
  /** Normalize legacy single-motion slides without modifying the supplied slide. */
  function motionList(slide) {
    return slide.motions || (slide.motion ? [slide.motion] : []);
  }

  /** Validate geometry/timing and return a fresh normalized Motion object. */
  function validateMotion(m, i = 0) {
    if (
      !m ||
      !['x', 'y', 'width', 'height', 'dx', 'dy', 'speed'].every((k) => Number.isInteger(m[k])) ||
      m.x < 0 ||
      m.y < 0 ||
      m.width < 1 ||
      m.height < 1 ||
      m.x + m.width > 320 ||
      m.y + m.height > 200 ||
      Math.abs(m.dx) > 320 ||
      Math.abs(m.dy) > 200 ||
      m.speed < 1 ||
      m.speed > 9 ||
      typeof m.trail !== 'boolean'
    ) {
      throw Error('Invalid motion data');
    }
    const delay = m.delay ?? 0;
    if (!Number.isInteger(delay) || delay < 0 || delay > 240000) {
      throw Error('Invalid motion start delay');
    }
    return {
      name: String(m.name || 'Motion ' + (i + 1)).slice(0, 40),
      x: m.x,
      y: m.y,
      width: m.width,
      height: m.height,
      dx: m.dx,
      dy: m.dy,
      speed: m.speed,
      trail: m.trail,
      delay,
    };
  }

  /**
   * Create an independent playback session; never mutate the slide's pixels.
   * Capture every source region before clearing any of them, so overlaps retain
   * their original artwork. Later motions composite above earlier motions.
   *
   * frame(elapsedMs) returns a fresh raster. Trail layers cache every traversed
   * pixel position, not just rendered frames, making trails frame-rate invariant.
   * Seeking backward resets those caches. Duration and delay are milliseconds;
   * travel takes 11000 - speed * 1000 ms, a web timing rule, not a DOS-format claim.
   */
  function createAnimation(slide) {
    const motions = motionList(slide).map(validateMotion);
    const base = clone(slide);
    const items = motions.map((m) => ({
      m,
      piece: crop(slide, m),
      layer: m.trail ? raster(slide.width, slide.height) : null,
      last: -1,
    }));
    for (const { m } of items) {
      rect(base, m.x, m.y, m.width, m.height, 0, true);
    }
    let previous = -1;
    return {
      duration: Math.max(0, ...motions.map((m) => m.delay + 11000 - m.speed * 1000)),
      frame(elapsed) {
        if (!Number.isFinite(elapsed)) {
          throw Error('Invalid animation time');
        }
        elapsed = Math.max(0, elapsed);
        if (elapsed < previous) {
          for (const item of items) {
            item.last = -1;
            if (item.layer) {
              item.layer.pixels.fill(0);
            }
          }
        }
        previous = elapsed;
        const out = clone(base);
        for (const item of items) {
          const { m, piece, layer } = item;
          const t = clamp((elapsed - m.delay) / (11000 - m.speed * 1000), 0, 1);
          if (layer) {
            const steps = Math.max(1, Math.abs(m.dx), Math.abs(m.dy));
            const end = Math.floor(t * steps);
            for (let k = item.last + 1; k <= end; k++) {
              blit(
                layer,
                piece,
                Math.round(m.x + (m.dx * k) / steps),
                Math.round(m.y + (m.dy * k) / steps),
                true,
              );
            }
            item.last = end;
            blit(out, layer, 0, 0, true);
          } else {
            blit(out, piece, Math.round(m.x + m.dx * t), Math.round(m.y + m.dy * t), true);
          }
        }
        return out;
      },
    };
  }

  /** Serialize the editable presentation as project v2, excluding the media library. */
  function projectJSON(slides, title) {
    return JSON.stringify({
      format: 'execuvision-studio',
      version: 2,
      title,
      slides: slides.map((s) => ({
        name: s.name,
        width: s.width,
        height: s.height,
        pixels: b64(s.pixels),
        palette: s.palette,
        motions: motionList(s).map(validateMotion),
        source: s.source ? b64(s.source) : null,
      })),
    });
  }

  /**
   * Treat project JSON as untrusted input: validate bounds before constructing
   * fresh pixel, palette, motion, and source-byte values. Accept v1 saves by
   * migrating their single motion to the v2 list; reject unsupported versions.
   * @returns {{title: string, slides: Slide[]}}
   */
  function readProject(str) {
    if (str.length > 32 * 1024 * 1024) {
      throw Error('Project exceeds 32 MiB');
    }
    const o = JSON.parse(str);
    if (
      o.format !== 'execuvision-studio' ||
      ![1, 2].includes(o.version) ||
      !Array.isArray(o.slides) ||
      !o.slides.length ||
      o.slides.length > 100
    ) {
      throw Error('Unsupported project');
    }
    const slides = o.slides.map((s) => {
      if (s.width !== 320 || s.height !== 200) {
        throw Error('Invalid slide dimensions');
      }
      const pixels = unb64(s.pixels);
      if (pixels.length !== 64000 || pixels.some((n) => n > 3)) {
        throw Error('Invalid slide pixels');
      }
      const p = s.palette;
      if (
        !p ||
        !Number.isInteger(p.background) ||
        p.background < 0 ||
        p.background > 15 ||
        ![0, 1].includes(p.family) ||
        ![0, 1].includes(p.intensity)
      ) {
        throw Error('Invalid slide palette');
      }
      const list = o.version === 1 ? (s.motion ? [s.motion] : []) : s.motions;
      if (!Array.isArray(list) || list.length > MAX_MOTIONS) {
        throw Error('A slide supports up to ' + MAX_MOTIONS + ' motions');
      }
      const motions = list.map(validateMotion);
      const source = s.source ? unb64(s.source) : null;
      if (source) {
        let d = EV.decodeEV(source);
        if (d.kind !== 1 || d.width !== 320 || d.height !== 200) {
          throw Error('Invalid native slide source');
        }
      }
      return {
        name: String(s.name || 'Untitled').slice(0, 80),
        width: 320,
        height: 200,
        pixels,
        palette: { ...p },
        motions,
        source,
      };
    });
    return { title: String(o.title || 'Untitled presentation').slice(0, 80), slides };
  }

  // Synthetic artwork only. Do not substitute historical/user media in this demo.
  function demo() {
    const palette = { background: 0, family: 1, intensity: 1 };
    let a = { ...raster(), name: 'A new way to present', palette: { ...palette }, source: null };
    rect(a, 9, 9, 302, 182, 1);
    rect(a, 14, 14, 292, 172, 1);
    text(a, 'EXECUVISION', 28, 31, 3, 3);
    text(a, 'THE PICTURE IS YOURS.', 29, 67, 1, 1);
    line(a, 28, 86, 290, 86, 2);
    text(a, 'CREATE. PREPARE. PRESENT.', 29, 156, 3);
    for (let i = 0; i < 5; i++) {
      rect(a, 35 + i * 46, 132 - i * 8, 25, 14 + i * 8, (i % 3) + 1, true);
    }
    let b = { ...raster(), name: 'Quarterly outlook', palette: { ...palette }, source: null };
    text(b, 'QUARTERLY OUTLOOK', 20, 16, 3, 2);
    line(b, 20, 40, 298, 40, 1);
    blit(b, chart('bar', [24, 42, 61, 84], ['Q1', 'Q2', 'Q3', 'Q4']), 15, 57);
    text(b, 'GROWTH', 211, 70, 1, 2);
    text(b, '+84%', 211, 96, 2, 3);
    text(b, 'A PLAN IN PICTURES', 20, 180, 3);
    let c = {
      ...raster(),
      name: 'Ideas in motion',
      palette: { background: 0, family: 0, intensity: 1 },
      source: null,
    };
    text(c, 'IDEAS IN MOTION', 21, 21, 3, 2);
    text(c, 'MAKE YOUR POINT. MOVE IT.', 21, 49, 1);
    line(c, 20, 143, 298, 143, 1);
    rect(c, 25, 106, 24, 24, 2, true);
    line(c, 25, 106, 49, 130, 3);
    line(c, 25, 130, 49, 106, 3);
    text(c, '9 SPEEDS / STRAIGHT LINE / TRAILS', 21, 168, 3);
    ellipse(c, 266, 78, 20, 20, 3, true);
    c.motions = [
      {
        name: 'Red square',
        x: 25,
        y: 106,
        width: 25,
        height: 25,
        dx: 240,
        dy: 0,
        speed: 5,
        trail: false,
        delay: 0,
      },
      {
        name: 'Yellow disc',
        x: 266,
        y: 78,
        width: 21,
        height: 21,
        dx: -220,
        dy: 10,
        speed: 3,
        trail: false,
        delay: 750,
      },
    ];
    let d = { ...raster(), name: 'PLOT: price components', palette: { ...palette }, source: null };
    text(d, 'PC PRICE COMPONENTS', 20, 12, 3, 2);
    const data = parsePlotData(
      'PC, Cost, Margin, Distribution\nA, 200, 80, 120\nB, 800, 200, 400\nC, 1200, 300, 500',
    );
    blit(d, plot('stacked', data, 276, 138), 20, 40);
    text(d, 'PLOT / DATA INTO PICTURES', 20, 186, 1);
    return [a, b, c, d];
  }
  return {
    W,
    H,
    raster,
    clone,
    pixel,
    line,
    rect,
    ellipse,
    fill,
    crop,
    blit,
    text,
    fontNames,
    chart,
    parsePlotData,
    plot,
    resize,
    encodeEV,
    parseToc,
    makeToc,
    diskFiles,
    zipStore,
    projectJSON,
    readProject,
    motionList,
    validateMotion,
    createAnimation,
    MAX_MOTIONS,
    demo,
    clamp,
  };
});
