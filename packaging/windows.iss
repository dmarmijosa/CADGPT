[Setup]
AppId=CADEngine
AppName=CAD Engine
AppVersion=0.1.0
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
