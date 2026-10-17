import {validateTable,cellMerge,cellDisplayText,headerRowCount,tableRowGroups} from './table-layout.mjs';
const PT=72/25.4;
const fail=message=>{throw Error(message);};
const keys=(o,allowed)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))fail('RICH_UNKNOWN_PROPERTY');};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][\w-]{0,79}$/.test(x);
export function validateRichStory(s,validateSpans){
 if(s.blocks===undefined){if(s.notes!==undefined)fail('RICH_NOTES_REQUIRE_BLOCKS');return;}
 if(s.text!==''||s.spans?.length)fail('RICH_TEXT_MUST_BE_EMPTY');
 if(!Array.isArray(s.blocks)||s.blocks.length>1000||!Array.isArray(s.notes||[])||(s.notes||[]).length>1000)fail('RICH_BLOCK_LIMIT');
 const ids=new Set(),notes=new Set(),used=new Set();let chars=0,cells=0;
 const take=x=>{if(!id(x)||ids.has(x))fail('RICH_DUPLICATE_ID');ids.add(x);};
 for(const n of s.notes||[]){keys(n,['id','text','kind']);take(n.id);notes.add(n.id);if(typeof n.text!=='string'||n.text.length>30000||/\[\^|\[\[(?:cite|ref):/.test(n.text))fail('RICH_NOTE_TEXT');if(n.kind!==undefined&&!['footnote','endnote'].includes(n.kind))fail('RICH_NOTE_KIND');chars+=n.text.length;}
 const text=t=>{if(typeof t!=='string'||t.includes('\t')||/\[\[(?:cite|ref):/.test(t))fail('RICH_TEXT_INVALID');chars+=t.length;for(const m of t.matchAll(/\[\^([^\]]*)\]/g)){if(!notes.has(m[1]))fail('RICH_NOTE_NOT_FOUND');if(used.has(m[1]))fail('RICH_NOTE_MULTIPLE_ANCHORS');used.add(m[1]);}if(t.replace(/\[\^[^\]]*\]/g,'').includes('[^'))fail('RICH_NOTE_MARKER');};
 for(const b of s.blocks){take(b.id);if(b.type==='paragraph'){keys(b,['id','type','text','spans']);text(b.text);validateSpans(b.text,b.spans);for(const m of b.text.matchAll(/\[\^[^\]]*\]/g))if(b.spans?.some(r=>(r.start>m.index&&r.start<m.index+m[0].length)||(r.end>m.index&&r.end<m.index+m[0].length)))fail('RICH_SPAN_SPLITS_NOTE');}
 else if(b.type==='table'){keys(b,['id','type','rows','merges','columnWidths','headerRows']);const t=validateTable(b);if(b.rows.some(r=>r.length!==t.rows[0].length))fail('RICH_TABLE_RECTANGULAR');if(b.headerRows!==undefined&&(!Number.isInteger(b.headerRows)||b.headerRows<0||b.headerRows>b.rows.length))fail('RICH_HEADER_ROWS');cells+=t.rows.length*t.rows[0].length;for(const row of b.rows)for(const value of row)text(value);}
 else fail('RICH_BLOCK_TYPE');}
 if(chars>300000||cells>10000)fail('RICH_CONTENT_LIMIT');
 for(const n of notes)if(!used.has(n))fail('RICH_NOTE_UNREFERENCED');
}
// Rich tables use a uniform horizontal column measure. Different frame heights,
// positions, rotations and equal-width multi-column frames may be freely chained.
export function validateRichFrames(frames){
 let signature;
 for(const f of frames){if(f.writingMode==='vertical-rl'||f.shape||f.exclusions?.length)fail('RICH_REQUIRES_RECTANGULAR_HORIZONTAL_FRAME');const weights=f.columns||[1];if(weights.some(w=>Math.abs(w-weights[0])>1e-8))fail('RICH_REQUIRES_EQUAL_COLUMNS');const width=(f.width-2*(f.padding||0)-(weights.length-1)*(f.columnGap??4))/weights.length;const sig=[width,f.fontSize||11,f.lineHeight||1.5,f.fontFamily||'serif',JSON.stringify(f.color||'#111111')];if(signature&&sig.some((v,i)=>typeof v==='number'?Math.abs(v-signature[i])>1e-7:v!==signature[i]))fail('RICH_COLUMN_MEASURE_MISMATCH');signature=sig;}
}
function expand(text,spans,notes){
 let out='',cursor=0;const ranges=[],marks=[];
 const append=(a,b,value)=>{const at=out.length;out+=value??text.slice(a,b);for(const r of spans||[]){if(value!==undefined){if(r.start<=a&&r.end>a)marks.push({start:at,end:out.length,style:r.style});}else{const l=Math.max(a,r.start),h=Math.min(b,r.end);if(h>l)marks.push({start:at+l-a,end:at+h-a,style:r.style});}}};
 for(const m of text.matchAll(/\[\^([^\]]+)\]/g)){append(cursor,m.index);const start=out.length,n=notes.get(m[1]);append(m.index,m.index+m[0].length,`[${n.number}]`);ranges.push({start,end:out.length,id:n.id});cursor=m.index+m[0].length;}
 append(cursor,text.length);return {text:out,spans:marks,ranges};
}
export function flowRichStory(story,frames,measure,flowText){
 validateRichFrames(frames);
 if(!frames.length)return {runs:[],overset:story.blocks.length||story.notes?.length?'未排入的结构内容':'',offset:0,progress:0,complete:!story.blocks.length};
 const base=frames[0],weights=base.columns||[1],columnWidth=(base.width-2*(base.padding||0)-(weights.length-1)*(base.columnGap??4))/weights.length*PT,size=base.fontSize||11,lh=size*(base.lineHeight||1.5);
 const notes=new Map((story.notes||[]).map((n,i)=>[n.id,{...n,number:i+1}]));
 const textPlan=(text,spans,width=columnWidth,fontSize=size)=>{
  if(width<=6)fail('RICH_TEXT_TOO_NARROW');
  const expanded=expand(text,spans,notes),f={...base,id:'measure',width:width/PT,height:Math.max(100,(expanded.text.length+1)*fontSize*3/PT),padding:0,columns:[1],columnGap:0,rotation:0};
  delete f.shape;delete f.exclusions;f.fontSize=fontSize;
  const plan=flowText(expanded,[f],measure);if(plan.overset)fail('RICH_TEXT_TOO_NARROW');
  const lines=plan.runs[0].lines.map(l=>({...l,noteIds:expanded.ranges.filter(r=>r.start>=l.start&&r.start<l.end).map(r=>r.id)}));
  return lines.length?lines:[{text:'',height:fontSize*(base.lineHeight||1.5),y:0,segments:[],noteIds:[]}];
 };
 const makeTable=b=>{
  const t=validateTable(b),heads=headerRowCount({...t,headerRows:b.headerRows}).count,widths=t.columnWidths.map(w=>columnWidth*w/100),units=t.rows.map(()=>2),cells=[];
  for(let row=0;row<t.rows.length;row++)for(let col=0;col<t.rows[row].length;col++){
   const merge=cellMerge(t,row,col);if(merge&&(merge.row!==row||merge.col!==col))continue;
   const rs=merge?.rowspan||1,cs=merge?.colspan||1,width=widths.slice(col,col+cs).reduce((a,b)=>a+b,0),lines=textPlan(cellDisplayText(t,row,col),[],width-6);
   if(rs===1)units[row]=Math.max(units[row],lines.length+2);cells.push({row,col,rs,cs,width,lines,x:widths.slice(0,col).reduce((a,b)=>a+b,0)});
  }
  for(const cell of cells){const have=units.slice(cell.row,cell.row+cell.rs).reduce((a,b)=>a+b,0),need=cell.lines.length+2;if(need>have)units[cell.row+cell.rs-1]+=need-have;}
  const boundaries=[0];for(const n of units)boundaries.push(boundaries.at(-1)+n);
  for(const cell of cells){cell.start=boundaries[cell.row];cell.end=boundaries[cell.row+cell.rs];cell.lines=cell.lines.map((l,i)=>({...l,unit:cell.start+1+i}));}
  return {id:b.id,type:'table',cells,boundaries,total:boundaries.at(-1),header:boundaries[heads],groups:tableRowGroups(t).map(g=>boundaries[g.end])};
 };
 const blocks=story.blocks.map(b=>b.type==='table'?makeTable(b):{id:b.id,type:'paragraph',lines:textPlan(b.text,b.spans)});
 for(const n of notes.values())if(n.kind==='endnote')blocks.push({id:'endnote-'+n.id,type:'paragraph',endnoteId:n.id,lines:textPlan(`[${n.number}] ${n.text}`,[])});
 const noteSize=Math.max(5,size*.8),notePlans=new Map([...notes.values()].filter(n=>n.kind!=='endnote').map(n=>[n.id,textPlan(`[${n.number}] ${n.text}`,[],columnWidth,noteSize)]));
 let bi=0,position=0,progress=0,pending=[],seen=new Set();const runs=[];
 const shifted=(line,x,y,meta={})=>({...line,...meta,x:(line.x||0)+x,y:line.y+y,segments:line.segments.map(s=>({...s,x:s.x+x,y:s.y+y}))});
 for(const f of frames){const run={frameId:f.id,start:progress,end:progress,lines:[],rules:[],tableFragments:[],notes:[]},pad=(f.padding||0)*PT,columns=f.columns||[1],height=f.height*PT-2*pad;
  for(let column=0;column<columns.length&&(bi<blocks.length||pending.length);column++){
   const x=pad+column*(columnWidth+(f.columnGap??4)*PT);let y=0,body=[],fragments=[],candidateNotes=pending.map(n=>({...n})),localSeen=new Set(seen);
   const reserve=list=>{if(!list.length)return {height:0,chunks:[]};const max=Math.max(0,Math.floor((height*.4-6)/(noteSize*(base.lineHeight||1.5))));const minimum=list.reduce((n,v)=>n+1+(v.at>0?1:0),0);if(minimum>max)return null;let budget=max-minimum;const chunks=list.map(n=>{const plan=notePlans.get(n.id),count=Math.min(plan.length-n.at,1+budget);budget-=count-1;return {...n,count};});return {height:6+chunks.reduce((h,n)=>h+(n.count+(n.at>0?1:0))*noteSize*(base.lineHeight||1.5),0),chunks};};
   const propose=lines=>{const list=candidateNotes.map(n=>({...n}));for(const l of lines)for(const id of l.noteIds||[])if(notePlans.has(id)&&!localSeen.has(id)&&!list.some(n=>n.id===id))list.push({id,at:0});return {list,space:reserve(list)};};
   while(bi<blocks.length){const block=blocks[bi];
    if(block.type==='paragraph'){
     const line=block.lines[position],proposal=propose([line]);if(!proposal.space||y+line.height+proposal.space.height>height+1e-7)break;
     candidateNotes=proposal.list;for(const n of candidateNotes)localSeen.add(n.id);body.push(shifted(line,x,pad+y-line.y,{blockId:block.id,lineIndex:position,endnoteId:block.endnoteId}));y+=line.height;progress++;position++;if(position===block.lines.length){bi++;position=0;}continue;
    }
    const start=position,repeat=start>=block.header&&block.header>0?block.header:0;
    const renderSlice=(from,to,dest,headerRepeat)=>block.cells.flatMap(cell=>cell.lines.filter(l=>l.unit>=from&&l.unit<to).map((line,i)=>shifted(line,x+cell.x+3,pad+dest+(line.unit-from)*lh-line.y,{blockId:block.id,cell:[cell.row,cell.col],sourceUnit:line.unit,repeatedHeader:headerRepeat})));
    const currentSpace=reserve(candidateNotes);if(!currentSpace)break;
    const available=Math.floor((height-y-currentSpace.height)/lh);
    if(start===0&&block.header&&available<block.header+(block.header<block.total?1:0)){if(y===0&&!candidateNotes.length)fail('RICH_TABLE_HEADER_TOO_TALL');break;}
    let end=Math.min(block.total,start+available-repeat);
    if(end<=start)break;
    // Keep ordinary row groups together. Only an over-height group is sliced.
    const nextBoundary=block.groups.find(v=>v>start),fullCapacity=Math.floor((height-currentSpace.height)/lh)-repeat;
    if(nextBoundary>end&&nextBoundary-start<=fullCapacity&&y>0)break;
    const boundary=block.groups.filter(v=>v>start&&v<=end).at(-1);if(boundary&&!(start===0&&boundary===block.header&&block.header<block.total))end=boundary;
    let lines,proposal;
    while(end>start){lines=[...(repeat?renderSlice(0,repeat,y,true):[]),...renderSlice(start,end,y+repeat*lh,false)];proposal=propose(lines);if(proposal.space&&y+(repeat+end-start)*lh+proposal.space.height<=height+1e-7)break;end--;}
    if(end<=start||(start===0&&end<block.header+(block.header<block.total?1:0)))break;
    candidateNotes=proposal.list;for(const n of candidateNotes)localSeen.add(n.id);body.push(...lines);
    const addFragment=(from,to,top,repeatedHeader)=>{const boxes=block.cells.filter(cell=>cell.start<to&&cell.end>from).map(cell=>({x:x+cell.x,y:pad+top+(Math.max(from,cell.start)-from)*lh,width:cell.width,height:(Math.min(to,cell.end)-Math.max(from,cell.start))*lh,continuedBefore:cell.start<from,continuedAfter:cell.end>to}));fragments.push({blockId:block.id,startUnit:from,endUnit:to,repeatedHeader,boxes});};
    if(repeat)addFragment(0,repeat,y,true);addFragment(start,end,y+repeat*lh,false);y+=(repeat+end-start)*lh;progress+=end-start;position=end;if(end===block.total){bi++;position=0;}else break;
   }
   const noteSpace=reserve(candidateNotes);if(!noteSpace)fail('RICH_TOO_MANY_NOTES_ON_LINE');
   if(!body.length&&!fragments.length&&!pending.length&&bi<blocks.length)break;
   run.lines.push(...body);run.tableFragments.push(...fragments);for(const fragment of fragments)for(const box of fragment.boxes)run.rules.push({...box,kind:'cell',color:base.color||'#111111'});
   if(noteSpace.chunks.length){let ny=pad+height-noteSpace.height+6;run.rules.push({kind:'separator',x,y:ny-4,width:Math.min(50,columnWidth),height:.4,color:base.color||'#111111'});pending=[];
    for(const chunk of noteSpace.chunks){const plan=notePlans.get(chunk.id);if(chunk.at>0){const label=textPlan(`[${notes.get(chunk.id).number}]（续）`,[],columnWidth,noteSize)[0];run.lines.push(shifted(label,x,ny-label.y,{noteContinuationFor:chunk.id}));ny+=label.height;}run.notes.push({id:chunk.id,startLine:chunk.at,endLine:chunk.at+chunk.count,continued:chunk.at>0,column});for(let i=chunk.at;i<chunk.at+chunk.count;i++){const line=plan[i];run.lines.push(shifted(line,x,ny-line.y,{noteId:chunk.id,noteLine:i}));ny+=line.height;progress++;}if(chunk.at+chunk.count<plan.length)pending.push({id:chunk.id,at:chunk.at+chunk.count});}
   }else pending=[];
   seen=localSeen;
  }
  run.end=progress;runs.push(run);
 }
 const complete=bi===blocks.length&&!pending.length;
 return {runs,offset:progress,progress,complete,overset:complete?'':`结构内容尚未排完（组件 ${bi+1}/${blocks.length}，待续注释 ${pending.length}）`,remaining:{blockIndex:bi,position,pendingNotes:pending}};
}
