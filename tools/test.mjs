#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.test.js') && name !== 'corpus.test.js').sort();
for (const file of files) {
  const result = spawnSync(process.execPath, [resolve(root, 'tests', file)], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) { if (result.error) console.error(result.error.message); process.exit(result.status || 1); }
}
console.log(`Passed ${files.length} standalone test suites. Optional historical corpus: npm run test:corpus.`);
