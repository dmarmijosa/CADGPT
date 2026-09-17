# workspace-directory-governance (NEW)

Purpose: Establish a standardized 5-folder project directory hierarchy, maintain an atomic metadata manifest (`project.json`), provide non-disruptive structure auditing, and enforce strict user confirmation gates before moving or reorganizing any project files.

---

### Requirement: Standardized 5-Folder Project Hierarchy
Every managed CAD project root (`projects/<project-id>/` or document root) MUST organize assets into a standardized 5-folder directory structure:
1. **Directory Taxonomy**:
   - `cad/`: Dedicated to native, editable CAD and DCC source files:
     - FreeCAD: `design.FCStd`
     - AutoCAD: `design.dwg`
     - Blender: `design.blend`
   - `meshes/`: Dedicated to tessellated surface geometry:
     - Binary 3D print previews: `preview.stl`
     - WebGL / Three.js transmission formats: `preview.glb`, `preview.gltf`
   - `exports/`: Dedicated to production manufacturing and interoperability packages:
     - Neutral CAD exchange: `assembly.step`, `model.iges`
     - 2D drafting/cutting profiles: `layout.dxf`
     - Wavefront geometry: `mesh.obj`
   - `renders/`: Dedicated to visual imagery and graphical artifacts:
     - Web dashboard cards: `thumbnail.png` (400x300 recommended)
     - Ray-traced presentations: `render.png`, `camera1.png`
   - `references/`: Dedicated to input source specifications:
     - Engineering blueprints: `spec.pdf`, `blueprint.dwg`
     - Vision pipeline inspiration: `concept.png`, `sketch.jpg`
2. **Directory Initialization**:
   - Upon creating a new project or document, the system MUST scaffold all 5 standard directories (`cad/`, `meshes/`, `exports/`, `renders/`, `references/`).
   - Empty subdirectories MUST remain valid and preserved.

#### Scenario: New project initialization creates 5 standard directories
- GIVEN a request to create a new project
- WHEN the agent or service scaffolds the workspace
- THEN subdirectories `cad/`, `meshes/`, `exports/`, `renders/`, and `references/` exist within the project root

#### Scenario: CAD export writes STEP file into exports directory
- GIVEN an active FreeCAD design in `cad/design.FCStd`
- WHEN `export_design` executes with format `"STEP"`
- THEN the resulting `.step` file is written directly to `exports/` and registered in the project manifest

---

### Requirement: Manifest Metadata Tracking (`project.json`)
Every managed project directory MUST maintain an atomic metadata manifest file named `project.json`:
1. **Manifest Schema**:
   `project.json` MUST contain the following JSON fields:
   - `projectId`: UUID string uniquely identifying the project.
   - `name`: Non-empty string between 1 and 120 characters representing display title.
   - `primaryEngine`: Enum `'FreeCAD' | 'AutoCAD' | 'Blender'`.
   - `createdAt`: ISO-8601 UTC timestamp string.
   - `updatedAt`: ISO-8601 UTC timestamp string.
   - `version`: Semantic version string (e.g. `"1.0.0"`).
   - `inventory`: Array of tracked asset objects.
2. **Asset Inventory Entries**:
   Each object within `inventory` MUST record:
   - `relativePath`: Path relative to project root using forward slashes (e.g. `"cad/design.FCStd"`).
   - `category`: Enum `'cad' | 'meshes' | 'exports' | 'renders' | 'references'`.
   - `size`: Integer representing byte length on disk.
   - `sha256`: 64-character lowercase hexadecimal SHA-256 hash of file contents.
   - `lastModified`: Integer timestamp in milliseconds since epoch.
   - `magicVerified`: Boolean indicating whether file magic header has been validated.
   - `integrityVerified`: Boolean indicating whether deep structural validation passed.
   - `facetCount`: Optional integer representing facet count for mesh assets.
3. **Atomic Writes**:
   - Updates to `project.json` MUST be performed via atomic write (writing to temporary file and renaming) to prevent corruption during unexpected shutdowns.

#### Scenario: Updating asset records new hash in project.json
- GIVEN a modified `preview.stl` written to `meshes/`
- WHEN the agent completes the operation
- THEN `project.json` is updated atomically with the new file size, SHA-256 hash, and updated timestamp

#### Scenario: Corrupted manifest is recovered from filesystem scan
- GIVEN a project directory where `project.json` is missing or corrupted
- WHEN the audit routine runs
- THEN it scans existing files across the 5 standard directories and reconstitutes a valid `project.json`

---

### Requirement: Non-Disruptive Project Audit Tool (`audit_project_structure`)
The MCP server MUST expose a non-disruptive, read-only tool `audit_project_structure` to analyze workspace conformance:
1. **Read-Only Invariant**:
   - `audit_project_structure` MUST NOT move, rename, delete, or modify any file on the host filesystem.
2. **Analysis Behavior**:
   The tool MUST inspect the specified project workspace and report:
   - Status of standard 5-folder directories (present or missing).
   - List of unorganized or misplaced files (e.g., source images in project root instead of `references/`, legacy flat files in `documents/<id>/`).
   - Discrepancies between physical files and `project.json` inventory (missing files, untracked files, size/hash drifts).
   - A deterministic, proposed reorganization plan specifying planned source paths, destination paths, target categories, and relocation reasons.

#### Scenario: Audit detects unorganized root image
- GIVEN a project directory containing `sketch.png` in the project root
- WHEN `audit_project_structure` is invoked for the project
- THEN the tool returns a non-disruptive plan proposing to move `sketch.png` to `references/sketch.png` with reason `"misplaced_reference"` while leaving `sketch.png` untouched on disk

#### Scenario: Audit verifies fully compliant project
- GIVEN a project conforming strictly to the 5-folder layout with all files tracked in `project.json`
- WHEN `audit_project_structure` runs
- THEN it reports `compliant: true` with zero pending file moves

---

### Requirement: User-Confirmed Reorganization Tool (`reorganize_project_structure`)
The MCP server MUST expose `reorganize_project_structure` to execute structural reorganization under explicit user authorization:
1. **Explicit Confirmation Gate**:
   - The tool MUST require the boolean parameter `confirmed: true`.
   - If `confirmed` is `false`, omitted, or `undefined`, the tool MUST reject execution and perform zero file changes.
2. **Path Containment & Security**:
   - All source and target file paths MUST be validated to ensure they reside strictly within the project root.
   - The tool MUST reject any path containing parent directory traversals (`..`), absolute path escapes, or symlink redirects outside the project boundary.
3. **Execution Semantics**:
   - File moves MUST be performed using atomic filesystem operations (`fs.rename` / `shutil.move`).
   - Original file modification timestamps MUST be preserved.
   - Upon successful movement, `project.json` MUST be updated immediately to reflect new relative paths and updated categories.

#### Scenario: Reorganization rejected without explicit confirmed parameter
- GIVEN a project with pending moves identified by `audit_project_structure`
- WHEN `reorganize_project_structure` is called with `confirmed` missing or false
- THEN the tool fails validation with an unrecognized confirmation error and zero files are moved

#### Scenario: Confirmed reorganization moves files and updates inventory
- GIVEN an unorganized project with `sketch.png` in root and `confirmed = true`
- WHEN `reorganize_project_structure` executes
- THEN `sketch.png` is relocated to `references/sketch.png`, its original modification timestamp is preserved, and `project.json` records the updated path under category `"references"`

#### Scenario: Reorganization rejects traversal attempt outside project
- GIVEN a malicious payload attempting to move a file to `../../etc/shadow` or `../../Windows/System32`
- WHEN path containment is evaluated
- THEN execution is rejected with a forbidden boundary violation error
