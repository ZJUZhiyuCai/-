"""Package only independent sources, original fixtures and current proof PDFs."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8-sig'))['version']
destination = root / 'output' / f'open-typesetter-{version}-source.zip'
destination.parent.mkdir(parents=True, exist_ok=True)
files = [p for p in root.iterdir() if p.is_file() and p.suffix in {'.py', '.mjs', '.html', '.css', '.json', '.cmd', '.md', '.txt'}]
files.append(root / 'LICENSE')
files.append(root / '.gitignore')
for folder in ['src', 'tests', 'examples', 'vendor', 'docs', 'scripts', '.github']:
    files += [p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc' and p.name != 'finalize-acceptance.py']
for name in ['ruby-and-table.pdf', 'ruby-and-table-booklet.pdf', 'production-report.json']:
    proof = root / 'output/pdf' / name
    if proof.is_file():
        files.append(proof)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        archive.write(path, Path('open-typesetter') / path.relative_to(root))
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    print(f'{len(archive.namelist())} files; {destination.stat().st_size} bytes')
