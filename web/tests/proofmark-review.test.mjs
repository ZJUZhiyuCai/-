import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewSession,parseReviewPacket,sha256,verifyAsset,imageInfo,editItem,decideItem,exportReview,LIMITS} from '../public/editor/src/proofmark-review.mjs';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
const imageHash=await sha256(png);
function packet(){return {schema_version:'proofmark-review/0.2',packet_kind:'review_draft',executable:false,batch_id:'synthetic',base_context:null,
 assets:[{id:'image',sha256:imageHash,width_px:1,height_px:1,original_filename:'sample.png',path:'https://untrusted.invalid/never-fetch',page_segments:[{id:'page',bbox:[0,0,1,1]}]}],
 candidates:[{id:'c1',evidence:{asset_id:'image',page_segment_id:'page',annotation_bbox:[.1,.1,.5,.5],transcription:'<img src=x onerror=alert(1)>',observation:'sample'},target:{region_bbox:[.5,.5,1,1],match_status:'source_bound',source_binding:{document_id:'untrusted'}},interpretation:{summary:'synthetic'},action:{type:'replace_text',new_text:'untrusted edit'},review:{status:'accept_intent',reviewer_id:'untrusted'}}]};}
const input=()=>JSON.stringify(packet());
test('claims in model output never become approvals or executable edits',async()=>{
 const doc={title:'Original',blocks:[{id:'b1',text:'keep this'}]},before=structuredClone(doc),s=await createReviewSession(input(),doc);
 assert.equal(s.items[0].decision,'pending');assert.equal(s.items[0].reviewer,'');assert.equal(s.items[0].text,'<img src=x onerror=alert(1)>');
 assert.throws(()=>decideItem(s,'c1','checked','Editor'),/原图/);
 const report=await exportReview(s,doc);assert.equal(report.executable,false);assert.equal(report.source_binding,null);assert.equal(report.decisions[0].source_binding,null);assert.equal(report.decisions[0].status,'pending');assert.deepEqual(doc,before);
});
test('only the explicit non-executable candidate protocol is accepted',()=>{
 for(const [key,value] of [['executable',true],['schema_version','proofmark-reference-review/0.1'],['packet_kind','apply']]){const p=packet();p[key]=value;assert.throws(()=>parseReviewPacket(JSON.stringify(p)));}
 assert.throws(()=>parseReviewPacket(' '.repeat(LIMITS.packetBytes+1)),/2 MiB/);
});
test('duplicate IDs, dangling evidence references and invalid geometry fail closed',()=>{
 const mutations=[p=>p.assets.push(p.assets[0]),p=>p.candidates.push(p.candidates[0]),p=>p.candidates[0].evidence.asset_id='missing',p=>p.candidates[0].evidence.page_segment_id='missing',p=>p.candidates[0].evidence.annotation_bbox=[.8,0,.1,1],p=>p.candidates[0].target.region_bbox=[0,0,2,1],p=>p.assets[0].page_segments.push(p.assets[0].page_segments[0]),p=>p.assets[0].width_px=13000,p=>p.candidates=Array(201).fill(p.candidates[0])];
 for(const mutate of mutations){const p=packet();mutate(p);assert.throws(()=>parseReviewPacket(JSON.stringify(p)));}
});
test('verified image, named reviewer and edit invalidation protect review decisions',async()=>{
 const s=await createReviewSession(input(),{}),a=s.assets[0];assert.deepEqual(await verifyAsset(a,png),{width:1,height:1,mime:'image/png'});
 s.verifiedAssets.set(a.id,{sha256:a.sha256});assert.throws(()=>decideItem(s,'c1','checked',' '),/复核人/);
 decideItem(s,'c1','checked','Editor');assert.equal(s.items[0].decision,'checked');const first=await exportReview(s,{});
 editItem(s,'c1',{text:'corrected',note:'checked against pixels'});assert.equal(s.items[0].decision,'pending');assert.equal(s.items[0].reviewedAt,null);assert.equal(s.items[0].reviewer,'');
 const next=await exportReview(s,{changed:true});assert.notEqual(first.decisions[0].item_sha256,next.decisions[0].item_sha256);assert.equal(next.context.document_changed,true);assert.equal(next.context.context_only,true);
});
test('image hash, dimensions, magic and allocation bounds are checked before use',async()=>{
 const a=parseReviewPacket(input()).assets[0],tampered=png.slice();tampered[tampered.length-1]^=1;
 await assert.rejects(verifyAsset(a,tampered),/SHA-256/);await assert.rejects(verifyAsset({...a,width:2},png),/尺寸/);
 assert.throws(()=>imageInfo(new TextEncoder().encode('<svg onload="alert(1)"/>')),/PNG/);
 const huge=png.slice();new DataView(huge.buffer).setUint32(16,16000);assert.throws(()=>imageInfo(huge),/PNG/);
 assert.throws(()=>imageInfo(new Uint8Array(LIMITS.imageBytes+1)),/12 MiB/);
});
test('malformed JPEG and rotated EXIF are rejected',()=>{
 assert.throws(()=>imageInfo(Uint8Array.from([255,216,255,225,255,255])),/不完整/);
 const exif=Uint8Array.from([255,216,255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0,255,217]);
 assert.throws(()=>imageInfo(exif),/方向/);
});
test('import and review never fetch paths supplied by an untrusted packet',async()=>{
 const before=globalThis.fetch;globalThis.fetch=()=>{throw Error('unexpected network request');};
 try{const s=await createReviewSession(input(),{});await verifyAsset(s.assets[0],png);await exportReview(s,{});}finally{globalThis.fetch=before;}
});
test('export is a detached draft and reimport cannot inherit an approval',async()=>{
 const s=await createReviewSession(input(),{});s.verifiedAssets.set('image',true);decideItem(s,'c1','excluded','Editor');
 const report=await exportReview(s,{});assert.equal(report.decisions[0].status,'excluded');report.source_packet.batch_id='changed';assert.equal(s.source.batch_id,'synthetic');
 assert.throws(()=>parseReviewPacket(JSON.stringify(report)),/仅支持/);
 assert.equal(parseReviewPacket(input()).items[0].decision,'pending');
});
