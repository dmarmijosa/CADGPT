"""Bilingual internationalization (i18n) for CAD Engine agent and GUI."""
from __future__ import annotations

import json
import locale
import os
from pathlib import Path
from typing import Any, Optional

from platformdirs import user_data_dir

SERVICE = "CADGPT"
SUPPORTED_LANGUAGES = ("en", "es")
DEFAULT_LANGUAGE = "en"

_current_language: Optional[str] = None

TRANSLATIONS: dict[str, dict[str, str]] = {
    "en": {
        "app_title": "CAD Engine",
        "wizard_title": "CAD Engine Onboarding Wizard",
        "btn_back": "Back",
        "btn_next": "Next",
        "btn_continue": "Continue",
        "btn_finish": "Finish",
        "btn_cancel": "Cancel",
        "btn_close": "Close",
        "btn_recheck": "Re-check",
        "btn_copy": "Copy Code",
        "btn_copied": "Copied!",
        "btn_open_pairing": "Open Pairing Page",
        "btn_download_freecad": "Download FreeCAD",
        "btn_download_blender": "Download Blender",
        "btn_browse": "Browse...",
        "step1_title": "Welcome to CAD Engine",
        "step1_subtitle": "Select your preferred language to begin setup.",
        "step1_lang_en": "English",
        "step1_lang_es": "Spanish (Español)",
        "step1_welcome_text": (
            "CAD Engine connects your local workstation to cloud AI models for "
            "automated parametric CAD modeling and precision geometry."
        ),
        "step2_title": "Parametric CAD Prerequisite Verification",
        "step2_subtitle": (
            "CAD Engine requires at least one parametric CAD kernel (FreeCAD or AutoCAD)."
        ),
        "step2_freecad_detected": "FreeCAD: Detected ({path})",
        "step2_freecad_missing": "FreeCAD: Not Found",
        "step2_autocad_detected": "AutoCAD: Detected ({path})",
        "step2_autocad_missing": "AutoCAD: Not Found",
        "step2_gate_blocked": (
            "Prerequisite gate blocked: At least one CAD kernel (FreeCAD or AutoCAD) is required to proceed."
        ),
        "step2_gate_passed": "Prerequisite verified: Parametric CAD kernel detected.",
        "step2_install_cmd_label": "Recommended installation command for your operating system:",
        "step2_modal_title": "Prerequisite Required",
        "step2_modal_message": (
            "CAD Engine requires FreeCAD or AutoCAD for precision engineering geometry. "
            "Please install a supported kernel and click Re-check."
        ),
        "step3_title": "Blender 3D Modeling (Optional)",
        "step3_subtitle": (
            "Precision polygon subdivision surfaces, organic mesh sculpting, and glTF/FBX exports."
        ),
        "step3_detected": "Blender detected: {path}",
        "step3_not_detected": "Blender was not automatically detected on this system.",
        "step3_enable_option": "Enable Blender (3D Organic Modeling)",
        "step3_opt_out_option": "Continue without Blender",
        "step3_note": (
            "Blender is optional. You can proceed without it or configure a custom executable binary."
        ),
        "step3_path_saved": "Blender path saved: {path}",
        "step4_title": "Server Pairing & Startup Enrollment",
        "step4_subtitle": "Pair this workstation with your CAD Agent Designer account.",
        "step4_server_url_label": "Server URL:",
        "step4_pairing_code_label": "Your Pairing Code:",
        "step4_waiting": "Waiting for approval in web dashboard...",
        "step4_success": "Pairing successful! Workstation registered.",
        "step4_keyring_saved": "Credentials saved securely to OS keyring.",
        "step4_error": "Pairing error: {error}",
        "tray_status_connected": "CAD Engine: Connected (v{version})",
        "tray_status_disconnected": "CAD Engine: Disconnected",
        "tray_view_pairing_code": "View Pairing Code",
        "tray_view_status": "View Connection Status",
        "tray_open_dashboard": "Open Web Dashboard",
        "tray_unpair": "Unpair Device...",
        "tray_exit": "Exit",
        "hud_title": "CAD Engine Connection Status",
        "hud_server_url": "Server URL: {url}",
        "hud_hostname": "Workstation Hostname: {hostname}",
        "hud_device_id": "Device ID: {device_id}",
        "hud_active_engines": "Active Engines: {engines}",
        "hud_latency": "Heartbeat Latency: {latency} ms",
        "hud_status": "Status: {status}",
        "unpair_confirm_title": "Unpair Device",
        "unpair_confirm_message": (
            "Are you sure you want to disconnect this device? Saved credentials will be removed."
        ),
        "unpair_confirm_btn": "Unpair",
        "unpair_success": "Device successfully unpaired.",
    },
    "es": {
        "app_title": "CAD Engine",
        "wizard_title": "Asistente de Configuración de CAD Engine",
        "btn_back": "Atrás",
        "btn_next": "Siguiente",
        "btn_continue": "Continuar",
        "btn_finish": "Finalizar",
        "btn_cancel": "Cancelar",
        "btn_close": "Cerrar",
        "btn_recheck": "Volver a comprobar",
        "btn_copy": "Copiar Código",
        "btn_copied": "¡Copiado!",
        "btn_open_pairing": "Abrir Página de Vinculación",
        "btn_download_freecad": "Descargar FreeCAD",
        "btn_download_blender": "Descargar Blender",
        "btn_browse": "Examinar...",
        "step1_title": "Bienvenido a CAD Engine",
        "step1_subtitle": "Seleccione su idioma preferido para comenzar la configuración.",
        "step1_lang_en": "Inglés (English)",
        "step1_lang_es": "Español",
        "step1_welcome_text": (
            "CAD Engine conecta su estación de trabajo local con modelos de IA en la nube para "
            "modelado CAD paramétrico automatizado y geometría de precisión."
        ),
        "step2_title": "Verificación de Requisitos CAD Paramétricos",
        "step2_subtitle": (
            "CAD Engine requiere al menos un motor CAD paramétrico (FreeCAD o AutoCAD)."
        ),
        "step2_freecad_detected": "FreeCAD: Detectado ({path})",
        "step2_freecad_missing": "FreeCAD: No encontrado",
        "step2_autocad_detected": "AutoCAD: Detectado ({path})",
        "step2_autocad_missing": "AutoCAD: No encontrado",
        "step2_gate_blocked": (
            "Requisito previo bloqueado: Se requiere al menos un motor CAD (FreeCAD o AutoCAD) para continuar."
        ),
        "step2_gate_passed": "Requisito verificado: Motor CAD paramétrico detectado.",
        "step2_install_cmd_label": "Comando de instalación recomendado para su sistema operativo:",
        "step2_modal_title": "Requisito Obligatorio",
        "step2_modal_message": (
            "CAD Engine requiere FreeCAD o AutoCAD para geometría de ingeniería de precisión. "
            "Por favor instale un motor compatible y haga clic en Volver a comprobar."
        ),
        "step3_title": "Modelado 3D con Blender (Opcional)",
        "step3_subtitle": (
            "Superficies de subdivisión poligonal de precisión, esculpido de mallas orgánicas y exportación glTF/FBX."
        ),
        "step3_detected": "Blender detectado: {path}",
        "step3_not_detected": "Blender no fue detectado automáticamente en este sistema.",
        "step3_enable_option": "Activar Blender (Modelado Orgánico 3D)",
        "step3_opt_out_option": "Continuar sin Blender",
        "step3_note": (
            "Blender es opcional. Puede continuar sin él o configurar un binario ejecutable personalizado."
        ),
        "step3_path_saved": "Ruta de Blender guardada: {path}",
        "step4_title": "Vinculación y Registro con el Servidor",
        "step4_subtitle": "Vincule esta estación de trabajo con su cuenta de CAD Agent Designer.",
        "step4_server_url_label": "URL del Servidor:",
        "step4_pairing_code_label": "Su Código de Vinculación:",
        "step4_waiting": "Esperando aprobación en el panel web...",
        "step4_success": "¡Vinculación exitosa! Estación de trabajo registrada.",
        "step4_keyring_saved": "Credenciales guardadas de forma segura en el llavero del sistema operativo.",
        "step4_error": "Error de vinculación: {error}",
        "tray_status_connected": "CAD Engine: Conectado (v{version})",
        "tray_status_disconnected": "CAD Engine: Desconectado",
        "tray_view_pairing_code": "Ver código de vinculación",
        "tray_view_status": "Ver estado de conexión",
        "tray_open_dashboard": "Abrir Panel Web",
        "tray_unpair": "Desvincular equipo...",
        "tray_exit": "Salir",
        "hud_title": "Estado de Conexión de CAD Engine",
        "hud_server_url": "URL del Servidor: {url}",
        "hud_hostname": "Nombre del Equipo: {hostname}",
        "hud_device_id": "ID de Dispositivo: {device_id}",
        "hud_active_engines": "Motores Activos: {engines}",
        "hud_latency": "Latencia de Latido: {latency} ms",
        "hud_status": "Estado: {status}",
        "unpair_confirm_title": "Desvincular Equipo",
        "unpair_confirm_message": (
            "¿Está seguro de que desea desconectar este dispositivo? Se eliminarán las credenciales guardadas."
        ),
        "unpair_confirm_btn": "Desvincular",
        "unpair_success": "Dispositivo desvinculado con éxito.",
    },
}


def detect_locale() -> str:
    """Detect default system locale, defaulting to 'es' if starting with 'es', else 'en'."""
    candidates: list[Optional[str]] = [
        os.environ.get("LC_ALL"),
        os.environ.get("LC_MESSAGES"),
        os.environ.get("LANG"),
    ]
    try:
        candidates.append(locale.getlocale()[0])
    except Exception:
        pass
    try:
        candidates.append(locale.getdefaultlocale()[0])
    except Exception:
        pass

    for cand in candidates:
        if cand and cand.lower().startswith("es"):
            return "es"
    return "en"


def get_config_file(config_path: Optional[Path] = None) -> Path:
    if config_path is not None:
        return config_path
    root = Path(user_data_dir(SERVICE, appauthor=False))
    return root / "config.json"


def get_language(config_path: Optional[Path] = None) -> str:
    """Return stored language preference, fallback to detected locale."""
    global _current_language
    if _current_language in SUPPORTED_LANGUAGES:
        return _current_language

    cfg_file = get_config_file(config_path)
    if cfg_file.is_file():
        try:
            data = json.loads(cfg_file.read_text(encoding="utf-8"))
            lang = data.get("language")
            if lang in SUPPORTED_LANGUAGES:
                _current_language = lang
                return lang
        except Exception:
            pass

    detected = detect_locale()
    _current_language = detected
    return detected


def set_language(lang: str, config_path: Optional[Path] = None) -> str:
    """Set and persist language preference to config.json."""
    global _current_language
    if lang not in SUPPORTED_LANGUAGES:
        lang = DEFAULT_LANGUAGE

    _current_language = lang

    cfg_file = get_config_file(config_path)
    try:
        cfg_file.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        data = {}
        if cfg_file.is_file():
            try:
                data = json.loads(cfg_file.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        data["language"] = lang
        cfg_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass

    return lang


def t(key: str, lang: Optional[str] = None, **kwargs: Any) -> str:
    """Translate key with optional formatting arguments."""
    active_lang = lang or get_language()
    dict_for_lang = TRANSLATIONS.get(active_lang, TRANSLATIONS[DEFAULT_LANGUAGE])
    template = dict_for_lang.get(key, TRANSLATIONS[DEFAULT_LANGUAGE].get(key, key))
    if kwargs:
        try:
            return template.format(**kwargs)
        except Exception:
            return template
    return template
