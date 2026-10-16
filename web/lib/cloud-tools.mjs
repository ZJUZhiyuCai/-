import {z} from 'zod/v4';
import {id,operation,editBase,editSchema,documentSchema,projectInput,jsonSchema} from './schema.mjs';
import {outline,checkDocument} from './operations.mjs';
import {plainDocument} from '../public/editor/src/model.mjs';
export const limitations=['当前尚未达到方正飞翔完整功能对等','浏览器打印 PDF；无云端 XeLaTeX、PDF/X、CMYK 分色或专业拼版','未支持飞翔原生文件、自由文本框串接、图层及任意路径绘图','组件交叉引用显示标题，不是跨页页码引用'];
export function createCloudTools(store){
  const tools=[];const obj=s=>z.object(s).strict();const add=(name,description,schema,run,readOnly=false)=>tools.push({name,description,schema,run,readOnly});
  add('get_capabilities','查看网页端实际能力与限制。',obj({}),()=>({version:'0.4.0',transport:'HTTP',components:['paragraph','heading','image','table','equation','toc','index','pageBreak'],cloudStorage:true,history:10,limits:{documentBytes:20971520,projects:200},limitations}),true);
  add('list_projects','列出当前登录用户的云端工程。',obj({}),async()=>({projects:await store.list()}),true);
  add('create_project','创建工程。稳定 projectId；同名禁止覆盖。',projectInput,a=>store.create(a.projectId,a.document||{format:'open-typesetter',version:2,title:a.title||a.projectId,blocks:[]}));
  add('get_project','读取源工程与当前修订号。',obj({projectId:id}),a=>store.get(a.projectId),true);
  add('get_document_schema','完整模型 schema、单位和引用标记。',obj({}),()=>({schema:jsonSchema(),units:{page:'mm',fontSize:'pt',offset:'UTF-16, grapheme boundaries'},references:{note:'[^id]',citation:'[[cite:id]]',component:'[[ref:id]]'},limitations}),true);
  add('get_outline','列出章节及其子树组件 ID。',obj({projectId:id}),async a=>{const r=await store.get(a.projectId);return {revision:r.revision,chapters:outline(r.document)};},true);
  add('list_components','分页读取组件；隐藏图片数据。',obj({projectId:id,offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(200).default(50)}),async a=>{const r=await store.get(a.projectId);return {revision:r.revision,total:r.document.blocks.length,blocks:r.document.blocks.slice(a.offset,a.offset+a.limit).map(({src,...b})=>({...b,...(src?{imageBytesApprox:Math.floor(src.length*.75)}:{})}))};},true);
  add('apply_changes','原子批量修改；先获取修订号，dryRun 可预检。偏移 UTF-16，不可切开字素或引用。',editSchema,a=>store.edit(a.projectId,a.expectedRevision,a.operations,{dryRun:a.dryRun}));
  const descriptions={set_title:'设置书名',set_layout:'设置开本、页眉页脚、页码、方向、栏数和边距',insert_blocks:'插入文字、标题、表格、图片、公式、目录或索引',update_block:'编辑组件内容、字符样式或注音',replace_text:'替换 UTF-16 字符范围',delete_blocks:'删除组件，拒绝悬空引用',move_blocks:'移动组件',chapter_insert:'插入章节及内容',chapter_move:'移动整章及其下级内容',chapter_delete:'删除整章',upsert_note:'添加或更新脚注/尾注',delete_note:'删除未引用注释',upsert_bibliography:'添加或更新文献',delete_bibliography:'删除未引用文献',insert_reference:'插入注释、文献或组件引用',upsert_comment:'添加或修改不打印的审阅批注',delete_comment:'删除批注',table_set_cell:'编辑表格单元格',table_merge:'合并单元格',table_split:'拆分合并单元格',table_resize:'增删表格行列',set_styles:'管理命名段落样式',apply_style:'应用命名样式',set_index:'设置索引词',set_bookmarks:'设置书签'};
  for(const o of operation.options){const name=o.shape.op.value;add(name,descriptions[name]+'。需 expectedRevision，支持 dryRun。',o.omit({op:true}).extend(editBase),a=>{const {projectId,expectedRevision,dryRun,...fields}=a;return store.edit(projectId,expectedRevision,[{op:name,...fields}],{dryRun});});}
  add('replace_project','替换完整工程，保留历史且必须校验修订号。',obj({...editBase,document:documentSchema}),a=>store.change(a.projectId,a.expectedRevision,()=>({document:a.document}),{dryRun:a.dryRun}));
  add('undo_project','恢复上一个保存版本，产生新修订号。',obj({projectId:id,expectedRevision:z.number().int().positive()}),a=>store.restore(a.projectId,a.expectedRevision));
  add('list_versions','列出最近十个可恢复版本。',obj({projectId:id}),a=>store.history(a.projectId),true);
  add('restore_version','恢复选定历史版本，产生新修订号。',obj({projectId:id,expectedRevision:z.number().int().positive(),revision:z.number().int().positive()}),a=>store.restore(a.projectId,a.expectedRevision,a.revision));
  add('archive_project','归档或恢复工程，保留数据。',obj({projectId:id,expectedRevision:z.number().int().positive(),archived:z.boolean()}),a=>store.archive(a.projectId,a.expectedRevision,a.archived));
  add('validate_project','校验组件与引用结构；不代表视觉验收。',obj({projectId:id}),async a=>{const r=await store.get(a.projectId);checkDocument(r.document);return {revision:r.revision,valid:true,visualPaginationChecked:false,limitations};},true);
  add('import_text','从纯文本创建新工程。',obj({projectId:id,title:z.string().max(120),text:z.string().max(5000000)}),a=>store.create(a.projectId,plainDocument(a.text,a.title)));
  add('export_project','返回可保存为 .json 的完整工程。',obj({projectId:id}),a=>store.get(a.projectId),true);
  return tools;
}
export async function callTool(store,name,args){const t=createCloudTools(store).find(t=>t.name===name);if(!t)throw Error('UNKNOWN_TOOL');return t.run(t.schema.parse(args??{}));}
export function toolList(){return createCloudTools(null).map(t=>({name:t.name,description:t.description,inputSchema:z.toJSONSchema(t.schema),annotations:{readOnlyHint:t.readOnly,destructiveHint:!t.readOnly,idempotentHint:t.readOnly,openWorldHint:false}}));}
