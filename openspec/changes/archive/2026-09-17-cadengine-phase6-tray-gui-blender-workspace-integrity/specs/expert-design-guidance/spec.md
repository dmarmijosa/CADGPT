## expert-design-guidance (MODIFIED)

Purpose: Expand MCP guidance resources and tools to include modeling engine selection guidance (`cadgpt://guidance/modeling-engine-selection`) and the deterministic routing tool `select_modeling_engine`, guiding AI clients to the proper engine (AutoCAD, FreeCAD, or Blender) based on manufacturing and geometric requirements.

### Requirement: MCP Instructions Resource
The MCP server MUST expose instructions and prompt resources documenting mm units, tolerances, naming conventions, parametric intent, and engine selection criteria for all exposed tools.
(Previously: guidance resources were limited to mechanical, architectural, and units-tolerances without engine selection instructions.)

#### Scenario: Guidance available to client
- GIVEN an MCP client connects
- WHEN it reads server instructions/prompt resources
- THEN it receives documented unit, tolerance, naming conventions, and engine selection guidelines

---

### Requirement: Engine Selection Guidance Resource (`cadgpt://guidance/modeling-engine-selection`)
The MCP server MUST expose a dedicated guidance resource at `cadgpt://guidance/modeling-engine-selection`:
1. **Engine Paradigms & Criteria**:
   The resource MUST clearly define selection criteria across the three supported engines:
   - **AutoCAD**: Recommend for 2D/3D architectural drafting, building permit drawings, floor plans, standard DWG layering, and coordinate-aligned line work.
   - **FreeCAD**: Recommend for precision mechanical engineering, parametric B-Rep solid modeling, CSG booleans, fastener assemblies, and parts destined for CNC milling or functional FDM/SLA 3D printing.
   - **Blender**: Recommend for organic forms, ergonomic curvatures, characters, figurines, subdivision surfaces (Catmull-Clark), procedural displacement texturing, sculpting, and visual CGI assets.
2. **Strict Non-Code Invariant**:
   - The resource MUST describe tool workflows in structured prose and MUST NOT provide code snippets, python scripts, LISP routines, or file system paths.
(Previously: MCP server did not provide engine selection guidance or multi-paradigm routing instructions.)

#### Scenario: Client reads engine selection guidance
- GIVEN an AI client evaluating whether to model a mechanical bracket or an organic character
- WHEN the client reads `cadgpt://guidance/modeling-engine-selection`
- THEN it receives clear domain boundaries indicating FreeCAD for the bracket and Blender for the organic character

---

### Requirement: Engine Selection Routing Tool (`select_modeling_engine`)
The MCP server MUST register an informational guidance tool `select_modeling_engine` to assist AI models in choosing the optimal engine:
1. **Input Schema**:
   The tool MUST validate inputs using a strict Zod schema:
   - `domain`: Enum `['mechanical', 'architectural', 'organic', 'artistic', 'hybrid']`.
   - `precision_required`: Enum `['high_tolerance', 'standard', 'visual_only']`.
   - `intended_output`: Enum `['cnc_milling', '3d_printing', 'rendering', 'drawing_permit', 'animation']`.
   - `description`: Optional string between 1 and 500 characters describing the part.
2. **Output Structure**:
   The tool MUST return:
   - `recommended_engine`: Enum `'FreeCAD' | 'AutoCAD' | 'Blender'`.
   - `rationale`: Explanation referencing manufacturing and topological constraints.
   - `suggested_tools`: Array of allowlisted tool names recommended for the initial modeling phase.
(Previously: AI clients had to guess which CAD engine or modeling tools to invoke without a structured routing tool.)

#### Scenario: Guidance tool routes organic figurine to Blender
- GIVEN a caller invoking `select_modeling_engine` with `domain = "organic"`, `precision_required = "visual_only"`, and `intended_output = "rendering"`
- WHEN the tool executes
- THEN it returns `recommended_engine = "Blender"` and suggests `create_blender_mesh`, `extrude_subdivide_mesh`, and `displace_sculpt_mesh`

#### Scenario: Guidance tool routes precision bracket to FreeCAD
- GIVEN a caller invoking `select_modeling_engine` with `domain = "mechanical"`, `precision_required = "high_tolerance"`, and `intended_output = "cnc_milling"`
- WHEN the tool executes
- THEN it returns `recommended_engine = "FreeCAD"` and suggests `create_box`, `create_cylinder`, and `boolean_cut`

#### Scenario: Guidance tool routes architectural floor plan to AutoCAD
- GIVEN a caller invoking `select_modeling_engine` with `domain = "architectural"`, `intended_output = "drawing_permit"`
- WHEN the tool executes
- THEN it returns `recommended_engine = "AutoCAD"` and suggests drafting and extrusion operations

---

### Requirement: No Code/Path Hints in Guidance
All guidance resources and tool responses MUST reference only allowlisted tools and parameter objects, and MUST NOT suggest code, script, or path-based usage.
(Previously: requirement applied to initial three guidance resources.)

#### Scenario: No code hints in engine selection guidance
- GIVEN the `cadgpt://guidance/modeling-engine-selection` resource
- WHEN inspected
- THEN it contains no examples of Python code, bpy scripts, AutoLISP, or unvalidated file paths
