import {z} from 'zod/v4';
import {id,layout} from './schema.mjs';
export const layoutFields=['width','height','top','bottom','inner','outer','fontSize','lineHeight','columns','gap'];
export const assistantPatch=layout.pick(Object.fromEntries(layoutFields.map(k=>[k,true]))).strict();
export const modelProposal=z.object({kind:z.enum(['proposal','unsupported']),summary:z.string().min(1).max(600),patch:assistantPatch}).strict();
// The model must account for every layout field; omission is not an accepted plan.
export const modelLayoutResponse=modelProposal.extend({patch:assistantPatch.required()});
export function changedLayoutFields(current,patch){return Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,Number(v.toFixed(6))]).filter(([k,v])=>Math.abs(current[k]-v)>1e-8));}
export function addAssistantTools(add,store){
 const obj=s=>z.object(s).strict(),project={projectId:id},plan={...project,planId:z.string().uuid()},revision={expectedRevision:z.number().int().positive()};
 const runtime=()=>{if(!store?.layoutAssistant)throw Error('LAYOUT_ASSISTANT_UNAVAILABLE');return store.layoutAssistant;};
 add('get_layout_assistant','检查本机模型是否就绪及占用状态；只提议版式参数，不修改正文或公式。',obj({}),()=>store?.layoutAssistant?.health?.()||store?.layoutAssistant?.capabilities||{enabled:false,ready:false,reason:'独立服务器尚未配置本机排版模型'},true);
 add('start_layout_plan','根据用户意图生成待核对的版式建议。保存源修订，不自动修改工程。',obj({...project,...revision,instruction:z.string().trim().min(1).max(1200)}),a=>runtime().start(store,a));
 add('get_layout_plan','读取本人项目的建议、改前改后差异和过期状态。',obj(plan),a=>runtime().get(store,a),true);
 add('cancel_layout_plan','取消当前推理，保留任务记录。',obj(plan),a=>runtime().cancel(store,a));
 add('apply_layout_plan','按调用方已获得的任务授权应用服务器保存的建议；拒绝过期或重复应用。',obj({...plan,...revision}),a=>runtime().apply(store,a));
 add('undo_layout_plan','撤销本次已应用建议；有后续修改时拒绝覆盖。',obj({...plan,...revision}),a=>runtime().undo(store,a));
}
