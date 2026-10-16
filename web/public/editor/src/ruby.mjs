// SPDX-License-Identifier: MIT
// Manual Unicode ruby annotations, not a PY/ZY parser or phonetic predictor.
let segmenter;
function boundaries(text) {
  if (!globalThis.Intl?.Segmenter) throw Error('当前环境不支持 Unicode 字素分段，请升级浏览器后使用注音。');
  segmenter ||= new Intl.Segmenter('zh',{granularity:'grapheme'});
  const result=new Set([text.length]);
  for(const part of segmenter.segment(text))result.add(part.index);
  return result;
}

/** UTF-16 half-open, non-overlapping, complete grapheme ranges. */
export function validateRuby(ranges, text) {
  if(typeof text!=='string')throw new TypeError('注音基文必须是字符串。');
  if(ranges===undefined)return [];
  if(!Array.isArray(ranges)||ranges.length>10000)throw Error('注音范围必须为数组，且最多 10,000 处。');
  if(!ranges.length)return [];
  const edges=boundaries(text),refs=[...text.matchAll(/\[\^[^\]\r\n]*\]/g)].map(m=>[m.index,m.index+m[0].length]);
  const clean=ranges.map(range=>{
    if(!range||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end>text.length||range.end<=range.start)throw Error('注音范围必须是正文内非空的 UTF-16 区间。');
    if(!edges.has(range.start)||!edges.has(range.end))throw Error('注音边界不能切开 emoji、组合字符或其他完整字素。');
    if(typeof range.text!=='string'||!range.text.trim()||range.text.length>1000||/[\u0000-\u001f\u007f]/.test(range.text))throw Error('注音需要 1–1,000 个字符的单行文字，不能包含控制字符。');
    const base=text.slice(range.start,range.end);
    if(!base.trim()||/[\r\n]/.test(base))throw Error('注音基文必须包含文字，且不能跨越硬换行。');
    if(refs.some(([start,end])=>range.start<end&&range.end>start))throw Error('注音不能覆盖脚注引用标记。');
    return {start:range.start,end:range.end,text:range.text};
  }).sort((a,b)=>a.start-b.start||a.end-b.end);
  for(let i=1;i<clean.length;i++)if(clean[i].start<clean[i-1].end)throw Error('注音范围不能重叠。');
  return clean;
}

/** Preserve unaffected ranges; discard annotations whose base text was edited. */
export function adjustRubyOnEdit(ranges, oldText, newText) {
  const clean=validateRuby(ranges,oldText);
  if(typeof newText!=='string')throw new TypeError('编辑后的文字必须是字符串。');
  if(!clean.length||oldText===newText)return clean;
  let start=0,oldEnd=oldText.length,newEnd=newText.length;
  while(start<oldEnd&&start<newEnd&&oldText[start]===newText[start])start++;
  while(oldEnd>start&&newEnd>start&&oldText[oldEnd-1]===newText[newEnd-1]){oldEnd--;newEnd--;}
  const oldEdges=boundaries(oldText),newEdges=boundaries(newText);
  while(start>0&&(!oldEdges.has(start)||!newEdges.has(start)))start--;
  while((!oldEdges.has(oldEnd)||!newEdges.has(newEnd))&&oldEnd<oldText.length&&newEnd<newText.length){oldEnd++;newEnd++;}
  const delta=newText.length-oldText.length;
  const shifted=clean.flatMap(range=>range.end<=start?[{...range}]:range.start>=oldEnd?[{...range,start:range.start+delta,end:range.end+delta}]:[]);
  // Inserting a combining mark at an otherwise untouched boundary may merge a
  // grapheme. Discard that annotation as well instead of binding a partial glyph.
  return validateRuby(shifted.filter(r=>newEdges.has(r.start)&&newEdges.has(r.end)),newText);
}

export function buildRuby(baseText, annotation, {renderBase}={}) {
  if(typeof baseText!=='string'||typeof annotation!=='string')throw new TypeError('注音及基文必须为字符串。');
  const ruby=document.createElement('ruby');ruby.className='manual-ruby';
  const rb=document.createElement('rb'),rt=document.createElement('rt');
  if(renderBase)renderBase(rb,baseText);else rb.textContent=baseText;
  rt.textContent=annotation;rt.contentEditable='false';rt.setAttribute?.('aria-label',`注音：${annotation}`);ruby.append(rb,rt);return ruby;
}

export function setupRubyEditor({getDoc,getSelected,getSelectionRange,change,status}) {
  const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const button=(text,fn)=>{const el=make('button',text);el.type='button';el.onclick=fn;return el;};
  const dialog=make('dialog');dialog.className='ruby-editor-dialog';dialog.setAttribute('aria-label','手工拼音与注音');document.body.append(dialog);
  let blockId,sourceText,selection;
  const active=()=>getDoc().blocks.find(b=>b.id===blockId);
  const report=error=>{const message=error.message||String(error);status(message,true);const el=dialog.querySelector('.ruby-error');if(el)el.textContent=message;};
  const commit=ranges=>{
    const block=active();if(!block||block.text!==sourceText)throw Error('基文已变化，请关闭对话框并重新选择文字。');
    const clean=validateRuby(ranges,block.text);
    change(()=>{const target=active();target.ruby=clean;});render();status('手工注音已更新，可撤销。');
  };
  function render(){
    const block=active();if(!block)return;
    dialog.replaceChildren();const top=make('div');top.className='ruby-editor-top';top.append(make('h2','手工拼音与注音'),button('完成',()=>dialog.close()));dialog.append(top);
    dialog.append(make('p','手工填写拼音、注音符号或读音说明，不自动推断多音字。注音跟随完整基文，支持横排与竖排；不等同于原版 PY/ZY 注解兼容。'));
    const error=make('p');error.className='ruby-error';error.setAttribute('role','alert');dialog.append(error);
    const current=validateRuby(block.ruby,block.text);
    if(selection&&selection.end>selection.start){
      const base=block.text.slice(selection.start,selection.end),label=make('label',`选中文字：${base}`),input=make('input');input.type='text';input.maxLength=1000;input.placeholder='例如：chóng qìng / ㄓㄨㄥˋ';input.setAttribute('aria-label','选中文字的注音');
      input.value=current.find(r=>r.start===selection.start&&r.end===selection.end)?.text||'';label.append(input);dialog.append(label);
      dialog.append(button('添加／更新选区注音',()=>{try{const ranges=active().ruby||[];commit([...ranges.filter(r=>r.start!==selection.start||r.end!==selection.end),{start:selection.start,end:selection.end,text:input.value}]);}catch(e){report(e);}}));
    }else dialog.append(make('p','本次没有非空文字选区。可修改下列已有注音；添加时请先在纸面或段落框选择文字，再打开本窗口。'));
    const list=make('div');list.className='ruby-editor-list';
    if(!current.length)list.append(make('p','本段尚无注音。'));
    for(const range of current){
      const row=make('div');row.className='ruby-editor-item';const label=make('label',block.text.slice(range.start,range.end)),input=make('input');input.value=range.text;input.maxLength=1000;input.setAttribute('aria-label',`修改“${block.text.slice(range.start,range.end)}”的注音`);label.append(input);row.append(label);
      row.append(button('保存',()=>{try{commit((active().ruby||[]).map(r=>r.start===range.start&&r.end===range.end?{...r,text:input.value}:r));}catch(e){report(e);}}),button('删除',()=>{try{commit((active().ruby||[]).filter(r=>r.start!==range.start||r.end!==range.end));}catch(e){report(e);}}));list.append(row);
    }dialog.append(list);
    dialog.append(make('p','编辑触及已注音的基文时，该处注音将移除，避免错误字音绑定；请重新核对并添加。'));
  }
  function open(){
    selection=getSelectionRange?.();blockId=getSelected?.()||selection?.id;const block=active();
    if(!block||!['paragraph','heading'].includes(block.type)){status('请先选择正文或标题中的文字。',true);return;}
    if(selection?.id!==block.id)selection=null;sourceText=block.text;
    try{render();if(!dialog.open)dialog.showModal();}catch(e){report(e);}
  }
  const launch=button('注音',open);launch.onmousedown=e=>e.preventDefault();document.querySelector('.toolbar')?.append(launch);
  return {open,destroy(){launch.remove();dialog.remove();}};
}
