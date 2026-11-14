#!/usr/bin/env node
import { cp, copyFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildSevenZip } from './build-sevenzip.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await buildSevenZip();
await copyFile(resolve(root, 'LICENSE'), resolve(root, 'dist/LICENSE'));
await rm(resolve(root, 'site'), { recursive: true, force: true });
await cp(resolve(root, 'dist'), resolve(root, 'site'), { recursive: true });
await writeFile(resolve(root, 'site/.nojekyll'), '');
console.log('Built site/ for GitHub Pages, including decoder sources and license notices.');
