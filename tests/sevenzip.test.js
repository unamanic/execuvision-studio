const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {extractSevenZip}=require('../tools/sevenzip-core.js'),factory=require('../vendor/7z/7zz.umd.js'),wasmBinary=fs.readFileSync(path.join(__dirname,'../vendor/7z/7zz.wasm')),zip=require('../dist/zip-reader.js'),ev=require('../dist/execuvision.js');
(async()=>{
 await assert.rejects(()=>extractSevenZip(new Uint8Array(10),factory,wasmBinary),/invalid/);
 const z=await factory({wasmBinary,print(){},printErr(){}});z.FS.writeFile('/README.txt','No graphics');z.callMain(['a','/empty.7z','/README.txt']);await assert.rejects(()=>extractSevenZip(z.FS.readFile('/empty.7z'),factory,wasmBinary),/no EV/);
 z.FS.writeFile('/BAD.EV',new Uint8Array(1024*1024+1));z.callMain(['a','/big.7z','/BAD.EV']);await assert.rejects(()=>extractSevenZip(z.FS.readFile('/big.7z'),factory,wasmBinary),/1 MiB/);
 z.callMain(['a','-psecret','-mhe=on','/locked.7z','/README.txt']);await assert.rejects(()=>extractSevenZip(z.FS.readFile('/locked.7z'),factory,wasmBinary),/encrypted/);
 process.exitCode=0; // Expected decoder failures set Node's exit status.
 console.log('7z invalid, no graphics, oversized EV, encrypted archive, tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
