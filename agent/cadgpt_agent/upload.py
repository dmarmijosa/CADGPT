"""Uploads the STL preview mesh produced by a successful CAD job.

Mirrors `main.py`'s `request()` helper: same no-redirect opener discipline so
the device credential is never forwarded to another origin, and the same
device-credential bearer scheme used by `/api/agent/poll` and
`/api/agent/results/:id` (spec mesh-preview-upload "Device-Authenticated
Upload"; design D9, `apps/api/src/mesh.ts`).
"""
import hashlib
import struct
import urllib.error
import urllib.request

# Mirrors the server-side caps in `apps/api/src/mesh.ts` so a mesh the server
# will reject is never sent over the wire in the first place.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MiB per file
STL_HEADER_BYTES = 84  # 80-byte header + 4-byte little-endian facet count
STL_FACET_BYTES = 50
CHUNK_SIZE = 65536


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse redirects so the device credential cannot be forwarded to another origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _sha256_and_size(path):
    """Stream the file once to compute its size and sha256, and capture the
    binary STL header bytes for the local sanity check below. Never reads the
    whole file into a single in-memory buffer beyond one `CHUNK_SIZE` chunk."""
    size = 0
    header = b""
    hasher = hashlib.sha256()
    with open(path, "rb") as stream:
        while True:
            chunk = stream.read(CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            if len(header) < STL_HEADER_BYTES:
                header += chunk[: STL_HEADER_BYTES - len(header)]
            hasher.update(chunk)
    return size, header, hasher.hexdigest()


def _validate_binary_stl(size, header):
    """Refuse locally (mirrors `isBinaryStl` in `apps/api/src/mesh.ts`) so a
    file the server would reject is never uploaded."""
    if size > MAX_UPLOAD_BYTES:
        raise ValueError("Mesh exceeds the 25 MiB upload cap")
    if len(header) < STL_HEADER_BYTES:
        raise ValueError("Mesh is not a valid binary STL file")
    facets = struct.unpack_from("<I", header, 80)[0]
    if size != STL_HEADER_BYTES + STL_FACET_BYTES * facets:
        raise ValueError("Mesh is not a valid binary STL file")


def upload_mesh(server, job_id, credential, path, opener=None):
    """POST the STL at `path` to `<server>/api/agent/jobs/<job_id>/mesh`.

    Raises `ValueError` (local refusal, no network call) when the file is
    oversized or not a plausible binary STL, or `urllib.error.URLError` /
    `OSError` on a network or server-side failure. Callers report the failure
    as a "preview unavailable" note rather than failing the whole job.
    """
    size, header, digest = _sha256_and_size(path)
    _validate_binary_stl(size, header)
    headers = {
        "Authorization": "Bearer " + credential,
        "Content-Type": "application/octet-stream",
        "Content-Length": str(size),
        "X-Mesh-Sha256": digest,
    }
    url = server + "/api/agent/jobs/" + job_id + "/mesh"
    build_opener = opener if opener is not None else urllib.request.build_opener(NoRedirect)
    with open(path, "rb") as stream:
        req = urllib.request.Request(url, data=stream, headers=headers, method="POST")
        with build_opener.open(req, timeout=60) as response:
            response.read()
