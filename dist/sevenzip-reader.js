/* Worker lifetime bounds CPU time and allows immediate cancellation. */
const EVSevenZip=(()=>{
 const active=new Set();
 function read(bytes){return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob([EVSevenZipWorker],{type:'text/javascript'}));
  let worker;try{worker=new Worker(url)}catch(e){URL.revokeObjectURL(url);reject(Error('7z: this browser cannot start the offline decoder.'));return}
  const task={stop:()=>finish(Error('7z: import cancelled.'))};active.add(task);
  const timer=setTimeout(()=>finish(Error('7z: extraction exceeded the 45-second limit.')),45000);
  function finish(error,value){clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);active.delete(task);error?reject(error):resolve(value)}
  worker.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(null,e.data.entries);
  worker.onerror=()=>finish(Error('7z: decoder failed; archive may be unsupported or too large.'));
  worker.postMessage(bytes);
 })}
 return {read,cancel(){for(const task of [...active])task.stop()}};
})();
