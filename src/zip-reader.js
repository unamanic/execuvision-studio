/* Bounded, local-only ZIP reader; no filesystem writes, network or dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.EVZip = api;
  }
})(globalThis, function () {
  'use strict';
  const MAX = 64 * 1024 * 1024;
  const ENTRIES = 2000;
  const RATIO = 200;
  const fail = (m) => {
    throw new Error('ZIP: ' + m);
  };
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  function crc32(data) {
    let c = 0xffffffff;
    for (const b of data) {
      c = table[(c ^ b) & 255] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // Normalize nothing silently: reject ambiguous encodings and unsafe components
  // before matching names to TOCs or nesting scopes. Returned bytes stay in memory.
  function path(raw, utf8) {
    let name;
    try {
      if (utf8) {
        name = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      } else {
        if (raw.some((x) => x > 127)) {
          fail('non-ASCII legacy names unsupported');
        }
        name = String.fromCharCode(...raw);
      }
    } catch (e) {
      fail('invalid filename encoding');
    }
    if (
      !name ||
      name.length > 4096 ||
      /[\x00-\x1f\x7f\\:]/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((p) => p === '..' || p === '.')
    ) {
      fail('unsafe entry path');
    }
    return name;
  }

  // Allocate only the declared, prevalidated size. Bound streaming output too;
  // trusting a ZIP header alone would let a corrupt stream exceed that budget.
  async function inflate(bytes, expected) {
    if (typeof DecompressionStream === 'undefined') {
      fail('this browser lacks native ZIP decompression');
    }
    let stream;
    try {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    } catch (e) {
      fail('this browser lacks deflate-raw support');
    }
    const reader = stream.getReader();
    const out = new Uint8Array(expected);
    let offset = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (offset + value.length > expected) {
          await reader.cancel();
          fail('expanded entry exceeds declared size');
        }
        out.set(value, offset);
        offset += value.length;
      }
    } catch (e) {
      try {
        await reader.cancel();
      } catch (_) {}
      throw e;
    } finally {
      reader.releaseLock();
    }
    if (offset !== expected) {
      fail('expanded size mismatch');
    }
    return out;
  }

  /**
   * Validate every central/local record before inflating selected entries.
   * budget is mutable and can be shared across nested archives; filtering avoids
   * decompressing unrelated files, but never skips structural/path validation.
   * Stored and raw-DEFLATE entries are supported; ZIP64/encryption are rejected.
   */
  async function unpack(data, budget, select = () => true) {
    if (!(data instanceof Uint8Array) || data.length > MAX) {
      fail('input must be bytes, at most 64 MiB');
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const inBounds = (p, n) => Number.isInteger(p) && p >= 0 && n >= 0 && p + n <= data.length;
    const u16 = (p) => {
      if (!inBounds(p, 2)) {
        fail('truncated header');
      }
      return view.getUint16(p, true);
    };
    const u32 = (p) => {
      if (!inBounds(p, 4)) {
        fail('truncated header');
      }
      return view.getUint32(p, true);
    };
    // EOCD is at most 22 header bytes + 65,535 comment bytes from the end.
    // Check the declared comment length so a signature inside a comment loses.
    let eocd = -1;
    for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
      if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === data.length) {
        eocd = p;
        break;
      }
    }
    if (eocd < 0) {
      fail('end-of-directory missing');
    }
    const count = u16(eocd + 10);
    const size = u32(eocd + 12);
    const start = u32(eocd + 16);
    if (u16(eocd + 4) || u16(eocd + 6) || u16(eocd + 8) !== count) {
      fail('multipart archives unsupported');
    }
    if (count === 65535 || size === 0xffffffff || start === 0xffffffff) {
      fail('ZIP64 unsupported');
    }
    if (count > ENTRIES || budget.entries + count > ENTRIES) {
      fail('too many entries');
    }
    budget.entries += count;
    if (!inBounds(start, size) || start + size !== eocd) {
      fail('invalid central-directory bounds');
    }
    let pos = start;
    const entries = [];
    const names = new Set();
    const ranges = [];
    for (let i = 0; i < count; i++) {
      if (!inBounds(pos, 46) || u32(pos) !== 0x02014b50) {
        fail('invalid central-directory entry');
      }
      const flags = u16(pos + 8);
      const method = u16(pos + 10);
      const crc = u32(pos + 16);
      const compressed = u32(pos + 20);
      const expanded = u32(pos + 24);
      const nl = u16(pos + 28);
      const el = u16(pos + 30);
      const cl = u16(pos + 32);
      const local = u32(pos + 42);
      if (flags & ~(0x0800 | 0x0008 | 0x0006)) {
        fail('encryption or unsupported flags');
      }
      if (method !== 0 && method !== 8) {
        fail('only stored/deflated entries supported');
      }
      if (u16(pos + 34)) {
        fail('multipart entry unsupported');
      }
      if ([compressed, expanded, local].includes(0xffffffff)) {
        fail('ZIP64 unsupported');
      }
      if (!inBounds(pos + 46, nl + el + cl) || pos + 46 + nl + el + cl > start + size) {
        fail('truncated central entry');
      }
      for (let x = pos + 46 + nl; x < pos + 46 + nl + el;) {
        if (x + 4 > pos + 46 + nl + el) {
          fail('truncated extra field');
        }
        const id = u16(x);
        const len = u16(x + 2);
        if (id === 1) {
          fail('ZIP64 unsupported');
        }
        x += 4 + len;
        if (x > pos + 46 + nl + el) {
          fail('bad extra-field length');
        }
      }
      const rawName = data.subarray(pos + 46, pos + 46 + nl);
      const name = path(rawName, !!(flags & 0x800));
      if (names.has(name)) {
        fail('duplicate entry name');
      }
      names.add(name);
      const mode = u32(pos + 38) >>> 16;
      if ((mode & 0xf000) === 0xa000) {
        fail('symbolic links unsupported');
      }
      const selected = select(name);
      if (selected && (expanded > MAX || budget.expanded + expanded > MAX)) {
        fail('expanded data exceeds 64 MiB');
      }
      if (selected && expanded > 0 && (compressed === 0 || expanded / compressed > RATIO)) {
        fail('compression ratio exceeds 200:1');
      }
      if (selected) {
        budget.expanded += expanded;
      }
      // Central-directory claims are not sufficient: local headers, names, data
      // ranges, and non-descriptor sizes must agree before decompression.
      if (!inBounds(local, 30) || local + 30 > start || u32(local) !== 0x04034b50) {
        fail('invalid local header');
      }
      if (u16(local + 6) !== flags || u16(local + 8) !== method) {
        fail('local/central flags or method disagree');
      }
      const lnl = u16(local + 26);
      const lel = u16(local + 28);
      const body = local + 30 + lnl + lel;
      if (
        !inBounds(local + 30, lnl + lel) ||
        !inBounds(body, compressed) ||
        body + compressed > start
      ) {
        fail('entry outside data region');
      }
      if (lnl !== nl || !rawName.every((b, j) => b === data[local + 30 + j])) {
        fail('local/central names disagree');
      }
      if (
        !(flags & 8) &&
        (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== expanded)
      ) {
        fail('local/central sizes or CRC disagree');
      }
      for (const [a, b] of ranges) {
        if (local < b && body + compressed > a) {
          fail('overlapping entry records');
        }
      }
      ranges.push([local, body + compressed]);
      if (selected) {
        entries.push({ name, method, crc, compressed, expanded, body });
      }
      pos += 46 + nl + el + cl;
    }
    if (pos !== start + size) {
      fail('central-directory size mismatch');
    }
    // Decompression starts only after the complete directory has been validated.
    // CRC is checked on decoded bytes, including stored (uncompressed) entries.
    const out = [];
    for (const entry of entries) {
      const packed = data.subarray(entry.body, entry.body + entry.compressed);
      let bytes;
      if (entry.method === 0) {
        if (entry.compressed !== entry.expanded) {
          fail('stored size mismatch');
        }
        bytes = packed.slice();
      } else {
        bytes = await inflate(packed, entry.expanded);
      }
      if (crc32(bytes) !== entry.crc) {
        fail('CRC mismatch: ' + entry.name);
      }
      if (entry.name.endsWith('/')) {
        if (bytes.length) {
          fail('nonempty directory');
        }
      } else {
        out.push({ name: entry.name, bytes });
      }
    }
    return out;
  }

  /** Read one archive. The editor performs its own bounded recursive dispatch. */
  async function read(data) {
    return unpack(data, { entries: 0, expanded: 0 });
  }

  // Specialized EV/TOC reader with one nested ZIP level and a shared budget.
  // Prefix inner names with "!/" so same-named files on separate disks stay distinct.
  async function readEV(data) {
    const budget = { entries: 0, expanded: 0 };
    const selected = (name) => /\.(ev|toc|zip)$/i.test(name);
    const outer = await unpack(data, budget, selected);
    const out = [];
    let graphics = 0;
    function add(entry) {
      if (/\.ev$/i.test(entry.name) && ++graphics > 500) {
        fail('graphics count exceeds 500');
      }
      out.push(entry);
    }
    for (const entry of outer) {
      if (/\.(ev|toc)$/i.test(entry.name)) {
        add(entry);
      } else if (/\.zip$/i.test(entry.name)) {
        const inner = await unpack(entry.bytes, budget, selected);
        for (const child of inner) {
          if (/\.zip$/i.test(child.name)) {
            fail('nested ZIP depth exceeds one');
          }
          if (/\.(ev|toc)$/i.test(child.name)) {
            add({ name: entry.name + '!/' + child.name, bytes: child.bytes });
          }
        }
      }
    }
    return out;
  }
  return Object.freeze({ read, readEV });
});
