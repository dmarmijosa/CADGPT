"""Executed by FreeCADCmd's own Python, not the bundled agent interpreter."""
import json
import os
from pathlib import Path
import FreeCAD
import Part

directory = Path(os.environ["CADGPT_JOB_DIR"])
data = json.loads((directory / "request.json").read_text(encoding="utf-8"))
document = FreeCAD.newDocument("CADGPTBox")
obj = document.addObject("Part::Feature", "Box")
obj.Shape = Part.makeBox(data["length"], data["width"], data["height"])
document.recompute()
document.saveAs(str(directory / "box.FCStd"))
Part.export([obj], str(directory / "box.step"))
FreeCAD.closeDocument(document.Name)
