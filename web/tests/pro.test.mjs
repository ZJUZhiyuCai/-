import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePro,decodePro} from '../public/editor/src/pro.mjs';
import {validateDocument} from '../public/editor/src/model.mjs';
test('project save retains complete PRO source and rejects oversized records',()=>{
  const raw={format:'open-typesetter',version:2,blocks:[],proSources:[{name:'original.PRO',source:'〖ZZ未知参数〗\r\n\uE005'}]};
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(validateDocument(raw)))).proSources,raw.proSources);
  assert.throws(()=>validateDocument({...raw,proSources:Array(21).fill(raw.proSources[0])}));
});
// All fixtures below are newly authored parameter examples, not vendor files.
test('BX explicit mm geometry has height-before-width and preserves every source character',()=>{
  const source='〖BX7SS，180mm。120mm，*1C220mm。160mm，S20mm，Z20mm，2mm，QF〗\r\n\uE005';
  const p=parsePro(source);assert.deepEqual(p.layoutPatch,{writingMode:'horizontal-tb',height:220,width:160,top:20,bottom:20,inner:20,outer:20});
  assert.equal(p.records.map(r=>r.raw).join(''),source);assert.equal(p.records[0].parsed.lineSpacingRaw,'*1');
});
test('vertical direction and typography remain independent of unverified count dimensions',()=>{
  const p=parsePro('[BX7,7SS,31。29,1!]\uE005');assert.deepEqual(p.layoutPatch,{writingMode:'vertical-rl'});assert.equal(p.records[0].parsed.bodyHeight.unit,'count');assert.equal(p.records[0].parsed.typographyRaw,'7,7SS');assert.ok(p.warnings.some(w=>w.includes('旧字号')));
});
test('unknown and after-end content is retained, never applied',()=>{
  const source='〖ZZprivate〗\n\uE005〖BX7SS,20。20,1!〗';const p=parsePro(source);
  assert.equal(p.records.map(r=>r.raw).join(''),source);assert.deepEqual(p.layoutPatch,{});assert.ok(p.warnings.some(w=>w.includes('结束标记后')));
});
test('ambiguous multiple BX and unsupported suffixes do not produce guessed geometry',()=>{
  assert.deepEqual(parsePro('[BX7SS,21。23,1][BX7SS,22。24,1!]').layoutPatch,{});
  const p=parsePro('[BX7SS,180mm。120mm,1C220mm。160mm,S20mm,Z20mm,2mm,QF,UNKNOWN]');assert.deepEqual(p.layoutPatch,{});assert.ok(p.records[0].error);
});
test('unsafe page geometry is retained with a diagnostic rather than silently clamped',()=>{
  const p=parsePro('[BX7SS,250mm。120mm,1C220mm。160mm,S20mm,Z20mm,2mm,QF]');assert.deepEqual(p.layoutPatch,{});assert.match(p.records[0].error,/大于/);
  const nonMirrored=parsePro('[BX7SS,180mm。120mm,1C220mm。170mm,S20mm,Z15mm,2mm,F]');assert.deepEqual(nonMirrored.layoutPatch,{writingMode:'horizontal-tb'});assert.ok(nonMirrored.warnings.some(w=>w.includes('镜像')));
});
test('SB preserves order and escaped path references without resolving files',()=>{
  const p=parsePro(String.raw`[SBchapter-a.fbd,folder\\chapter-b.fbd]`);assert.deepEqual(p.files.map(f=>f.path),['chapter-a.fbd','folder\\chapter-b.fbd']);assert.ok(p.warnings.some(w=>w.includes('不自动读取')));
});
test('decode is explicit and malformed or binary text fails closed',()=>{
  assert.equal(decodePro(new TextEncoder().encode('[BX7SS,21。23,1]'),{encoding:'utf-8'}).text,'[BX7SS,21。23,1]');
  assert.throws(()=>decodePro(Uint8Array.of(0xff),{encoding:'utf-8'}));assert.throws(()=>parsePro('[BXmissing'));assert.throws(()=>parsePro('\u0000binary'));assert.throws(()=>decodePro(Uint8Array.of(1),{encoding:'unknown'}));
});

