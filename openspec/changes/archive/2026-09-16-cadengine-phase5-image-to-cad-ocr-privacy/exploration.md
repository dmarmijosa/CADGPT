# Exploration — cadengine-phase5-image-to-cad-ocr-privacy

This document explores the architectural design, trade-offs, security invariants, computer vision pipelines, and implementation plan for **Phase 5** of CAD Engine: **Image-to-CAD, OCR, Consent Governance, and Account Privacy**.

Phase 5 advances CAD Engine across three foundational pillars:

1. **Image-to-CAD, OCR & Computer Vision Pipeline**: Enabling the AI agent and MCP clients to convert raster engineering drawings, blueprints, logos, and silhouettes into 100% millimetric CAD solids with dimensional annotations, plus professional 3D typography (emboss, engrave, flat) via FreeCAD.
2. **Registration Consent & Data Treatment Slide-Up Banner (Bottom Sheet)**: Delivering a legally compliant, GDPR/LOPD-aligned data treatment notice with an animated slide-up panel (`translateY`), dark glassmorphism styling, and acceptance controls across the Keycloak Stitch theme and web dashboard.
3. **User Account Deletion ("Eliminar cuenta") with Backend Cascade**: Empowering users to exercise their Right to Erasure ("Derecho al olvido") through a destructive confirmation UI in the Angular web app, a secure NestJS endpoint (`DELETE /api/account`), an atomic SQLite cascade unlinking physical mesh files on disk, and automated Keycloak Admin REST API identity purging.

---

## 1. Current State (Verified in Codebase)

### 1.1 CAD Execution & Modeling Tools
- **Operation Allowlist (`ops-allowlist.json`, `apps/api/src/tools.ts:14-33`, `agent/cadgpt_agent/discovery.py:16-35`)**:
  - Exactly 18 operations are currently allowlisted and synchronized:
    - Primitives: `create_box`, `create_cylinder`, `create_sphere`, `create_cone`, `extrude_rect`, `create_wedge`, `extrude_polygon`.
    - Booleans: `boolean_cut`, `boolean_union`, `boolean_intersect`.
    - Dressing & Lofting: `fillet`, `chamfer`, `loft`.
    - Transforms & Inspection: `translate_object`, `rotate_object`, `scale_object`, `read_scene`, `export_design`.
  - There are currently **no operations** for 3D text generation (`create_text_3d`) or image/computer vision perception (`analyze_image_to_cad`).
- **FreeCAD Worker Dispatch (`agent/cadgpt_agent/freecad_worker.py`)**:
  - `extrude_polygon` (`freecad_worker.py:188-219`) parses an array of 2D coordinates `[[u, v], ...]`, builds a closed `Part.makePolygon`, creates a single planar `Part.Face`, and extrudes it along the normal of the chosen plane (`XY`, `XZ`, `YZ`).
  - It does **not** currently handle internal polygon cutouts (holes) or nested multi-contour shapes.
  - No typography or lettering modules exist; neither `Draft.make_shapestring` nor font resolution is implemented.
- **Subprocess Isolation**:
  - `freecad_worker.py` is invoked via `FreeCADCmd`'s own embedded Python interpreter. In standard distributions, FreeCAD's Python environment lacks third-party imaging libraries such as `cv2` (OpenCV) or `pytesseract`.
  - Conversely, the CAD Engine host agent (`agent/cadgpt_agent/`) runs on standard Python 3.11+ where dependencies can be installed.

### 1.2 Authentication, Consent & Keycloak Theme
- **Keycloak Login Theme (`deploy/themes/cadgpt/login/`)**:
  - `theme.properties` sets `parent=keycloak.v2`, `import=common/keycloak`, and `styles=css/stitch.css`.
  - No custom `.ftl` template files currently exist in the theme folder. It relies entirely on Keycloak v2 default HTML templates decorated by `stitch.css`.
  - `stitch.css` defines the Precision CAD workbench palette (Inter + JetBrains Mono, Canvas `#090D16`, Surface `#0D1322`, Electric Cyan `#00F0FF`, Alert Red `#EF4444`).
  - No slide-up bottom sheet classes, keyframe animations, or consent banner rules are present in `stitch.css`.
- **Identity Broker & Registration Flow (`deploy/cadgpt-realm.json`, `deploy/prod/cadgpt-realm.prod.json`)**:
  - Both realm files configure Google Social Login (`identityProviders: [{ alias: "google", ... }]`).
  - `registrationAllowed: true` is enabled.
  - When users register via standard username/password, Keycloak displays `register.ftl`.
  - When users register via Google OAuth, Keycloak's `first broker login` flow bypasses `register.ftl` and directly issues the session redirect to the web app callback.

### 1.3 User Lifecycle, Storage & Mesh Retention
- **Store Architecture (`apps/api/src/store.ts`)**:
  - Backed by Node.js native SQLite (`node:sqlite::DatabaseSync`) with WAL mode enabled.
  - Tables: `pairings`, `devices`, `jobs`, `documents`, `meshes`, `api_keys`, `allowed_roots`.
  - Every table is strictly partitioned by `owner` (derived from OIDC JWT `sub`).
  - `Store` currently provides individual item deletion: `removeRoot(owner, id)`, `deleteMesh(jobId)`, `revokeApiKey(owner, id)`, `revoke(owner, id)` (devices).
  - There is **no method** to delete all user assets or purge an account in an atomic cascade.
- **Physical Mesh Storage on Disk (`apps/api/src/mesh.ts`)**:
  - Uploaded STL meshes are stored on the filesystem at `<dataDir>/meshes/<jobId>.stl` (and temporary `.part` uploads).
  - When meshes are pruned or deleted in the database, `unlinkIfExists(meshPath)` must be called to prevent disk leakage.
- **API Endpoints (`apps/api/src/main.ts`)**:
  - Endpoints exist for device management, API keys, jobs, pairings, mesh retrieval, and allowlisted roots.
  - There is no endpoint for user account deletion (`DELETE /api/account` or `DELETE /api/users/me`).
  - The API does not currently communicate with Keycloak's Admin REST API.

### 1.4 Web Dashboard & UI Layout
- **Angular Client (`apps/web/`)**:
  - Modular Angular 19 standalone architecture with signals and `oidc-client-ts`.
  - `shell.html` contains the top HUD bar, primary rail navigation (`devices`, `designs`, `jobs`, `connect`, `keys`, `about`), and user profile pill (`{{ user.profile.preferred_username }}`).
  - Sign-out is implemented via `AuthService.logout()`.
  - There is no UI section for account settings, data privacy governance, or destructive account termination.

---

## 2. Technical Deep Dive & Architectural Pillars

```
+----------------------------------------------------------------------------------------------------+
|                                    CAD ENGINE PLATFORM (PHASE 5)                                   |
+-----------------------------------+--------------------------------+-------------------------------+
|     1. IMAGE-TO-CAD & OCR         |       2. CONSENT & PRIVACY     |    3. ACCOUNT PURGE CASCADE   |
|  - OpenCV Vectorization Pipeline  |  - Keycloak Bottom Sheet Div   |  - Angular Destructive Dialog |
|  - Dimension & Annotation OCR     |  - CSS `translateY` Animation  |  - `DELETE /api/account` Route|
|  - 3D Typography (FreeCAD Draft)  |  - Glassmorphic HUD Theme      |  - SQLite Atomic Multi-Table  |
|  - Emboss / Engrave / Flat        |  - Dual Gateway (Keycloak + Web|  - Disk Mesh Unlink Sweep    |
|  - Metric Scaling Calibration     |  - Terms & Data Treatment Copy |  - Keycloak Admin REST Purge  |
+-----------------------------------+--------------------------------+-------------------------------+
```

---

### Pillar 1: Image-to-CAD, OCR & Computer Vision Pipeline

#### 1.1 Problem Statement & Metric Precision Invariant
CAD engineering requires 100% millimetric precision ($mm$). Raster drawings (PNG, JPEG, WebP) exist purely in discrete pixel space $(u, v)$ without an inherent physical metric scale.
Furthermore, engineering blueprints combine three distinct visual layers:
1. **Part Geometry**: Thick solid contours, profile curves, and internal voids/holes.
2. **Dimension Lines & Annotations**: Thin witness lines, arrows, radius callouts (e.g., `R10`), diameter symbols (`Ø25`), and millimetric linear measurements (`50mm`).
3. **Typography & Title Blocks**: Part numbers, labels, tolerances, and branding text.

If an unguided vectorizer processes an engineering drawing directly, it will treat dimension lines and lettering as part of the physical solid, producing a mangled mesh. Phase 5 creates an intelligent, segmented pipeline that extracts exact metric boundaries, reads dimensions, and supports 3D typography.

```
+------------------+     +-----------------------+     +------------------------+
|   Raster Image   | --> | Preprocessing & Denoise| --> | Semantic Segmentation  |
| (Blueprint/Logo) |     | (Bilateral / Gaussian)|     | (Lines vs Text vs Part)|
+------------------+     +-----------------------+     +------------------------+
                                                                   |
          +--------------------------------------------------------+
          |                                                        |
          v                                                        v
+-------------------------+                              +-----------------------+
| OCR & Dimension Parsing |                              | Contour Vectorization |
| ("50mm", "R10", "Ø25")  |                              | (Otsu, findContours)  |
+-------------------------+                              +-----------------------+
          |                                                        |
          |       +------------------------------------+           |
          +-----> | Metric Calibration: S = mm / pixel | <---------+
                  +------------------------------------+
                                     |
                                     v
                  +------------------------------------+
                  | Clean Scaled Metric Polygons & Wires|
                  +------------------------------------+
                                     |
                                     v
                  +------------------------------------+
                  | FreeCAD Solid Generation (Extrude) |
                  +------------------------------------+
```

#### 1.2 OCR & Dimension Extraction Comparison

| Approach | Latency | Memory & Footprint | Blueprint Text Accuracy | Rotated & Leader Line Handling | Architectural Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Tesseract (`pytesseract`)** | Fast (<120ms) | Low (~45 MB) | Poor on raw drawings without extensive morphology | Fails frequently on $45^\circ / 90^\circ$ dimension text | Excellent for isolated, cropped text boxes; poor for holistic drawing understanding. |
| **EasyOCR (CRAFT + CRNN)** | Medium (~600ms) | Heavy (~250 MB + PyTorch) | Moderate to Good | Good at arbitrary orientations | Too heavy as a mandatory agent dependency; high cold-start overhead. |
| **Multimodal Vision LLMs (MCP Client / Orchestrator)** | ~1.5s - 3.0s | Zero local footprint | Outstanding (understands engineering symbols $\varnothing, \pm, R$) | Exceptional semantic contextual reasoning | **Preferred for semantic understanding**: The LLM analyzes the drawing, extracts dimensions, datum references, and design intent. |
| **OpenCV Text Masking** | Very Fast (<30ms) | Negligible | N/A (Segmentation only) | Isolates high-aspect-ratio text components | **Essential for vectorization**: Masks out annotation text so it does not distort the part boundary. |

**Recommended Architectural Strategy**:
- **Semantic Interpretation (Multimodal LLM via MCP)**: The client model (Claude / GPT-4o) inspects the drawing, detects key nominal dimensions (e.g. `total_width: 120mm`), and passes them as reference constraints to the tool.
- **Deterministic Computer Vision (Host Agent with OpenCV)**: The agent runs the vectorization, contour tracing, Douglas-Peucker simplification, and metric scaling.
- **Fallback Local OCR (Tesseract / Regex)**: If no reference dimension is provided by the caller, the agent runs an automated text detection pass over masked dimension regions to auto-detect measurements matching `r'(\d+(?:\.\d+)?)\s*(?:mm|MM)?'`.

#### 1.3 Computer Vision Vectorization & Metric Calibration Pipeline
The host agent module `cadgpt_agent/vision.py` implements the vectorization pipeline using `opencv-python-headless`:

1. **Grayscale & Filtering**:
   ```python
   gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
   blurred = cv2.bilateralFilter(gray, d=7, sigmaColor=50, sigmaSpace=50)
   ```
2. **Binarization**:
   - For black-on-white drawings: `cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)`
   - For uneven lighting/sketches: `cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3)`
3. **Contour Tracing & Hierarchy**:
   - `cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)`
   - Parses the hierarchy tree:
     - Root contour (`hierarchy[0][i][3] == -1` with maximum area): The outer boundary of the solid.
     - Direct child contours (`hierarchy[0][j][3] == root_idx`): Internal cutouts and through-holes.
4. **Polygon Simplification (Douglas-Peucker)**:
   - High-resolution scans introduce 1-pixel staircase aliasing.
   - `approx = cv2.approxPolyDP(contour, epsilon=0.0025 * cv2.arcLength(contour, True), closed=True)`
   - Produces clean polygonal vertices with minimal vertex count while preserving arcs and sharp corners.
5. **Metric Scaling & Origin Calibration**:
   - Let $D_{px}$ be the pixel distance between two reference points (or the bounding width $W_{px} = \max(u) - \min(u)$).
   - Given user/LLM reference nominal length $L_{mm}$:
     $$S = \frac{L_{mm}}{D_{px}} \quad [\text{mm / pixel}]$$
   - Transform image coordinates $(u, v)$ to Cartesian CAD coordinates $(x, y)$:
     $$x = (u - u_{\text{center}}) \times S$$
     $$y = (v_{\text{center}} - v) \times S \quad (\text{Y-axis inverted for CAD})$$

#### 1.4 FreeCAD 3D Typography & Lettering (`Draft.make_shapestring`)
For mechanical parts requiring embossed part numbers, engraved calibration dials, or custom branding, FreeCAD provides `Draft.make_shapestring`.

##### Technical Realities & Invariants in FreeCAD:
1. **Font File Dependency**:
   - `Draft.make_shapestring(String, FontFile, Size, Tracking=0)` requires an **absolute path** to a readable TrueType (`.ttf`) or OpenType (`.otf`) font file on disk. If the font path does not exist, FreeCAD fails immediately.
   - **Resolution Strategy**:
     - The agent bundles a crisp, open-source sans-serif font: `agent/cadgpt_agent/fonts/Inter-Bold.ttf`.
     - `resolve_font(requested_font)` checks:
       1. Explicit allowlisted path (if provided).
       2. Bundled `Inter-Bold.ttf`.
       3. Standard OS fallback paths:
          - Windows: `C:\Windows\Fonts\arial.ttf`, `C:\Windows\Fonts\calibri.ttf`
          - macOS: `/System/Library/Fonts/Supplemental/Arial.ttf`, `/Library/Fonts/Arial.ttf`
          - Linux: `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`, `/usr/share/fonts/truetype/freefont/FreeSansBold.ttf`
2. **Headless Execution & Compatibility**:
   - In FreeCAD 0.20/0.21/1.0/1.1, the API method signature changed between snake_case and camelCase. We resolve dynamically:
     ```python
     make_ss = getattr(Draft, "make_shapestring", getattr(Draft, "makeShapeString", None))
     ```
3. **Face Construction & Extrusion**:
   - `make_ss` generates planar glyph wires. Letters with counter-spaces (holes like 'O', 'A', 'B', 'P') are properly grouped into `Part.Face` instances by FreeCAD's internal FreeType parser.
   - Extruding `shapestring.Shape` by `FreeCAD.Vector(0, 0, thickness)` creates a 3D `Part::Feature` solid composed of individual letter solids.
4. **Operation Modes**:
   - **`flat`**: Standalone 3D solid letters (e.g. for signage or multi-material 3D printing).
   - **`emboss`**: Projects outward from target solid surface. Joined via `Part::MultiFuse` (`boolean_union`).
   - **`engrave`**: Inset into target solid surface. Cut via `Part::Cut` (`boolean_cut`).
5. **Plane Alignment & Orientation**:
   - Supports `XY`, `XZ`, `YZ` planes with placement rotations and arbitrary 3D offsets $(x, y, z)$.

#### 1.5 Tool Contracts & Schema Expansion

##### Tool 1: `create_text_3d`
```typescript
export const createText3dSchema = z.object({
  deviceId: deviceIdFrag,
  cadId: cadIdFrag,
  documentId: documentIdFrag,
  name: nameFrag,
  text: z.string().min(1).max(120),
  size: mmFrag,                     // Height of capital letters in mm
  thickness: mmFrag,                // Extrusion height / cut depth in mm
  mode: z.enum(['flat', 'emboss', 'engrave']).default('flat'),
  target_object: objectNameFrag.optional(), // Required if mode is emboss/engrave
  plane: planeFrag.default('XY'),
  position: positionFrag,
  tracking: z.number().finite().min(-5).max(50).optional(),
  font: z.string().max(120).optional(),
  confirmed: confirmedFrag,
}).strict();
```

##### Tool 2: `analyze_image_to_cad`
```typescript
export const analyzeImageToCadSchema = z.object({
  deviceId: deviceIdFrag,
  cadId: cadIdFrag,
  documentId: documentIdFrag,
  name: nameFrag,
  image_base64: z.string().min(20),       // Data URI or raw base64
  reference_dimension: z.object({
    type: z.enum(['width', 'height', 'points']),
    value_mm: mmFrag,
    points: z.array(z.tuple([coordFrag, coordFrag])).length(2).optional(),
  }).optional(),
  threshold_mode: z.enum(['otsu', 'adaptive', 'canny']).default('otsu'),
  invert: z.boolean().default(false),
  tolerance: z.number().finite().min(0.0001).max(0.05).default(0.0025),
  create_solid: z.boolean().default(false),
  depth: mmFrag.optional(),               // Required if create_solid is true
  plane: planeFrag.default('XY'),
  position: positionFrag,
  confirmed: confirmedFrag,
}).strict();
```

---

### Pillar 2: Registration Consent & Data Treatment Slide-Up Banner (Bottom Sheet)

#### 2.1 Legal & Regulatory Requirements
To satisfy GDPR, CCPA, and international data privacy laws:
1. **Explicit Data Treatment Notice**: Users must be explicitly informed how CAD design files, geometric telemetry, job logs, and paired machine tokens are stored and processed.
2. **Active Consent Gate**: Registration cannot be completed silently. The user must actively accept the terms before an account is provisioned.
3. **Auditability & Traceability**: The timestamp and version of the consent agreement must be captured upon registration.

#### 2.2 Keycloak Stitch Theme Integration (`deploy/themes/cadgpt/login/`)
Keycloak's authentication flow presents `register.ftl` during user-initiated self-registration.
We implement a custom `register.ftl` in `deploy/themes/cadgpt/login/register.ftl` inheriting from `keycloak.v2`:

- **Component Structure**:
  ```html
  <!-- Backdrop -->
  <div id="consent-backdrop" class="stitch-consent-backdrop" aria-hidden="true"></div>

  <!-- Slide-up Bottom Sheet -->
  <aside id="consent-sheet" class="stitch-consent-sheet" role="dialog" aria-labelledby="consent-title" aria-modal="true">
    <div class="stitch-sheet-header">
      <div class="stitch-sheet-title-group">
        <span class="stitch-sheet-badge">GDPR & ISO/IEC 27001</span>
        <h2 id="consent-title">Tratamiento de Datos y Gobernanza CAD</h2>
      </div>
      <button type="button" class="stitch-sheet-close" id="consent-close" aria-label="Cerrar">&times;</button>
    </div>

    <div class="stitch-sheet-body">
      <p class="stitch-sheet-lead">
        Para garantizar la soberanía de sus diseños y habilitar la orquestación remota con agentes CAD, 
        CAD Engine opera bajo principios de contención estricta:
      </p>
      <ul class="stitch-policy-list">
        <li><strong>Contención Local:</strong> Sus modelos paramétricos se procesan localmente en su máquina paired.</li>
        <li><strong>Almacenamiento de Mallas:</strong> Solo las mallas trianguladas de previsualización (STL) se almacenan temporalmente en el servidor para renderizado 3D web.</li>
        <li><strong>Derecho al Olvido:</strong> Puede solicitar la eliminación irrevocable e inmediata de su cuenta y todos los datos asociados en cualquier momento.</li>
      </ul>
    </div>

    <div class="stitch-sheet-footer">
      <label class="stitch-consent-checkbox">
        <input type="checkbox" id="consent-accept-check" required />
        <span>He leído y acepto los Términos de Servicio y la Política de Privacidad de CAD Engine.</span>
      </label>
      <div class="stitch-sheet-actions">
        <button type="button" id="consent-accept-btn" class="stitch-btn-primary" disabled>
          Aceptar y Continuar
        </button>
      </div>
    </div>
  </aside>
  ```

#### 2.3 Web Dashboard Fallback & Google Brokered Auth
Because users authenticating via Google Social Login bypass `register.ftl` directly to the `/callback` URL:
- In the Angular Web App (`apps/web/`), the `ShellComponent` (or an `AppConsentGuard`) checks whether the authenticated user has confirmed legal consent (`localStorage.getItem('cadgpt:consent:v1')` or a backend profile flag).
- If consent is missing, the web dashboard displays the exact same glassmorphic slide-up bottom sheet component, preventing dashboard interaction until acknowledged.

#### 2.4 UI Styling Specifications in `stitch.css`
```css
/* Stitch Precision CAD Slide-Up Bottom Sheet */
.stitch-consent-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(9, 13, 22, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.stitch-consent-backdrop.active {
  opacity: 1;
  pointer-events: auto;
}

.stitch-consent-sheet {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 100%);
  width: 100%;
  max-width: 680px;
  background: var(--stitch-surface);
  border-top: 2px solid var(--stitch-primary);
  border-left: 1px solid var(--stitch-border);
  border-right: 1px solid var(--stitch-border);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 
    0 -12px 48px rgba(0, 0, 0, 0.85),
    0 0 24px -4px rgba(0, 240, 255, 0.25);
  padding: 28px;
  z-index: 1001;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--stitch-ink);
}

.stitch-consent-sheet.active {
  transform: translate(-50%, 0%);
}

.stitch-sheet-badge {
  display: inline-block;
  font-family: var(--pf-v5-global--FontFamily--monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--stitch-primary);
  background: rgba(0, 240, 255, 0.08);
  border: 1px solid rgba(0, 240, 255, 0.3);
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}
```

---

### Pillar 3: User Account Deletion ("Eliminar cuenta") with Backend Cascade

#### 3.1 Security Invariants & Authentication
- **Route**: `DELETE /api/account` (alias: `DELETE /api/users/me`)
- **Bearer Authentication**: Validates OIDC JWT via `auth(req.headers.authorization, 'cad:write')`.
- **Zero Caller-Supplied Identity Invariant**: The user identifier is derived exclusively from the token's `sub` claim. Neither path parameters nor request body parameters can specify a target identity. This prevents privilege escalation or IDOR vulnerabilities.

#### 3.2 Backend Cascading Deletion & Disk Cleanup
The deletion of an account must completely purge all user data across two persistence tiers:
1. **Physical Filesystem (STL Meshes on Disk)**:
   - Queries all mesh identifiers linked to the user:
     `SELECT job_id FROM meshes WHERE document_id IN (SELECT id FROM documents WHERE owner = ?)`
   - Iterates through the list and calls `unlinkIfExists(meshPath(dataDir, jobId, '.stl'))` and `.part` siblings.
2. **SQLite Database Cascade**:
   - Executes inside a synchronous `BEGIN IMMEDIATE ... COMMIT` block:
     ```sql
     -- 1. Purge meshes metadata
     DELETE FROM meshes WHERE document_id IN (SELECT id FROM documents WHERE owner = :owner);
     -- 2. Purge documents registry
     DELETE FROM documents WHERE owner = :owner;
     -- 3. Purge jobs history and payloads
     DELETE FROM jobs WHERE owner = :owner;
     -- 4. Purge allowed roots
     DELETE FROM allowed_roots WHERE owner = :owner;
     -- 5. Purge paired devices
     DELETE FROM devices WHERE owner = :owner;
     -- 6. Purge API keys
     DELETE FROM api_keys WHERE owner = :owner;
     -- 7. Purge pairing sessions
     DELETE FROM pairings WHERE owner = :owner;
     ```

#### 3.3 Keycloak Identity Purging (Admin REST API)
To achieve complete GDPR erasure, the user cannot simply be deleted in SQLite—their Keycloak credentials, sessions, and social identity links must be destroyed.

##### Architecture:
- Keycloak provides: `DELETE /admin/realms/{realm}/users/{userId}`.
- Because `cadgpt-web` configured an OIDC user-property mapper for `sub = id` (`deploy/prod/cadgpt-realm.prod.json:58-71`), the authenticated `owner` UUID **is** the Keycloak User ID.
- The NestJS API initializes a lightweight internal `KeycloakAdminService`:
  1. Requests an administrative access token from Keycloak:
     - Development / Production Docker: Authenticates via `master` realm `admin-cli` password grant or a dedicated confidential client with `manage-users` role.
     - Endpoint: `POST {KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token`
  2. Issues the delete call:
     - `DELETE {KEYCLOAK_INTERNAL_URL}/admin/realms/{KEYCLOAK_REALM}/users/{owner}`
  3. Handles responses gracefully:
     - `204 No Content`: User successfully purged.
     - `404 Not Found`: User already deleted; continues gracefully.
     - Any network error or unexpected status throws a `502 Bad Gateway` error before committing irreversible state or logs an audit trail.

#### 3.4 Angular Destructive UX & Safe Deletion Modal
In `apps/web/src/app/pages/about/` (or a dedicated Profile/Account section):
1. **Destructive Action Trigger**:
   - A button styled with destructive border: `"Eliminar cuenta"` (`.btn-destructive`).
2. **Safety Confirmation Dialog**:
   - Displays clear warning text detailing the permanent loss of all designs, devices, and keys.
   - **Verification Input**: The user must explicitly type `"ELIMINAR"` into an input field.
   - The confirmation button remains disabled until the input matches exactly.
3. **Execution & Session Purge**:
   - Calling the deletion triggers `ApiClient.deleteAccount()`.
   - On response, calls `AuthService.logout()` to destroy the local `oidc-client-ts` session storage and redirect to the landing page with a success notification.

---

## 3. Comparison of Implementation Approaches & Trade-offs

### 3.1 Computer Vision & OCR Architecture

| Strategy | Advantages | Drawbacks | Recommendation |
| :--- | :--- | :--- | :--- |
| **A. All-in-One inside FreeCAD Embedded Python** | No IPC needed between CV and CAD. | FreeCAD's Python does not bundle OpenCV or Tesseract. Compiling or pip-installing C-extensions into FreeCAD's internal directory risks library DLL hell and breaks cross-platform portability. | **Rejected**. |
| **B. CV & OCR on NestJS Server** | Workstation agent remains thin. | Consumes server CPU/RAM for heavy image processing; cannot access local file paths on user's workstation. | **Rejected**. |
| **C. Two-Tier Agent Pipeline (Decoupled)** | Agent host environment runs `opencv-python-headless` (clean, virtualenv-managed); extracts clean geometric coordinates; passes pure JSON `extrude_polygon` / `create_text_3d` parameters to `FreeCADCmd`. | FreeCAD worker stays pure C++/Python without external binary dependencies; 100% reliable and cross-platform. | **Selected (Winner)**. |

### 3.2 3D Typography Architecture

| Strategy | Advantages | Drawbacks | Recommendation |
| :--- | :--- | :--- | :--- |
| **A. OpenCV Contour Font Vectorization** | Renders text to pixel bitmap, then traces contours. | Loses TrueType spline precision; jagged edges on small font sizes; imperfect metric fidelity. | **Rejected**. |
| **B. FreeCAD `Draft.make_shapestring` with Bundled TTF** | True mathematical Bezier curves directly from TTF glyphs; native OpenCASCADE B-Rep solid extrusion; exact metric heights. | Requires a local TTF file on disk. | **Selected (Winner)**. Solved by bundling `Inter-Bold.ttf` with fallback to OS fonts. |

### 3.3 Keycloak Admin Auth for Account Deletion

| Strategy | Advantages | Drawbacks | Recommendation |
| :--- | :--- | :--- | :--- |
| **A. Keycloak Master `admin-cli` Password Grant** | Uses credentials already required in `.env` (`KC_BOOTSTRAP_ADMIN_PASSWORD`); zero additional client configuration. | Requires passing admin password to API container. | **Selected for standard deployment** with fallback to confidential service client. |
| **B. Dedicated Confidential Service Client (`cadgpt-admin`)** | Scoped strictly to `cadgpt` realm; least privilege. | Requires pre-creating client with service account role mappings in realm JSON. | **Supported as optimal production alternative**. |

---

## 4. Risks, Edge Cases & Mitigations

### 4.1 Missing Font Files on Headless Linux / Windows
- **Risk**: If FreeCAD's `Draft.make_shapestring` is invoked without a valid font path, it throws a C++ runtime exception.
- **Mitigation**: The agent repository bundles `agent/cadgpt_agent/fonts/Inter-Bold.ttf`. The worker checks `font_path.is_file()` before calling `Draft.make_shapestring`, falling back to bundled or verified OS fonts.

### 4.2 High-Frequency Staircase Noise in OpenCV Contours
- **Risk**: Directly converting raw OpenCV pixel contours into 3D polygon wires generates thousands of micro-edges, leading to OpenCASCADE kernel timeouts during extrusion.
- **Mitigation**: Always run Douglas-Peucker simplification (`cv2.approxPolyDP`) with adaptive epsilon ($0.002 \cdot \text{perimeter}$) to produce clean, minimal-vertex polygons.

### 4.3 Keycloak Network Partition during Account Deletion
- **Risk**: SQLite data is deleted, but the Keycloak container is temporarily unreachable, leaving an orphaned identity.
- **Mitigation**: Call Keycloak Admin API **before** committing the SQLite transaction. If Keycloak fails with a 5xx error, abort the transaction and return 502 to the user, ensuring consistency.

### 4.4 Orphaning STL Files on Host Filesystem
- **Risk**: Deleting database rows in `meshes` leaves orphan `.stl` files occupying disk space in `<dataDir>/meshes/`.
- **Mitigation**: The store method `deleteAccount()` queries all `job_id` values for the user's meshes, performs synchronous or awaited `unlinkIfExists()` on each file, and only then executes the database deletion.

---

## 5. Proposed Slices & Implementation Roadmap

```
+---------------------------------------------------------------------------------------------------+
|                                     PHASE 5 EXECUTION ROADMAP                                     |
+------------------------------------+--------------------------------+-----------------------------+
|  SLICE 1: 3D TEXT & TYPOGRAPHY     |  SLICE 2: IMAGE CV PIPELINE    |  SLICE 3: PRIVACY & DELETION|
|  - Bundled font & font resolver    |  - `cadgpt_agent/vision.py`    |  - Keycloak Admin Service   |
|  - FreeCAD `create_text_3d` op     |  - OpenCV contour & hierarchy  |  - `DELETE /api/account`    |
|  - Emboss, engrave, flat modes     |  - Douglas-Peucker scaling     |  - SQLite + Disk cascade    |
|  - MCP tool & allowlist sync       |  - `analyze_image_to_cad` tool |  - Bottom sheet consent UI  |
|  - Unit & mock tests               |  - Multi-contour extrusion     |  - Destructive confirmation |
+------------------------------------+--------------------------------+-----------------------------+
```

### Slice 1: 3D Typography & Lettering (`create_text_3d`)
1. Bundle `Inter-Bold.ttf` in `agent/cadgpt_agent/fonts/`.
2. Implement font discovery in `freecad_worker.py`.
3. Implement `_create_text_3d` in `freecad_worker.py` supporting `flat`, `emboss`, and `engrave`.
4. Register `create_text_3d` in `ops-allowlist.json`, `discovery.py`, and `tools.ts`.
5. Unit tests in `test_freecad_worker.py` and `tools.test.ts`.

### Slice 2: Computer Vision & Contour Extraction (`analyze_image_to_cad`)
1. Add `opencv-python-headless` and `numpy` to `agent/pyproject.toml`.
2. Implement `cadgpt_agent/vision.py` for image decoding, Otsu thresholding, contour tree extraction, and metric calibration.
3. Enhance `extrude_polygon` in `freecad_worker.py` to support nested inner cutouts (holes).
4. Register `analyze_image_to_cad` in `tools.ts` and dispatch to agent.
5. Unit tests for contour simplification, metric scaling, and coordinate inversion.

### Slice 3: Privacy Governance, Consent Sheet & Account Deletion
1. Implement `register.ftl` with the sliding bottom sheet in `deploy/themes/cadgpt/login/`.
2. Add bottom sheet keyframe animations and glassmorphism styling in `stitch.css`.
3. Implement `KeycloakAdminService` in `apps/api/src/keycloak.ts`.
4. Implement `store.deleteAccount(owner, dataDir)` with physical mesh unlinking in `apps/api/src/store.ts`.
5. Wire `DELETE /api/account` in `apps/api/src/main.ts`.
6. Add "Eliminar cuenta" destructive dialog in `apps/web/` with typed verification and session purge.
7. Integration tests for account deletion cascade, disk unlinking, and Keycloak error handling.
