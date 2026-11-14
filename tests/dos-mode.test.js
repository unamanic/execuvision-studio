// DOM-boundary behavioral tests. Does not claim browser visual QA.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const all=[],elements={},events={};let document;
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes={};this.listeners={};this.hidden=false;this.disabled=false;this.open=false;this.isConnected=true;this.tabIndex=0;this.dataset={};this.clicks=0;this.isContentEditable=false;this.classList={toggle:(c,on)=>{this[c]=on}};all.push(this);}
 append(...nodes){for(const n of nodes){this.children.push(n);n.parentElement=this;}}
 setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){this.listeners[k]=f;}
 contains(el){return this===el||this.children.some(c=>c.contains(el));}
 closest(){let p=this;while(p){if(['INPUT','SELECT','TEXTAREA'].includes(p.tagName)||p.isContentEditable)return p;p=p.parentElement;}return null;}
 focus(){document.activeElement=this;}click(){if(!this.disabled){this.clicks++;this.onclick?.();}}
 showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}
}
const ids=['dosMenuBar','dosToggle','dosKeys','dosHelp','dosHelpClose','dosFullscreen','dosExitFullscreen','dosTitleBar','dosModern','dosPanelClose','dosScreenStatus','paletteFamily','background','librarySearch','openProject','importMedia','saveProject','newProject','exportPNG','exportEV','exportVideo','undo','redo','copy','cut','paste','deleteSelection','clearSelection','savePix','addSlide','duplicateSlide','newMotion','previewMotion','exportDeck','help','canvas','runDialog'];
for(const id of ids){elements[id]=new Element(id.includes('Help')||id.includes('Dialog')?'dialog':'button');elements[id].id=id;}
const modes=['create','prepare','run','print'].map(m=>{const e=new Element('button');e.dataset.mode=m;return e;});
const tools=['pencil','erase','line','rect','ellipse','fill','select','text','chart','eyedrop'].map(t=>{const e=new Element('button');e.dataset.tool=t;return e;});
document={body:new Element('body'),activeElement:null,getElementById:id=>elements[id],createElement:tag=>new Element(tag),addEventListener:(k,f,capture)=>{events[k]={f,capture};},querySelector:q=>{if(q.startsWith('#'))return elements[q.slice(1)];if(q==='dialog[open]')return all.find(x=>x.open);const m=q.match(/\[data-(mode|tool)="(.*?)"\]/);return m?(m[1]==='mode'?modes:tools).find(x=>x.dataset[m[1]]===m[2]):null;}};
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/dos-mode.js'),'utf8'),{document});
const key=(k,target=document.activeElement,opts={})=>{const e={key:k,target,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...opts};events.keydown.f(e);return e;};

const groups=elements.dosMenuBar.children,triggers=groups.map(g=>g.children[0]),popups=groups.map(g=>g.children[1]);
const menuIndex=label=>triggers.findIndex(t=>t.textContent===label);
const enabledItems=i=>popups[i].children.filter(x=>!x.disabled);
const item=(menu,label)=>popups[menuIndex(menu)].children.find(b=>b.children[0].textContent===label);
function openMenu(label){elements.canvas.focus();key('F10');for(let i=0;i<menuIndex(label);i++)key('ArrowRight');key('ArrowDown');}
assert.deepEqual(triggers.map(t=>t.textContent),['Create','Prepare','Print','Run','Quit','Studio extras']);
assert.equal(events.keydown.capture,true);
elements.canvas.focus();assert.ok(!key('F2').prevented);assert.equal(elements.saveProject.clicks,0);
elements.dosToggle.click();assert.equal(document.body['dos-mode'],true);assert.equal(elements.dosMenuBar.hidden,false);assert.equal(elements.dosToggle.attributes['aria-pressed'],'true');
key('F10');assert.equal(document.activeElement,triggers[menuIndex('Create')]);key('ArrowRight');assert.equal(document.activeElement,triggers[menuIndex('Prepare')]);
key('Home');assert.equal(document.activeElement,triggers[0]);key('End');assert.equal(document.activeElement,triggers.at(-1));key('Home');
key('ArrowDown');assert.equal(document.activeElement,enabledItems(menuIndex('Create'))[0]);key('End');assert.equal(document.activeElement,enabledItems(0).at(-1));key('Home');key('Escape');assert.equal(document.activeElement,elements.canvas);
openMenu('Studio extras');item('Studio extras','Open project (web)').focus();key('Enter');assert.equal(elements.openProject.clicks,1);assert.equal(document.activeElement,elements.canvas);
openMenu('Create');key('ArrowRight');assert.equal(popups[menuIndex('Prepare')].hidden,false);key('Escape');assert.equal(document.activeElement,elements.canvas);
elements.undo.disabled=true;elements.redo.disabled=true;openMenu('Studio extras');assert.equal(item('Studio extras','Undo (web)').attributes['aria-disabled'],'true');item('Studio extras','New project (web)').focus();key('ArrowDown');assert.equal(document.activeElement,item('Studio extras','Export PNG (web)'));assert.ok(key('p').stopped);key('Escape');
for(const [k,id]of [['F2','saveProject'],['F3','openProject'],['F4','importMedia']]){const n=elements[id].clicks;assert.ok(key(k).prevented);assert.equal(elements[id].clicks,n+1);}
key('F5');assert.equal(modes[2].clicks,1);key('F6');assert.equal(modes[1].clicks,1);key('F7');assert.equal(modes[0].clicks,1);key('F8');assert.equal(modes[3].clicks,1);
const count=elements.saveProject.clicks;key('F2',elements.canvas,{repeat:true});assert.equal(elements.saveProject.clicks,count);
for(const tag of ['input','textarea','select'])assert.ok(!key('F2',new Element(tag)).prevented);
const editable=new Element('span');editable.isContentEditable=true;assert.ok(!key('F2',editable).prevented);
for(const prop of ['ctrlKey','metaKey','altKey','isComposing','defaultPrevented'])assert.ok(!key('F2',elements.canvas,{[prop]:true}).prevented);
elements.runDialog.open=true;assert.ok(!key('F2').prevented);assert.ok(!key('ArrowRight').prevented);elements.runDialog.open=false;
elements.canvas.focus();key('F1');assert.equal(elements.dosHelp.open,true);assert.equal(document.activeElement,elements.dosHelpClose);for(const k of ['p','Delete','ArrowRight','Tab','Escape']){const e=key(k);assert.ok(e.stopped);assert.ok(!e.prevented);}elements.dosHelpClose.click();assert.equal(document.activeElement,elements.canvas);
openMenu('Create');item('Create','Pencil').focus();const createBefore=modes[0].clicks;key('Enter');assert.equal(tools[0].clicks,1);assert.equal(modes[0].clicks,createBefore+1);
openMenu('Create');key('Tab');assert.equal(popups[0].hidden,true);assert.equal(document.activeElement,triggers[0]);key('Escape');
// Quit is an interface transition only: no new-project, save or destructive command.
const newBefore=elements.newProject.clicks,saveBefore=elements.saveProject.clicks;
openMenu('Quit');key('Enter');assert.equal(document.body['dos-mode'],false);assert.equal(elements.newProject.clicks,newBefore);assert.equal(elements.saveProject.clicks,saveBefore);assert.equal(elements.dosMenuBar.hidden,true);assert.equal(document.activeElement,elements.dosToggle);assert.ok(!key('F5').prevented);
console.log('DOS five-task menus passed: source task ordering, labelled web extras, retained commands, scoped keyboard navigation and non-destructive Quit.');

(async()=>{
 const pointer=type=>{const e={preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};elements.canvas.listeners[type](e);return e;};assert.ok(!pointer('pointerdown').stopped);
 elements.dosToggle.click();assert.equal(elements.dosTitleBar.hidden,false);for(const type of ['pointerdown','pointermove','pointerup']){const e=pointer(type);assert.ok(e.prevented&&e.stopped);}assert.equal(document.activeElement,elements.canvas);assert.ok(!key('ArrowRight',elements.canvas,{shiftKey:true}).stopped);
 const clickEvent=detail=>({detail,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}});const mouse=clickEvent(1);events.click.f(mouse);assert.ok(mouse.prevented&&mouse.stopped);const keyboardClick=clickEvent(0);events.click.f(keyboardClick);assert.ok(!keyboardClick.prevented);const pointerAll=clickEvent(1);events.pointerdown.f(pointerAll);assert.ok(pointerAll.prevented&&pointerAll.stopped);
 key('F9');assert.equal(document.body.dataset.dosPanel,'palette');assert.equal(document.activeElement,elements.paletteFamily);assert.equal(elements.dosPanelClose.hidden,false);
 elements.canvas.focus();key('Escape');assert.equal(document.body.dataset.dosPanel,'canvas');assert.equal(elements.dosPanelClose.hidden,true);
 key('F9');elements.dosPanelClose.click();assert.equal(document.activeElement,elements.canvas);
 await elements.dosFullscreen.onclick();assert.match(elements.dosScreenStatus.textContent,/unavailable/);
 let requests=0,exits=0;document.documentElement=new Element('html');
 document.documentElement.requestFullscreen=async()=>{requests++;document.fullscreenElement=document.documentElement;events.fullscreenchange.f();};
 document.exitFullscreen=async()=>{exits++;document.fullscreenElement=null;events.fullscreenchange.f();};
 await elements.dosFullscreen.onclick();assert.equal(requests,1);assert.equal(elements.dosFullscreen.hidden,true);assert.equal(elements.dosExitFullscreen.hidden,false);assert.equal(document.body['dos-fullscreen'],true);
 await elements.dosExitFullscreen.onclick();assert.equal(exits,1);assert.equal(elements.dosFullscreen.hidden,false);assert.equal(document.body['dos-fullscreen'],false);
 document.documentElement.requestFullscreen=async()=>{throw Error('Denied');};await elements.dosFullscreen.onclick();assert.match(elements.dosScreenStatus.textContent,/did not allow/);assert.equal(elements.dosFullscreen.disabled,false);
 document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;events.fullscreenchange.f();};await elements.dosFullscreen.onclick();openMenu('Quit');key('Enter');await Promise.resolve();await Promise.resolve();assert.equal(document.fullscreenElement,null);assert.equal(document.body['dos-mode'],false);assert.equal(elements.dosTitleBar.hidden,true);assert.equal(document.activeElement,elements.dosToggle);
 console.log('Immersive DOS tests passed: palette/window dismissal, explicit fullscreen, unsupported/rejected requests, fullscreenchange and modern-mode exit.');
})().catch(e=>{console.error(e);process.exitCode=1;});

const dosCSS=fs.readFileSync(require.resolve('../dist/dos-mode.css'),'utf8');
assert.match(dosCSS,/\.dos-mode #dosMenuBar\{order:2/);assert.match(dosCSS,/bottom:100%;max-height:calc/);assert.match(dosCSS,/overflow-y:auto/);assert.match(dosCSS,/last-child \[role=menu\]\{left:auto;right:0/);
