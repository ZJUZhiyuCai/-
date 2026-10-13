"""Independent, bounded XeLaTeX book publishing backend (MIT)."""
import base64
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading

_LOCK=threading.Lock()
TEX_DEFAULT=Path.home()/'AppData/Roaming/TinyTeX/bin/windows/xelatex.exe'
SAFE_COMMANDS=set('frac dfrac tfrac sqrt sum prod int oint iint iiint lim min max log ln exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega left right middle cdot times div pm mp le leq ge geq neq approx equiv sim simeq propto in notin subset supset subseteq supseteq cup cap emptyset infinity infty partial nabla forall exists neg land lor to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow mapsto overline underline hat widehat bar vec dot ddot tilde widetilde overbrace underbrace text mathrm mathbf mathit mathsf mathtt mathcal mathbb operatorname limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle quad qquad space thinspace backslash lbrace rbrace langle rangle lvert rvert vert Vert colon ldots cdots vdots ddots binom dbinom tbinom overset underset stackrel big Big bigg Bigg bmod pmod mod det gcd ker hom dim sup inf Pr begin end'.split())
SAFE_ENVS={'matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','cases','aligned','gathered'}
def escape(text):
    return ''.join({'\\':r'\textbackslash{}','{':r'\{','}':r'\}','$':r'\$','&':r'\&','#':r'\#','%':r'\%','_':r'\_','^':r'\textasciicircum{}','~':r'\textasciitilde{}','\n':r'\newline ','\t':r'\quad '}.get(c,c) for c in str(text) if ord(c)>=32 or c in '\n\t')
def safe_math(value):
    s=str(value)
    if len(s)>30000 or any(ord(c)<32 and c not in '\n\t\r' for c in s): raise ValueError('数学公式过长或含控制字符。')
    if '^^' in s: raise ValueError('数学公式不允许 TeX 字符编码转义。')
    if '%' in re.sub(r'\\%', '',s) or '#' in re.sub(r'\\#','',s) or '$' in re.sub(r'\\\$','',s): raise ValueError('数学公式不允许 TeX 注释、参数或数学模式分隔符。')
    for m in re.finditer(r'\\([A-Za-z]+|.)',s,re.S):
        command=m.group(1)
        if command not in SAFE_COMMANDS and command not in '{}_%#&$,;:!| \\': raise ValueError('不允许的数学命令：'+command)
    for env in re.finditer(r'\\(?:begin|end)\s*\{([^}]*)\}',s):
        if env.group(1) not in SAFE_ENVS: raise ValueError('不允许的数学环境：'+env.group(1))
    # Any begin/end must have literal allowed environment, no macro-generated names.
    if len(re.findall(r'\\(?:begin|end)\b',s))!=len(re.findall(r'\\(?:begin|end)\s*\{(?:'+ '|'.join(SAFE_ENVS)+r')\}',s)): raise ValueError('数学环境语法无效。')
    return s

def number(value,default,lo,hi):
    try: n=float(value)
    except (TypeError,ValueError): n=default
    if not math.isfinite(n) or not lo<=n<=hi: raise ValueError('版式数值超出范围。')
    return n

def build_tex(doc,assets_dir):
    """Return (trusted TeX source, warnings); assets_dir must be a private build dir."""
    warnings=[]; assets_dir=Path(assets_dir); assets_dir.mkdir(parents=True,exist_ok=True)
    layout=doc.get('layout',{})
    if layout.get('widowLines',1)>1: warnings.append('PDF 使用 TeX 防孤行策略，不能保证浏览器设定的孤行数量。')
    if layout.get('writingMode','horizontal') not in ('horizontal','horizontal-tb') or layout.get('vertical'): raise ValueError('正式 PDF 暂不支持竖排，请切换横排。')
    blocks=doc.get('blocks',[])
    terms=[str(t) for t in doc.get('indexTerms',[]) if str(t).strip()][:1000]
    index_refs={term:['idx-'+str(ti)+'-'+str(bi) for bi,b in enumerate(blocks) if term in str(b.get('text','')) and b.get('type')!='index'] for ti,term in enumerate(terms)}
    if not isinstance(blocks,list) or len(blocks)>10000: raise ValueError('文档块数量无效。')
    if sum(len(str(b)) for b in blocks)>30000000: raise ValueError('文档过大，请分卷。')
    values={k:number(layout.get(k),d,lo,hi) for k,d,lo,hi in [('width',185,100,450),('height',260,100,500),('top',24,5,80),('bottom',22,5,80),('inner',24,5,80),('outer',20,5,80),('fontSize',11,5,72),('lineHeight',1.8,1,3),('gap',8,2,30),('indent',2,0,6),('pageStart',1,1,9999)]}
    if values['width']-values['inner']-values['outer']<30 or values['height']-values['top']-values['bottom']<40: raise ValueError('页边距过大。')
    cols=int(number(layout.get('columns'),1,1,4))
    notes={str(n.get('id')):str(n.get('text','')) for n in doc.get('notes',[]) if isinstance(n,dict)}; note_seen=set()
    note_numbers={ident:i+1 for i,ident in enumerate(notes)}
    def plain(s):
        out=[]; start=0
        for m in re.finditer(r'\[\^([^\]\n]+)\]',s):
            out.append(escape(s[start:m.start()])); ident=m.group(1)
            if ident in notes:
                if layout.get('notesMode')=='endnote': out.append(r'\textsuperscript{'+str(note_numbers[ident])+'}'); note_seen.add(ident)
                elif ident in note_seen: out.append(r'\textsuperscript{*}'); warnings.append('重复脚注引用以星号显示：'+ident)
                else: out.append(r'\footnote{'+escape(notes[ident])+'}'); note_seen.add(ident)
            else: out.append(escape(m.group(0))); warnings.append('缺少脚注内容：'+ident)
            start=m.end()
        out.append(escape(s[start:])); return ''.join(out)
    def styled(b):
        s=str(b.get('text','')); marks=b.get('marks',[])
        # UTF-16 boundaries matching JavaScript; never split surrogate pairs.
        offsets=[0]
        for c in s: offsets.append(offsets[-1]+len(c.encode('utf-16-le'))//2)
        ruby=b.get('ruby',[])
        if ruby:
            if not isinstance(ruby,list) or len(ruby)>10000: raise ValueError('注音数据无效或过多。')
            spans=[]
            for item in ruby:
                try:
                    a=offsets.index(item['start']);z=offsets.index(item['end']);reading=item['text']
                except (KeyError,ValueError,TypeError): raise ValueError('注音必须使用有效 UTF-16 字符边界。')
                if a>=z or not isinstance(reading,str) or not reading.strip() or len(reading)>1000 or '\n' in reading: raise ValueError('注音范围或文字无效。')
                if '\n' in s[a:z]: raise ValueError('注音不能跨越换行。')
                if any(a<m.end() and z>m.start() for m in re.finditer(r'\[\^[^\]\n]+\]',s)): raise ValueError('注音不能覆盖脚注标记。')
                spans.append((a,z,reading))
            spans.sort()
            if any(spans[i][0]<spans[i-1][1] for i in range(1,len(spans))): raise ValueError('注音范围不能重叠。')
            def segment(a,z):
                lo,hi=offsets[a],offsets[z]
                inner=[{**m,'start':max(lo,m.get('start',0))-lo,'end':min(hi,m.get('end',0))-lo} for m in marks if m.get('start',0)<hi and m.get('end',0)>lo]
                return styled({**b,'text':s[a:z],'marks':inner,'ruby':[]})
            chunks=[];pos=0
            for a,z,reading in spans:
                if a>pos:chunks.append(segment(pos,a))
                chunks.append(r'\ruby{'+segment(a,z)+'}{'+escape(reading)+'}');pos=z
            if pos<len(s):chunks.append(segment(pos,len(s)))
            return ''.join(chunks)
        boundaries={0,len(s)}
        converted=[]
        for m in marks:
            try: a=offsets.index(int(m['start'])); z=offsets.index(int(m['end']))
            except (KeyError,ValueError,TypeError): warnings.append('无效逐字样式范围已忽略。'); continue
            if a<z: boundaries.update((a,z)); converted.append((a,z,m))
        for ref in re.finditer(r'\[\^[^\]\n]+\]',s):
            boundaries={x for x in boundaries if not ref.start()<x<ref.end()}
        result=[]; ends=sorted(boundaries)
        for a,z in zip(ends,ends[1:]):
            style={}
            for x,y,m in converted:
                if x<=a and z<=y: style.update(m)
            t=plain(s[a:z])
            for key,cmd in [('bold','textbf'),('italic','textit'),('underline','uline'),('superscript','textsuperscript'),('subscript','textsubscript')]:
                if style.get(key): t='\\'+cmd+'{'+t+'}'
            if style.get('bold') is False: t=r'\textmd{'+t+'}'
            if style.get('italic') is False: t=r'\textup{'+t+'}'
            if re.fullmatch(r'#[0-9a-fA-F]{6}',str(style.get('color',''))): t=r'\textcolor[HTML]{'+style['color'][1:]+'}{'+t+'}'
            if style.get('fontFamily') in ('serif','sans','kai'): t='{'+{'serif':r'\rmfamily ','sans':r'\sffamily ','kai':r'\kaifamily '}[style['fontFamily']]+t+'}'
            if 'fontSize' in style:
                size=number(style['fontSize'],11,5,72); t=r'{\fontsize{'+str(size)+'}{'+str(size*1.3)+r'}\selectfont '+t+'}'
            result.append(t)
        return ''.join(result)
    pre=r'''\documentclass[twoside,UTF8,fontset=windows]{ctexart}
\usepackage{geometry,fontspec,graphicx,longtable,array,booktabs,amsmath,amssymb,fancyhdr,multicol,xcolor,multirow}
\usepackage[normalem]{ulem}
\usepackage[latin,nooverlap]{ruby}
\newCJKfontfamily\kaifamily{KaiTi}
\newlength{\ShuyeTableWidth}
\usepackage[unicode,hidelinks]{hyperref}
\setcounter{secnumdepth}{0}
\setcounter{tocdepth}{4}
\clubpenalty=10000
\widowpenalty=10000
\pagestyle{fancy}\fancyhf{}
\fancyfoot[LE,RO]{\thepage}
\renewcommand{\headrulewidth}{0.3pt}
\setlength{\headheight}{18pt}
'''
    pre+=r'\geometry{paperwidth='+str(values['width'])+'mm,paperheight='+str(values['height'])+'mm,top='+str(values['top'])+'mm,bottom='+str(values['bottom'])+'mm,inner='+str(values['inner'])+'mm,outer='+str(values['outer'])+'mm}\n'
    pre+=r'\fancyhead[LE]{'+escape(layout.get('headerEven',layout.get('header','')))+r'}\fancyhead[RO]{'+escape(layout.get('headerOdd',layout.get('header','')))+'}\n'
    pre+=r'\setlength{\columnsep}{'+str(values['gap'])+'mm}\n'+r'\setlength{\parindent}{'+str(values['indent'])+'em}\n'
    pre+=r'\begin{document}\setcounter{page}{'+str(int(values['pageStart']))+'}\n'+r'\fontsize{'+str(values['fontSize'])+'}{'+str(values['fontSize']*values['lineHeight'])+r'}\selectfont'+'\n'
    content=[]; incols=False
    def columns(on):
        nonlocal incols
        if cols>1 and on!=incols: content.append(r'\begin{multicols}{'+str(cols)+'}' if on else r'\end{multicols}'); incols=on
    columns(True)
    for block_num,b in enumerate(blocks):
        block_labels=''
        for term_num,term in enumerate(terms):
            if term in str(b.get('text','')) and b.get('type')!='index':
                label='idx-'+str(term_num)+'-'+str(block_num); block_labels+=r'\phantomsection\label{'+label+'}'
        typ=b.get('type')
        if b.get('ruby') and typ not in ('paragraph','heading'): raise ValueError('正式 PDF 仅支持正文和标题块的注音。')
        text=styled(b) if typ in ('paragraph','heading') else escape(b.get('text',''))
        if typ in ('paragraph','heading'):
            if typ=='heading':
                lev=int(number(b.get('level'),1,1,4)); content.append('\\'+['section','subsection','subsubsection','paragraph'][lev-1]+'{'+text+'}'+block_labels); continue
            style=''
            if 'indentPt' in b: style+=r'\setlength{\parindent}{'+str(number(b['indentPt'],0,0,200))+'pt}'
            elif 'indent' in b: style+=r'\setlength{\parindent}{'+str(number(b['indent'],2,0,20))+'em}'
            if b.get('bold'): style+=r'\bfseries '
            style+= {'serif':r'\rmfamily ','sans':r'\sffamily ','kai':r'\kaifamily '}.get(b.get('fontFamily'),'')
            size=number(b.get('fontSize'),values['fontSize'],5,72); style+=r'\fontsize{'+str(size)+'}{'+str(size*values['lineHeight'])+r'}\selectfont '
            style+= {'left':r'\raggedright ','right':r'\raggedleft ','center':r'\centering '}.get(b.get('align'),'')
            content.append('{'+style+block_labels+text+r'\par}')
        elif typ=='pageBreak': columns(False); content.append(r'\newpage'); columns(True)
        elif typ=='equation': content.append(block_labels+r'\['+safe_math(b.get('text',''))+r'\]')
        elif typ=='image':
            if b.get('wrap','none')!='none': warnings.append('正式 PDF 暂不支持图片环绕，图片按独立块输出。')
            match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)',str(b.get('src','')))
            if not match: raise ValueError('图片必须为内嵌 PNG/JPEG/WebP。')
            raw=base64.b64decode(match[2],validate=True)
            if len(raw)>5*1024*1024: raise ValueError('图片超过 5 MB。')
            ext=match[1]; name='asset-'+str(len(list(assets_dir.glob('asset-*'))))+'.'+ext
            if ext=='webp':
                try:
                    from PIL import Image
                    from io import BytesIO
                    Image.MAX_IMAGE_PIXELS=25000000
                    im=Image.open(BytesIO(raw)); im.load(); name=name.rsplit('.',1)[0]+'.png'; im.save(assets_dir/name)
                except ImportError: raise ValueError('WebP 导出需要 Pillow；请改用 PNG/JPEG。')
            else: (assets_dir/name).write_bytes(raw)
            width=number(b.get('width'),80,1,100)/100
            content.append(r'\par\begingroup\centering\includegraphics[width='+str(width)+r'\linewidth,height=.8\textheight,keepaspectratio]{'+name+'}'+r'\par '+text+r'\par\endgroup')
        elif typ=='table':
            columns(False); rows=b.get('rows',[])
            if not rows: warnings.append('空表格已忽略。'); columns(True); continue
            if len(rows)>5000 or max(map(len,rows))>50: raise ValueError('表格过大。')
            n=max(map(len,rows)); heads=min(len(rows),int(number(b.get('headerRows'),1,0,len(rows)))); grid=b.get('borderStyle','grid')=='grid'
            raw_widths=b.get('columnWidths') or [1]*n
            if len(raw_widths)!=n: raise ValueError('表格列宽数量与列数不一致。')
            widths=[number(v,1,.001,10000) for v in raw_widths]; total=sum(widths);widths=[v/total for v in widths]
            def cell_width(col,span=1): return r'\dimexpr '+str(round(sum(widths[col:col+span]),7))+r'\ShuyeTableWidth-2\tabcolsep-2\arrayrulewidth\relax'
            spec=('|' if grid else '')+''.join('p{'+cell_width(j)+'}'+('|' if grid else '') for j in range(n))
            merged={}; anchors={}; joined_after=set()
            for merge in b.get('merges',[]):
                r,c,rs,cs=[merge.get(k) for k in ('row','col','rowspan','colspan')]
                if any(not isinstance(v,int) or isinstance(v,bool) for v in (r,c,rs,cs)) or r<0 or c<0 or rs<1 or cs<1 or r+rs>len(rows) or c+cs>n: raise ValueError('合并单元格范围无效。')
                for rr in range(r,r+rs):
                    for cc in range(c,c+cs):
                        if (rr,cc) in merged: raise ValueError('合并单元格不能重叠。')
                        merged[rr,cc]=(r,c,rs,cs)
                anchors[r,c]=(rs,cs); joined_after.update(range(r,r+rs-1))
            original_heads=heads
            while heads and heads-1 in joined_after: heads+=1
            if heads!=original_heads: warnings.append('合并单元格跨越表头边界，重复表头已扩展至第 '+str(heads)+' 行。')
            row_heights=[values['fontSize']*1.5 for row in rows]
            for (r,c),(rs,cs) in anchors.items():
                contents='\n'.join(str(rows[rr][cc]) for rr in range(r,r+rs) for cc in range(c,c+cs) if cc<len(rows[rr]) and str(rows[rr][cc]))
                available=(values['width']-values['inner']-values['outer'])*72/25.4*sum(widths[c:c+cs])-12
                chars=max(1,available/values['fontSize']); lines=sum(max(1,math.ceil(len(line)/chars)) for line in contents.split('\n'))
                needed=(lines+1)*values['fontSize']*values['lineHeight']
                for rr in range(r,r+rs): row_heights[rr]=max(row_heights[rr],needed/rs)
                if needed>(values['height']-values['top']-values['bottom'])*72/25.4: warnings.append('表格合并组可能超过一页，请拆分合并组；PDF 不会拆分该组。')
            group_start=0
            for ri in range(len(rows)):
                if ri not in joined_after:
                    if ri>group_start and sum(row_heights[group_start:ri+1])>(values['height']-values['top']-values['bottom'])*72/25.4:
                        warnings.append('连接的跨行合并组高于版心，请拆分；不能保证该组完整落在一页内。')
                    group_start=ri+1
            def render(ri):
                cells=[];j=0
                while j<n:
                    merge=merged.get((ri,j)); span=merge[3] if merge and j==merge[1] else 1
                    if merge:
                        r,c,rs,cs=merge
                        if j!=c: j+=1;continue
                        t='\n'.join(str(rows[rr][cc]) for rr in range(r,r+rs) for cc in range(c,c+cs) if cc<len(rows[rr]) and str(rows[rr][cc])) if ri==r else ''
                        t=escape(t)
                        if ri==r and rs>1: t=r'\multirow[t]{'+str(rs)+'}{'+cell_width(c,cs)+'}{'+t+'}'
                        if cs>1: t=r'\multicolumn{'+str(cs)+'}{'+('|' if grid else '')+'p{'+cell_width(c,cs)+'}'+('|' if grid else '')+'}{'+(r'\rule{0pt}{'+str(round(row_heights[ri],2))+'pt}' if j==0 else '')+t+'}'
                    else: t=escape(rows[ri][j] if j<len(rows[ri]) else '')
                    # A phantom strut distributes space for long merged-cell text.
                    if j==0 and not (merge and span>1): t=r'\rule{0pt}{'+str(round(row_heights[ri],2))+'pt}'+t
                    cells.append(t);j+=span
                suffix=r' \\* ' if ri in joined_after else r' \\ '
                if grid:
                    active={cc for (rr,cc),(r,c,rs,cs) in merged.items() if rr==ri and r+rs-1>ri}
                    runs=[];start=None
                    for cc in range(n+1):
                        if cc<n and cc not in active:
                            if start is None:start=cc
                        elif start is not None:runs.append((start+1,cc));start=None
                    suffix+=''.join(r'\cline{'+str(a)+'-'+str(z)+'}' for a,z in runs)
                return ' & '.join(cells)+suffix
            content.append(r'\setlength{\ShuyeTableWidth}{\linewidth}'+r'\begin{longtable}{'+spec+'}')
            # Explicit spanning title rows avoid longtable's automatic table number.
            # Separate first/continuation heads also work when headerRows is zero.
            def table_head(continued=False):
                if text:
                    title=text+('（续）' if continued else '')
                    content.append(r'\multicolumn{'+str(n)+r'}{c}{\parbox{.95\ShuyeTableWidth}{\centering '+title+r'}} \\[6pt]')
                content.append(r'\hline' if grid else r'\toprule')
                content.extend(render(ri) for ri in range(heads))
                if heads and not grid: content.append(r'\midrule')
            table_head(); content.append(r'\endfirsthead')
            table_head(True); content.append(r'\endhead')
            content.extend(render(ri) for ri in range(heads,len(rows))); content.append((r'\hline' if grid else r'\bottomrule')+r'\end{longtable}')
            if cols>1: warnings.append('长表格以通栏输出，表格前后恢复双栏。')
            columns(True)
        elif typ=='toc': columns(False); content.append(r'\tableofcontents\clearpage'); columns(True)
        elif typ=='index':
            content.append(r'\section*{'+(text or '索引')+'}')
            for term in sorted(terms):
                refs=index_refs[term]
                content.append(escape(term)+r'\quad '+(', '.join(r'\pageref{'+label+'}' for label in refs) if refs else '—')+r'\par')
            warnings.append('索引为近似定位：仅扫描块标题/正文并标记块起始页；跨页段落、跨页表格的中间页及单元格词语不保证收全，出版前需核对。')
        else: warnings.append('未支持块 '+str(typ)+' 已按文字保留。'); content.append(text+r'\par')
    columns(False)
    for ident,n in notes.items():
        if ident not in note_seen or layout.get('notesMode')=='endnote':
            if ident not in note_seen: warnings.append('未引用脚注已追加文末：'+ident)
            content.append(r'\par\textbf{注 '+str(note_numbers[ident])+'} '+escape(n))
    return pre+'\n'.join(content)+'\n'+r'\end{document}',list(dict.fromkeys(warnings))

def render_pdf(doc):
    exe=shutil.which('xelatex') or (str(TEX_DEFAULT) if TEX_DEFAULT.exists() else None)
    if not exe: raise RuntimeError('未找到 XeLaTeX。请安装 TeX Live/TinyTeX 并加入 PATH。')
    if not _LOCK.acquire(blocking=False): raise RuntimeError('已有 PDF 正在排版，请稍后重试。')
    try:
        with tempfile.TemporaryDirectory(prefix='shuye-pdf-') as tmp:
            folder=Path(tmp); source,warnings=build_tex(doc,folder); (folder/'book.tex').write_text(source,encoding='utf-8')
            env=os.environ.copy(); env.update({'openin_any':'p','openout_any':'p','shell_escape':'f','TEXMFOUTPUT':tmp})
            for run in range(2):
                try: result=subprocess.run([exe,'-no-shell-escape','-interaction=nonstopmode','-halt-on-error','-file-line-error','book.tex'],cwd=tmp,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                except subprocess.TimeoutExpired: raise RuntimeError('PDF 编译超时，请缩短文稿或检查公式。')
                if result.returncode: raise RuntimeError('PDF 编译失败：'+result.stdout.decode('utf-8',errors='replace')[-2500:])
            log=result.stdout.decode('utf-8',errors='replace')
            if 'Overfull' in log: warnings.append('存在超出版心的行或表格，请检查 PDF。')
            if 'Missing character:' in log: warnings.append('存在字体缺字，请检查 PDF 并更换字体。')
            pdf=(folder/'book.pdf').read_bytes()
            return {'pdf':pdf,'warnings':warnings}
    finally: _LOCK.release()
