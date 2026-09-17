"""Cross-platform Onboarding GUI Wizard and System Tray Daemon for CAD Engine."""
from __future__ import annotations

import json
import os
from pathlib import Path
import platform
import shutil
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from typing import Any, Callable, Dict, List, Optional

from platformdirs import user_data_dir
import keyring

from .discovery import discover
from .i18n import get_language, set_language, t

try:
    from PIL import Image, ImageDraw
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

try:
    import pystray
    PYSTRAY_AVAILABLE = True
except ImportError:
    PYSTRAY_AVAILABLE = False

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    TK_AVAILABLE = True
except Exception:
    tk = None  # type: ignore
    ttk = None  # type: ignore
    messagebox = None  # type: ignore
    filedialog = None  # type: ignore
    TK_AVAILABLE = False

if platform.system() == "Windows":
    try:
        import winreg
    except ImportError:
        winreg = None
else:
    winreg = None

VERSION = "0.2.0-alpha.1"
SERVICE = "CADGPT"

INSTALL_COMMANDS = {
    "Windows": {
        "cmd": "winget install FreeCAD.FreeCAD",
        "url": "https://www.freecad.org/downloads.php",
    },
    "Darwin": {
        "cmd": "brew install --cask freecad",
        "url": "https://www.freecad.org/downloads.php",
    },
    "Linux": {
        "cmd": "sudo apt install freecad",
        "url": "https://flathub.org/apps/org.freecad.FreeCAD",
    },
}

BLENDER_DOWNLOAD_URL = "https://www.blender.org/download/"


def get_install_guide_for_system() -> dict[str, str]:
    os_name = platform.system()
    return INSTALL_COMMANDS.get(
        os_name,
        {
            "cmd": "sudo apt install freecad",
            "url": "https://flathub.org/apps/org.freecad.FreeCAD",
        },
    )


def register_user_blender_path(blender_path: str, config_path: Optional[Path] = None) -> bool:
    """Register blender executable path in config.json and HKCU Environment Path on Windows."""
    resolved = str(Path(blender_path).resolve())
    if config_path is None:
        root = Path(user_data_dir(SERVICE, appauthor=False))
        config_path = root / "config.json"

    try:
        config_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        cfg = {}
        if config_path.is_file():
            try:
                cfg = json.loads(config_path.read_text(encoding="utf-8"))
            except Exception:
                cfg = {}
        cfg["blenderPath"] = resolved
        config_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception:
        return False

    if platform.system() == "Windows" and winreg is not None:
        try:
            parent_dir = str(Path(resolved).parent)
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_READ | winreg.KEY_SET_VALUE
            ) as key:
                try:
                    current_path, _ = winreg.QueryValueEx(key, "Path")
                except FileNotFoundError:
                    current_path = ""
                parts = [p.strip() for p in current_path.split(";") if p.strip()]
                if parent_dir not in parts:
                    parts.append(parent_dir)
                    new_path = ";".join(parts)
                    winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path)
        except Exception:
            pass

    return True


def create_cube_icon_image(size: int = 64) -> Any:
    """Generate a 3D isometric cube icon with distinct facet shading using Pillow."""
    if not PILLOW_AVAILABLE:
        return None

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size
    cx = s / 2.0
    cy = s / 2.0
    r = s * 0.42

    # Isometric vertices
    # Top face
    p_top = (cx, cy - r)
    p_top_right = (cx + r * 0.866, cy - r * 0.5)
    p_center = (cx, cy)
    p_top_left = (cx - r * 0.866, cy - r * 0.5)

    # Bottom vertices
    p_bot_left = (cx - r * 0.866, cy + r * 0.5)
    p_bottom = (cx, cy + r)
    p_bot_right = (cx + r * 0.866, cy + r * 0.5)

    # Shaded facets
    # Top facet (light indigo)
    draw.polygon([p_top, p_top_right, p_center, p_top_left], fill=(99, 102, 241, 255))
    # Left facet (dark indigo)
    draw.polygon([p_top_left, p_center, p_bottom, p_bot_left], fill=(55, 48, 163, 255))
    # Right facet (medium indigo)
    draw.polygon([p_center, p_top_right, p_bot_right, p_bottom], fill=(67, 56, 202, 255))

    # Clean borders
    outline_color = (30, 27, 75, 240)
    draw.line([p_top, p_top_right, p_bot_right, p_bottom, p_bot_left, p_top_left, p_top], fill=outline_color, width=2)
    draw.line([p_center, p_top], fill=outline_color, width=2)
    draw.line([p_center, p_bot_left], fill=outline_color, width=2)
    draw.line([p_center, p_bottom], fill=outline_color, width=2)

    return img


def get_tray_icon_image(size: int = 64) -> Any:
    """Return tray icon image, attempting to load from disk or generating isometric cube."""
    # Check candidate image paths
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "apps/web/public/favicon.ico",
        Path(__file__).resolve().parent / "icon.png",
    ]
    for cand in candidates:
        if cand.is_file() and PILLOW_AVAILABLE:
            try:
                with Image.open(str(cand)) as loaded:
                    return loaded.copy().resize((size, size))
            except Exception:
                pass
    return create_cube_icon_image(size)


# ---------------------------------------------------------------------------
# Wizard State & Controller (Decoupled and fully testable)
# ---------------------------------------------------------------------------

class OnboardingController:
    """Manages business logic and validation for the 4-step onboarding wizard."""

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or (
            Path(user_data_dir(SERVICE, appauthor=False)) / "config.json"
        )
        self.current_step = 1
        self.language = get_language(self.config_path)

        # Discovery & Prerequisite state
        self.cads: list[dict[str, Any]] = []
        self.freecad_found = False
        self.autocad_found = False
        self.cad_prerequisite_met = False
        self.freecad_path: Optional[str] = None
        self.autocad_path: Optional[str] = None

        # Blender state
        self.blender_found = False
        self.blender_path: Optional[str] = None
        self.blender_enabled = False

        # Server Pairing state
        self.server_url = self._load_saved_server() or "http://localhost:3000"
        self.device_id: Optional[str] = None
        self.pairing_code: Optional[str] = None
        self.device_secret: Optional[str] = None
        self.credential: Optional[str] = None
        self.pairing_pending = False
        self.pairing_completed = False

        self.refresh_discovery()

    def _load_saved_server(self) -> Optional[str]:
        if self.config_path.is_file():
            try:
                data = json.loads(self.config_path.read_text(encoding="utf-8"))
                return data.get("server")
            except Exception:
                pass
        return None

    def set_language(self, lang: str) -> str:
        self.language = set_language(lang, self.config_path)
        return self.language

    def refresh_discovery(self, manual_cad: Optional[str] = None, manual_blender: Optional[str] = None) -> None:
        """Probe CAD kernels and Blender via discovery engine."""
        saved_blender = manual_blender
        if not saved_blender and self.config_path.is_file():
            try:
                cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                saved_blender = cfg.get("blenderPath")
            except Exception:
                pass

        self.cads = discover(manual=manual_cad, blender_path=saved_blender)

        self.freecad_found = False
        self.autocad_found = False
        self.blender_found = False
        self.freecad_path = None
        self.autocad_path = None
        self.blender_path = None

        for item in self.cads:
            name = item.get("name")
            p = item.get("path")
            if name == "FreeCAD":
                self.freecad_found = True
                if not self.freecad_path:
                    self.freecad_path = p
            elif name == "AutoCAD":
                self.autocad_found = True
                if not self.autocad_path:
                    self.autocad_path = p
            elif name == "Blender":
                self.blender_found = True
                if not self.blender_path:
                    self.blender_path = p

        self.cad_prerequisite_met = bool(self.freecad_found or self.autocad_found)
        if self.blender_found:
            self.blender_enabled = True

    def configure_custom_blender(self, path: str) -> bool:
        if not path or not Path(path).exists():
            return False
        success = register_user_blender_path(path, self.config_path)
        if success:
            self.blender_path = str(Path(path).resolve())
            self.blender_found = True
            self.blender_enabled = True
            self.refresh_discovery(manual_blender=self.blender_path)
        return success

    def opt_out_blender(self) -> None:
        self.blender_enabled = False

    def can_advance_from_step(self, step: int) -> tuple[bool, str]:
        """Check whether wizard can advance from step; returns (allowed, reason_or_error)."""
        if step == 1:
            return True, ""
        elif step == 2:
            if not self.cad_prerequisite_met:
                return False, t("step2_modal_message", self.language)
            return True, ""
        elif step == 3:
            # Blender is optional; user can always advance
            return True, ""
        elif step == 4:
            if not self.pairing_completed:
                return False, t("step4_waiting", self.language)
            return True, ""
        return True, ""

    def request_pairing_code(self, server: Optional[str] = None) -> dict[str, Any]:
        """Request an ephemeral pairing code from API server."""
        if server:
            self.server_url = server.rstrip("/")
        name = platform.node()[:80] or "CAD computer"

        # Persist server to config.json
        try:
            self.config_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            cfg = {}
            if self.config_path.is_file():
                try:
                    cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                except Exception:
                    cfg = {}
            cfg["server"] = self.server_url
            self.config_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        except Exception:
            pass

        url = f"{self.server_url}/api/pairings"
        payload = json.dumps({"name": name, "cads": self.cads}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        self.pairing_code = data.get("userCode")
        self.device_secret = data.get("deviceSecret")
        self.pairing_pending = True
        return data

    def poll_pairing_status(self) -> dict[str, Any]:
        """Poll API server to check if pairing code was approved by user in dashboard."""
        if not self.device_secret:
            raise ValueError("No active pairing session; request pairing code first.")

        url = f"{self.server_url}/api/pairings/poll"
        payload = json.dumps({"deviceSecret": self.device_secret}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if not data.get("pending") and data.get("credential"):
            self.credential = data["credential"]
            self.device_id = data.get("deviceId")
            self.pairing_completed = True
            self.pairing_pending = False

            # Persist deviceId in config.json
            try:
                cfg = {}
                if self.config_path.is_file():
                    try:
                        cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                    except Exception:
                        cfg = {}
                if self.device_id:
                    cfg["deviceId"] = self.device_id
                self.config_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
            except Exception:
                pass

            # Persist credential in OS keyring
            try:
                keyring.set_password(SERVICE, self.server_url, self.credential)
            except Exception:
                pass

        return data


# ---------------------------------------------------------------------------
# Tkinter Onboarding Wizard GUI
# ---------------------------------------------------------------------------

class OnboardingWizard:
    """Tkinter 4-step wizard for language selection, CAD gate, Blender, and pairing."""

    def __init__(
        self,
        master: Optional[Any] = None,
        controller: Optional[OnboardingController] = None,
        on_complete: Optional[Callable[[], None]] = None,
    ):
        self.owns_master = False
        if master is None:
            if not TK_AVAILABLE:
                raise RuntimeError("Tkinter is not available in this environment.")
            self.master = tk.Tk()
            self.owns_master = True
        else:
            self.master = master

        self.controller = controller or OnboardingController()
        self.on_complete = on_complete
        self.polling_active = False

        self._init_window()
        self._build_ui()
        self.show_step(1)

    def _init_window(self) -> None:
        self.master.title(t("wizard_title", self.controller.language))
        self.master.geometry("620x520")
        self.master.minsize(580, 480)
        self.master.configure(bg="#f8fafc")

        # Styling
        style = ttk.Style(self.master)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure("TFrame", background="#f8fafc")
        style.configure("Card.TFrame", background="#ffffff", relief="flat")
        style.configure("TLabel", background="#f8fafc", foreground="#0f172a", font=("Helvetica", 10))
        style.configure("Title.TLabel", font=("Helvetica", 15, "bold"), foreground="#0f172a")
        style.configure("Sub.TLabel", font=("Helvetica", 10), foreground="#475569")
        style.configure("Code.TLabel", font=("Courier", 10), background="#e2e8f0", foreground="#0f172a", padding=6)
        style.configure("PairCode.TLabel", font=("Courier", 20, "bold"), foreground="#4f46e5", background="#eef2ff", padding=10)
        style.configure("Primary.TButton", font=("Helvetica", 10, "bold"), padding=6)
        style.configure("TButton", padding=5)

    def _build_ui(self) -> None:
        # Header banner
        self.header_frame = ttk.Frame(self.master)
        self.header_frame.pack(fill="x", padx=24, pady=(20, 10))

        self.step_indicator_label = ttk.Label(
            self.header_frame, text="", style="Sub.TLabel"
        )
        self.step_indicator_label.pack(anchor="w")

        self.step_title_label = ttk.Label(
            self.header_frame, text="", style="Title.TLabel"
        )
        self.step_title_label.pack(anchor="w", pady=(4, 2))

        self.step_subtitle_label = ttk.Label(
            self.header_frame, text="", style="Sub.TLabel", wraplength=560
        )
        self.step_subtitle_label.pack(anchor="w")

        ttk.Separator(self.master, orient="horizontal").pack(fill="x", padx=20, pady=10)

        # Content body frame
        self.content_container = ttk.Frame(self.master)
        self.content_container.pack(fill="both", expand=True, padx=24, pady=10)

        # Bottom navigation bar
        ttk.Separator(self.master, orient="horizontal").pack(fill="x", padx=20, pady=(10, 12))
        self.nav_frame = ttk.Frame(self.master)
        self.nav_frame.pack(fill="x", padx=24, pady=(0, 18))

        self.btn_back = ttk.Button(self.nav_frame, text=t("btn_back", self.controller.language), command=self.go_back)
        self.btn_back.pack(side="left")

        self.btn_next = ttk.Button(self.nav_frame, text=t("btn_next", self.controller.language), style="Primary.TButton", command=self.go_next)
        self.btn_next.pack(side="right")

    def clear_content(self) -> None:
        for child in self.content_container.winfo_children():
            child.destroy()

    def show_step(self, step: int) -> None:
        self.controller.current_step = step
        self.clear_content()
        self.update_nav_buttons()

        lang = self.controller.language
        self.step_indicator_label.config(text=f"Step {step} / 4")

        if step == 1:
            self._render_step1()
        elif step == 2:
            self._render_step2()
        elif step == 3:
            self._render_step3()
        elif step == 4:
            self._render_step4()

    def update_nav_buttons(self) -> None:
        step = self.controller.current_step
        lang = self.controller.language

        self.btn_back.config(
            text=t("btn_back", lang),
            state="normal" if step > 1 else "disabled",
        )

        if step == 4:
            self.btn_next.config(
                text=t("btn_finish", lang),
                state="normal" if self.controller.pairing_completed else "disabled",
            )
        elif step == 2:
            self.btn_next.config(
                text=t("btn_continue", lang),
                state="normal" if self.controller.cad_prerequisite_met else "disabled",
            )
        else:
            self.btn_next.config(
                text=t("btn_continue", lang) if step == 1 else t("btn_next", lang),
                state="normal",
            )

    # -----------------------------------------------------------------------
    # Step 1: Language Selection & Welcome
    # -----------------------------------------------------------------------
    def _render_step1(self) -> None:
        lang = self.controller.language
        self.step_title_label.config(text=t("step1_title", lang))
        self.step_subtitle_label.config(text=t("step1_subtitle", lang))

        card = ttk.Frame(self.content_container, style="Card.TFrame", padding=20)
        card.pack(fill="both", expand=True)

        welcome_lbl = ttk.Label(
            card, text=t("step1_welcome_text", lang), wraplength=520, style="Sub.TLabel"
        )
        welcome_lbl.pack(anchor="w", pady=(0, 20))

        lang_lbl = ttk.Label(card, text="Interface Language / Idioma:", font=("Helvetica", 10, "bold"))
        lang_lbl.pack(anchor="w", pady=(0, 10))

        self.lang_var = tk.StringVar(value=lang)

        r_en = ttk.Radiobutton(
            card,
            text=t("step1_lang_en", lang),
            value="en",
            variable=self.lang_var,
            command=self._on_lang_changed,
        )
        r_en.pack(anchor="w", pady=4)

        r_es = ttk.Radiobutton(
            card,
            text=t("step1_lang_es", lang),
            value="es",
            variable=self.lang_var,
            command=self._on_lang_changed,
        )
        r_es.pack(anchor="w", pady=4)

    def _on_lang_changed(self) -> None:
        new_lang = self.lang_var.get()
        self.controller.set_language(new_lang)
        self.master.title(t("wizard_title", new_lang))
        self.show_step(1)

    # -----------------------------------------------------------------------
    # Step 2: Parametric CAD Prerequisite Gate
    # -----------------------------------------------------------------------
    def _render_step2(self) -> None:
        lang = self.controller.language
        self.step_title_label.config(text=t("step2_title", lang))
        self.step_subtitle_label.config(text=t("step2_subtitle", lang))

        card = ttk.Frame(self.content_container, style="Card.TFrame", padding=18)
        card.pack(fill="both", expand=True)

        # Status lines
        status_box = ttk.Frame(card)
        status_box.pack(fill="x", pady=(0, 14))

        fc_text = (
            t("step2_freecad_detected", lang, path=self.controller.freecad_path or "")
            if self.controller.freecad_found
            else t("step2_freecad_missing", lang)
        )
        fc_icon = "[OK]" if self.controller.freecad_found else "[MISSING]"
        fc_lbl = ttk.Label(
            status_box,
            text=f"{fc_icon} {fc_text}",
            font=("Helvetica", 10, "bold" if self.controller.freecad_found else "normal"),
        )
        fc_lbl.pack(anchor="w", pady=2)

        acad_text = (
            t("step2_autocad_detected", lang, path=self.controller.autocad_path or "")
            if self.controller.autocad_found
            else t("step2_autocad_missing", lang)
        )
        acad_icon = "[OK]" if self.controller.autocad_found else "[MISSING]"
        acad_lbl = ttk.Label(
            status_box,
            text=f"{acad_icon} {acad_text}",
            font=("Helvetica", 10, "bold" if self.controller.autocad_found else "normal"),
        )
        acad_lbl.pack(anchor="w", pady=2)

        # Re-check button
        recheck_btn = ttk.Button(
            status_box,
            text=t("btn_recheck", lang),
            command=self._on_recheck_cad,
        )
        recheck_btn.pack(anchor="w", pady=(8, 0))

        ttk.Separator(card, orient="horizontal").pack(fill="x", pady=12)

        if not self.controller.cad_prerequisite_met:
            # Guided assistance
            guide = get_install_guide_for_system()
            warn_lbl = ttk.Label(
                card,
                text=t("step2_gate_blocked", lang),
                foreground="#b91c1c",
                font=("Helvetica", 10, "bold"),
                wraplength=520,
            )
            warn_lbl.pack(anchor="w", pady=(0, 6))

            cmd_lbl = ttk.Label(card, text=t("step2_install_cmd_label", lang), style="Sub.TLabel")
            cmd_lbl.pack(anchor="w", pady=(4, 2))

            code_lbl = ttk.Label(card, text=guide["cmd"], style="Code.TLabel")
            code_lbl.pack(anchor="w", fill="x", pady=(2, 8))

            dl_btn = ttk.Button(
                card,
                text=t("btn_download_freecad", lang),
                command=lambda: webbrowser.open(guide["url"]),
            )
            dl_btn.pack(anchor="w")
        else:
            ok_lbl = ttk.Label(
                card,
                text=t("step2_gate_passed", lang),
                foreground="#15803d",
                font=("Helvetica", 10, "bold"),
            )
            ok_lbl.pack(anchor="w", pady=10)

    def _on_recheck_cad(self) -> None:
        self.controller.refresh_discovery()
        self.show_step(2)

    # -----------------------------------------------------------------------
    # Step 3: Blender Tool Discovery & Configuration
    # -----------------------------------------------------------------------
    def _render_step3(self) -> None:
        lang = self.controller.language
        self.step_title_label.config(text=t("step3_title", lang))
        self.step_subtitle_label.config(text=t("step3_subtitle", lang))

        card = ttk.Frame(self.content_container, style="Card.TFrame", padding=18)
        card.pack(fill="both", expand=True)

        if self.controller.blender_found:
            status_text = t("step3_detected", lang, path=self.controller.blender_path or "")
            lbl = ttk.Label(
                card,
                text=f"[OK] {status_text}",
                foreground="#15803d",
                font=("Helvetica", 10, "bold"),
                wraplength=520,
            )
            lbl.pack(anchor="w", pady=(0, 10))

            opt_lbl = ttk.Label(
                card,
                text=t("step3_enable_option", lang),
                font=("Helvetica", 10),
            )
            opt_lbl.pack(anchor="w", pady=4)
        else:
            status_text = t("step3_not_detected", lang)
            lbl = ttk.Label(
                card,
                text=f"[INFO] {status_text}",
                foreground="#475569",
                font=("Helvetica", 10),
                wraplength=520,
            )
            lbl.pack(anchor="w", pady=(0, 10))

            note_lbl = ttk.Label(
                card,
                text=t("step3_note", lang),
                style="Sub.TLabel",
                wraplength=520,
            )
            note_lbl.pack(anchor="w", pady=(0, 14))

            # Action buttons: Browse custom binary and Download
            actions_frame = ttk.Frame(card)
            actions_frame.pack(fill="x", pady=6)

            browse_btn = ttk.Button(
                actions_frame,
                text=t("btn_browse", lang),
                command=self._on_browse_blender,
            )
            browse_btn.pack(side="left", padx=(0, 10))

            dl_btn = ttk.Button(
                actions_frame,
                text=t("btn_download_blender", lang),
                command=lambda: webbrowser.open(BLENDER_DOWNLOAD_URL),
            )
            dl_btn.pack(side="left")

        # Opt-out option
        ttk.Separator(card, orient="horizontal").pack(fill="x", pady=16)

        self.blender_opt_var = tk.BooleanVar(value=self.controller.blender_enabled)
        opt_chk = ttk.Checkbutton(
            card,
            text=t("step3_enable_option", lang),
            variable=self.blender_opt_var,
            command=self._on_blender_opt_toggle,
        )
        opt_chk.pack(anchor="w")

    def _on_browse_blender(self) -> None:
        if not filedialog:
            return
        selected = filedialog.askopenfilename(
            title=t("btn_browse", self.controller.language),
            filetypes=[
                ("Executable files", "*.exe" if platform.system() == "Windows" else "*"),
                ("All files", "*.*"),
            ],
        )
        if selected:
            if self.controller.configure_custom_blender(selected):
                self.show_step(3)

    def _on_blender_opt_toggle(self) -> None:
        if self.blender_opt_var.get():
            self.controller.blender_enabled = True
        else:
            self.controller.opt_out_blender()

    # -----------------------------------------------------------------------
    # Step 4: Server Pairing & Startup Enrollment
    # -----------------------------------------------------------------------
    def _render_step4(self) -> None:
        lang = self.controller.language
        self.step_title_label.config(text=t("step4_title", lang))
        self.step_subtitle_label.config(text=t("step4_subtitle", lang))

        card = ttk.Frame(self.content_container, style="Card.TFrame", padding=18)
        card.pack(fill="both", expand=True)

        # Server URL input
        url_frame = ttk.Frame(card)
        url_frame.pack(fill="x", pady=(0, 12))

        ttk.Label(url_frame, text=t("step4_server_url_label", lang), font=("Helvetica", 9, "bold")).pack(anchor="w")
        self.server_entry = ttk.Entry(url_frame, width=45)
        self.server_entry.insert(0, self.controller.server_url)
        self.server_entry.pack(side="left", fill="x", expand=True, pady=(4, 0))

        pair_init_btn = ttk.Button(
            url_frame,
            text="Generate Code",
            command=self._on_start_pairing,
        )
        pair_init_btn.pack(side="right", padx=(8, 0), pady=(4, 0))

        # Pairing Code Container
        self.code_container = ttk.Frame(card)
        self.code_container.pack(fill="x", pady=12)

        if self.controller.pairing_code:
            self._render_pairing_code_box(lang)
        else:
            # Auto-request pairing code if server is specified
            self._on_start_pairing()

    def _render_pairing_code_box(self, lang: str) -> None:
        for child in self.code_container.winfo_children():
            child.destroy()

        code = self.controller.pairing_code or "----"
        ttk.Label(self.code_container, text=t("step4_pairing_code_label", lang), style="Sub.TLabel").pack(anchor="w")

        code_lbl = ttk.Label(self.code_container, text=code, style="PairCode.TLabel")
        code_lbl.pack(anchor="w", pady=(4, 10))

        btn_row = ttk.Frame(self.code_container)
        btn_row.pack(fill="x", pady=(0, 10))

        self.copy_btn = ttk.Button(
            btn_row,
            text=t("btn_copy", lang),
            command=self._on_copy_code,
        )
        self.copy_btn.pack(side="left", padx=(0, 10))

        open_btn = ttk.Button(
            btn_row,
            text=t("btn_open_pairing", lang),
            command=lambda: webbrowser.open(f"{self.controller.server_url}/pair"),
        )
        open_btn.pack(side="left")

        # Status text
        self.pair_status_lbl = ttk.Label(
            self.code_container,
            text=t("step4_success", lang) if self.controller.pairing_completed else t("step4_waiting", lang),
            foreground="#15803d" if self.controller.pairing_completed else "#d97706",
            font=("Helvetica", 10, "bold" if self.controller.pairing_completed else "normal"),
        )
        self.pair_status_lbl.pack(anchor="w", pady=6)

    def _on_copy_code(self) -> None:
        code = self.controller.pairing_code or ""
        if self.master and code:
            self.master.clipboard_clear()
            self.master.clipboard_append(code)
            self.copy_btn.config(text=t("btn_copied", self.controller.language))
            self.master.after(2000, lambda: self.copy_btn.config(text=t("btn_copy", self.controller.language)))

    def _on_start_pairing(self) -> None:
        server = self.server_entry.get().strip() if hasattr(self, "server_entry") else self.controller.server_url
        if not server:
            return
        try:
            self.controller.request_pairing_code(server)
            self._render_pairing_code_box(self.controller.language)
            self._start_poll_thread()
        except Exception as exc:
            err_text = t("step4_error", self.controller.language, error=str(exc))
            if hasattr(self, "pair_status_lbl"):
                self.pair_status_lbl.config(text=err_text, foreground="#b91c1c")

    def _start_poll_thread(self) -> None:
        if self.polling_active:
            return
        self.polling_active = True

        def _poll_worker():
            for _ in range(60):
                if not self.polling_active or self.controller.pairing_completed:
                    break
                time.sleep(3)
                try:
                    res = self.controller.poll_pairing_status()
                    if not res.get("pending"):
                        # Dispatched to main thread
                        if self.master:
                            self.master.after(0, self._on_pairing_success)
                        break
                except Exception:
                    pass
            self.polling_active = False

        thread = threading.Thread(target=_poll_worker, daemon=True)
        thread.start()

    def _on_pairing_success(self) -> None:
        lang = self.controller.language
        if hasattr(self, "pair_status_lbl"):
            self.pair_status_lbl.config(
                text=f"{t('step4_success', lang)}\n{t('step4_keyring_saved', lang)}",
                foreground="#15803d",
            )
        self.update_nav_buttons()

    # -----------------------------------------------------------------------
    # Navigation Actions
    # -----------------------------------------------------------------------
    def go_back(self) -> None:
        if self.controller.current_step > 1:
            self.show_step(self.controller.current_step - 1)

    def go_next(self) -> None:
        step = self.controller.current_step
        allowed, error_msg = self.controller.can_advance_from_step(step)

        if not allowed:
            if messagebox:
                messagebox.showwarning(
                    t("step2_modal_title", self.controller.language),
                    error_msg or t("step2_modal_message", self.controller.language),
                )
            return

        if step < 4:
            self.show_step(step + 1)
        else:
            # Finished wizard
            self.close()
            if self.on_complete:
                self.on_complete()

    def close(self) -> None:
        self.polling_active = False
        if self.owns_master and self.master:
            self.master.destroy()

    def run(self) -> None:
        if self.owns_master and self.master:
            self.master.mainloop()


# ---------------------------------------------------------------------------
# System Tray Daemon
# ---------------------------------------------------------------------------

class SystemTrayDaemon:
    """System tray daemon using pystray with connection status HUD, unpair action, and main thread loop."""

    def __init__(
        self,
        server: Optional[str] = None,
        config_path: Optional[Path] = None,
    ):
        self.config_path = config_path or (
            Path(user_data_dir(SERVICE, appauthor=False)) / "config.json"
        )
        self.server = server or self._read_server()
        self.icon: Optional[Any] = None
        self.is_connected = False
        self.heartbeat_latency_ms: Optional[float] = None
        self.active_engines: list[str] = []
        self.device_id: Optional[str] = self._read_device_id()
        self.is_running = False
        self._poller_thread: Optional[threading.Thread] = None

        self._refresh_engines()

    def _read_server(self) -> str:
        if self.config_path.is_file():
            try:
                cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                return cfg.get("server", "http://localhost:3000")
            except Exception:
                pass
        return "http://localhost:3000"

    def _read_device_id(self) -> Optional[str]:
        if self.config_path.is_file():
            try:
                cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                return cfg.get("deviceId")
            except Exception:
                pass
        return None

    def _refresh_engines(self) -> None:
        cads = discover()
        self.active_engines = sorted(list({c.get("name") for c in cads if c.get("name")}))

    def get_status_label(self) -> str:
        lang = get_language(self.config_path)
        if self.is_connected:
            return t("tray_status_connected", lang, version=VERSION)
        return t("tray_status_disconnected", lang)

    def check_connection(self) -> bool:
        """Ping API server health endpoint and measure heartbeat latency."""
        t0 = time.time()
        try:
            url = f"{self.server}/api/health"
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                if resp.status == 200:
                    self.heartbeat_latency_ms = round((time.time() - t0) * 1000, 1)
                    self.is_connected = True
                    return True
        except Exception:
            pass
        self.is_connected = False
        self.heartbeat_latency_ms = None
        return False

    def unpair(self) -> bool:
        """Revoke device on server, wipe local credentials and config."""
        credential = None
        try:
            credential = keyring.get_password(SERVICE, self.server)
        except Exception:
            pass

        # Revoke on server
        if self.server and credential:
            try:
                url = f"{self.server}/api/agent/unpair"
                payload = json.dumps({}).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {credential}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5):
                    pass
            except Exception:
                pass

        # Purge local credentials
        try:
            keyring.delete_password(SERVICE, self.server)
        except Exception:
            pass

        cred_file = self.config_path.parent / "credential.json"
        if cred_file.is_file():
            try:
                cred_file.unlink()
            except Exception:
                pass

        if self.config_path.is_file():
            try:
                cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
                if "deviceId" in cfg:
                    del cfg["deviceId"]
                    self.config_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
            except Exception:
                pass

        self.device_id = None
        self.is_connected = False
        return True

    # -----------------------------------------------------------------------
    # Tray Action Handlers
    # -----------------------------------------------------------------------
    def on_view_pairing_code(self) -> None:
        lang = get_language(self.config_path)
        code_or_id = self.device_id or "Not paired yet"
        if messagebox and TK_AVAILABLE:
            # Use small ephemeral Tk root for dialog
            root = tk.Tk()
            root.withdraw()
            messagebox.showinfo(
                t("tray_view_pairing_code", lang),
                f"Workstation Device ID: {code_or_id}",
            )
            root.destroy()
        else:
            print(f"Device ID: {code_or_id}")

    def on_view_status_hud(self) -> None:
        self.check_connection()
        self._refresh_engines()
        lang = get_language(self.config_path)

        engines_str = ", ".join(self.active_engines) or "None detected"
        latency_str = f"{self.heartbeat_latency_ms}" if self.heartbeat_latency_ms is not None else "--"
        status_text = "Connected" if self.is_connected else "Disconnected"

        msg = (
            f"{t('hud_server_url', lang, url=self.server)}\n"
            f"{t('hud_hostname', lang, hostname=platform.node())}\n"
            f"{t('hud_device_id', lang, device_id=self.device_id or 'None')}\n"
            f"{t('hud_active_engines', lang, engines=engines_str)}\n"
            f"{t('hud_latency', lang, latency=latency_str)}\n"
            f"{t('hud_status', lang, status=status_text)}"
        )

        if messagebox and TK_AVAILABLE:
            root = tk.Tk()
            root.withdraw()
            messagebox.showinfo(t("hud_title", lang), msg)
            root.destroy()
        else:
            print(f"--- Connection Status HUD ---\n{msg}")

    def on_open_dashboard(self) -> None:
        webbrowser.open(self.server)

    def on_unpair_device(self) -> None:
        lang = get_language(self.config_path)
        confirmed = True
        if messagebox and TK_AVAILABLE:
            root = tk.Tk()
            root.withdraw()
            confirmed = messagebox.askyesno(
                t("unpair_confirm_title", lang),
                t("unpair_confirm_message", lang),
            )
            root.destroy()

        if confirmed:
            self.unpair()
            if messagebox and TK_AVAILABLE:
                root = tk.Tk()
                root.withdraw()
                messagebox.showinfo(t("unpair_confirm_title", lang), t("unpair_success", lang))
                root.destroy()

    def on_exit(self) -> None:
        self.is_running = False
        if self.icon:
            self.icon.stop()

    def build_menu(self) -> Any:
        if not PYSTRAY_AVAILABLE:
            return None

        return pystray.Menu(
            pystray.MenuItem(lambda item: self.get_status_label(), lambda: None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda item: t("tray_view_pairing_code", get_language(self.config_path)), lambda: self.on_view_pairing_code()),
            pystray.MenuItem(lambda item: t("tray_view_status", get_language(self.config_path)), lambda: self.on_view_status_hud()),
            pystray.MenuItem(lambda item: t("tray_open_dashboard", get_language(self.config_path)), lambda: self.on_open_dashboard()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(lambda item: t("tray_unpair", get_language(self.config_path)), lambda: self.on_unpair_device()),
            pystray.MenuItem(lambda item: t("tray_exit", get_language(self.config_path)), lambda: self.on_exit()),
        )

    def _background_poller(self) -> None:
        while self.is_running:
            self.check_connection()
            time.sleep(15)

    def run(self) -> None:
        """Run the system tray icon on the main thread (thread safety guarantee)."""
        if not PYSTRAY_AVAILABLE:
            raise RuntimeError("pystray is not installed.")

        image = get_tray_icon_image()
        if not image:
            raise RuntimeError("Could not generate or load tray icon image.")

        self.is_running = True
        self._poller_thread = threading.Thread(target=self._background_poller, daemon=True)
        self._poller_thread.start()

        menu = self.build_menu()
        self.icon = pystray.Icon("cadengine", image, "CAD Engine", menu=menu)

        # Runs synchronously on current (main) thread
        self.icon.run()
