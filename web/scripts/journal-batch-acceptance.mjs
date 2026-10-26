// Private manuscript paths/results are supplied externally, never bundled.
// node web/scripts/journal-batch-acceptance.mjs manifest.json output-directory
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const [manifestPath,outputPath]=process.argv.slice(2);
if(!manifestPath||!outputPath)throw Error('Usage: manifest.json output-directory; set SHUYE_MCP_URL and SHUYE_MCP_TOKEN[_FILE]');
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),output=resolve(outputPath);await mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,value)=>writeFile(join(output,name),JSON.stringify(value,null,2));
const client=new Client({name:'shuye-journal-acceptance',version:'0.6.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../../mcp/remote.mjs',import.meta.url))],env:{...process.env},stderr:'pipe',maxBufferSize:64*1024*1024});
transport.stderr?.on('data',chunk=>process.stderr.write(chunk));
const checks=[];
try{
 await client.connect(transport);const tools=(await client.listTools()).tools;await save('tools.json',tools);
 async function call(name,args){process.stderr.write('MCP '+name+'\n');const result=await client.callTool({name,arguments:args},undefined,{timeout:360000});if(result.isError)throw Error(result.content.map(c=>c.text||'').join('\n'));return result.structuredContent??JSON.parse(result.content[0].text);}
 assert.ok(tools.some(t=>t.name==='plan_journal_layout'));assert.ok((await call('get_journal_capabilities',{})).enabled);
 for(const [index,file]of manifest.files.entries()){
  const number=file.number||index+1,source=await readFile(file.path),projectId=`qa-batch-${Date.now()}-${number}`,entry={number,projectId,sourceSha256:hash(source)};checks.push(entry);
  try{
   const original=await call('import_journal_docx',{projectId,title:'验收稿件 '+number,base64:source.toString('base64'),revisionPolicy:manifest.revisionPolicy||'require-clean'});
   assert.equal(original.document.importReports[0].sourceSha256,entry.sourceSha256);
   const plan=await call('plan_journal_layout',{projectId,width:210,height:285,minDpi:300,journal:{template:'cn-academic',name:'实稿技术验收',nameEn:'Manuscript Acceptance',shortTitle:'稿件 '+number,...(original.document.notes?.[0]?{articleNoteId:original.document.notes[0].id}:{})}});
   assert.deepEqual(plan.diagnostics.filter(d=>d.severity==='error'),[]);
   plan.operations.push({op:'set_layout',patch:{header:'MCP页眉验收',headerEven:'MCP偶数页眉验收',footer:'MCP页脚验收 {page}'}});
   await call('apply_changes',{projectId,expectedRevision:original.revision,operations:plan.operations,dryRun:true,responseMode:'summary'});
   assert.deepEqual(await call('get_project',{projectId}),original);
   const edited=await call('apply_changes',{projectId,expectedRevision:original.revision,operations:plan.operations});
   const summary=await call('get_project',{projectId,responseMode:'summary'});assert.equal(summary.document,undefined);assert.equal(summary.revision,edited.revision);assert.equal(summary.documentSummary.blockCount,edited.document.blocks.length);entry.compactResponse=true;
   for(const b of original.document.blocks){const after=edited.document.blocks.find(x=>x.id===b.id);for(const key of ['text','rows','src','marks','cellMarks','inlineMath','sourceOmml','sourceSha256'])assert.deepEqual(after[key],b[key]);}
   assert.deepEqual(edited.document.notes,original.document.notes);assert.ok((await call('get_outline',{projectId})).chapters.length);
   await assert.rejects(()=>call('set_title',{projectId,expectedRevision:original.revision,title:'Rejected old revision'}),/REVISION_CONFLICT/);
   entry.revision=edited.revision;entry.contentPreserved=true;entry.dryRun=true;entry.conflictProtection=true;
   await save(`${number}-document.json`,edited);
   let proof=await call('start_journal_proof',{projectId,expectedRevision:edited.revision});entry.proofId=proof.proofId;
   const deadline=Date.now()+360000;
   while(proof.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,2500));proof=await call('get_journal_proof',{proofId:proof.proofId});}
   await save(`${number}-proof.json`,proof);assert.equal(proof.status,'complete',proof.error);
   const download=await call('download_journal_pdf',{proofId:proof.proofId});const pdf=Buffer.from(download.base64,'base64');assert.equal(hash(pdf),proof.pdfSha256);
   await writeFile(join(output,`${number}.pdf`),pdf);
   for(let page=1;page<=proof.pages;page++){
    const parts=[],first=await call('get_journal_proof_page',{proofId:proof.proofId,page,limit:200});parts.push(first);
    for(let offset=200;offset<Math.max(first.totalObjects,first.totalLines);offset+=200)parts.push(await call('get_journal_proof_page',{proofId:proof.proofId,page,offset,limit:200}));
    await save(`${number}-page-${page}.json`,parts);
   }
   const errors=proof.report.quality.diagnostics.filter(d=>d.severity==='error');
   Object.assign(entry,{pages:proof.pages,pdfSha256:proof.pdfSha256,coverage:proof.report.semanticLayout.sourceObjectCoverage,errors,compileMessages:proof.report.compileMessages});
   assert.equal(hash(await readFile(file.path)),entry.sourceSha256);entry.originalUnchanged=true;
   entry.productionReady=proof.report.quality.productionReady;
   assert.deepEqual([...new Set(errors.map(e=>e.code))].sort(),(file.expectedErrors||[]).sort());
   if(file.expectedErrors?.length){assert.equal(proof.report.quality.status,'BLOCKED');entry.expectedSourceBlock=true;}
   assert.deepEqual(proof.report.compileMessages,[]);assert.deepEqual(entry.coverage.missing,[]);
   entry.passed=true;
  }catch(error){entry.passed=false;entry.error=error.message;}
  await save('results.json',checks);console.log(JSON.stringify(entry));
 }
}finally{await client.close();}
if(checks.length!==manifest.files.length||checks.some(c=>!c.passed))process.exitCode=1;
