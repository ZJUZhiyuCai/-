"""Compatibility boundaries shared by the native and Word import paths."""
import base64
from io import BytesIO
import unittest
from PIL import Image
from docx_import import import_docx, NS
from test_docx_v2 import package


class MergedImportTests(unittest.TestCase):
    def test_saved_book_defaults_do_not_override_journal_headers(self):
        from publishing import render_pdf
        from pypdf import PdfReader
        d={'layout':{'fontSet':'fandol','header':'书页 · 开源排版','headerEven':'书页 · 开源排版','headerOdd':'书页 · 开源排版','footer':'{page}','footerEven':'{page}'},
           'journal':{'template':'cn-academic','name':'期刊名称','nameEn':'Journal Heading','shortTitle':'Running Title','year':'2026'},
           'blocks':[{'id':'p','type':'paragraph','text':'Body'}]}
        r=render_pdf(d);text=PdfReader(BytesIO(r['pdf'])).pages[0].extract_text()
        self.assertIn('Journal Heading',text)
        self.assertNotIn('1',text)
        self.assertEqual(r['compileMessages'],[])
        d['layout']['footer']='Proof {page}'
        custom=render_pdf(d)
        self.assertIn('Proof 1',PdfReader(BytesIO(custom['pdf'])).pages[0].extract_text())

    def test_note_only_revisions_block_until_explicitly_accepted(self):
        source=package('<w:p><w:r><w:t>Body</w:t><w:footnoteReference w:id="1"/></w:r></w:p>',{
            'word/footnotes.xml':'<w:footnotes xmlns:w="'+NS['w']+'"><w:footnote w:id="1"><w:p><w:ins><w:r><w:t>Note</w:t></w:r></w:ins></w:p></w:footnote></w:footnotes>'})
        blocked=import_docx(source)['importReports'][0]
        self.assertEqual(blocked['counts']['sourceRevisions'],1)
        self.assertEqual(blocked['counts']['acceptedRevisions'],0)
        self.assertTrue(any(d['severity']=='error' for d in blocked['diagnostics']))
        accepted=import_docx(source,'accept')
        self.assertEqual(accepted['notes'][0]['text'],'Note')
        self.assertEqual(accepted['importReports'][0]['counts']['acceptedRevisions'],1)
        self.assertFalse(any(d['severity']=='error' for d in accepted['importReports'][0]['diagnostics']))

    def test_large_tiff_retains_all_pixels_through_normal_import(self):
        # Crosses the former 25 MP limit; two distinct regions expose blanking,
        # clipping and downsampling without shipping a large binary fixture.
        original=Image.new('L',(5400,5000),37)
        original.paste(211,(2200,1900,5400,5000))
        out=BytesIO();original.save(out,format='TIFF',compression='tiff_lzw')
        source=package('<w:p xmlns:a="'+NS['a']+'" xmlns:r="'+NS['r']+'"><w:r><w:drawing><a:blip r:embed="image"/></w:drawing></w:r></w:p>',{
            'word/_rels/document.xml.rels':'<Relationships><Relationship Id="image" Target="media/large.tiff"/></Relationships>',
            'word/media/large.tiff':out.getvalue()})
        imported=import_docx(source)
        self.assertEqual(imported['importReports'][0]['counts']['importedImages'],1)
        self.assertFalse(any(d['severity']=='error' for d in imported['importReports'][0]['diagnostics']))
        decoded=Image.open(BytesIO(base64.b64decode(imported['blocks'][0]['src'].split(',',1)[1])))
        self.assertEqual(decoded.size,original.size)
        self.assertEqual(decoded.mode,original.mode)
        self.assertEqual(decoded.tobytes(),original.tobytes())
