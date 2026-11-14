// Controller integration without a browser: real core + minimal DOM/event/canvas boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('../dist/core.js');
const html=fs.readFileSync(require.resolve('../dist/index.html'),'utf8'),ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements={},all=[];let raf=null;
class Element{
 constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];let value='';Object.defineProperty(this,'value',{get:()=>value,set:v=>{value=String(v)}});this.value='';this.style={};this.dataset={};this.attributes={};this.listeners={};this.disabled=false;this.hidden=false;this.checked=false;this.className='';this.innerHTML='';this.textContent='';this.open=false;this.parentElement={style:{}};this.classList={toggle(){},add(){},remove(){}};all.push(this)}
 append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,fn){this.listeners[k]=fn}add(option){this.append(option);if(this.children.length===1)this.value=String(option.value)}focus(){document.activeElement=this}click(){if(!this.disabled)this.onclick?.({target:this})}setPointerCapture(){}getBoundingClientRect(){return{left:0,top:0,width:320,height:200}}showModal(){this.open=true}close(){this.open=false;this.listeners.close?.()}getContext(){return{putImageData:d=>this.image=d,save(){},restore(){},setLineDash(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}}}toBlob(cb){cb(new Blob(['image']))}toDataURL(){return'data:image/png;base64,'}
}
for(const id of ids)elements[id]=new Element(id.includes('canvas')?'canvas':'div');
const defaults={brush:'1',fontSize:'2',fontStyle:'0',motionX:'160',motionY:'0',motionDelay:'0',motionSpeed:'5',zoom:'fit',interval:'10',chartType:'bar',chartData:'Q1, 24\nQ2, 42',textValue:'TEXT',paletteFamily:'1,1',background:'0'};for(const [id,v]of Object.entries(defaults))elements[id].value=v;elements.mix.checked=true;
const modes=['create','prepare','run','print'].map(mode=>{let b=new Element('button');b.dataset.mode=mode;return b});
const document={activeElement:null,fullscreenElement:null,getElementById(id){assert.ok(ids.has(id),'Missing HTML control: '+id);return elements[id]},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelectorAll(q){return q==='[data-tool]'?all.filter(b=>b.dataset.tool):q==='[data-mode]'?modes:[]},listeners:{},addEventListener(k,fn){this.listeners[k]=fn}};
document.body={classList:{contains:name=>name==='dos-mode'&&document.dosEnabled}};document.dosEnabled=true;
const context={document,window:{addEventListener(){},print(){}},EVStudio:S,ExecuVision:require('../dist/execuvision.js'),EVZip:require('../dist/zip-reader.js'),EVSevenZip:{cancel(){}},Option:function(text,value){this.text=text;this.value=value},ImageData:function(data,width,height){this.data=data;this.width=width;this.height=height},Uint8Array,Uint8ClampedArray,TextEncoder,TextDecoder,Blob,Map,Set,console,performance:{now:()=>1000},requestAnimationFrame:fn=>{raf=fn;return 1},cancelAnimationFrame:()=>{raf=null},setTimeout:fn=>fn(),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),context);const run=code=>vm.runInContext(code,context),click=id=>elements[id].click();


Element.prototype.contains=function(el){return this===el||this.children.some(c=>c.contains?.(el));};
Element.prototype.closest=function(){return null;};
document.body.dataset={};document.body.classList={contains:n=>n==='dos-mode'&&document.dosEnabled,toggle:(n,v)=>{if(n==='dos-mode')document.dosEnabled=v}};
document.dosEnabled=false;
document.querySelector=q=>{if(q==='dialog[open]')return all.find(e=>e.open);if(q.startsWith('#'))return elements[q.slice(1)];const match=q.match(/\[data-(mode|tool)="(.*?)"\]/);return match?(match[1]==='mode'?modes:all).find(e=>e.dataset[match[1]]===match[2]):null;};
let exits=0;document.documentElement=new Element('html');document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;document.listeners.fullscreenchange();};document.exitFullscreen=async()=>{exits++;document.fullscreenElement=null;document.listeners.fullscreenchange();};
vm.runInContext(fs.readFileSync(require.resolve('../dist/dos-mode.js'),'utf8'),context);
(async()=>{
 run("setTool('pencil');color=2;keyboard={x:7,y:9};dosCanvasEnter();title='Keep my edits';dirty=true");
 const before=run('S.projectJSON(slides,title)'),beforeHistory=run('history.length');
 click('dosToggle');await elements.dosFullscreen.onclick();
 const quit=elements.dosMenuBar.children.find(g=>g.children[0].textContent==='Quit').children[0];quit.click();await Promise.resolve();await Promise.resolve();
 assert.equal(document.dosEnabled,false);assert.equal(document.fullscreenElement,null);assert.equal(exits,1);assert.equal(document.activeElement,elements.dosToggle);
 assert.equal(run('S.projectJSON(slides,title)'),before);assert.equal(run('dirty'),true);assert.equal(run('history.length'),beforeHistory);
 console.log('Actual Studio Quit preserved project bytes, dirty flag and undo history; exited owned fullscreen and focused interface toggle.');
})().catch(e=>{console.error(e);process.exitCode=1;});
