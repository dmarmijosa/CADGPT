schema: gentle-ai.sdd-research/v1 · revision: 1 · request_id: rsr-cadgpt-p2-20260913-01 · outcome: done (with explicit gaps) · admission: documentation=granted (WebFetch/WebSearch), open-web=granted; no denial.

## Sources
S1 documentation — Autodesk help 2025 "What's New or Changed with AutoLISP" https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-AutoLISP/files/GUID-037BF4D4-755E-4A5C-8136-80E85CCEDF3E.htm (2026-09-13): AutoCAD LT 2024 introduced AutoLISP; entmake/entmod limited to LT objects; vlax-* unavailable; PROGRAM sysvar returns acadlt.
S2 open-web — CAD Forum "Running AutoCAD without the graphics window" https://www.cadforum.cz/en/running-autocad-without-the-graphics-window-tip8552: AcCoreConsole.exe [/i dwg] /s script [/product] [/l] [/isolate] [/readonly] [/p profile] [/loadmodule]; applies AutoCAD 2013–2024 and ACLT.
S3 open-web — CAD Forum STLOUT https://www.cadforum.cz/en/command.asp?cmd=STLOUT: "not in Core" (excluded from Core Console) and "not available in AutoCAD LT".
S4 open-web — fdestech AcCoreConsole guide https://fdestech.com/resources/accoreconsole-guide-headless-cad-automation/: no COM/VLA, core AutoLISP only, no dialogs, no interactive input; .lsp loadable.
S5 documentation — FreeCAD wiki GlTF.md https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/GlTF.md: export since 0.19.23074 via Std Export; not stated headless-safe.
S6 open-web — FreeCAD issue #8610 https://github.com/FreeCAD/FreeCAD/issues/8610: glTF exporter only in FreeCADGui/ImportGui, impossible headless; companion #20621: glTF export broken in 1.1.0dev.
S7 documentation — FreeCAD wiki Mesh_MeshFromShape https://wiki.freecad.org/index.php?title=Mesh_MeshFromShape: MeshPart.meshFromShape(Shape, LinearDeflection, AngularDeflection, Relative) + mesh.write(path) headless.
S8 documentation — three.js docs GLTFLoader/STLLoader + npm registry: addons at three/addons/loaders/*.js; latest three 0.186.0.
S9 empirical (orchestrator, 2026-09-13) — remote FreeCAD 1.1.3 Rev 20260725 (Conda cad-engine, Ubuntu), `QT_QPA_PLATFORM=offscreen freecadcmd spike.py`: Import.export([...], .glb) → 252-byte file (no geometry); FreeCADGui.setupWithoutGUI()+ImportGui.export → 252 bytes (no geometry); MeshPart.meshFromShape(LinearDeflection=0.1, AngularDeflection=0.26).write(.stl) → 10684 bytes, 212 facets; Part::Cut boolean, saveAs, closeDocument, openDocument, doc.Objects listing, mutate Box shape, recompute, save → all OK (volume 8869.0 → 11369.0).

## Validated claims
A1 [S2] Core Console syntax; /s mandatory. A2 [S1] AutoLISP in LT only from 2024. A3 [S4] Core Console AutoLISP: no COM/dialogs; (load) supported. A4 [S3] STLOUT excluded from Core Console and LT. A5 unverified (WebSearch only): registry detection HKLM\SOFTWARE\Autodesk\AutoCAD\Rxx.x\ACAD-xxxx AcadLocation/ProductID. A6 unresolved: no Core-Console-specific EULA text found.
B1 [S5,S6,S9] Headless glTF/GLB export NOT viable in FreeCAD 1.x (empty output). B2 [S7,S9] MeshPart STL export headless works. B3 [S9] Open/read/modify/save .FCStd headless works. B4 [S6] offscreen does not restore view providers for glTF.
C1 [S8] GLTFLoader/STLLoader under three/addons/loaders; C2 [S8] three 0.186.0; C3 unverified: Angular 22 zoneless/SSR + three.js statement.

## Contradictions / gaps
- Premise "Import.export GLB headless" falsified (S6 + S9).
- Gap: EXPORT/3DPRINT STL headless in Core Console unresolved — needs Windows+AutoCAD spike.
- Gap: Autodesk EULA on unattended Core Console automation.
- Gap: registry-based AutoCAD detection page not fetch-verified.
- Gap: Angular 22 zoneless/SSR + three.js.

## Implications for design (non-authoritative)
- FreeCAD mesh preview format = STL via MeshPart (binary STL); optional server- or browser-side STL→GLB conversion if needed.
- AutoCAD headless mesh export is unproven; gate AutoCAD execution behind a spike (EXPORT/3DPRINT) or treat as phase-3 / detection-only + DWG/DXF artifact without preview.
- LT: AutoLISP only ≥2024; Core Console excludes STLOUT regardless.
- three.js: import from three/addons/loaders/*; add SSR/zoneless guards.
- Keep FreeCAD worker as a per-operation script set; reopen-modify-save pattern proven.
