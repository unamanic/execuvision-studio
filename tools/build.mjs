#!/usr/bin/env node
import { cp, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildSevenZip } from './build-sevenzip.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'src');
const output = resolve(root, 'dist');

// Always build from source. Removing the old output prevents deleted pages or
// renamed assets from surviving in a later deployment.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });
await cp(source, output, {
  recursive: true,
  // Worker inputs are assembled into sevenzip-assets.js, not served separately.
  filter: (path) => path !== resolve(source, 'workers'),
});
await copyFile(resolve(root, 'LICENSE'), resolve(output, 'LICENSE'));
await buildSevenZip(output);
await writeFile(resolve(output, '.nojekyll'), '');
console.log('Built dist/ from src/ and public/, including offline decoder assets and notices.');
