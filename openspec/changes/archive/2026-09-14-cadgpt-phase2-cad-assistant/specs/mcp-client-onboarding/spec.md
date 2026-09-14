## mcp-client-onboarding (NEW)

Purpose: guide the user from pairing to a connected Claude/ChatGPT MCP client.

### Requirement: Post-Pairing Connect Step
After a device completes pairing, the system MUST present a guided "connect your MCP client" step.
#### Scenario: Step shown after pairing (Claude)
- GIVEN a device pairing just completed
- WHEN the onboarding step is shown
- THEN Claude-specific MCP connection instructions for this deployment are displayed
#### Scenario: Step shown after pairing (ChatGPT)
- GIVEN the same completed pairing
- WHEN the onboarding step is shown
- THEN ChatGPT-specific MCP connection instructions are also displayed, distinct from Claude's
