"""Isolated LibreOffice UNO process, fixed operations only; no document macros."""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import zipfile
import re
from copy import deepcopy
from lxml import etree as ET

def compatibility_copy(source,target):
    """Adapt InkQ's literal-run workaround for Writer; keep editable OMML intact."""
    m='http://schemas.openxmlformats.org/officeDocument/2006/math';patches=0
    with zipfile.ZipFile(source) as z:parts={n:z.read(n) for n in z.namelist()}
    for name in list(parts):
        if not name.startswith('word/') or not name.endswith('.xml'):continue
        root=ET.fromstring(parts[name]);before=''.join(root.itertext());changed=False
        for run in list(root.findall('.//{'+m+'}oMath//{'+m+'}r')):
            t=run.find('{'+m+'}t')
            if t is None:continue
            value=t.text or ''
            if len(value)>1 and any(c in value for c in '|#"[]'):
                for piece in filter(None,re.split(r'([|#"\[\]])',value)):
                    atom=deepcopy(run);atom.find('{'+m+'}t').text=piece;run.addprevious(atom)
                run.getparent().remove(run);changed=True
        for run in root.findall('.//{'+m+'}oMath//{'+m+'}r'):
            value=''.join(t.text or '' for t in run.findall('{'+m+'}t'))
            if not (any(c in value for c in '|#"[]') or re.search(r'[\u3400-\u9fff]',value) or value.strip() in {'max','min','in','⋯','⋱','⋮','=','<','>','+','-','−','*'}):continue
            pr=run.find('{'+m+'}rPr')
            if pr is None:pr=ET.Element('{'+m+'}rPr');run.insert(0,pr)
            lit=pr.find('{'+m+'}lit')
            if lit is None:lit=ET.SubElement(pr,'{'+m+'}lit')
            lit.set('{'+m+'}val','1');patches+=1;changed=True
        for delimiter in root.findall('.//{'+m+'}d'):
            slots=delimiter.findall('{'+m+'}e')
            if len(slots)!=1:continue
            slot=slots[0];value=''.join(t.text or '' for t in slot.findall('.//{'+m+'}t'))
            if len(re.findall(r'[\u3400-\u9fff]',value))<40:continue
            atoms=[]
            for child in slot:
                text=child.find('{'+m+'}t') if child.tag=='{'+m+'}r' else None
                if text is not None:
                    for ch in text.text or '':
                        atom=deepcopy(child);atom.find('{'+m+'}t').text=ch;atoms.append(atom)
                else:atoms.append(deepcopy(child))
            array=ET.Element('{'+m+'}eqArr');row=ET.SubElement(array,'{'+m+'}e');width=0
            for atom in atoms:
                cost=sum(2 if ord(c)>0x2fff else 1 for t in atom.findall('.//{'+m+'}t') for c in t.text or '')
                if width and width+cost>70:row=ET.SubElement(array,'{'+m+'}e');width=0
                row.append(atom);width+=cost
            if len(array)>1:
                for child in list(slot):slot.remove(child)
                slot.append(array);changed=True;patches+=1
        if ''.join(root.itertext())!=before:raise ValueError('WORD_RENDER_OVERLAY_TEXT_CHANGED')
        if changed:parts[name]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in parts.items():z.writestr(name,data)
    return {'literalMathRunPatches':patches,'sourceCharactersUnchanged':True}

PAYLOAD=r'''
import json,sys,time,uuid,subprocess,re
from pathlib import Path
import uno
from com.sun.star.beans import PropertyValue
def pv(k,v):
 p=PropertyValue();p.Name=k;p.Value=v;return p
source,output,profile,report=map(Path,sys.argv[1:5]);pipe='shuye_'+uuid.uuid4().hex
process=subprocess.Popen(['libreoffice','-env:UserInstallation='+profile.as_uri(),'--headless','--norestore','--nologo','--accept=pipe,name='+pipe+';urp;'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
doc=None
try:
 local=uno.getComponentContext();resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
 deadline=time.monotonic()+30
 while True:
  try:ctx=resolver.resolve('uno:pipe,name='+pipe+';urp;StarOffice.ComponentContext');break
  except Exception:
   if time.monotonic()>deadline:raise RuntimeError('WORD_RENDER_CONNECT_TIMEOUT')
   time.sleep(.1)
 desktop=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
 # LibreOffice MacroExecMode.NEVER_EXECUTE is 0; 4 means ALWAYS_EXECUTE_NO_WARN.
 doc=desktop.loadComponentFromURL(source.as_uri(),'_blank',0,(pv('Hidden',True),pv('ReadOnly',True),pv('MacroExecutionMode',0),pv('UpdateDocMode',0)))
 if doc is None:raise RuntimeError('WORD_RENDER_LOAD_FAILED')
 objects=doc.getEmbeddedObjects()
 for name in objects.ElementNames:
  embedded=objects.getByName(name);model=embedded.Model
  if model is None or not model.getPropertySetInfo().hasPropertyByName('Formula'):continue
  formula=model.Formula
  if '"""' in formula:
   symbol=uno.createUnoStruct('com.sun.star.formula.SymbolDescriptor');symbol.sName='shuyeQuote';symbol.sExportName='shuyeQuote';symbol.sSymbolSet='Shuye render';symbol.nCharacter=34;symbol.sFontName='FreeSerif';model.Symbols=tuple(model.Symbols)+(symbol,);formula=formula.replace('"""','%shuyeQuote')
  if re.search(r'[\u3400-\u9fff]',formula):model.FontNameText='Noto Serif CJK SC';model.FontTextIsItalic=False
  size=embedded.Anchor.CharHeight
  if not isinstance(size,(int,float)) or not 6<=size<=24:size=10.5
  model.Formula='size '+str(size)+' {'+formula+'}';embedded.setSize(model.getVisualAreaSize(1))
 for iteration in range(3):
  doc.refresh();doc.getTextFields().refresh()
  indexes=doc.getDocumentIndexes()
  for i in range(indexes.Count):indexes.getByIndex(i).update()
 doc.storeToURL(output.as_uri(),(pv('FilterName','writer_pdf_Export'),pv('Overwrite',True),pv('FilterData',uno.Any('[]com.sun.star.beans.PropertyValue',(pv('ExportBookmarksToPDFDestination',True),pv('IsSkipEmptyPages',True),pv('UseLosslessCompression',True),pv('ReduceImageResolution',False))))))
 bookmarks=doc.getBookmarks();cursor=doc.getCurrentController().getViewCursor();pages={}
 for name in bookmarks.ElementNames:
  if name.startswith('article_'):
   cursor.gotoRange(bookmarks.getByName(name).getAnchor(),False);pages[name]=cursor.Page
 report.write_text(json.dumps({'bookmarks':pages,'renderer':'LibreOffice Writer','fieldsUpdated':True}))
finally:
 if doc is not None:doc.close(True)
 process.terminate()
 try:process.wait(timeout=5)
 except subprocess.TimeoutExpired:process.kill();process.wait()
'''

def render(source,output):
    source,output=Path(source).resolve(),Path(output).resolve()
    with tempfile.TemporaryDirectory(prefix='shuye-word-') as temp:
        temp=Path(temp);script=temp/'render.py';script.write_text(PAYLOAD,encoding='utf-8');report=temp/'render.json'
        render_source=temp/'render.docx';overlay=compatibility_copy(source,render_source)
        result=subprocess.run([os.environ.get('SHUYE_UNO_PYTHON','/usr/bin/python3'),str(script),str(render_source),str(output),str(temp/'profile'),str(report)],capture_output=True,timeout=240)
        if result.returncode or not output.is_file():raise ValueError('WORD_RENDER_FAILED: '+result.stderr.decode('utf-8','replace')[-1500:])
        from pypdf import PdfReader
        reader=PdfReader(output);measured=json.loads(report.read_text());measured['writerBookmarks']=measured['bookmarks']
        measured['bookmarks']={}
        for name,dest in reader.named_destinations.items():
            # Writer PDF names encode '_' as 5F (and pypdf may expose '/').
            match=re.fullmatch(r'/?article(?:_|5F)(\d+)',name)
            if match:measured['bookmarks']['article_'+match[1]]=reader.get_destination_page_number(dest)+1
        if set(measured['bookmarks'])!=set(measured['writerBookmarks']):raise ValueError('PDF_BOOKMARK_COVERAGE_MISMATCH')
        return {**measured,'compatibility':overlay}
