"""File integrity and anti-corruption validation gates.

Enforces deep binary STL structural and coordinate validation, native CAD
and 3D magic header verification (DWG, FCStd, Blend), and pre-delivery
integrity checks.
"""
from __future__ import annotations

import io
import math
import os
from pathlib import Path
import re
import struct
import zipfile
from typing import BinaryIO, Union

STL_HEADER_BYTES = 84
STL_FACET_BYTES = 50
MAX_COORDINATE = 100000.0
MIN_COORDINATE = -100000.0
CHUNK_FACETS = 1000

DWG_SIGNATURES = {
    b"AC1015",  # AutoCAD 2000
    b"AC1018",  # AutoCAD 2004
    b"AC1021",  # AutoCAD 2007
    b"AC1024",  # AutoCAD 2010
    b"AC1027",  # AutoCAD 2013
    b"AC1032",  # AutoCAD 2018-2026
}

BLEND_MAGIC_REGEX = re.compile(rb"^BLENDER[-_][vV][0-9]{3}$")
ZIP_MAGIC = b"PK\x03\x04"


def _get_size_and_reader(
    source: Union[str, Path, bytes, BinaryIO],
) -> tuple[int, BinaryIO, bool]:
    """Returns (total_size, file_like_stream, should_close)."""
    if isinstance(source, (str, Path)):
        p = Path(source)
        if not p.is_file():
            raise FileNotFoundError(f"File not found: {source}")
        size = p.stat().st_size
        return size, open(p, "rb"), True
    elif isinstance(source, (bytes, bytearray, memoryview)):
        data = bytes(source)
        return len(data), io.BytesIO(data), True
    elif hasattr(source, "read") and hasattr(source, "seek"):
        current = source.tell()
        source.seek(0, io.SEEK_END)
        size = source.tell()
        source.seek(current, io.SEEK_SET)
        return size, source, False
    else:
        raise TypeError(f"Unsupported source type for integrity check: {type(source)}")


def _read_header_bytes(source: Union[str, Path, bytes, BinaryIO], count: int) -> bytes:
    if isinstance(source, (str, Path)):
        p = Path(source)
        if not p.is_file():
            raise FileNotFoundError(f"File not found: {source}")
        with open(p, "rb") as f:
            return f.read(count)
    elif isinstance(source, (bytes, bytearray, memoryview)):
        return bytes(source[:count])
    elif hasattr(source, "read") and hasattr(source, "seek"):
        pos = source.tell()
        source.seek(0, io.SEEK_SET)
        data = source.read(count)
        source.seek(pos, io.SEEK_SET)
        return data
    else:
        raise TypeError(f"Unsupported source type: {type(source)}")


def validate_binary_stl(
    source: Union[str, Path, bytes, BinaryIO],
    max_bytes: int | None = None,
) -> int:
    """Validates binary STL structure and coordinates.

    Requirements:
    1. Size >= 84 bytes (80-byte header + 4-byte little-endian facet count N).
    2. Header does NOT start with ASCII 'solid '.
    3. Strict size formula: FileSize == 84 + (50 * N).
    4. All 12 floats per facet are finite (no NaN, +Infinity, -Infinity).
    5. Vertex coordinates fall within [-100000.0, 100000.0] mm bounds.
    6. If N > 0, mesh must not contain solely (0, 0, 0) vertex coordinates.

    Returns the facet count N on success.
    Raises ValueError on validation failure.
    """
    size, stream, should_close = _get_size_and_reader(source)
    try:
        if max_bytes is not None and size > max_bytes:
            raise ValueError(f"Binary STL exceeds maximum allowable size ({size} > {max_bytes} bytes)")

        if size < STL_HEADER_BYTES:
            raise ValueError(f"Binary STL file is too small ({size} bytes, minimum {STL_HEADER_BYTES})")

        stream.seek(0)
        header = stream.read(STL_HEADER_BYTES)
        if len(header) < STL_HEADER_BYTES:
            raise ValueError("Failed to read complete binary STL header")

        if header[:6] == b"solid ":
            raise ValueError('Binary STL cannot start with ASCII "solid " keyword')

        facet_count = struct.unpack_from("<I", header, 80)[0]
        expected_size = STL_HEADER_BYTES + STL_FACET_BYTES * facet_count

        if size != expected_size:
            raise ValueError(
                f"Binary STL size mismatch: expected {expected_size} bytes for {facet_count} facets, but got {size} bytes"
            )

        if facet_count == 0:
            return 0

        has_nonzero_coord = False
        facets_read = 0

        while facets_read < facet_count:
            to_read = min(CHUNK_FACETS, facet_count - facets_read)
            chunk_bytes = stream.read(to_read * STL_FACET_BYTES)
            if len(chunk_bytes) != to_read * STL_FACET_BYTES:
                raise ValueError("Unexpected end of file while reading facet coordinates")

            for i in range(to_read):
                offset = i * STL_FACET_BYTES
                floats = struct.unpack_from("<12f", chunk_bytes, offset)

                for f_idx, val in enumerate(floats):
                    if not math.isfinite(val):
                        raise ValueError(
                            f"Binary STL contains non-finite float coordinate ({val}) at facet {facets_read + i}"
                        )

                # Vertex coordinates are floats[3:12] (9 values: v1x,v1y,v1z, v2x,v2y,v2z, v3x,v3y,v3z)
                for v_idx in range(3, 12):
                    coord = floats[v_idx]
                    if coord < MIN_COORDINATE or coord > MAX_COORDINATE:
                        raise ValueError(
                            f"Binary STL vertex coordinate {coord} out of engineering bounds "
                            f"[{MIN_COORDINATE}, {MAX_COORDINATE}] mm at facet {facets_read + i}"
                        )
                    if coord != 0.0:
                        has_nonzero_coord = True

            facets_read += to_read

        if facet_count > 0 and not has_nonzero_coord:
            raise ValueError("Binary STL contains degenerate all-zero geometry")

        return facet_count
    finally:
        if should_close:
            stream.close()


def validate_dwg(source: Union[str, Path, bytes, BinaryIO]) -> str:
    """Validates AutoCAD DWG magic header bytes.

    First 6 bytes must match one of AC1015, AC1018, AC1021, AC1024, AC1027, AC1032.
    Returns the release signature string on success.
    Raises ValueError on validation failure.
    """
    header = _read_header_bytes(source, 6)
    if len(header) < 6:
        raise ValueError("DWG file is too small (minimum 6 bytes)")
    magic = header[:6]
    if magic not in DWG_SIGNATURES:
        raise ValueError(f"Invalid DWG signature: {magic!r}")
    return magic.decode("ascii")


def validate_fcstd(source: Union[str, Path, bytes, BinaryIO]) -> bool:
    """Validates FreeCAD FCStd ZIP archive and internal Document.xml entry.

    Bytes 0-3 must be PK\\x03\\x04 and the archive must contain Document.xml.
    Returns True on success.
    Raises ValueError on validation failure.
    """
    header = _read_header_bytes(source, 4)
    if len(header) < 4 or header[:4] != ZIP_MAGIC:
        raise ValueError("Invalid FCStd file: missing ZIP magic bytes PK\\x03\\x04")

    try:
        if isinstance(source, (str, Path)):
            with zipfile.ZipFile(source, "r") as zf:
                namelist = zf.namelist()
        elif isinstance(source, (bytes, bytearray, memoryview)):
            with zipfile.ZipFile(io.BytesIO(bytes(source)), "r") as zf:
                namelist = zf.namelist()
        elif hasattr(source, "read") and hasattr(source, "seek"):
            pos = source.tell()
            source.seek(0, io.SEEK_SET)
            with zipfile.ZipFile(source, "r") as zf:
                namelist = zf.namelist()
            source.seek(pos, io.SEEK_SET)
        else:
            raise TypeError(f"Unsupported source type: {type(source)}")

        if "Document.xml" not in namelist:
            raise ValueError("Invalid FCStd archive: missing Document.xml entry")
    except zipfile.BadZipFile as e:
        raise ValueError(f"Invalid FCStd archive: corrupt ZIP structure ({e})") from e

    return True


def validate_blend(source: Union[str, Path, bytes, BinaryIO]) -> str:
    """Validates Blender blend magic header bytes.

    First 12 bytes must match regex ^BLENDER[-_][vV][0-9]{3}$.
    Returns the signature string on success.
    Raises ValueError on validation failure.
    """
    header = _read_header_bytes(source, 12)
    if len(header) < 12:
        raise ValueError("Blend file is too small (minimum 12 bytes)")
    magic = header[:12]
    if not BLEND_MAGIC_REGEX.match(magic):
        raise ValueError(f"Invalid Blender blend header signature: {magic!r}")
    return magic.decode("ascii", errors="replace")


def validate_cad_format(
    source: Union[str, Path, bytes, BinaryIO],
    cad_format: str,
) -> Union[str, bool, int]:
    """Validates a file or buffer against the specified CAD format."""
    fmt = cad_format.lower().lstrip(".")
    if fmt == "stl":
        return validate_binary_stl(source)
    elif fmt == "dwg":
        return validate_dwg(source)
    elif fmt == "fcstd":
        return validate_fcstd(source)
    elif fmt == "blend":
        return validate_blend(source)
    else:
        raise ValueError(f"Unsupported CAD format for integrity validation: {cad_format}")


def validate_file_integrity(file_path: Union[str, Path]) -> Union[str, bool, int]:
    """Auto-detects format from file extension and validates integrity."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {file_path}")
    ext = path.suffix.lower().lstrip(".")
    return validate_cad_format(path, ext)
