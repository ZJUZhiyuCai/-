import {documentFingerprint} from '../public/editor/src/project-sync.mjs';
import {checkDocument,applyOperations} from './operations.mjs';
import {id as idSchema} from './schema.mjs';
const componentCount=doc=>doc.blocks.length+(doc.composition?.pages.reduce((n,p)=>n+p.objects.length,0)||0)+(doc.composition?.masters.reduce((n,m)=>n+m.objects.length,0)||0);
export class CloudStore {
  constructor(db,bucket,owner){if(!owner)throw Error('UNAUTHENTICATED');if(!db||!bucket)throw Error('STORAGE_UNAVAILABLE');Object.assign(this,{db,bucket,owner});}
  stmt(sql,...args){return this.db.prepare(sql).bind(...args);}
  async row(id){idSchema.parse(id);const r=await this.stmt('SELECT * FROM projects WHERE owner=? AND id=?',this.owner,id).first();if(!r)throw Error('PROJECT_NOT_FOUND');return r;}
  async list(){const r=await this.stmt('SELECT id,title,revision,updated_at,block_count,archived FROM projects WHERE owner=? ORDER BY updated_at DESC LIMIT 200',this.owner).all();return r.results.map(r=>({projectId:r.id,title:r.title,revision:r.revision,updatedAt:r.updated_at,blockCount:r.block_count,archived:!!r.archived}));}
  async read(key){const obj=await this.bucket.get(key);if(!obj)throw Error('DOCUMENT_UNAVAILABLE');return JSON.parse(await obj.text());}
  async get(id){const r=await this.row(id);return {projectId:id,revision:r.revision,updatedAt:r.updated_at,document:await this.read(r.object_key)};}
  async status(id){const r=await this.row(id);return {projectId:id,revision:r.revision,updatedAt:r.updated_at,archived:!!r.archived};}
  async put(document){const body=JSON.stringify(document);if(new TextEncoder().encode(body).length>20*1024*1024)throw Error('DOCUMENT_LIMIT_20_MB');const key='documents/'+crypto.randomUUID()+'.json';await this.bucket.put(key,body,{httpMetadata:{contentType:'application/json'}});return key;}
  // A transport error may occur after D1 has committed. Never delete the R2
  // object on an ambiguous result: it can already be the current/history document.
  async recoveredWrite(id,key){try{const row=await this.row(id);return row.object_key===key?row:null;}catch{return null;}}
  async create(id,raw){idSchema.parse(id);const document=checkDocument(raw);if((await this.list()).length>=200)throw Error('PROJECT_LIMIT_200');const objectKey=await this.put(document),updatedAt=new Date().toISOString();try{await this.stmt('INSERT INTO projects (owner,id,title,revision,object_key,history,updated_at,block_count,archived) VALUES (?,?,?,1,?,?,?,?,0)',this.owner,id,document.title,objectKey,'[]',updatedAt,componentCount(document)).run();}catch(e){if(String(e).includes('UNIQUE')){await this.bucket.delete(objectKey);throw Error('PROJECT_ALREADY_EXISTS');}const committed=await this.recoveredWrite(id,objectKey);if(committed)return {projectId:id,revision:committed.revision,document,updatedAt:committed.updated_at,recoveredAfterStorageError:true};throw e;}return {projectId:id,revision:1,document,updatedAt};}
  async change(id,expectedRevision,mutate,{dryRun=false}={}){
    const row=await this.row(id);if(row.revision!==expectedRevision)throw Error('REVISION_CONFLICT');
    const original=await this.read(row.object_key),reports=(original.importReports||[]).map(documentFingerprint);
    const result=await mutate(original),document=checkDocument(result.document);
    for(const report of reports)if(!document.importReports.some(r=>documentFingerprint(r)===report))throw Error('IMPORT_REPORT_REMOVAL');
    if(dryRun)return {...result,document,projectId:id,revision:row.revision,dryRun:true};
    const objectKey=await this.put(document),updatedAt=new Date().toISOString();
    const history=[{key:row.object_key,revision:row.revision,title:row.title,updatedAt:row.updated_at},...JSON.parse(row.history)].slice(0,10);
    let saved;try{saved=await this.stmt('UPDATE projects SET title=?,revision=revision+1,object_key=?,history=?,updated_at=?,block_count=? WHERE owner=? AND id=? AND revision=?',document.title,objectKey,JSON.stringify(history),updatedAt,componentCount(document),this.owner,id,expectedRevision).run();}catch(e){const committed=await this.recoveredWrite(id,objectKey);if(committed)return {...result,document,projectId:id,revision:committed.revision,updatedAt:committed.updated_at,recoveredAfterStorageError:true};throw e;}
    if(saved.meta.changes!==1){await this.bucket.delete(objectKey);throw Error('REVISION_CONFLICT');}
    return {...result,document,projectId:id,revision:row.revision+1,updatedAt};
  }
  edit(id,rev,ops,options){return this.change(id,rev,doc=>applyOperations(doc,ops),options);}
  async history(id){const row=await this.row(id);return {revision:row.revision,versions:JSON.parse(row.history).map(({key,...v})=>v)};}
  async restore(id,rev,target){const row=await this.row(id);if(row.revision!==rev)throw Error('REVISION_CONFLICT');const old=JSON.parse(row.history).find(x=>target===undefined||x.revision===target);if(!old)throw Error('VERSION_NOT_FOUND');return this.change(id,rev,async()=>({document:await this.read(old.key)}));}
  async archive(id,rev,archived){await this.row(id);const result=await this.stmt('UPDATE projects SET archived=?,revision=revision+1,updated_at=? WHERE owner=? AND id=? AND revision=?',archived?1:0,new Date().toISOString(),this.owner,id,rev).run();if(result.meta.changes!==1)throw Error('REVISION_CONFLICT');return {projectId:id,revision:rev+1,archived};}
}
