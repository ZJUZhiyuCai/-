"""Source-neutral regression samples for reference-journal layout controls."""
import base64
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from journal import prepare_blocks, side_groups, relation_report
from publishing import build_tex, render_pdf
from test_journal_calibration import document, AVAILABLE


def sample(side='right'):
    stream=BytesIO();Image.new('RGB',(240,180),'gray').save(stream,format='PNG')
    return document([
        {'id':'intro','type':'paragraph','text':'连续正文中保留公式 [[math:m]] 和原有字符。'*1,'inlineMath':[{'id':'m','text':r'x^2+\frac{1}{y}'}]},
        {'id':'display','type':'equation','text':r'a=b+c','equationNumber':'1'},
        {'id':'tail','type':'paragraph','text':'图后的同组文字也必须保留。'},
        {'id':'image','type':'image','src':'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode(),'width':40,'wrap':side,'sideTextIds':['intro','display','tail'],'anchor':{'targetId':'intro','position':'after','maxPageDistance':0},'captionIds':['caption']},
        {'id':'caption','type':'paragraph','text':'图 1 合成图'},
        {'id':'after','type':'paragraph','text':'FOLLOWING FULL WIDTH PARAGRAPH'}
    ])

class OriginalJournalTests(unittest.TestCase):
    def test_invalid_side_groups_reject_instead_of_discarding_content(self):
        for edit in [lambda d:d['blocks'][3].update(sideTextIds=['intro','tail']),
                     lambda d:d['blocks'][3].update(sideTextIds=['tail','intro','display']),
                     lambda d:d['blocks'][0].update(role='reference'),
                     lambda d:d['blocks'][0].update(text='正文[^n]'),
                     lambda d:d['blocks'][3].update(width=90)]:
            d=sample();edit(d)
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):build_tex(d,folder)
        d=sample();del d['blocks'][3]['sideTextIds']
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,'sideTextIds'):build_tex(d,folder)

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_both_sides_keep_all_source_objects_and_restore_full_width(self):
        for side in ('left','right'):
            d=sample(side);source=deepcopy(d);r=render_pdf(d);pos=r['objectPositions']
            self.assertEqual(d,source);self.assertEqual(r['compileMessages'],[])
            relations=relation_report(d,pos)
            self.assertEqual(relations['sourceObjectCoverage'],{'expected':7,'mapped':7,'missing':[]})
            self.assertEqual(relations['sideGroups'][0]['status'],'PASS')
            self.assertEqual(relations['diagnostics'],[])
            image_x=pos['image']['start']['xPt'];text_x=pos['intro']['start']['xPt']
            self.assertTrue(image_x>text_x if side=='right' else image_x<text_x)
            self.assertGreater(pos['after']['start']['yPt'],pos['caption']['end']['yPt'])

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_side_group_taller_than_page_fails_explicitly(self):
        d=sample();d['blocks'][0]['text']='文字内容。'*1500;d['blocks'][0].pop('inlineMath')
        with self.assertRaisesRegex(RuntimeError,'exceeds page height'):render_pdf(d)

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_head_separation_does_not_move_body_and_reference_hangs(self):
        import pdfplumber
        d=document([{'id':'first','type':'paragraph','text':'BODY FIRST LINE'},
                    {'id':'ref','type':'paragraph','role':'reference','text':'[12] '+('ALPHA BETA GAMMA '*20),
                     'marks':[{'start':0,'end':4,'bold':True}]}],top=29.4)
        d['journal'].update(headSepMm=3.2,roleStyles={'reference':{'leading':11.2}})
        a=render_pdf(d);d['journal']['headSepMm']=8;b=render_pdf(d)
        self.assertAlmostEqual(a['objectPositions']['first']['start']['yPt'],b['objectPositions']['first']['start']['yPt'],delta=.02)
        with pdfplumber.open(BytesIO(a['pdf'])) as pdf:
            chars=pdf.pages[0].chars;alpha=next(c for c in chars if c['text']=='A' and c['top']>a['objectPositions']['ref']['start']['yPt']-9)
            next_top=min(c['top'] for c in chars if c['text'].strip() and c['top']>alpha['top']+5)
            following=min((c for c in chars if c['text'].strip() and abs(c['top']-next_top)<.2),key=lambda c:c['x0'])
            self.assertAlmostEqual(alpha['x0'],following['x0'],delta=.2)
        self.assertEqual(a['compileMessages'],[])

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_publication_footnote_uses_labels_without_extra_marker(self):
        from pypdf import PdfReader
        d=document([{'id':'p','type':'paragraph','text':'作者[^n]'}]);d['notes']=[{'id':'n','marker':'*','text':'收稿日期：2030-01-02\n基金项目：合成项目\n*通讯作者：示例作者'}]
        d['journal']['articleNoteId']='n';r=render_pdf(d)
        text=''.join(p.extract_text() for p in PdfReader(BytesIO(r['pdf'])).pages)
        self.assertEqual(text.count('*'),2) # author mark + literal corresponding-author label
        self.assertIn('2030-01-02',text);self.assertEqual(r['compileMessages'],[])
