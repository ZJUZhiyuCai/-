// stdio adapter for the current website tool catalog. No browser automation.
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function remoteServer({url,token,fetchImpl=fetch,timeoutMs=360000}){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(endpoint.hostname)))throw Error('MCP requires HTTPS (except loopback testing)');
 if(endpoint.username||endpoint.password||endpoint.hash||!token?.trim())throw Error('Invalid MCP endpoint or missing bearer token');
 let id=0;
 const readOnlyTools=new Set();
 async function rpc(method,params){
  let response;
  const attempts=method==='tools/list'||(method==='tools/call'&&readOnlyTools.has(params.name))?2:1;
  for(let attempt=0;attempt<attempts;attempt++){
   try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});break;}
   catch(error){if(attempt===attempts-1)throw error;}
  }
  if(!response.ok)throw Error('SHUYE_MCP_HTTP_'+response.status);
  const data=await response.json();
  if(data.error)throw Error(data.error.message||'SHUYE_MCP_ERROR');
  if(!data.result)throw Error('SHUYE_MCP_INVALID_RESPONSE');
  if(method==='tools/list'){readOnlyTools.clear();for(const tool of data.result.tools||[])if(tool.annotations?.readOnlyHint)readOnlyTools.add(tool.name);}
  return data.result;
 }
 const server=new Server({name:'shuye-online',version:'0.6.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,()=>rpc('tools/list',{}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{return await rpc('tools/call',request.params);}
  catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
 });
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.SHUYE_MCP_TOKEN||(process.env.SHUYE_MCP_TOKEN_FILE?(await readFile(process.env.SHUYE_MCP_TOKEN_FILE,'utf8')).trim():undefined);
 const server=remoteServer({url:process.env.SHUYE_MCP_URL||'https://inkq.online/shuye/mcp',token});
 server.onerror=error=>process.stderr.write(error.message+'\n');
 // A permitted 20 MB Word file becomes ~28 MB base64. Keep a bounded
 // transport limit above the HTTP limit instead of the SDK's 10 MB default.
 await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:64*1024*1024}));
}
