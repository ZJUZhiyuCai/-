"""Validate the acceptance ledger; --require-complete fails on incomplete items."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--require-complete', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'docs/acceptance.json').read_text(encoding='utf-8-sig'))
ids = [item['id'] for item in data['items']]
assert len(ids) == len(set(ids)), 'Duplicate acceptance IDs'
for item in data['items']:
    for path in item['code']:
        assert (root / path).is_file(), f'Missing evidence source: {path}'
pending = [item['id'] for item in data['items'] if item['implementation'] != 'complete' or item['original_11_compatibility'] != 'passed']
print(json.dumps({'items': len(ids), 'pending_full_acceptance': pending, 'complete_release_allowed': not pending and data['overall_status'] == 'complete'}, ensure_ascii=False))
if args.require_complete and (pending or data['overall_status'] != 'complete'):
    raise SystemExit(2)
