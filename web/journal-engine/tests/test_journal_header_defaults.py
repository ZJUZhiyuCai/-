from io import BytesIO
import shutil
import unittest
import pdfplumber
from publishing import render_pdf, TEX_DEFAULT


@unittest.skipUnless(shutil.which('xelatex') or TEX_DEFAULT.exists(), 'XeLaTeX unavailable')
class JournalHeaderDefaultsTests(unittest.TestCase):
    def test_saved_defaults_keep_journal_heads_and_explicit_heads_win(self):
        doc = {
            'layout': {'fontSet': 'fandol', 'header': '书页 · 开源排版',
                       'headerEven': '书页 · 开源排版', 'headerOdd': '书页 · 开源排版',
                       'footer': '{page}', 'footerEven': '{page}'},
            'journal': {'template': 'cn-academic', 'name': '期刊名称',
                        'nameEn': 'Journal Heading', 'shortTitle': 'Running Title', 'year': '2026'},
            'blocks': [{'id': 'a', 'type': 'paragraph', 'text': 'First page.'},
                       {'id': 'break', 'type': 'pageBreak'},
                       {'id': 'b', 'type': 'paragraph', 'text': 'Second page.'}],
        }
        result = render_pdf(doc)
        with pdfplumber.open(BytesIO(result['pdf'])) as pdf:
            pages = [p.extract_text() for p in pdf.pages]
        self.assertEqual(result['compileMessages'], [])
        self.assertIn('JournalHeading', ''.join(pages[0].split()))
        self.assertIn('期刊名称', pages[1])
        self.assertNotIn('开源排版', ''.join(pages))
        self.assertNotIn('1', pages[0])  # No default book folio on the journal front page.
        doc['layout'].update(header='CUSTOM-ODD', headerEven='CUSTOM-EVEN', footer='Proof {page}')
        custom = render_pdf(doc)
        with pdfplumber.open(BytesIO(custom['pdf'])) as pdf:
            pages = [p.extract_text() for p in pdf.pages]
        self.assertEqual(custom['compileMessages'], [])
        self.assertIn('CUSTOM-ODD', pages[0])
        self.assertIn('CUSTOM-EVEN', pages[1])
        self.assertIn('Proof1', ''.join(pages[0].split()))
