import {decodePro,parsePro} from './pro.mjs';
import {validateDocument} from './model.mjs';

export function setupProImport({getDoc,replaceDoc,status}) {
  const dialog=document.createElement('dialog');dialog.className='workspace-dialog';document.body.append(dialog);
  const open=document.createElement('button');open.textContent='PRO 参数';document.querySelector('.file-actions').append(open);
  open.onclick=()=>{
    dialog.replaceChildren();const heading=document.createElement('h2');heading.textContent='导入 PRO 工程参数';dialog.append(heading);
    const hint=document.createElement('p');hint.textContent='读取版心参数并预览可应用的尺寸和方向。应用时完整原文随工程保存；还可下载解析报告。旧字号、行距及未知注解不作推测转换；文件清单不会自动打开。';dialog.append(hint);
    const input=document.createElement('input');input.type='file';input.accept='.pro';input.setAttribute('aria-label','PRO 文件');dialog.append(input);
    const report=document.createElement('pre');dialog.append(report);let parsed=null,next=null,name='PRO';
    const apply=document.createElement('button');apply.textContent='应用可识别参数';apply.disabled=true;
    const download=document.createElement('button');download.textContent='下载原文与解析报告';download.disabled=true;
    input.onchange=async()=>{parsed=null;next=null;apply.disabled=true;download.disabled=true;try{
      const f=input.files[0];if(!f)return;if(f.size>1024*1024)throw Error('PRO 文件超过 1 MiB。');name=f.name;
      parsed=parsePro(decodePro(await f.arrayBuffer()).text);download.disabled=false;
      let error='';try{if(!Object.keys(parsed.layoutPatch).length)throw Error('没有可应用的参数。');next=validateDocument({...getDoc(),layout:{...getDoc().layout,...parsed.layoutPatch},proSources:[...(getDoc().proSources||[]),{name,source:parsed.source}]});apply.disabled=false;}catch(e){error='无法应用：'+e.message;}
      report.textContent=JSON.stringify({file:name,layoutPatch:parsed.layoutPatch,files:parsed.files,warnings:parsed.warnings,error},null,2);
    }catch(e){report.textContent=e.message;status(e.message,true);}};
    apply.onclick=async()=>{if(!next)return;await replaceDoc(next);status('已应用 PRO 可识别参数；其余参数请查看解析报告。');dialog.close();};
    download.onclick=()=>{if(!parsed)return;const url=URL.createObjectURL(new Blob([JSON.stringify(parsed,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name+'.report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(apply,download,close);dialog.showModal();
  };
}
