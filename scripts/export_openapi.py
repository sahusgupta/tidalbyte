"""Export the runnable FastAPI contract deterministically; CI detects drift."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'apps/api'), str(ROOT / 'packages/contracts/python')]
from app.main import app  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
target = ROOT / 'contracts/openapi.json'
contents = json.dumps(app.openapi(), indent=2, sort_keys=True) + '\n'
if args.check:
    if target.read_text(encoding='utf-8') != contents:
        raise SystemExit('OpenAPI is stale; run pnpm openapi:generate')
else:
    target.write_text(contents, encoding='utf-8', newline='\n')
print(f'OpenAPI {"matches" if args.check else "exported"}.')
