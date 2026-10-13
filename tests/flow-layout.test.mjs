import test from 'node:test';
import assert from 'node:assert/strict';
import {flowGeometry,partFlow,needsFlow,safeFlowCut,minimumFlowUnit,countFlowLineRects} from '../src/flow-layout.mjs';
import {blockElement} from '../src/pagination.mjs';

const layout={width:100,height:120,inner:10,outer:10,top:10,bottom:10,columns:1,gap:4,fontSize:12,lineHeight:1.6,indent:2,pageStart:1,notesMode:'endnote',writingMode:'horizontal-tb'};
test('flow geometry uses physical column dimensions and vertical block progression',()=>{
  const g=flowGeometry({...layout,columns:2,writingMode:'vertical-rl'});
  assert.equal(g.writingMode,'vertical-rl');assert.ok(Math.abs(g.width-38*96/25.4)<1e-9);assert.ok(Math.abs(g.height-100*96/25.4)<1e-9);
});
test('vertical floats have explicit standalone metadata; heading clears a horizontal float',()=>{
  assert.equal(partFlow({type:'image',wrap:'left'},layout).floatSide,'left');
  assert.equal(partFlow({type:'image',wrap:'left'},{...layout,writingMode:'vertical-rl'}).floatSide,'none');
  assert.equal(partFlow({type:'heading'},layout).clear,'both');
  assert.equal(needsFlow({layout,blocks:[{type:'image',wrap:'right'}]}),true);
  assert.equal(needsFlow({layout,blocks:[{type:'image',wrap:'none'}]}),false);
});
test('text splits preserve note tokens and avoid opening or closing punctuation at boundaries',()=>{
  assert.equal(safeFlowCut(Array.from('正文[^n1]后文'),0,5),2);
  assert.equal(safeFlowCut(Array.from('甲乙，丙丁'),0,2),1);
  assert.equal(safeFlowCut(Array.from('甲乙（丙丁'),0,3),2);
});
test('ruby cut boundaries use UTF16 coordinates while pagination uses code points',()=>{
  const points=Array.from('😀甲乙丙丁'),ruby=[{start:2,end:5,text:'jiǎ yǐ bǐng'}];
  assert.equal(safeFlowCut(points,0,3,ruby),1);
  assert.equal(safeFlowCut(points,1,2,ruby),0);
  assert.equal(safeFlowCut(points,1,3,ruby),3);
  assert.equal(minimumFlowUnit(points,1,ruby),3);
  assert.equal(minimumFlowUnit(Array.from('[^note]文'),0),7);
});
test('ruby renderer preserves marked base text and fragment source coordinates',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>({tag,style:{setProperty(){}},dataset:{},children:[],append(...items){this.children.push(...items);}})};
  try{
    const b={type:'paragraph',text:'前甲乙后',ruby:[{start:1,end:3,text:'jiǎ yǐ'}],marks:[{start:2,end:3,bold:true}]};
    const el=blockElement(b,layout,'甲乙后',true,{start:1});
    const ruby=el.children[0];assert.equal(ruby.tag,'ruby');assert.equal(ruby.children[1].textContent,'jiǎ yǐ');
    assert.equal(ruby.children[0].children[0].textContent,'甲');assert.equal(ruby.children[0].children[1].textContent,'乙');
    assert.equal(ruby.children[0].children[1].style.fontWeight,'700');assert.equal(el.children[1].textContent,'后');
  }finally{globalThis.document=previous;}
});
test('flow line counts group mixed-size marks on a shared line in either writing direction',()=>{
  const horizontal=[{width:20,height:16,top:0,bottom:16},{width:10,height:10,top:5,bottom:15},{width:30,height:16,top:25,bottom:41}];
  assert.equal(countFlowLineRects(horizontal),2);
  const vertical=horizontal.map(r=>({...r,left:r.top,right:r.bottom,width:r.height,height:r.width}));
  assert.equal(countFlowLineRects(vertical,true),2);
});

// Set PLAYWRIGHT_MODULE to an installed playwright-core package and optionally
// BROWSER_EXECUTABLE to run genuine geometry checks; no downloads during tests.
test('browser: vertical pagination, real float wrapping and merged table fragments', {skip:!process.env.PLAYWRIGHT_MODULE}, async()=>{
  const {createRequire}=await import('node:module'),{createServer}=await import('node:http'),{readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url'),path=await import('node:path');
  const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE),root=fileURLToPath(new URL('../',import.meta.url));
  const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname,file=path.join(root,name);res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end('missing');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/style.css`);
    await page.setContent('<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/flow-layout.css"><div id="measure"></div><main id="out"></main>');await page.waitForFunction(()=>document.styleSheets.length===2);
    const result=await page.evaluate(async(layout)=>{
      const {paginate,blockElement}=await import('/src/pagination.mjs'),{applyFlowColumn}=await import('/src/flow-layout.mjs');
      await document.fonts.ready;
      function run(doc){const r=paginate(doc,document.querySelector('#measure')),out=document.querySelector('#out');out.replaceChildren();const overflow=[];
        for(const cols of r.pages)for(const parts of cols){const col=document.createElement('div');applyFlowColumn(col,doc.layout,r.width,r.height);for(const p of parts)col.append(blockElement(p.block,{...doc.layout,_notes:doc.notes||[]},p.block.type==='table'?p.block.text:p.text,p.continued||p.start>0,p));out.append(col);overflow.push(col.scrollWidth>col.clientWidth+1||col.scrollHeight>col.clientHeight+1);}
        return {r,overflow};
      }
      const text='天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。'.repeat(100),paragraph={id:'p',type:'paragraph',text};
      const v=run({layout:{...layout,writingMode:'vertical-rl'},blocks:[paragraph],notes:[]});
      const canvas=document.createElement('canvas');canvas.width=120;canvas.height=100;canvas.getContext('2d').fillRect(0,0,120,100);const src=canvas.toDataURL(),img=new Image();img.src=src;await img.decode();
      const floatDoc={layout,blocks:[{id:'i',type:'image',text:'插图',src,width:40,wrap:'left'},paragraph],notes:[]};
      const f=run(floatDoc),column=document.querySelector('#out>div'),figure=column.querySelector('figure').getBoundingClientRect(),span=column.querySelector('.paragraph span'),range=document.createRange();range.setStart(span.firstChild,0);range.setEnd(span.firstChild,1);const glyph=range.getBoundingClientRect();
      // A later glyph in the same fragment must resume the full column width below the float.
      const boxes=[];for(let i=0;i<span.firstChild.length;i++){range.setStart(span.firstChild,i);range.setEnd(span.firstChild,i+1);const box=range.getBoundingClientRect();if(box.top>figure.bottom)boxes.push(box.left);}
      const floatGeometry={beside:glyph.left>=figure.right&&glyph.top<figure.bottom,resumed:boxes.some(left=>left<figure.right),oneImage:f.r.pages.flat(2).filter(p=>p.block.id==='i').length===1};
      const rows=Array.from({length:25},(_,i)=>[`第${i}行`,'表格内容'.repeat(4)]),table={id:'t',type:'table',text:'合并表',rows,headerRows:1,merges:[{row:3,col:0,rowspan:3,colspan:1}],columnWidths:[40,60]};
      const t=run({layout,blocks:[table],notes:[]}),fragments=t.r.pages.flat(2).filter(p=>p.block.id==='t');
      const completeGroup=fragments.every(p=>{const n=[3,4,5].filter(i=>p.rowIndexes.includes(i)).length;return n===0||n===3;});
      const mix=run({layout:{...layout,writingMode:'vertical-rl',notesMode:'footnote'},blocks:[{...floatDoc.blocks[0]},paragraph],notes:[{id:'n',text:'注释'}]});
      return {vertical:{pages:v.r.pages.length,text:v.r.pages.flat(2).map(p=>p.text).join(''),overflow:v.overflow},float:{text:f.r.pages.flat(2).filter(p=>p.block.id==='p').map(p=>p.text).join(''),overflow:f.overflow,...floatGeometry},table:{pages:t.r.pages.length,completeGroup,overflow:t.overflow},warnings:mix.r.warnings,source:text};
    },layout);
    assert.ok(result.vertical.pages>1);assert.equal(result.vertical.text,result.source);assert.ok(result.vertical.overflow.every(x=>!x));
    assert.equal(result.float.text,result.source);assert.ok(result.float.beside);assert.ok(result.float.resumed);assert.ok(result.float.oneImage);assert.ok(result.float.overflow.every(x=>!x));
    assert.ok(result.table.pages>1);assert.ok(result.table.completeGroup);assert.ok(result.table.overflow.every(x=>!x));
    assert.ok(result.warnings.some(x=>x.includes('竖排暂不支持图片左右绕排')));assert.ok(result.warnings.some(x=>x.includes('文末注释')));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
