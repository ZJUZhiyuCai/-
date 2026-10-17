import {CloudStore} from './cloud-store.mjs';
import {callTool,toolList} from './cloud-tools.mjs';
export function errorStatus(e){return /UNAUTHENTICATED/.test(e.message)?401:/NOT_FOUND/.test(e.message)?404:/CONFLICT|ALREADY_EXISTS/.test(e.message)?409:400;}
export function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function body(request){if(Number(request.headers.get('content-length'))>30*1024*1024)throw Error('REQUEST_TOO_LARGE');const reader=request.body?.getReader();if(!reader)throw Error('EMPTY_BODY');let bytes=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>30*1024*1024){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}chunks.push(value);}const data=new Uint8Array(bytes);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(data));}
export async function handle(request,env,mcp=false){
  let input;
  try{
    const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'ORIGIN_DENIED'},403);
    input=await body(request);
    if(mcp){
      if(input?.jsonrpc!=='2.0'||typeof input.method!=='string'||(input.id!==undefined&&typeof input.id!=='string'&&typeof input.id!=='number'&&input.id!==null))return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}},400);
      const success=result=>json({jsonrpc:'2.0',id:input.id??null,result});
      if(input.method==='server/discover')return success({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
      if(input.method==='initialize')return success({protocolVersion:input.params?.protocolVersion==='2026-07-28'?'2026-07-28':'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'shuye-cloud',version:'0.5.0'}});
      if(input.method.startsWith('notifications/'))return new Response(null,{status:202});
      if(input.method==='ping')return success({});
      if(input.method==='tools/list')return success({tools:toolList()});
      if(input.method!=='tools/call')return json({jsonrpc:'2.0',id:input.id??null,error:{code:-32601,message:'Method not found'}});
      try{const store=new CloudStore(env.DB,env.BUCKET,request.headers.get('oai-authenticated-user-id'));const value=await callTool(store,input.params?.name,input.params?.arguments);return success({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false});}catch(e){return success({content:[{type:'text',text:e.message}],isError:true});}
    }
    const store=new CloudStore(env.DB,env.BUCKET,request.headers.get('oai-authenticated-user-id'));
    return json(await callTool(store,input.tool,input.arguments));
  }catch(e){return json({error:e.message},errorStatus(e));}
}
