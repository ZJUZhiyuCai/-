// Explicit saves + optimistic revisions. Never auto-publish a dirty browser buffer.
export class ProjectConnection {
  constructor({api,getDoc,replaceDoc}){Object.assign(this,{api,getDoc,replaceDoc,projectId:null,revision:0,base:'',busy:false,epoch:0});}
  get dirty(){return this.projectId!==null&&JSON.stringify(this.getDoc())!==this.base;}
  disconnect(){this.epoch++;this.projectId=null;this.base='';}
  async open(projectId){const epoch=++this.epoch,r=await this.api('get_project',{projectId});if(epoch!==this.epoch)return false;this.projectId=projectId;this.revision=r.revision;this.base=JSON.stringify(r.document);await this.replaceDoc(r.document);return true;}
  async save(){if(!this.projectId)throw Error('NOT_CONNECTED');const epoch=this.epoch,document=structuredClone(this.getDoc()),r=await this.api('replace_project',{projectId:this.projectId,expectedRevision:this.revision,document});if(epoch===this.epoch){this.revision=r.revision;this.base=JSON.stringify(document);}return r;}
  async poll(){if(!this.projectId||this.busy||this.dirty)return false;this.busy=true;const epoch=this.epoch;try{const r=await this.api('get_project',{projectId:this.projectId});if(epoch!==this.epoch||this.dirty||r.revision===this.revision)return false;this.revision=r.revision;this.base=JSON.stringify(r.document);await this.replaceDoc(r.document);return true;}finally{this.busy=false;}}
}
