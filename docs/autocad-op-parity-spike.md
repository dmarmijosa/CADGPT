# AutoCAD Core Console Op Parity Spike (Spike A, slice P2.0)

**Date:** 2026-09-15
**Host:** Windows 11 (build 26200), AutoCAD 2026 full (registry `R25.1 ACAD-9101`,
ProductName "AutoCAD 2026 - Español"), `accoreconsole.exe` at
`C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe`.
**Method:** `accoreconsole.exe /i <blank.dwg> /s <run.scr>`, `FILEDIA 0`,
English commands forced with a leading `_` and global dot notation (e.g. `_.SUBTRACT`),
CRLF scripts, stdout decoded UTF-16LE. Tested headlessly over SSH.

## Results Summary

| Op Family | Candidate Command Sequence | Status | Empirical Outcome |
|---|---|---|---|
| **Boolean operations** (`boolean_cut`, `boolean_union`, `boolean_intersect`) | `_.SUBTRACT`, `_.UNION`, `_.INTERSECT` targeting entity handles via `(handent <hex>)` | **PROVEN** | **Works cleanly.** Verified analytically with `MASSPROP`: subtracting a 20x20x20 box (overlap 2000) from another (8000) gave exactly 6000.0000 volume. Union of the two gave exactly 14000.0000 volume. Intersection gave exactly 2000.0000 volume. |
| **Transforms** (`translate`, `scale`, `rotate`) | `_.MOVE`, `_.SCALE`, `_.ROTATE3D` targeting entity handles via `(handent <hex>)` | **PROVEN** | **Works cleanly.** Verified with `MASSPROP`: Box 20x20x20 translated by (10, 20, 30), scaled by 2.0 (volume 8000 -> 64000), rotated 90 deg around X axis at (10, 20, 30). Bounding box matched analytical values: X: 10–50, Y: -20–20, Z: 30–70. Volume 64000.0000. |
| **Scene Read** (`read_scene`) | Object enumeration via pure AutoLISP: `(ssget "_X" '((0 . "3DSOLID")))` + `(cdr (assoc 5 ...))` | **PROVEN** | **Works cleanly.** Pure AutoLISP without vlax/ActiveX enumerates all 3DSOLID entities, extracts hex handles and entity types, and writes valid JSON to disk. Output verified: `[{"id": "2DF", "type": "3DSOLID"}, {"id": "2DB", "type": "3DSOLID"}]`. |
| **Export** (`export`) | `_STLOUT`, `_DXFOUT`, `_ACISOUT` | **PROVEN for STL, DXF, SAT; REFUTED for STEP/IGES via `_EXPORT`** | `_STLOUT` produces binary STL (slice 14.0). `_DXFOUT <path> 16` produced a 139.5 kB valid DXF. `_ACISOUT _ALL "" <path>` produced a 5.1 kB valid ACIS SAT solid model. `_-EXPORT`/`3DPRINT` for STEP/IGES hang headless waiting for UI dialogs. |

## Detailed Sequence Findings

### 1. Booleans
- **Subtract / Cut:**
  ```lisp
  (command "_.SUBTRACT" (handent base_h) "" (handent tool_h) "")
  ```
  AutoCAD prompts for solids to subtract from, accepts `(handent base_h)`, receives `""` to terminate selection 1, then prompts for solids to subtract, accepts `(handent tool_h)`, and receives `""` to finish.
- **Union:**
  ```lisp
  (command "_.UNION" (handent h1) (handent h2) "")
  ```
  Accepts arbitrary entity handles followed by `""`.
- **Intersect:**
  ```lisp
  (command "_.INTERSECT" (handent h1) (handent h2) "")
  ```
  Accepts entity handles followed by `""`.

### 2. Transforms
- **Translate (`_MOVE`):**
  ```lisp
  (command "_.MOVE" (handent h) "" "0,0,0" (cadgpt-pt dx dy dz))
  ```
- **Scale (`_SCALE`):**
  ```lisp
  (command "_.SCALE" (handent h) "" (cadgpt-pt cx cy cz) (rtos factor 2 8))
  ```
- **Rotate (`_ROTATE3D`):**
  ```lisp
  (command "_.ROTATE3D" (handent h) "" (strcat "_" axis) (cadgpt-pt cx cy cz) (rtos deg 2 8))
  ```
  Note: `_ROTATE3D` is required instead of 2D `_ROTATE` for 3D solid operations across X, Y, and Z axes.

### 3. Scene Read
- Pure AutoLISP `(ssget "_X" '((0 . "3DSOLID")))` iterates all solids without ActiveX (`vlax-*`).
- File I/O via `(open ... "w")`, `(write-line ...)`, and `(close ...)` functions properly in Core Console.

### 4. Export
- **STL**: `_STLOUT _ALL "" _Y <path>` (proven in slice 14.0).
- **DXF**: `_DXFOUT <path> 16` (proven, standard 16-decimal ASCII DXF).
- **SAT (ACIS)**: `_ACISOUT _ALL "" <path>` (proven, ACIS solid interchange).
- **STEP/IGES**: Refuted headless; `AUTOCAD_OPS` must restrict export formats to `stl`, `dxf`, `sat`.

## Conclusion for P2 Implementation

Per design D8 and tasks P2.0.3:
1. **P2.1 (Booleans)**: **APPROVED TO IMPLEMENT** (`boolean_cut`, `boolean_union`, `boolean_intersect`).
2. **P2.2 (Transforms)**: **APPROVED TO IMPLEMENT** (`translate`, `rotate`, `scale` via `_ROTATE3D`).
3. **P2.3 (Scene Read & Export)**: **APPROVED TO IMPLEMENT** for AutoLISP object enumeration (`read_scene`) and exports restricted to `stl`, `dxf`, and `sat` formats.
