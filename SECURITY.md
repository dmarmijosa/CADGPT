# Security status: experimental alpha

Do not use this alpha for safety-critical drawings, untrusted shared computers or unattended production CAD work. Native installer signing, notarization and a security audit remain outstanding.

A fixed set of allowlisted FreeCAD primitive operations is implemented, plus an opt-in AutoCAD adapter behind `--enable-autocad`. There is no arbitrary code tool: the AutoCAD adapter loads only its own bundled `.lsp` file (`agent/cadgpt_agent/autocad/cadgpt.lsp`) via a rendered `.scr` script built from validated, bounds-checked numbers — never caller-supplied AutoLISP or free text. Device possession is proven by a scoped credential, not an IP address or machine name; this does not prove physical ownership. Pairing consent belongs to the authenticated account.

A compromised OS account, CAD installation, identity provider or backend is outside the agent's isolation boundary. Neither the FreeCAD nor the AutoCAD Core Console process is an OS sandbox. Do not point manual discovery to executables you do not trust.

**AutoCAD opt-in and licensing.** `--enable-autocad` drives AutoCAD Core Console (`accoreconsole.exe`) unattended. Enabling it is an explicit choice you make on your own computer; CADGPT does not verify, warrant, or grant any Autodesk license, and you are solely responsible for confirming your AutoCAD license terms permit this unattended, scripted use. AutoCAD LT is never eligible regardless of the flag, since it ships no Core Console.

Use a trusted HTTPS backend. Do not share access/device tokens or put them in issues. Revoke a compromised device through the dashboard; stop its local process separately if immediate execution termination is necessary. Back up drawings before testing.

Public abuse reporting and private vulnerability reporting channels have not yet been configured. Do not post secrets or working exploit credentials in public GitHub issues.
