// Local-only acceptance against the built standalone bundle, not a live account.
// Usage: node scripts/production-acceptance.mjs FONT.otf NEW_OUTPUT_DIRECTORY
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../.sites-runtime/standalone/server.mjs';

if(!process.argv[2]||!process.argv[3])throw Error('Provide a licensed CJK TTF/OTF font and a new output directory. Run node standalone/build.mjs first.');
const font=await readFile(resolve(process.argv[2])),output=resolve(process.argv[3]);
await mkdir(output); // Never overwrite earlier evidence.
const proof=JSON.parse(await readFile(new URL('../tests/fixtures/journal-proof.json',import.meta.url),'utf8'));
const port=Number(process.env.QA_PORT||18793),origin=`http://127.0.0.1:${port}`,base=origin+'/shuye';
const password=randomBytes(24).toString('base64url');
const app=await startServer({directory:join(output,'server-data'),publicDirectory:fileURLToPath(new URL('../.sites-runtime/standalone/public',import.meta.url)),origin,basePath:'/shuye',port,bootstrapPassword:password});
const checks=[];
try{
 const request=(path,body,cookie,requestOrigin=origin)=>fetch(base+path,{method:'POST',redirect:'manual',headers:{Origin:requestOrigin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body});
 assert.equal((await request('/api/mcp-projects','{}')).status,401);checks.push('unauthenticated API rejected');
 const login=await request('/login',new URLSearchParams({password}).toString());assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/mcp-projects','{}',cookie,'https://invalid.example')).status,403);checks.push('foreign Origin rejected');
 const api=async(tool,args={})=>{const r=await request('/api/mcp-projects',JSON.stringify({tool,arguments:args}),cookie);return {status:r.status,data:await r.json()};};
 const discovery=await request('/mcp',JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),cookie),rpc=await discovery.json();
 assert.ok(rpc.result.tools.length>=76);assert.ok(rpc.result.tools.find(t=>t.name==='export_composition_pdf').inputSchema.properties.acknowledgeBodyOmission);checks.push('MCP discovery includes explicit PDF scope');
 const id='acceptance-proof';assert.equal((await api('create_project',{projectId:id,document:proof})).data.revision,1);
 const edit={projectId:id,expectedRevision:1,operations:[{op:'set_title',title:proof.title+' · edited'}]};
 assert.equal((await api('apply_changes',{...edit,dryRun:true})).status,200);assert.equal((await api('get_project',{projectId:id})).data.revision,1);
 assert.equal((await api('apply_changes',edit)).data.revision,2);assert.equal((await api('apply_changes',edit)).status,409);
 assert.equal((await api('restore_version',{projectId:id,expectedRevision:2,revision:1})).data.revision,3);checks.push('dry run, revision conflict and restore');
 const args={projectId:id,expectedRevision:3,fontBase64:font.toString('base64'),bleedMm:0,cropMarks:false};
 const exported=await api('export_composition_pdf',args);assert.equal(exported.status,200,JSON.stringify(exported.data));
 const bytes=Buffer.from(exported.data.base64,'base64'),report=exported.data.report;
 assert.equal(report.pdfSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(report.productionReady,false);assert.equal(report.scope.omittedBodyBlocks,0);assert.deepEqual(report.trimMm,[170,240]);
 await writeFile(join(output,'proof.pdf'),bytes);await writeFile(join(output,'proof-report.json'),JSON.stringify({revision:3,...report},null,2));checks.push('PDF bytes, scope and SHA-256 bound to revision');
 const negative=structuredClone(proof);negative.blocks=[{id:'body',type:'paragraph',text:'must not omit'}];
 await api('create_project',{projectId:'negative',document:negative});
 const negativeArgs={...args,projectId:'negative',expectedRevision:1};
 const rejected=await api('export_composition_pdf',negativeArgs);assert.notEqual(rejected.status,200);assert.match(rejected.data.error,/BODY_NOT_IN_COMPOSITION/);
 const acknowledged=await api('export_composition_pdf',{...negativeArgs,acknowledgeBodyOmission:true});assert.equal(acknowledged.status,200);assert.equal(acknowledged.data.report.scope.omittedBodyBlocks,1);
 negative.composition={masters:[],stories:[],pages:[{id:'empty',objects:[]}]};
 assert.equal((await api('replace_project',{projectId:'negative',expectedRevision:1,document:negative})).data.revision,2);
 const empty=await api('export_composition_pdf',{...negativeArgs,expectedRevision:2,acknowledgeBodyOmission:true});assert.notEqual(empty.status,200);assert.match(empty.data.error,/EMPTY_COMPOSITION/);checks.push('body omission and empty output rejected');
 assert.equal((await api('archive_project',{projectId:'negative',expectedRevision:2,archived:true})).status,200);
 const archived=(await api('list_projects')).data.projects.find(p=>p.projectId==='negative');assert.equal(archived.archived,true);
 assert.equal((await api('get_project',{projectId:'negative'})).data.document.blocks[0].text,'must not omit');
 assert.equal((await api('archive_project',{projectId:'negative',expectedRevision:archived.revision,archived:false})).status,200);checks.push('reversible archive and recovery');
 const result={passed:true,checks,fontSha256:createHash('sha256').update(font).digest('hex'),pdfSha256:report.pdfSha256,visualInspection:'REQUIRED: render proof.pdf independently and inspect every page; automated checks do not prove correct ink.'};
 await writeFile(join(output,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await app.close();}
