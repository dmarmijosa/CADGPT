# typography-3d (NEW)

Purpose: Enable parametric 3D text generation and mechanical lettering in FreeCAD with cross-platform font resolution, support for flat, emboss, and engrave modes, extrusion thickness, and boolean operations with target solids via the `create_text_3d` operation.

### Requirement: FreeCAD Worker 3D Text Generation (Draft.make_shapestring)
The FreeCAD worker MUST support the `create_text_3d` operation to synthesize 3D solid lettering:
1. **ShapeString Construction**: The worker MUST invoke `Draft.make_shapestring` (or `Draft.makeShapeString` dynamically for backwards compatibility) with the parameters `String`, `FontFile`, `Size` (capital letter height in millimeters), and `Tracking` (inter-character spacing offset).
2. **Face Generation & Counter-Space Handling**: The worker MUST convert the resulting 2D glyph wires into planar faces. Characters containing internal counter-spaces (e.g. 'A', 'B', 'D', 'O', 'P', 'Q', 'R', '0', '4', '6', '8', '9') MUST have their inner loops rendered as voids within the glyph boundary rather than overlapping solid faces.
3. **Solid Extrusion**: The worker MUST extrude the planar faces along the normal vector of the designated plane (`XY`, `XZ`, `YZ`) by `thickness` millimeters (finite positive number $\le 10000\text{ mm}$) to produce a valid 3D `Part::Feature` solid.
4. **Input Constraints**:
   - `text`: MUST be a non-empty string between 1 and 120 UTF-8 characters.
   - `size`: MUST be a finite positive number in $(0, 10000]\text{ mm}$.
   - `thickness`: MUST be a finite positive number in $(0, 10000]\text{ mm}$.

#### Scenario: Generate flat 3D text solid on XY plane
- GIVEN a job with `op = "create_text_3d"`, `text = "CAD-01"`, `size = 12.0`, `thickness = 2.5`, `mode = "flat"`, and `plane = "XY"`
- WHEN the worker executes
- THEN it generates a 3D solid feature containing the letters "CAD-01" with 12 mm height and 2.5 mm extrusion thickness along $+Z$

#### Scenario: Glyphs with counter-spaces render with hollow centers
- GIVEN a job with `op = "create_text_3d"`, `text = "ROBOT"`, `size = 20.0`, `thickness = 3.0`
- WHEN the worker builds the glyph faces and extrudes
- THEN the interior counter-spaces of 'R', 'O', and 'B' are formed as open hollow loops with non-zero volume around the letter perimeter

#### Scenario: Text generation with inter-character tracking
- GIVEN a job with `op = "create_text_3d"`, `text = "ENGINE"`, `tracking = 3.5`
- WHEN the worker executes
- THEN the spacing between consecutive glyph origins is expanded by 3.5 mm compared to default glyph advance

#### Scenario: Rejection of empty text string
- GIVEN a job with `op = "create_text_3d"` and `text = ""`
- WHEN the worker validates the request
- THEN it raises a validation error and rejects execution before invoking FreeCAD

---

### Requirement: Cross-Platform Font Resolution and Fallback Chain
FreeCAD's shape string engine requires an absolute path to an existing, readable TrueType (`.ttf`) or OpenType (`.otf`) font file on disk. The agent and FreeCAD worker MUST resolve font files according to a strict fallback sequence:
1. **Explicit Font Path**: If a caller supplies a `font` parameter:
   - The worker MUST check if the string references an existing file path on the filesystem.
   - If the file exists and has a `.ttf` or `.otf` extension, the worker MUST use this font file.
2. **Bundled Fallback Font**: If no font is supplied or the specified path does not exist:
   - The worker MUST check for the bundled font file packaged with the agent at `agent/cadgpt_agent/fonts/Inter-Bold.ttf`.
   - If present, the worker MUST resolve to this bundled font.
3. **Operating System System Fallbacks**: If the bundled font cannot be located, the worker MUST check standard OS font directories in order:
   - **Windows**: `C:\Windows\Fonts\arial.ttf`, `C:\Windows\Fonts\calibri.ttf`, `C:\Windows\Fonts\tahoma.ttf`.
   - **macOS**: `/System/Library/Fonts/Supplemental/Arial.ttf`, `/Library/Fonts/Arial.ttf`, `/System/Library/Fonts/Helvetica.ttc`.
   - **Linux**: `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`, `/usr/share/fonts/truetype/freefont/FreeSansBold.ttf`, `/usr/share/fonts/TTF/DejaVuSans-Bold.ttf`.
4. **Safety & Diagnostic Guarantee**: The worker MUST verify `os.path.isfile(font_path)` prior to calling `Draft.make_shapestring`. If all resolution attempts fail, the worker MUST raise an explicit diagnostic error indicating that no valid TrueType font was found on the host system.

#### Scenario: Default resolution resolves to bundled Inter-Bold font
- GIVEN a job with `op = "create_text_3d"` and no `font` parameter specified
- WHEN font resolution executes in an environment where `Inter-Bold.ttf` is bundled
- THEN the worker selects the bundled `Inter-Bold.ttf` path and successfully invokes `make_shapestring`

#### Scenario: Nonexistent font path gracefully falls back to bundled font
- GIVEN a job with `op = "create_text_3d"` and `font = "/nonexistent/path/custom.ttf"`
- WHEN font resolution executes
- THEN the worker detects that the path is missing, logs a warning, and falls back to `Inter-Bold.ttf`

#### Scenario: Headless environment resolves to system OS font
- GIVEN an environment where the bundled font is absent but standard system fonts are installed
- WHEN font resolution executes on Linux, macOS, or Windows
- THEN the worker identifies and uses the first available standard OS TrueType font

---

### Requirement: Typography Modes: Flat, Emboss, and Engrave
The `create_text_3d` operation MUST support three operational modes via the `mode` parameter:
1. **`flat` Mode (Default)**:
   - The worker MUST generate the 3D text solid as a standalone object placed at `position` on `plane`.
   - No target object is required, and no other objects in the document are modified.
2. **`emboss` Mode**:
   - MUST require `target_object` specifying a valid solid object identifier existing in `document_id`.
   - The worker MUST position the 3D text solid on the surface of `target_object` and perform a boolean union (`Part::MultiFuse` or `Shape.fuse`) to unite the text geometry outward from the target solid.
3. **`engrave` Mode**:
   - MUST require `target_object` specifying a valid solid object identifier existing in `document_id`.
   - The worker MUST position the 3D text solid inset into the target solid by `thickness` millimeters and perform a boolean difference (`Part::Cut` or `Shape.cut`) to subtract the text geometry, creating a recessed cavity.
4. **Validation and Atomic Rollback**:
   - If `mode` is `emboss` or `engrave` and `target_object` is omitted or does not match any existing object in the document, execution MUST fail immediately with an error.
   - If the OpenCASCADE boolean operation fails (e.g. non-manifold geometry, edge co-planarity, or open shells), the worker MUST catch the exception, restore the document from the pre-mutation backup file, and return an error without corrupting the document.

#### Scenario: Emboss text onto existing solid surface
- GIVEN an existing document containing solid `"BasePlate"`
- WHEN `create_text_3d` runs with `mode = "emboss"`, `target_object = "BasePlate"`, `text = "SERIAL-99"`, and `thickness = 1.5`
- THEN the worker fuses the text onto `"BasePlate"`, producing a single solid with raised letters

#### Scenario: Engrave text into existing solid surface
- GIVEN an existing document containing solid `"ControlPanel"`
- WHEN `create_text_3d` runs with `mode = "engrave"`, `target_object = "ControlPanel"`, `text = "VOLTS"`, and `thickness = 0.8`
- THEN the worker subtracts the text from `"ControlPanel"`, creating a recessed engraving 0.8 mm deep

#### Scenario: Emboss rejects missing target_object
- GIVEN a job with `mode = "emboss"` but omitting `target_object`
- WHEN the worker validates the request
- THEN validation fails with a required parameter error and the document is not modified

#### Scenario: Boolean failure triggers automatic document rollback
- GIVEN an invalid target geometry that causes OpenCASCADE kernel failure during boolean fusion
- WHEN the boolean operation throws an exception
- THEN the worker catches the error, restores the document from backup, and leaves the native `.FCStd` in its original valid state

---

### Requirement: Orientation, Placement, and Plane Mapping
The `create_text_3d` operation MUST support projection onto principal Cartesian planes and 3D coordinate offsets:
1. **Plane Support**: The parameter `plane` MUST support `'XY'` (default), `'XZ'`, and `'YZ'`:
   - `'XY'`: Text lies on the XY plane with baseline parallel to $+X$ and extrudes along $+Z$.
   - `'XZ'`: Text lies on the XZ plane with baseline parallel to $+X$ and extrudes along $+Y$ (or $-Y$ for engrave).
   - `'YZ'`: Text lies on the YZ plane with baseline parallel to $+Y$ and extrudes along $+X$ (or $-X$ for engrave).
2. **Translation Offset**: The worker MUST accept an optional `position` parameter `{ x, y, z }` with finite numbers in $[-100000, 100000]\text{ mm}$. The worker MUST apply this placement offset to translate the text insertion origin in 3D world coordinates.

#### Scenario: Text placed on vertical XZ plane with offset
- GIVEN a job with `plane = "XZ"` and `position = { x: 50.0, y: 0.0, z: 25.0 }`
- WHEN the worker generates the text solid
- THEN the text baseline is oriented along $+X$ on the XZ plane, starting at world coordinates $(50.0, 0.0, 25.0)$

#### Scenario: Position coordinates exceeding maximum bound are rejected
- GIVEN a job with `position = { x: 150000, y: 0, z: 0 }` (exceeding 100000 mm bound)
- WHEN the request is validated
- THEN validation fails and no CAD job is executed
