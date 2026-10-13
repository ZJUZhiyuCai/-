"""Bounded DOCX import. Independent MIT implementation, no Word automation."""
from io import BytesIO
from zipfile import ZipFile
import base64
import posixpath
import re
import uuid
import xml.etree.ElementTree as ET

NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
W, M = '{'+NS['w']+'}', '{'+NS['m']+'}'
def local(e): return e.tag.rsplit('}',1)[-1]
def uid(): return str(uuid.uuid4())
def xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise ValueError('不支持 XML 实体声明。')
    return ET.fromstring(data)
def utf16(s): return len(s.encode('utf-16-le'))//2

def import_docx(data):
    warnings = ['Word 导入保留可支持的内容结构；原分页、字体替代、浮动定位和复杂表格需核对。']
    with ZipFile(BytesIO(data)) as z:
        if len(z.infolist())>5000 or sum(i.file_size for i in z.infolist())>80*1024*1024: raise ValueError('Word 解压体积或文件数量过大。')
        root=xml(z.read('word/document.xml')); body=root.find('w:body',NS)
        if body is None: raise ValueError('Word 文档没有正文。')
        rels={}
        if 'word/_rels/document.xml.rels' in z.namelist():
            for r in xml(z.read('word/_rels/document.xml.rels')):
                if r.get('TargetMode')!='External': rels[r.get('Id')]=posixpath.normpath('word/'+r.get('Target',''))
        notes=[]
        for part,kind in [('word/footnotes.xml','footnote'),('word/endnotes.xml','endnote')]:
            if part in z.namelist():
                for n in xml(z.read(part)):
                    ident=n.get(W+'id','')
                    if n.get(W+'type') in ('separator','continuationSeparator') or ident.startswith('-'): continue
                    notes.append({'id':('end-' if kind=='endnote' else '')+ident,'text':'\n'.join(''.join(t.text or '' for t in p.iter(W+'t')) for p in n.findall('w:p',NS))})
        def math(e):
            k=local(e); children=list(e)
            def part(name):
                n=e.find('m:'+name,NS); return math(n) if n is not None else ''
            if k.endswith('Pr'): return ''
            if k=='t':
                return ''.join({'\\':r'\backslash ','{':r'\{','}':r'\}','%':r'\%','#':r'\#','&':r'\&','$':r'\$'}.get(c,c) for c in (e.text or ''))
            if k=='f': return r'\frac{'+part('num')+'}{'+part('den')+'}'
            if k=='rad': return r'\sqrt'+('['+part('deg')+']' if part('deg') else '')+'{'+part('e')+'}'
            if k=='sSup': return '{'+part('e')+'}^{'+part('sup')+'}'
            if k=='sSub': return '{'+part('e')+'}_{'+part('sub')+'}'
            if k=='sSubSup': return '{'+part('e')+'}_{'+part('sub')+'}^{'+part('sup')+'}'
            if k=='nary':
                ch=e.find('m:naryPr/m:chr',NS); op=ch.get(M+'val','∑') if ch is not None else '∑'
                return {'∑':r'\sum','∏':r'\prod','∫':r'\int','∮':r'\oint'}.get(op,op)+'_{'+part('sub')+'}^{'+part('sup')+'} '+part('e')
            if k=='m': return r'\begin{matrix}'+r' \\ '.join(' & '.join(math(c) for c in row if local(c)=='e') for row in children if local(row)=='mr')+r'\end{matrix}'
            if k=='d': return r'\left('+part('e')+r'\right)'
            if k not in {'oMath','oMathPara','r','e','num','den','sup','sub','deg','mr'}: warnings.append('公式结构 '+k+' 已降为可读数学内容，请核对。')
            return ''.join(math(c) for c in children)
        def paragraph(p):
            text=''; marks=[]; extras=[]
            def visit(e):
                nonlocal text
                k=local(e)
                if e.tag in (M+'oMath',M+'oMathPara'):
                    extras.append({'id':uid(),'type':'equation','text':math(e)}); return
                if e.tag==W+'r':
                    start=utf16(text); props=e.find('w:rPr',NS)
                    for c in e:
                        if c.tag!=W+'rPr': visit(c)
                    mark={'start':start,'end':utf16(text)}
                    if props is not None:
                        for key,tag in [('bold','b'),('italic','i'),('underline','u')]:
                            el=props.find('w:'+tag,NS)
                            if el is not None and el.get(W+'val') not in ('0','false','none'): mark[key]=True
                        va=props.find('w:vertAlign',NS)
                        if va is not None and va.get(W+'val') in ('superscript','subscript'): mark[va.get(W+'val')]=True
                        size=props.find('w:sz',NS)
                        if size is not None:
                            try: mark['fontSize']=max(5,min(72,float(size.get(W+'val'))/2))
                            except (TypeError,ValueError): pass
                        fonts=props.find('w:rFonts',NS)
                        if fonts is not None:
                            name=fonts.get(W+'eastAsia',fonts.get(W+'ascii','')).lower()
                            mark['fontFamily']='kai' if 'kai' in name or '楷' in name else 'sans' if any(x in name for x in ['hei','黑','arial']) else 'serif'
                    if len(mark)>2 and mark['end']>start: marks.append(mark)
                    return
                if e.tag==W+'t': text+=e.text or ''; return
                if e.tag in (W+'tab',W+'br',W+'cr'): text+='\t' if k=='tab' else '\n'; return
                if e.tag in (W+'footnoteReference',W+'endnoteReference'):
                    text+='[^'+('end-' if k=='endnoteReference' else '')+e.get(W+'id','')+']'; return
                if k=='blip':
                    rid=e.get('{'+NS['r']+'}embed'); path=rels.get(rid,''); ext=path.rsplit('.',1)[-1].lower()
                    if path in z.namelist() and ext in ('png','jpg','jpeg','webp'):
                        image=z.read(path)
                        if len(image)<=5*1024*1024: extras.append({'id':uid(),'type':'image','src':'data:image/'+('jpeg' if ext=='jpg' else ext)+';base64,'+base64.b64encode(image).decode(),'width':80,'text':''})
                        else: warnings.append('图片超过 5 MB，未导入：'+path)
                    else: warnings.append('未支持或外链图片未导入：'+(path or '外链'))
                    return
                if k=='drawing' and not any(local(c)=='blip' for c in e.iter()): warnings.append('图片或绘图没有可读取的位图，未导入，请核对原稿。')
                if k in ('pict','object'): warnings.append('旧式绘图/OLE 对象无法转换，请核对原稿。')
                for c in e: visit(c)
            visit(p)
            blocks=[]
            if text.strip():
                style=p.find('w:pPr/w:pStyle',NS); name=style.get(W+'val','') if style is not None else ''
                match=re.search(r'(?:heading|标题)\s*([1-4])',name,re.I)
                b={'id':uid(),'type':'heading' if match else 'paragraph','text':text,'marks':marks}
                if match: b['level']=int(match[1])
                align=p.find('w:pPr/w:jc',NS)
                if align is not None: b['align']={'both':'justify'}.get(align.get(W+'val'),align.get(W+'val'))
                if b.get('align') not in ('left','center','right','justify'): b.pop('align',None)
                blocks.append(b)
            if extras and text.strip(): warnings.append('段内图片/公式已转为独立块，位置需核对。')
            return blocks+extras
        blocks=[]
        def table_block(e):
            rows=[]; merges=[]; active={}; heads=0; in_header=True; extras=[]
            def number(parent,path,default=0):
                item=parent.find(path,NS)
                if item is None: return default
                try: value=int(item.get(W+'val',str(default)))
                except (TypeError,ValueError): raise ValueError('表格跨度或网格偏移不是整数。')
                if value<0 or value>50: raise ValueError('表格跨度或网格偏移超出 0–50 范围。')
                return value
            for row_index,row in enumerate(e.findall('w:tr',NS)):
                if row_index>=5000: raise ValueError('表格超过 5,000 行。')
                if in_header and row.find('w:trPr/w:tblHeader',NS) is not None: heads+=1
                else: in_header=False
                cells=['']*number(row,'w:trPr/w:gridBefore'); next_active={}
                for cell in row.findall('w:tc',NS):
                    span=number(cell,'w:tcPr/w:gridSpan',1)
                    if span<1: raise ValueError('表格列跨度必须大于零。')
                    col=len(cells)
                    if col+span>50: raise ValueError('表格超过 50 列。')
                    if cell.find('w:tbl',NS) is not None: warnings.append('嵌套表格已展平到所在单元格，文字保留，结构需重建。')
                    items=[b for p in cell.iter(W+'p') for b in paragraph(p)]
                    cells.extend(['\n'.join(b.get('text','') for b in items if b['type']!='image')]+['']*(span-1))
                    if any(b['type'] in ('image','equation') for b in items):
                        warnings.append('表格内图片/公式已提取到表格之后，单元格公式另保留文本。')
                        extras.extend(b for b in items if b['type'] in ('image','equation'))
                    vm=cell.find('w:tcPr/w:vMerge',NS)
                    value=vm.get(W+'val','continue') if vm is not None else None
                    key=(col,span)
                    if value=='continue' and key in active:
                        merge=active[key]; merge['rowspan']+=1; next_active[key]=merge
                    else:
                        if value=='continue': warnings.append('纵向合并续格未找到同宽起点，已保留为普通单元格。')
                        elif value not in (None,'restart'): warnings.append('未知纵向合并参数，已保留为普通单元格。')
                        if span>1 or value=='restart':
                            merge={'row':row_index,'col':col,'rowspan':1,'colspan':span};merges.append(merge)
                            if value=='restart': next_active[key]=merge
                    if cell.find('w:tcPr/w:hMerge',NS) is not None: warnings.append('旧式 hMerge 合并暂未还原，各格文字已保留；请手动合并。')
                cells.extend(['']*number(row,'w:trPr/w:gridAfter'))
                if len(cells)>50: raise ValueError('表格超过 50 列。')
                rows.append(cells);active=next_active
            cols=max((len(row) for row in rows),default=0)
            if not cols: warnings.append('空表格已忽略。');return None,extras
            if len(rows)*cols>100000: raise ValueError('表格超过 100,000 个单元格。')
            rows=[row+['']*(cols-len(row)) for row in rows]
            result={'id':uid(),'type':'table','rows':rows,'headerRows':heads,'borderStyle':'grid','text':'','merges':[m for m in merges if m['rowspan']>1 or m['colspan']>1]}
            widths=[]
            for column in e.findall('w:tblGrid/w:gridCol',NS):
                try: width=float(column.get(W+'w','0'))
                except ValueError: width=0
                widths.append(width)
            if len(widths)==cols and all(0<w<10000000 for w in widths): result['columnWidths']=[w/sum(widths)*100 for w in widths]
            elif widths: warnings.append('表格网格列宽不完整，使用等宽列。')
            if any(any(text for text in rows[r][m['col']:m['col']+m['colspan']]) for m in result['merges'] for r in range(m['row']+1,m['row']+m['rowspan'])):
                warnings.append('纵向合并续格含文字：已保留原格，合并显示全部文字，拆分可恢复位置。')
            return result,extras
        def walk(container):
            for e in container:
                if e.tag==W+'p': blocks.extend(paragraph(e))
                elif e.tag==W+'tbl':
                    table,extras=table_block(e)
                    if table: blocks.append(table)
                    blocks.extend(extras)
                elif e.tag in (W+'sdt',W+'sdtContent',W+'customXml',W+'ins'): walk(e)
                elif e.tag!=W+'sectPr':
                    fallback=''.join(t.text or '' for t in e.iter(W+'t'))
                    warnings.append('未支持结构 '+local(e)+' 已提取可读文字，请核对。')
                    if fallback: blocks.append({'id':uid(),'type':'paragraph','text':fallback})
        walk(body)
        if any(n.startswith('word/header') or n.startswith('word/footer') for n in z.namelist()): warnings.append('原 Word 页眉页脚未导入；请在版式设置中重建。')
        return {'blocks':blocks,'notes':notes,'warnings':list(dict.fromkeys(warnings))}
