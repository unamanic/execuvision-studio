const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

function manifest(directory) {
  const entries = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) walk(filename);
      else {
        entries.push([
          path.relative(directory, filename),
          crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
        ]);
      }
    }
  }
  walk(directory);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

// A rebuild must be repeatable, remove obsolete output, and never write back
// into source or vendor inputs. This guards the source/distribution boundary.
const inputs = ['src', 'public', 'vendor'].map((name) => manifest(path.join(root, name)));
const expected = manifest(output);
const obsolete = path.join(output, 'obsolete-build-test', 'old-page.html');
fs.mkdirSync(path.dirname(obsolete), { recursive: true });
fs.writeFileSync(obsolete, 'This page must not survive a rebuild.');
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root, stdio: 'pipe' });
assert.equal(fs.existsSync(obsolete), false);
assert.deepEqual(manifest(output), expected);
assert.deepEqual(
  ['src', 'public', 'vendor'].map((name) => manifest(path.join(root, name))),
  inputs,
);
assert.equal(fs.existsSync(path.join(output, 'workers')), false);
console.log(
  'Build checks passed: reproducible output, obsolete files removed, source inputs unchanged.',
);
