/* Offline 7z adapter. The decoder lives in a disposable worker, never on the UI thread. */
async function extractSevenZip(bytes, factory, wasmBinary) {
 const MAX=64*1024*1024;
 if(!(bytes instanceof Uint8Array)||bytes.length>MAX||bytes.length<6||![55,122,188,175,39,28].every((v,i)=>bytes[i]===v))throw Error('7z: invalid archive or input exceeds 64 MiB.');
 let lines=[],printed=0;
 const capture=line=>{printed+=line.length;if(printed>1024*1024)throw Error('7z: listing exceeds safety limit.');lines.push(line)};
 const z=await factory({wasmBinary,print:capture,printErr:capture,stdin:()=>null});
 z.FS.writeFile('/input.7z',bytes);
 const run=args=>{try{return z.callMain(args)}catch(e){throw Error('7z: damaged, encrypted or unsupported archive.')}};
 if(run(['l','-slt','-ba','-bsp0','-pNO_PASSWORD_SUPPORTED','/input.7z'])!==0)throw Error('7z: damaged, encrypted or unsupported archive.');
 const listing=lines.join('\n');
 const records=listing.split(/\n\s*\n/).filter(s=>/^Path = /m.test(s)).map(block=>Object.fromEntries(block.split('\n').filter(s=>s.includes(' = ')).map(s=>{const i=s.indexOf(' = ');return [s.slice(0,i),s.slice(i+3)]})));
 if(!records.length||records.length>2000)throw Error('7z: empty archive or too many entries.');
 let expanded=0;const names=new Set(),selected=[];
 for(const r of records){const name=r.Path,size=Number(r.Size||0);
  if(!name||name.length>4096||/[\x00-\x1f\x7f\\:]/.test(name)||name.startsWith('/')||name.split('/').some(s=>s==='.'||s==='..')||names.has(name))throw Error('7z: unsafe or duplicate entry path.');
  names.add(name);
  if(r.Encrypted==='+'||r['Symbolic Link']||r['Hard Link']||/(^|\s)l[rw-]/.test(r.Attributes||''))throw Error('7z: encrypted entries and links are unsupported.');
  expanded+=size;if(!Number.isSafeInteger(size)||size<0||expanded>MAX)throw Error('7z: expanded archive exceeds 64 MiB.');
  if(/\.(ev|toc|zip)$/i.test(name)&&r.Folder!=='+'){if(/\.(ev|toc)$/i.test(name)&&size>1024*1024)throw Error('7z: EV/TOC file exceeds 1 MiB.');selected.push({name,size})}
 }
 if(selected.length>500)throw Error('7z: more than 500 selected entries.');
 if(!selected.length)throw Error('7z: no EV/TOC files or disk ZIPs found. Disk-image-only archives must be extracted separately.');
 z.FS.mkdir('/output');lines=[];printed=0;
 const limits=new Map(selected.map(e=>['/output/'+e.name,e.size])),write=z.FS.write;
 z.FS.write=function(stream,buffer,offset,length,position,...rest){if(stream.path.startsWith('/output/')){const limit=limits.get(stream.path),end=(position===undefined?stream.position:position)+length;if(limit===undefined||end>limit)throw Error('7z: output exceeds declared size.')}return write.call(this,stream,buffer,offset,length,position,...rest)};

 if(run(['x','/input.7z','-o/output','-y','-spd','-mmt=1','-pNO_PASSWORD_SUPPORTED',...selected.map(e=>e.name)])!==0)throw Error('7z: extraction failed or archive is damaged.');
 const out=selected.map(({name,size})=>{const p='/output/'+name,stat=z.FS.lstat(p);if(!z.FS.isFile(stat.mode)||stat.size!==size)throw Error('7z: extracted entry does not match its listing.');return {name,bytes:z.FS.readFile(p)}});
 return out;
}
if(typeof module==='object')module.exports={extractSevenZip};
