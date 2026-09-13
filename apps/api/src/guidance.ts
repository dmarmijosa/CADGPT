import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Server instructions (spec expert-design-guidance "MCP Instructions
 * Resource"). Kept free of code, script, or path examples per "No Code/Path
 * Hints in Guidance" — every example below is a tool-call description in
 * prose, never a snippet.
 */
export const SERVER_INSTRUCTIONS = `You are working through a CAD assistant server that exposes a small allowlisted set of tools. Follow this operating discipline on every request.

Units and precision
- All lengths are millimeters. All angles are degrees. State any assumed dimension explicitly before using it.
- Default tolerances: general dimensions +/-0.1 mm; mating fits +/-0.02 mm; clearance fits +0.1 to +0.3 mm; press fits -0.02 to -0.05 mm.

Workflow discipline
- Confirm dimensions and intent with the user before calling any mutating tool. Only proceed once the user has approved the numbers.
- Call one primitive tool per request, then combine primitives with boolean tools afterward.
- Call read_scene before modifying an existing design so object names and current geometry are known.
- Call get_job after every queued job to report status back to the user.
- If a tool response reports selection_required, ask the user which device or CAD application to target. Never guess a device or CAD.
- Never invent object names. Use only the names returned by list_documents or read_scene.

Naming and manufacturability
- Name objects by function, ASCII only, stable across revisions, for example Base, Boss1, ClearanceHoleM4, or WallNorth.
- Apply design-for-manufacture guidance from the mechanical and architectural resources before proposing dimensions.

Safety posture
- Only the allowlisted tools may be called. Never request code execution, scripts, or file system paths from the user or the model.
- Design files stay on the user's own machine. Only STL previews may leave the machine, and only for mesh viewing.

Read cadgpt://guidance/mechanical, cadgpt://guidance/architectural, and cadgpt://guidance/units-tolerances for full domain guidance before proposing a design plan.`;

const MECHANICAL_GUIDANCE = `# Mechanical Design Guidance

## Units and tolerances
- Millimeters for all lengths; degrees for angles.
- General tolerance: +/-0.1 mm unless the user states otherwise.
- Fit tolerance: +/-0.02 mm on mating diameters.
- Clearance fit allowance: +0.1 to +0.3 mm larger than the mating part.
- Press fit allowance: -0.02 to -0.05 mm smaller than the mating part.
- Standard fastener clearance holes: M3 needs 3.4 mm, M4 needs 4.5 mm, M5 needs 5.5 mm.

## Design for manufacture
- Minimum wall thickness: 1.2 mm for FDM printing, 0.8 mm for SLA or resin printing, 2 mm for CNC-machined aluminum.
- Add fillets on load-bearing paths, radius at least 1 mm; avoid sharp internal corners on structural parts.
- Draft angle of 1 to 2 degrees on any face intended for casting or injection molding.
- Keep holes at least 1.5 times their diameter away from the nearest edge.
- Add a 0.5 mm chamfer on external edges intended for handling.

## Workflow
- Confirm every dimension with the user before calling a mutating tool.
- Build one primitive per call among create_box, create_cylinder, create_sphere, and create_cone, then combine with boolean_union, boolean_cut, or boolean_intersect.
- Call read_scene before modifying an existing design; only reference object names returned by the scene.
- Use translate_object, rotate_object, and scale_object for positioning after creation, never by re-specifying the primitive.

## Naming
- Name every feature by its function: Base, Boss1, ClearanceHoleM4, RibLeft. ASCII characters only, no leading digits, stable across revisions so later references keep working.
`;

const ARCHITECTURAL_GUIDANCE = `# Architectural Design Guidance

## Units and grid
- Millimeters for all lengths; model on a consistent grid and establish axes before placing walls.
- Typical floor-to-floor height: 3000 to 3600 mm for residential construction.

## Wall and opening dimensions
- Interior partition thickness: 100 to 150 mm.
- Exterior wall thickness: 200 to 300 mm.
- Standard door opening: 900 mm wide by 2100 mm tall.
- Standard window sill height: approximately 900 mm above finished floor.
- Stair riser height: 150 to 180 mm; stair tread depth: 250 to 300 mm.
- Corridor clear width: at least 1200 mm.

## Modeling approach
- Represent slabs and walls as extruded rectangular volumes created with create_box, combined with boolean_cut for openings.
- Keep every dimension on the millimeter grid; avoid fractional millimeters that do not correspond to a real construction tolerance.
- Confirm the building program, rooms, adjacencies, and approximate footprint with the user before creating geometry.

## Workflow
- Call read_scene before modifying an existing design; reference only the object names it returns.
- Call get_job after every queued job and report status to the user.
- If selection_required is returned, ask which device to target rather than guessing.

## Naming
- Name objects by function: WallNorth, WallSouth, FloorSlab1, DoorOpeningA. ASCII characters only, stable across revisions.
`;

const UNITS_TOLERANCES_GUIDANCE = `# Units and Tolerances Reference

## Units
- Every length parameter accepted by the tools is in millimeters.
- Every angle parameter accepted by the tools is in degrees.
- State any assumed dimension out loud before using it in a tool call.

## General tolerances
- Unconstrained dimensions: +/-0.1 mm.
- Mating or fitted dimensions: +/-0.02 mm.

## Fit allowances
- Clearance fit, for parts that must slide or rotate freely: +0.1 to +0.3 mm larger than the mating feature.
- Press fit, for parts that must stay assembled by friction: -0.02 to -0.05 mm smaller than the mating feature.

## Fastener clearance holes
- M3 screw: 3.4 mm clearance hole.
- M4 screw: 4.5 mm clearance hole.
- M5 screw: 5.5 mm clearance hole.

## Thread and hole guidance
- Use standard metric thread series, M3 through M8, unless the user specifies a different standard.
- Keep hole edge distance at least 1.5 times the hole diameter to avoid breakout.

## Confirmation discipline
- Always confirm a dimension or tolerance choice with the user before calling a mutating tool with it.
- Never substitute a guessed tolerance when the user has not stated a fit requirement; ask instead.
`;

const RESOURCES = [
  {
    uri: 'cadgpt://guidance/mechanical',
    name: 'mechanical-guidance',
    title: 'Mechanical design guidance',
    text: MECHANICAL_GUIDANCE,
  },
  {
    uri: 'cadgpt://guidance/architectural',
    name: 'architectural-guidance',
    title: 'Architectural design guidance',
    text: ARCHITECTURAL_GUIDANCE,
  },
  {
    uri: 'cadgpt://guidance/units-tolerances',
    name: 'units-tolerances-guidance',
    title: 'Units and tolerances reference',
    text: UNITS_TOLERANCES_GUIDANCE,
  },
] as const;

const designBriefArgs = {
  goal: z.string().min(1).max(2000),
  domain: z.enum(['mechanical', 'architectural']).optional(),
  constraints: z.string().max(2000).optional(),
};

const designReviewArgs = {
  documentId: z.uuid(),
};

/** Registers the expert-design-guidance resources and prompts (spec expert-design-guidance). */
export function registerGuidance(server: McpServer) {
  for (const resource of RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      { title: resource.title, mimeType: 'text/markdown' },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: resource.text }],
      }),
    );
  }

  server.registerPrompt(
    'design_brief',
    {
      title: 'Design brief',
      description: 'Elicit design intent and produce a parametric plan expressed as tool calls.',
      argsSchema: designBriefArgs,
    },
    async ({ goal, domain, constraints }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Goal: ${goal}`,
              `Domain: ${domain ?? 'unspecified'}`,
              `Constraints: ${constraints ?? 'none stated'}`,
              '',
              'Ask the user for any missing intent, then produce a parametric plan expressed only as an ordered sequence of the available tools, for example: call create_box with length 40, width 25, height 10, then call boolean_cut with the base and tool set to the resulting objects.',
              'Confirm every dimension with the user before calling any mutating tool.',
              'Call read_scene first if this plan continues an existing design, and only reference object names it returns.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'design_review',
    {
      title: 'Design review',
      description:
        'Read a design and check it against tolerance, fit, and manufacturability guidance.',
      argsSchema: designReviewArgs,
    },
    async ({ documentId }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Review the design at documentId ${documentId}.`,
              'Call read_scene first to inspect the current geometry and object names.',
              'Check every dimension against the tolerance, fit, and manufacturability guidance in cadgpt://guidance/units-tolerances and cadgpt://guidance/mechanical or cadgpt://guidance/architectural.',
              'Report every issue found before proposing or making any change.',
              'Any follow-up modification still requires confirming dimensions with the user before calling a mutating tool, following the confirm-before-mutating rule.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
