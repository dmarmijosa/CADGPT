# Design: CAD Engine Phase 4 — CLI, Daemons, Social Auth & CAD Ops

## Architecture Decisions

### 1. Unified CLI Entry Points & Subcommand Dispatch
- **Decision**: Register dual `console_scripts` (`cadengine`, `cadgpt-agent`) in [pyproject.toml](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml). Use `argparse` subparsers (`status`, `version`, `pair`, `unpair`, `service`, `logs`, `test`); default to foreground worker loop when invoked without subcommands. `POST /api/agent/unpair` in [main.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts) uses bearer token to set `revoked = 1`, cancel queued jobs, and unconditionally wipe local OS Keyring (`SERVICE = "CADGPT"`).
- **Rationale**: Backward compatible; enables headless and interactive workstation lifecycle.

### 2. Background Daemon Lifecycle & Windows Session 0
- **Decision**: Session 0 (`SYSTEM`) blocks display/OpenGL contexts and `wincred`. Deploy elevated user logon task on Windows (`schtasks /Create /TN "CADEngineAgent" /SC ONLOGON /RL LIMITED`), Linux user systemd (`cadengine.service`), and macOS LaunchAgent (`com.cadengine.agent.plist`). WiX v4 ([cadengine.wxs](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/wix/cadengine.wxs)) builds elevated MSI installing to `%ProgramFiles%\CAD Engine\`, setting system `PATH`.
- **Rationale**: Worker runs in interactive Session 1+ with user display, licensing, and keyring access.

### 3. Google Social Login & Stitch UI
- **Decision**: Configure Google in `identityProviders` within [cadgpt-realm.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/cadgpt-realm.json) and [cadgpt-realm.prod.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/prod/cadgpt-realm.prod.json) (redirect `https://cadengine.danny-armijos.com/auth/realms/cadgpt/broker/google/endpoint`). Style PatternFly v5 selectors (`#kc-social-providers`, `#social-google`, divider) in [stitch.css](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css) with `#131B2E` surface, `#00F0FF` glow, and SVG icon.
- **Rationale**: Standardizes token issuance (`cad:read`, `cad:write`) via Keycloak brokering without custom auth code.

### 4. Advanced FreeCAD Modeling
- **Decision**: Add handlers in [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py):
  - `create_wedge`: `Part.makeWedge(dx, dy, dz, top_length)`.
  - `extrude_polygon`: 2D vertices to planar face, extruded along normal.
  - `fillet` & `chamfer`: `Part::Fillet`/`Part::Chamfer` with edge index checks (`1 <= idx <= len(Edges)`) and `.bak` rollback on OCC failure.
  - `loft`: Skinned cross-section wires (`Part.makeLoft(wires, solid, ruled)`).
  - Maintain 18-op parity across [ops-allowlist.json](file:///Users/danny/Documents/ChatGPT/CADGPT/ops-allowlist.json), [discovery.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py) (`FREECAD_OPS`), and [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts).
- **Rationale**: Full parametric `.FCStd` tree preservation with strict OpenCASCADE crash protection.

---

## Data Flow

```mermaid
sequenceDiagram
    participant U as User (CLI/Web)
    participant A as Agent Daemon
    participant K as Keycloak
    participant S as API Server
    participant W as FreeCAD Worker

    U->>K: Google OAuth (/broker/google/endpoint)
    K-->>U: JWT (cad:read, cad:write)
    U->>A: cadengine pair --server <url>
    A->>S: POST /api/pairings & poll
    S-->>A: Token (Keyring stored)
    S->>A: Enqueue Job (e.g. loft, fillet)
    A->>W: Execute request.json
    W->>W: makeLoft / fillet, save .FCStd, export STL
    W-->>A: Exit 0 (preview.stl)
    A->>S: POST /api/agent/results/:id
    U->>A: cadengine unpair
    A->>S: POST /api/agent/unpair
    S-->>A: Revoked; wipe local credentials
```

---

## File Changes

| File | Action | Purpose |
|---|---|---|
| [pyproject.toml](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/pyproject.toml) | Update | Dual console_scripts (`cadengine`, `cadgpt-agent`). |
| [main.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/main.py) | Update | CLI subcommands & rotating file logging. |
| [freecad_worker.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/freecad_worker.py) | Update | 5 new ops handlers with OCC rollback. |
| [discovery.py](file:///Users/danny/Documents/ChatGPT/CADGPT/agent/cadgpt_agent/discovery.py) | Update | Export 18-operation `FREECAD_OPS`. |
| [ops-allowlist.json](file:///Users/danny/Documents/ChatGPT/CADGPT/ops-allowlist.json) | Update | Canonical 18-operation allowlist fixture. |
| [main.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/main.ts) | Update | `POST /api/agent/unpair` route. |
| [store.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/store.ts) | Update | `unpair()` revocation & job cancel. |
| [tools.ts](file:///Users/danny/Documents/ChatGPT/CADGPT/apps/api/src/tools.ts) | Update | 5 op schemas & 18-op allowlist. |
| [cadgpt-realm.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/cadgpt-realm.json) | Update | Dev Google `identityProviders` config. |
| [cadgpt-realm.prod.json](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/prod/cadgpt-realm.prod.json) | Update | Prod Google `identityProviders` config. |
| [stitch.css](file:///Users/danny/Documents/ChatGPT/CADGPT/deploy/themes/cadgpt/login/resources/css/stitch.css) | Update | Google button Stitch tokens. |
| [cadengine.wxs](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/wix/cadengine.wxs) | Create | WiX v4 elevated MSI installer with PATH. |
| [windows.iss](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/windows.iss) | Update | Inno Setup fallback with PATH. |
| [build.py](file:///Users/danny/Documents/ChatGPT/CADGPT/packaging/build.py) | Update | PyInstaller `cadengine` build. |

---

## Interfaces & Contracts

- **Agent Unpair**: `POST /api/agent/unpair` with `Authorization: Bearer <deviceToken>`. Returns `200 { "unpaired": true, "deviceId": "<uuid>" }`.
- **Google Callback**: `/auth/realms/cadgpt/broker/google/endpoint`. Scopes: `openid profile email`.
- **CAD Schemas**:
  - `create_wedge`: `length, width, height: (0, 10000]`, opt `top_length: [0, 10000]`, opt `position`.
  - `extrude_polygon`: `points: [u,v][3..100]`, `depth: (0, 10000]`, `plane: XY|XZ|YZ`.
  - `fillet` / `chamfer`: `documentId: UUID`, `object: Identifier`, `radius`/`distance: (0, 10000]`, opt `edge_indices: int[]`.
  - `loft`: `sections: [x,y,z][3..100][2..20]`, `solid: bool`, `ruled: bool`.

---

## Testing Strategy

- **Unit Tests**:
  - `test_freecad_worker.py`: Pure-Python validation for 5 new ops; edge index bounds checks.
  - `test_ops_allowlist.py`: 18-op parity check across allowlist fixture, discovery, and API.
  - `tools-b2.test.ts`: Zod schema bounds validation and injection rejection.
  - `unpair.test.ts`: Authenticated unpair, device revocation, and job cancellation.
- **Integration & Smoke**:
  - `cadengine test`: Offline smoke test asserting `design.FCStd` and `preview.stl`.
  - `cadengine status --json`: Asserts diagnostic report schema.
  - Keycloak redirect test against mocked Google IdP.

---

## Threat Matrix

| Threat | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Session 0 Lockout** | High | High | Elevated `ONLOGON` task in Session 1+; avoid `SYSTEM`. |
| **Topological Index Crash** | High | Med | Pre-validate `edge_indices`; restore `.bak` copy on error. |
| **Non-manifold Geometry** | Med | Med | Strict coordinate/vertex bounds; 120s worker timeout. |
| **Unpair Network Failure** | Med | Med | Unconditional local keyring wipe regardless of network reply. |
| **Social Login Injection** | High | Low | Enforce `trustEmail=true` on verified Google claims. |
