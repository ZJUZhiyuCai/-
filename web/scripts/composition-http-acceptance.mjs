import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Local acceptance only');
const sign=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
// Only the loopback production Worker lacks the Sites dispatch identity layer.
const identity=process.env.TEST_WORKER_DIRECT==='1'?{'oai-authenticated-user-id':'local-acceptance'}:{};
const call=async(name,args)=>{const r=await fetch(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',cookie,...identity},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),j=await r.json();if(j.result?.isError)throw Error(j.result.content[0].text);return j.result.structuredContent;};
const projectId='composition-acceptance-'+Date.now();
const frame=(id,x,y,width,height)=>({id,type:'text',x,y,width,height,fontSize:11,lineHeight:1.5});
const composition={pages:[{id:'p1',masterId:'m1',objects:[frame('f1',20,35,65,30),frame('f2',95,35,65,30)],overrides:[]},{id:'p2',masterId:'m1',objects:[frame('f3',20,35,140,150)],overrides:[]}],masters:[{id:'m1',name:'正文母版',objects:[{...frame('mh',20,12,140,12),text:'母版页眉 · {title} · 第 {page} 页'}]}],stories:[{id:'story1',name:'跨页文字流',text:'第一框开始。'.repeat(20)+'中段进入第二框。'.repeat(20)+'末段进入下一页，全部文字必须保留。'.repeat(10),frameIds:['f1','f2','f3']}]};
await call('create_project',{projectId,document:{format:'open-typesetter',version:3,title:'自由版面浏览器验收',blocks:[],composition}});
const before=await call('get_project',{projectId});assert.equal(before.document.composition.stories[0].text,composition.stories[0].text);
const r=await call('override_master_object',{projectId,expectedRevision:1,pageId:'p2',objectId:'mh',patch:{text:'第二页专用页眉'}});assert.equal(r.revision,2);
await assert.rejects(()=>call('thread_frames',{projectId,expectedRevision:2,storyId:'story1',frameIds:['f1','f1']}),/THREADED/);
assert.equal((await call('get_project',{projectId})).revision,2);
const restored=await call('restore_version',{projectId,expectedRevision:2,revision:1});assert.equal(restored.revision,3);
assert.deepEqual((await call('get_project',{projectId})).document.composition,before.document.composition);
console.log(JSON.stringify({passed:true,projectId,revision:3,url:origin+'/editor/index.html?project='+projectId,checks:['v3 persisted in D1/R2','master override via MCP','duplicate chain rejected atomically','version restore preserves entire composition']}));
