# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Local/offline provider for tests and dry runs: produces a short silent WAV so the whole pipeline
(pronunciation lookup -> request -> cache -> file naming -> book JSON wiring) can be exercised without keys.
Never use its output as learning audio."""
from __future__ import annotations

import struct

from ..core import AudioResult, TTSProvider, TTSRequest, Voice


def silent_wav(seconds: float = 0.4, rate: int = 16000) -> bytes:
    n = int(seconds * rate)
    data = b"\x00\x00" * n
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(data))
    return hdr + data


class LocalProvider(TTSProvider):
    id = "local"
    default_voice = {"en-GB": "silent", "en-US": "silent"}
    supports_ssml = False
    supports_ipa = False
    supports_lexicon = False

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        # length scales with text so duration bookkeeping is testable
        secs = 0.25 + 0.06 * len(req.text.split()) / (0.6 if req.speed == "very_slow" else 0.8 if req.speed == "slow" else 1.0)
        return AudioResult(silent_wav(secs), "audio/wav", self.id, voice, duration_s=secs)

    def get_voices(self) -> list[Voice]:
        return [Voice("silent", "Silent test voice", "en-GB", "", "standard", False, False, "test only")]
