"""4b.5: the agent's OPS dict must cover every server-exposed op listed in
the shared `ops-allowlist.json` fixture (spec mcp-cad-operations "Agent
re-validates allowlist"). Read by relative path from this test file to the
repo root, mirroring `apps/api/test/tools-b2.test.ts`."""
import json
import unittest
from pathlib import Path

from cadgpt_agent.freecad_worker import OPS

FIXTURE = Path(__file__).resolve().parents[2] / "ops-allowlist.json"


class OpsAllowlistTests(unittest.TestCase):
    def test_worker_ops_is_a_superset_of_the_shared_allowlist(self):
        fixture_ops = set(json.loads(FIXTURE.read_text(encoding="utf-8"))["ops"])
        self.assertTrue(
            fixture_ops.issubset(set(OPS)),
            f"OPS is missing: {fixture_ops - set(OPS)}",
        )

    def test_autocad_ops_matches_proven_shared_allowlist(self):
        from cadgpt_agent.discovery import AUTOCAD_OPS
        fixture_ops = set(json.loads(FIXTURE.read_text(encoding="utf-8"))["ops"])
        autocad_ops = set(AUTOCAD_OPS)
        self.assertTrue(
            autocad_ops.issubset(fixture_ops),
            f"AUTOCAD_OPS has unexpected ops: {autocad_ops - fixture_ops}",
        )
        self.assertEqual(autocad_ops, fixture_ops)

    def test_unproven_ops_excluded_from_autocad_ops(self):
        from cadgpt_agent.discovery import AUTOCAD_OPS
        for unproven in ("step_export", "iges_export", "fillet", "chamfer", "loft", "sweep"):
            self.assertNotIn(unproven, AUTOCAD_OPS)



if __name__ == "__main__":
    unittest.main()
