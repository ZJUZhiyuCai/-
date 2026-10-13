import unittest
import sys
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import import_docx

def package(content):
    out=BytesIO()
    with ZipFile(out,'w') as z:
        z.writestr('word/document.xml',content)
    return out.getvalue()

class ImportTests(unittest.TestCase):
    def test_order_text_heading_table_and_losses(self):
        xml='''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p>
        <w:p><w:r><w:t>甲 &amp; 乙😀</w:t><w:br/><w:t>第二行</w:t><w:drawing/></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>'''
        result=import_docx(package(xml))
        self.assertEqual([b['text'] for b in result['blocks'][:2]],['标题','甲 & 乙😀\n第二行'])
        self.assertEqual(result['blocks'][2]['rows'],[['A','B']])
        self.assertEqual(result['blocks'][0]['type'],'heading')
        self.assertTrue(any('图片' in w for w in result['warnings']))
        self.assertEqual(result['blocks'][2]['type'],'table')
    def test_no_body_and_entities_rejected(self):
        with self.assertRaises(ValueError): import_docx(package('<document/>'))
        with self.assertRaises(ValueError): import_docx(package('<!DOCTYPE document [<!ENTITY a "bad">]><document/>'))
    def test_content_controls_are_not_silently_lost(self):
        xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sdt><w:sdtContent><w:p><w:r><w:t>控件内正文</w:t></w:r></w:p></w:sdtContent></w:sdt><w:p><w:r><w:t>普通正文</w:t></w:r></w:p></w:body></w:document>'
        self.assertEqual([b['text'] for b in import_docx(package(xml))['blocks']], ['控件内正文','普通正文'])
    def test_oversize_archive_rejected(self):
        out=BytesIO()
        with ZipFile(out,'w') as z:
            for i in range(5001): z.writestr(str(i),'')
        with self.assertRaises(ValueError): import_docx(out.getvalue())

if __name__=='__main__': unittest.main()
