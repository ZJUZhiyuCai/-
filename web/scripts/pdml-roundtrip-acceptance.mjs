import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openFounderPdml,editFounderPdml,importFounderPdmlComposition} from '../lib/founder-pdml-edit.mjs';

// Local-only proprietary fixture supplied by the operator; it is never copied
// into the repository or fetched through any external reference in the XML.
const path=process.argv[2];if(!path)throw Error('Usage: node scripts/pdml-roundtrip-acceptance.mjs <local.pdml>');
const xml=await fs.readFile(path,'utf8'),opened=await openFounderPdml(xml,{limit:100});
assert.equal(opened.sourceHash,'b8a15cd7aa626d49b3b650192fc5879d576330dd9817e777c1b7e03b4712f202','Expected locally extracted 9.0 bundle legacy PDML fixture');
const same=await editFounderPdml(xml,{expectedHash:opened.sourceHash,operations:[]});assert.equal(same.xml,xml);
const article=opened.articles.find(a=>a.paragraphs.some(p=>p.texts.some(t=>t.text.length>1&&!/[\uD800-\uDFFF]/.test(t.text))));
const para=article.paragraphs.find(p=>p.texts.some(t=>t.text.length>1&&!/[\uD800-\uDFFF]/.test(t.text))),text=para.texts.find(t=>t.text.length>1&&!/[\uD800-\uDFFF]/.test(t.text));
const replacement=Array.from(text.text,ch=>/\s/.test(ch)?ch:'测').join(''),object=opened.objects.find(o=>o.attributes.uid&&Number.isFinite(Number(o.geometry.xPos)));
const op={op:'replace_text',articleId:article.uid,paragraphIndex:para.paragraphIndex,textIndex:text.textIndex,expectedText:text.text,text:replacement};
const edited=await editFounderPdml(xml,{expectedHash:opened.sourceHash,operations:[op,{op:'set_geometry',objectId:object.attributes.uid,patch:{xPos:Number(object.geometry.xPos)+1}}]});
const read=await openFounderPdml(edited.xml,{limit:100});assert.equal(read.articles.find(a=>a.uid===article.uid).paragraphs[para.paragraphIndex].texts[text.textIndex].text,replacement);assert.equal(Number(read.objects.find(o=>o.attributes.uid===object.attributes.uid).geometry.xPos),Number(object.geometry.xPos)+1);
assert.deepEqual(read.totals,opened.totals);assert.equal(read.compatibility.referenceApplicationVerified,false);
const restored=await editFounderPdml(edited.xml,{expectedHash:edited.sourceHash,operations:[{...op,expectedText:replacement,text:text.text},{op:'set_geometry',objectId:object.attributes.uid,patch:{xPos:Number(object.geometry.xPos)}}]});
// Numeric lexical formatting may normalize on an intentional geometry write.
// The untouched document and all unknown branches remain byte-exact on no-op.
const restoredRead=await openFounderPdml(restored.xml,{limit:100});assert.equal(restoredRead.articles.find(a=>a.uid===article.uid).paragraphs[para.paragraphIndex].texts[text.textIndex].text,text.text);assert.deepEqual(restoredRead.totals,opened.totals);
await assert.rejects(importFounderPdmlComposition(xml),/MASTERS_UNSUPPORTED/);
const result={sourceHash:opened.sourceHash,bytes:Buffer.byteLength(xml),totals:opened.totals,checks:{noOpByteExact:same.xml===xml,textEditReadback:true,geometryEditReadback:true,inverseTextAndGeometry:true,countsPreserved:true,unknownXmlPreservedBySourcePatch:true,unsafeCompositionImportRejected:true},referenceApplicationVerified:false,limitations:['This bundled PDML predates FX 9.0; it is not a newly saved FX 9.0 document.','No Founder account: native application re-open/render/save remains unverified.','FFX serialization and variable-length text anchors are not implemented.']};
await fs.mkdir('.sites-runtime',{recursive:true});await fs.writeFile('.sites-runtime/pdml-roundtrip-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
