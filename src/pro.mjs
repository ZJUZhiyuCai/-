// SPDX-License-Identifier: MIT
// Independent, deliberately partial PRO text importer. The source text is always
// retained. Parsed parameters are observations; layoutPatch is only a projection
// of explicit physical geometry, not a promise of legacy typesetting equivalence.
const OPEN={'〖':'〗','〚':'〛','[':']'},MAX=1024*1024;
const normal=s=>s.replace(/[，！＆＝：；－]/g,c=>({'，':',','！':'!','＆':'&','＝':'=','：':':','；':';','－':'-'}[c]));
const positive='(?:[0-9]+(?:\\.[0-9]+)?)';
const dimensionRE=new RegExp(`^(${positive})(mm|p|x)?。(${positive})(mm|p|x)?$`);

export function decodePro(bytes,{encoding='gb18030'}={}) {
  if(!(bytes instanceof Uint8Array)&&!(bytes instanceof ArrayBuffer))throw new TypeError('PRO输入必须为字节数组。');
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(data.length>MAX)throw Error('PRO文件超过1MiB限制。');
  if(!['gb18030','gbk','utf-8','utf-16le'].includes(encoding))throw Error('不支持的PRO字符编码。');
  return {text:new TextDecoder(encoding,{fatal:true}).decode(data),encoding,byteLength:data.length};
}
function fields(body) {
  const out=[];let start=0,depth=0,angle=0;
  for(let i=0;i<body.length;i++){
    if(body[i]==='(')depth++;else if(body[i]===')')depth--;
    if(body[i]==='《'||body[i]==='<')angle++;else if(body[i]==='》'||body[i]==='>')angle--;
    if(depth<0||angle<0)throw Error('参数括号不配对。');
    if(body[i]===','&&!depth&&!angle){out.push(body.slice(start,i).trim());start=i+1;}
  }
  if(depth||angle)throw Error('参数括号不配对。');out.push(body.slice(start).trim());return out;
}
function dim(value,unit){const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('版心尺寸必须为正数。');return {value:n,unit:unit||'count'};}
function physical(value){return value.unit==='mm'?value.value:null;}
function parseBX(body,warnings) {
  const parts=fields(normal(body)),candidates=parts.map((p,i)=>({match:dimensionRE.exec(p),i})).filter(x=>x.match);
  if(candidates.length!==1)throw Error('BX需要且只能有一个可识别的“版心高。版心宽”字段。');
  const {match:m,i}=candidates[0];if(i<1||i>2||!parts.slice(0,i).every(Boolean))throw Error('BX字号字体前缀不在支持范围。');
  const height=dim(m[1],m[2]),width=dim(m[3],m[4]);
  const tail=parts[i+1];if(!tail)throw Error('BX缺少行距字段。');
  const tailRE=new RegExp(`^(.+?)([!BD]*)(?:C(${positive})mm。(${positive})mm)?$`),t=tailRE.exec(tail);
  const spacing=/^(?:[0-9]+(?:\.[0-9]+)?(?:mm|p|x)|(?:[0-9]+(?:\.[0-9]+)?:)?(?:[0-9]+(?:\.[0-9]+)?(?:\*[0-9]+(?:\/[1-9][0-9]*)?)?|\*[0-9]+(?:\/[1-9][0-9]*)?))$/;
  if(!t||!spacing.test(t[1]))throw Error('BX行距或方向标志超出支持的语法范围。');
  if(new Set(t[2]).size!==t[2].length)throw Error('BX方向标志重复。');
  const parsed={typographyRaw:parts.slice(0,i).join(','),bodyHeight:height,bodyWidth:width,lineSpacingRaw:t[1],writingMode:t[2].includes('!')?'vertical-rl':'horizontal-tb',noLineStretch:t[2].includes('B'),independentHeaderPageNumber:t[2].includes('D')};
  const patch={writingMode:parsed.writingMode};
  warnings.push('BX旧字号、字体、行距及拉行规则仅保留原参数，未换算为浏览器字体或行高。');
  if(t[3]) {
    if(parts.length!==i+6)throw Error('BX成品尺寸后需要边空、订切口、出血和页面标志四项。');
    const vertical=/^(A?)(S?)([0-9]+(?:\.[0-9]+)?)mm$/.exec(parts[i+2]);
    const horizontal=/^(Z?)([0-9]+(?:\.[0-9]+)?)mm$/.exec(parts[i+3]);
    const bleed=/^([0-9]+(?:\.[0-9]+)?)mm$/.exec(parts[i+4]);
    const flags=/^(Q?)(F?)$/.exec(parts[i+5]);
    if(!vertical||!horizontal||!bleed||!flags)throw Error('BX成品边空或页面标志超出支持的语法范围。');
    parsed.trim={height:Number(t[3]),width:Number(t[4]),unit:'mm'};
    parsed.margins={centered:!!vertical[1],verticalSide:vertical[2]?'top':'bottom',vertical:Number(vertical[3]),horizontalSide:horizontal[1]?'inner':'outer',horizontal:Number(horizontal[2]),bleed:Number(bleed[1]),distinguishFacingPages:!!flags[1],firstPageRight:!!flags[2]};
    if(parsed.trim.height<=0||parsed.trim.width<=0)throw Error('成品尺寸必须为正数。');
    const bh=physical(height),bw=physical(width);
    if(bh!==null&&bw!==null) {
      if(bh>parsed.trim.height||bw>parsed.trim.width)throw Error('版心尺寸大于成品尺寸。');
      patch.height=parsed.trim.height;patch.width=parsed.trim.width;
      if(parsed.margins.centered){patch.top=patch.bottom=(patch.height-bh)/2;patch.inner=patch.outer=(patch.width-bw)/2;}
      else{
        patch[parsed.margins.verticalSide]=parsed.margins.vertical;
        patch[parsed.margins.verticalSide==='top'?'bottom':'top']=patch.height-bh-parsed.margins.vertical;
        patch[parsed.margins.horizontalSide]=parsed.margins.horizontal;
        patch[parsed.margins.horizontalSide==='inner'?'outer':'inner']=patch.width-bw-parsed.margins.horizontal;
      }
      if(['top','bottom','inner','outer'].some(k=>patch[k]<0))throw Error('边空使版心超出成品尺寸。');
      if(!parsed.margins.distinguishFacingPages&&Math.abs(patch.inner-patch.outer)>.001){
        // The app mirrors inner/outer by page parity. This source explicitly does not.
        for(const k of ['width','height','top','bottom','inner','outer'])delete patch[k];
        warnings.push('BX未区分左右页且左右边空不等；当前工程会镜像内外边空，未自动应用该几何。');
      }
      if(!parsed.margins.firstPageRight&&Math.abs((patch.inner??0)-(patch.outer??0))>.001){
        for(const k of ['width','height','top','bottom','inner','outer'])delete patch[k];
        warnings.push('BX首张为左页且左右边空不等，未自动应用依赖页面奇偶的几何。');
      }
      if(!parsed.margins.firstPageRight)warnings.push('BX首张为左页；未修改工程页码奇偶，须人工核对装订方向。');
    }else warnings.push('版心使用字行数、磅或线单位，字体度量或旧单位换算未经验证，未应用成品几何。');
    warnings.push('出血和原版左右页起始约定已保留，未自动映射印刷输出设置。');
  }else{
    if(parts.length!==i+2)throw Error('BX包含未识别的尾随字段。');
    warnings.push('BX未提供完整成品尺寸和边空；仅记录版心尺寸，不推断纸张或页边距。');
  }
  return {parsed,patch};
}

export function parsePro(source) {
  if(typeof source!=='string')throw new TypeError('parsePro需要已解码文本。');
  if(source.length>MAX)throw Error('PRO文本超过1MiB限制。');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source))throw Error('PRO包含二进制控制字节，拒绝当作文本参数解析。');
  const records=[],warnings=[],files=[];let at=0,ended=false;
  while(at<source.length){
    const start=at,char=source[at];
    if(char==='\uE005'){records.push({kind:'end',raw:char,start,end:++at});ended=true;continue;}
    const close=OPEN[char];
    if(!close||ended){
      while(at<source.length&&(ended||!OPEN[source[at]])&&source[at]!=='\uE005')at++;
      if(at===start)at++;
      const raw=source.slice(start,at),trivia=/^[\s\uFEFF]*$/.test(raw);
      records.push({kind:trivia?'trivia':ended?'after-end':'unknown',raw,start,end:at});
      if(!trivia)warnings.push(ended?'结束标记后仍有内容，已原样保留且不应用。':'注解外含未识别内容，已原样保留。');continue;
    }
    const end=source.indexOf(close,at+1);
    if(end<0)throw Error(`PRO在偏移${at}有未闭合注解。`);
    const raw=source.slice(at,end+1),body=source.slice(at+1,end),code=/^[A-Z]{2}/.exec(body)?.[0]||null;
    const record={kind:'annotation',code,raw,body:code?body.slice(2):body,start,end:end+1,status:'preserved'};records.push(record);at=end+1;
    if(code==='BX') {
      try{const result=parseBX(record.body,warnings);record.parsed=result.parsed;record.layoutPatch=result.patch;record.status='partial';}
      catch(e){record.error=e.message;warnings.push(`BX未应用：${e.message} 原文已保留。`);}
    }else if(code==='SB'){
      try{const names=record.body.replace(/，/g,',').split(',').map(n=>n.trim());if(!names.length||names.length>40||names.some(n=>!n||/\\(?!\\)/.test(n.replace(/\\\\/g,''))))throw Error('SB文件列表或路径转义不在支持范围。');record.parsed={files:names.map(raw=>({raw,path:raw.replace(/\\\\/g,'\\')}))};record.status='parsed';files.push(...record.parsed.files);warnings.push('SB只导入文件清单，不自动读取本地或网络路径。');}
      catch(e){record.error=e.message;warnings.push(`SB未应用：${e.message} 原文已保留。`);}
    }else warnings.push(`${code||'未知'}注解暂未解释，原文已保留。`);
  }
  const bx=records.filter(r=>r.kind==='annotation'&&r.code==='BX');
  const layoutPatch=bx.length===1?{...(bx[0].layoutPatch||{})}:{};
  if(bx.length>1)warnings.push('PRO包含多个BX；优先级未经验证，未自动应用任何BX参数。');
  if(!bx.length)warnings.push('PRO未找到BX版心参数。');
  if(!ended)warnings.push('PRO没有观察到结束标记；未擅自补写。');
  return {schema:'founder-pro-text/1',source,records,layoutPatch,files,warnings:[...new Set(warnings)]};
}
