"""Validate the inert mathematical source used by editable Word exports."""
import hashlib
from lxml import etree as ET
from omml import to_tex

M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
XML = 'http://www.w3.org/XML/1998/namespace'
# Word run formatting is permitted inside OMML. Fields, OLE, relationships,
# alternate chunks and arbitrary document content are never mathematical data.
WORD_PROPERTIES = set('rPr rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath'.split())
WORD_MARKERS = set('bookmarkStart bookmarkEnd proofErr lastRenderedPageBreak commentRangeStart commentRangeEnd'.split())
WORD_FONT_FEATURES = set('ligatures numForm numSpacing stylisticSets stylisticSet cntxtAlts'.split())


def validated_source(model):
    source = model.get('sourceOmml')
    if not source or hashlib.sha256(source.encode()).hexdigest() != model.get('sourceSha256'):
        raise ValueError('EDITABLE_OMML_SOURCE_REQUIRED: '+model.get('id', ''))
    if '<!DOCTYPE' in source or '<!ENTITY' in source:
        raise ValueError('UNSAFE_OMML_SOURCE: entity declarations are not mathematical content')
    root = ET.fromstring(source.encode(), ET.XMLParser(resolve_entities=False, no_network=True))
    if root.tag not in ('{'+M+'}oMath', '{'+M+'}oMathPara'):
        raise ValueError('INVALID_OMML_ROOT')
    for node in root.iter():
        if not isinstance(node.tag, str):
            raise ValueError('UNSAFE_OMML_SOURCE: non-element content')
        name = ET.QName(node)
        if not (name.namespace == M or
                name.namespace == W and name.localname in WORD_PROPERTIES | WORD_MARKERS or
                name.namespace == W14 and name.localname in WORD_FONT_FEATURES):
            raise ValueError('UNSAFE_OMML_SOURCE: '+name.localname)
        for key in node.attrib:
            attribute = ET.QName(key)
            if attribute.namespace not in (M, W, W14, XML) or attribute.localname in ('instr', 'href'):
                raise ValueError('UNSAFE_OMML_SOURCE: '+attribute.localname)
    warnings = []
    current = to_tex(root, warnings)
    if warnings:
        raise ValueError('UNSAFE_OMML_SOURCE: unsupported mathematical content')
    # A valid digest only binds the supplied XML, not the current edited TeX.
    # Requiring reconciliation prevents a newer PDF and an older Word formula
    # from both being reported as verified versions of the same document.
    if current.strip() != model.get('text', '').strip():
        raise ValueError('WORD_FORMULA_EDIT_NOT_RECONCILED: '+model.get('id', ''))
    return root
