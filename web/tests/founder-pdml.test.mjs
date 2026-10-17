import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFounderPdml} from '../lib/founder-pdml.mjs';
import {callTool,toolList} from '../lib/cloud-tools.mjs';
// Original synthetic fixture using observed element/attribute names. No vendor artwork or text.
const xml=`<?xml version="1.0"?><docRoot xmlns="http://www.founder.com/PDMLSchema/2009/main" version="1.1" publicationType="print">
 <preference><docEnv><parameter><pageSetting pageCount="1" pageWidth="210" pageHeight="297"/></parameter></docEnv></preference>
 <masterSets><masterSpread uid="ms1" name="测试母版"><page appliedMaster="ms_0"/></masterSpread></masterSets>
 <spreads><spread uid="sp1"><textItem uid="frame1" parentArticle="article1"><flowRange beginPara="0" beginChar="0" endPara="0" endChar="4"/><oPr><basicObjFmt xPos="100" yPos="100" width="40" height="30"/></oPr></textItem><page uid="0" pageRect="(0,0,210,297)" appliedMaster="ms1"/></spread></spreads>
 <article uid="article1"><articlePref textDirection="forwardHorizontal"/><p><r><t xml:space="preserve">A 中🙂</t></r></p></article></docRoot>`;
test('PDML reads observed structure without claiming import or inferring missing origins',()=>{
 const r=inspectFounderPdml(xml);assert.deepEqual(r.totals,{pages:1,masterPages:1,masters:1,objects:1,articles:1});assert.equal(r.objects[0].geometry.xPos,'100');assert.deepEqual(r.objects[0].canvasBounds,[80,85,120,115]);assert.equal(r.articles[0].textCharacters,5);assert.equal(r.compatibility.editableImport,false);assert.equal(r.pages[0].hasExplicitPageRect,false);assert.equal(r.pages[1].hasExplicitPageRect,true);assert.equal(r.diagnostics[0].code,'PAGE_ORIGIN_UNVERIFIED');assert.equal(r.offset,0);
});
test('PDML namespace, malformed XML, DTD, entities and depth fail closed',()=>{
 for(const source of [xml.replace('PDMLSchema','other'),xml.replace('</article>',''),xml.replace('<docRoot','<!DOCTYPE docRoot [<!ENTITY x SYSTEM "file:///private">]><docRoot'),xml.replace('A 中🙂','&missing;'),xml.replace('<masterSets>', '<masterSets>'+ '<a>'.repeat(101)).replace('</masterSets>', '</a>'.repeat(101)+'</masterSets>')])assert.throws(()=>inspectFounderPdml(source));
 assert.throws(()=>inspectFounderPdml('x'.repeat(2_000_001)),/LIMIT/);
});
test('PDML diagnostics report unresolved refs and unsupported rendering instead of dropping them',()=>{
 const r=inspectFounderPdml(xml.replace('parentArticle="article1"','parentArticle="absent" nextItem="absent-frame"').replace('<oPr>','<oPr><shadow opacity="50"/>'));
 assert.ok(r.diagnostics.some(x=>x.code==='MISSING_ARTICLE'));assert.ok(r.diagnostics.some(x=>x.code==='MISSING_NEXT_ITEM'));assert.ok(r.diagnostics.some(x=>x.feature==='shadow'));
 const page=inspectFounderPdml(xml,{offset:1,limit:1});assert.equal(page.pages.length,1);assert.equal(page.objects.length,0);assert.equal(page.totals.objects,1);
});
test('PDML inspector is a read-only MCP tool and requires no project mutation',async()=>{
 const tool=toolList().find(t=>t.name==='inspect_founder_pdml');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);
 const r=await callTool(null,'inspect_founder_pdml',{xml});assert.equal(r.totals.pages,1);
});
