// An explicitly synthetic starting manuscript, with real semantic roles and anchors.
export function journalTemplate(title){
 const p=(id,text,role)=>({id,type:'paragraph',text,...(role?{role}:{})});
 const h=(id,text)=>({id,type:'heading',level:2,text});
 return {
  format:'open-typesetter',version:2,title,
  layout:{width:170,height:240,top:16,bottom:16,inner:13,outer:13,columns:2,gap:6,fontSize:9,lineHeight:1.55,fontSet:'fandol'},
  journal:{template:'cn-academic',name:'书页学术示例',nameEn:'Shuye Academic Sample',year:String(new Date().getFullYear()),volume:'1',issue:'1',shortTitle:title,normalizeTypography:true},
  blocks:[
   p('title-zh',title,'title-zh'),p('authors-zh','示例作者','authors-zh'),p('affiliation-zh','示例单位，示例城市','affiliation-zh'),
   p('abstract-zh','摘要：以学术期刊编辑流程为场景，说明结构化文稿、版式约束与人工校样之间的协作方式。本文为软件演示稿，作者、单位、数据及文献均为占位内容，不构成研究结论。','abstract-zh'),
   p('keywords-zh','关键词：学术出版；辅助排版；人工校对','keywords-zh'),
   p('title-en','A structured workflow for academic typesetting','title-en'),p('authors-en','Sample Author','authors-en'),p('affiliation-en','Sample Institution, Sample City','affiliation-en'),
   p('abstract-en','Abstract: This synthetic manuscript demonstrates a structured editorial workflow. All names, data and references are placeholders, not research findings.','abstract-en'),
   p('keywords-en','Key words: academic publishing; assisted typesetting; editorial review','keywords-en'),
   h('introduction','1　研究背景'),
   p('background','学术期刊的版面需要同时容纳正文、公式、图表与参考文献。编辑工作不仅是调整视觉样式，也包括保持内容身份、建立图文关系，以及核对最终输出中的每一个对象。'),
   p('problem','在常见流程中，稿件会经历导入、结构整理、版式调整、校样和返修。任何阶段的修改都应当能追溯到具体版本，避免旧校样与新正文混用。'),
   h('method','2　协作方法'),
   p('method-body','将版式意图转换为可核对的参数差异，先执行预检，再由编辑决定是否应用。正文和公式保留在结构化文稿中；对布局的修改与对学术内容的修改分别处理。'),
   p('formula-intro','以误差平方和为例，独立公式应保留数学结构和编号：'),
   {id:'equation-1',type:'equation',text:'E = \\sum_{i=1}^{n}(y_i-\\hat{y}_i)^2',equationNumber:'1'},
   p('table-anchor','表 1 展示不同检查环节的对象与作用。表中内容仅用于说明产品流程。'),
   {id:'workflow-table',type:'table',rows:[['环节','检查对象','处理方式'],['结构预检','组件与引用','拒绝无效修改'],['版式建议','开本与间距','人工确认差异'],['PDF 校样','字体与对象','逐页人工验收']],headerRows:1,fontSize:8,columnWidths:[28,30,42],borderStyle:'three-line',anchor:{targetId:'table-anchor',position:'after',maxPageDistance:1},captionIds:['table-caption']},
   p('table-caption','表 1　排版流程检查环节（示例）'),
   h('discussion','3　讨论与边界'),
   p('discussion-body','自动检查可以暴露结构问题，但不能代替对数学语义、图表准确性和阅读节奏的专业判断。模型生成的建议应当保留依据、源版本与撤销入口；存在未解决问题时，应明确显示需要复核的位置。'),
   p('review-body','校样中的页数、字体与对象覆盖情况来自实际输出。浏览器排版用于交互预览，正式分页以下载的 PDF 为准。每次返修后应重新生成校样，并核对图表、题注及参考文献的对应关系。'),
   h('conclusion','4　结语'),p('conclusion-body','可信的辅助排版，应让编辑更快地发现问题、更容易地比较修改，并始终保有最终判断权。请用自己的原稿替换本示例中的占位内容。'),
   h('references','参考文献'),p('reference-1','[1] 示例作者. 结构化排版流程说明（演示占位文献）. 示例刊名, 2026, 1(1): 1-2.','reference')
  ]
 };
}
