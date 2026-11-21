"""Hospital selection must not route to a known mislocated outpatient record."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import geopandas as gpd
import numpy as np
from shapely.geometry import Point

from aquagrid.pipeline.build import _excluded_hospital_place, derive_pois


def place(name, point, record_id, confidence=0.95, provider="brightquery"):
    return {
        "names": {"primary": name},
        "basic_category": "health_care" if "Ben Taub" in name else "emergency_department",
        "confidence": confidence,
        "operating_status": "open",
        "sources": np.array([{"provider": provider, "record_id": record_id}], dtype=object),
        "geometry": Point(*point),
    }


class HospitalCatalogTests(unittest.TestCase):
    def test_mislocated_record_cannot_displace_actual_hospital(self):
        actual = (-95.3997, 29.7113)
        places = gpd.GeoDataFrame([
            place("Ben Taub General Hospital", (-95.38712, 29.68603), "388529825", 0.99),
            place("Ben Taub General Hospital", actual, "valid-campus", 0.96),
            place("Red Duke Trauma Institute", (-95.39655, 29.7142), "trauma-campus"),
        ], crs="EPSG:4326")
        with tempfile.TemporaryDirectory() as directory:
            region = SimpleNamespace(bbox=(-95.45, 29.67, -95.36, 29.74), raw_dir=Path(directory))
            with patch("aquagrid.pipeline.build.gpd.read_parquet", return_value=places):
                hospitals, _, _ = derive_pois(region)
        taub = next(hospital for hospital in hospitals if hospital.name == "Ben Taub General Hospital")
        self.assertEqual((taub.lon, taub.lat), actual)
        self.assertIn("Red Duke Trauma Institute", [hospital.name for hospital in hospitals])

    def test_corrected_source_location_is_not_excluded(self):
        row = SimpleNamespace(
            geometry=Point(-95.3997, 29.7113),
            get=lambda key: [{"provider": "brightquery", "record_id": "388529825"}],
        )
        self.assertFalse(_excluded_hospital_place(row))

    def test_other_provider_and_missing_sources_are_not_excluded(self):
        for sources in (None, float("nan"), [{"provider": "other", "record_id": "388529825"}]):
            row = SimpleNamespace(geometry=Point(-95.38712, 29.68603), get=lambda key: sources)
            self.assertFalse(_excluded_hospital_place(row))


if __name__ == "__main__":
    unittest.main()
