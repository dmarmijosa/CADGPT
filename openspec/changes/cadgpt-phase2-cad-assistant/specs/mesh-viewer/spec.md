## mesh-viewer (NEW)

Purpose: render the STL (binary, via `MeshPart`) in-browser.

### Requirement: STL Rendering on Design Route
The web app MUST render the latest STL of a document on `/designs/:id` using `STLLoader` from `three/addons/loaders`.
#### Scenario: Preview renders after job completion
- GIVEN a document with a succeeded job producing a mesh
- WHEN the owner opens `/designs/:id`
- THEN the viewer loads and displays the STL geometry

### Requirement: Pending State Without Mesh
The viewer MUST show a pending state, not an error, when no mesh exists yet.
#### Scenario: No mesh yet
- GIVEN a document with only a queued/running job
- WHEN the owner opens its design route
- THEN the viewer shows pending and does not attempt to load a mesh URL

### Requirement: Browser-Only Loading
Mesh loading MUST run only in the browser, never during any server-side render pass (zoneless/SSR guard).
#### Scenario: SSR pass skips three.js
- GIVEN a server-rendered pass of the design route
- WHEN rendered
- THEN no three.js/WebGL loading occurs during that pass
