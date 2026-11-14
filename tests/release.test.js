const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
const files=walk(site);
assert.ok(fs.existsSync(path.join(site,'.nojekyll')));
for(const file of files){
 const name=path.relative(site,file);
 assert.doesNotMatch(name,/(^|\/)(\.git|\.openai|samples|results|private)(\/|$)|\.(ev|img|evstudio|pdf)$/i);
 if(!/\.(html|md|js|css|txt)$/.test(name))continue;
 const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/\/Users\/williamwitt|appgprj_[a-z0-9]+|gh[pousr]_[A-Za-z0-9]{20,}/);
 const links=/\.html$/.test(name)?[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(x=>x[1]):/\.md$/.test(name)?[...text.matchAll(/\]\(([^)]+)\)/g)].map(x=>x[1]):[];
 for(const link of links){if(/^(https?:|mailto:|#)/.test(link))continue;assert.ok(!link.startsWith('/'),`Project-site URL must be relative: ${name}: ${link}`);const dest=path.resolve(path.dirname(file),decodeURIComponent(link.split('#')[0]));assert.ok(fs.existsSync(dest),`Broken ${name}: ${link}`)}
}
for(const file of ['index.html','dos-mode.js','core.js','app.js','video.js','sevenzip-assets.js','LICENSE','LGPL-2.1.txt','pcmill-MIT.txt','third_party/sources/7z-wasm-1.2.0.tar.gz','third_party/sources/7zip-24.09.tar.xz'])assert.ok(fs.statSync(path.join(site,file)).size>0,file);
const provenance=JSON.parse(fs.readFileSync(path.join(root,'vendor/7z/PROVENANCE.json')));
for(const [name,hash]of Object.entries(provenance.sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'vendor/7z',name))).digest('hex'),hash);
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(site,'sevenzip-assets.js'),'utf8')+'\nglobalThis.worker=EVSevenZipWorker;',context);
assert.ok(context.worker.includes(fs.readFileSync(path.join(root,'vendor/7z/7zz.wasm')).toString('base64')));
assert.ok(context.worker.includes(fs.readFileSync(path.join(root,'tools/sevenzip-core.js'),'utf8').trim()));
console.log(`Release checks passed: ${files.length} Pages files, relative asset/source links, public-only content, license sources, vendor hashes and rebuilt worker.`);
