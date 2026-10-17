"""Mutation regression suite for restricted PDF/X checks. Not ISO certification.
Every negative must fail for its intended rule, not merely parser failure.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject as N, ArrayObject as A, NumberObject as I, FloatObject as F, DictionaryObject as D, DecodedStreamObject, TextStringObject as S
import subprocess,sys,json
sys.stdout.reconfigure(encoding='utf-8')
source=Path(sys.argv[1]);checker=Path(__file__).with_name('check-pdfx4.py');results=[]

def run(path,*args):
    p=subprocess.run([sys.executable,str(checker),str(path),*args],capture_output=True,text=True,encoding='utf-8')
    return p.returncode,json.loads(p.stdout)

def dictionary(**kw):return D({N('/'+k):v for k,v in kw.items()})
def stream(data,**kw):
    s=DecodedStreamObject();s.set_data(data);s.update(dictionary(**kw));return s

def mutate(writer,name):
    root=writer.root_object;page=writer.pages[0];res=page['/Resources']
    def image():
        objects=res.setdefault(N('/XObject'),D())
        for x in objects.values():
            if x.get_object().get('/Subtype')=='/Image':return x.get_object()
        # Text-only books still need image-related negative coverage. Add an
        # original valid grayscale resource before applying the specific defect.
        value=stream(b'\x80',Type=N('/XObject'),Subtype=N('/Image'),ColorSpace=N('/DeviceGray'),Width=I(1),Height=I(1),BitsPerComponent=I(8))
        objects[N('/MutationImage')]=writer._add_object(value)
        return value
    def font():return next(iter(res['/Font'].values())).get_object()['/DescendantFonts'][0].get_object()['/FontDescriptor'].get_object()
    if name=='missing_intent':del root['/OutputIntents'];return 'ONE_PDFX_OUTPUT_INTENT'
    if name=='missing_xmp':del root['/Metadata'];return 'XMP_PRESENT'
    if name=='missing_trim':del page['/TrimBox'];return 'EXACTLY_ONE_TRIM_ART'
    if name=='both_trim_art':page[N('/ArtBox')]=page['/TrimBox'];return 'EXACTLY_ONE_TRIM_ART'
    if name=='invalid_bleed':page[N('/BleedBox')]=A([I(-999),I(-999),I(9999),I(9999)]);return 'BOX_CONTAINMENT'
    if name=='invalid_crop':page[N('/CropBox')]=A([I(0),I(0),I(1),I(1)]);return 'CROP_CONTAINMENT'
    if name=='reversed_trim':page[N('/TrimBox')]=A([I(20),I(20),I(10),I(10)]);return 'CROP_CONTAINMENT'
    if name=='uncalibrated_image':image()[N('/ColorSpace')]=N('/DeviceRGB');return 'RGB_CALIBRATED'
    if name=='fake_default_rgb':
        image()[N('/ColorSpace')]=N('/DeviceRGB');res.setdefault(N('/ColorSpace'),D())[N('/DefaultRGB')]=N('/DeviceRGB');return 'RGB_CALIBRATED'
    if name=='bad_image_bits':image()[N('/BitsPerComponent')]=I(7);return 'IMAGE_BITS'
    if name=='bad_smask':image()[N('/SMask')]=writer._add_object(stream(b'\x00',Type=N('/XObject'),Subtype=N('/Image'),ColorSpace=N('/DeviceRGB'),Width=I(1),Height=I(1),BitsPerComponent=I(8)));return 'SMASK'
    if name=='font_not_embedded':
        f=font()
        for k in ['/FontFile','/FontFile2','/FontFile3']:
            if k in f:del f[k]
        return 'EMBEDDED'
    if name=='broken_font':
        f=font();key=next(k for k in ['/FontFile','/FontFile2','/FontFile3'] if k in f);old=f[key];replacement=stream(b'not a font'*40)
        if '/Subtype' in old:replacement[N('/Subtype')]=old['/Subtype']
        f[N(key)]=writer._add_object(replacement);return 'FONT_PROGRAM_PARSES'
    if name=='nested_rgb':
        form=stream(b'1 0 0 rg 0 0 10 10 re f',Type=N('/XObject'),Subtype=N('/Form'),BBox=A([I(0),I(0),I(10),I(10)]),Resources=D())
        res.setdefault(N('/XObject'),D())[N('/BadForm')]=writer._add_object(form);return 'BadForm_RGB_OPERATORS_RGB_CALIBRATED'
    if name=='nested_javascript':
        res[N('/HiddenAction')]=dictionary(S=N('/JavaScript'),JS=S('app.alert(1)'));return 'FORBIDDEN_JS'
    if name=='external_stream':image()[N('/F')]=S('https://invalid.example/image.raw');return 'NO_EXTERNAL_STREAM'
    if name=='external_reference':image()[N('/OPI')]=D();return 'FORBIDDEN_OPI'
    if name=='invalid_icc_tags':
        intent=root['/OutputIntents'][0].get_object();data=bytearray(intent['/DestOutputProfile'].get_data());data[136:140]=(len(data)+100).to_bytes(4,'big');intent[N('/DestOutputProfile')]=writer._add_object(stream(bytes(data),N=I(4)));return 'ICC_TAG_BOUNDS'
    if name=='icc_channels_mismatch':root['/OutputIntents'][0].get_object()['/DestOutputProfile'][N('/N')]=I(3);return 'OUTPUT_ICC_N'
    if name=='wrong_xmp':
        old=root['/Metadata'].get_data().replace(b'<pdfxid:GTS_PDFXVersion>PDF/X-4',b'<pdfxid:GTS_PDFXVersion>PDF/X-3');root[N('/Metadata')]=writer._add_object(stream(old,Type=N('/Metadata'),Subtype=N('/XML')));return 'XMP_PDFX4'
    if name=='catalog_pdf17':root[N('/Version')]=N('/1.7');return 'CATALOG_VERSION_1_6'
    if name=='page_pdf17':page[N('/UserUnit')]=I(2);return 'NO_PDF17_FEATURES'
    if name=='unbalanced_q':page[N('/Contents')]=writer._add_object(stream(b'Q'));return 'GRAPHICS_STACK_UNDERFLOW'
    if name=='missing_resource':page[N('/Contents')]=writer._add_object(stream(b'/Absent Do'));return 'XObject_RESOURCE_EXISTS'
    if name=='unbalanced_text':page[N('/Contents')]=writer._add_object(stream(b'BT'));return 'TEXT_BALANCED'
    if name=='invalid_alpha':res.setdefault(N('/ExtGState'),D())[N('/Invalid')]=dictionary(ca=F(1.5));return 'ALPHA_RANGE'
    if name=='transfer_function':res.setdefault(N('/ExtGState'),D())[N('/Invalid')]=dictionary(TR=N('/Identity'));return 'NO_TR_POLICY'
    if name=='optional_content':root[N('/OCProperties')]=D();return 'NO_OPTIONAL_CONTENT_POLICY'
    if name=='encryption':writer.encrypt('test-only');return 'UNENCRYPTED'
    raise ValueError(name)

code,baseline=run(source);assert code==0 and baseline['passed'],baseline
code,gate=run(source,'--require-iso');assert code==2 and not gate['releaseGatePassed'] and not gate['isoConformanceValidated']
names=['missing_intent','missing_xmp','missing_trim','both_trim_art','invalid_bleed','invalid_crop','reversed_trim','uncalibrated_image','fake_default_rgb','bad_image_bits','bad_smask','font_not_embedded','broken_font','nested_rgb','nested_javascript','external_stream','external_reference','invalid_icc_tags','icc_channels_mismatch','wrong_xmp','catalog_pdf17','page_pdf17','unbalanced_q','missing_resource','unbalanced_text','invalid_alpha','transfer_function','optional_content','encryption']
with TemporaryDirectory(prefix='pdfx-negatives-',dir=source.parent) as tmp:
    for name in names:
        writer=PdfWriter(clone_from=PdfReader(source));writer.pdf_header='%PDF-1.6';expected=mutate(writer,name);target=Path(tmp)/(name+'.pdf');writer.write(target)
        code,report=run(target)
        assert code==1 and any(expected in item for item in report['errors']), {'mutation':name,'expected':expected,'report':report}
        results.append({'mutation':name,'rejected':True,'expectedRule':expected,'errors':report['errors']})
print(json.dumps({'baselinePassed':True,'isoGateFailsClosed':True,'mutationCount':len(results),'results':results},ensure_ascii=False,indent=2))
