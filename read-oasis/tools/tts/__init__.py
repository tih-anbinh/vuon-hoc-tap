# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Read Oasis TTS layer: pronunciation data (source of truth) -> provider-independent renderer -> cached audio."""
from .core import AudioResult, PronunciationConfig, TTSError, TTSProvider, TTSRequest, Voice, get_provider  # noqa: F401
from .pronunciation import Pronunciation, card  # noqa: F401
