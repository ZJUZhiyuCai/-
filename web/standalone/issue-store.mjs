import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function createIssueStore(root){
 const locks=new Set(),ownerPath=owner=>join(root,createHash('sha256').update(owner).digest('hex'),'issues');
 const file=(owner,id)=>{if(!/^[a-zA-Z0-9][\w-]{0,79}$/.test(id))throw Error('INVALID_ISSUE_ID');return join(ownerPath(owner),id+'.json');};
 const get=async(owner,id)=>JSON.parse(await readFile(file(owner,id),'utf8').catch(e=>{if(e.code==='ENOENT')throw Error('ISSUE_NOT_FOUND');throw e;}));
 return {get,async list(owner){const names=await readdir(ownerPath(owner)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});return Promise.all(names.filter(n=>n.endsWith('.json')).sort().map(async n=>{const r=await get(owner,n.slice(0,-5));return {issueId:r.issueId,revision:r.revision,title:r.plan.title,articles:r.plan.articles.length,updatedAt:r.updatedAt};}));},async save(owner,id,expectedRevision,plan){const path=file(owner,id);if(locks.has(path))throw Error('ISSUE_BUSY_RETRY');locks.add(path);try{let old;try{old=await get(owner,id);}catch(e){if(e.message!=='ISSUE_NOT_FOUND')throw e;}if((old?.revision||0)!==expectedRevision)throw Error('REVISION_CONFLICT');if(!old&&(await this.list(owner)).length>=100)throw Error('ISSUE_LIMIT_100');const record={issueId:id,revision:expectedRevision+1,plan:structuredClone(plan),updatedAt:new Date().toISOString(),history:old?[{revision:old.revision,plan:old.plan,updatedAt:old.updatedAt},...old.history].slice(0,20):[]};await mkdir(ownerPath(owner),{recursive:true,mode:0o700});await writeFile(path+'.tmp',JSON.stringify(record),{mode:0o600});await rename(path+'.tmp',path);return record;}finally{locks.delete(path);}}};
}
