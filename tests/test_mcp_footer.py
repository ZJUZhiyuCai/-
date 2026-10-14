import tempfile
import unittest
from publishing import build_tex

class FooterTests(unittest.TestCase):
    def test_footer_template_escapes_text_and_expands_page_token(self):
        with tempfile.TemporaryDirectory() as directory:
            tex,_=build_tex({'layout':{'footer':'第 {page} 页 & 100%','footerEven':'偶数 {page}'},'blocks':[]},directory)
            self.assertIn(r'\fancyfoot[LE]{偶数 \thepage{}}',tex)
            self.assertIn(r'\fancyfoot[RO]{第 \thepage{} 页 \& 100\%}',tex)
            self.assertNotIn(r'\fancyfoot[LE,RO]',tex)
