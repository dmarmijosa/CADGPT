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


if __name__ == "__main__":
    unittest.main()
