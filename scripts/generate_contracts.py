"""Reproducible Pydantic generation from the canonical wire registry."""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'packages/contracts/python/earthlab_contracts/models.py'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        # Inline the two standalone schemas so codegen emits one portable module.
        # Canonical runtime validation still follows the original local references.
        schema = json.loads((ROOT / 'contracts/api.schema.json').read_text(encoding='utf-8'))
        for definition in ('Scenario', 'CommandProposal'):
            reference = schema['$defs'][definition]['$ref']
            embedded = json.loads((ROOT / 'contracts' / reference).read_text(encoding='utf-8'))
            embedded.pop('$id', None)
            embedded.pop('$schema', None)
            # Pydantic turns date-time into AwareDatetime; a string regex cannot
            # be applied to that Python value. The canonical validator enforces Z.
            if definition == 'Scenario':
                embedded['properties']['selection']['properties']['eventTimeUtc'].pop('pattern', None)
            schema['$defs'][definition] = embedded
        source = Path(directory) / 'api.schema.json'
        source.write_text(json.dumps(schema), encoding='utf-8')
        generated = Path(directory) / 'models.py'
        subprocess.run([
            sys.executable, '-m', 'datamodel_code_generator',
            '--input', str(source),
            '--input-file-type', 'jsonschema', '--output', str(generated),
            '--output-model-type', 'pydantic_v2.BaseModel',
            '--target-python-version', '3.11', '--use-standard-collections',
            '--use-union-operator', '--enum-field-as-literal', 'all',
            '--field-constraints', '--disable-timestamp',
        ], check=True, cwd=ROOT)
        contents = generated.read_text(encoding='utf-8')
    if args.check:
        if TARGET.read_text(encoding='utf-8') != contents:
            raise SystemExit('Pydantic contracts are stale; run pnpm contracts:generate')
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(contents, encoding='utf-8', newline='\n')
    print(f'Pydantic contracts {"match" if args.check else "generated"}.')

if __name__ == '__main__':
    main()
