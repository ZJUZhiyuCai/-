import hashlib
from pathlib import Path
import tempfile
import unittest
from editable_docx import export_article, NS
from issue_export import verify_docx
from word_render import PAYLOAD

PLAN = {'title': 'Synthetic review', 'width': 210, 'height': 285, 'firstPage': 1}


def record(source, text='x+1', inline=False):
    math = {'id': 'formula', 'text': text, 'sourceOmml': source,
            'sourceSha256': hashlib.sha256(source.encode()).hexdigest()}
    block = ({'id': 'p', 'type': 'paragraph', 'text': 'A [[math:formula]] B', 'inlineMath': [math]}
             if inline else {'type': 'equation', **math})
    return {'projectId': 'sample', 'revision': 2, 'document': {'title': 'Synthetic review',
            'journal': {'template': 'cn-academic'}, 'blocks': [block], 'notes': []}}


SOURCE = '<m:oMath xmlns:m="'+NS['m']+'"><m:r><m:t>x+1</m:t></m:r></m:oMath>'


class WordAdversarialTests(unittest.TestCase):
    def test_edited_tex_must_not_export_stale_omml(self):
        for inline in (False, True):
            with self.subTest(inline=inline), tempfile.TemporaryDirectory() as directory:
                path = Path(directory)/'edited.docx'
                with self.assertRaisesRegex(ValueError, 'WORD_FORMULA_EDIT_NOT_RECONCILED'):
                    export_article(record(SOURCE, 'x+2', inline), PLAN, path, 1)
                self.assertFalse(path.exists())

    def test_unchanged_and_reconciled_source_roundtrip(self):
        for source, text in [(SOURCE, 'x+1'), (SOURCE.replace('x+1', 'x+2'), 'x+2')]:
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/'valid.docx';r=record(source,text)
                export_article(r,PLAN,path,1)
                self.assertTrue(verify_docx(path,[r])['formulaSourceExact'])

    def test_source_hash_does_not_authorize_active_word_content(self):
        payloads = [
            '<w:fldSimple w:instr="INCLUDETEXT synthetic-local-canary.txt"><w:r><w:t>canary</w:t></w:r></w:fldSimple>',
            '<w:object/>', '<w:altChunk/>', '<w:hyperlink/>',
        ]
        for payload in payloads:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as directory:
                source=SOURCE.replace('<m:oMath ', '<m:oMath xmlns:w="'+NS['w']+'" ').replace('</m:oMath>',payload+'</m:oMath>')
                with self.assertRaisesRegex(ValueError, 'UNSAFE_OMML_SOURCE'):
                    export_article(record(source),PLAN,Path(directory)/'unsafe.docx',1)

    def test_inert_word_bookmarks_and_font_properties_survive(self):
        source=SOURCE.replace('<m:oMath ', '<m:oMath xmlns:w="'+NS['w']+'" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ')
        source=source.replace('<m:r>', '<w:bookmarkStart w:id="1" w:name="formula"/><m:r><w:rPr><w14:ligatures w14:val="none"/></w:rPr>').replace('</m:oMath>','<w:bookmarkEnd w:id="1"/><w:lastRenderedPageBreak/></m:oMath>')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'formatted.docx';r=record(source)
            export_article(r,PLAN,path,1)
            self.assertTrue(verify_docx(path,[r])['formulaSourceExact'])

    def test_source_entities_cannot_enter_the_generated_package(self):
        source='<!DOCTYPE m:oMath [<!ENTITY value "x+1">]>'+SOURCE.replace('x+1','&value;')
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'UNSAFE_OMML_SOURCE'):
                export_article(record(source),PLAN,Path(directory)/'entity.docx',1)

    def test_word_loader_never_executes_macros(self):
        # The isolated UNO interpreter executes this literal payload. Check the
        # actual load arguments without depending on UNO availability on macOS.
        self.assertIn("pv('MacroExecutionMode',0)",PAYLOAD)
        self.assertNotIn("pv('MacroExecutionMode',4)",PAYLOAD)


if __name__ == '__main__':unittest.main()
