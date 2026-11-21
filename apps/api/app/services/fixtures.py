"""Load the offline fixture once, and reject unsupported scenario semantics."""

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from app.config import CONTRACT_DIR, FIXTURE_DIR, REGION_ID
from app.responses import reject
from app.schemas import Evaluation, Scenario


class OfflineFixtures:
    def __init__(self, fixture_dir: Path = FIXTURE_DIR) -> None:
        self.evaluation = Evaluation.model_validate_json(
            (fixture_dir / "offline-evaluation.json").read_text(encoding="utf-8")
        ).model_dump(mode="json")
        self.counties = json.loads(
            (fixture_dir / "houston-counties.geojson").read_text(encoding="utf-8")
        )
        schema = json.loads((CONTRACT_DIR / "scenario.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self.scenario_validator = Draft202012Validator(schema, format_checker=FormatChecker())
        self.preset = self.evaluation["scenario"]
        self.predictions = {
            item["countyFips"]: item for item in self.evaluation["predictions"]
        }
        if self.counties.get("type") != "FeatureCollection" or not self.counties.get("features"):
            raise ValueError("Offline county fixture must be a non-empty GeoJSON FeatureCollection")
        if any(item["dataMode"] != "offline_example" for item in self.predictions.values()):
            raise ValueError("Offline fixtures must never claim trained predictions")
        metadata = self.evaluation["modelMetadata"]
        if metadata["dataMode"] != "offline_example" or metadata["status"] != "not_trained":
            raise ValueError("Offline metadata must explicitly identify the absence of a trained model")
        if metadata["evaluation"] is not None or metadata["trainingDatasetIds"] or metadata["featureSchema"]:
            raise ValueError("Offline metadata must not invent evaluation results, datasets, or model features")

    def validate_region(self, region_id: str) -> None:
        if region_id != REGION_ID:
            reject(404, "unknown_region", "Only the Houston Gulf Coast example region is available.")

    def evaluate(self, scenario: Scenario, raw: dict[str, Any]) -> dict[str, Any]:
        # Validate the original JSON, so type coercion cannot silently relax the contract.
        errors = sorted(self.scenario_validator.iter_errors(raw), key=lambda item: str(item.path))
        if errors:
            reject(
                422,
                "invalid_scenario",
                "Scenario does not match the canonical v1 contract.",
                [{"path": list(item.path), "message": item.message} for item in errors],
            )
        values = scenario.model_dump(mode="json")
        self.validate_region(values["regionId"])
        if values["presetEventId"] != self.preset["presetEventId"]:
            reject(404, "unknown_event", "The requested event is not in the offline catalog.")
        selection = values["selection"]
        county_ids = selection["countyFips"]
        if not county_ids or len(county_ids) != len(set(county_ids)):
            reject(422, "invalid_counties", "Select one or more unique supported county FIPS codes.")
        if any(county not in self.predictions for county in county_ids):
            reject(422, "unsupported_county", "Selected county is not supported by the offline example.")
        if values.get("perturbations"):
            reject(422, "unsupported_parameter", "No trained feature ranges exist; perturbations are unavailable.")
        if values["modelMode"] != "historical_context":
            reject(422, "unsupported_mode", "The offline preset cannot evaluate exploratory what-if scenarios.")
        if selection["warningTypes"] != self.preset["selection"]["warningTypes"]:
            reject(422, "unsupported_warning", "Use the warning types published with the offline preset.")
        event_time = datetime.fromisoformat(selection["eventTimeUtc"].replace("Z", "+00:00"))
        preset_time = datetime.fromisoformat(self.preset["selection"]["eventTimeUtc"].replace("Z", "+00:00"))
        if event_time.utcoffset() is None or event_time.utcoffset().total_seconds() != 0:
            reject(422, "unsupported_time", "eventTimeUtc must use UTC.")
        if event_time != preset_time:
            reject(422, "unsupported_time", "Only the fixed example timestamp is available.")
        result = deepcopy(self.evaluation)
        result["scenario"] = values
        result["predictions"] = [deepcopy(self.predictions[county]) for county in county_ids]
        return Evaluation.model_validate(result).model_dump(mode="json")
