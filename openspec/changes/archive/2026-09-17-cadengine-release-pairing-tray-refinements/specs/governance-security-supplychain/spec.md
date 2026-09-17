## governance-security-supplychain (MODIFIED)

Purpose: Establish open-source governance under Apache License 2.0 with patent protections, implement a coordinated vulnerability disclosure policy with binding remediation SLAs and safe harbor, enforce automated multi-language static application security testing (CodeQL), automate dependency vulnerability patching across all subprojects (Dependabot), and enforce public release delivery for prereleases.

---

### MODIFIED Requirement: GitHub Releases Prerelease Delivery Policy
The automated release packaging workflow (`.github/workflows/release.yml`) MUST publish alpha, beta, and release candidate tagged releases as public prereleases:
1. **Prerelease Delivery & Metadata Resolution**:
   - The release creation step MUST set `prerelease: true` and MUST NOT set `draft: true` when invoking `gh release create`.
   - Release metadata MUST be immediately resolvable via the public GitHub REST API endpoint `GET /repos/{owner}/{repo}/releases` without returning 404 or requiring administrative API authentication.
   - All release assets MUST be immediately downloadable via public HTTP requests upon workflow completion.
2. **Harmonized Asset Naming & Linux Archive Standardization**:
   - The workflow MUST package and publish the Linux binary archive strictly as `cadengine-linux-x64.tar.gz` (lowercase, matching repository documentation and client download scripts).
   - Canonical release artifacts MUST consist of:
     - `CADEngine-Setup-x64.msi` (WiX Toolset v4 elevated installer)
     - `CADEngine-Setup-windows-x64.exe` (Inno Setup installer)
     - `CADEngine-macos-arm64.dmg` (macOS Apple Silicon disk image)
     - `CADEngine-macos-x64.dmg` (macOS Intel disk image)
     - `cadengine-linux-x64.tar.gz` (Linux x86_64 tarball)
     - `SHA256SUMS.txt` (SHA-256 checksum manifest)
3. **Elimination of Legacy CADGPT Duplicate Assets**:
   - The packaging workflow MUST NOT generate, copy, or upload legacy `CADGPT-*` archives (including `CADGPT-linux-x64.tar.gz`, `CADGPT-macos-arm64.dmg`, `CADGPT-macos-x64.dmg`, and `CADGPT-Setup-windows-x64.exe`).
4. **Decommissioning of Obsolete Release `v0.1.0-alpha.2`**:
   - The legacy GitHub release `v0.1.0-alpha.2` MUST be decommissioned and deleted from GitHub Releases (`gh release delete v0.1.0-alpha.2 --yes`), preventing automated update checks (`cadengine update` / `check_latest_release()`) and users from discovering obsolete binaries lacking the Blender worker and using outdated naming.
5. **Complete Product Rebranding ("CAD Engine")**:
   - All release metadata, titles, and release notes MUST enforce the official name "CAD Engine".
   - The codebase, documentation (`docs/deployment.md`), web guides (`apps/web/README.md`), container recipes (`Dockerfile`), UI stylesheets (`deploy/themes/cadgpt/...`), and test suites (`agent/tests/test_strategies.py`) MUST contain zero residual occurrences of the legacy product name "CAD Agent Designer".

#### Scenario: Tagged alpha release creation
- GIVEN a release workflow triggered by pushing tag `v0.2.0-alpha.1`
- WHEN the packaging and publishing job executes
- THEN `gh release create` creates a release titled "CAD Engine v0.2.0-alpha.1 — unsigned alpha", marked as "Pre-release", leaves `draft: false`, and uploads the canonical set of installer and checksum assets

#### Scenario: Public resolution of prerelease artifacts
- GIVEN a completed release workflow for `v0.2.0-alpha.1`
- WHEN an unauthenticated client queries `https://api.github.com/repos/dmarmijosa/CADGPT/releases`
- THEN the release entry is present with `prerelease: true`, `draft: false`, and public download URLs for all attached installer assets

#### Scenario: Linux archive naming harmonization and legacy asset elimination
- GIVEN the release workflow packaging job completes for all platforms
- WHEN the generated artifacts directory is inspected prior to release publication
- THEN it contains `cadengine-linux-x64.tar.gz` and contains no files matching pattern `CADGPT-*`

#### Scenario: Obsolete release v0.1.0-alpha.2 decommissioning
- GIVEN GitHub repository releases
- WHEN the release list is queried via `gh release list` or GitHub API
- THEN release `v0.1.0-alpha.2` is absent, preventing client self-update checks from targeting deprecated binaries

#### Scenario: Clean product branding with zero residual CAD Agent Designer references
- GIVEN repository source files, deployment guides, Dockerfiles, and tests
- WHEN a recursive case-insensitive search for "CAD Agent Designer" is performed
- THEN exactly zero occurrences are found across active repository assets
