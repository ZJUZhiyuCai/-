import hashlib
import base64
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
import zipfile
from lxml import etree as ET
from editable_docx import export_article,Writer,field,NS
from issue_export import verify_docx,word_contents,missing_figures,source_counts,verify_contents
from word_render import compatibility_copy
from docx_import import import_docx

PLAN={'title':'测试期刊','width':210,'height':285,'firstPage':31}
def record():
    source='<m:oMath xmlns:m="'+NS['m']+'"><m:r><m:t>x+1</m:t></m:r></m:oMath>'
    math={'id':'m1','text':'x+1','sourceOmml':source,'sourceSha256':hashlib.sha256(source.encode()).hexdigest()}
    return {'projectId':'p','revision':1,'document':{'title':'原稿','layout':{'columns':1},'journal':{'template':'cn-academic'},'blocks':[{'id':'p1','type':'paragraph','text':'😀甲[[math:m1]]乙[^n1]','inlineMath':[math],'marks':[{'start':2,'end':3,'bold':True}]},{'id':'t1','type':'table','rows':[['表头','数值'],['原始值','12.3']],'headerRows':1}], 'notes':[{'id':'n1','text':'作者注释'}]}}
class IssueTests(unittest.TestCase):
    def test_editable_math_text_table_and_native_footnote_survive_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'a.docx';r=record();counts=export_article(r,PLAN,path,31)
            self.assertEqual(counts,{**source_counts(r['document']),'notes':1})
            self.assertTrue(verify_docx(path,[r])['formulaSourceExact'])
            imported=import_docx(path.read_bytes())
            self.assertEqual(imported['notes'][0]['text'].strip(),'作者注释')
            self.assertEqual(next(b for b in imported['blocks'] if b['type']=='table')['rows'],r['document']['blocks'][1]['rows'])
            with zipfile.ZipFile(path) as z:
                root=ET.fromstring(z.read('word/document.xml'))
                self.assertTrue(root.xpath('//w:r[w:t="甲"]/w:rPr/w:b',namespaces=NS))
                self.assertEqual(root.xpath('string(//w:pgNumType/@w:start)',namespaces=NS),'31')
    def test_formula_mismatch_cannot_be_reported_as_editable(self):
        with tempfile.TemporaryDirectory() as d:
            r=record();r['document']['blocks'][0]['inlineMath'][0]['sourceSha256']='0'*64
            with self.assertRaisesRegex(ValueError,'OMML_SOURCE_REQUIRED'):export_article(r,PLAN,Path(d)/'a.docx',1)
    def test_text_mutation_is_detected_and_custom_note_marker_is_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'a.docx';r=record();r['document']['notes'][0]['marker']='*';export_article(r,PLAN,path,31)
            self.assertTrue(verify_docx(path,[r])['textSourceExact'])
            with zipfile.ZipFile(path) as z:
                parts={n:z.read(n) for n in z.namelist()};root=ET.fromstring(parts['word/document.xml'])
                self.assertEqual(root.xpath('string(//w:footnoteReference/@w:customMarkFollows)',namespaces=NS),'1')
            parts['word/document.xml']=parts['word/document.xml'].replace('原始值'.encode(),'篡改值'.encode())
            with zipfile.ZipFile(path,'w') as z:
                for n,data in parts.items():z.writestr(n,data)
            with self.assertRaisesRegex(ValueError,'TEXT_SOURCE_MISMATCH'):verify_docx(path,[r])
    def test_unsupported_layout_rejects_instead_of_silent_horizontal_conversion(self):
        with tempfile.TemporaryDirectory() as d:
            r=record();r['document']['layout']['writingMode']='vertical-rl'
            with self.assertRaisesRegex(ValueError,'VERTICAL_UNSUPPORTED'):export_article(r,PLAN,Path(d)/'a.docx',1)
    def test_cell_image_and_caption_roundtrip_without_interleaving_loss(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            r=record();out=BytesIO();Image.new('RGB',(20,20),'red').save(out,format='PNG')
            r['document']['blocks'].append({'id':'img','type':'image','src':'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode(),'width':50,'text':''})
            r['document']['blocks'][1]['cellImages']=[{'row':1,'col':0,'imageId':'img'}]
            path=Path(d)/'a.docx';export_article(r,PLAN,path,1);self.assertTrue(verify_docx(path,[r])['textSourceExact'])
            imported=import_docx(path.read_bytes());errors=[v for report in imported['importReports'] for v in report['diagnostics'] if v['severity']=='error'];self.assertEqual(errors,[])
            table=next(b for b in imported['blocks'] if b['type']=='table');self.assertEqual(table['rows'][1][0].strip(),'原始值');self.assertEqual(len(table['cellImages']),1)
    def test_recomputed_contents_keeps_page_reference_field(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'toc.docx';w=Writer(PLAN);field(w.doc.add_paragraph(),'PAGEREF article_1 \\h','1');w.save(path);word_contents(path,{'article_1':31})
            with zipfile.ZipFile(path) as z:
                xml=z.read('word/document.xml');self.assertIn(b'PAGEREF article_1',xml);self.assertIn(b'>31<',xml)
    def test_missing_figure_blocker_is_preserved(self):
        r=record()['document'];r['blocks']+=[{'id':'caption','type':'paragraph','text':'图 1 实验结果'}]
        self.assertEqual(missing_figures(r)[0]['code'],'FIGURE_ASSET_UNASSIGNED')
    def test_contents_checks_each_title_page_pair_not_unrelated_numbers(self):
        articles=[{'title':'文章甲','firstPage':1},{'title':'文章乙','firstPage':11}]
        verify_contents('文章甲 .... 1\n作者\n文章乙 .... 11',articles)
        with self.assertRaisesRegex(ValueError,'CONTENTS_PAGE_REFERENCE'):verify_contents('文章甲 .... 11\n文章乙 .... 1',articles)

    def test_writer_compatibility_changes_only_render_copy_and_preserves_math_characters(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'a.docx';copy=Path(d)/'render.docx';r=record();m=r['document']['blocks'][0]['inlineMath'][0]
            m['sourceOmml']=m['sourceOmml'].replace('x+1','+');m['sourceSha256']=hashlib.sha256(m['sourceOmml'].encode()).hexdigest()
            export_article(r,PLAN,path,1);before=path.read_bytes();report=compatibility_copy(path,copy)
            self.assertEqual(path.read_bytes(),before);self.assertEqual(report['literalMathRunPatches'],1)
            with zipfile.ZipFile(copy) as z:
                root=ET.fromstring(z.read('word/document.xml'));self.assertTrue(root.findall('.//m:lit',NS));self.assertEqual(root.find('.//m:t',NS).text,'+')

if __name__=='__main__':unittest.main()
