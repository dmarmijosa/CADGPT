# Security status: experimental alpha

Do not use this alpha for safety-critical drawings, untrusted shared computers or unattended production CAD work. Native installer signing, notarization and a security audit remain outstanding.

Only a fixed FreeCAD box operation is implemented. There is no arbitrary code tool. Device possession is proven by a scoped credential, not an IP address or machine name; this does not prove physical ownership. Pairing consent belongs to the authenticated account.

A compromised OS account, CAD installation, identity provider or backend is outside the agent's isolation boundary. The FreeCAD process is not an OS sandbox. Do not point manual discovery to executables you do not trust.

Use a trusted HTTPS backend. Do not share access/device tokens or put them in issues. Revoke a compromised device through the dashboard; stop its local process separately if immediate execution termination is necessary. Back up drawings before testing.

Public abuse reporting and private vulnerability reporting channels have not yet been configured. Do not post secrets or working exploit credentials in public GitHub issues.
