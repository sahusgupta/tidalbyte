"""Region metadata and geometry stay usable before inference is initialized."""
import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from starlette.requests import Request

from aquagrid import api
from aquagrid.catalog import MODEL_FIELDS
from aquagrid.geometry import prepare_geometry


def request(**headers):
    return Request({"type": "http", "method": "GET", "headers": [
        (key.replace("_", "-").encode(), value.encode()) for key, value in headers.items()
    ]})


class RegionStartupTests(unittest.TestCase):
    def setUp(self):
        self.out = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (self.out / "static").mkdir()
        (self.out / "model").mkdir()
        (self.out / "model" / "flood_xgb.ubj").touch()
        self.enterContext(patch.dict(api.REGIONS, {"example": SimpleNamespace(out_dir=self.out)}))
        self.path = self.out / "static" / "buildings.json"
        self.path.write_bytes(b'{"polys":[],"h":[]}')

    def test_metadata_needs_only_catalog_files(self):
        metrics = dict.fromkeys(MODEL_FIELDS, 1)
        (self.out / "model" / "metrics.json").write_text(json.dumps(metrics))
        (self.out / "static" / "meta.json").write_text('{"region":{"id":"example"}}')
        meta = api.meta("example")
        self.assertEqual(meta["region"]["id"], "example")
        self.assertEqual(meta["model"], metrics)
        self.assertIn("memorial", meta["presets"])
        self.assertIn("ambulance", meta["vehicles"])

    def test_built_geometry_is_revalidated_and_keeps_its_json_representation(self):
        prepare_geometry(self.path)
        response = api.buildings("example", request(accept_encoding="br, gzip"))
        self.assertEqual(response.headers["content-encoding"], "gzip")
        self.assertEqual(response.headers["content-type"], "application/json")
        self.assertEqual(gzip.decompress(Path(response.path).read_bytes()), self.path.read_bytes())
        cached = api.buildings("example", request(accept_encoding="gzip", if_none_match=response.headers["etag"]))
        self.assertEqual(cached.status_code, 304)
        self.assertEqual(cached.body, b"")
        identity = api.buildings("example", request())
        self.assertEqual(identity.path, self.path)
        self.assertNotEqual(identity.headers["etag"], response.headers["etag"])

    def test_legacy_and_rebuilt_geometry_do_not_serve_stale_bytes(self):
        self.assertEqual(api.buildings("example", request(accept_encoding="gzip")).path, self.path)
        prepare_geometry(self.path)
        previous = api.buildings("example", request(accept_encoding="gzip"))
        updated = self.path.stat().st_mtime_ns + 2_000_000_000
        self.path.write_bytes(b'{"polys":[[]],"h":[42]}')
        os.utime(self.path, ns=(updated, updated))
        fresh = api.buildings("example", request(accept_encoding="gzip", if_none_match=previous.headers["etag"]))
        self.assertEqual(fresh.status_code, 200)
        self.assertEqual(fresh.path, self.path)
        prepare_geometry(self.path)
        compressed = api.buildings("example", request(accept_encoding="gzip"))
        self.assertEqual(gzip.decompress(Path(compressed.path).read_bytes()), self.path.read_bytes())
