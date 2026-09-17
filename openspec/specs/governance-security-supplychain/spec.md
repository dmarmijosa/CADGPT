## governance-security-supplychain (NEW)

Purpose: Establish open-source governance under Apache License 2.0 with patent protections, implement a coordinated vulnerability disclosure policy with binding remediation SLAs and safe harbor, enforce automated multi-language static application security testing (CodeQL), automate dependency vulnerability patching across all subprojects (Dependabot), and enforce public release delivery for prereleases.

### Requirement: Apache-2.0 Open-Source License Governance
The repository root MUST provide the complete text of the Apache License Version 2.0 in `LICENSE`.
1. **Patent Grant**: The project MUST grant perpetual, worldwide, non-exclusive, no-charge, royalty-free patent licenses under Section 3 for any patent claims licensable by contributors that are necessarily infringed by their contributions.
2. **Defensive Termination**: In accordance with Apache-2.0 Section 3 patent retaliation provisions, any patent litigation initiated by an entity against the project or its contributors alleging patent infringement by the software MUST automatically terminate all patent licenses granted to that entity under this license.
3. **Trademark Reservation**: The license terms MUST reserve all trademark rights under Section 6; the names "CAD Engine", "CADGPT", and associated project logos MUST NOT be used to endorse or promote derivative products without prior express written permission.
4. **Notices and Modification Tracking**: Source code files, distribution archives, and binary installers MUST include standard Apache-2.0 copyright notices and warranty disclaimers. Any modified files distributed downstream MUST carry prominent notices stating that the files were altered per Section 4b.

#### Scenario: Repository license verification
- GIVEN a cloned repository or distribution archive of CAD Engine
- WHEN the root `LICENSE` file is inspected
- THEN it contains the complete, unaltered text of the Apache License Version 2.0 including copyright notice, patent grant, and warranty disclaimers

#### Scenario: Defensive patent termination
- GIVEN an entity using or distributing CAD Engine under Apache-2.0
- WHEN that entity institutes patent litigation against CAD Engine contributors alleging that the software infringes their patent
- THEN all patent licenses granted to that entity under Apache-2.0 for CAD Engine terminate automatically as of the date such litigation is filed

---

### Requirement: Coordinated Vulnerability Disclosure and SLA Policy
The repository MUST publish a formal vulnerability disclosure and handling policy in `SECURITY.md`.
1. **Supported Version Window**: The policy MUST identify the active release line (`0.2.x`) as supported with security updates. All earlier releases (including `0.1.x`) MUST be designated End-Of-Life (EOL) and unsupported.
2. **Reporting Channels**: The policy MUST designate GitHub Private Vulnerability Reporting (`https://github.com/dmarmijosa/CADGPT/security/advisories/new`) as the primary intake channel, and provide a dedicated security inbox (`security@cadengine.dev`) as a secondary channel. Public issue trackers MUST NOT be used for reporting unpatched vulnerabilities.
3. **Response & Remediation SLAs**:
   - Maintainers MUST send an initial acknowledgment to the vulnerability reporter within 48 hours.
   - Maintainers MUST complete triage, severity assessment, and reproduction within 5 business days.
   - Confirmed Critical and High severity vulnerabilities (CVSS >= 7.0) MUST be patched and released within 14 calendar days.
   - Confirmed Medium and Low severity vulnerabilities (CVSS < 7.0) MUST be patched and released within 30 calendar days.
   - A standard 90 calendar day coordinated disclosure embargo MUST be observed prior to public disclosure, unless early disclosure is mutually agreed upon.
4. **Safe Harbor Provision**: The policy MUST include an explicit Safe Harbor clause stipulating that security researchers who discover and report vulnerabilities in good faith adherence to the policy SHALL NOT be subjected to civil litigation or criminal referral under the Computer Fraud and Abuse Act (CFAA), DMCA anti-circumvention provisions, or equivalent international statutes.

#### Scenario: Security report intake and acknowledgment
- GIVEN a vulnerability report submitted via GitHub Private Vulnerability Reporting
- WHEN the maintainers receive the submission
- THEN a written acknowledgment is sent to the reporter within 48 hours, followed by preliminary triage within 5 business days

#### Scenario: Critical vulnerability remediation within 14-day SLA
- GIVEN a confirmed Critical severity vulnerability in the active 0.2.x release branch
- WHEN triage completes and the fix is verified
- THEN an updated release addressing the vulnerability is published to GitHub Releases within 14 calendar days of triage completion

#### Scenario: Safe harbor protection for good-faith research
- GIVEN a security researcher conducting non-disruptive vulnerability discovery in adherence to `SECURITY.md`
- WHEN the researcher reports findings through the coordinated vulnerability channel
- THEN project maintainers treat the activity as authorized and do not initiate civil or criminal legal action

---

### Requirement: CodeQL Multi-Language Security Analysis in GitHub Actions
The repository MUST configure static application security testing (SAST) via GitHub Actions workflow `.github/workflows/codeql.yml`.
1. **Triggers**: The workflow MUST trigger on pushes to `main` and active feature branches (`codex/**`), pull requests targeting `main`, and a recurring weekly schedule on Mondays at 06:00 UTC (`cron: '0 6 * * 1'`).
2. **Multi-Language Analysis**: The workflow MUST configure a build matrix analyzing both `javascript-typescript` (covering web frontend and API services) and `python` (covering the CAD Engine agent daemon).
3. **Workflow Permissions**: The workflow MUST declare `actions: read`, `contents: read`, and `security-events: write` permissions.
4. **Security Extended Suite**: The workflow MUST invoke `github/codeql-action/init@v3` configured with `security-extended` query suites, utilize `github/codeql-action/autobuild@v3`, and submit SARIF analysis results via `github/codeql-action/analyze@v3`.

#### Scenario: Pull request static security analysis
- GIVEN a pull request targeting `main` containing TypeScript or Python code modifications
- WHEN the GitHub Actions CI pipeline triggers
- THEN the `codeql.yml` workflow runs SAST analysis across both `javascript-typescript` and `python` languages, reporting any detected security alerts directly to the pull request checks

#### Scenario: Scheduled weekly security scan
- GIVEN the scheduled cron trigger fires on Monday at 06:00 UTC
- WHEN the CodeQL workflow executes on the default `main` branch
- THEN full static analysis is executed across the entire repository and results are uploaded to GitHub Advanced Security

---

### Requirement: Dependabot Automated Dependency Maintenance
The repository MUST configure automated dependency auditing and version updating via `.github/dependabot.yml`.
1. **Ecosystem Coverage**: The configuration MUST declare separate package ecosystem updates for:
   - Root npm workspace: `package-ecosystem: "npm"`, `directory: "/"`
   - Backend API: `package-ecosystem: "npm"`, `directory: "/apps/api"`
   - Web frontend: `package-ecosystem: "npm"`, `directory: "/apps/web"`
   - Python agent: `package-ecosystem: "pip"`, `directory: "/agent"`
   - CI/CD automation: `package-ecosystem: "github-actions"`, `directory: "/"`
2. **Update Cadence & Limits**: All ecosystem entries MUST run on a weekly schedule (`schedule.interval: "weekly"`). The configuration MUST limit concurrent open pull requests (`open-pull-requests-limit: 10`) and specify standard commit prefixes (`build(deps):` or `ci(deps):`).

#### Scenario: Automated dependency update PR generation
- GIVEN an outdated or vulnerable dependency in any configured subproject directory
- WHEN Dependabot executes its weekly scheduled scan
- THEN an automated pull request with the standardized commit prefix is submitted with release notes and vulnerability details

#### Scenario: Complete ecosystem coverage verification
- GIVEN the `.github/dependabot.yml` configuration file
- WHEN inspected for project coverage
- THEN all five directories (`/`, `/apps/api`, `/apps/web`, `/agent`, and GitHub Actions `/`) are explicitly declared with valid package ecosystems

---

### Requirement: GitHub Releases Prerelease Delivery Policy
The automated release packaging workflow (`.github/workflows/release.yml`) MUST publish alpha, beta, and release candidate tagged releases as public prereleases.
1. The release creation step MUST set `prerelease: true` and MUST NOT set `draft: true` when invoking `gh release create`.
2. All release assets (including Windows `.msi` installers, standalone `.exe` binaries, macOS `.dmg` bundles, Linux `.tar.gz` archives, and `SHA256SUMS.txt` checksums) MUST be immediately downloadable via public HTTP requests upon workflow completion.
3. The release metadata MUST be immediately resolvable via the public GitHub REST API endpoint `GET /repos/{owner}/{repo}/releases` without returning 404 or requiring administrative API authentication.

#### Scenario: Tagged alpha release creation
- GIVEN a release workflow triggered by pushing tag `v0.2.0-alpha.1`
- WHEN the packaging and publishing job executes
- THEN `gh release create` creates a release marked as "Pre-release", leaves `draft: false`, and uploads all built installer and checksum assets

#### Scenario: Public resolution of prerelease artifacts
- GIVEN a completed release workflow for `v0.2.0-alpha.1`
- WHEN an unauthenticated client queries `https://api.github.com/repos/dmarmijosa/CADGPT/releases`
- THEN the release entry is present with `prerelease: true`, `draft: false`, and public download URLs for all attached installer assets
