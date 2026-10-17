import test from 'node:test';
import assert from 'node:assert/strict';
import {flowStory,validateComposition} from '../public/editor/src/composition.mjs';
import {paginateStory} from '../public/editor/src/auto-flow.mjs';
import {compositionSchema} from '../lib/composition-schema.mjs';
import {cellDisplayText,cellMerge} from '../public/editor/src/table-layout.mjs';
const measure=(t,f)=>[...t].length*f.fontSize*.6;
import {richFixture} from './fixtures/rich-composition.mjs';
const render=c=>{const s=c.stories[0],frames=new Map(c.pages.flatMap(p=>p.objects).map(f=>[f.id,f]));return flowStory(s,s.frameIds.map(id=>frames.get(id)),measure);};
test('rich table auto-pagination conserves every cell line including split rowspans and repeated headers',()=>{
 const input=richFixture(),before=JSON.stringify(input);compositionSchema.parse(input);validateComposition(input);
 const {composition:c}=paginateStory(input,'s','f',measure);assert.equal(JSON.stringify(input),before);const plan=render(c);assert.equal(plan.complete,true);assert.ok(c.pages.length>5);assert.deepEqual(c.stories[0],{...input.stories[0],frameIds:c.stories[0].frameIds});
 const lines=plan.runs.flatMap(r=>r.lines),keys=lines.filter(l=>l.cell&&!l.repeatedHeader).map(l=>[...l.cell,l.sourceUnit].join(':'));assert.equal(new Set(keys).size,keys.length);
 const table=input.stories[0].blocks[1];for(let r=0;r<table.rows.length;r++)for(let col=0;col<table.rows[0].length;col++){const merge=cellMerge(table,r,col);if(merge&&(merge.row!==r||merge.col!==col))continue;const rendered=lines.filter(l=>l.cell?.[0]===r&&l.cell[1]===col&&!l.repeatedHeader).sort((a,b)=>a.sourceUnit-b.sourceUnit).map(l=>l.text).join('');assert.equal(rendered,cellDisplayText(table,r,col).replace('[^cell-note]','[2]').replace(/\n/g,''));}
 assert.ok(plan.runs.slice(1).some(r=>r.lines.some(l=>l.repeatedHeader)));assert.ok(plan.runs.flatMap(r=>r.rules).some(b=>b.continuedBefore||b.continuedAfter));
 for(const row of [2,4,6,15,31])assert.ok(lines.some(l=>l.cell?.[0]===row&&l.text.includes('第'+(row-2)+'行')));
 assert.ok(lines.some(l=>l.text.includes('表后段落')));assert.ok(lines.some(l=>l.endnoteId==='end-note'));assert.equal(lines.at(-1).endnoteId,'end-note');
 for(const r of plan.runs)for(const l of r.lines)for(const s of l.segments){assert.ok(s.x>=-1e-6);assert.ok(s.y>=-1e-6);assert.ok(s.y+s.style.fontSize<=95*72/25.4+1e-6);}
});
test('footnotes follow anchor in its frame, continue across frames and preserve all note text exactly once',()=>{
 const {composition:c}=paginateStory(richFixture(),'s','f',measure),p=render(c);
 for(const id of ['intro-note','cell-note']){const anchor=p.runs.findIndex(r=>r.lines.some(l=>!l.noteId&&l.noteIds?.includes(id))),note=p.runs.findIndex(r=>r.notes.some(n=>n.id===id));assert.equal(note,anchor);const lines=p.runs.flatMap(r=>r.lines).filter(l=>l.noteId===id);assert.equal(new Set(lines.map(l=>l.noteLine)).size,lines.length);assert.equal(lines.map(l=>l.text).join(''),`[${id==='intro-note'?1:2}] `+c.stories[0].notes.find(n=>n.id===id).text);}
 assert.ok(p.runs.flatMap(r=>r.notes).some(n=>n.continued));
});
test('invalid references, overlapping merges, mismatched columns and ambiguous text fail atomically',()=>{
 for(const edit of [c=>c.stories[0].text='hidden text',c=>c.stories[0].blocks[0].text='[^missing]',c=>c.stories[0].blocks[0].text+='[^intro-note]',c=>c.stories[0].blocks[1].merges.push({row:5,col:0,rowspan:2,colspan:1}),c=>c.pages[0].objects[0].writingMode='vertical-rl']){const c=richFixture();edit(c);assert.throws(()=>validateComposition(c));}
 const c=richFixture(),original=JSON.stringify(c);assert.throws(()=>paginateStory(c,'s','f',measure,{maxNewPages:1}),/PAGE_LIMIT/);assert.equal(JSON.stringify(c),original);
});
test('equal multi-column frames retain unique source lines and separate footnote areas',()=>{
 const c=richFixture();c.pages[0].objects[0].width=224;c.pages[0].objects[0].columns=[1,1];c.pages[0].objects[0].columnGap=4;
 const result=paginateStory(c,'s','f',measure),p=render(result.composition);assert.equal(p.complete,true);assert.ok(p.runs.some(r=>r.lines.some(l=>l.segments.some(s=>s.x>114*72/25.4))));
});
test('over-height first body row is split after intact header, and impossible headers reject',()=>{
 const c=richFixture();c.stories[0].notes=[];c.stories[0].blocks=[{id:'long',type:'table',headerRows:1,rows:[['Heading','Value'],['Long row '.repeat(200),'Bottom']]}];
 const p=render(paginateStory(c,'s','f',measure).composition);assert.equal(p.complete,true);assert.ok(p.runs.length>3);for(const r of p.runs)if(r.tableFragments.length)assert.ok(r.lines.some(l=>l.text==='Heading'));
 c.stories[0].blocks[0].headerRows=2;assert.throws(()=>paginateStory(c,'s','f',measure),/HEADER_TOO_TALL/);
});
test('seeded varying row heights, column counts and merge spans conserve all visible cells',()=>{
 for(let seed=1;seed<=12;seed++){const c=richFixture();c.pages[0].objects[0].height=60+seed*3;c.stories[0].notes=[];const rows=Array.from({length:10+seed},(_,r)=>Array.from({length:2+seed%3},(_,col)=>`${r}:${col} `+'word '.repeat((r*17+col*5+seed)%23)));const table={id:'random',type:'table',headerRows:1,rows,merges:[{row:2,col:0,rowspan:2+seed%3,colspan:1}]};c.stories[0].blocks=[table];const p=render(paginateStory(c,'s','f',measure).composition);assert.ok(p.complete);for(let r=0;r<rows.length;r++)for(let col=0;col<rows[0].length;col++){const merge=cellMerge(table,r,col);if(merge&&(merge.row!==r||merge.col!==col))continue;assert.equal(p.runs.flatMap(x=>x.lines).filter(l=>l.cell?.[0]===r&&l.cell[1]===col&&!l.repeatedHeader).map(l=>l.text).join(''),cellDisplayText(table,r,col).replace(/\n/g,''));}}
});
