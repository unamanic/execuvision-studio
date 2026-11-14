#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
const require = createRequire(import.meta.url), { zipStore } = require('../dist/core.js'), { read } = require('../dist/zip-reader.js');
const root = fileURLToPath(new URL('../', import.meta.url));
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async entry =>
  entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]))).flat();
const sources = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (!sources.includes('LICENSE') || !sources.includes('.github/workflows/pages.yml')) throw Error('Stage the prepared repository before packaging.');
if (sources.some(name => /(^|\/)(\.openai|\.git|samples|results|private|site|release)(\/|$)|\.(evstudio|ev|img|7z|pdf)$/i.test(name))) throw Error('Unexpected private or generated source path in Git index.');
await mkdir(resolve(root, 'release'), { recursive: true });
const sums = [], manifest = [];
for (const [label, dir, files] of [['source', root, sources], ['site', resolve(root, 'site'), (await walk(resolve(root, 'site'))).map(p => relative(resolve(root, 'site'), p))]]) {
  const entries = [];
  for (const name of files.sort()) {
    const p = resolve(dir, name);
    if (!(await lstat(p)).isFile()) throw Error(`Not a regular file: ${name}`);
    entries.push({ name: name.split('\\').join('/'), bytes: new Uint8Array(await readFile(p)) });
  }
  const bytes = zipStore(entries), check = await read(bytes);
  if (check.length !== entries.length || check.some((entry, i) => entry.name !== entries[i].name || !Buffer.from(entry.bytes).equals(Buffer.from(entries[i].bytes)))) throw Error('Archive verification failed');
  const filename = `execuvision-studio-${label}.zip`;
  await writeFile(resolve(root, 'release', filename), bytes);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
  manifest.push({ file: filename, bytes: bytes.length, entries: entries.length });
}
await writeFile(resolve(root, 'release/SHA256SUMS'), sums.join('\n') + '\n');
console.log(JSON.stringify(manifest, null, 2));
