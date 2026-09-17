[Setup]
AppId=CADEngine
AppName=CAD Engine
AppVersion=0.2.0-alpha.1
DefaultDirName={autopf}\CAD Engine
DefaultGroupName=CAD Engine
PrivilegesRequired=admin
ChangesEnvironment=yes
OutputDir=..\dist
OutputBaseFilename=CADEngine-Setup-windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\cadengine.exe

[Files]
Source: "..\dist\cadengine\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CAD Engine"; Filename: "{app}\cadengine.exe"
Name: "{autodesktop}\CAD Engine"; Filename: "{app}\cadengine.exe"

[Dirs]
; User CAD workspace directories — preserved across uninstalls
Name: "{localappdata}\CADGPT"; Flags: uninsneveruninstall
Name: "{localappdata}\CADGPT\jobs"; Flags: uninsneveruninstall

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; \
    Check: NeedsAddPath(ExpandConstant('{app}'))

[Run]
Filename: "schtasks.exe"; Parameters: "/Create /TN ""CADEngineAgent"" /TR ""\""{app}\cadengine.exe\"""" /SC ONLOGON /RL LIMITED /F"; Flags: runhidden
Filename: "{app}\cadengine.exe"; Description: "Launch CAD Engine Agent"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""CADEngineAgent"" /F"; Flags: runhidden

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  { Look for the path with leading and trailing semicolons }
  Result := Pos(';' + UpperCase(Param) + ';', ';' + UpperCase(OrigPath) + ';') = 0;
end;

function IsFreeCADInstalled: Boolean;
var
  Dummy: string;
begin
  Result := False;
  { Check registry for FreeCAD installer entry }
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\FreeCAD',
    'InstallLocation', Dummy) then
  begin
    Result := True;
    exit;
  end;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\FreeCAD',
    'InstallLocation', Dummy) then
  begin
    Result := True;
    exit;
  end;
  { Check common filesystem paths }
  if DirExists(ExpandConstant('{autopf}\FreeCAD')) or
     DirExists(ExpandConstant('{autopf}\FreeCAD 1.0')) or
     DirExists(ExpandConstant('{autopf}\FreeCAD 1.1')) then
  begin
    Result := True;
  end;
end;

function IsAutoCADInstalled: Boolean;
var
  Dummy: string;
begin
  Result := False;
  { Check registry for AutoCAD entries }
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\Autodesk\AutoCAD', 'CurVer', Dummy) then
  begin
    Result := True;
    exit;
  end;
  { Check common AutoCAD install paths }
  if DirExists(ExpandConstant('{autopf}\Autodesk\AutoCAD')) or
     DirExists(ExpandConstant('{autopf}\Autodesk\AutoCAD 2026')) or
     DirExists(ExpandConstant('{autopf}\Autodesk\AutoCAD 2025')) then
  begin
    Result := True;
  end;
end;

function IsBlenderInstalled: Boolean;
var
  Dummy: string;
begin
  Result := False;
  { Check registry for Blender installer entry }
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Blender',
    'InstallLocation', Dummy) then
  begin
    Result := True;
    exit;
  end;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Blender',
    'InstallLocation', Dummy) then
  begin
    Result := True;
    exit;
  end;
  { Check common Blender install paths }
  if DirExists(ExpandConstant('{autopf}\Blender Foundation\Blender 4.2')) or
     DirExists(ExpandConstant('{autopf}\Blender Foundation\Blender 4.1')) or
     DirExists(ExpandConstant('{autopf}\Blender Foundation\Blender 4.0')) or
     DirExists(ExpandConstant('{autopf}\Blender Foundation\Blender 3.6')) or
     DirExists(ExpandConstant('{autopf}\Blender Foundation')) then
  begin
    Result := True;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: string): string;
begin
  Result :=
    'Application Directory:' + NewLine +
    Space + ExpandConstant('{autopf}\CAD Engine') + NewLine + NewLine +
    'Local Workspace Directory (preserved on uninstall):' + NewLine +
    Space + ExpandConstant('{localappdata}\CADGPT\jobs') + NewLine +
    Space + 'All native drawings (.FCStd, .dwg, .blend) remain strictly local.' + NewLine + NewLine;

  if MemoDirInfo <> '' then
    Result := Result + MemoDirInfo + NewLine + NewLine;
  if MemoGroupInfo <> '' then
    Result := Result + MemoGroupInfo + NewLine + NewLine;
  if MemoTasksInfo <> '' then
    Result := Result + MemoTasksInfo + NewLine + NewLine;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    if (not IsFreeCADInstalled) and (not IsAutoCADInstalled) then
    begin
      if MsgBox(
        'No supported CAD kernel (FreeCAD or AutoCAD) was detected.' + #13#10 + #13#10 +
        'CAD Engine requires at least one parametric CAD application.' + #13#10 +
        'Would you like to install FreeCAD automatically via winget?',
        mbConfirmation, MB_YESNO) = IDYES then
      begin
        Exec('winget.exe', 'install FreeCAD.FreeCAD --accept-package-agreements --accept-source-agreements',
          '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      end else
      begin
        { Open the FreeCAD download page in the default browser }
        ShellExec('open', 'https://www.freecad.org/downloads.php', '', '', SW_SHOW, ewNoWait, ResultCode);
      end;
    end;

    if not IsBlenderInstalled then
    begin
      if MsgBox(
        'Blender was not detected.' + #13#10 + #13#10 +
        'CAD Engine supports Blender for 3D mesh modeling, rendering, and asset generation.' + #13#10 +
        'Would you like to install Blender automatically via winget?',
        mbConfirmation, MB_YESNO) = IDYES then
      begin
        Exec('winget.exe', 'install BlenderFoundation.Blender --accept-package-agreements --accept-source-agreements',
          '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      end else
      begin
        { Open the Blender download page in the default browser }
        ShellExec('open', 'https://www.blender.org/download/', '', '', SW_SHOW, ewNoWait, ResultCode);
      end;
    end;
  end;
end;
