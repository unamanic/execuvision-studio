import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const readText = async name => (await readFile(resolve(root, name), 'utf8')).replace(/\r\n?/g, '\n');
export async function buildSevenZip() {
  const wasm = (await readFile(resolve(root, 'vendor/7z/7zz.wasm'))).toString('base64');
  const worker = await readText('vendor/7z/7zz.umd.js') + '\n' + await readText('tools/sevenzip-core.js') +
    `\nonmessage=async e=>{try{const entries=await extractSevenZip(e.data,SevenZip,Uint8Array.from(atob(${JSON.stringify(wasm)}),c=>c.charCodeAt(0)));postMessage({entries},entries.map(x=>x.bytes.buffer))}catch(error){postMessage({error:error.message||'7z extraction failed'})}};`;
  await writeFile(resolve(root, 'dist/sevenzip-assets.js'),
    '/* Generated offline 7z-wasm 1.2.0 assets; see 7z-License.txt and third_party/README.md. */\n' +
    `const EVSevenZipWorker=${JSON.stringify(worker)};\n`);
}
