import {ProjectConnection} from './project-sync.mjs';
export function setupMcpProjects({getDoc,replaceDoc,status}){
  const button=document.createElement('button');button.textContent='MCP 工程';document.querySelector('.file-actions').append(button);
  const api=async(tool,args={})=>{const response=await fetch('/api/mcp-projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args})});const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'MCP 工程服务失败');return result;};
  const connection=new ProjectConnection({api,getDoc,replaceDoc});
  const updateLabel=()=>button.textContent=connection.projectId?`MCP · ${connection.projectId} r${connection.revision}`:'MCP 工程';
  const load=async projectId=>{await connection.open(projectId);updateLabel();};
  const dialog=document.createElement('dialog');dialog.className='workspace-dialog';document.body.append(dialog);
  const add=(title,fn)=>{const b=document.createElement('button');b.textContent=title;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status(e.message,true);}finally{b.disabled=false;}};dialog.append(b);};
  button.onclick=async()=>{try{const r=await api('list_projects');dialog.replaceChildren();const h=document.createElement('h2');h.textContent='MCP 共享工程';dialog.append(h);const p=document.createElement('p');p.textContent='agent 与编辑器共享磁盘工程。连接后每 3 秒读取 agent 更新；本地有改动时暂停同步，防止覆盖。点击提交保存界面改动。';dialog.append(p);
    const label=document.createElement('label');label.textContent='新工程 ID（英文、数字、短横线）';const input=document.createElement('input');label.append(input);dialog.append(label);
    add('将当前文稿创建为 MCP 工程',async()=>{const projectId=input.value;await api('create_project',{projectId,document:getDoc()});await load(projectId);dialog.close();});
    if(connection.projectId){add('提交本地修改',async()=>{await connection.save();updateLabel();dialog.close();status('MCP 工程已保存');});add('断开工程',()=>{connection.disconnect();updateLabel();dialog.close();});}
    for(const item of r.projects)add(`打开 ${item.projectId} · ${item.title} · r${item.revision}`,async()=>{await load(item.projectId);dialog.close();});
    add('关闭',()=>dialog.close());dialog.showModal();
  }catch(e){status('MCP 工程连接失败：'+e.message,true);}};
  setInterval(async()=>{if(dialog.open)return;if(connection.dirty){button.title='本地有未提交修改；已暂停接收 agent 更新。';return;}try{if(await connection.poll()){updateLabel();status('已接收 agent 的工程更新');}}catch(e){button.title=e.message;}},3000);
}
