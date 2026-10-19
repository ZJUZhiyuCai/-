"""Public synthetic DOCX. No manuscript, author or customer material."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M='http://schemas.openxmlformats.org/officeDocument/2006/math'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def r(t):return '<w:r><w:t>'+escape(t)+'</w:t></w:r>'
def p(t):return '<w:p>'+r(t)+'</w:p>'
def m(t):return '<m:r><m:t>'+escape(t)+'</m:t></m:r>'
def math(t):return '<m:oMath>'+t+'</m:oMath>'
frac='<m:f><m:num>'+m('1')+'</m:num><m:den><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e>'+m('x+1')+'</m:e></m:rad></m:den></m:f>'
matrix='<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m>'+''.join('<m:mr>'+''.join('<m:e>'+m(str(i+j))+'</m:e>' for j in range(3))+'</m:mr>' for i in range(3))+'</m:m></m:e></m:d>'
front=['复杂公式与图文锚定验收样稿','测试作者','测试研究所','摘要：此文件为公开合成样本，用于核对首面、矩阵、分式、图表和引用。','关键词：排版；公式；锚点','Journal typesetting acceptance sample','TEST Author','Synthetic Research Institute','Abstract: This public synthetic document checks formula and figure preservation.','Keywords: typesetting; mathematics; anchors']
body=''.join(p(t) for t in front)
body+='<w:p>'+r('行内公式 ')+math(m('x>0'))+r(' 与 ')+math(frac)+r(' 应完整保留。')+'</w:p>'
body+='<w:p><m:oMathPara>'+math(frac)+'</m:oMathPara>'+r('(1)')+'</w:p>'
body+='<w:p><m:oMathPara>'+math(matrix)+'</m:oMathPara>'+r('(2)')+'</w:p>'
body+=p('图 1 展示合成数据。')
body+='<w:p><w:r><w:drawing><a:blip r:embed="img"/></w:drawing></w:r></w:p>'+p('图 1 合成示意图')
body+=p('表 1 展示公式和字符。')
body+='<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>'+p('公式')+'</w:tc><w:tc>'+p('结果')+'</w:tc></w:tr><w:tr><w:tc><w:p>'+math(m('a_i'))+'</w:p></w:tc><w:tc>'+p('√')+'</w:tc></w:tr><w:tr><w:tc><w:p>'+math(frac)+'</w:p></w:tc><w:tc>'+p('×')+'</w:tc></w:tr></w:tbl>'+p('表 1 合成结果')
body+=''.join(p('连续正文用于核对跨页流动、双栏与页眉。'*24) for _ in range(5))
body+=p('[1] TEST A. Synthetic reference [J]. Example Journal, 2026, 1: 1-2.')
im=Image.new('RGB',(900,500),'white');d=ImageDraw.Draw(im);d.line([(80,40),(80,420),(830,420)],fill='black',width=5);d.line([(100,380),(300,270),(510,300),(800,80)],fill='black',width=5);png=BytesIO();im.save(png,format='PNG')
files={'word/document.xml':f'<w:document xmlns:w="{W}" xmlns:m="{M}" xmlns:a="{A}" xmlns:r="{R}"><w:body>{body}</w:body></w:document>',
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img" Type="'+R+'/image" Target="media/figure.png"/></Relationships>',
 'word/media/figure.png':png.getvalue(),
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="'+R+'/officeDocument" Target="word/document.xml"/></Relationships>'}
with ZipFile(root/'tests/fixtures/journal-complex.docx','w') as z:
 for name,data in files.items():
  info=ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;z.writestr(info,data)
