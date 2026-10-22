import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {remoteServer} from '../mcp/remote.mjs';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
test('remote MCP discovers live tools and preserves arguments/results through SDK',async()=>{
 const calls=[];let names=['plan_journal_layout'];
 const server=remoteServer({url:'https://example.org/shuye/mcp',token:'test-token',fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer test-token');
  const request=JSON.parse(options.body);calls.push(request);
  return Response.json({jsonrpc:'2.0',id:request.id,result:request.method==='tools/list'?{tools:names.map(name=>({name,inputSchema:{type:'object',properties:{}}}))}:{content:[{type:'text',text:'ok'}],structuredContent:request.params.arguments}});
 }});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'acceptance',version:'1'});
 await server.connect(a);await client.connect(b);
 try{
  assert.equal((await client.listTools()).tools[0].name,'plan_journal_layout');names.push('new_tool');assert.equal((await client.listTools()).tools.length,2);
  const args={revisionPolicy:'accept',projectId:'test'};
  assert.deepEqual((await client.callTool({name:'import_journal_docx',arguments:args})).structuredContent,args);
  assert.equal(calls.at(-1).params.name,'import_journal_docx');
 }finally{await client.close();await server.close();}
});
test('remote MCP rejects plaintext Internet endpoints and missing tokens',()=>{
 assert.throws(()=>remoteServer({url:'http://example.org/mcp',token:'x'}),/HTTPS/);
 assert.throws(()=>remoteServer({url:'https://example.org/mcp'}),/token/);
});

test('remote MCP retries transient reads, never repeats an uncertain write',async()=>{
 const attempts={};const server=remoteServer({url:'https://example.org/mcp',token:'test',fetchImpl:async(url,options)=>{
  const r=JSON.parse(options.body);
  if(r.method==='tools/list')return Response.json({result:{tools:['get_project','set_title'].map(name=>({name,inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:name==='get_project'}}))}});
  const name=r.params.name;attempts[name]=(attempts[name]||0)+1;if(attempts[name]===1)throw Error('connection reset');
  return Response.json({result:{content:[{type:'text',text:'ok'}]}});
 }});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'retry-test',version:'1'});await server.connect(a);await client.connect(b);
 try{await client.listTools();assert.equal((await client.callTool({name:'get_project',arguments:{}})).isError,undefined);assert.equal((await client.callTool({name:'set_title',arguments:{}})).isError,true);assert.deepEqual(attempts,{get_project:2,set_title:1});}
 finally{await client.close();await server.close();}
});

test('real stdio adapter accepts Word/PDF messages larger than the SDK default',async()=>{
 const large='A'.repeat(11*1024*1024);
 const http=createServer(async(req,res)=>{let chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.params.arguments.base64.length,large.length);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:'See structuredContent'}],structuredContent:{base64:large}}}));});
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'large-payload-test',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp/remote.mjs',import.meta.url))],env:{...process.env,SHUYE_MCP_URL:`http://127.0.0.1:${http.address().port}/mcp`,SHUYE_MCP_TOKEN:'test-only'},maxBufferSize:64*1024*1024});
 try{await client.connect(transport);const result=await client.callTool({name:'import_journal_docx',arguments:{base64:large}});assert.equal(result.structuredContent.base64,large);}
 finally{await client.close();await new Promise(resolve=>http.close(resolve));}
});
