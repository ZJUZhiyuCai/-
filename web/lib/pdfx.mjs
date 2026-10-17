import {PDFName,PDFString,PDFHexString} from 'pdf-lib';
import {validateOutputIcc} from './icc.mjs';
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export async function setPrintOutputIntent(pdf,profile,{pdfX=false,condition='Custom CMYK printing condition'}={}){
 const metadata=validateOutputIcc(profile),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',profile)),v=>v.toString(16).padStart(2,'0')).join('');
 const profileRef=pdf.context.register(pdf.context.flateStream(profile,{N:4}));
 const intent=pdf.context.register(pdf.context.obj({Type:'OutputIntent',S:'GTS_PDFX',OutputConditionIdentifier:PDFString.of(condition),Info:PDFString.of(condition),DestOutputProfile:profileRef}));
 pdf.catalog.set(PDFName.of('OutputIntents'),pdf.context.obj([intent]));
 if(pdfX){
  pdf.setCreator(pdf.getCreator()||'Shuye composition export');pdf.setProducer(pdf.getProducer()||'Shuye / pdf-lib');
  for(const page of pdf.getPages())page.node.set(PDFName.of('Group'),pdf.context.obj({Type:'Group',S:'Transparency',CS:'DeviceCMYK',I:true,K:false}));
  const info=pdf.context.lookup(pdf.context.trailerInfo.Info);info.set(PDFName.of('GTS_PDFXVersion'),PDFString.of('PDF/X-4'));info.set(PDFName.of('Trapped'),PDFName.of('False'));
  const now=new Date().toISOString(),id=crypto.randomUUID();pdf.context.trailerInfo.ID=pdf.context.obj([PDFHexString.of(id.replaceAll('-','')),PDFHexString.of(crypto.randomUUID().replaceAll('-',''))]);
  const xmp=`<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:dc="http://purl.org/dc/elements/1.1/"><pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion><pdf:Trapped>False</pdf:Trapped><pdf:Producer>${xml(pdf.getProducer()||'Shuye')}</pdf:Producer><xmp:CreatorTool>${xml(pdf.getCreator()||'Shuye')}</xmp:CreatorTool><xmp:CreateDate>${pdf.getCreationDate()?.toISOString()||now}</xmp:CreateDate><xmp:ModifyDate>${pdf.getModificationDate()?.toISOString()||now}</xmp:ModifyDate><xmp:MetadataDate>${now}</xmp:MetadataDate><xmpMM:VersionID>1</xmpMM:VersionID><xmpMM:DocumentID>uuid:${id}</xmpMM:DocumentID><xmpMM:InstanceID>uuid:${id}</xmpMM:InstanceID><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(pdf.getTitle()||'Shuye')}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  pdf.catalog.set(PDFName.of('Metadata'),pdf.context.register(pdf.context.stream(new TextEncoder().encode(xmp),{Type:'Metadata',Subtype:'XML'})));
 }
 return {...metadata,sha256,condition};
}
