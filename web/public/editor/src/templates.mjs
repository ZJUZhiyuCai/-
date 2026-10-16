import {validateDocument} from './model.mjs';
export function makeTemplate(kind='book',title='未命名文稿'){
 const b=(id,type,text,extra={})=>({id,type,text,...extra});
 const doc={format:'open-typesetter',version:2,title,layout:{header:title,headerEven:'书页 · 出版工作台'},blocks:[]};
 if(kind==='blank')return validateDocument(doc);
 doc.blocks=[b('title','heading',title,{level:1,fontSize:24,align:'center'}),b('intro','paragraph','好的版式，让阅读自然发生。你可以在纸面直接编辑，也可以选中左侧组件，在属性面板中修改文字、字号与布局。'),b('chapter-1','heading','第一章　文字的秩序',{level:2}),b('body-1','paragraph','从开本和版心开始，确定每一页的呼吸。标题组织层次，正文承载叙述，注释为延伸阅读留下线索。书页让这些元素在同一份文稿中共同工作。'),b('body-2','paragraph','这是一份可以编辑的起始文稿。添加你自己的章节、图片与表格，再将工程保存到云端。每次保存都会记录修订号，便于你和 agent 安全协作。'),b('chapter-2','heading','第二章　建立自己的节奏',{level:2}),b('body-3','paragraph','在右侧设置开本、边距、分栏以及页眉页脚。按需插入分页符，让新的章节从新的一页开始。')];
 if(kind==='academic'){doc.layout={...doc.layout,width:210,height:297,columns:2,gap:8,fontSize:10.5,lineHeight:1.6};doc.blocks[2].text='1　研究背景';doc.blocks[5].text='2　研究方法';doc.blocks.push(b('data','table','表 1　示例数据',{rows:[['指标','结果'],['样本数','120'],['有效率','96%']],headerRows:1,borderStyle:'three-line'}),b('formula','equation','E = mc^2'));doc.notes=[{id:'n1',text:'这是示例脚注，可在注释管理中修改。'}];doc.blocks[3].text+='[^n1]';doc.bibliography=[{id:'r1',text:'示例作者. 文献标题. 2026.'}];doc.blocks[4].text+='[[cite:r1]]';}
 if(kind==='poetry'){doc.layout={...doc.layout,width:148,height:210,writingMode:'vertical-rl',fontSize:14,lineHeight:2,indent:0};doc.blocks=[b('title','heading',title,{level:1,fontSize:24}),b('poem','paragraph','山川有回声\n文字有来处\n在一页留白里\n与世界重逢',{indent:0})];}
 return validateDocument(doc);
}
