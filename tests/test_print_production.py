import unittest
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, NumberObject, DecodedStreamObject
from print_production import process_pdf, select_pages

def sample(count=5):
    w=PdfWriter()
    for i in range(count):w.add_blank_page(100*72/25.4,150*72/25.4)
    b=BytesIO();w.write(b);return b.getvalue()
class ProductionTests(unittest.TestCase):
    def test_ranges(self):
        self.assertEqual(select_pages('1-3,5,2',5),[0,1,2,4])
        for s in ['0','1-6','3-1','1;2','']:
            if s:
                with self.assertRaises(ValueError):select_pages(s,5)
    def test_booklet_order_size(self):
        out=process_pdf(sample(),{'booklet':True,'cropMarks':True,'bleedMm':3})
        report=out['report'];self.assertEqual(report['blankPages'],3);self.assertEqual(report['outputPages'],4)
        self.assertEqual([(x['left'],x['right']) for x in report['imposition']],[(None,1),(2,None),(None,3),(4,5)])
        self.assertAlmostEqual(report['pages'][0]['widthMm'],216,places=2);self.assertAlmostEqual(report['pages'][0]['heightMm'],166,places=2)
        reader=PdfReader(BytesIO(out['pdf']));self.assertAlmostEqual(float(reader.pages[0].trimbox.width),200*72/25.4,places=3)
    def test_extract_and_reject_small_sheet(self):
        result=process_pdf(sample(),{'pages':'2,4-5'});self.assertEqual(result['report']['selectedPages'],[2,4,5]);self.assertEqual(len(PdfReader(BytesIO(result['pdf'])).pages),3)
        with self.assertRaises(ValueError):process_pdf(sample(),{'booklet':True,'sheetWidthMm':190})
        with self.assertRaises(ValueError):process_pdf(sample(),{'pdfX':True})
    def test_preflight_font_and_image_dpi(self):
        w=PdfWriter();p=w.add_blank_page(300,300)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        image=DecodedStreamObject();image.set_data(bytes([0,0,0])*10*10)
        image.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Image'),NameObject('/Width'):NumberObject(10),NameObject('/Height'):NumberObject(10),NameObject('/ColorSpace'):NameObject('/DeviceRGB'),NameObject('/BitsPerComponent'):NumberObject(8)})
        p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):w._add_object(font)}),NameObject('/XObject'):DictionaryObject({NameObject('/Im1'):w._add_object(image)})})
        stream=DecodedStreamObject();stream.set_data(b'q 72 0 0 72 0 0 cm /Im1 Do Q');p[NameObject('/Contents')]=w._add_object(stream)
        b=BytesIO();w.write(b);report=process_pdf(b.getvalue())['report']
        self.assertFalse(report['fonts'][0]['embedded']);self.assertEqual(report['images'][0]['dpiX'],10);self.assertTrue(any('DPI' in s for s in report['warnings']))
if __name__=='__main__':unittest.main()
