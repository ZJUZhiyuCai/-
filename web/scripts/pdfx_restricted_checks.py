"""Additional independent checks for the restricted Shuye writer, not ISO certification."""
import io, math, struct, xml.etree.ElementTree as ET
from fontTools.cffLib import CFFFontSet
from fontTools.ttLib import TTFont
from pypdf.generic import ContentStream, StreamObject

def obj(v): return v.get_object() if hasattr(v, 'get_object') else v

def additional_checks(reader, check):
    visited=set(); resource_stack=set(); resource_seen=set()
    def graph(v, path='ROOT', depth=0):
        v=obj(v)
        if not isinstance(v,(dict,list)) or id(v) in visited:return
        if depth>100 or len(visited)>100000:raise ValueError('OBJECT_GRAPH_LIMIT')
        visited.add(id(v))
        if isinstance(v,dict):
            for key in ('/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/AcroForm','/Collection','/OPI','/Ref','/Alternates','/PresSteps','/NeedsRendering','/RichMediaContent'):
                if key in v:check(False,path+'_FORBIDDEN_'+key[1:])
            if v.get('/Type') in ('/Filespec','/EmbeddedFile','/Action') or v.get('/S') in ('/JavaScript','/Launch','/URI','/GoToR','/SubmitForm'):
                check(False,path+'_EXTERNAL_OR_ACTIVE_OBJECT')
            if isinstance(v,StreamObject):check('/F' not in v and '/FFilter' not in v and '/FDecodeParms' not in v,path+'_NO_EXTERNAL_STREAM')
            for key,child in v.items():graph(child,path+str(key),depth+1)
        else:
            for index,child in enumerate(v):graph(child,path+'/'+str(index),depth+1)
    def valid_box(v):return isinstance(v,list) and len(v)==4 and all(isinstance(n,(int,float)) and math.isfinite(float(n)) for n in v) and v[0]<v[2] and v[1]<v[3]
    def contains(a,b):return valid_box(a) and valid_box(b) and a[0]<=b[0]<b[2]<=a[2] and a[1]<=b[1]<b[3]<=a[3]
    def profile(stream,label):
        stream=obj(stream);data=stream.get_data()
        if len(data)<132:check(False,label+'_ICC_HEADER');return
        check(int.from_bytes(data[:4],'big')==len(data),label+'_ICC_DECLARED_SIZE')
        check(data[8] in (2,4),label+'_ICC_VERSION')
        check(data[20:24] in (b'XYZ ',b'Lab '),label+'_ICC_PCS')
        check({b'GRAY':1,b'RGB ':3,b'CMYK':4}.get(data[16:20])==stream.get('/N'),label+'_ICC_CHANNELS_MATCH')
        count=int.from_bytes(data[128:132],'big');valid=count<=4096 and 132+12*count<=len(data)
        if valid:
            for index in range(count):
                _,offset,length=struct.unpack_from('>4sII',data,132+index*12)
                valid &= length>=8 and offset>=132+count*12 and offset+length<=len(data)
        check(valid,label+'_ICC_TAG_BOUNDS')
    def color(v,colors,label,depth=0):
        v=obj(v)
        if depth>16:check(False,label+'_COLORSPACE_CYCLE');return
        if v in ('/DeviceGray','/DeviceCMYK'):return
        if v=='/DeviceRGB':
            default=obj(colors.get('/DefaultRGB'))
            check(isinstance(default,list) and default and default[0] in ('/CalRGB','/ICCBased'),label+'_RGB_CALIBRATED');return
        if isinstance(v,str) and v in colors:color(colors[v],colors,label,depth+1);return
        if isinstance(v,list) and v:
            if v[0]=='/ICCBased' and len(v)==2:profile(v[1],label);return
            if v[0]=='/Separation' and len(v)==4:
                color(v[2],colors,label+'_ALTERNATE',depth+1);tint=obj(v[3])
                check(tint.get('/FunctionType')==2 and len(tint.get('/C0',[]))==4 and len(tint.get('/C1',[]))==4 and tint.get('/N')==1,label+'_TINT_FUNCTION_POLICY');return
            if v[0]=='/Indexed' and len(v)==4:color(v[1],colors,label+'_INDEXED',depth+1);return
        check(False,label+'_UNSUPPORTED_COLORSPACE_POLICY')
    def fonts(v,label):
        v=obj(v);check(v.get('/Subtype')=='/Type0',label+'_TYPE0_POLICY');check(v.get('/Encoding')=='/Identity-H',label+'_IDENTITY_H_POLICY');check('/ToUnicode' in v,label+'_TOUNICODE_POLICY')
        descendants=obj(v.get('/DescendantFonts',[]));check(len(descendants)==1,label+'_ONE_DESCENDANT')
        for font in descendants:
            font=obj(font);desc=obj(font.get('/FontDescriptor',{}));keys=[k for k in ('/FontFile','/FontFile2','/FontFile3') if k in desc]
            check(len(keys)==1,label+'_ONE_EMBEDDED_PROGRAM')
            if len(keys)!=1:continue
            key=keys[0];stream=obj(desc[key]);data=stream.get_data()
            try:
                if key=='/FontFile3' and stream.get('/Subtype')=='/CIDFontType0C':
                    parsed=CFFFontSet();parsed.decompile(io.BytesIO(data),None);check(font.get('/Subtype')=='/CIDFontType0',label+'_CFF_WRAPPER')
                else:
                    parsed=TTFont(io.BytesIO(data),lazy=False)
                    if data[:4]==b'OTTO':check(key=='/FontFile3' and stream.get('/Subtype')=='/OpenType' and font.get('/Subtype')=='/CIDFontType0',label+'_OTF_WRAPPER')
                    else:check(key=='/FontFile2' and font.get('/Subtype')=='/CIDFontType2',label+'_TTF_WRAPPER')
                    parsed.close()
                check(True,label+'_FONT_PROGRAM_PARSES')
            except Exception:check(False,label+'_FONT_PROGRAM_PARSES')
    def resources(v,label,stream=None,depth=0):
        if depth>32:raise ValueError('RESOURCE_NESTING_LIMIT')
        res=obj(v);colors=obj(res.get('/ColorSpace',{}))
        if stream is not None:
            balance=0;text_balance=0
            for operands,operator in ContentStream(stream,reader).operations:
                if operator in (b'rg',b'RG'):color('/DeviceRGB',colors,label+'_RGB_OPERATORS')
                elif operator in (b'cs',b'CS'):color(operands[0],colors,label+'_CS')
                elif operator in (b'Do',b'Tf',b'gs'):
                    category={b'Do':'/XObject',b'Tf':'/Font',b'gs':'/ExtGState'}[operator];check(operands[0] in obj(res.get(category,{})),label+'_'+category[1:]+'_RESOURCE_EXISTS')
                elif operator==b'q':balance+=1
                elif operator==b'Q':balance-=1;check(balance>=0,label+'_GRAPHICS_STACK_UNDERFLOW')
                elif operator==b'BT':text_balance+=1;check(text_balance==1,label+'_TEXT_NESTING')
                elif operator==b'ET':text_balance-=1;check(text_balance==0,label+'_TEXT_END')
                elif operator in (b'INLINE IMAGE',b'sh',b'BDC',b'MP',b'DP'):check(False,label+'_UNSUPPORTED_OPERATOR_POLICY_'+operator.decode())
            check(balance==0,label+'_GRAPHICS_BALANCED');check(text_balance==0,label+'_TEXT_BALANCED')
        if id(res) in resource_stack:check(False,label+'_RESOURCE_CYCLE');return
        if id(res) in resource_seen:return
        resource_stack.add(id(res));resource_seen.add(id(res))
        for name,space in colors.items():color(space,colors,label+str(name))
        for name,font in obj(res.get('/Font',{})).items():fonts(font,label+str(name))
        for name in ('/Pattern','/Shading','/Properties'):check(not res.get(name),label+'_NO_'+name[1:]+'_POLICY')
        for name,state in obj(res.get('/ExtGState',{})).items():
            state=obj(state)
            for key in ('/TR','/TR2','/HT','/BG','/BG2','/UCR','/UCR2'):check(key not in state,label+str(name)+'_NO_'+key[1:]+'_POLICY')
            check(state.get('/BM','/Normal')=='/Normal',label+str(name)+'_NORMAL_BLEND_POLICY')
            for key in ('/ca','/CA'):check(isinstance(state.get(key,1),(int,float)) and 0<=state.get(key,1)<=1,label+str(name)+key+'_ALPHA_RANGE')
        for name,value in obj(res.get('/XObject',{})).items():
            value=obj(value);code=label+str(name)
            if value.get('/Subtype')=='/Image':
                check(value.get('/Width',0)>0 and value.get('/Height',0)>0,code+'_IMAGE_DIMENSIONS');check(value.get('/BitsPerComponent') in (1,2,4,8,16),code+'_IMAGE_BITS');color(value.get('/ColorSpace'),colors,code)
                if '/SMask' in value:
                    mask=obj(value['/SMask']);check(mask.get('/Subtype')=='/Image' and mask.get('/ColorSpace')=='/DeviceGray' and mask.get('/Width')==value.get('/Width') and mask.get('/Height')==value.get('/Height'),code+'_SMASK')
            elif value.get('/Subtype')=='/Form':
                check(valid_box(value.get('/BBox')),code+'_FORM_BBOX');group=obj(value.get('/Group',{}))
                if group:check(group.get('/CS')=='/DeviceCMYK',code+'_CMYK_BLEND_SPACE')
                resources(value.get('/Resources',res),code,value,depth+1)
            else:check(False,code+'_UNSUPPORTED_XOBJECT_POLICY')
        resource_stack.remove(id(res))
    graph(reader.trailer);root=reader.trailer['/Root']
    check('/Extensions' not in root,'NO_EXTENSIONS_POLICY');check('/OCProperties' not in root,'NO_OPTIONAL_CONTENT_POLICY')
    metadata=obj(root.get('/Metadata'))
    if metadata is not None:
        check(metadata.get('/Type')=='/Metadata' and metadata.get('/Subtype')=='/XML','XMP_STREAM_TYPE')
        data=metadata.get_data();check(b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper(),'XMP_NO_ENTITIES_POLICY')
        tree=ET.fromstring(data);producer=tree.find('.//{http://ns.adobe.com/pdf/1.3/}Producer')
        check(producer is not None and producer.text==(reader.metadata or {}).get('/Producer'),'XMP_PRODUCER_MATCH')
    for intent in root.get('/OutputIntents',[]):
        intent=obj(intent)
        if intent.get('/S')=='/GTS_PDFX' and '/DestOutputProfile' in intent:profile(intent['/DestOutputProfile'],'OUTPUT')
    for index,page in enumerate(reader.pages):
        label=f'PAGE_{index+1}';trim=page.get('/TrimBox',page.get('/ArtBox',page.mediabox));crop=page.get('/CropBox',page.mediabox)
        check(contains(page.mediabox,crop) and contains(crop,trim),label+'_CROP_CONTAINMENT')
        check('/OutputIntents' not in page and '/UserUnit' not in page,label+'_NO_PDF17_FEATURES')
        resources(page.get('/Resources',{}),label,page.get_contents())
