import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function openStorage(directory){
 await mkdir(join(directory,'objects'),{recursive:true,mode:0o700});
 const sql=new DatabaseSync(join(directory,'shuye.sqlite'));
 sql.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS projects(owner TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,revision INTEGER NOT NULL,object_key TEXT NOT NULL,history TEXT NOT NULL,updated_at TEXT NOT NULL,block_count INTEGER NOT NULL,archived INTEGER DEFAULT 0 NOT NULL,PRIMARY KEY(owner,id));
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL);`);
 const DB={prepare(q){return {bind(...args){const s=sql.prepare(q);return {async first(){return s.get(...args)},async all(){return {results:s.all(...args)}},async run(){return {meta:{changes:Number(s.run(...args).changes)}}}};}};}};
 const file=key=>{if(!/^documents\/[a-f0-9-]+\.json$/.test(key))throw Error('INVALID_OBJECT_KEY');return join(directory,'objects',key.slice(10));};
 const BUCKET={async put(k,v){const target=file(k),tmp=target+'.'+randomUUID()+'.tmp';await writeFile(tmp,v,{mode:0o600,flag:'wx'});await rename(tmp,target);},async get(k){try{const data=await readFile(file(k),'utf8');return {text:async()=>data}}catch(e){if(e.code==='ENOENT')return null;throw e;}},async delete(k){try{await unlink(file(k))}catch(e){if(e.code!=='ENOENT')throw e;}}};
 return {sql,DB,BUCKET,close:()=>sql.close()};
}
