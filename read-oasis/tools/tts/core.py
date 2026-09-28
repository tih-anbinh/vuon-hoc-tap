# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Provider-independent TTS interface for Read Oasis (mirrors the TypeScript shape in the brief).

    TTSProvider.synthesize(TTSRequest) -> AudioResult
    TTSProvider.get_voices()           -> list[Voice]

Runs at content-build time (parent machine / CI), never in the child's browser: keys stay private,
the child app stays offline and third-party-free, and every clip is rendered once and cached.
Provider is chosen by TTS_PROVIDER=azure|google|elevenlabs|openai|polly|watson|local (see registry()).
"""
from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from typing import Literal, Optional

Locale = Literal["en-GB", "en-US"]
Alphabet = Literal["ipa", "x-sampa", "sapi"]
AudioFormat = Literal["mp3", "ogg", "wav"]
Speed = Literal["very_slow", "slow", "normal"]

# One place that maps our three learner speeds to a relative rate. Providers translate as they can.
SPEED_RATE = {"very_slow": 0.6, "slow": 0.8, "normal": 1.0}


@dataclass(frozen=True)
class PronunciationConfig:
    ipa: Optional[str] = None            # e.g. "ˈwɔː.tə" (no slashes)
    phoneme: Optional[str] = None        # provider-specific string when alphabet != ipa
    alphabet: Alphabet = "ipa"
    # word-level substitutions applied to `text` before synthesis: {"schedule": "shed-yool"} (last resort)
    substitutions: dict = field(default_factory=dict)


@dataclass(frozen=True)
class TTSRequest:
    text: str
    language: Locale = "en-GB"
    voice: Optional[str] = None          # provider voice id; None -> provider default for language
    speed: Speed = "normal"
    pronunciation: Optional[PronunciationConfig] = None
    format: AudioFormat = "mp3"
    style: Optional[str] = None          # provider style hint (Azure mstts:express-as), ignored elsewhere

    def cache_key(self, provider: str, voice: str) -> str:
        """SHA256(provider + voice + locale + text + pronunciation + speed + format), hex."""
        pron = dataclasses.asdict(self.pronunciation) if self.pronunciation else None
        blob = json.dumps({"p": provider, "v": voice, "l": self.language, "t": self.text, "pr": pron,
                           "s": self.speed, "f": self.format, "st": self.style}, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()


@dataclass
class AudioResult:
    audio_bytes: bytes
    content_type: str                    # "audio/mpeg" | "audio/ogg" | "audio/wav"
    provider: str
    voice: str
    duration_s: Optional[float] = None
    cached: bool = False
    request: Optional[TTSRequest] = None


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    locale: str
    gender: str = ""
    kind: str = "neural"                 # neural | hd | child | standard
    child_voice: bool = False
    supports_phoneme: bool = False       # true if <phoneme alphabet="ipa"> (or equivalent) is honoured
    notes: str = ""


class TTSError(RuntimeError):
    pass


class TTSProvider:
    """Base class. Subclasses implement _synthesize() and get_voices(); this class adds caching."""
    id = "base"
    default_voice = {"en-GB": "", "en-US": ""}
    supports_ssml = False
    supports_ipa = False
    supports_lexicon = False

    def __init__(self, cache_dir: Optional[str] = None):
        self.cache_dir = cache_dir or os.environ.get("TTS_CACHE_DIR") or os.path.join(os.path.dirname(__file__), "..", "..", ".tts-cache")

    # ---- public API
    def synthesize(self, req: TTSRequest) -> AudioResult:
        voice = req.voice or self.default_voice.get(req.language) or ""
        key = req.cache_key(self.id, voice)
        hit = self._cache_get(key, req.format)
        if hit is not None:
            return AudioResult(hit, content_type_for(req.format), self.id, voice, cached=True, request=req)
        res = self._synthesize(req, voice)
        res.request = req
        self._cache_put(key, req.format, res.audio_bytes, req, voice)
        return res

    def get_voices(self) -> list[Voice]:
        raise NotImplementedError

    # ---- to implement
    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        raise NotImplementedError

    # ---- helpers shared by SSML providers
    @staticmethod
    def apply_substitutions(text: str, pron: Optional[PronunciationConfig]) -> str:
        if not pron or not pron.substitutions:
            return text
        for word, spoken in pron.substitutions.items():
            text = re.sub(r"\b" + re.escape(word) + r"\b", spoken, text, flags=re.I)
        return text

    @staticmethod
    def ssml_escape(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    # ---- cache
    def _cache_path(self, key: str, fmt: str) -> str:
        return os.path.join(self.cache_dir, key[:2], f"{key}.{fmt}")

    def _cache_get(self, key: str, fmt: str) -> Optional[bytes]:
        p = self._cache_path(key, fmt)
        if os.path.isfile(p):
            with open(p, "rb") as f:
                return f.read()
        return None

    def _cache_put(self, key: str, fmt: str, data: bytes, req: TTSRequest, voice: str) -> None:
        p = self._cache_path(key, fmt)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
        meta = {"provider": self.id, "voice": voice, "language": req.language, "text": req.text, "speed": req.speed,
                "pronunciation": dataclasses.asdict(req.pronunciation) if req.pronunciation else None, "format": req.format}
        with open(p + ".json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)


def content_type_for(fmt: str) -> str:
    return {"mp3": "audio/mpeg", "ogg": "audio/ogg", "wav": "audio/wav"}[fmt]


def registry() -> dict:
    """Lazy import so a missing SDK for one provider does not break the others."""
    from .providers import azure, elevenlabs, google, local, openai_tts, polly, watson  # noqa: WPS433
    return {"azure": azure.AzureProvider, "google": google.GoogleProvider, "elevenlabs": elevenlabs.ElevenLabsProvider,
            "openai": openai_tts.OpenAIProvider, "polly": polly.PollyProvider, "watson": watson.WatsonProvider,
            "local": local.LocalProvider}


def get_provider(name: Optional[str] = None, **kw) -> TTSProvider:
    name = (name or os.environ.get("TTS_PROVIDER") or "azure").lower()
    reg = registry()
    if name not in reg:
        raise TTSError(f"unknown TTS_PROVIDER '{name}'; choose one of {', '.join(sorted(reg))}")
    return reg[name](**kw)
