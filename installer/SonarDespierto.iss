; Instalador de Soñar Despierto para Windows (Fase 8, ADR-0015) — Inno Setup 6.
; No lo compiles a mano: usa  npm run instalador  (genera el paquete portátil, lo prueba y llama a ISCC).
;
; - Se instala por usuario, SIN permisos de administrador, en %LOCALAPPDATA%\Programs\SonarDespierto.
; - Los DATOS no van aquí: viven en %LOCALAPPDATA%\SonarDespierto (base, fotos, respaldos, config.env)
;   y NO se borran al desinstalar ni al actualizar.
; - Trae su propio node.exe: la PC de la oficina no necesita Node.js.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\SonarDespierto"
#endif
#define AppName "Soñar Despierto"

[Setup]
AppId={{8C1F3E52-6B7A-4C1D-9A55-5D0E2B7C9F31}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Soñar Despierto Veracruz
AppComments=Sistema de Gestión de Soñar Despierto Veracruz
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\SonarDespierto
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\instalador
OutputBaseFilename=SonarDespierto-Instalador-{#AppVersion}
SetupIconFile=..\public\img\favicon.ico
UninstallDisplayIcon={app}\public\img\favicon.ico
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Si el sistema está abierto al actualizar, el instalador pide cerrarlo (node.exe de esta carpeta)
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.WelcomeLabel2=Se instalará [name/ver] en esta computadora.%n%nNo hace falta instalar nada más: el programa trae todo lo necesario. Los datos se guardan en la carpeta de datos del usuario y se conservan al actualizar o desinstalar.

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"
Name: "demoicon"; Description: "Crear también el acceso a la versión de demostración (datos ficticios, para practicar)"; GroupDescription: "Accesos directos:"; Flags: unchecked

[InstallDelete]
; Al actualizar, quita los archivos del programa anterior (nunca los datos, que están en otra carpeta)
Type: filesandordirs; Name: "{app}\lib"
Type: filesandordirs; Name: "{app}\routes"
Type: filesandordirs; Name: "{app}\services"
Type: filesandordirs; Name: "{app}\public"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\node_modules"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{localappdata}\SonarDespierto"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\SonarDespierto.bat"; WorkingDir: "{app}"; IconFilename: "{app}\public\img\favicon.ico"; Comment: "Abrir el Sistema de Gestión"
Name: "{group}\Respaldar ahora"; Filename: "{app}\Respaldar.bat"; WorkingDir: "{app}"; IconFilename: "{app}\public\img\favicon.ico"; Comment: "Guardar un respaldo de la base de datos y las fotos"
Name: "{group}\Carpeta de datos y respaldos"; Filename: "{localappdata}\SonarDespierto"; Comment: "Base de datos, respaldos y configuración"
Name: "{group}\Manual de usuario"; Filename: "{app}\public\manual.html"; Comment: "Manual de usuario y guía de modo LAN"
Name: "{group}\Configuración (config.env)"; Filename: "{sys}\notepad.exe"; Parameters: """{localappdata}\SonarDespierto\config.env"""; Comment: "Puerto, modo LAN y respaldos"
Name: "{group}\{#AppName} (demostración)"; Filename: "{app}\SonarDespierto.bat"; Parameters: "--demo"; WorkingDir: "{app}"; IconFilename: "{app}\public\img\favicon.ico"; Tasks: demoicon
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\SonarDespierto.bat"; WorkingDir: "{app}"; IconFilename: "{app}\public\img\favicon.ico"; Tasks: desktopicon
Name: "{userdesktop}\{#AppName} (demostración)"; Filename: "{app}\SonarDespierto.bat"; Parameters: "--demo"; WorkingDir: "{app}"; IconFilename: "{app}\public\img\favicon.ico"; Tasks: desktopicon and demoicon

[Run]
Filename: "{app}\SonarDespierto.bat"; WorkingDir: "{app}"; Description: "Abrir {#AppName} ahora"; Flags: postinstall nowait skipifsilent shellexec

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('Se quitó el programa. Los datos (base de datos, fotos y respaldos) se conservaron en:' + #13#10 +
      ExpandConstant('{localappdata}\SonarDespierto') + #13#10#13#10 +
      'Si ya no los necesitas, guarda antes una copia de la carpeta backups y después bórrala a mano.',
      mbInformation, MB_OK);
end;
