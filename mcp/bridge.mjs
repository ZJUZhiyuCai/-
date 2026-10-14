// HTTP UI adapter. Operations are fixed, not arbitrary JS or shell commands.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProjectStore} from './store.mjs';
import {createTools} from './service.mjs';
let source='';for await(const chunk of process.stdin){source+=chunk;if(source.length>100*1024*1024)throw Error('REQUEST_TOO_LARGE');}
try{
  const request=JSON.parse(source),workspace=process.env.SHUYE_WORKSPACE||path.join(path.dirname(fileURLToPath(import.meta.url)),'../.shuye-mcp');
  const tools=createTools(new ProjectStore(workspace));
  if(!['list_projects','get_project','create_project','replace_project'].includes(request.tool))throw Error('UNSUPPORTED_UI_TOOL');
  const tool=tools.find(t=>t.name===request.tool),result=await tool.run(tool.schema.parse(request.arguments));
  process.stdout.write(JSON.stringify(result));
}catch(e){process.stdout.write(JSON.stringify({error:e.message}));process.exitCode=1;}
