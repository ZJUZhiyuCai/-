import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Local acceptance only');
const sign=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const identity=process.env.TEST_WORKER_DIRECT==='1'?{'oai-authenticated-user-id':'local-acceptance'}:{};
const call=async(name,args)=>{const r=await fetch(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',cookie,...identity},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),j=await r.json();if(j.result?.isError)throw Error(j.result.content[0].text);return j.result.structuredContent;};
const projectId='ink-acceptance-'+Date.now();
const rect=(id,x,y,width,height,values,overprint=false)=>({id,type:'rect',x,y,width,height,fill:{space:'cmyk',values},overprint});
const objects=[rect('cyan',20,20,60,40,[1,0,0,0]),rect('overprint',30,30,15,15,[0,1,0,0],true),rect('knockout',55,30,15,15,[0,1,0,0]),{...rect('spot',20,80,60,20,[0,0,0,0]),fill:{space:'spot',name:'Book Blue',tint:.6,alternate:[1,.3,0,0]}},{id:'text',type:'text',x:20,y:110,width:140,height:35,text:'中文专色与叠印测试 ABC',fontSize:18,color:{space:'cmyk',values:[0,0,0,1]},overprint:true}];
await call('create_project',{projectId,document:{format:'open-typesetter',version:3,title:'CMYK 专色与叠印验收',blocks:[],composition:{masters:[],stories:[],pages:[{id:'p1',objects}]}}});
const initial=await call('get_project',{projectId});
await assert.rejects(()=>call('upsert_frame',{projectId,expectedRevision:1,pageId:'p1',frame:{...objects[0],fill:{space:'cmyk',values:[2,0,0,0]}}}));
assert.equal((await call('get_project',{projectId})).revision,1);
await call('upsert_frame',{projectId,expectedRevision:1,pageId:'p1',frame:{...objects[3],fill:{...objects[3].fill,tint:.25}}});
await call('restore_version',{projectId,expectedRevision:2,revision:1});assert.deepEqual((await call('get_project',{projectId})).document,initial.document);
const fontPath=process.argv[2];let output=null;
if(fontPath){const result=await call('export_composition_pdf',{projectId,expectedRevision:3,fontBase64:(await readFile(fontPath)).toString('base64'),bleedMm:0,cropMarks:false});assert.ok(result.report.colorSpaces.includes('Separation'));assert.ok(result.report.colorSpaces.includes('DeviceCMYK'));assert.equal(result.report.iccConverted,false);output='.sites-runtime/ink-http-acceptance.pdf';await writeFile(output,Buffer.from(result.base64,'base64'));}
let native=null;if(process.argv[3]){native=await call('inspect_founder_pdml',{xml:await readFile(process.argv[3],'utf8')});assert.equal(native.compatibility.editableImport,false);await writeFile('.sites-runtime/pdml-http-inspection.json',JSON.stringify(native,null,2));}
console.log(JSON.stringify({ok:true,origin,projectId,revision:3,output,nativeTotals:native?.totals}));
