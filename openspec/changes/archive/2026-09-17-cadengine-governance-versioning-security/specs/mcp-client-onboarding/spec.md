## mcp-client-onboarding (MODIFIED)

Purpose: Guide the user from pairing to a connected Claude/ChatGPT MCP client, enforcing unified `cad-engine` server naming and `0.2.0-alpha.1` protocol versioning during client onboarding, MCP initialization handshake, and API health monitoring.

### Requirement: MCP Server Handshake Identity and Versioning
When initializing a Model Context Protocol (MCP) connection (via `POST /mcp` Streamable HTTP or stdio), the backend API MUST instantiate the `McpServer` with `name: 'cad-engine'` and `version: '0.2.0-alpha.1'`, sourcing both values centrally from `apps/api/src/version.ts`. In response to an MCP client `initialize` request, the server MUST return `serverInfo: { name: 'cad-engine', version: '0.2.0-alpha.1' }`.
(Previously: The MCP server instance was created with hardcoded metadata `{ name: 'cad-agent-designer', version: '0.1.0' }`.)

#### Scenario: MCP initialize handshake returns cad-engine identity
- GIVEN an MCP client (such as Claude Desktop or ChatGPT Desktop) connecting to `POST /mcp`
- WHEN the client sends an `initialize` JSON-RPC request
- THEN the response payload contains `serverInfo.name` equal to `'cad-engine'` and `serverInfo.version` equal to `'0.2.0-alpha.1'`

---

### Requirement: API Health Endpoint Version Reporting
The HTTP API health probe endpoint `GET /api/health` MUST respond with HTTP status 200 and a JSON payload containing `{ status: 'ok', version: '0.2.0-alpha.1' }`, reading `version` directly from `apps/api/src/version.ts`.
(Previously: The health probe endpoint `GET /api/health` returned hardcoded `{ status: 'ok', version: '0.1.0-alpha' }`.)

#### Scenario: Health probe returns 0.2.0-alpha.1
- GIVEN the running CAD Engine API server
- WHEN an HTTP client or monitoring probe sends `GET /api/health`
- THEN the response status is 200 OK and the JSON body contains `status: 'ok'` and `version: '0.2.0-alpha.1'`

---

### Requirement: Post-Pairing Connect Step
After a device completes pairing, the system MUST present a guided "connect your MCP client" step displaying connection instructions and configuration snippets updated for `cad-engine` and release `0.2.0-alpha.1`.
(Previously: After a device completes pairing, the system MUST present a guided "connect your MCP client" step, using legacy product naming and configuration snippets.)

#### Scenario: Step shown after pairing (Claude)
- GIVEN a device pairing just completed
- WHEN the onboarding step is shown
- THEN Claude-specific MCP connection instructions referencing `cad-engine` for this deployment are displayed

#### Scenario: Step shown after pairing (ChatGPT)
- GIVEN the same completed pairing
- WHEN the onboarding step is shown
- THEN ChatGPT-specific MCP connection instructions referencing `cad-engine` are also displayed, distinct from Claude's
