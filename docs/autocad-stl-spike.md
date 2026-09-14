# AutoCAD headless STL export spike (slice 14.0)

**Date:** 2026-09-14
**Host:** Windows 11 (build 26200), AutoCAD 2026 full (registry `R25.1 ACAD-9101`,
ProductName "AutoCAD 2026 - Español"), `accoreconsole.exe` at
`C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe`.
**Method:** `accoreconsole.exe /i <acadiso.dwt> /s <script.scr>`, `FILEDIA 0`,
English commands forced with a leading `_`, CRLF scripts, stdout decoded UTF-16LE.

## Result: PASS — via `STLOUT`, not `EXPORT`

| Mechanism | Outcome |
|---|---|
| `_STLOUT` + `_ALL` + `_Y` + `<path>` | **Works.** Produced a valid binary STL: 684 bytes for a box = `84 + 50 * 12 facets`; a live AutoLISP-built box/cylinder/sphere/cone all exported cleanly and `MASSPROP` volumes matched analytically. |
| `_-EXPORT` `_STL` … | **Fails headless.** Hangs past 120 s on an interactive prompt/dialog that `FILEDIA 0` does not suppress; no STL produced. |

## Correction to research finding A4

Research A4 (documentation-based, CAD Forum) stated `STLOUT` is excluded from
AutoCAD Core Console. That is **false for AutoCAD 2026**: `STLOUT` is available
and is the only mechanism that exports STL non-interactively from
`accoreconsole.exe`. `EXPORT`/`3DPRINT` are the ones that cannot run headless
here. Slice 14 therefore uses `STLOUT`; the earlier "STLOUT MUST NOT be used"
task constraint is superseded by this empirical result.
