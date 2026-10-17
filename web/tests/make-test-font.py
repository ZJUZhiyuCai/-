"""Original geometric glyphs used only for structural PDF tests; CC0.
Regenerate with Python fonttools. Not a production reading font.
"""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from pathlib import Path
chars = list(range(32, 127)) + [ord(c) for c in '图书排版测试第一页第二页文字母验收']
chars = sorted(set(chars))
names = ['.notdef'] + [f'uni{x:04X}' for x in chars]
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap(dict(zip(chars, names[1:])))
glyphs = {}
for i, name in enumerate(names):
    pen = TTGlyphPen(None)
    if name != 'uni0020':
        pen.moveTo((80, 0)); pen.lineTo((480, 0)); pen.lineTo((480, 700)); pen.lineTo((80, 700)); pen.closePath()
    glyphs[name] = pen.glyph()
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({name: (600, 0) for name in names})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Shuye Test Only', 'styleName': 'Regular', 'uniqueFontIdentifier': 'ShuyeTestOnly', 'fullName': 'Shuye Test Only', 'psName': 'ShuyeTestOnly'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0)
fb.setupPost(); fb.setupMaxp()
out = Path(__file__).parent / 'fixtures' / 'test-only.ttf'
out.parent.mkdir(exist_ok=True)
fb.save(out)

# A separate OpenType/CFF fixture guards the FontFile3 / OpenType descriptor.
from fontTools.pens.t2CharStringPen import T2CharStringPen
cf = FontBuilder(1000, isTTF=False)
cf.setupGlyphOrder(names); cf.setupCharacterMap(dict(zip(chars, names[1:])))
charstrings = {}
for name in names:
    pen = T2CharStringPen(600, None)
    if name != 'uni0020':
        pen.moveTo((80, 0)); pen.lineTo((480, 0)); pen.lineTo((480, 700)); pen.lineTo((80, 700)); pen.closePath()
    charstrings[name] = pen.getCharString()
cf.setupCFF('ShuyeTestCFF', {'FullName':'Shuye Test CFF','FamilyName':'Shuye Test CFF','Weight':'Regular'}, charstrings, {})
cf.setupHorizontalMetrics({name:(600,0) for name in names})
cf.setupHorizontalHeader(ascent=800, descent=-200)
cf.setupNameTable({'familyName':'Shuye Test CFF','styleName':'Regular','uniqueFontIdentifier':'ShuyeTestCFF','fullName':'Shuye Test CFF','psName':'ShuyeTestCFF'})
cf.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200,fsType=0)
cf.setupPost(); cf.setupMaxp(); cf.save(out.with_suffix('.otf'))
