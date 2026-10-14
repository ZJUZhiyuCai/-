import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ProjectStore} from '../mcp/store.mjs';
import {createTools} from '../mcp/service.mjs';
import {checkDocument,applyOperations} from '../mcp/operations.mjs';
import {materializeReferences} from '../src/references.mjs';
import {assembleBook} from '../src/workspace-tools.mjs';
import {execFileSync} from 'node:child_process';

const fixture=()=>({format:'open-typesetter',version:2,title:'MCP验收',blocks:[{id:'title',type:'heading',text:'主标题',level:1},{id:'chapter',type:'heading',text:'第一章',level:2},{id:'body',type:'paragraph',text:'中文😀正文'},{id:'table',type:'table',text:'表一',rows:[['甲','乙'],['丙','丁']],headerRows:1},{id:'formula',type:'equation',text:'x^2'},{id:'picture',type:'image',text:'图一',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq2kAAAAASUVORK5CYII='},{id:'break',type:'pageBreak',text:''},{id:'contents',type:'toc',text:'目录'},{id:'index',type:'index',text:'索引'}]});
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'shuye-mcp-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('atomic edits, dry run, restart persistence, revision conflict and undo',t=>{
  const root=temp(t),store=new ProjectStore(root);store.create('book',fixture());
  const ops=[{op:'set_title',title:'新书名'},{op:'set_layout',patch:{header:'奇数页',headerEven:'偶数页',footer:'第 {page} 页',footerEven:'偶 {page}'}},{op:'update_block',blockId:'body',patch:{fontSize:13,marks:[{start:0,end:2,bold:true}],ruby:[{start:0,end:2,text:'zhōng wén'}]}}];
  assert.equal(store.edit('book',1,ops,{dryRun:true}).preview.title,'新书名');assert.equal(store.get('book').revision,1);
  assert.throws(()=>store.edit('book',1,[...ops,{op:'update_block',blockId:'missing',patch:{text:'坏修改'}}]),/BLOCK_NOT_FOUND/);assert.equal(store.get('book').document.title,'MCP验收');
  store.edit('book',1,ops);assert.equal(new ProjectStore(root).get('book').document.layout.footer,'第 {page} 页');
  assert.throws(()=>store.edit('book',1,ops),/REVISION_CONFLICT/);store.undo('book',2);assert.equal(store.get('book').document.title,'MCP验收');assert.equal(store.get('book').revision,3);
  assert.throws(()=>store.create('../escape',fixture()));assert.throws(()=>store.create('book',fixture()),/PROJECT_EXISTS/);
});
test('chapter moves and deletes operate on subtrees, all component types survive',()=>{
  const doc=checkDocument(fixture());const changed=applyOperations(doc,[{op:'chapter_insert',heading:{id:'ch2',type:'heading',level:2,text:'第二章'},blocks:[{id:'p2',type:'paragraph',text:'后文'}]},{op:'chapter_move',headingId:'ch2',beforeId:'chapter'}]).document;
  assert.deepEqual(changed.blocks.slice(1,4).map(b=>b.id),['ch2','p2','chapter']);assert.equal(new Set(changed.blocks.map(b=>b.type)).size,8);
  assert.throws(()=>applyOperations(changed,[{op:'chapter_move',headingId:'chapter',beforeId:'body'}]),/INVALID_MOVE/);
  assert.equal(applyOperations(changed,[{op:'chapter_delete',headingId:'ch2'}]).document.blocks.length,doc.blocks.length);
});
test('notes, citations, component references and review comments remain linked and resolve for output',()=>{
  const source=checkDocument(fixture()),result=applyOperations(source,[{op:'upsert_note',note:{id:'n1',text:'出版脚注'}},{op:'upsert_bibliography',entry:{id:'b1',text:'作者. 原创文献. 2026.'}},{op:'insert_reference',blockId:'body',offset:6,kind:'note',targetId:'n1'},{op:'insert_reference',blockId:'body',offset:0,kind:'cite',targetId:'b1'},{op:'insert_reference',blockId:'body',offset:0,kind:'ref',targetId:'chapter'},{op:'upsert_comment',comment:{id:'review',blockId:'body',text:'核对出处',resolved:false}}]).document;
  const rendered=materializeReferences(result);assert.match(rendered.blocks[2].text,/第一章\[1\]中文😀正文\[\^n1\]/);assert.equal(rendered.blocks.at(-1).text,'[1] 作者. 原创文献. 2026.');assert.match(result.blocks[2].text,/\[\[ref:chapter\]\]/);assert.equal(source.notes.length,0);
  assert.throws(()=>applyOperations(result,[{op:'delete_note',noteId:'n1'}]),/DANGLING_REFERENCE/);
  assert.throws(()=>applyOperations(result,[{op:'delete_blocks',blockIds:['chapter']}]),/DANGLING_REFERENCE/);
  assert.equal(applyOperations(result,[{op:'delete_blocks',blockIds:['body']}]).document.comments.length,0);
});
test('table cell, merges, split and resize retain original content',()=>{
  let doc=checkDocument(fixture());doc=applyOperations(doc,[{op:'table_set_cell',blockId:'table',row:0,col:0,text:'首格'},{op:'table_merge',blockId:'table',range:{row:0,col:0,rowspan:2,colspan:1}}]).document;
  assert.equal(doc.blocks[3].merges[0].rowspan,2);doc=applyOperations(doc,[{op:'table_split',blockId:'table',row:1,col:0},{op:'table_resize',blockId:'table',axis:'col',index:2}]).document;assert.deepEqual(doc.blocks[3].rows,[['首格','乙',''],['丙','丁','']]);
});
test('strict schemas reject unknown fields, duplicate IDs, invalid graphemes and dangling refs',()=>{
  const doc=checkDocument(fixture());assert.throws(()=>applyOperations(doc,[{op:'set_layout',patch:{madeUp:true}}]));
  assert.throws(()=>applyOperations(doc,[{op:'replace_text',blockId:'body',start:3,end:4,text:'X'}]),/GRAPHEME/);
  assert.throws(()=>applyOperations(doc,[{op:'insert_blocks',blocks:[{id:'body',type:'paragraph',text:'duplicate'}]}]),/DUPLICATE_ID/);
  assert.throws(()=>applyOperations(doc,[{op:'update_block',blockId:'body',patch:{text:'[^missing]'}}]),/DANGLING_REFERENCE/);
  assert.throws(()=>applyOperations(doc,[{op:'update_block',blockId:'body',patch:{width:50}}]),/PROPERTY_REQUIRES_IMAGE/);
});
test('chapter assembly remaps bibliography, cross references and review comments',()=>{
  const doc=applyOperations(checkDocument(fixture()),[{op:'upsert_bibliography',entry:{id:'source',text:'原创来源'}},{op:'insert_reference',blockId:'body',offset:0,kind:'cite',targetId:'source'},{op:'insert_reference',blockId:'body',offset:0,kind:'ref',targetId:'chapter'},{op:'upsert_comment',comment:{id:'review',blockId:'body',text:'编辑批注'}}]).document;
  const combined=assembleBook(doc,[doc]).doc;checkDocument(combined);assert.equal(combined.bibliography.length,2);assert.notEqual(combined.comments[0].blockId,combined.comments[1].blockId);
});
test('tool aliases cover individual mutation APIs including removals and undo',async t=>{
  const store=new ProjectStore(temp(t)),tools=createTools(store),run=async(name,args)=>{const tool=tools.find(t=>t.name===name);return tool.run(tool.schema.parse(args));};store.create('book',fixture());let revision=1;
  const steps=[['insert_blocks',{blocks:[{id:'new',type:'paragraph',text:'新增'}]}],['update_block',{blockId:'new',patch:{text:'修改'}}],['replace_text',{blockId:'new',start:0,end:1,text:'改'}],['move_blocks',{blockIds:['new'],beforeId:'body'}],['table_set_cell',{blockId:'table',row:1,col:1,text:'值'}],['table_merge',{blockId:'table',range:{row:0,col:0,rowspan:2,colspan:1}}],['table_split',{blockId:'table',row:0,col:0}],['table_resize',{blockId:'table',axis:'row',index:2}],['chapter_insert',{heading:{id:'new-ch',type:'heading',level:2,text:'新章'},blocks:[]}],['chapter_move',{headingId:'new-ch',beforeId:'chapter'}],['chapter_delete',{headingId:'new-ch'}],['upsert_note',{note:{id:'n',text:'注释'}}],['delete_note',{noteId:'n'}],['upsert_bibliography',{entry:{id:'b',text:'来源'}}],['delete_bibliography',{entryId:'b'}],['upsert_comment',{comment:{id:'c',blockId:'new',text:'批注',resolved:true}}],['delete_comment',{commentId:'c'}],['set_styles',{styles:[{name:'正文',type:'paragraph',fontSize:12}]}],['apply_style',{blockIds:['new'],name:'正文'}],['set_index',{terms:['修改']}],['set_bookmarks',{bookmarks:[{name:'书签',blockId:'new'}]}],['delete_blocks',{blockIds:['new']}]];
  for(const [name,args] of steps)revision=(await run(name,{projectId:'book',expectedRevision:revision,...args})).revision;
  const replacement=await run('replace_project',{projectId:'book',expectedRevision:revision,document:fixture()});assert.equal(replacement.revision,revision+1);const undo=await run('undo_project',{projectId:'book',expectedRevision:replacement.revision});assert.equal(undo.revision,revision+2);
});
test('DOCX and PDF preflight tools use the actual Python adapters',async t=>{
  const store=new ProjectStore(temp(t)),tools=createTools(store),run=async(name,args)=>{const tool=tools.find(t=>t.name===name);return tool.run(tool.schema.parse(args));};
  const code="import io,zipfile,json,base64\nfrom pypdf import PdfWriter\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>original fixture</w:t></w:r></w:p></w:body></w:document>')\np=io.BytesIO();w=PdfWriter();w.add_blank_page(200,300);w.write(p)\nprint(json.dumps({'docx':base64.b64encode(b.getvalue()).decode(),'pdf':base64.b64encode(p.getvalue()).decode()}))";
  const fixtures=JSON.parse(execFileSync(process.env.SHUYE_PYTHON||'python',['-c',code],{encoding:'utf8',windowsHide:true}));
  await run('import_docx',{projectId:'word',title:'Word',base64:fixtures.docx});assert.equal(store.get('word').document.blocks[0].text,'original fixture');
  const output=await run('preflight_pdf',{base64:fixtures.pdf,booklet:true,cropMarks:true});assert.equal(output.report.outputPages,2);assert.ok(fs.readFileSync(output.path).subarray(0,4).equals(Buffer.from('%PDF')));assert.equal((await run('get_capabilities',{})).backend.pypdf,true);
});
test('styles, index, bookmarks, moving blocks and edited offsets persist',()=>{
  const doc=applyOperations(checkDocument(fixture()),[{op:'set_styles',styles:[{name:'正文样式',type:'paragraph',fontSize:12}]},{op:'apply_style',blockIds:['body'],name:'正文样式'},{op:'set_index',terms:['中文']},{op:'set_bookmarks',bookmarks:[{name:'定位',blockId:'body'}]},{op:'replace_text',blockId:'body',start:0,end:2,text:'汉字'},{op:'move_blocks',blockIds:['formula'],beforeId:'table'}]).document;
  assert.equal(doc.blocks.find(b=>b.id==='body').fontSize,12);assert.equal(doc.blocks[3].id,'formula');assert.deepEqual(doc.indexTerms,['中文']);assert.equal(doc.bookmarks.length,1);
});
test('workspace rejects symlink files and locked simultaneous writers',t=>{
  const root=temp(t),store=new ProjectStore(root);store.create('book',fixture());fs.writeFileSync(store.file('book')+'.lock','');assert.throws(()=>store.edit('book',1,[{op:'set_title',title:'x'}]),/PROJECT_BUSY/);fs.unlinkSync(store.file('book')+'.lock');
  if(process.platform!=='win32'){fs.symlinkSync(store.file('book'),store.file('linked'));assert.throws(()=>store.get('linked'),/INVALID_PROJECT_FILE/);}
});
test('real stdio MCP initialize, discovery, resources, prompts, errors, imports and export JSON',async t=>{
  const root=temp(t),client=new Client({name:'acceptance-agent',version:'1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp/server.mjs',import.meta.url)),'--workspace',root],stderr:'pipe'});
  await client.connect(transport);t.after(()=>client.close());
  const discovered=await client.listTools();assert.ok(discovered.tools.length>=35);assert.ok(discovered.tools.every(t=>t.inputSchema.type==='object'));
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent||JSON.parse(r.content[0].text);};
  await call('create_project',{projectId:'book',document:fixture()});assert.equal((await call('list_projects')).projects.length,1);
  let revision=1;
  for(const [name,args] of [['set_title',{title:'Agent排版'}],['set_layout',{patch:{footer:'第 {page} 页'}}],['upsert_note',{note:{id:'n',text:'脚注'}}],['insert_reference',{blockId:'body',offset:0,kind:'note',targetId:'n'}],['upsert_comment',{comment:{id:'c',blockId:'body',text:'意见'}}]]){const r=await call(name,{projectId:'book',expectedRevision:revision,...args});revision=r.revision;}
  assert.equal((await call('get_project',{projectId:'book'})).document.title,'Agent排版');assert.equal((await call('list_components',{projectId:'book',limit:2})).blocks.length,2);
  assert.equal((await call('get_outline',{projectId:'book'})).chapters.length,2);assert.equal((await call('validate_project',{projectId:'book'})).valid,true);await call('get_document_schema');
  assert.ok((await client.listResources()).resources.length>=2);const resource=await client.readResource({uri:'shuye://projects/book'});assert.match(resource.contents[0].text,/Agent排版/);await client.readResource({uri:'shuye://schema'});assert.equal((await client.listPrompts()).prompts[0].name,'book-editing');await client.getPrompt({name:'book-editing'});
  const bad=await client.callTool({name:'set_title',arguments:{projectId:'book',expectedRevision:1,title:'stale'}});assert.equal(bad.isError,true);
  const exported=await call('export_project',{projectId:'book',expectedRevision:revision});assert.equal(JSON.parse(fs.readFileSync(exported.path)).title,'Agent排版');
  await call('import_text',{projectId:'plain',title:'纯文本',text:'第一段\n第二段'});await call('import_text',{projectId:'fbd',title:'标记',format:'fbd',text:'〖HT5SS〗文字'});
  const p=await call('import_pro',{projectId:'book',expectedRevision:revision,source:'〖BX7SS,180mm。120mm,1C220mm。160mm,S20mm,Z20mm,2mm,QF〗',dryRun:true});assert.equal(p.preview.layout.width,160);assert.equal((await call('get_project',{projectId:'book'})).revision,revision);
});
