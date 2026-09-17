# Security Policy: CAD Engine

## Security Status: Experimental Alpha

Do not use this alpha for safety-critical drawings, untrusted shared computers or unattended production CAD work. Native installer signing, notarization and a security audit remain outstanding.

A fixed set of allowlisted FreeCAD primitive operations is implemented, plus an opt-in AutoCAD adapter behind `--enable-autocad`. There is no arbitrary code tool: the AutoCAD adapter loads only its own bundled `.lsp` file (`agent/cadgpt_agent/autocad/cadgpt.lsp`) via a rendered `.scr` script built from validated, bounds-checked numbers — never caller-supplied AutoLISP or free text. Device possession is proven by a scoped credential, not an IP address or machine name; this does not prove physical ownership. Pairing consent belongs to the authenticated account.

A compromised OS account, CAD installation, identity provider or backend is outside the agent's isolation boundary. Neither the FreeCAD nor the AutoCAD Core Console process is an OS sandbox. Do not point manual discovery to executables you do not trust.

**AutoCAD opt-in and licensing.** `--enable-autocad` drives AutoCAD Core Console (`accoreconsole.exe`) unattended. Enabling it is an explicit choice you make on your own computer; CAD Engine does not verify, warrant, or grant any Autodesk license, and you are solely responsible for confirming your AutoCAD license terms permit this unattended, scripted use. AutoCAD LT is never eligible regardless of the flag, since it ships no Core Console and operates detection-only (`executable=false`).

The mesh preview channel (`POST /api/agent/jobs/:id/mesh`) accepts only a binary STL, bound to a `running` job the uploading device owns; it enforces a streamed 25 MiB size cap, a verified SHA-256, a structural binary-STL check, and a 500 MiB per-device quota, and never trusts a client-supplied file name. The uploaded STL is the only design data that leaves the agent's computer; native CAD files never do.

Use a trusted HTTPS backend. Do not share access/device tokens or put them in issues. Revoke a compromised device through the dashboard; stop its local process separately if immediate execution termination is necessary. Back up drawings before testing.

---

## Supported Versions

Only the current active release line receives security updates. Previous releases are End-Of-Life (EOL) and do not receive patches.

| Version | Supported | Status |
|---|---|---|
| `0.2.x` | :white_check_mark: | Supported (Active Release Branch) |
| `< 0.2.0` (including `0.1.x`) | :x: | End of Life (EOL), Unsupported |

---

## Reporting a Vulnerability

We welcome vulnerability reports from security researchers and users. Please do **NOT** report potential security vulnerabilities through public GitHub issues, discussions, or pull requests.

### Intake Channels
1. **Primary Intake (Preferred)**: Submit a confidential report via [GitHub Private Vulnerability Reporting](https://github.com/dmarmijosa/CADGPT/security/advisories/new).
2. **Secondary Intake**: Email our security team at [security@cadengine.dev](mailto:security@cadengine.dev) with full reproduction steps, affected components, and proof of concept.

When reporting, please include:
- Affected component(s), commit hash, or release version.
- Detailed step-by-step reproduction instructions or proof of concept.
- Assessment of impact (e.g. unauthorized execution, privilege escalation, credential disclosure).
- Any potential remediations or patches you have developed.

---

## Response & Remediation SLAs

The maintainers commit to the following coordinated vulnerability response timelines:

| Stage | Target SLA | Details |
|---|---|---|
| **Initial Acknowledgment** | **48 hours** | Maintainers confirm receipt of the report. |
| **Triage & Validation** | **5 business days** | Reproduce issue, assess severity (CVSS), and verify scope. |
| **Critical / High Fix** | **14 calendar days** | Confirmed Critical or High severity (CVSS ≥ 7.0) patched and released. |
| **Medium / Low Fix** | **30 calendar days** | Confirmed Medium or Low severity (CVSS < 7.0) patched and released. |
| **Public Disclosure Embargo** | **90 calendar days** | Coordinated embargo prior to public release or advisory publication. |

Early disclosure prior to 90 days may occur only with the mutual agreement of the reporter and maintainers after a fix is published.

---

## Safe Harbor

We consider good-faith security research into CAD Engine and its related components to be authorized activity. If you conduct vulnerability research in adherence to this policy:

- **No Legal Action**: Project maintainers will not initiate or support civil legal action or criminal complaints against you for accidental or good-faith violations.
- **Statutory Authorization**: We consider your research activities to be authorized under the Computer Fraud and Abuse Act (CFAA), the Digital Millennium Copyright Act (DMCA) anti-circumvention provisions (17 U.S.C. § 1201), and equivalent international cybersecurity statutes.
- **Third-Party Inquiries**: If legal action is initiated by a third party against you for research conducted in accordance with this policy, we will take affirmative steps to state that your actions were conducted in authorization and compliance with our coordinated disclosure framework.

### Research Guidelines:
- Do not exploit vulnerabilities beyond the minimum necessary to demonstrate impact.
- Do not access, modify, or destroy user data or shared production environments.
- Do not execute denial of service (DoS) attacks or degrade backend availability.
- Give maintainers reasonable time to remediate before disclosing details publicly.
