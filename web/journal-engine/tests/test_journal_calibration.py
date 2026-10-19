"""Actual PDF regressions for measured leading and formula-dense journals."""
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from math_layout import inline_breaks, continues_equation
from publishing import build_tex, render_pdf, TEX_DEFAULT
from proof import text_geometry

AVAILABLE=bool(shutil.which('xelatex') or TEX_DEFAULT.exists())

def document(blocks, **layout):
    return {'journal':{'template':'cn-academic'},'layout':{
        'fontSet':'fandol','width':170,'height':240,'inner':13,'outer':13,
        'top':16,'bottom':16,'columns':1,'fontSize':8.2,'lineHeight':12.4/8.2,**layout},'blocks':blocks}

def lines(result):
    return [(p['page'],l) for p in text_geometry(result['pdf'])['pages'] for l in p['lines']]

class CalibrationTests(unittest.TestCase):
    def test_inline_breaks_preserve_tokens_and_protect_nested_structures(self):
        value=r'x=1\text{，}y=2,z=3;w=4'
        result=inline_breaks(value)
        self.assertEqual(result.replace(r'\allowbreak ',''),value)
        self.assertEqual(result.count(r'\allowbreak'),3)
        for nested in [r'\frac{a,b}{c}',r'x_{a,b}',r'\left(a,b\right)',
                       r'\begin{matrix}a,b & c \\ d & e\end{matrix}',r'\text{label, with comma}']:
            self.assertEqual(inline_breaks(nested),nested)
        self.assertIn(r'\symup{,}\allowbreak',inline_breaks(r'x\symup{,}y'))

    def test_math_font_is_explicit_and_does_not_rewrite_source(self):
        d=document([{'id':'eq','type':'equation','text':r'\mathrm{\alpha}+\boldsymbol{x}'}])
        d['journal']['mathFont']='stix-two'
        with tempfile.TemporaryDirectory() as folder:
            tex,_=build_tex(d,folder)
            self.assertIn(r'\setmathfont{STIX Two Math}',tex)
            self.assertIn(r'\symup{\alpha}+\symbfit{x}',tex)
            self.assertEqual(d['blocks'][0]['text'],r'\mathrm{\alpha}+\boldsymbol{x}')
            d['journal']['mathFont']='untrusted-font'
            with self.assertRaises(ValueError):build_tex(d,folder)

    def test_equation_continuations_and_bilingual_publication_date(self):
        for text in ('x=y>',r'x=y\mathrm{> }',r'x=y\leq'):
            self.assertTrue(continues_equation(text))
        for text in ('x=y',r'x^{a+b}',r'\left(x+y\right)'):
            self.assertFalse(continues_equation(text))
        d=document([{'id':'a','type':'equation','text':r'x=y\mathrm{> }'},
                    {'id':'b','type':'equation','text':'z'}])
        d['journal'].update(date='2030年1月',dateEn='Jan. 2030')
        with tempfile.TemporaryDirectory() as folder:
            tex,_=build_tex(d,folder)
            self.assertIn('Jan. 2030',tex)
            self.assertIn(r'\begin{gather*}',tex)
            self.assertIn(r'\\*',tex)

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_continued_inequality_cannot_leave_a_relation_at_page_bottom(self):
        blocks=[{'id':'f'+str(i),'type':'paragraph','text':'用于推导分页的合成正文。'} for i in range(38)]
        blocks += [{'id':'lead','type':'paragraph','text':'所以，'},
                   {'id':'left','type':'equation','text':r'C(A)=\frac{x+y}{\sqrt{z}}\mathrm{> }'},
                   {'id':'right','type':'equation','text':r'\frac{a+b}{\sqrt{c}}=C(B)'}]
        result=render_pdf(document(blocks));pos=result['objectPositions']
        self.assertEqual(pos['left']['end']['page'],pos['right']['start']['page'])
        self.assertEqual(pos['lead']['end']['page'],pos['left']['start']['page'])
        self.assertEqual(result['compileMessages'],[])

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_actual_leading_and_table_font_are_not_scaled_or_shrunk(self):
        d=document([
            {'id':'p','type':'paragraph','text':'校准正文第一行\n校准正文第二行\n校准正文第三行'},
            {'id':'table','type':'table','placement':'full-width','rows':[['ROWONE','1'],['ROWTWO','2'],['ROWTHREE','3']], 'headerRows':0}])
        result=render_pdf(d);ls=lines(result)
        a=next(l for _,l in ls if '校准正文第一行' in l['text']);b=next(l for _,l in ls if '校准正文第二行' in l['text'])
        self.assertAlmostEqual(b['bboxPt'][1]-a['bboxPt'][1],12.4*72/72.27,delta=.08)
        a=next(l for _,l in ls if 'ROWONE' in l['text']);b=next(l for _,l in ls if 'ROWTWO' in l['text'])
        self.assertAlmostEqual(b['bboxPt'][1]-a['bboxPt'][1],10.25*72/72.27,delta=.15)
        self.assertTrue(any(8.1<size<8.3 for size in a['fontSizesPt']))
        self.assertEqual(result['compileMessages'],[])

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_outer_assignments_wrap_without_overflow_or_token_loss(self):
        d=document([{'id':'p','type':'paragraph','text':'假设合成案例的参数固定，先定义两个独立参数[[math:a]]，由给定关系可计算出[[math:b]]。',
            'inlineMath':[{'id':'a','text':r'\alpha=\frac12\text{，}\beta=\frac12'},
                          {'id':'b','text':r'Q(X_1)=7.1234\text{，}Q(X_2)=5.6789\text{，}Q(X_3)=4.5678'}]}])
        result=render_pdf(d)
        self.assertEqual(result['compileMessages'],[])
        self.assertEqual(text_geometry(result['pdf'])['outside'],[])
        text=''.join(l['text'] for _,l in lines(result)).replace(' ','')
        for value in ('7.1234','5.6789','4.5678'):self.assertIn(value,text)
        self.assertTrue(all(e in result['objectPositions']['p:b'] for e in ('start','end')))

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_heading_does_not_pull_later_paragraphs_onto_a_half_empty_page(self):
        blocks=[{'id':'fill'+str(i),'type':'paragraph','text':'用于检测分页的合成正文。'} for i in range(24)]
        blocks += [{'id':'h','type':'heading','level':1,'text':'校准章节'},
                   {'id':'sub','type':'heading','level':2,'text':'连续小节'},
                   *[{'id':'body'+str(i),'type':'paragraph','text':'独立的合成正文段落，用来检查标题之后仍可正常换页。'*5} for i in range(3)],
                   {'id':'table','type':'table','rows':[['项目','数值']]+[['样本',str(i)] for i in range(9)]}]
        result=render_pdf(document(blocks,height=220));pos=result['objectPositions']
        self.assertEqual(pos['h']['start']['page'],pos['fill23']['end']['page'])
        self.assertEqual(pos['h']['start']['page'],pos['sub']['start']['page'])
        self.assertEqual(pos['sub']['start']['page'],pos['body0']['start']['page'])
        self.assertEqual(result['compileMessages'],[])

    @unittest.skipUnless(AVAILABLE,'XeLaTeX unavailable')
    def test_display_keeps_its_introduction_without_an_empty_baseline(self):
        d=document([{'id':'lead','type':'paragraph','text':'根据合成关系，得到：'},
                    {'id':'eq','type':'equation','text':'x^2+y^2=z^2','equationNumber':'1'},
                    {'id':'after','type':'paragraph','text':'继续讨论该关系。'}])
        result=render_pdf(d);pos=result['objectPositions']
        self.assertEqual(pos['lead']['end']['page'],pos['eq']['start']['page'])
        self.assertLess(pos['eq']['start']['yPt']-pos['lead']['end']['yPt'],22)
        self.assertEqual(result['compileMessages'],[])

    @unittest.skipUnless(AVAILABLE and Path('/System/Library/Fonts/Supplemental/STIXTwoMath.otf').exists(),'STIX Two Math fixture font unavailable')
    def test_stix_upright_greek_and_bold_symbols_have_real_glyphs(self):
        d=document([{'id':'eq','type':'equation','text':r'\mathrm{\alpha}+\mathrm{\beta}+\boldsymbol{Y}_1+\mathbf{X}'}])
        d['journal']['mathFont']='stix-two'
        result=render_pdf(d);self.assertEqual(result['compileMessages'],[])
        self.assertTrue(any('STIXTwoMath' in font for _,l in lines(result) for font in l['fonts']))

if __name__=='__main__':unittest.main()
