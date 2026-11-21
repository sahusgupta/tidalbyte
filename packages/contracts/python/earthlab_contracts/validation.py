"""Canonical runtime validation, including constraints code generation cannot express."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[4]
SCHEMAS = ROOT / 'contracts'
registry = Registry()
for path in sorted(SCHEMAS.glob('*.schema.json')):
    schema = json.loads(path.read_text(encoding='utf-8'))
    resource = Resource.from_contents(schema)
    for uri in (path.as_uri(), schema['$id'], f'https://example.local/earthlab/{path.name}'):
        registry = registry.with_resource(uri, resource)

def validate_contract(name: str, payload: object) -> None:
    """Raise jsonschema.ValidationError on invalid wire data; never fetch remote refs."""
    if name == 'Envelope':
        reference = (SCHEMAS / 'envelope.schema.json').as_uri()
    else:
        reference = (SCHEMAS / 'api.schema.json').as_uri() + '#/$defs/' + name
    Draft202012Validator(
        {'$ref': reference}, registry=registry, format_checker=FormatChecker()
    ).validate(payload)
