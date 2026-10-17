import test from 'node:test';
import assert from 'node:assert/strict';
import {flowStory,rebaseTextSpans} from '../public/editor/src/frame-flow.mjs';
import {validateComposition,applyCompositionOperation} from '../public/editor/src/composition.mjs';
import {applyOperations,checkDocument} from '../lib/operations.mjs';
const pt=72/25.4,frame=(patch={})=>({id:'f',type:'text',x:0,y:0,width:60,height:50,fontSize:10,lineHeight:1,...patch});
const measure=(s,f)=>[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s)].length*f.fontSize;
const doc=(text,patch={},spans=[])=>checkDocument({format:'open-typesetter',version:3,title:'测试',blocks:[],composition:{pages:[{id:'p',objects:[frame(patch)]}],masters:[],stories:[{id:'s',name:'test',text,spans,frameIds:['f']}]}});
test('unequal columns exhaust in order and preserve grapheme ranges across frames',()=>{
 const text='天地玄黄宇宙洪荒👩🏽‍💻 é\n'.repeat(25),f=frame({columns:[1,2],columnGap:3,height:30}),r=flowStory({text},[f,frame({id:'g'})],measure);
 assert.deepEqual([...new Set(r.runs[0].lines.map(l=>l.column))],[0,1]);assert.ok(r.runs[0].lines.filter(l=>l.column===1)[0].width>r.runs[0].lines[0].width*1.9);
 assert.equal(r.runs.map(r=>text.slice(r.start,r.end)).join('')+r.overset,text);
 const boundaries=new Set([text.length,...[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].map(g=>g.index)]);assert.ok(r.runs.flatMap(r=>r.lines).every(l=>boundaries.has(l.start)&&boundaries.has(l.end)));
});
test('large styled characters expand row height without overlap and colors survive split',()=>{
 const text='天地玄黄宇宙洪荒'.repeat(10),spans=[{start:2,end:5,style:{fontSize:24,color:'#ff0000'}}],d=doc(text,{},spans),r=flowStory(d.composition.stories[0],[frame()],measure);
 const first=r.runs[0].lines[0];assert.equal(first.height,24);assert.ok(first.segments.some(s=>s.style.color==='#ff0000'));assert.ok(r.runs[0].lines[1].y>=first.y+first.height);
 applyCompositionOperation(d,{op:'split_story',storyId:'s',frameId:'f',offset:3,newStoryId:'s2'});assert.equal(d.composition.stories[0].spans[0].end,3);assert.deepEqual(d.composition.stories[1].spans[0],{start:0,end:2,style:spans[0].style});
});
test('kinsoku avoids opening marks at end and closing marks at start; Latin words move intact',()=>{
 const text='甲乙（丙丁）戊己。庚辛。';const r=flowStory({text},[frame({width:40/pt})],measure);for(const l of r.runs[0].lines){assert.ok(!/^[）。，]/.test(l.text));assert.ok(!/[（]$/.test(l.text));}
 const latin=flowStory({text:'one two three'},[frame({width:60/pt})],measure);assert.equal(latin.runs[0].lines[0].text,'one ');assert.equal(latin.runs[0].lines[1].text,'two ');
});
test('exclusion rectangles and sloping polygon keep every segment inside conservative bands',()=>{
 const f=frame({width:80,height:80,shape:[[20,0],[60,0],[80,80],[0,80]],exclusions:[{x:30,y:15,width:20,height:25}]}),r=flowStory({text:'天地玄黄'.repeat(100)},[f],measure);
 for(const l of r.runs[0].lines){const top=l.y/pt,bottom=(l.y+l.height)/pt;for(const s of l.segments){const x=s.x/pt,right=(s.x+s.width)/pt;assert.ok(x>=20-top/4-1e-5);assert.ok(right<=60+top/4+1e-5);if(bottom>15&&top<40)assert.ok(right<=30+1e-5||x>=50-1e-5);}}
 assert.ok(r.runs[0].lines.some((l,i,a)=>i&&l.y===a[i-1].y));
});
test('vertical flow is top to bottom, then right to left; stacked columns and overset conserve text',()=>{
 const text='天地 ABC 宇宙'.repeat(25),r=flowStory({text},[frame({writingMode:'vertical-rl',columns:[1,1],columnGap:2})],measure),lines=r.runs[0].lines;
 assert.ok(lines[1].x<lines[0].x);assert.ok(lines[0].segments[1].y>lines[0].segments[0].y);assert.ok(lines.flatMap(l=>l.segments).some(s=>s.rotation===90));assert.equal(text.slice(0,r.offset)+r.overset,text);
});
test('span validation rejects overlap, surrogate splits and invalid flow before atomic edits',()=>{
 const d=doc('甲👩🏽‍💻乙');for(const patch of [{spans:[{start:2,end:3,style:{fontSize:12}}]},{width:40,columns:[1,1],columnGap:50},{writingMode:'bad'},{shape:[[0,0],[100,0],[0,20]]}]){const before=structuredClone(d);assert.throws(()=>applyOperations(d,[{op:'set_title',title:'discard'},{op:'upsert_frame',pageId:'p',frame:frame(patch)}]));assert.deepEqual(d,before);}
 assert.throws(()=>validateComposition({...d.composition,stories:[{...d.composition.stories[0],spans:[{start:0,end:1,style:{}},{start:0,end:1,style:{}}]}]}),/SPAN_RANGE/);
});
test('editing preserves outer marks and insertion inherits style without splitting graphemes',()=>{
 const spans=[{start:1,end:4,style:{fontSize:20}}];assert.deepEqual(rebaseTextSpans('ABCDE','ABxxCDE',spans),[{start:1,end:2,style:{fontSize:20}},{start:2,end:4,style:{fontSize:20}},{start:4,end:6,style:{fontSize:20}}]);
 assert.deepEqual(rebaseTextSpans('ABCDE','AE',spans),[]);
});
