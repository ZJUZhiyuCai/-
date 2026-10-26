// Private manifests contain paths to normalized Shuye article snapshots.
// This exercises the public MCP bridge, including bounded artifact downloads.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const [manifestPath,out]=process.argv.slice(2),manifest=JSON.parse(await readFile(manifestPath,'utf8')),output=resolve(out);await mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),save=(name,v)=>writeFile(join(output,name),JSON.stringify(v,null,2));
const client=new Client({name:'shuye-issue-acceptance',version:'0.7.0'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../../mcp/remote.mjs',import.meta.url))],env:{...process.env},stderr:'pipe',maxBufferSize:64*1024*1024});
transport.stderr?.on('data',c=>process.stderr.write(c));
const results={sources:[],checks:[]};
async function call(name,args={}){const r=await client.callTool({name,arguments:args},undefined,{timeout:180000});if(r.isError)throw Error(r.content.map(c=>c.text||'').join('\n'));return r.structuredContent??JSON.parse(r.content[0].text);}
async function proof(issueId,revision,label){
 let p=await call('start_issue_proof',{issueId,expectedRevision:revision});console.log(label+' started '+p.proofId);await save(label+'-task.json',p);
 const deadline=Date.now()+900000;while(p.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,4000));p=await call('get_issue_proof',{proofId:p.proofId});}
 assert.equal(p.status,'complete',p.error);assert.equal(p.stale,false);assert.equal(p.report.paginationStable,true);assert.equal(p.report.contentsRecalculated,true);assert.equal(p.report.word.formulaSourceExact,true);assert.equal(p.report.word.textSourceExact,true);assert.equal(p.report.wordRendering.parseErrorGlyphs,0);assert.deepEqual(p.report.geometry.outside,[]);
 const expected=manifest.expectedErrors||[];assert.deepEqual([...new Set(p.report.quality.diagnostics.map(d=>d.code))].sort(),expected.slice().sort());
 assert.equal(p.report.articles[0].firstPage,label==='reverse'?101:1);for(let i=1;i<p.report.articles.length;i++)assert.equal(p.report.articles[i].firstPage,p.report.articles[i-1].lastPage+1);
 assert.equal((await call('get_issue',{issueId})).latestProofId,p.proofId);await save(label+'-proof.json',p);console.log(label+' complete '+p.pages+' pages');return p;
}
async function download(p,a,label){let offset=0,parts=[];while(true){const r=await call('download_issue_artifact',{proofId:p.proofId,artifactId:a.id,offset,limit:2097152});assert.equal(r.offset,offset);assert.equal(r.sha256,a.sha256);parts.push(Buffer.from(r.base64,'base64'));if(r.done)break;assert.ok(r.nextOffset>offset);offset=r.nextOffset;}const bytes=Buffer.concat(parts);assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);await writeFile(join(output,label+'-'+a.filename),bytes);console.log('verified '+label+' '+a.id);}
try{
 await client.connect(transport);const tools=(await client.listTools()).tools;await save('tools.json',tools);for(const name of ['list_issues','save_issue','get_issue','start_issue_proof','get_issue_proof','download_issue_artifact'])assert.ok(tools.some(t=>t.name===name));assert.equal((await call('get_journal_capabilities')).issue.enabled,true);results.toolCount=tools.length;
 const prefix='qa-issue-'+Date.now(),articles=[];
 for(const [i,file]of manifest.files.entries()){
  const bytes=await readFile(file.snapshot),raw=JSON.parse(bytes),document=raw.document||raw,projectId=prefix+'-'+(i+1);
  if(file.original){const h=sha(await readFile(file.original));assert.equal(h,file.sha256);}
  const r=file.projectId?await call('get_project',{projectId:file.projectId}):await call('create_project',{projectId,document});if(file.projectId)assert.deepEqual(r.document,document);articles.push({projectId:r.projectId,revision:r.revision});results.sources.push({projectId:r.projectId,revision:r.revision,snapshotSha256:sha(bytes),originalSha256:file.sha256});
 }
 const issueId=prefix,plan={title:manifest.title||'七篇稿件整期验收',firstPage:1,width:210,height:285,articles};let issue=await call('save_issue',{issueId,expectedRevision:0,plan});results.issueId=issueId;await save('results.json',results);
 assert.ok((await call('list_issues')).issues.some(i=>i.issueId===issueId));assert.deepEqual((await call('get_issue',{issueId})).plan,plan);await assert.rejects(()=>call('save_issue',{issueId,expectedRevision:0,plan}),/REVISION_CONFLICT/);
 const normal=await proof(issueId,issue.revision,'normal');results.proofId=normal.proofId;
 for(const a of normal.artifacts)await download(normal,a,'normal');results.checks.push('all-artifact-hashes','contents-continuous-pages','source-text-math-preserved','expected-missing-figure-block');
 if(!manifest.smokeOnly){
  issue=await call('save_issue',{issueId,expectedRevision:issue.revision,plan:{...plan,firstPage:101,articles:[...articles].reverse()}});
  assert.equal((await call('get_issue_proof',{proofId:normal.proofId})).stale,true);await assert.rejects(()=>call('download_issue_artifact',{proofId:normal.proofId,artifactId:'issue-word',limit:1}),/STALE_PROOF/);
  assert.equal((await call('download_issue_artifact',{proofId:normal.proofId,artifactId:'issue-word',limit:1,acknowledgeStale:true})).stale,true);
  const reverse=await proof(issueId,issue.revision,'reverse');assert.deepEqual(reverse.report.articles.map(a=>a.projectId),articles.map(a=>a.projectId).reverse());for(const a of reverse.artifacts.filter(a=>['issue-pdf','issue-word','report'].includes(a.id)))await download(reverse,a,'reverse');
  const history=await call('get_issue',{issueId});assert.deepEqual(history.history.find(h=>h.revision===1).plan,plan);
  issue=await call('save_issue',{issueId,expectedRevision:issue.revision,plan:history.history.find(h=>h.revision===1).plan});assert.equal(issue.revision,3);assert.deepEqual(issue.plan,plan);
  const current=await call('get_project',{projectId:articles[0].projectId,responseMode:'summary'});await call('set_title',{projectId:articles[0].projectId,expectedRevision:current.revision,title:'验收源修订变化'});
  await assert.rejects(()=>call('start_issue_proof',{issueId,expectedRevision:issue.revision}),/REVISION_CONFLICT/);results.checks.push('reordered-seven-articles','first-page-101','stale-download-rejected','explicit-old-artifact','plan-history-restored','changed-source-rejected');
 }
 for(const file of manifest.files)if(file.original)assert.equal(sha(await readFile(file.original)),file.sha256);results.passed=true;
}catch(e){results.passed=false;results.error=e.message;throw e;}finally{await save('results.json',results);await client.close();}
console.log(JSON.stringify(results));
