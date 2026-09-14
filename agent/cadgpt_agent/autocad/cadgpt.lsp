;;; cadgpt.lsp — AutoLISP primitives invoked by CADGPT's rendered .scr scripts.
;;;
;;; Core AutoLISP only: no `vlax-*`/`vla-*`/ActiveX, since those are
;;; unavailable in AutoCAD Core Console (research A3). Every function is a
;;; plain function (not a `c:`-prefixed command) and is invoked as a Lisp
;;; expression from a rendered `.scr`, e.g.:
;;;   (load "C:/path/to/cadgpt.lsp")
;;;   (cadgpt-create-box 10.0 20.0 30.0 0.0 0.0 0.0)
;;;
;;; Every `command` call uses `_`-prefixed command names and keywords to
;;; force the English/global command set regardless of the AutoCAD UI
;;; language (verified against a live Spanish-locale AutoCAD 2026 host).
;;; Only already-validated numbers ever reach these functions: the caller
;;; (`agent/cadgpt_agent/strategies/autocad.py`) rejects anything
;;; non-finite or out of bounds before rendering the script that calls them.

(defun cadgpt-pt (x y z)
  (strcat (rtos x 2 8) "," (rtos y 2 8) "," (rtos z 2 8))
)

;; Box solid: base corner, opposite base corner (same Z), then height.
(defun cadgpt-create-box (l w h x y z)
  (command "_BOX"
           (cadgpt-pt x y z)
           (cadgpt-pt (+ x l) (+ y w) z)
           (rtos h 2 8))
)

;; Cylinder: base center point, base radius, height.
(defun cadgpt-create-cylinder (r h x y z)
  (command "_CYLINDER"
           (cadgpt-pt x y z)
           (rtos r 2 8)
           (rtos h 2 8))
)

;; Sphere: center point, radius.
(defun cadgpt-create-sphere (r x y z)
  (command "_SPHERE"
           (cadgpt-pt x y z)
           (rtos r 2 8))
)

;; Cone: base center point, base radius, then either a plain height (when
;; the top radius is zero, i.e. a true cone/apex) or the "_T" (Top radius)
;; option followed by the top radius and the height (a frustum).
(defun cadgpt-create-cone (r1 r2 h x y z)
  (if (> r2 0.0)
    (command "_CONE"
             (cadgpt-pt x y z)
             (rtos r1 2 8)
             "_T"
             (rtos r2 2 8)
             (rtos h 2 8))
    (command "_CONE"
             (cadgpt-pt x y z)
             (rtos r1 2 8)
             (rtos h 2 8))
  )
)

;; Extruded rectangle: the caller already remaps (width, height, depth) onto
;; (length, width, height) per the extrusion plane (XY/XZ/YZ), so this is a
;; box under a distinct, self-documenting name for the audit trail.
(defun cadgpt-extrude-rect (l w h x y z)
  (cadgpt-create-box l w h x y z)
)
