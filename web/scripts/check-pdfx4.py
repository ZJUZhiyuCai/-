"""Independent pypdf/Pillow checks for Shuye's restricted PDF/X-4 writer.
This is NOT an exhaustive ISO 15930-7 conformance validator or certificate.
Usage: python check-pdfx4.py output.pdf [expected-output.icc]
"""
import sys, json, hashlib, io, argparse, xml.etree.ElementTree as ET
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream
from PIL import ImageCms
from pdfx_restricted_checks import additional_checks
sys.stdout.reconfigure(encoding='utf-8')

errors=[]; checks=[]
def check(ok, code):
    (checks if ok else errors).append(code)
def obj(value): return value.get_object() if hasattr(value,'get_object') else value
def contains(outer,inner): return outer[0]<=inner[0]<=inner[2]<=outer[2] and outer[1]<=inner[1]<=inner[3]<=outer[3]
def icc(stream,channels,code):
    stream=obj(stream); data=stream.get_data();check(stream.get('/N')==channels,code+'_N')
    check(len(data)>=132 and data[36:40]==b'acsp',code+'_HEADER')
    ImageCms.getOpenProfile(io.BytesIO(data))
    return data
def xmp_value(tree,ns,key):
    name='{'+ns+'}'+key
    for node in tree.iter():
        if name in node.attrib: return node.attrib[name]
        if node.tag==name: return ''.join(node.itertext()).strip()
    return None

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf');parser.add_argument('icc',nargs='?');parser.add_argument('--require-iso',action='store_true')
args=parser.parse_args();path=Path(args.pdf)
try:
    if path.stat().st_size>64*1024*1024:raise ValueError('INPUT_SIZE_LIMIT')
    reader=PdfReader(path,strict=True)
    check(not reader.is_encrypted,'UNENCRYPTED')
    root=reader.trailer['/Root']; info=reader.metadata or {}
    check(reader.pdf_header=='%PDF-1.6','HEADER_1_6')
    check(str(root.get('/Version','/1.6'))=='/1.6','CATALOG_VERSION_1_6')
    check(bool(info.get('/Title')) and bool(info.get('/Creator')),'TITLE_CREATOR')
    check(info.get('/Trapped') in ['/True','/False'],'TRAPPED')
    check(info.get('/GTS_PDFXVersion')=='PDF/X-4','INFO_PDFX4')
    check('/ID' in reader.trailer and len(reader.trailer['/ID'])==2,'TRAILER_ID')
    for name in ['/Encrypt','/OpenAction','/AA','/AcroForm','/Collection']:
        check(name not in root and name not in reader.trailer,'NO_'+name[1:])
    check('/JavaScript' not in obj(root.get('/Names',{})),'NO_JAVASCRIPT')
    check('/EmbeddedFiles' not in obj(root.get('/Names',{})),'NO_ATTACHMENTS')
    metadata=obj(root.get('/Metadata'));check(bool(metadata),'XMP_PRESENT')
    if metadata:
        tree=ET.fromstring(metadata.get_data())
        check(xmp_value(tree,'http://www.npes.org/pdfx/ns/id/','GTS_PDFXVersion')=='PDF/X-4','XMP_PDFX4')
        for key in ['DocumentID','InstanceID','VersionID']:
            check(bool(xmp_value(tree,'http://ns.adobe.com/xap/1.0/mm/',key)),'XMP_'+key)
        check(xmp_value(tree,'http://ns.adobe.com/pdf/1.3/','Trapped')==str(info.get('/Trapped',''))[1:],'XMP_TRAPPED_MATCH')
        check(xmp_value(tree,'http://ns.adobe.com/xap/1.0/','CreatorTool')==info.get('/Creator'),'XMP_CREATOR_MATCH')
        check(xmp_value(tree,'http://purl.org/dc/elements/1.1/','title')==info.get('/Title'),'XMP_TITLE_MATCH')
    intents=[obj(i) for i in root.get('/OutputIntents',[]) if obj(i).get('/S')=='/GTS_PDFX']
    check(len(intents)==1,'ONE_PDFX_OUTPUT_INTENT')
    if intents:
        intent=intents[0];check(bool(intent.get('/OutputConditionIdentifier')) and bool(intent.get('/Info')),'OUTPUT_CONDITION')
        data=icc(intent['/DestOutputProfile'],4,'OUTPUT_ICC')
        check(data[12:16]==b'prtr' and data[16:20]==b'CMYK','OUTPUT_CMYK_PRINTER')
        if args.icc: check(hashlib.sha256(data).digest()==hashlib.sha256(Path(args.icc).read_bytes()).digest(),'EXACT_OUTPUT_ICC')
    
    seen=set()
    def resources(res,label):
        res=obj(res);colors=obj(res.get('/ColorSpace',{}))
        def color(space,code):
            space=obj(space)
            if space=='/DeviceRGB':
                check('/DefaultRGB' in colors,code+'_RGB_CALIBRATED')
            elif isinstance(space,list) and space:
                if space[0]=='/ICCBased': icc(space[1],obj(space[1]).get('/N'),code)
                elif space[0]=='/Separation': color(space[2],code+'_ALTERNATE')
                elif space[0]=='/Indexed': color(space[1],code+'_INDEXED')
        for key,space in colors.items(): color(space,label+str(key))
        for key,font in obj(res.get('/Font',{})).items():
            font=obj(font);fontList=[obj(f) for f in font['/DescendantFonts']] if '/DescendantFonts' in font else [font]
            for f in fontList:
                desc=obj(f.get('/FontDescriptor',{}));embedded=next((obj(desc[k]) for k in ['/FontFile','/FontFile2','/FontFile3'] if k in desc),None)
                check(embedded is not None,label+str(key)+'_EMBEDDED')
                if embedded is not None:
                    b=embedded.get_data();check(len(b)>32,label+str(key)+'_FONT_DATA')
                    if b[:4]==b'OTTO': check('/FontFile3' in desc and embedded.get('/Subtype')=='/OpenType',label+str(key)+'_OTF_WRAPPER')
        for key,x in obj(res.get('/XObject',{})).items():
            x=obj(x);ident=id(x)
            if ident in seen:continue
            seen.add(ident)
            if x.get('/Subtype')=='/Image': color(x.get('/ColorSpace'),label+str(key))
            if '/Resources' in x: resources(x['/Resources'],label+str(key))
    
    for i,page in enumerate(reader.pages):
        label=f'PAGE_{i+1}'
        check(('/TrimBox' in page)^('/ArtBox' in page),label+'_EXACTLY_ONE_TRIM_ART')
        trim=page.get('/TrimBox',page.get('/ArtBox',page.mediabox));bleed=page.get('/BleedBox',page.mediabox)
        check(contains(page.mediabox,bleed) and contains(bleed,trim),label+'_BOX_CONTAINMENT')
        check(not page.get('/Annots'),label+'_NO_ANNOTATIONS')
        res=page.get('/Resources',{});resources(res,label)
        colors=obj(obj(res).get('/ColorSpace',{}))
        for operands,operator in ContentStream(page.get_contents(),reader).operations:
            if operator in [b'rg',b'RG']: check('/DefaultRGB' in colors,label+'_RGB_OPERATORS_CALIBRATED')
        group=obj(page.get('/Group',{}))
        if group:check(group.get('/CS')=='/DeviceCMYK',label+'_CMYK_BLEND_SPACE')
    additional_checks(reader,check)
except Exception as error:
    check(False,'PARSER_OR_STRUCTURE_ERROR:'+type(error).__name__+':'+str(error)[:240])
report={'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None,'profile':'shuye-restricted-pdfx4-v2','checksPassed':len(checks),'errors':errors,'passed':not errors,'isoConformanceValidated':False,'releaseGatePassed':False,'scope':'restricted-writer structural checks; not full ISO PDF/X certification','unverified':['Complete ISO 15930-7:2010 clause-by-clause requirements','All PDF 1.6 syntax, operator semantics and implementation limits','Used glyph/CID/CMap mapping, metrics and glyph program validity','Full XMP/RDF type and PDF/X metadata semantic requirements','ICC numerical correctness and printing-condition suitability','All transparency, overprint, optional-content and colorant rules','Independent ISO PDF/X-4 validator report bound to this PDF SHA-256']}
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(1 if errors else 2 if args.require_iso else 0)
