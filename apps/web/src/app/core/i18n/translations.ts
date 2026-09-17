export type SupportedLanguage = 'en' | 'es';

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    // Navigation and Shell
    'nav.skip_to_content': 'Skip to content',
    'nav.devices': 'Devices',
    'nav.designs': 'Designs',
    'nav.jobs': 'Jobs',
    'nav.connect': 'Connect',
    'nav.api_keys': 'API keys',
    'nav.about': 'About',
    'nav.sign_in': 'Sign in',
    'nav.sign_out': 'Sign out',
    'nav.daemon_online': 'Daemon Online',
    'nav.version_tag': 'v0.2.0-alpha.1',

    // Footer
    'footer.brand': 'CAD Agent Designer',
    'footer.status': '— experimental alpha',
    'footer.tagline': 'FreeCAD execution, AutoCAD Core Console parity, and remote MCP.',
    'footer.author_lead': 'Designed & Developed by',
    'footer.author_name': 'Danny Armijos',
    'footer.author_linkedin_aria': "Danny Armijos's LinkedIn Profile",
    'footer.author_website_aria': "Danny Armijos's Personal Website",
    'footer.author_website': 'danny-armijos.com',
    'footer.data_governance_btn': 'Data Treatment & CAD Governance',

    // Consent Sheet
    'consent.badge': 'GDPR & ISO/IEC 27001',
    'consent.title': 'Data Processing and CAD Governance',
    'consent.subtitle':
      'Regulatory compliance for parametric model processing and engineering privacy.',
    'consent.local_title': 'Local CAD Execution',
    'consent.local_desc':
      "Parametric CAD models and engineering scripts execute exclusively on the user's local linked devices.",
    'consent.retention_title': 'STL Mesh Retention',
    'consent.retention_desc':
      'Only triangulated 3D preview meshes (STL) are temporarily cached on the server to enable browser viewing.',
    'consent.forgotten_title': 'Right to Be Forgotten',
    'consent.forgotten_desc':
      'Users retain the unconditional right to permanent deletion to purge all account data and linked machines at any time.',
    'consent.checkbox':
      'I have read and accept the Terms of Service and Privacy & Data Processing Policy.',
    'consent.accept_btn': 'Accept and Continue',
    'consent.status_active': 'Active Data Processing Consent Verified',
    'consent.close_btn': 'Close',

    // Home Page
    'home.open_dashboard': 'Open your dashboard',
    'home.sign_in': 'Sign in',
    'home.download_connector': 'Download the connector ↗',
    'home.manifesto_title':
      'An assistant that reaches your CAD software — not the other way around.',
    'home.manifesto_p':
      'CAD Engine runs as a small agent on the same computer as FreeCAD or AutoCAD. Claude or ChatGPT talks to that agent through a fixed set of operations, never a shell and never a free-form script, so the model can create and edit real designs without ever holding a copy of your files.',
    'home.surface_title': 'Execution surface',
    'home.surface_desc':
      'A closed allowlist of CAD operations. Nothing free-form reaches your machine.',
    'home.runs_title': 'Where it runs',
    'home.runs_desc': 'Your computer. Native .FCStd and .dwg files never leave it.',
    'home.setup_title': 'Setup time',
    'home.setup_desc': 'One pairing code, valid for 10 minutes.',
    'home.flow_heading': 'From a bare install to a connected assistant',
    'home.flow_step1_title': 'Install the connector',
    'home.flow_step1_desc':
      'Run the CAD Engine agent on the computer with FreeCAD, or AutoCAD 2026 Core Console (AutoCAD LT is detection-only).',
    'home.flow_step2_title': 'Pair the machine',
    'home.flow_step2_desc':
      'Link it to your account with a one-time code that expires in 10 minutes.',
    'home.flow_step3_title': 'Connect Claude or ChatGPT',
    'home.flow_step3_desc':
      "Add the CAD Engine connector in your assistant's settings and sign in.",
    'home.cap_heading': 'What runs today',
    'home.cap_legend_full': 'executes now',
    'home.cap_legend_partial': 'executes on some installs',
    'home.cap_legend_none': 'detected, not executed',
    'home.cap_freecad_title': 'FreeCAD',
    'home.cap_freecad_note': 'Full execution on any host with a working FreeCADCmd.',
    'home.cap_freecad_create': 'Create — primitives, booleans, extrusions',
    'home.cap_freecad_modify': 'Modify — transforms on named designs',
    'home.cap_freecad_read': 'Read — scene contents and dimensions',
    'home.cap_freecad_export': 'Export — STEP, STL, and DXF',
    'home.cap_autocad_title': 'AutoCAD',
    'home.cap_autocad_note':
      'Full 13-operation headless execution with AutoCAD 2026 Core Console on Windows; AutoCAD LT is detected only.',
    'home.cap_autocad_create': 'Create — 3D primitives (box, cylinder, sphere, cone, extrude)',
    'home.cap_autocad_modify': 'Modify — 3D booleans (cut, union, intersect) & transforms',
    'home.cap_autocad_verify_export':
      'Verify & Export — native DWG/DXF, MASSPROP volumetric checks & binary STL preview via STLOUT',
    'home.cap_autocad_lt':
      'AutoCAD LT — detected only; execution disabled (lacks accoreconsole.exe & 3D/STLOUT)',
    'home.trust_heading': 'What stays yours',
    'home.trust_item1':
      'Every operation runs from a fixed allowlist — nothing free-form ever reaches the machine.',
    'home.trust_item2_prefix': 'Native files (',
    'home.trust_item2_mid': ') never leave the computer that owns them.',
    'home.trust_item3':
      'Only a generated STL preview mesh uploads, and only so the dashboard can render it.',
    'home.trust_diag_history': 'Job & device history',
    'home.trust_diag_mesh': 'STL preview mesh',
    'home.trust_diag_render': 'Dashboard render',
    'home.trust_caption':
      'Native CAD files and job history stop at the boundary. Only a size-capped STL preview mesh crosses it, so the dashboard has something to render.',
    'home.closing_heading': 'Connect once. Keep everything local.',
    'home.closing_open_dashboard': 'Open your dashboard',
    'home.closing_sign_in': 'Sign in',
    'home.closing_download': 'Download the connector ↗',

    // Pair Page
    'pair.eyebrow': 'LINK A COMPUTER',
    'pair.title': 'Pair your device',
    'pair.desc':
      'Only enter a code from an agent you installed on a computer you control. Codes expire after 10 minutes.',
    'pair.code_label': '12-character pairing code',
    'pair.code_placeholder': 'A1B2C3D4E5F6',
    'pair.confirm_btn': 'Confirm & link device',

    // Devices Page
    'devices.title': 'Linked computers',
    'devices.subtitle':
      'Computers running the CAD Agent Designer agent, and the CAD installations detected on each.',
    'devices.refresh': '↻ Refresh status',
    'devices.loading': 'Loading devices…',
    'devices.empty': 'No linked computers yet',
    'devices.th_name': 'Name',
    'devices.th_status': 'Status',
    'devices.th_last_seen': 'Last seen',
    'devices.th_cads': 'CAD installations',
    'devices.th_actions': 'Actions',
    'devices.status_online': 'Online',
    'devices.status_offline': 'Offline',
    'devices.status_revoked': 'Revoked',
    'devices.executable': 'Executable',
    'devices.detection_only': 'Detection only',
    'devices.allowed_folders': 'Allowed folders',
    'devices.revoke_btn': 'Revoke access',
    'devices.revoke_confirm': 'Revoke this device?',
    'devices.confirm_revoke_btn': 'Confirm revoke',

    // Designs Page
    'designs.title': 'Designs',
    'designs.subtitle': '3D CAD models generated and managed by CAD Engine.',
    'designs.empty': 'No designs created yet.',
    'designs.loading': 'Loading designs…',
    'designs.preview_pending': 'Preview pending',
    'designs.not_found': 'Document not found.',

    // Jobs Page
    'jobs.title': 'Jobs',
    'jobs.subtitle': 'Execution log and queue of parametric CAD modeling jobs.',
    'jobs.loading': 'Loading jobs',
    'jobs.empty': 'No jobs yet',
    'jobs.error_connect': 'Could not connect',

    // Connect Page
    'connect.eyebrow': 'CONNECT YOUR MCP CLIENT',
    'connect.title': 'Almost there.',
    'connect.subtitle':
      "Paste this deployment's MCP resource URL into Claude or ChatGPT to finish connecting.",
    'connect.resource_url_title': 'MCP resource URL',
    'connect.copy_url': 'Copy URL',
    'connect.copied': 'Copied!',
    'connect.copy_snippet': 'Copy snippet',
    'connect.snippet_copied': 'Copied!',
    'connect.claude_title': 'Connect Claude',
    'connect.claude_step1_prefix': 'Open Claude and go to ',
    'connect.claude_step1_strong': 'Settings → Connectors',
    'connect.claude_step2_prefix': 'Choose ',
    'connect.claude_step2_strong': 'Add custom connector',
    'connect.claude_step3': 'Paste the MCP resource URL above.',
    'connect.claude_step4': 'Sign in with your CAD Agent Designer account when prompted.',
    'connect.chatgpt_title': 'Connect ChatGPT',
    'connect.chatgpt_step1_prefix': 'Open ChatGPT and go to ',
    'connect.chatgpt_step1_strong': 'Settings → Connectors',
    'connect.chatgpt_step2_prefix': 'Turn on ',
    'connect.chatgpt_step2_strong': 'Developer mode',
    'connect.chatgpt_step3_prefix': 'Choose ',
    'connect.chatgpt_step3_strong': 'Add',
    'connect.chatgpt_step3_suffix': ' and paste the MCP resource URL above.',
    'connect.device_title': 'Device status',
    'connect.device_error': 'Could not load device status.',
    'connect.device_online': 'Online',
    'connect.device_offline': 'Offline',
    'connect.device_waiting': 'Waiting for this computer to come online…',
    'connect.device_looking_up': 'Looking up this device…',
    'connect.device_loading': 'Loading device status…',
    'connect.device_not_found_lead': 'This device was not found. Check ',
    'connect.device_linked_link': 'your linked computers',
    'connect.device_empty_lead': 'No linked computers yet. ',
    'connect.device_pair_link': 'Pair one first',
    'connect.keep_alive_title': 'Keep the agent running',
    'connect.keep_alive_desc':
      'Configure the agent to survive user logouts and system reboots on your CAD workstation.',
    'connect.linux_badge': 'Linux',
    'connect.linux_title': 'systemd service',
    'connect.linux_desc':
      'Create a service under /etc/systemd/system/cadengine.service (replace youruser with your paired account):',
    'connect.linux_desc_prefix': 'Create a service under ',
    'connect.linux_desc_mid': ' (replace ',
    'connect.linux_desc_suffix': ' with your paired account):',
    'connect.linux_copy_aria': 'Copy Linux systemd snippet',
    'connect.macos_badge': 'macOS',
    'connect.macos_title': 'launchd LaunchAgent',
    'connect.macos_desc':
      'Create ~/Library/LaunchAgents/com.cadengine.agent.plist to run within your user session:',
    'connect.macos_desc_prefix': 'Create ',
    'connect.macos_desc_suffix': ' to run within your user session:',
    'connect.macos_copy_aria': 'Copy macOS launchd snippet',
    'connect.macos_hint': 'Load immediately:',
    'connect.windows_badge': 'Windows',
    'connect.windows_title': 'Task Scheduler (PowerShell)',
    'connect.windows_desc':
      'Run in an Administrator PowerShell (replace YOURUSER with the account that paired):',
    'connect.windows_desc_prefix': 'Run in an ',
    'connect.windows_desc_strong': 'Administrator PowerShell',
    'connect.windows_desc_mid': ' (replace ',
    'connect.windows_desc_suffix': ' with the account that paired):',
    'connect.windows_copy_aria': 'Copy Windows PowerShell snippet',
    'connect.try_title': 'Try it — Mechanical & Parametric CAD',
    'connect.try_desc':
      'Once connected, ask your assistant to run list_devices, or ask it to model mechanical components: "Create a mounting bracket with 4 counterbore holes" or "Model an extruded enclosure profile".',
    'connect.try_desc_prefix': 'Once connected, ask your assistant to run ',
    'connect.try_desc_mid': ', or ask it to model mechanical components: ',
    'connect.try_prompt1': '"Create a mounting bracket with 4 counterbore holes"',
    'connect.try_desc_or': ' or ',
    'connect.try_prompt2': '"Model an extruded enclosure profile"',
    'connect.try_hint':
      'Note: CAD Agent Designer specializes in precision parametric and mechanical CAD modeling (primitives, transforms, booleans, and extrusions), along with subdivision polygonal modeling via Blender 4.x.',

    // About Page
    'about.title': 'About',
    'about.subtitle': 'Architecture, verification, and governance status.',
    'about.status': 'experimental alpha',
    'about.status_title': 'Status',
    'about.status_desc':
      'CAD Engine is an experimental alpha, not a hosted service. Installers are unsigned and macOS builds are not notarized; you deploy and operate your own backend.',
    'about.architecture_title': 'System Architecture',
    'about.arch_title': 'Tri-Engine Architecture',
    'about.arch_desc':
      'CAD Engine unifies three specialized engineering engines under a single sandboxed execution surface, dispatching operations to the optimal kernel based on geometric requirements:',
    'about.arch_freecad_title': 'FreeCAD (Parametric CSG & B-Rep)',
    'about.arch_freecad_desc':
      'Constructive Solid Geometry (CSG), boundary representation (B-Rep), parametric sketch constraints, feature tree, and STEP/IGES engineering export.',
    'about.arch_autocad_title': 'AutoCAD (Drafting & DWG Compatibility)',
    'about.arch_autocad_desc':
      'Headless execution via Core Console (accoreconsole.exe), native DWG/DXF artifact generation, 3D ACIS solid primitives, transforms, boolean operations, and MASSPROP volumetric verification.',
    'about.arch_blender_title': 'Blender 4.x (3D Polygonal & Organic Modeling)',
    'about.arch_blender_desc':
      'Headless Python API execution (blender -b), subdivision surfaces (Subsurf), procedural displacement modifiers, quad topology, and binary glTF/OBJ/STL asset export.',
    'about.compat_title': 'Compatibility',
    'about.compat_th_cad': 'CAD / platform',
    'about.compat_th_behavior': 'Alpha behavior',
    'about.compat_freecad_cmd': 'FreeCAD, working FreeCADCmd / freecadcmd',
    'about.compat_freecad_cmd_desc':
      'Headless create, modify, read, and export; an STL preview mesh uploads for the dashboard.',
    'about.compat_freecad_gui': 'FreeCAD GUI-only, AppImage, Flatpak or Snap',
    'about.compat_freecad_gui_desc': 'May need a manual path or a separate command-line install.',
    'about.compat_autocad_core': 'AutoCAD 2026 Core Console (accoreconsole.exe), Windows',
    'about.compat_autocad_core_desc':
      'Full 13-operation headless execution (3D primitives, booleans, transforms, MASSPROP volumetric validation) producing native DWG/DXF artifacts and binary STL preview via headless STLOUT. Enabled with --enable-autocad.',
    'about.compat_autocad_lt': 'AutoCAD LT, or AutoCAD without accoreconsole.exe',
    'about.compat_autocad_lt_desc':
      'Installation detection only; execution disabled (AutoCAD LT lacks Core Console, 3D solid modeling, and STLOUT support).',
    'about.compat_autocad_linux': 'AutoCAD on Linux',
    'about.compat_autocad_linux_desc': 'Not a supported target.',
    'about.compat_blender': 'Blender 4.x (headless background execution, Windows / macOS / Linux)',
    'about.compat_blender_desc':
      'Headless 3D polygonal modeling, subdivision surfaces, procedural displacement, quad topology, and binary glTF/OBJ/STL preview export. Enabled with --enable-blender.',
    'about.security_title': 'Security and limitations',
    'about.security_oidc':
      'Identity comes from a validated OIDC token; a request cannot choose its own owner.',
    'about.security_pairing': 'Device pairing codes are one-use and expire in 10 minutes.',
    'about.security_revocation':
      'Revoking a device blocks new requests and cancels queued jobs, but cannot stop one already running locally.',
    'about.security_cad_files':
      'Native CAD files stay on the linked computer. The STL preview mesh is the exception: capped at 25 MiB per file, with a 500 MiB per-device quota.',
    'about.security_store':
      'The store supports one backend instance; this alpha is not built to scale horizontally.',
    'about.security_readme': 'Read the full README ↗',
    'about.security_or': ' or ',
    'about.security_policy': 'SECURITY.md ↗',
    'about.security_github': 'on GitHub.',
    'about.author_title': 'Author & Engineering Lead',
    'about.author_name': 'Danny Armijos',
    'about.author_role': 'Software Architect & CAD Systems Engineer',
    'about.author_bio':
      'Creator and lead developer of CAD Engine, bridging frontier AI models with mechanical CAD engines and 3D modeling environments.',
    'about.author_linkedin_btn': 'LinkedIn Profile ↗',
    'about.author_website_btn': 'Personal Website ↗',
    'about.gov_title': 'Account Governance / Right to Erasure',
    'about.gov_desc':
      'Exercise your Right to Erasure ("Derecho al olvido" under GDPR & CCPA). Deleting your account permanently purges all CAD documents, 3D preview meshes, linked devices, API keys, and job history.',
    'about.gov_delete_btn': 'Delete account',
    'about.gov_dialog_badge': 'DANGER / IRREVERSIBLE',
    'about.gov_dialog_title': 'Permanently delete account?',
    'about.gov_dialog_lead': 'This action is destructive and irreversible. Once confirmed:',
    'about.gov_dialog_item1': 'All your CAD files and documents will be deleted from the cloud.',
    'about.gov_dialog_item2': 'All 3D preview meshes (.stl) will be physically purged.',
    'about.gov_dialog_item3': 'All your linked machines and devices will be revoked.',
    'about.gov_dialog_item4': 'All your API keys and job history will be destroyed.',
    'about.gov_dialog_item5': 'Your session will be closed and your identity deleted in Keycloak.',
    'about.gov_dialog_instruction':
      'To confirm permanent deletion, type exactly ELIMINAR in the field below:',
    'about.gov_dialog_cancel': 'Cancel',
    'about.gov_dialog_confirm': 'Permanently delete',
    'about.gov_dialog_deleting': 'Deleting...',
    'about.gov_error_generic': 'Error deleting account.',
  },
  es: {
    // Navigation and Shell
    'nav.skip_to_content': 'Saltar al contenido',
    'nav.devices': 'Dispositivos',
    'nav.designs': 'Diseños',
    'nav.jobs': 'Trabajos',
    'nav.connect': 'Conectar',
    'nav.api_keys': 'Claves API',
    'nav.about': 'Acerca de',
    'nav.sign_in': 'Iniciar sesión',
    'nav.sign_out': 'Cerrar sesión',
    'nav.daemon_online': 'Demonio en Línea',
    'nav.version_tag': 'v0.2.0-alpha.1',

    // Footer
    'footer.brand': 'CAD Agent Designer',
    'footer.status': '— alfa experimental',
    'footer.tagline': 'Ejecución FreeCAD, paridad con AutoCAD Core Console y MCP remoto.',
    'footer.author_lead': 'Diseñado y Desarrollado por',
    'footer.author_name': 'Danny Armijos',
    'footer.author_linkedin_aria': 'Perfil de LinkedIn de Danny Armijos',
    'footer.author_website_aria': 'Sitio Web Personal de Danny Armijos',
    'footer.author_website': 'danny-armijos.com',
    'footer.data_governance_btn': 'Tratamiento de Datos y Gobernanza CAD',

    // Consent Sheet
    'consent.badge': 'GDPR & ISO/IEC 27001',
    'consent.title': 'Tratamiento de Datos y Gobernanza CAD',
    'consent.subtitle':
      'Conformidad regulatoria para el procesamiento de modelos paramétricos y privacidad de ingeniería.',
    'consent.local_title': 'Ejecución Local CAD',
    'consent.local_desc':
      'Los modelos paramétricos CAD y scripts de ingeniería se ejecutan exclusivamente de manera local en los dispositivos vinculados del usuario.',
    'consent.retention_title': 'Retención de Mallas STL',
    'consent.retention_desc':
      'Únicamente las mallas de previsualización 3D trianguladas (STL) se almacenan temporalmente en el servidor para permitir la visualización en el navegador.',
    'consent.forgotten_title': 'Derecho al Olvido',
    'consent.forgotten_desc':
      'Los usuarios conservan el derecho incondicional de supresión permanente para purgar la totalidad de datos de cuenta y máquinas vinculadas en cualquier momento.',
    'consent.checkbox':
      'He leído y acepto los Términos de Servicio y la Política de Privacidad y Tratamiento de Datos.',
    'consent.accept_btn': 'Aceptar y Continuar',
    'consent.status_active': 'Consentimiento Activo de Tratamiento de Datos Verificado',
    'consent.close_btn': 'Cerrar',

    // Home Page
    'home.open_dashboard': 'Abrir panel de control',
    'home.sign_in': 'Iniciar sesión',
    'home.download_connector': 'Descargar el conector ↗',
    'home.manifesto_title': 'Un asistente que se conecta a su software CAD — no al revés.',
    'home.manifesto_p':
      'CAD Engine se ejecuta como un pequeño agente en la misma computadora que FreeCAD o AutoCAD. Claude o ChatGPT se comunican con ese agente mediante un conjunto cerrado de operaciones, nunca una terminal ni un script libre, de modo que el modelo puede crear y editar diseños reales sin retener copia de sus archivos.',
    'home.surface_title': 'Superficie de ejecución',
    'home.surface_desc':
      'Lista cerrada de operaciones CAD permitidas. Nada sin control llega a su equipo.',
    'home.runs_title': 'Dónde se ejecuta',
    'home.runs_desc': 'Su computadora. Los archivos nativos .FCStd y .dwg nunca salen de ella.',
    'home.setup_title': 'Tiempo de configuración',
    'home.setup_desc': 'Un código de vinculación, válido por 10 minutos.',
    'home.flow_heading': 'Desde una instalación limpia hasta un asistente conectado',
    'home.flow_step1_title': 'Instale el conector',
    'home.flow_step1_desc':
      'Ejecute el agente CAD Engine en el equipo con FreeCAD o AutoCAD 2026 Core Console (AutoCAD LT es solo detección).',
    'home.flow_step2_title': 'Vincule el equipo',
    'home.flow_step2_desc':
      'Vincúlelo a su cuenta con un código de un solo uso que caduca a los 10 minutos.',
    'home.flow_step3_title': 'Conecte Claude o ChatGPT',
    'home.flow_step3_desc':
      'Añada el conector CAD Engine en la configuración de su asistente e inicie sesión.',
    'home.cap_heading': 'Qué se ejecuta hoy',
    'home.cap_legend_full': 'se ejecuta ahora',
    'home.cap_legend_partial': 'se ejecuta en algunas instalaciones',
    'home.cap_legend_none': 'detectado, no ejecutado',
    'home.cap_freecad_title': 'FreeCAD',
    'home.cap_freecad_note': 'Ejecución completa en cualquier host con un FreeCADCmd operativo.',
    'home.cap_freecad_create': 'Crear — primitivas, booleanas, extrusiones',
    'home.cap_freecad_modify': 'Modificar — transformaciones en diseños con nombre',
    'home.cap_freecad_read': 'Leer — contenidos de escena y dimensiones',
    'home.cap_freecad_export': 'Exportar — STEP, STL y DXF',
    'home.cap_autocad_title': 'AutoCAD',
    'home.cap_autocad_note':
      'Ejecución desatendida completa de 13 operaciones con AutoCAD 2026 Core Console en Windows; AutoCAD LT es solo detección.',
    'home.cap_autocad_create': 'Crear — primitivas 3D (caja, cilindro, esfera, cono, extrusión)',
    'home.cap_autocad_modify':
      'Modificar — booleanas 3D (corte, unión, intersección) y transformaciones',
    'home.cap_autocad_verify_export':
      'Verificar y exportar — DWG/DXF nativo, comprobaciones volumétricas MASSPROP y vista previa STL binaria vía STLOUT',
    'home.cap_autocad_lt':
      'AutoCAD LT — solo detección; ejecución deshabilitada (carece de accoreconsole.exe y 3D/STLOUT)',
    'home.trust_heading': 'Lo que permanece bajo su control',
    'home.trust_item1':
      'Cada operación se ejecuta desde una lista permitida cerrada — nada libre llega a la máquina.',
    'home.trust_item2_prefix': 'Los archivos nativos (',
    'home.trust_item2_mid': ') nunca salen de la computadora que los posee.',
    'home.trust_item3':
      'Solo se sube una malla de vista previa STL generada, únicamente para que el panel pueda renderizarla.',
    'home.trust_diag_history': 'Historial de trabajos y equipos',
    'home.trust_diag_mesh': 'Malla de vista previa STL',
    'home.trust_diag_render': 'Renderizado del panel',
    'home.trust_caption':
      'Los archivos CAD nativos y el historial de trabajos se detienen en el límite. Solo una malla de previsualización STL con límite de tamaño lo cruza, para que el panel tenga qué renderizar.',
    'home.closing_heading': 'Conecte una vez. Mantenga todo local.',
    'home.closing_open_dashboard': 'Abrir panel de control',
    'home.closing_sign_in': 'Iniciar sesión',
    'home.closing_download': 'Descargar el conector ↗',

    // Pair Page
    'pair.eyebrow': 'VINCULAR UN EQUIPO',
    'pair.title': 'Vincular su dispositivo',
    'pair.desc':
      'Solo ingrese un código desde un agente instalado en una computadora que usted controle. Los códigos caducan a los 10 minutos.',
    'pair.code_label': 'Código de vinculación de 12 caracteres',
    'pair.code_placeholder': 'A1B2C3D4E5F6',
    'pair.confirm_btn': 'Confirmar y vincular dispositivo',

    // Devices Page
    'devices.title': 'Equipos vinculados',
    'devices.subtitle':
      'Computadoras ejecutando el agente CAD Agent Designer y las instalaciones CAD detectadas en cada una.',
    'devices.refresh': '↻ Actualizar estado',
    'devices.loading': 'Cargando dispositivos…',
    'devices.empty': 'No hay computadoras vinculadas aún',
    'devices.th_name': 'Nombre',
    'devices.th_status': 'Estado',
    'devices.th_last_seen': 'Última conexión',
    'devices.th_cads': 'Instalaciones CAD',
    'devices.th_actions': 'Acciones',
    'devices.status_online': 'En línea',
    'devices.status_offline': 'Desconectado',
    'devices.status_revoked': 'Revocado',
    'devices.executable': 'Ejecutable',
    'devices.detection_only': 'Solo detección',
    'devices.allowed_folders': 'Carpetas permitidas',
    'devices.revoke_btn': 'Revocar acceso',
    'devices.revoke_confirm': '¿Revocar este dispositivo?',
    'devices.confirm_revoke_btn': 'Confirmar revocación',

    // Designs Page
    'designs.title': 'Diseños',
    'designs.subtitle': 'Modelos CAD 3D generados y administrados por CAD Engine.',
    'designs.empty': 'Aún no se han creado diseños.',
    'designs.loading': 'Cargando diseños…',
    'designs.preview_pending': 'Previsualización pendiente',
    'designs.not_found': 'Documento no encontrado.',

    // Jobs Page
    'jobs.title': 'Trabajos',
    'jobs.subtitle': 'Registro de ejecución y cola de trabajos de modelado CAD paramétrico.',
    'jobs.loading': 'Cargando trabajos',
    'jobs.empty': 'Aún no hay trabajos',
    'jobs.error_connect': 'No se pudo conectar',

    // Connect Page
    'connect.eyebrow': 'CONECTE SU CLIENTE MCP',
    'connect.title': 'Casi listo.',
    'connect.subtitle':
      'Pegue la URL de recursos MCP de este despliegue en Claude o ChatGPT para finalizar la conexión.',
    'connect.resource_url_title': 'URL de recurso MCP',
    'connect.copy_url': 'Copiar URL',
    'connect.copied': '¡Copiado!',
    'connect.copy_snippet': 'Copiar fragmento',
    'connect.snippet_copied': '¡Copiado!',
    'connect.claude_title': 'Conectar Claude',
    'connect.claude_step1_prefix': 'Abra Claude y diríjase a ',
    'connect.claude_step1_strong': 'Configuración → Conectores',
    'connect.claude_step2_prefix': 'Seleccione ',
    'connect.claude_step2_strong': 'Añadir conector personalizado',
    'connect.claude_step3': 'Pegue la URL del recurso MCP indicada arriba.',
    'connect.claude_step4':
      'Inicie sesión con su cuenta de CAD Agent Designer cuando se le solicite.',
    'connect.chatgpt_title': 'Conectar ChatGPT',
    'connect.chatgpt_step1_prefix': 'Abra ChatGPT y diríjase a ',
    'connect.chatgpt_step1_strong': 'Configuración → Conectores',
    'connect.chatgpt_step2_prefix': 'Active el ',
    'connect.chatgpt_step2_strong': 'Modo desarrollador',
    'connect.chatgpt_step3_prefix': 'Seleccione ',
    'connect.chatgpt_step3_strong': 'Añadir',
    'connect.chatgpt_step3_suffix': ' y pegue la URL del recurso MCP indicada arriba.',
    'connect.device_title': 'Estado del dispositivo',
    'connect.device_error': 'No se pudo cargar el estado del dispositivo.',
    'connect.device_online': 'En línea',
    'connect.device_offline': 'Desconectado',
    'connect.device_waiting': 'Esperando a que este equipo se conecte…',
    'connect.device_looking_up': 'Buscando este dispositivo…',
    'connect.device_loading': 'Cargando el estado del dispositivo…',
    'connect.device_not_found_lead': 'Este dispositivo no fue encontrado. Verifique ',
    'connect.device_linked_link': 'sus equipos vinculados',
    'connect.device_empty_lead': 'No hay computadoras vinculadas aún. ',
    'connect.device_pair_link': 'Vincule una primero',
    'connect.keep_alive_title': 'Mantener el agente en ejecución',
    'connect.keep_alive_desc':
      'Configure el agente para que continúe ejecutándose tras cerrar sesión y tras reiniciar su estación CAD.',
    'connect.linux_badge': 'Linux',
    'connect.linux_title': 'servicio systemd',
    'connect.linux_desc':
      'Cree un servicio en /etc/systemd/system/cadengine.service (reemplace youruser con su cuenta vinculada):',
    'connect.linux_desc_prefix': 'Cree un servicio en ',
    'connect.linux_desc_mid': ' (reemplace ',
    'connect.linux_desc_suffix': ' con su cuenta vinculada):',
    'connect.linux_copy_aria': 'Copiar fragmento de systemd para Linux',
    'connect.macos_badge': 'macOS',
    'connect.macos_title': 'LaunchAgent de launchd',
    'connect.macos_desc':
      'Cree ~/Library/LaunchAgents/com.cadengine.agent.plist para ejecutar dentro de su sesión de usuario:',
    'connect.macos_desc_prefix': 'Cree ',
    'connect.macos_desc_suffix': ' para ejecutar dentro de su sesión de usuario:',
    'connect.macos_copy_aria': 'Copiar fragmento de launchd para macOS',
    'connect.macos_hint': 'Cargar de inmediato:',
    'connect.windows_badge': 'Windows',
    'connect.windows_title': 'Programador de Tareas (PowerShell)',
    'connect.windows_desc':
      'Ejecute en una consola PowerShell de Administrador (reemplace YOURUSER con la cuenta vinculada):',
    'connect.windows_desc_prefix': 'Ejecute en una ',
    'connect.windows_desc_strong': 'consola PowerShell de Administrador',
    'connect.windows_desc_mid': ' (reemplace ',
    'connect.windows_desc_suffix': ' con la cuenta vinculada):',
    'connect.windows_copy_aria': 'Copiar fragmento de PowerShell para Windows',
    'connect.try_title': 'Pruébelo — CAD Mecánico y Paramétrico',
    'connect.try_desc':
      'Una vez conectado, solicite a su asistente ejecutar list_devices, o modele componentes mecánicos: "Cree un soporte de montaje con 4 orificios avellanados" o "Modele un perfil de gabinete extruido".',
    'connect.try_desc_prefix': 'Una vez conectado, solicite a su asistente ejecutar ',
    'connect.try_desc_mid': ', o modele componentes mecánicos: ',
    'connect.try_prompt1': '"Cree un soporte de montaje con 4 orificios avellanados"',
    'connect.try_desc_or': ' o ',
    'connect.try_prompt2': '"Modele un perfil de gabinete extruido"',
    'connect.try_hint':
      'Nota: CAD Agent Designer se especializa en modelado CAD mecánico y paramétrico de precisión (primitivas, transformaciones, booleanas y extrusiones), junto con modelado poligonal por subdivisión con Blender 4.x.',

    // About Page
    'about.title': 'Acerca de',
    'about.subtitle': 'Arquitectura, verificación y estado de gobernanza.',
    'about.status': 'alfa experimental',
    'about.status_title': 'Estado',
    'about.status_desc':
      'CAD Engine es una versión alfa experimental, no un servicio alojado. Los instaladores no están firmados y las compilaciones de macOS no están notarizadas; usted despliega y opera su propio backend.',
    'about.architecture_title': 'Arquitectura del Sistema',
    'about.arch_title': 'Arquitectura de Triple Motor',
    'about.arch_desc':
      'CAD Engine unifica tres motores de ingeniería especializados en una única superficie de ejecución restringida, delegando operaciones al kernel óptimo según los requerimientos geométricos:',
    'about.arch_freecad_title': 'FreeCAD (CSG Paramétrico y B-Rep)',
    'about.arch_freecad_desc':
      'Geometría Sólida Constructiva (CSG), representación por bordes (B-Rep), restricciones de bocetos paramétricos, árbol de operaciones y exportación de ingeniería STEP/IGES.',
    'about.arch_autocad_title': 'AutoCAD (Dibujo y Compatibilidad DWG)',
    'about.arch_autocad_desc':
      'Ejecución desatendida mediante Core Console (accoreconsole.exe), generación nativa de artefactos DWG/DXF, primitivas de sólidos ACIS 3D, transformaciones, operaciones booleanas y verificación volumétrica MASSPROP.',
    'about.arch_blender_title': 'Blender 4.x (Modelado Poligonal y Orgánico 3D)',
    'about.arch_blender_desc':
      'Ejecución desatendida mediante API de Python (blender -b), superficies de subdivisión (Subsurf), desplazamiento procedimental, topología de quads y exportación de activos binarios glTF/OBJ/STL.',
    'about.compat_title': 'Compatibilidad',
    'about.compat_th_cad': 'CAD / plataforma',
    'about.compat_th_behavior': 'Comportamiento en alfa',
    'about.compat_freecad_cmd': 'FreeCAD, ejecutable FreeCADCmd / freecadcmd operativo',
    'about.compat_freecad_cmd_desc':
      'Creación, modificación, lectura y exportación desatendida; sube una malla de previsualización STL para el panel.',
    'about.compat_freecad_gui': 'FreeCAD solo GUI, AppImage, Flatpak o Snap',
    'about.compat_freecad_gui_desc':
      'Puede requerir una ruta manual o una instalación de línea de comandos independiente.',
    'about.compat_autocad_core': 'AutoCAD 2026 Core Console (accoreconsole.exe), Windows',
    'about.compat_autocad_core_desc':
      'Ejecución desatendida completa de 13 operaciones (primitivas 3D, booleanas, transformaciones, validación volumétrica MASSPROP) produciendo artefactos nativos DWG/DXF y previsualización STL binaria mediante STLOUT headless. Habilitado con --enable-autocad.',
    'about.compat_autocad_lt': 'AutoCAD LT o AutoCAD sin accoreconsole.exe',
    'about.compat_autocad_lt_desc':
      'Solo detección de instalación; ejecución deshabilitada (AutoCAD LT carece de Core Console, modelado de sólidos 3D y soporte para STLOUT).',
    'about.compat_autocad_linux': 'AutoCAD en Linux',
    'about.compat_autocad_linux_desc': 'No es una plataforma compatible.',
    'about.compat_blender':
      'Blender 4.x (ejecución desatendida en segundo plano, Windows / macOS / Linux)',
    'about.compat_blender_desc':
      'Modelado poligonal 3D desatendido, superficies de subdivisión, desplazamiento procedimental, topología de quads y exportación de previsualización binaria glTF/OBJ/STL. Habilitado con --enable-blender.',
    'about.security_title': 'Seguridad y limitaciones',
    'about.security_oidc':
      'La identidad proviene de un token OIDC validado; una solicitud no puede definir su propio propietario.',
    'about.security_pairing':
      'Los códigos de vinculación de dispositivos son de un solo uso y caducan a los 10 minutos.',
    'about.security_revocation':
      'Revocar un dispositivo bloquea nuevas solicitudes y cancela trabajos en cola, pero no detiene los que ya están en ejecución local.',
    'about.security_cad_files':
      'Los archivos CAD nativos permanecen en la computadora vinculada. La malla de previsualización STL es la excepción: limitada a 25 MiB por archivo, con una cuota de 500 MiB por dispositivo.',
    'about.security_store':
      'El almacenamiento admite una única instancia de backend; esta versión alfa no está diseñada para escalar horizontalmente.',
    'about.security_readme': 'Lea el README completo ↗',
    'about.security_or': ' o ',
    'about.security_policy': 'SECURITY.md ↗',
    'about.security_github': 'en GitHub.',
    'about.author_title': 'Autor y Responsable de Ingeniería',
    'about.author_name': 'Danny Armijos',
    'about.author_role': 'Arquitecto de Software e Ingeniero de Sistemas CAD',
    'about.author_bio':
      'Creador y desarrollador principal de CAD Engine, uniendo modelos de IA de frontera con motores CAD mecánicos y entornos de modelado 3D.',
    'about.author_linkedin_btn': 'Perfil de LinkedIn ↗',
    'about.author_website_btn': 'Sitio Web Personal ↗',
    'about.gov_title': 'Gobernanza de Cuenta / Derecho al Olvido',
    'about.gov_desc':
      'Ejerza su Derecho al Olvido (conforme al RGPD y CCPA). Eliminar su cuenta purga de forma permanente todos los documentos CAD, mallas de previsualización 3D, dispositivos vinculados, claves de API e historial de trabajos.',
    'about.gov_delete_btn': 'Eliminar cuenta',
    'about.gov_dialog_badge': 'PELIGRO / IRREVERSIBLE',
    'about.gov_dialog_title': '¿Eliminar cuenta permanentemente?',
    'about.gov_dialog_lead': 'Esta acción es destructiva e irreversible. Una vez confirmada:',
    'about.gov_dialog_item1': 'Se eliminarán todos tus archivos y documentos CAD de la nube.',
    'about.gov_dialog_item2':
      'Se purgarán físicamente todas las mallas de previsualización 3D (.stl).',
    'about.gov_dialog_item3': 'Se revocarán todas tus máquinas y dispositivos vinculados.',
    'about.gov_dialog_item4': 'Se destruirán todas tus claves de API y el historial de trabajos.',
    'about.gov_dialog_item5': 'Se cerrará tu sesión y se eliminará tu identidad en Keycloak.',
    'about.gov_dialog_instruction':
      'Para confirmar la eliminación permanente, escribe exactamente ELIMINAR en el siguiente campo:',
    'about.gov_dialog_cancel': 'Cancelar',
    'about.gov_dialog_confirm': 'Eliminar permanentemente',
    'about.gov_dialog_deleting': 'Eliminando...',
    'about.gov_error_generic': 'Error al eliminar la cuenta.',
  },
};
