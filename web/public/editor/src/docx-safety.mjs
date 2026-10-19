// Gate loss-prone OOXML before replacing the editor document. A warning after
// deleting a formula is not a successful import. Keep this independent of DOM
// querySelector so the same checks run with the browser and test XML parsers.
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
export function inspectDocxPart(root,part='word/document.xml') {
  const issues=[];
  const check=(ns,name,label)=>{
    const count=root.getElementsByTagNameNS(ns,name).length;
    if(count)issues.push({part,feature:name,count,label});
  };
  check(M,'oMath','Word 公式（含行内公式）');
  for(const [name,label] of [
    ['object','OLE / MathType 对象'],['pict','旧式图片或绘图'],
    ['altChunk','外部内容块'],['txbxContent','文本框'],
    ['sdt','结构化内容控件'],['customXml','自定义内容容器'],
    ['ins','未接受的插入修订'],['del','未接受的删除修订'],
    ['moveFrom','未接受的移动修订'],['moveTo','未接受的移动修订'],
    ['numPr','自动编号'],['fldChar','Word 域'],['fldSimple','Word 域'],
    ['sym','字体编码符号'],['vMerge','纵向合并单元格'],
    ['ruby','Word 注音'],['subDoc','子文档'],
  ])check(W,name,label);
  check(WP,'anchor','浮动图文锚点');
  check('http://schemas.openxmlformats.org/markup-compatibility/2006','AlternateContent','兼容性替代内容（不可安全选择或合并）');
  for(const drawing of Array.from(root.getElementsByTagNameNS(W,'drawing'))){
    const graphics=Array.from(drawing.getElementsByTagNameNS(A,'graphicData'));
    if(!drawing.getElementsByTagNameNS(A,'blip').length||graphics.some(g=>g.getAttribute('uri')!=='http://schemas.openxmlformats.org/drawingml/2006/picture'))issues.push({part,feature:'unsupportedDrawing',count:1,label:'非图片绘图（图表、SmartArt 或形状）'});
  }
  for(const table of Array.from(root.getElementsByTagNameNS(W,'tbl'))){
    if(table.getElementsByTagNameNS(W,'tbl').length)issues.push({part,feature:'nestedTable',count:1,label:'嵌套表格'});
    if(table.getElementsByTagNameNS(W,'drawing').length)issues.push({part,feature:'tableDrawing',count:1,label:'表内图片'});
    // The current table model stores plain cell text only.
    for(const tag of ['b','i','u','vertAlign','color','sz'])if(table.getElementsByTagNameNS(W,tag).length){issues.push({part,feature:'cellFormatting',count:1,label:'表内字符格式（含上下标）'});break;}
  }
  if(part!=='word/document.xml'){
    for(const tag of ['drawing','tbl','footnoteReference','endnoteReference'])check(W,tag,'注释中的图表或嵌套引用');
    // Notes currently store plain text; dropping an exponent changes its meaning.
    check(W,'vertAlign','注释中的上下标');
  }
  return issues;
}
export function assertDocxImportSafe(parts) {
  const issues=parts.flatMap(({root,part})=>inspectDocxPart(root,part));
  if(!issues.length)return;
  const error=new Error('DOCX_IMPORT_UNSUPPORTED：为避免丢失内容，未导入此文件，当前文稿保持不变。请保留原稿。\n'+issues.slice(0,20).map(i=>`${i.label} × ${i.count}（${i.part}）`).join('\n'));
  error.code='DOCX_IMPORT_UNSUPPORTED';error.issues=issues;throw error;
}
