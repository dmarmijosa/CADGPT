# image-to-cad-pipeline (NEW)

Purpose: Enable automated vectorization of raster engineering drawings, blueprints, logos, and silhouettes into metric 2D/3D CAD geometry with nested hole detection, dimension parsing, and metric scaling via the `analyze_image_to_cad` MCP tool.

### Requirement: Raster Ingestion and Threshold Binarization
The image vectorization pipeline MUST accept raster image data (PNG, JPEG, WebP) encoded as raw base64 or Data URI format and perform image binarization via OpenCV:
1. **Preprocessing**: The pipeline MUST decode the base64 payload and apply noise reduction filtering (bilateral filter or Gaussian blur) to suppress raster compression artifacts while preserving high-frequency edges.
2. **Threshold Modes**: The pipeline MUST support three selectable thresholding strategies via `threshold_mode`:
   - `otsu` (default): MUST execute Otsu's optimal global binarization (`cv2.threshold` with `THRESH_BINARY_INV + THRESH_OTSU`).
   - `adaptive`: MUST execute adaptive Gaussian window thresholding (`cv2.adaptiveThreshold` with `ADAPTIVE_THRESH_GAUSSIAN_C` and `THRESH_BINARY_INV`) to segment unevenly illuminated scans or pencil sketches.
   - `canny`: MUST execute Canny hysteresis edge detection (`cv2.Canny`) followed by morphological edge dilation to generate closed contour loops.
3. **Polarity Inversion**: The pipeline MUST accept a boolean `invert` flag (defaulting to `false`). When `invert = true`, the binarized mask MUST be inverted so that dark drawing lines on bright paper or white lines on dark blueprints are correctly mapped to positive solid geometry.
4. **Input Validation**: The pipeline MUST reject corrupted, unparseable, or truncated base64 strings with an explicit validation error without crashing the agent process.

#### Scenario: Otsu binarization of high-contrast engineering drawing
- GIVEN a high-contrast black-on-white blueprint image encoded as base64
- WHEN `analyze_image_to_cad` executes with `threshold_mode = "otsu"` and `invert = false`
- THEN the pipeline produces a clean inverted binary mask isolating foreground geometry from the background

#### Scenario: Adaptive thresholding of low-contrast or unevenly lit sketch
- GIVEN a raster photograph of a hand sketch with non-uniform lighting across the frame
- WHEN `analyze_image_to_cad` executes with `threshold_mode = "adaptive"`
- THEN local illumination gradients are normalized and distinct foreground contours are extracted

#### Scenario: Polarity inversion for dark-mode schematics
- GIVEN a light-on-dark technical schematic image
- WHEN `analyze_image_to_cad` executes with `invert = true`
- THEN the binary polarity is inverted, ensuring foreground schematic features are detected as solid boundaries

#### Scenario: Rejection of corrupted image payload
- GIVEN an invalid or truncated base64 string
- WHEN `analyze_image_to_cad` validates the input
- THEN the tool returns an explicit error indicating image decoding failure and does not invoke CAD operations

---

### Requirement: Hierarchical Contour Tracing and Nested Hole Detection
The pipeline MUST extract vector polygons and identify topological relationships between outer part perimeters and internal cutouts:
1. **Contour Extraction**: The pipeline MUST execute `cv2.findContours` using hierarchy retrieval mode `cv2.RETR_TREE` and contour approximation `cv2.CHAIN_APPROX_TC89_KCOS` (or `cv2.CHAIN_APPROX_SIMPLE`).
2. **Hierarchy Tree Traversal**:
   - The outermost solid boundary MUST be identified by finding the root contour (`hierarchy[0][i][3] == -1`) with the maximum enclosed area.
   - Direct interior children of the root contour (`hierarchy[0][j][3] == root_index`) MUST be classified as internal holes/cutouts.
   - All extracted contours MUST have their winding order verified (outer boundary oriented counter-clockwise, inner holes oriented clockwise).
3. **Douglas-Peucker Simplification**:
   - To prevent OpenCASCADE kernel degradation and high-vertex freezing, the pipeline MUST simplify all extracted contours using the Douglas-Peucker algorithm (`cv2.approxPolyDP`).
   - The approximation tolerance MUST be configurable via `tolerance` (defaulting to `0.0025`), where $\epsilon = \text{tolerance} \times \text{arcLength}(\text{contour}, \text{True})$.
   - Contours simplifying to fewer than 3 vertices MUST be discarded.

#### Scenario: Detection of outer boundary and internal through-holes
- GIVEN an image containing an outer rectangular plate with two interior circular through-holes
- WHEN contour tracing and hierarchy analysis execute
- THEN the pipeline returns exactly one outer boundary polygon and two distinct child hole polygons

#### Scenario: Douglas-Peucker polygon simplification eliminates raster noise
- GIVEN a high-resolution raster image exhibiting 1-pixel staircase quantization along diagonal edges
- WHEN Douglas-Peucker simplification runs with `tolerance = 0.0025`
- THEN redundant collinear vertices are removed, reducing vertex count by at least 60% while preserving corner geometry

#### Scenario: Rejection of degenerate contours
- GIVEN a tiny speckle or noise artifact that simplifies to fewer than 3 vertices
- WHEN the simplification step runs
- THEN the degenerate feature is filtered out and excluded from the resulting polygon set

---

### Requirement: Metric Calibration and CAD Coordinate Transformation
The pipeline MUST transform discrete image pixel coordinates $(u, v)$ into continuous Cartesian CAD coordinates $(x, y)$ calibrated to real-world millimeters:
1. **Scaling Factor Calculation**:
   - The pipeline MUST compute a metric scaling factor $S = \frac{\text{dim}_{mm}}{D_{px}}$ (in millimeters per pixel).
   - If `reference_dimension` is supplied, it MUST support:
     - `width`: $D_{px} = \max(u) - \min(u)$ of the root boundary bounding box; $S = \frac{\text{value\_mm}}{D_{px}}$.
     - `height`: $D_{px} = \max(v) - \min(v)$ of the root boundary bounding box; $S = \frac{\text{value\_mm}}{D_{px}}$.
     - `points`: $D_{px} = \sqrt{(u_2 - u_1)^2 + (v_2 - v_1)^2}$ between two specified pixel coordinate pairs; $S = \frac{\text{value\_mm}}{D_{px}}$.
   - If `reference_dimension` is omitted, the pipeline MUST attempt automatic OCR/regex detection of millimetric callouts (e.g. `r'(\d+(?:\.\d+)?)\s*(?:mm|MM)?'`), or default to a safe 1:1 scale ($S = 1.0\text{ mm/px}$) accompanied by a diagnostic warning.
2. **Cartesian Mapping and Coordinate Inversion**:
   - The pipeline MUST transform each pixel vertex $(u, v)$ to centered CAD Cartesian coordinates $(x, y)$ via:
     $$x = (u - u_{\text{center}}) \times S$$
     $$y = (v_{\text{center}} - v) \times S$$
     where $(u_{\text{center}}, v_{\text{center}})$ is the centroid of the outer boundary bounding box.
   - The Y-axis MUST be inverted so that raster top ($v = 0$) maps to positive CAD Cartesian $+Y$.
   - All transformed coordinates MUST remain within safe metric CAD boundaries $[-100000, 100000]\text{ mm}$.

#### Scenario: Metric calibration from width reference dimension
- GIVEN an image where the outer boundary bounding box width is 400 pixels
- WHEN `analyze_image_to_cad` is called with `reference_dimension = { type: "width", value_mm: 100.0 }`
- THEN the scaling factor is calculated as $S = 0.25\text{ mm/px}$, and bounding width in CAD coordinates equals 100.0 mm

#### Scenario: Metric calibration from explicit point pair
- GIVEN two reference fiducial points located 200 pixels apart in the raster image
- WHEN `analyze_image_to_cad` is called with `reference_dimension = { type: "points", points: [[100, 100], [300, 100]], value_mm: 50.0 }`
- THEN the scaling factor is calculated as $S = 0.25\text{ mm/px}$

#### Scenario: Coordinate transformation centers origin and inverts Y-axis
- GIVEN an image with bounding box center at $(u=250, v=250)$ and $S = 0.5$
- WHEN a vertex at $(u=250, v=150)$ (above center in raster) is transformed
- THEN the resulting CAD coordinate is $(x=0.0, y=+50.0)$ with origin centered at $(0, 0)$

---

### Requirement: analyze_image_to_cad Tool Execution and CAD Enqueueing
The MCP tool `analyze_image_to_cad` MUST provide dual execution capabilities for geometric inspection and 3D solid construction:
1. **Inspection Mode (`create_solid = false`)**:
   - The tool MUST return a structured JSON response containing:
     - `outer_boundary`: array of 2D coordinates `[[x, y], ...]`.
     - `holes`: array of 2D polygon vertex arrays `[[[x, y], ...], ...]`.
     - `scaling_factor`: computed ratio in mm/px.
     - `bounds_mm`: `{ width, height }` of the oriented bounding box.
     - `vertex_count`: total vertices across outer boundary and holes.
   - The tool MUST NOT enqueue a CAD mutation job when `create_solid` is false.
2. **Solid Generation Mode (`create_solid = true`)**:
   - When `create_solid = true`, the parameter `depth` MUST be provided as a positive finite number in $(0, 10000]\text{ mm}$.
   - The tool MUST resolve `deviceId`, target CAD, and `documentId`, and enqueue an `extrude_polygon` operation passing the calibrated outer boundary, child hole polygons, `depth`, and `plane` (`XY`, `XZ`, `YZ`).
   - The job MUST construct a 3D solid prism with through-holes and export a preview STL.

#### Scenario: Geometric inspection returns structured parameters without enqueuing
- GIVEN a caller invoking `analyze_image_to_cad` with valid image base64 and `create_solid = false`
- WHEN the tool executes
- THEN it returns a structured JSON payload with `outer_boundary`, `holes`, and `scaling_factor`, and enqueues no CAD jobs

#### Scenario: Solid creation mode enqueues extrude_polygon job
- GIVEN a caller invoking `analyze_image_to_cad` with `create_solid = true`, `depth = 15.0`, `plane = "XY"`, and `confirmed = true`
- WHEN the tool executes
- THEN it enqueues an `extrude_polygon` job with the calibrated outer boundary and inner holes, returning the enqueued job ID

#### Scenario: Validation fails when create_solid is true but depth is missing
- GIVEN a caller invoking `analyze_image_to_cad` with `create_solid = true` but omitting `depth`
- WHEN schema validation executes
- THEN validation fails with a required parameter error on `depth` and no job is enqueued
