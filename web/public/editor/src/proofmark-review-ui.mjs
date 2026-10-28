import {LIMITS,createReviewSession,verifyAsset,editItem,decideItem,exportReview} from './proofmark-review.mjs';

export function setupProofmarkReview({getDoc}){
 let session=null,selected=0,reviewer='',dirty=false,busy=false,changeVersion=0;
 const images=new Map();
 const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
 const releaseImages=()=>{for(const image of images.values())URL.revokeObjectURL(image.url);images.clear();};
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 const open=()=>{
  const dialog=el('dialog',undefined,'proofmark-dialog');dialog.setAttribute('aria-labelledby','proofmark-title');
  const head=el('header',undefined,'proofmark-heading'),title=el('h2','笔迹复核');title.id='proofmark-title';
  head.append(title,button('关闭',()=>dialog.close()));dialog.append(head);
  dialog.append(el('p','导入识别结果，对照原图核对文字。当前接入只保存复核草稿，正文保持不变。','proofmark-intro'));
  const bar=el('div',undefined,'proofmark-controls'),packetLabel=el('label','识别结果 JSON'),packetInput=el('input');packetInput.type='file';packetInput.accept='.json,application/json';packetInput.setAttribute('aria-label','导入笔迹识别结果');packetLabel.append(packetInput);
  const reviewerLabel=el('label','复核人'),name=el('input');name.type='text';name.maxLength=120;name.value=reviewer;name.autocomplete='off';name.setAttribute('aria-label','复核人');name.oninput=()=>{reviewer=name.value;};reviewerLabel.append(name);
  const download=button('导出复核草稿',async()=>run(async()=>{
   if(!session)return;const current=session,version=changeVersion,result=await exportReview(current,getDoc());
   const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=el('a');
   a.href=url;a.download='笔迹复核草稿.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(session===current&&changeVersion===version)dirty=false;
   message.textContent=dirty?'草稿已导出；导出期间的新修改尚未保存，请再次导出。':'复核草稿已导出。源稿仍未绑定，未执行任何正文修改。';
  }));bar.append(packetLabel,reviewerLabel,download);dialog.append(bar);
  const message=el('p','支持 proofmark-review/0.2。原图仅在本机读取；关闭面板后记录仍保留；刷新前请导出留存，当前版本不支持导入复核草稿续审。','proofmark-message');message.setAttribute('role','status');dialog.append(message);
  const body=el('div',undefined,'proofmark-body');dialog.append(body);
  async function run(fn){if(busy)return;busy=true;packetInput.disabled=true;download.disabled=true;try{await fn();}catch(e){message.textContent=e.message;}finally{busy=false;packetInput.disabled=false;download.disabled=!session;}}
  packetInput.onchange=()=>run(async()=>{
   const file=packetInput.files?.[0];if(!file)return;if(file.size>LIMITS.packetBytes)throw Error('识别结果不得超过 2 MiB');
   const next=await createReviewSession(await file.text(),getDoc());
   if(dirty&&!window.confirm('当前复核修改尚未导出。替换后将丢失这些修改，确定导入新的识别结果吗？')){packetInput.value='';return;}
   releaseImages();session=next;selected=0;dirty=true;changeVersion++;draw();
   message.textContent=`已导入 ${session.items.length} 条待核批注。导入文件中的已审状态和源稿绑定声明均需重新核实。`;
  });
  function draw(){
   body.replaceChildren();download.disabled=!session;
   if(!session){const empty=el('section',undefined,'proofmark-empty');empty.append(el('h3','从一份识别结果开始'),el('p','选择本机模型导出的待审 JSON，再选择对应照片。逐条核对转写并导出人工复核草稿。'),el('p','网上收集、没有原始 Word / PDF 的例子也可复核笔迹；它们会始终保留“源稿未绑定”。'));body.append(empty);return;}
   const navigation=el('aside',undefined,'proofmark-list'),heading=el('h3',`批注 ${session.items.filter(i=>i.decision!=='pending').length} / ${session.items.length}`);navigation.append(heading);
   session.items.forEach((item,index)=>{
    const b=button(`${item.id} · ${{pending:'待核',checked:'已核对',excluded:'已排除'}[item.decision]}\n${item.text||'未识别出文字'}`,()=>{selected=index;draw();});
    b.className=index===selected?'selected':'';b.setAttribute('aria-current',String(index===selected));navigation.append(b);
   });body.append(navigation);
   const item=session.items[selected],asset=session.assets.find(a=>a.id===item.assetId),panel=el('section',undefined,'proofmark-detail');
   const badges=el('div',undefined,'proofmark-badges');badges.append(el('span','源稿未绑定'),el('span','模型结果待人工判断'));panel.append(badges);
   const evidencePanel=el('div',undefined,'proofmark-evidence');evidencePanel.append(el('h3',`原图 · ${asset.name}`));
   const imageLabel=el('label','选择该条对应的原图'),imageInput=el('input');imageInput.type='file';imageInput.accept='image/png,image/jpeg';imageInput.setAttribute('aria-label','选择批注原图');imageLabel.append(imageInput);evidencePanel.append(imageLabel);
   const photo=el('div',undefined,'proofmark-photo'),existing=images.get(asset.id);
   if(existing){
    const frame=el('div',undefined,'proofmark-image-frame'),img=el('img');img.src=existing.url;img.alt='批注原图，橙色框为笔迹，蓝色虚线框为模型指向区域';frame.append(img);
    const overlay=(bounds,kind)=>{if(!bounds)return;const e=el('span',undefined,`proofmark-box ${kind}`);Object.assign(e.style,{left:`${bounds[0]*100}%`,top:`${bounds[1]*100}%`,width:`${(bounds[2]-bounds[0])*100}%`,height:`${(bounds[3]-bounds[1])*100}%`});frame.append(e);};
    overlay(item.targetBox,'target');overlay(item.annotationBox,'annotation');photo.append(frame,el('p','原图身份与尺寸已校验 · 橙框：笔迹 · 蓝框：模型指向区域（尚未绑定正文）'));
    const fullImage=el('a','在新标签页放大原图');fullImage.href=existing.url;fullImage.target='_blank';fullImage.rel='noopener';photo.append(fullImage);
   }else photo.append(el('p','请选择识别时的原文件。文件名相同也可能是不同图片；校验通过后才能标记已核对。'));
   evidencePanel.append(photo);panel.append(evidencePanel);
   imageInput.onchange=()=>run(async()=>{
    const file=imageInput.files?.[0];if(!file)return;if(file.size>LIMITS.imageBytes)throw Error('原图不得超过 12 MiB');
    const current=session,bytes=new Uint8Array(await file.arrayBuffer()),info=await verifyAsset(asset,bytes),url=URL.createObjectURL(new Blob([bytes],{type:info.mime}));
    try{
     const img=new Image();img.src=url;await img.decode();if(img.naturalWidth!==asset.width||img.naturalHeight!==asset.height)throw Error('解码尺寸不一致，请由识别端校正照片方向');
     if(session!==current){URL.revokeObjectURL(url);return;}
     const old=images.get(asset.id);if(old)URL.revokeObjectURL(old.url);images.set(asset.id,{url});session.verifiedAssets.set(asset.id,{sha256:asset.sha256});dirty=true;changeVersion++;draw();message.textContent='原图校验通过，请逐条核对文字与笔迹位置。';
    }catch(error){URL.revokeObjectURL(url);throw error;}
   });
   const fields=el('div',undefined,'proofmark-text-fields');fields.append(el('h3','转写与判断'),el('p','模型原始转写：'+(item.originalText||'未读出')));
   const label=el('label','复核转写'),area=el('textarea');area.value=item.text;area.rows=3;area.maxLength=8000;area.setAttribute('aria-label','复核转写');label.append(area);
   const noteLabel=el('label','复核备注'),note=el('textarea');note.value=item.note;note.rows=2;note.maxLength=2000;note.setAttribute('aria-label','复核备注');noteLabel.append(note);
   const reviewState=el('p',undefined,'proofmark-review-state');
   const showState=()=>{reviewState.textContent=`本条：${{pending:'待核',checked:'转写已人工核对',excluded:'已排除'}[item.decision]}${item.reviewer?' · '+item.reviewer:''}`;};showState();
   const update=()=>{editItem(session,item.id,{text:area.value,note:note.value});dirty=true;changeVersion++;showState();message.textContent='转写或备注已改变，请重新核对。';heading.textContent=`批注 ${session.items.filter(i=>i.decision!=='pending').length} / ${session.items.length}`;const b=navigation.querySelectorAll('button')[selected];b.textContent=`${item.id} · 待核\n${item.text||'未识别出文字'}`;};area.oninput=update;note.oninput=update;
   fields.append(label,noteLabel,reviewState);
   const decisions=el('div',undefined,'proofmark-decisions');
   for(const [decision,text] of [['checked','转写已核对'],['excluded','排除此条'],['pending','设为待核']]){
    const b=button(text,()=>{try{decideItem(session,item.id,decision,reviewer);dirty=true;changeVersion++;draw();message.textContent='已记录人工决定。核对转写不代表批准修改正文。';}catch(e){message.textContent=e.message;}});b.disabled=decision!=='pending'&&!session.verifiedAssets.has(asset.id);decisions.append(b);
   }fields.append(decisions);
   const details=el('details'),summary=el('summary','查看模型观察与建议');details.append(summary,el('p',item.observation),el('p',item.summary),el('pre',item.proposedAction));fields.append(details);panel.append(fields);body.append(panel);
  }
  draw();dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 };
 const entry=button('笔迹复核',open);entry.id='proofmarkReview';document.querySelector('.toolbar>div').append(entry);
}
