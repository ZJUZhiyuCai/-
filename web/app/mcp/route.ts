import {env} from 'cloudflare:workers';
import {handle} from '../../lib/http.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handle(request,env,true);}
export async function GET(){return new Response('Use JSON-RPC POST /mcp',{status:405,headers:{Allow:'POST'}});}
