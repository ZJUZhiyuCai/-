"""Bounded JSON stdin/stdout adapter for the existing publishing backend."""
import base64
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

def main():
    request=json.loads(sys.stdin.buffer.read(30*1024*1024+1))
    command=request['command']
    if command=='capabilities':
        import importlib.util
        import shutil
        from publishing import TEX_DEFAULT
        return {'python':sys.version.split()[0],'xelatex':bool(shutil.which('xelatex') or TEX_DEFAULT.exists()),'pypdf':importlib.util.find_spec('pypdf') is not None,'pillow':importlib.util.find_spec('PIL') is not None,'platform':sys.platform}
    if command=='preflight_pdf':
        from print_production import process_pdf
        output=process_pdf(base64.b64decode(request['data'],validate=True),request.get('options',{}))
        return {'pdf':base64.b64encode(output['pdf']).decode('ascii'),'report':output['report']}
    if command=='import_docx':
        from docx_import import import_docx
        return import_docx(base64.b64decode(request['data'],validate=True))
    from publishing import render_pdf
    result=render_pdf(request['document'])
    from print_production import process_pdf
    output=process_pdf(result['pdf'],request.get('options',{}))
    output['report']['layoutWarnings']=result['warnings']
    return {'pdf':base64.b64encode(output['pdf']).decode('ascii'),'report':output['report']}

if __name__=='__main__':
    try:
        sys.stdout.buffer.write(json.dumps(main(),ensure_ascii=False).encode('utf-8'))
    except Exception as error:
        sys.stdout.buffer.write(json.dumps({'error':str(error)},ensure_ascii=False).encode('utf-8'))
        sys.exit(1)
