[Setup]
AppId=CADGPT-Bridge
AppName=CAD Agent Designer Bridge
AppVersion=0.1.0
DefaultDirName={localappdata}\Programs\CAD Agent Designer
DefaultGroupName=CAD Agent Designer
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=CADGPT-Setup-windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\CADGPT.exe
[Files]
Source: "..\dist\CADGPT\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\CAD Agent Designer"; Filename: "{app}\CADGPT.exe"
Name: "{autodesktop}\CAD Agent Designer"; Filename: "{app}\CADGPT.exe"
[Run]
Filename: "{app}\CADGPT.exe"; Description: "Connect this computer to CAD Agent Designer"; Flags: nowait postinstall skipifsilent
