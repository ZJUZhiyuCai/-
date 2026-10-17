import {flowStory} from './frame-flow.mjs';
import {validateComposition} from './composition.mjs';
// Transactional: returns a new composition, and never mutates input on failure.
export function paginateStory(input,storyId,templateFrameId,measure,{maxNewPages=100,id=()=>crypto.randomUUID()}={}){
 if(!Number.isInteger(maxNewPages)||maxNewPages<1||maxNewPages>200)throw Error('AUTOFLOW_PAGE_LIMIT');
 const c=validateComposition(input),story=c.stories.find(s=>s.id===storyId),owner=c.pages.find(p=>p.objects.some(f=>f.id===templateFrameId)),template=owner?.objects.find(f=>f.id===templateFrameId);
 if(!story||!template||template.type!=='text'||!story.frameIds.includes(template.id))throw Error('AUTOFLOW_TEMPLATE_NOT_IN_STORY');
 const frames=new Map(c.pages.flatMap(p=>p.objects).map(o=>[o.id,o]));let plan=flowStory(story,story.frameIds.map(id=>frames.get(id)),measure),offset=plan.offset;const createdPageIds=[];let insertAt=1+Math.max(...story.frameIds.map(id=>c.pages.findIndex(p=>p.objects.some(o=>o.id===id))));
 while(story.blocks?!plan.complete:offset<story.text.length){
  if(createdPageIds.length>=maxNewPages||c.pages.length>=1000)throw Error('AUTOFLOW_PAGE_LIMIT');
  const f={...structuredClone(template),id:'f-'+id(),text:'',spans:[],locked:false},p={id:'p-'+id(),objects:[f],overrides:[],...(owner.masterId!==undefined?{masterId:owner.masterId}:{})};
  if(story.blocks){frames.set(f.id,f);story.frameIds.push(f.id);plan=flowStory(story,story.frameIds.map(id=>frames.get(id)),measure);if(plan.offset<=offset)throw Error('AUTOFLOW_NO_PROGRESS');offset=plan.offset;}
  else {const remainder={text:story.text.slice(offset),spans:(story.spans||[]).filter(s=>s.end>offset).map(s=>({...s,start:Math.max(0,s.start-offset),end:s.end-offset}))},r=flowStory(remainder,[f],measure);if(r.offset===0)throw Error('AUTOFLOW_NO_PROGRESS');offset+=r.offset;story.frameIds.push(f.id);}
  c.pages.splice(insertAt++,0,p);createdPageIds.push(p.id);
 }
 return {composition:validateComposition(c),createdPageIds,characters:story.text.length};
}
