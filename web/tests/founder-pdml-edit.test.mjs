import test from 'node:test';
import assert from 'node:assert/strict';
import {openFounderPdml,editFounderPdml,importFounderPdmlComposition,exportFounderPdmlComposition,founderPdmlHash} from '../lib/founder-pdml-edit.mjs';
const ns='http://www.founder.com/PDMLSchema/2009/main';
// Original, deliberately tiny schema fixture. No proprietary text or artwork.
const xml=`<?xml version="1.0" encoding="UTF-8"?>\r\n<docRoot xmlns="${ns}" xmlns:future="urn:example:future" version='1.1'>
<!-- untouched > --><?future keep="yes"?>
<future:opaque a='&quot; >' z="2"><![CDATA[unknown <record> & bytes]]></future:opaque>
<spreads><spread uid="spread1"><textItem uid="frame1" parentArticle="article1"><flowRange beginPara="0" beginChar="0" endPara="0" endChar="5"/><oPr><basicObjFmt xPos='120' yPos="240" width="40" height="50"/></oPr></textItem><page uid="page1" pageRect="(100,200,310,497)"/></spread></spreads>
<article uid="article1"><articlePref textDirection="forwardHorizontal"/><p><r><t xml:space="preserve"><![CDATA[AB 中🙂]]></t></r></p></article></docRoot>`;
const replace=(text,expectedText='AB 中🙂')=>({op:'replace_text',articleId:'article1',paragraphIndex:0,textIndex:0,expectedText,text});

test('PDML native session reads editable records and no-op keeps every byte including CDATA and unknown namespaces',async()=>{
 const opened=await openFounderPdml(xml);assert.equal(opened.sourceHash,await founderPdmlHash(xml));assert.equal(opened.articles[0].paragraphs[0].texts[0].text,'AB 中🙂');assert.equal(opened.objects[0].geometry.xPos,'120');
 const saved=await editFounderPdml(xml,{expectedHash:opened.sourceHash,operations:[]});assert.equal(saved.xml,xml);assert.equal(saved.changed,false);assert.equal(saved.compatibility.referenceApplicationVerified,false);
 const same=await editFounderPdml(xml,{expectedHash:opened.sourceHash,operations:[replace('AB 中🙂')]});assert.equal(same.xml,xml);
});
test('PDML targeted text/geometry writes preserve unknown markup and survive independent reparse',async()=>{
 const saved=await editFounderPdml(xml,{expectedHash:await founderPdmlHash(xml),operations:[replace('&< 文😊'),{op:'set_geometry',objectId:'frame1',patch:{xPos:125,width:42}}]});
 assert.equal(saved.xml,xml.replace('<![CDATA[AB 中🙂]]>','&amp;&lt; 文😊').replace("xPos='120'","xPos='125'").replace('width="40"','width="42"'));assert.equal(saved.patchCount,3);
 const reread=await openFounderPdml(saved.xml);assert.equal(reread.articles[0].paragraphs[0].texts[0].text,'&< 文😊');assert.deepEqual(reread.objects[0].canvasBounds,[104,215,146,265]);
});
test('PDML optimistic source/text conflicts, length drift and duplicate target edits fail atomically',async()=>{
 const hash=await founderPdmlHash(xml);
 await assert.rejects(editFounderPdml(xml,{expectedHash:'0'.repeat(64),operations:[]}),/SOURCE_CONFLICT/);
 await assert.rejects(editFounderPdml(xml,{expectedHash:hash,operations:[replace('xx 文😊','stale')]}),/TEXT_CONFLICT/);
 for(const text of ['ABC 中🙂','AB 中x','AB é🙂'])await assert.rejects(editFounderPdml(xml,{expectedHash:hash,operations:[replace(text)]}),/LENGTH_CHANGE/);
 await assert.rejects(editFounderPdml(xml,{expectedHash:hash,operations:[replace('CD 文😊'),replace('EF 字🙃')]}),/OVERLAPPING/);
 await assert.rejects(editFounderPdml(xml,{expectedHash:hash,operations:[{op:'set_geometry',objectId:'frame1',patch:{src:'file:///x'}}]}),/GEOMETRY_PATCH/);
 await assert.rejects(openFounderPdml(xml.replace('<p>','<p uid="frame1">')),/DUPLICATE_UID/);
});
test('PDML namespace prefixes and escaped attribute quotes round trip without XML injection',async()=>{
 const prefixed=xml.replaceAll('<docRoot','<pd:docRoot').replaceAll('</docRoot','</pd:docRoot').replace(`xmlns="${ns}"`,`xmlns:pd="${ns}" xmlns="${ns}"`);
 const styled=prefixed.replace('<articlePref textDirection="forwardHorizontal"/>',`<articlePref textDirection="forwardHorizontal"><aPr><basicCharFmt fontSize="(4.2,4.2)"><activeFont lang="english" fontName='Example'/></basicCharFmt></aPr></articlePref>`);
 const result=await editFounderPdml(styled,{expectedHash:await founderPdmlHash(styled),operations:[{op:'set_style',ownerId:'article1',element:'activeFont',elementIndex:0,attribute:'fontName',expectedValue:'Example',value:"A'B\" & <font>"},{op:'set_style',ownerId:'article1',element:'basicCharFmt',elementIndex:0,attribute:'fontSize',expectedValue:'(4.2,4.2)',value:'(5,5)'}]});
 assert.ok(result.xml.includes("fontName='A&apos;B\" &amp; &lt;font&gt;'"));assert.ok(result.xml.startsWith('<?xml'));assert.equal((await openFounderPdml(result.xml)).totals.articles,1);
});
test('PDML explicit page rectangle imports actual page coordinates and geometry/text export reverses them',async()=>{
 const imported=await importFounderPdmlComposition(xml);assert.deepEqual(imported.pageSize,{width:210,height:297});const c=structuredClone(imported.composition),f=c.pages[0].objects[0];assert.equal(f.x,0);assert.equal(f.y,15);f.x=7;f.y=20;f.width=60;f.text='CD 文😊';
 const saved=await exportFounderPdmlComposition(xml,{expectedHash:imported.sourceHash,composition:c});const reread=await openFounderPdml(saved.xml);assert.equal(reread.objects[0].geometry.xPos,'137');assert.equal(reread.objects[0].geometry.yPos,'245');assert.equal(reread.articles[0].paragraphs[0].texts[0].text,'CD 文😊');assert.ok(saved.xml.includes('<future:opaque'));
 const again=await importFounderPdmlComposition(saved.xml);assert.equal(again.composition.pages[0].objects[0].x,7);assert.equal(again.composition.pages[0].objects[0].y,20);
});
test('PDML composition refuses guessed origins, dropped objects/styles, threads and unsupported edits',async()=>{
 for(const [input,code]of [[xml.replace(' pageRect="(100,200,310,497)"',''),'ORIGIN_UNVERIFIED'],[xml.replace('<oPr>','<oPr><shadow/>'),'FEATURE_UNSUPPORTED'],[xml.replace('parentArticle="article1"','parentArticle="article1" nextItem="frame2"'),'THREAD_UNSUPPORTED'],[xml.replace('<r>','<r><rPr><basicCharFmt fontSize="(4,4)"/></rPr>'),'STYLE_UNSUPPORTED'],[xml.replace('<r>','<r><tab/>'),'CONTENT_UNSUPPORTED'],[xml.replace('<r>','<r><ruby/>'),'CONTENT_UNSUPPORTED']])await assert.rejects(importFounderPdmlComposition(input),new RegExp(code));
 const imported=await importFounderPdmlComposition(xml),c=structuredClone(imported.composition);c.pages[0].objects[0].rotation=15;await assert.rejects(exportFounderPdmlComposition(xml,{expectedHash:imported.sourceHash,composition:c}),/STYLE_WRITE_UNSUPPORTED/);
});
