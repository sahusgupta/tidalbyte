#!/usr/bin/env python3
"""Validates docs and initial JSON contracts; run `python scripts/validate_kit.py`."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
needed=['README.md','AGENTS.md','CLAUDE.md','STATUS.md','DECISIONS.md','docs/00-START-HERE.md','docs/04-DESIGN.md','contracts/scenario.schema.json','contracts/command.schema.json','skills/interface-craft/SKILL.md']
for name in needed:
 assert (root/name).is_file(), f'Missing {name}'
for name in ['contracts/scenario.schema.json','contracts/command.schema.json','contracts/example-scenario.json','contracts/example-command.json']:
 json.loads((root/name).read_text())
print('Kit files and JSON parse successfully.')
