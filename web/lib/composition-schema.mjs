import {z} from 'zod/v4';
const id=z.string().regex(/^[A-Za-z0-9][\w-]{0,79}$/),obj=s=>z.object(s).strict();
const channel=z.number().min(0).max(1), channels=z.tuple([channel,channel,channel,channel]);
const ink=z.union([z.string().regex(/^#[a-fA-F0-9]{6}$/),obj({space:z.literal('cmyk'),values:channels}),obj({space:z.literal('spot'),name:z.string().min(1).max(80),tint:channel,alternate:channels})]);
const span=obj({start:z.number().int().nonnegative(),end:z.number().int().positive(),style:obj({fontSize:z.number().min(5).max(144).optional(),fontFamily:z.enum(['serif','sans','kai']).optional(),color:ink.optional()})});
const textFlow={slot:id.optional(),spans:z.array(span).max(10000).optional(),columns:z.array(z.number().min(.1).max(100)).min(1).max(8).optional(),columnGap:z.number().min(0).max(50).optional(),writingMode:z.enum(['horizontal-tb','vertical-rl']).optional(),align:z.enum(['left','center','right']).optional(),shape:z.array(z.tuple([z.number(),z.number()])).min(3).max(100).optional(),exclusions:z.array(obj({x:z.number(),y:z.number(),width:z.number().positive(),height:z.number().positive()})).max(100).optional()};
const geometry={...textFlow,x:z.number().min(-450).max(900),y:z.number().min(-450).max(900),width:z.number().min(1).max(900),height:z.number().min(1).max(900),rotation:z.number().min(-180).max(180).optional(),fontSize:z.number().min(5).max(144).optional(),lineHeight:z.number().min(1).max(3).optional(),fontFamily:z.enum(['serif','sans','kai']).optional(),color:ink.optional(),fill:ink.optional(),overprint:z.boolean().optional(),padding:z.number().min(0).max(50).optional(),text:z.string().max(300000).optional(),src:z.string().max(7000000).optional()};
const patch=obj(geometry).partial();
export const frame=obj({id,type:z.enum(['text','image','rect']),...geometry,locked:z.boolean().optional()});
const override=obj({objectId:id,patch:patch.optional(),hidden:z.boolean().optional()});
export const page=obj({id,slotContents:z.array(obj({name:id,text:z.string().max(300000),spans:z.array(span).max(10000).optional()})).max(5000).optional(),masterId:id.nullable().optional(),objects:z.array(frame).max(5000),overrides:z.array(override).max(5000).optional()});
export const master=obj({id,name:z.string().max(80),baseMasterId:id.optional(),objects:z.array(frame).max(5000),overrides:z.array(override).max(5000).optional()});
export const section=obj({id,name:z.string().max(80),startPageId:id,pageStart:z.number().int().min(1).max(99999).optional(),numbering:z.enum(['arabic','roman-lower','roman-upper','chinese']).optional(),firstMasterId:id.nullable().optional(),oddMasterId:id.nullable().optional(),evenMasterId:id.nullable().optional()});
const richNote=obj({id,text:z.string().max(30000),kind:z.enum(['footnote','endnote']).optional()});
export const richBlock=z.discriminatedUnion('type',[
 obj({id,type:z.literal('paragraph'),text:z.string().max(300000),spans:z.array(span).max(10000).optional()}),
 obj({id,type:z.literal('table'),rows:z.array(z.array(z.string().max(10000)).min(1).max(50)).min(1).max(5000),headerRows:z.number().int().nonnegative().optional(),columnWidths:z.array(z.number().positive()).max(50).optional(),merges:z.array(obj({row:z.number().int().nonnegative(),col:z.number().int().nonnegative(),rowspan:z.number().int().positive(),colspan:z.number().int().positive()})).max(10000).optional()})
]);
export const story=obj({id,name:z.string().max(80),text:z.string().max(300000),spans:z.array(span).max(10000).optional(),blocks:z.array(richBlock).max(1000).optional(),notes:z.array(richNote).max(1000).optional(),frameIds:z.array(id).max(5000)});
export const compositionSchema=obj({pages:z.array(page).min(1).max(1000),masters:z.array(master).max(100),stories:z.array(story).max(1000),sections:z.array(section).max(1000).optional()});
const op=(name,s)=>obj({op:z.literal(name),...s});
const owner={pageId:id.optional(),masterId:id.optional()};
export const compositionOperations=[
 op('set_composition',{composition:compositionSchema}),op('upsert_page',{page}),op('delete_page',{pageId:id}),op('move_page',{pageId:id,index:z.number().int().nonnegative()}),
 op('upsert_master',{master}),op('delete_master',{masterId:id}),op('assign_master',{pageId:id,masterId:id.nullable(),inherit:z.boolean().optional()}),
 op('upsert_section',{section}),op('delete_section',{sectionId:id}),op('align_section_start',{sectionId:id,side:z.enum(['left','right'])}),
 op('master_from_page',{pageId:id,newMasterId:id,name:z.string().max(80)}),op('set_slot_content',{pageId:id,name:id,text:z.string().max(300000).optional(),spans:z.array(span).max(10000).optional(),reset:z.boolean().optional()}),
 op('override_master_object',{...owner,objectId:id,patch:patch.optional(),hidden:z.boolean().optional(),reset:z.boolean().optional()}),
 op('upsert_frame',{...owner,frame}),op('delete_frame',{...owner,frameId:id}),op('set_frame_lock',{...owner,frameId:id,locked:z.boolean()}),
 op('story_table_set_cell',{storyId:id,blockId:id,row:z.number().int().nonnegative(),col:z.number().int().nonnegative(),text:z.string().max(10000)}),
 op('story_table_merge',{storyId:id,blockId:id,range:obj({row:z.number().int().nonnegative(),col:z.number().int().nonnegative(),rowspan:z.number().int().positive(),colspan:z.number().int().positive()})}),
 op('story_table_split',{storyId:id,blockId:id,row:z.number().int().nonnegative(),col:z.number().int().nonnegative()}),
 op('story_table_resize',{storyId:id,blockId:id,axis:z.enum(['row','col']),index:z.number().int().nonnegative(),remove:z.boolean().optional()}),
 op('story_update_paragraph',{storyId:id,blockId:id,text:z.string().max(300000)}),
 op('story_update_note',{storyId:id,noteId:id,text:z.string().max(30000),kind:z.enum(['footnote','endnote']).optional()}),
 op('upsert_story',{story}),op('thread_frames',{storyId:id,frameIds:z.array(id).max(5000)}),
 op('split_story',{storyId:id,frameId:id,offset:z.number().int().nonnegative(),newStoryId:id}),
];
