"""Synthetic multi-panel figures and scientific source styles; no private source."""
from io import BytesIO
import base64
import copy
import tempfile
import unittest
from PIL import Image
from docx_import import import_docx
from journal import prepare_blocks, relation_report
from publishing import render_pdf
from test_docx_v2 import package

W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
def png():
    stream=BytesIO();Image.new('RGB',(100,60),'black').save(stream,format='PNG');return stream.getvalue()
def panel_doc():
    return {'layout':{'fontSet':'fandol'},'blocks':[
        {'id':'table','type':'table','text':'','captionIds':['caption'],'captionPosition':'below','rows':[['panel A','panel B'],['panel C','']], 'headerRows':0,'borderStyle':'none',
         'merges':[{'row':1,'col':0,'rowspan':1,'colspan':2}], 'cellImages':[{'row':0,'col':0,'imageId':'a'},{'row':0,'col':1,'imageId':'b'},{'row':1,'col':0,'imageId':'c'}]},
        {'id':'caption','type':'paragraph','text':'Panel group'},
        *[{'id':ident,'type':'image','text':'','src':'data:image/png;base64,'+base64.b64encode(png()).decode(),'width':40} for ident in ('a','b','c')]]}

class CellImageTests(unittest.TestCase):
    def test_normal_math_text_preserves_unit_spaces(self):
        body='<w:p><m:oMath><m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve">(mmol g </m:t></m:r></m:oMath></w:p>'
        result=import_docx(package(body));self.assertEqual(result['blocks'][0]['text'],r'\mathrm{(mmol\ g\ }')
        self.assertEqual(result['importReports'][0]['counts']['importedMath'],1)

    def test_import_images_keep_ownership_and_source_counts(self):
        picture='<w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="image"/></w:drawing></w:r></w:p>'
        label='<w:p><w:r><w:t>Panel label</w:t></w:r></w:p>'
        extra={'word/_rels/document.xml.rels':'<Relationships><Relationship Id="image" Target="media/a.png"/></Relationships>','word/media/a.png':png()}
        def read(content):return import_docx(package('<w:tbl><w:tr><w:tc>'+content+'</w:tc></w:tr></w:tbl>',extra))
        result=read(picture+label);table,image=result['blocks'];self.assertEqual(table['cellImages'],[{'row':0,'col':0,'imageId':image['id']}]);self.assertEqual(table['rows'],[['Panel label']])
        self.assertEqual(result['importReports'][0]['counts']['importedImages'],1)
        self.assertFalse(any(d['severity']=='error' for d in result['importReports'][0]['diagnostics']))
        self.assertTrue(any(d['severity']=='error' for d in read(label+picture)['importReports'][0]['diagnostics']))

    def test_unknown_empty_fields_and_corrupt_metadata_still_fail(self):
        def field(instruction,end=True):return '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>'+instruction+'</w:instrText>'+('<w:fldChar w:fldCharType="end"/>' if end else '')+'</w:r></w:p>'
        def errors(body):return [d for d in import_docx(package(body))['importReports'][0]['diagnostics'] if d['severity']=='error']
        self.assertEqual(errors(field(' ADDIN EN.CITE.DATA ')),[])
        for instruction in ('ADDIN EN.CITE','ADDIN EN.REFLIST','REF target','ADDIN EN.CITE.DATA extra',''):
            self.assertTrue(errors(field(instruction)))
        self.assertTrue(errors(field('ADDIN EN.CITE.DATA',False)))

    def test_inherited_superscripts_direct_baseline_and_cycle(self):
        styles='<w:styles xmlns:w="'+W+'"><w:style w:type="character" w:styleId="up"><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style><w:style w:type="character" w:styleId="child"><w:basedOn w:val="up"/></w:style><w:style w:type="character" w:styleId="cycle"><w:basedOn w:val="cycle"/></w:style></w:styles>'
        def run(style,override=''):return '<w:r><w:rPr><w:rStyle w:val="'+style+'"/>'+override+'</w:rPr><w:t>2</w:t></w:r>'
        result=import_docx(package('<w:p>'+run('child')+run('child','<w:vertAlign w:val="baseline"/>')+'</w:p>',{'word/styles.xml':styles}))
        self.assertEqual(result['blocks'][0]['marks'],[{'start':0,'end':1,'superscript':True}])
        result=import_docx(package('<w:p>'+run('cycle')+'</w:p>',{'word/styles.xml':styles}))
        self.assertTrue(any(d['severity']=='error' for d in result['importReports'][0]['diagnostics']))

    def test_invalid_ownership_rejected_and_actual_pdf_has_all_panels_once(self):
        doc=panel_doc();self.assertEqual(len(prepare_blocks(doc)[0]),1)
        for bad in ('missing','duplicate','vertical','wrapped','caption'):
            broken=copy.deepcopy(doc)
            if bad=='missing':broken['blocks'].pop()
            elif bad=='duplicate':broken['blocks'][0]['cellImages'].append({'row':0,'col':1,'imageId':'a'})
            elif bad=='vertical':broken['blocks'][0]['merges']=[{'row':0,'col':0,'rowspan':2,'colspan':1}]
            elif bad=='wrapped':broken['blocks'][2]['wrap']='left'
            else:broken['blocks'][2]['text']='Must not disappear'
            with self.assertRaises(ValueError):prepare_blocks(broken)
        result=render_pdf(doc);positions=result['objectPositions'];report=relation_report(doc,positions)
        self.assertEqual(result['compileMessages'],[]);self.assertEqual(report['sourceObjectCoverage']['missing'],[])
        self.assertTrue(all(c['status']=='PASS' for c in report['cellImages']))
        self.assertLess(positions['a']['start']['xPt'],positions['b']['start']['xPt'])
        self.assertLess(positions['a']['start']['yPt'],positions['c']['start']['yPt'])
        self.assertGreater(positions['caption']['start']['yPt'],positions['c']['end']['yPt'])
        from pypdf import PdfReader
        reader=PdfReader(BytesIO(result['pdf']));self.assertEqual(len(reader.pages),1)
        self.assertEqual(sum(len(p.images) for p in reader.pages),3)

    def test_oversized_panel_table_fails_instead_of_scaling_or_clipping(self):
        doc=panel_doc();doc['layout'].update({'height':100,'top':20,'bottom':20})
        for image in doc['blocks'][2:]:image['width']=100
        with self.assertRaisesRegex(RuntimeError,'Cell image table exceeds page height'):render_pdf(doc)

    def test_title_weight_override_and_reference_label_do_not_consume_note_bodies(self):
        from pypdf import PdfReader
        doc={'layout':{'fontSet':'fandol'},'journal':{'template':'cn-academic','articleNoteId':'n','roleStyles':{'title-zh':{'bold':False}}},
             'blocks':[{'id':'title','type':'paragraph','role':'title-zh','text':'Title[^n]','marks':[{'start':5,'end':9,'superscript':True}]}, {'id':'ref','type':'paragraph','role':'reference','text':'[1] Reference[^r]'}],
             'notes':[{'id':'n','text':'  收稿日期：2026-01-01。\n基金项目：SYNTHETIC_GRANT'},{'id':'r','text':'REFERENCE_NOTE'}]}
        result=render_pdf(doc);text=''.join(p.extract_text() for p in PdfReader(BytesIO(result['pdf'])).pages)
        self.assertEqual(text.count('SYNTHETIC_GRANT'),1);self.assertEqual(text.count('REFERENCE_NOTE'),1)
        report=relation_report(doc,result['objectPositions']);self.assertEqual(report['sourceObjectCoverage']['missing'],[])
        missing=relation_report(doc,{k:v for k,v in result['objectPositions'].items() if not k.startswith('note:')})
        self.assertEqual(set(missing['sourceObjectCoverage']['missing']),{'note:n','note:r'})

    def test_temperature_and_unicode_subscript_numerals_have_visible_glyphs(self):
        from pdfminer.high_level import extract_text
        result=render_pdf({'layout':{'fontSet':'fandol'},'blocks':[{'id':'p','type':'paragraph','text':'温度350 ℃，CO₂，₀₁₂₃₄₅₆₇₈₉。'}]})
        self.assertEqual(result['compileMessages'],[])
        text=extract_text(BytesIO(result['pdf']))
        self.assertIn('℃',text);self.assertIn('0123456789',text.replace(' ',''))
