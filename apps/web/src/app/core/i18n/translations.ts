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
    'home.flow_step1_title': '1. Run the local connector',
    'home.flow_step1_desc':
      'A single executable runs FreeCAD commands or drives AutoCAD without leaving your machine.',
    'home.flow_step2_title': '2. Pair with one code',
    'home.flow_step2_desc':
      'Enter the 12-character code shown on your computer. No credentials leave your machine.',
    'home.flow_step3_title': '3. Model from any chat',
    'home.flow_step3_desc':
      'Ask Claude or ChatGPT to design parts, edit sketches, and export manufacturing-ready models.',

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

    // About Page
    'about.title': 'About',
    'about.subtitle': 'Architecture, verification, and governance status.',
    'about.status': 'experimental alpha',
    'about.architecture_title': 'System Architecture',
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
    'home.flow_step1_title': '1. Ejecute el conector local',
    'home.flow_step1_desc':
      'Un único ejecutable procesa comandos de FreeCAD o AutoCAD sin salir de su máquina.',
    'home.flow_step2_title': '2. Vincule con un código',
    'home.flow_step2_desc':
      'Ingrese el código de 12 caracteres mostrado en su computadora. Ninguna credencial abandona su equipo.',
    'home.flow_step3_title': '3. Diseñe desde cualquier chat',
    'home.flow_step3_desc':
      'Pida a Claude o ChatGPT que cree piezas, edite bocetos y exporte modelos listos para fabricación.',

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

    // About Page
    'about.title': 'Acerca de',
    'about.subtitle': 'Arquitectura, verificación y estado de gobernanza.',
    'about.status': 'alfa experimental',
    'about.architecture_title': 'Arquitectura del Sistema',
  },
};
