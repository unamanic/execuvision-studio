'use strict';
const assert=require('node:assert/strict'),zlib=require('node:zlib'),fs=require('node:fs'),path=require('node:path');
const Z=require('../dist/zip-reader.js');
function crc(d){let c=0xffffffff;for(const b of d){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
function zip(entries){
 const locals=[],centrals=[];let off=0;
 for(const e of entries){const name=Buffer.from(e.name),data=Buffer.from(e.data),method=e.method??8,packed=method===8?zlib.deflateRawSync(data):data;
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc(data),14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc(data),16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(off,42);
  locals.push(l,name,packed);centrals.push(c,name);off+=30+name.length+packed.length;
 }
 const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,central,end]);
}
(async()=>{
 for(const method of [0,8]){const r=await Z.read(zip([{name:'A.EV',data:'hello',method}]));assert.equal(r[0].name,'A.EV');assert.equal(Buffer.from(r[0].bytes).toString(),'hello');}
 const inner=zip([{name:'A.EV',data:'hello'},{name:'EVPIX.TOC',data:'table'}]);
 const nested=zip([{name:'Files/disk01.zip',data:inner},{name:'ignored.pdf',data:'ignore'}]);
 assert.deepEqual((await Z.readEV(nested)).map(e=>e.name),['Files/disk01.zip!/A.EV','Files/disk01.zip!/EVPIX.TOC']);
 for(const name of ['../A.EV','/A.EV','a/../A.EV','C:A.EV','a\\A.EV'])await assert.rejects(Z.read(zip([{name,data:'x'}])));
 await assert.rejects(Z.read(zip([{name:'A.EV',data:'x'},{name:'A.EV',data:'y'}])));
 await assert.rejects(Z.read(new Uint8Array(10)));
 await assert.rejects(Z.read(new Uint8Array(64*1024*1024+1)));
 const stored=zip([{name:'A.EV',data:'hello',method:0}]);stored[34]^=1;await assert.rejects(Z.read(stored),/CRC/);
 const encrypted=zip([{name:'A.EV',data:'hello'}]);encrypted.writeUInt16LE(1,encrypted.indexOf(Buffer.from('504b0102','hex'))+8);await assert.rejects(Z.read(encrypted));
 const multi=zip([{name:'A.EV',data:'hello'}]);multi.writeUInt16LE(1,multi.length-18);await assert.rejects(Z.read(multi));
 const bomb=zip([{name:'A.EV',data:Buffer.alloc(200000)}]);await assert.rejects(Z.read(bomb),/ratio/);
 assert.deepEqual(await Z.readEV(zip([{name:'ignored.bin',data:Buffer.alloc(200000)}])),[]);
 await assert.rejects(Z.readEV(zip([{name:'nested.zip',data:nested}])),/depth/);
 await assert.rejects(Z.readEV(zip(Array.from({length:501},(_,i)=>({name:i+'.EV',data:'a'})))),/graphics/);
 console.log('Synthetic ZIP stored/deflated/nested, path, CRC and bounds tests passed.');
})().catch(e=>{console.error(e);process.exit(1)});
