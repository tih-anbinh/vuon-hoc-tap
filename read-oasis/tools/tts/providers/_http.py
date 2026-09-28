# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Tiny stdlib HTTP helper so the TTS tools need no third-party packages."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from ..core import TTSError


def post(url: str, body: bytes | dict, headers: dict, timeout: int = 60) -> tuple[bytes, dict]:
    if isinstance(body, dict):
        body = json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json", **headers}
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        detail = e.read()[:500].decode("utf-8", "replace")
        raise TTSError(f"HTTP {e.code} from {url}: {detail}") from None
    except urllib.error.URLError as e:
        raise TTSError(f"network error calling {url}: {e.reason}") from None


def get(url: str, headers: dict, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise TTSError(f"HTTP {e.code} from {url}: {e.read()[:300].decode('utf-8', 'replace')}") from None
    except urllib.error.URLError as e:
        raise TTSError(f"network error calling {url}: {e.reason}") from None


def need_env(name: str) -> str:
    import os
    v = os.environ.get(name)
    if not v:
        raise TTSError(f"environment variable {name} is required for this provider")
    return v
