import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectConnection} from '../public/editor/src/project-sync.mjs';

test('workbench learns the committed identity and revision after create, save, poll and disconnect',async()=>{
 let doc={title:'new'},remote={revision:1,document:doc};const notices=[];
 const c=new ProjectConnection({getDoc:()=>doc,replaceDoc:async d=>{doc=d;},api:async()=>structuredClone(remote),onChange:()=>notices.push({projectId:c.projectId,revision:c.revision,dirty:c.dirty,writing:c.writing})});
 await c.create('paper');assert.deepEqual(notices.at(-1),{projectId:'paper',revision:1,dirty:false,writing:false});
 doc={title:'changed'};remote={revision:2,document:doc};await c.save();assert.equal(notices.at(-1).revision,2);assert.equal(notices.at(-1).dirty,false);
 remote={revision:3,document:{title:'agent'}};await c.poll();assert.equal(notices.at(-1).revision,3);assert.equal(doc.title,'agent');
 c.disconnect();assert.equal(notices.at(-1).projectId,null);
});
