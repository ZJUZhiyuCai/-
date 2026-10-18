"""Break only at outer binary/relation operators; retain all expression tokens."""
import re

def continues_equation(tex):
    tail=re.sub(r'\\(?:mathrm|text)\{\s*([=<>+\-])\s*\}',r'\1',tex).rstrip()
    return bool(re.search(r'(?:[=<>+\-]|\\(?:leq|geq|approx|equiv))$',tail))

def inline_breaks(tex):
    """Offer breaks between outer list items, without splitting math atoms.

    A single OMML object can contain several comma-separated assignments. A
    TeX inline box may fit the measure but leave no viable justified text line
    before it. Break at its outer separators, never inside a fraction, matrix,
    script or paired delimiter. The source expression remains unchanged.
    """
    out=[];depth=0;delimiters=0;environments=0;i=0
    while i<len(tex):
        if tex[i]=='\\':
            environment=re.match(r'\\(begin|end)\{[A-Za-z]+\}',tex[i:])
            if environment:
                environments+=1 if environment[1]=='begin' else -1
                out.append(environment[0]);i+=len(environment[0]);continue
            separator=re.match(r'\\(?:text|mathrm|symup)\{[,，;；]\}',tex[i:])
            if separator and not depth and not delimiters and not environments:
                out.append(separator[0]+r'\allowbreak ');i+=len(separator[0]);continue
            token=re.match(r'\\(?:[A-Za-z]+|.)',tex[i:])[0]
            if token==r'\left':delimiters+=1
            elif token==r'\right':delimiters=max(0,delimiters-1)
            out.append(token);i+=len(token);continue
        c=tex[i];out.append(c)
        if c=='{':depth+=1
        elif c=='}':depth-=1
        elif c in ',;' and not depth and not delimiters and not environments:out.append(r'\allowbreak ')
        i+=1
    return ''.join(out)

def break_formula(tex,display=True):
    if '\\begin{' in tex:return tex
    # Upright styling of punctuation has no mathematical distinction.
    value=re.sub(r'\\mathrm\{([=+<>,-])\}',r'\1',tex)
    # Delimited lists may be wider than an entire page. Break their contents
    # without removing either delimiter, or changing any mathematical tokens.
    pairs=[];stack=[];i=0
    token=re.compile(r'\\(?:left|right)(?:\\[A-Za-z]+\s*|\\.|.)')
    for m in token.finditer(value):
        if m[0].startswith('\\left'):stack.append(m)
        elif stack:
            left=stack.pop()
            if not stack:pairs.append((left,m))
    for left,right in reversed(pairs):
        inner=value[left.end():right.start()]
        if visual_length(inner)>75:
            wrapped=break_formula(inner,display)
            if wrapped!=inner:value=value[:left.end()]+wrapped+value[right.start():]
    depth=0;delimiters=0;cuts=[];i=0
    while i<len(value):
        if value[i]=='\\':
            m=re.match(r'\\(?:[A-Za-z]+|.)',value[i:]);cmd=m[0];i+=len(cmd)
            if cmd=='\\left':delimiters+=1
            if cmd=='\\right':delimiters=max(0,delimiters-1)
            if not depth and not delimiters and cmd=='\\text' and i>5:cuts.append(i-len(cmd))
            if not depth and not delimiters and cmd in ('\\leq','\\geq','\\approx','\\equiv'):cuts.append(i-len(cmd))
            continue
        c=value[i]
        if c=='{':depth+=1
        elif c=='}':depth-=1
        elif not depth and not delimiters and c in '=+<>,':cuts.append(i)
        i+=1
    cuts=[p for p in cuts if p>0]
    if not cuts:return tex
    parts=[value[a:b] for a,b in zip([0]+cuts,cuts+[len(value)])]
    lines=[];line=''
    for part in parts:
        if visual_length(line)>16 and visual_length(line+part)>65:lines.append(line);line=''
        line+=part
    if line:lines.append(line)
    if len(lines)<2:return value
    # Only layout markup is inserted. Never delete, crop or scale mathematical data.
    return r'\begin{gathered}'+r' \\ '.join((r'\displaystyle ' if display else r'\textstyle ')+line for line in lines)+r'\end{gathered}'

def visual_length(tex):
    visible=re.sub(r'\\[A-Za-z]+|[{}_^]','',tex)
    return sum(2 if ord(c)>0x3000 else 1 for c in visible)
