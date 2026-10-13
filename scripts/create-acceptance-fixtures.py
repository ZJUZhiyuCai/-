"""Generate original fixtures; never includes commercial documents/resources."""
import json,base64
from io import BytesIO
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]/'examples'
layout=dict(width=185,height=260,top=24,bottom=22,inner=24,outer=20,fontSize=11,lineHeight=1.8,columns=1,gap=8,indent=2,header='书页 · 功能验收',pageStart=1)
def save(name,title,blocks,**options):
    obj=dict(format='open-typesetter',version=2,title=title,layout={**layout,**options},blocks=blocks)
    (root/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
image=Image.new('RGB',(600,380),'#e5f0ed');draw=ImageDraw.Draw(image)
draw.rectangle((35,35,565,345),outline='#176e76',width=5)
for i in range(5):draw.rectangle((75+i*90,280-i*35,125+i*90,310),fill='#176e76')
out=BytesIO();image.save(out,format='PNG');src='data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()
text='排版验收需要同时核对内容顺序、页面边界与输出结果。文字应从图片旁边继续流动，跨页之后不应丢失，也不应重复。这里包含中文标点、英文 BookMaker 和数字 2026，以检查混合文本。'
blocks=[dict(id='title',type='heading',text='图文绕排与合并表格'),dict(id='image',type='image',text='原创示意图',src=src,width=42,wrap='left'),dict(id='body',type='paragraph',text=text*16),dict(id='table-heading',type='heading',text='合并、列宽与续表'),dict(id='table',type='table',text='表 1　合并单元格验收',rows=[['分组','项目','说明'],['甲组','A','第一行保留'],['','B','第二行保留']]+[[f'组{i}',str(i),f'第 {i} 项测试记录，核对行序与分页。']for i in range(3,33)],merges=[dict(row=1,col=0,rowspan=2,colspan=1)],columnWidths=[20,20,60],headerRows=1,borderStyle='grid')]
save('flow-and-table.shuye.json','图文与合并表格验收',blocks)
save('vertical.shuye.json','竖排验收',[dict(id='v-title',type='heading',text='竖排阅读与分页'),*[dict(id=f'v-{i}',type='paragraph',text=f'第{i+1}段。'+text*4)for i in range(8)]],writingMode='vertical-rl',columns=2)
save('merged-table.shuye.json','合并表格出版验收',[blocks[3],blocks[4]])
stress=Path(__file__).resolve().parents[2]/'.research'/'editor-tests'/'stress-1000.shuye.json';stress.parent.mkdir(parents=True,exist_ok=True)
stress.write_text(json.dumps(dict(format='open-typesetter',version=2,title='千页分页压力验收',layout=layout,blocks=[b for i in range(1000)for b in ([dict(id=f'p{i}',type='paragraph',text=f'第 {i+1} 页。'+text)]+([dict(id=f'b{i}',type='pageBreak',text='')]if i<999 else []))]),ensure_ascii=False),encoding='utf-8')
print('Created 3 original examples and a private 1000-page stress fixture.')
