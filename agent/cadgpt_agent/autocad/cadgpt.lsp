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

;; Civil 3D cross-section solid (road embankment, channel, levee): a
;; trapezoid centred on X with `bw` bottom width, `tw` top width and `h`
;; height, swept `len` along +Y from the base point. The profile is drawn in
;; the XY plane, extruded along +Z, rotated +90 degrees about the X axis
;; through the base point (profile height -> +Z, extrusion -> -Y), then moved
;; `len` along +Y so the solid spans [y, y + len].
(defun cadgpt-extrude-cross-section (bw tw h len x y z)
  (command "_PLINE"
           (cadgpt-pt (- x (/ bw 2.0)) y z)
           (cadgpt-pt (+ x (/ bw 2.0)) y z)
           (cadgpt-pt (+ x (/ tw 2.0)) (+ y h) z)
           (cadgpt-pt (- x (/ tw 2.0)) (+ y h) z)
           "_C")
  (command "_EXTRUDE" (entlast) "" (rtos len 2 8))
  (command "_ROTATE3D" (entlast) "" "_X" (cadgpt-pt x y z) "90")
  (command "_MOVE" (entlast) "" "0,0,0" (cadgpt-pt 0.0 len 0.0))
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

;; 2D drafting: layer selection, polylines, circles, deletion. Every
;; argument is a number, a validated layer name ([A-Za-z0-9_-]) or a
;; validated hex handle, rendered by `strategies/autocad.py`.
(defun cadgpt-set-layer (layer)
  (if layer
    (command "_.-LAYER" "_M" layer "")
  )
)

;; Polyline through `pts` (a list of (x y) pairs) at elevation `elev`;
;; `closed` is 1 to close it, 0 to leave it open.
(defun cadgpt-draw-polyline (pts closed elev layer)
  (cadgpt-set-layer layer)
  (command "_.PLINE")
  (foreach p pts
    (command (cadgpt-pt (car p) (cadr p) elev))
  )
  (if (= closed 1)
    (command "_C")
    (command "")
  )
)

(defun cadgpt-draw-circle (r x y elev layer)
  (cadgpt-set-layer layer)
  (command "_.CIRCLE" (cadgpt-pt x y elev) (rtos r 2 8))
)

(defun cadgpt-delete (h)
  (setq e (handent h))
  (if e
    (command "_.ERASE" e "")
  )
)

;; JSON helpers for the scene dump. Layer names are user data, so quotes,
;; backslashes and control characters are escaped. Escaping stops before the
;; output would pass `limit` characters, so a cap never splits an escape
;; sequence (the server rejects entries whose label exceeds 64).
(defun cadgpt-json-escape (str limit / out i c piece)
  (setq out "" i 1)
  (while (<= i (strlen str))
    (setq c (substr str i 1))
    (setq piece
      (cond
        ((= c "\"") "\\\"")
        ((= c "\\") "\\\\")
        ((< (ascii c) 32) " ")
        (t c)
      )
    )
    (if (> (+ (strlen out) (strlen piece)) limit)
      (setq i (1+ (strlen str)))
      (setq out (strcat out piece) i (1+ i))
    )
  )
  out
)

(defun cadgpt-num (n) (rtos n 2 6))

(defun cadgpt-bbox-json (x1 y1 z1 x2 y2 z2)
  (strcat "[" (cadgpt-num (min x1 x2)) ", " (cadgpt-num (min y1 y2)) ", " (cadgpt-num (min z1 z2))
          ", " (cadgpt-num (max x1 x2)) ", " (cadgpt-num (max y1 y2)) ", " (cadgpt-num (max z1 z2)) "]")
)

;; Bounding box from DXF data only (no ActiveX). 3D solids keep a zero box:
;; their extents are not exposed through `entget`.
(defun cadgpt-entity-bbox (d tname / p q r xs ys elev)
  (cond
    ((= tname "LINE")
     (setq p (cdr (assoc 10 d)) q (cdr (assoc 11 d)))
     (cadgpt-bbox-json (car p) (cadr p) (caddr p) (car q) (cadr q) (caddr q)))
    ((or (= tname "CIRCLE") (= tname "ARC"))
     (setq p (cdr (assoc 10 d)) r (cdr (assoc 40 d)))
     (cadgpt-bbox-json (- (car p) r) (- (cadr p) r) (caddr p) (+ (car p) r) (+ (cadr p) r) (caddr p)))
    ((= tname "LWPOLYLINE")
     (setq elev (cond ((cdr (assoc 38 d))) (0.0)))
     (foreach g d
       (if (= (car g) 10)
         (setq xs (cons (cadr g) xs) ys (cons (caddr g) ys))
       )
     )
     (cadgpt-bbox-json (apply 'min xs) (apply 'min ys) elev (apply 'max xs) (apply 'max ys) elev))
    ((or (= tname "TEXT") (= tname "MTEXT") (= tname "POINT"))
     (setq p (cdr (assoc 10 d)))
     (cadgpt-bbox-json (car p) (cadr p) (caddr p) (car p) (cadr p) (caddr p)))
    (t "[0.0, 0.0, 0.0, 0.0, 0.0, 0.0]")
  )
)

;; Scene read: pure AutoLISP object enumeration (no ActiveX/vlax-*).
;; Lists model-space 3D solids and 2D entities with their hex handle (the
;; address every edit op uses), layer, type and DXF-derived bounding box.
(defun cadgpt-read-scene (out-path / ss f i n ent d h tname layer comma)
  (setq ss (ssget "_X" '((0 . "3DSOLID,LINE,LWPOLYLINE,CIRCLE,ARC,TEXT,MTEXT,POINT") (410 . "Model"))))
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
            (setq layer (cadgpt-json-escape (cdr (assoc 8 d)) 60))
            (setq comma (if (< i (1- n)) "," ""))
            (write-line (strcat "  {\"name\": \"" h "\", \"label\": \"" layer "\", \"type\": \"" tname
                                "\", \"bbox\": " (cadgpt-entity-bbox d tname) ", \"volume\": 0.0}" comma) f)
            (setq i (1+ i))
          )
        )
      )
      (write-line "]" f)
      (close f)
    )
  )
)
