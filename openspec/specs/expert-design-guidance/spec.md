## expert-design-guidance (NEW)

Purpose: MCP server instructions/prompt resources encode CAD expertise instead of free-form model guessing.

### Requirement: MCP Instructions Resource
The MCP server MUST expose instructions/prompt resources documenting mm units, tolerances, naming conventions, and parametric intent for the exposed tools.
#### Scenario: Guidance available to client
- GIVEN an MCP client connects
- WHEN it reads server instructions/prompt resources
- THEN it receives documented unit, tolerance, and naming conventions

### Requirement: No Code/Path Hints in Guidance
Guidance content MUST reference only allowlisted tools/parameters and MUST NOT suggest code, script, or path-based usage.
#### Scenario: No code hints
- GIVEN the guidance resource content
- WHEN inspected
- THEN it contains no example of code, script, or file-path parameters
