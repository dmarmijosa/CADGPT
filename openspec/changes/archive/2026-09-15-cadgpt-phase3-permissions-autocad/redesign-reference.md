# P3 — Web Dashboard Redesign (reference)

## Visual reference
- Stitch project: `https://stitch.withgoogle.com/projects/17866282666749971536`
- The redesign should take this Stitch project as the visual/layout reference for the
  Angular dashboard (`apps/web`): tokens (color, type, spacing), shell/nav, and page
  layouts. Keep the existing brand identity name ("CAD Agent Designer") and the
  drafting-paper/technical direction unless the Stitch reference clearly supersedes it.

## Tooling constraint (important)
- The **Stitch MCP is NOT connected to Claude Code's session** — only Higgsfield and
  DesignSync (claude.ai) are available here. Therefore this pillar is documented as
  intent + reference. The actual redesign is executed in a client that HAS the Stitch
  MCP (the user delegated it to **Gemini**). Any "use the Stitch MCP" step runs there,
  not in Claude Code.

## Scope of the restyle (must preserve behavior)
- Restyle, do not rewrite: every page's behavior and its Vitest suite MUST stay green
  (home, devices, designs, design-detail, jobs, connect, pair, callback, keys, about).
- Must be **theme-aware** (light/dark) and **responsive** (works at ~400px).
- Must surface, as first-class UI:
  1. The **P1 allowlist management** surface (authorize / list / remove folders per
     device) — depends on the P1 API; until P1 lands, stub or hide behind a flag.
  2. The **per-OS agent install / pairing / keep-alive** guidance from README
     §"Keep the agent running (survive logout and reboot)" — Linux systemd, macOS
     launchd, Windows Task Scheduler — as copy-paste steps, not just a link.
- Keep the auth-reactive behavior fixed earlier (Sign in vs. dashboard CTA; no hung
  "Signing you in…"; the callback recovers instead of dead-ending).

## Design-quality lesson to carry (from user feedback)
- The CAD engine's op set is basic primitives + booleans/transforms only; complex/
  organic models (the user's "Teemo" attempt) come out as crude assembled components.
  The dashboard copy and any example galleries SHOULD set expectations accordingly:
  present CADGPT as a mechanical/parametric/architectural tool, not organic sculpting.
- Candidate FUTURE work (NOT this change): richer FreeCAD ops (loft/sweep/revolve/
  fillet/chamfer) or **mesh import** (STL/OBJ) so an externally-generated mesh — e.g.
  from an image-to-3D pipeline — can be brought in. Logged as a possible phase-4
  "richer modeling / mesh import" change.

## Status
- P3 is a UI-only, independent PR chain. It changes no API/agent contract. Slice (iii)
  depends on the P1 allowlist API. Not part of the deferred implementation batch that
  P1/P2 wait on — the redesign is being progressed separately (Gemini + Stitch MCP).
