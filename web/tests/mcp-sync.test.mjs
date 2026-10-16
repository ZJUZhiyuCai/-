import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectConnection} from '../public/editor/src/project-sync.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('browser follows agent revisions but stops when there are local edits',async()=>{
  let doc={text:'old'},remote={revision:1,document:{text:'saved'}};const c=new ProjectConnection({api:async()=>structuredClone(remote),getDoc:()=>doc,replaceDoc:async d=>{doc=d;}});
  await c.open('book');remote={revision:2,document:{text:'agent'}};assert.equal(await c.poll(),true);assert.equal(doc.text,'agent');doc.text='local';remote={revision:3,document:{text:'other'}};assert.equal(await c.poll(),false);assert.equal(doc.text,'local');
});
test('pending read cannot overwrite new typing or another connection',async()=>{
  let doc={text:'saved'},pending;const c=new ProjectConnection({api:async()=>pending?pending.promise:{revision:1,document:{text:'saved'}},getDoc:()=>doc,replaceDoc:async d=>{doc=d;}});await c.open('book');pending=deferred();const poll=c.poll();doc.text='typed while reading';pending.resolve({revision:2,document:{text:'remote'}});assert.equal(await poll,false);assert.equal(doc.text,'typed while reading');
  doc={text:'saved'};pending=deferred();const second=c.poll();c.disconnect();pending.resolve({revision:3,document:{text:'old response'}});assert.equal(await second,false);assert.equal(doc.text,'saved');
});
test('typing during save remains dirty and revision conflict leaves local work intact',async()=>{
  let doc={text:'saved'},pending;const c=new ProjectConnection({api:async(name)=>name==='get_project'?{revision:1,document:{text:'saved'}}:pending.promise,getDoc:()=>doc,replaceDoc:async d=>{doc=d;}});await c.open('book');doc.text='first edit';pending=deferred();const save=c.save();doc.text='second edit';pending.resolve({revision:2});await save;assert.equal(c.revision,2);assert.equal(c.dirty,true);assert.equal(doc.text,'second edit');
  c.api=async()=>{throw Error('REVISION_CONFLICT');};await assert.rejects(c.save(),/CONFLICT/);assert.equal(doc.text,'second edit');
});

