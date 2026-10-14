// A real agent/client example: no browser, clicks, screenshots or network service.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const at=process.argv.indexOf('--workspace'),workspace=at<0?path.join(root,'.shuye-mcp'):path.resolve(process.argv[at+1]);
const client=new Client({name:'shuye-demo-agent',version:'1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'mcp/server.mjs'),'--workspace',workspace],stderr:'inherit'}));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return r.structuredContent;}
try{
  const projectId='ai-book-'+Date.now();let r=await call('create_project',{projectId,title:'AI 编排示例'});
  const operations=[
    {op:'set_layout',patch:{header:'AI 编排示例',headerEven:'结构化排版',footer:'第 {page} 页',footerEven:'书页 · {page}'}},
    {op:'insert_blocks',blocks:[{id:'title',type:'heading',level:1,text:'让 agent 直接编排图书',fontSize:24},{id:'ch1',type:'heading',level:2,text:'第一章：结构化编辑'},{id:'body',type:'paragraph',text:'这份工程由 MCP 客户端通过代码创建。中文注音、样式、注释和引用都保留在源模型中。',marks:[{start:0,end:4,bold:true}]},{id:'table1',type:'table',text:'表 1 组件验收',rows:[['组件','结果'],['表格','保留结构'],['公式','可导出']],columnWidths:[35,65]},{id:'math',type:'equation',text:'E=mc^2'},{id:'toc',type:'toc',text:'目录'}]},
    {op:'upsert_note',note:{id:'n1',text:'出版注释与审阅批注分开保存。'}},
    {op:'insert_reference',blockId:'body',offset:0,kind:'note',targetId:'n1'},
    {op:'upsert_bibliography',entry:{id:'source1',text:'书页项目. 原创 MCP 示例. 2026.'}},
    {op:'insert_reference',blockId:'body',offset:0,kind:'cite',targetId:'source1'},
    {op:'insert_reference',blockId:'body',offset:0,kind:'ref',targetId:'ch1'},
    {op:'upsert_comment',comment:{id:'review1',blockId:'body',text:'此批注只供编辑审阅，不进入成书。',resolved:false}},
  ];
  await call('apply_changes',{projectId,expectedRevision:r.revision,dryRun:true,operations});
  r=await call('apply_changes',{projectId,expectedRevision:r.revision,operations});
  const validation=await call('validate_project',{projectId});
  const output=await call('export_project',{projectId,expectedRevision:r.revision});
  const result={projectId,revision:r.revision,validation,output};
  if(process.argv.includes('--pdf'))result.pdf=await call('export_pdf',{projectId,expectedRevision:r.revision});
  console.log(JSON.stringify(result,null,2));
}finally{await client.close();}
