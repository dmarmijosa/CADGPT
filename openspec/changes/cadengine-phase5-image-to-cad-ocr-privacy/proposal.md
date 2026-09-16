# Proposal: CAD Engine Phase 5 — Image-to-CAD, OCR & Privacy

## Intent
Deliver Image-to-CAD vectorization with metric scaling, 3D typography (`create_text_3d`), GDPR consent bottom sheets, and cascading account deletion.

## Scope

### In Scope
- **Image-to-CAD & OCR**: OpenCV contour tracing (`findContours`, Douglas-Peucker), metric scaling, and nested cutouts in `extrude_polygon`.
- **3D Typography**: `create_text_3d` via `Draft.make_shapestring` with bundled `Inter-Bold.ttf`, OS fallbacks, and `flat`/`emboss`/`engrave` modes.
- **MCP Tools**: `analyze_image_to_cad` and `create_text_3d` schemas in `tools.ts`, allowlists, and handlers.
- **Registration Consent**: Glassmorphic bottom sheet on Keycloak `register.ftl` (`stitch.css`) and Angular check for Google SSO.
- **Account Deletion Cascade**: `DELETE /api/account` keyed to JWT `sub`, SQLite purge, disk mesh unlinking, Keycloak Admin deletion, and Angular confirmation requiring `"ELIMINAR"`.

### Out of Scope
- Direct B-Rep NURBS reconstruction from raster.
- OCR execution within headless `FreeCADCmd`.
- Cloud vision API dependencies.

## Capabilities

### New Capabilities
- `image-to-cad-pipeline`: Traces metric contours and nested cutouts from raster images.
- `typography-3d`: Generates 3D text solids with font fallback and booleans.
- `consent-governance`: Enforces data treatment consent across Keycloak and Angular.
- `user-account-lifecycle`: Purges user data across SQLite, disk, and Keycloak.

### Modified Capabilities
- `openspec/specs/freecad-execution`: Adds `create_text_3d` and inner cutouts to `extrude_polygon`.
- `openspec/specs/mcp-cad-operations`: Adds Zod schemas and validation for new ops.
- `openspec/specs/cad-discovery`: Exposes `create_text_3d` in operation matrix.
- `openspec/specs/social-authentication`: Adds first-login consent check for Google SSO.

## Affected Areas

| Area | Changes |
|---|---|
| `agent/` | `cadgpt_agent/vision.py`, font bundling, `freecad_worker.py` text & cutouts |
| `apps/api/` | `DELETE /api/account`, `KeycloakAdminService`, store cascade, `tools.ts` |
| `apps/web/` | Consent bottom sheet, account deletion dialog |
| `deploy/` | Keycloak `register.ftl`, `stitch.css`, realm config |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Missing worker fonts | Bundle `Inter-Bold.ttf`; add OS font fallbacks |
| High vertex count freezes CAD | Douglas-Peucker approximation with adaptive tolerance |
| Partial deletion leaves orphans | Disk unlinking before SQLite commit; fail-fast Keycloak call |

## Rollback Plan
- **CAD Tools**: Revert allowlist and `tools.ts`; worker ignores new ops.
- **Consent**: Remove `register.ftl`; disable client consent check.
- **Account Deletion**: Disable `DELETE /api/account`; retain manual cleanup.

## Success Criteria
- [ ] OpenCV pipeline vectorizes images into metric contours with inner cutouts.
- [ ] `create_text_3d` produces valid 3D text in `flat`, `emboss`, and `engrave` modes.
- [ ] `analyze_image_to_cad` and `create_text_3d` pass MCP validation.
- [ ] Keycloak and Google SSO first-login display consent bottom sheets.
- [ ] `DELETE /api/account` purges SQLite records, disk meshes, and Keycloak identity.
- [ ] Destructive UI requires typing `"ELIMINAR"` and logs out.
- [ ] All test suites (`npm test`, Python unit tests) pass.
