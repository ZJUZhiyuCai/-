"""Independent extraction/geometry oracle for rich-http-acceptance.mjs's fixture."""
import sys,json,re,hashlib
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
sys.stdout.reconfigure(encoding='utf-8')
path=Path(sys.argv[1]);reader=PdfReader(path)
body=[];notes=[];continuations=0;char_count=0
with pdfplumber.open(path) as pdf:
    for page in pdf.pages:
        # The fixture has a 110 x 95 mm frame at (20,20), with 9 mm export margin.
        left=29*72/25.4;top=29*72/25.4;right=(29+110)*72/25.4;bottom=(29+95)*72/25.4
        for c in page.chars:
            assert c['x0']>=left-1 and c['x1']<=right+1 and c['top']>=top-2 and c['bottom']<=bottom+2,('glyph outside frame',page.page_number,c)
            char_count+=1
        separators=[r for r in page.rects if abs(r['height']-.4)<.01 and abs(r['width']-50)<.01]
        if separators:
            cut=separators[0]['bottom']
            note=''.join((page.crop((left,cut,right,bottom)).extract_text() or '').split())
            continuations+=note.count('（续）')
            notes.append(re.sub(r'^\[\d+\](?:（续）)?','',note))
            body.append(''.join((page.crop((left,top,right,cut)).extract_text() or '').split()))
        else:body.append(''.join((page.extract_text() or '').split()))
note_text=''.join(notes);body_text=''.join(body)
assert note_text=='这是正文注释。'+'这是跨页表格中的长脚注。'*180,('note text differs',len(note_text))
assert continuations>0
for i in range(30):assert body_text.count('第'+str(i)+'行：')==1,('row missing or duplicated',i)
assert body_text.count('尾注必须排在文字流最后。')==1
assert body_text.count('表后段落，原文完整。')==1
print(json.dumps({'passed':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':len(reader.pages),'glyphBoundsChecked':char_count,'bodyRows':30,'longFootnoteSentences':180,'continuationLabels':continuations,'noteSourceConserved':True,'endnoteAndFinalParagraph':True},ensure_ascii=False,indent=2))
