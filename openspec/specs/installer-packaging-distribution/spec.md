## installer-packaging-distribution (NEW)

Purpose: Govern installer packaging, Windows workspace working directory declaration and persistence with `uninsneveruninstall`, automated CAD prerequisite inspection with winget remediation in Inno Setup, and CI/CD standardization on the 4 principal installers.

---

### Requirement: Inno Setup Windows Workspace Directory Declaration and Preservation
The Windows installer script (`packaging/windows.iss`) MUST declare and protect the local CAD workspace working directory:
1. **Directory Declaration in `[Dirs]`**:
   - The installer MUST declare `{localappdata}\CADGPT` and `{localappdata}\CADGPT\jobs` in the `[Dirs]` section with `Flags: uninsneveruninstall`.
   - The installer MUST guarantee that user CAD drawings, models, intermediate meshes, and execution logs stored under `{localappdata}\CADGPT\jobs` are never deleted, corrupted, or removed during application upgrades or uninstallation.
2. **Ready to Install Memo (`UpdateReadyMemo`)**:
   - The installer MUST customize `UpdateReadyMemo` in `[Code]` to present a clear separation between:
     - Application Binaries directory: `{autopf}\CAD Engine`
     - CAD Project & Workspace directory: `{localappdata}\CADGPT\jobs`
   - The memo MUST explicitly inform the user that all native CAD drawings (`.FCStd`, `.dwg`, `.blend`) and exports (`.step`, `.stl`) remain strictly local on the workstation.

#### Scenario: Inno Setup declares workspace directory with uninsneveruninstall
- GIVEN the Inno Setup configuration file `packaging/windows.iss`
- WHEN the `[Dirs]` section is inspected
- THEN `{localappdata}\CADGPT` and `{localappdata}\CADGPT\jobs` are declared with flag `uninsneveruninstall`

#### Scenario: Ready to Install memo displays local workspace directory
- GIVEN a user running `CADEngine-Setup-windows-x64.exe` reaching the "Ready to Install" wizard page
- WHEN the summary memo is displayed
- THEN it lists both the program files installation folder and the `{localappdata}\CADGPT\jobs` workspace folder, indicating drawings remain strictly local

#### Scenario: Uninstallation retains user drawings and job directories
- GIVEN a workstation with CAD Engine installed and existing user models in `%LOCALAPPDATA%\CADGPT\jobs\`
- WHEN the user uninstalls CAD Engine via Windows Settings
- THEN the application binaries in `%ProgramFiles%\CAD Engine` are cleanly removed, but `%LOCALAPPDATA%\CADGPT\jobs\` and all contained user drawings remain completely intact

---

### Requirement: Inno Setup FreeCAD Prerequisite Inspection and Automated Winget Remediation
The Windows installer MUST verify the presence of a supported parametric CAD kernel (FreeCAD or AutoCAD) before concluding setup:
1. **Automated Prerequisite Detection in `[Code]`**:
   - The installer MUST check for AutoCAD via registry keys `SOFTWARE\Autodesk\AutoCAD` and `SOFTWARE\WOW6432Node\Autodesk\AutoCAD` under `HKEY_LOCAL_MACHINE`.
   - The installer MUST check for FreeCAD via registry keys under `HKEY_LOCAL_MACHINE` and `HKEY_CURRENT_USER`, and probe standard filesystem paths (`{commonpf}\FreeCAD*` and `{localappdata}\Programs\FreeCAD*`).
2. **Interactive Remediation Prompt (`CurStepChanged(ssPostInstall)`)**:
   - If neither FreeCAD nor AutoCAD is detected on the workstation:
     - The installer MUST present a modal confirmation message box explaining that CAD Engine requires FreeCAD or AutoCAD to execute 3D modeling operations.
     - If the user selects "Yes", the installer MUST launch Windows Package Manager (`winget.exe install FreeCAD.FreeCAD --accept-package-agreements --accept-source-agreements`) synchronously to provision FreeCAD automatically.
     - If the user selects "No", the installer MUST launch the default web browser to the official FreeCAD download page (`https://www.freecad.org/downloads.php`).

#### Scenario: Host with existing CAD passes setup without prerequisite prompts
- GIVEN a Windows workstation with FreeCAD or AutoCAD already installed
- WHEN `CADEngine-Setup-windows-x64.exe` reaches post-installation
- THEN setup completes without displaying missing prerequisite dialogs or launching winget

#### Scenario: Missing CAD triggers winget installation prompt upon setup completion
- GIVEN a clean Windows machine with neither FreeCAD nor AutoCAD installed
- WHEN `CADEngine-Setup-windows-x64.exe` finishes copying files
- THEN setup displays a prompt offering automated FreeCAD installation via winget, and executing confirmation launches `winget.exe install FreeCAD.FreeCAD`

#### Scenario: User declining winget is redirected to official FreeCAD download portal
- GIVEN the prerequisite confirmation dialog is displayed
- WHEN the user clicks "No"
- THEN setup opens `https://www.freecad.org/downloads.php` in the user's default browser and completes installation

---

### Requirement: Principal Installers Packaging Pipeline Standardization
The automated release packaging workflow (`.github/workflows/release.yml`) and local build runner (`packaging/build.py`) MUST restrict publication strictly to the 4 principal installers:
1. **Principal Package Set**:
   The release pipeline MUST build, verify, and publish exactly four principal packages:
   - Windows x64: `CADEngine-Setup-windows-x64.exe` (Inno Setup)
   - macOS Apple Silicon: `CADEngine-macos-arm64.dmg` (UDZO disk image)
   - macOS Intel: `CADEngine-macos-x64.dmg` (UDZO disk image)
   - Linux x64: `cadengine-linux-x64.tar.gz` (POSIX tar.gz archive)
   - Manifest: `SHA256SUMS.txt`
2. **Omission of Non-Principal Formats**:
   - Experimental WiX v4 MSI installer generation MUST be omitted from the principal release matrix, removing external .NET toolchain dependencies from the Windows CI runner.
   - Legacy redundant archives (`CADGPT-*`) MUST NOT be generated or uploaded.

#### Scenario: Release workflow builds exactly 4 principal installers
- GIVEN a release build triggered on GitHub Actions
- WHEN the packaging and publishing matrix completes
- THEN the release contains exactly 1 Windows EXE installer, 2 macOS DMGs (arm64, x64), 1 Linux tar.gz archive, and `SHA256SUMS.txt`

#### Scenario: SHA256SUMS manifest verifies all 4 principal installer packages
- GIVEN the published release assets
- WHEN `sha256sum -c SHA256SUMS.txt` is run
- THEN all four principal packages match their respective cryptographic digests without error
