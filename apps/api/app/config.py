"""Local paths and public runtime configuration; no credentials are loaded here."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = REPO_ROOT / "data" / "fixtures"
CONTRACT_DIR = REPO_ROOT / "contracts"
REGION_ID = "houston-gulf-coast"
SOURCE_ID = "project:offline-fixture-v1"
OFFLINE_WARNING = "OFFLINE EXAMPLE: project-generated values; no trained model or observed outage measurements."


def cors_origins() -> list[str]:
    return [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ]
