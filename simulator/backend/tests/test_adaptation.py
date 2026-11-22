import unittest
from types import SimpleNamespace

import numpy as np

from aquagrid.adaptation import evaluate
from aquagrid.routing import Router


class RegionalAdaptationTest(unittest.TestCase):
    def setUp(self):
        nodes = np.array([[-95.40, 29.70], [-95.399, 29.70], [-95.398, 29.70], [-95.40, 29.75]])
        segments = np.array([[0, 1], [1, 2], [0, 3]])
        times = np.array([60., 60., 120.])
        length = np.array([100., 100., 450.])
        router = Router(*segments.T, times, length, nodes, [nodes[uv] for uv in segments])
        self.depth = np.array([0.42, 0.05, 0.031])
        self.engine = SimpleNamespace(
            meta={"hospitals": [{"id": "clinic", "node": 0}]}, router=router, bld_node=np.array([1, 2, 3]),
            edge_len=length, edge_name=np.array(["Community Road", "East Street", "Community Road"]),
            _dry=lambda src, clearance: (times, router.access_times(src, times)),
            predict=lambda scenario: (self.depth, None, None),
        )

    def test_rerouting_and_geographic_worksite(self):
        harden = evaluate(self.engine, None, "mitigation", "ambulance", "clinic")
        self.assertEqual(harden["outcomes"][0]["cut_off"], 2)
        self.assertEqual(harden["outcomes"][-1]["cut_off"], 0)
        self.assertLess(harden["outcomes"][-1]["delay_minutes"], harden["outcomes"][0]["delay_minutes"])
        work = next(site for site in harden["corridors"] if site["name"] == "Community Road")
        # Same street name, different part of town: only the 100 m segment is treated.
        self.assertEqual(work["length_m"], 100)
        pump = evaluate(self.engine, None, "response", "ambulance", "clinic")
        self.assertEqual(pump["outcomes"][-1]["cut_off"], 2)
        np.testing.assert_array_equal(self.depth, [0.42, 0.05, 0.031])

    def test_dry_weather_has_no_spend_or_interventions(self):
        self.depth[:] = 0
        result = evaluate(self.engine, None, "mitigation", "ambulance", "clinic")
        self.assertEqual(result["corridors"], [])
        self.assertEqual(result["outcomes"], [{"delay_minutes": 0, "cut_off": 0, "blocked_km": 0, "impaired_km": 0}])
