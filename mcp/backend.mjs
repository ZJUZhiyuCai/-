import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function pythonCall(request){return new Promise((resolve,reject)=>{
  const child=spawn(process.env.SHUYE_PYTHON||'python',[fileURLToPath(new URL('./python_bridge.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let chunks=[],size=0,errors='';const timer=setTimeout(()=>{child.kill();reject(Error('BACKEND_TIMEOUT'));},200000);
  child.stdout.on('data',b=>{size+=b.length;if(size>100*1024*1024){child.kill();reject(Error('BACKEND_RESPONSE_TOO_LARGE'));}else chunks.push(b);});
  child.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-4000);});
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.stdin.on('error',()=>{});
  child.on('close',code=>{clearTimeout(timer);try{const r=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(code||r.error)throw Error(r.error||errors||'BACKEND_FAILED');resolve(r);}catch(e){reject(Error(`PDF_BACKEND: ${e.message}`));}});
  child.stdin.end(JSON.stringify(request));
});}
