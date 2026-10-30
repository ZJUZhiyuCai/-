// UI availability is advisory. Download still rechecks the revision on the server.
export function proofDisposition(proof,connection){
 if(!proof||proof.projectId!==connection.projectId)return 'missing';
 if(connection.dirty||proof.stale||proof.revision!==connection.revision)return 'stale';
 return proof.status==='complete'?'ready':proof.status==='running'?'running':'failed';
}
export class ProofSession {
 constructor({api,connection,readId,writeId,onChange=()=>{}}){Object.assign(this,{api,connection,readId,writeId,onChange,proof:null,epoch:0});}
 get state(){return proofDisposition(this.proof,this.connection);}
 remember(proof){
  this.writeId(proof.projectId,proof.proofId);
  if(proof.projectId!==this.connection.projectId)return;
  ++this.epoch;this.proof=proof;this.onChange();
 }
 async refresh(){
  const epoch=++this.epoch,projectId=this.connection.projectId,proofId=this.readId(projectId);
  if(!proofId){this.proof=null;this.onChange();return;}
  try{
   const proof=await this.api('get_journal_proof',{proofId});
   if(epoch!==this.epoch||projectId!==this.connection.projectId||proofId!==this.readId(projectId))return;
   if(proof.projectId!==projectId)throw Error('PROOF_PROJECT_MISMATCH');
   this.proof=proof;this.onChange();
  }catch(error){if(epoch===this.epoch&&projectId===this.connection.projectId){this.proof=null;this.onChange();}if(error.message==='PROOF_NOT_FOUND')return;throw error;}
 }
}
