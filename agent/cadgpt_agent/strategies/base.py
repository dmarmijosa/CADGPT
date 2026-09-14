"""Strategy seam between the executor and each CAD's argv/artifact shape.

A strategy only describes how to build a command line and which artifacts an
operation produces. It never spawns a process, never resolves paths outside
what the executor already validated, and never runs with `shell=True`.
"""
from pathlib import Path
from typing import Protocol, TypedDict


class Artifacts(TypedDict, total=False):
    native: Path
    mesh: Path | None
    scene: Path | None


class CadStrategy(Protocol):
    kind: str

    def supports(self, op: str) -> bool:
        """Return True when this strategy can run the given operation name."""
        ...

    def build_argv(self, cad_path: Path, job_dir: Path, doc_dir: Path | None) -> list[str]:
        """Return the fixed, allowlisted argv used to invoke this CAD. No shell."""
        ...

    def env(self, base: dict[str, str]) -> dict[str, str]:
        """Return the process environment, derived from the executor's sanitized base."""
        ...

    def artifacts(self, op: str, job_dir: Path, doc_dir: Path | None) -> Artifacts:
        """Return the expected output paths for the given operation."""
        ...
