import copy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from earthlab_contracts.models import CommandProposal, Evaluation, Scenario
from earthlab_contracts.validation import validate_contract

ROOT = Path(__file__).resolve().parents[3]

def load(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

@pytest.mark.parametrize('name,path,model', [
    ('Scenario', 'contracts/example-scenario.json', Scenario),
    ('CommandProposal', 'contracts/example-command.json', CommandProposal),
    ('Evaluation', 'data/fixtures/offline-evaluation.json', Evaluation),
])
def test_examples_obey_canonical_and_generated_contracts(name, path, model):
    payload = load(path)
    validate_contract(name, payload)
    validate_contract(name, model.model_validate(payload).model_dump(mode='json', exclude_unset=True))

@pytest.mark.parametrize('mutation', [
    lambda scenario: scenario.update(unrecognized=True),
    lambda scenario: scenario['selection'].update(countyFips=[]),
    lambda scenario: scenario['selection'].update(countyFips=['48201', '48201']),
    lambda scenario: scenario['selection'].update(eventTimeUtc='2024-01-01'),
    lambda scenario: scenario['selection'].update(eventTimeUtc='2024-01-01T00:00:00+01:00'),
    lambda scenario: scenario.update(scenarioVersion='1'),
])
def test_wire_validation_rejects_invalid_or_coerced_input(mutation):
    scenario = copy.deepcopy(load('contracts/example-scenario.json'))
    mutation(scenario)
    with pytest.raises(ValidationError):
        validate_contract('Scenario', scenario)

def test_offline_fixture_cannot_claim_trained_evidence():
    fixture = load('data/fixtures/offline-evaluation.json')
    metadata = fixture['modelMetadata']
    assert metadata['status'] == 'not_trained'
    assert metadata['dataMode'] == 'offline_example'
    assert metadata['evaluation'] is None
    assert metadata['trainingDatasetIds'] == []
    assert all(p['dataMode'] == 'offline_example' for p in fixture['predictions'])
    geo = load('data/fixtures/houston-counties.geojson')
    assert {f['properties']['countyFips'] for f in geo['features']} == {p['countyFips'] for p in fixture['predictions']}
    for feature in geo['features']:
        assert feature['properties']['geometryKind'] == 'schematic'
        ring = feature['geometry']['coordinates'][0]
        assert ring[0] == ring[-1]
        assert all(-180 <= lon <= 180 and -90 <= lat <= 90 for lon, lat in ring)

def test_response_envelope_rejects_missing_metadata():
    with pytest.raises(ValidationError):
        validate_contract('Envelope', {'data': {}, 'error': None})
