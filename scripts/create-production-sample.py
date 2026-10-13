"""Build original merged-table/ruby PDF and a saddle-stitch proof."""
import sys,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from publishing import render_pdf
from print_production import process_pdf
doc=json.loads((root/'examples/merged-table.shuye.json').read_text(encoding='utf-8'))
doc['blocks'].insert(1,dict(id='ruby-sample',type='paragraph',text='中文排版应当保留结构。手工注音用于校正多音字，导出时保持在基文上方。',ruby=[dict(start=0,end=2,text='zhōng wén'),dict(start=2,end=4,text='pái bǎn')]))
(root/'examples/ruby-and-table.shuye.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding='utf-8')
out=root/'output/pdf';out.mkdir(parents=True,exist_ok=True)
result=render_pdf(doc);(out/'ruby-and-table.pdf').write_bytes(result['pdf'])
production=process_pdf(result['pdf'],dict(booklet=True,cropMarks=True,bleedMm=3))
(out/'ruby-and-table-booklet.pdf').write_bytes(production['pdf'])
(out/'production-report.json').write_text(json.dumps(production['report'],ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:production['report'][k]for k in ['sourcePages','outputPages','blankPages','imposition']},ensure_ascii=False))
