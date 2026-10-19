// This profile is specific to the public synthetic fixture; never infer author roles silently.
export function journalProfile(document){
 const doc=structuredClone(document),roles=['title-zh','authors-zh','affiliation-zh','abstract-zh','keywords-zh','title-en','authors-en','affiliation-en','abstract-en','keywords-en'];
 for(let i=0;i<roles.length;i++)doc.blocks[i].role=roles[i];
 doc.journal={template:'cn-academic',name:'排版验收学报',nameEn:'Journal of Typesetting Tests',volume:'1',issue:'1',year:'2026',date:'2026-10',shortTitle:'公式与图表验收'};
 doc.layout={...doc.layout,fontSet:'fandol',width:170,height:240,inner:13,outer:13,top:16,bottom:16,columns:2,gap:6,fontSize:8.2,lineHeight:1.55};
 for(const b of doc.blocks)if(['image','table'].includes(b.type)){
  const i=doc.blocks.indexOf(b);b.anchor={targetId:doc.blocks[i-1].id,position:'after',maxPageDistance:1};b.captionIds=[doc.blocks[i+1].id];
  if(b.type==='image')b.width=80;else{b.borderStyle='three-line';b.headerRows=1;}
 }
 doc.blocks.at(-1).role='reference';return doc;
}
