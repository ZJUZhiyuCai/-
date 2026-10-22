"""Strict, independently implemented presentation MathML -> OMML adapter.

No Office stylesheet is required. Unknown structures/attributes fail closed;
the caller keeps the original OLE digest in the conversion audit.
"""
import xml.etree.ElementTree as ET
M='{http://schemas.openxmlformats.org/officeDocument/2006/math}'
ML='http://www.w3.org/1998/Math/MathML'

def mathml_to_omml(source):
    if len(source)>1000000 or '<!DOCTYPE' in source.upper() or '<!ENTITY' in source.upper():
        raise ValueError('MathML size/entity limit')
    root=ET.fromstring(source)
    def node(k,*children):
        e=ET.Element(M+k);e.extend(children);return e
    def prop(k,**values):
        p=node(k+'Pr')
        for key,value in values.items():ET.SubElement(p,M+key,{M+'val':str(value)})
        return p
    def convert(e,style=None):
        k=e.tag.rsplit('}',1)[-1]
        if e.tag.startswith('{') and not e.tag.startswith('{'+ML+'}'):
            raise ValueError('Foreign MathML namespace')
        allowed={'display','mathvariant','displaystyle','scriptlevel','stretchy','accent','accentunder','open','close','separators'}
        if any(a not in allowed for a in e.attrib):raise ValueError('Unsupported MathML attribute: '+str(e.attrib))
        style=e.get('mathvariant',style)
        def wrap(k,child):return node(k,*convert(child,style))
        if k in ('mi','mn','mo','mtext','ms'):
            if len(e):raise ValueError('Nested MathML token')
            r=node('r');props=node('rPr')
            variants={'normal':('p',None),'italic':('i',None),'bold':('b',None),'bold-italic':('bi',None),
                      'double-struck':('p','double-struck'),'script':('i','script'),'fraktur':('i','fraktur'),
                      'sans-serif':('p','sans-serif'),'monospace':('p','monospace')}
            if style and style not in variants:raise ValueError('Unsupported MathML variant '+style)
            sty,scr=variants.get(style,('p' if k in ('mtext','ms') else 'i',None))
            ET.SubElement(props,M+'sty',{M+'val':sty})
            if k in ('mtext','ms'):ET.SubElement(props,M+'nor')
            if scr:ET.SubElement(props,M+'scr',{M+'val':scr})
            r.append(props);ET.SubElement(r,M+'t').text=e.text or '';return [r]
        if k in ('math','mrow','mstyle','mtd'):
            if (e.text or '').strip() or any((c.tail or '').strip() for c in e):raise ValueError('Bare MathML text')
            if k=='mrow' and len(e)>=2 and e[0].tag.rsplit('}',1)[-1]=='mo' and e[0].get('stretchy')!='false':
                opening=e[0].text or '';closing={'(':')','[':']','{':'}','|':'|','‖':'‖'}.get(opening)
                has_close=closing is not None and e[-1].tag.rsplit('}',1)[-1]=='mo' and e[-1].text==closing
                if has_close or (opening=='{' and any(c.tag.rsplit('}',1)[-1]=='mtable' for c in e.iter())):
                    contents=list(e)[1:-1] if has_close else list(e)[1:]
                    return [node('d',prop('d',begChr=opening,endChr=closing if has_close else '',sepChr=''),node('e',*[x for c in contents for x in convert(c,style)]))]
            return [x for c in e for x in convert(c,style)]
        if k=='none':return []
        expected={'mfrac':2,'msqrt':None,'mroot':2,'msub':2,'msup':2,'msubsup':3,'munder':2,'mover':2,'munderover':3}
        if k in expected and expected[k] is not None and len(e)!=expected[k]:raise ValueError('Invalid MathML slots '+k)
        if k=='mfrac':return [node('f',wrap('num',e[0]),wrap('den',e[1]))]
        if k in ('msqrt','mroot'):
            content=node('e',*[x for c in (e if k=='msqrt' else [e[0]]) for x in convert(c,style)])
            return [node('rad',prop('rad',degHide=1 if k=='msqrt' else 0),node('deg') if k=='msqrt' else wrap('deg',e[1]),content)]
        if k in ('msub','msup','msubsup'):
            return [node({'msub':'sSub','msup':'sSup','msubsup':'sSubSup'}[k],wrap('e',e[0]),
                         *([wrap('sub',e[1])] if k!='msup' else []),
                         *([wrap('sup',e[-1])] if k!='msub' else []))]
        if k in ('munder','mover','munderover'):
            if k=='mover' and e.get('accent')=='true':
                accent=''.join(e[1].itertext());accent={'¯':'̅','^':'̂','~':'̃','→':'⃗'}.get(accent,accent)
                return [node('acc',prop('acc',chr=accent),wrap('e',e[0]))]
            base=convert(e[0],style);op=''.join(e[0].itertext())
            if op in ('∑','∏','∫','∮','⋃','⋂','∐','∬','∭'):
                return [node('nary',prop('nary',chr=op,limLoc='undOvr',subHide=1 if k=='mover' else 0,supHide=1 if k=='munder' else 0),
                             node('sub') if k=='mover' else wrap('sub',e[1]),
                             node('sup') if k=='munder' else wrap('sup',e[-1]),node('e'))]
            if k in ('munder','munderover'):base=[node('limLow',node('e',*base),wrap('lim',e[1]))]
            if k in ('mover','munderover'):base=[node('limUpp',node('e',*base),wrap('lim',e[-1]))]
            return base
        if k=='mmultiscripts':
            if not len(e):raise ValueError('Empty multiscripts')
            base=convert(e[0],style);i=1;pre=False
            while i<len(e):
                if e[i].tag.rsplit('}',1)[-1]=='mprescripts':pre=True;i+=1;continue
                if i+1>=len(e):raise ValueError('Incomplete multiscripts')
                base=[node('sPre' if pre else 'sSubSup',node('e',*base),wrap('sub',e[i]),wrap('sup',e[i+1]))];i+=2
            return base
        if k=='mtable':
            rows=[]
            for row in e:
                if row.tag.rsplit('}',1)[-1]!='mtr':raise ValueError('Invalid math table row')
                if any(c.tag.rsplit('}',1)[-1]!='mtd' for c in row):raise ValueError('Invalid math table cell')
                rows.append(node('mr',*[wrap('e',c) for c in row]))
            return [node('m',*rows)]
        if k=='mfenced':return [node('d',prop('d',begChr=e.get('open','('),endChr=e.get('close',')'),sepChr=e.get('separators',',')),*[wrap('e',c) for c in e])]
        raise ValueError('Unsupported MathML element '+k)
    return node('oMath',*convert(root))
