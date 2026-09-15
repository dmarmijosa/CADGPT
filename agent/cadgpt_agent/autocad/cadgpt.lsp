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

;; Boolean operations: entity handles are hex strings validated by the caller.
;; Uses global _.SUBTRACT / _.UNION / _.INTERSECT with explicit selection
;; termination ("", proven in live Spike A).
(defun cadgpt-boolean-cut (base-h tool-h)
  (setq e1 (handent base-h))
  (setq e2 (handent tool-h))
  (if (and e1 e2)
    (command "_.SUBTRACT" e1 "" e2 "")
  )
)

(defun cadgpt-boolean-union (base-h tool-h)
  (setq e1 (handent base-h))
  (setq e2 (handent tool-h))
  (if (and e1 e2)
    (command "_.UNION" e1 e2 "")
  )
)

(defun cadgpt-boolean-intersect (base-h tool-h)
  (setq e1 (handent base-h))
  (setq e2 (handent tool-h))
  (if (and e1 e2)
    (command "_.INTERSECT" e1 e2 "")
  )
)

;; Transform operations: entity handles are hex strings validated by the caller.
;; Uses global _.MOVE / _.ROTATE3D / _.SCALE with explicit selection
;; termination ("", proven in live Spike A).
(defun cadgpt-translate (h dx dy dz)
  (setq e (handent h))
  (if e
    (command "_.MOVE" e "" "0,0,0" (cadgpt-pt dx dy dz))
  )
)

(defun cadgpt-rotate (h axis deg cx cy cz)
  (setq e (handent h))
  (if e
    (command "_.ROTATE3D" e "" (strcat "_" axis) (cadgpt-pt cx cy cz) (rtos deg 2 8))
  )
)

(defun cadgpt-scale (h factor cx cy cz)
  (setq e (handent h))
  (if e
    (command "_.SCALE" e "" (cadgpt-pt cx cy cz) (rtos factor 2 8))
  )
)

;; Scene read: pure AutoLISP object enumeration (no ActiveX/vlax-*).
;; Iterates 3DSOLID entities, extracts hex handles, and dumps JSON to out-path.
(defun cadgpt-read-scene (out-path)
  (setq ss (ssget "_X" '((0 . "3DSOLID"))))
  (setq f (open out-path "w"))
  (if f
    (progn
      (write-line "[" f)
      (if ss
        (progn
          (setq i 0)
          (setq n (sslength ss))
          (while (< i n)
            (setq ent (ssname ss i))
            (setq d (entget ent))
            (setq h (cdr (assoc 5 d)))
            (setq tname (cdr (assoc 0 d)))
            (setq comma (if (< i (1- n)) "," ""))
            (write-line (strcat "  {\"name\": \"" h "\", \"label\": \"" h "\", \"type\": \"" tname "\", \"bbox\": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], \"volume\": 0.0}" comma) f)
            (setq i (1+ i))
          )
        )
      )
      (write-line "]" f)
      (close f)
    )
  )
)


