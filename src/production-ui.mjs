export function setupProduction({getDoc,status}){
  const dialog=document.createElement('dialog');dialog.className='workspace-dialog';document.body.append(dialog);
  const open=document.createElement('button');open.textContent='出版输出';document.querySelector('.file-actions').append(open);
  open.onclick=()=>{
    dialog.replaceChildren();const h=document.createElement('h2');h.textContent='PDF 预检与拼版';dialog.append(h);
    const hint=document.createElement('p');hint.textContent='可处理当前文稿或选定 PDF。骑马订按左装订、正背面顺序输出，不缩放页面；打印时使用双面短边翻转并先做纸样。裁切标记只标示成品框，不会自动补画出血内容。';dialog.append(hint);
    const field=(text,el)=>{const label=document.createElement('label');label.append(document.createTextNode(text),el);dialog.append(label);return el;};
    const input=(text,type,value)=>{const el=document.createElement('input');el.type=type;el.value=value;return field(text,el);};
    const source=document.createElement('select');for(const [v,t]of [['doc','当前工程（XeLaTeX）'],['file','已有 PDF（保留其分页）']]){const o=document.createElement('option');o.value=v;o.textContent=t;source.append(o);}field('输入来源',source);
    const file=input('选择 PDF','file','');file.accept='.pdf';file.disabled=true;source.onchange=()=>file.disabled=source.value!=='file';
    const pages=input('页范围（留空为全部，如 1-4,7）','text','');
    const booklet=input('骑马订拼版','checkbox','');
    const width=input('拼版纸张宽 / mm（留空自动计算）','number','');width.min=100;width.max=2000;
    const height=input('拼版纸张高 / mm（留空自动计算）','number','');height.min=100;height.max=2000;
    const bleed=input('成品外预留 / mm','number','0');bleed.min=0;bleed.max=20;bleed.step=.5;
    const crop=input('添加裁切标记','checkbox','');
    const dpi=input('低分辨率警告阈值 / DPI','number','150');dpi.min=30;dpi.max=1200;
    const report=document.createElement('pre');report.textContent='生成后显示页面尺寸、字体嵌入、图像分辨率及拼版顺序。';dialog.append(report);
    const exportButton=document.createElement('button');exportButton.textContent='预检并生成 PDF';exportButton.className='primary';
    exportButton.onclick=async()=>{exportButton.disabled=true;try{
      const options={pages:pages.value,booklet:booklet.checked,bleedMm:Number(bleed.value),cropMarks:crop.checked,minDpi:Number(dpi.value)};
      if(width.value)options.sheetWidthMm=Number(width.value);if(height.value)options.sheetHeightMm=Number(height.value);
      const request={options};
      if(source.value==='doc')request.doc=getDoc();else{const f=file.files[0];if(!f)throw Error('请先选择 PDF。');if(f.size>14*1024*1024)throw Error('当前入口单个 PDF 限 14 MB。');request.pdf=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(Error('PDF 读取失败'));r.readAsDataURL(f);});}
      report.textContent='正在排版与预检…';status('正在生成出版输出…');
      const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}),result=await response.json();if(!response.ok)throw Error(result.error||'出版输出失败');
      report.textContent=JSON.stringify(result.report,null,2);
      const bytes=Uint8Array.from(atob(result.pdf),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=(getDoc().title||'文稿').replace(/[<>:"/\\|?*]/g,'_')+(options.booklet?'_骑马订':'_出版输出')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('出版 PDF 已生成，请阅读预检报告');
    }catch(e){report.textContent=e.message;status(e.message,true);}finally{exportButton.disabled=false;}};
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(exportButton,close);dialog.showModal();
  };
}
