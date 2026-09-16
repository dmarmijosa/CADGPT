# Apply Progress — cadengine-phase5-image-to-cad-ocr-privacy

## Work Unit 1: 3D Typography & Multi-Wire Polygon Extrusions

- **Status**: Completed (tasks 1.1, 1.2, 1.3, 1.4, 1.5 complete)
- **Focused Test Command**: `.venv/bin/python -m unittest discover -s agent/tests -v && npm test`
- **Completed Tasks**:
  - [x] 1.1 Update [ops-allowlist.json](file:///Users/danny/Documents/ChatGPT/CADGPT/ops-allowlist.json) to 20 canonical operations (adding `create_text_3d` and `analyze_image_to_cad`), export updated `FREECAD_OPS` in [discovery.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py), bundle [Inter-Bold.ttf](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/fonts/Inter-Bold.ttf), and implement `_resolve_font` fallback chain in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py).
  - [x] 1.2 Implement `_create_text_3d` in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) supporting `Draft.make_shapestring`, thickness extrusion, `flat`/`emboss`/`engrave` modes, plane mapping (`XY`, `XZ`, `YZ`), tracking offset, and OpenCASCADE error rollback.
  - [x] 1.3 Upgrade `_extrude_polygon` in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) to support nested inner cutouts (`holes` array of up to 20 loops), constructing `Part.Face([outer_wire] + hole_wires)`, and expand `extrudePolygonSchema` in [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts).
  - [x] 1.4 Add strict Zod schemas (`createText3dSchema`) in [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts), register `create_text_3d` MCP tool, export updated `FREECAD_OPS` (20 ops) in capabilities, and add comprehensive unit tests in [test_freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_freecad_worker.py), [test_ops_allowlist.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/tests/test_ops_allowlist.py), and [tools.test.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/test/tools.test.ts).
  - [x] 1.5 Verified all tests pass (209 Python unit tests, 101 API tests, 67 web tests), ran `npm run format`, updated `tasks.md` marking 1.1-1.4 as completed, and generated this progress report with Work Unit Evidence table.

### Work Unit Evidence Table

| Work Unit | Goal | Files Changed | Verification Command | Result |
|---|---|---|---|---|
| WU1 | 3D Typography & Multi-Wire Polygon Extrusions | `ops-allowlist.json`, `agent/cadgpt_agent/fonts/Inter-Bold.ttf`, `agent/cadgpt_agent/discovery.py`, `agent/cadgpt_agent/freecad_worker.py`, `apps/api/src/tools.ts`, `agent/tests/test_ops_allowlist.py`, `agent/tests/test_freecad_worker.py`, `apps/api/test/tools.test.ts`, `openspec/changes/cadengine-phase5-image-to-cad-ocr-privacy/tasks.md` | `.venv/bin/python -m unittest discover -s agent/tests -v && npm test && npm run format` | 209 Python unit tests passed (including typography modes, font fallback chain, OCC rollback, and multi-wire polygon holes), 101 API unit tests passed (including `createText3dSchema`, `extrudePolygonSchema` holes, MCP tool enqueue), 67 web unit tests passed. Code formatting clean. |
