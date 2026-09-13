[Setup]
AppId=CADGPT-Bridge
AppName=CADGPT Bridge
AppVersion=0.1.0
DefaultDirName={localappdata}\Programs\CADGPT
DefaultGroupName=CADGPT
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
Name: "{group}\CADGPT"; Filename: "{app}\CADGPT.exe"
Name: "{autodesktop}\CADGPT"; Filename: "{app}\CADGPT.exe"
[Run]
Filename: "{app}\CADGPT.exe"; Description: "Connect this computer to CADGPT"; Flags: nowait postinstall skipifsilent
