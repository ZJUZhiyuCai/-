import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Local acceptance only');
const sign=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const identity=process.env.TEST_WORKER_DIRECT==='1'?{'oai-authenticated-user-id':'local-acceptance'}:{};
const call=async(name,args)=>{const r=await fetch(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',cookie,...identity},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),j=await r.json();if(j.result?.isError)throw Error(j.result.content[0].text);return j.result.structuredContent;};
const projectId='master-acceptance-'+Date.now();
const textFrame=(id,text)=>({id,type:'text',x:20,y:12,width:140,height:15,fontSize:12,text});
const composition={pages:['p1','p2','p3','p4'].map(id=>({id,objects:[],overrides:[]})),stories:[],masters:[
 {id:'base',name:'通用母版',objects:[textFrame('mh','{section} · {sectionPage} · {page}')]},
 ...[['first','首页母版','章节首页'],['odd','奇数页母版','奇数页'],['even','偶数页母版','偶数页']].map(([id,name,prefix])=>({id,name,baseMasterId:'base',objects:[],overrides:[{objectId:'mh',patch:{text:prefix+' · {section} · {sectionPage} · {page}'}}]}))
],sections:[{id:'chapter1',name:'第一章',startPageId:'p1',firstMasterId:'first',oddMasterId:'odd',evenMasterId:'even'}]};
await call('create_project',{projectId,document:{format:'open-typesetter',version:3,title:'嵌套母版与章节验收',blocks:[],composition}});
const before=await call('get_project',{projectId});
for(const [pageId,prefix] of [['p1','章节首页'],['p2','偶数页'],['p3','奇数页'],['p4','偶数页']])assert.ok((await call('list_page_objects',{projectId,pageId})).objects[0].text.startsWith(prefix));
await assert.rejects(()=>call('upsert_master',{projectId,expectedRevision:1,master:{...composition.masters[0],baseMasterId:'first'}}),/CYCLE/);
assert.equal((await call('get_project',{projectId})).revision,1);
await call('override_master_object',{projectId,expectedRevision:1,masterId:'even',objectId:'mh',patch:{text:'偶数页覆盖验收'}});
for(const pageId of ['p2','p4'])assert.equal((await call('list_page_objects',{projectId,pageId})).objects[0].text,'偶数页覆盖验收');
await call('restore_version',{projectId,expectedRevision:2,revision:1});
assert.deepEqual((await call('get_project',{projectId})).document,before.document);
let pdf;
if(process.argv[2]){
 const result=await call('export_composition_pdf',{projectId,expectedRevision:3,fontBase64:(await readFile(process.argv[2])).toString('base64')});
 assert.equal(result.report.pages,4);await writeFile('.sites-runtime/master-acceptance.pdf',Buffer.from(result.base64,'base64'));pdf='.sites-runtime/master-acceptance.pdf';
}
console.log(JSON.stringify({passed:true,projectId,revision:3,url:origin+'/editor/index.html?project='+projectId,pdf,checks:['section and nested master D1/R2 roundtrip','per-page automatic master selection','cycle rejection is atomic','child override updates all even pages','history restore retains sections and inheritance']}));
