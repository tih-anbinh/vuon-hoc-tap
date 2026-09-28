# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""OpenAI TTS (gpt-4o-mini-tts) - benchmark provider.

Env:  OPENAI_API_KEY, optional OPENAI_TTS_MODEL (default gpt-4o-mini-tts), OPENAI_TTS_VOICE (default "fable")
REST: https://api.openai.com/v1/audio/speech
Docs: https://platform.openai.com/docs/guides/text-to-speech
Accent: NO native en-GB voice. Accent comes from the `instructions` prompt (gpt-4o-mini-tts only) and is
not guaranteed word-to-word; no SSML, no IPA, no lexicon. Only word substitution is possible. Treated as a
"prompted accent" provider in the benchmark, per the brief's warning.
"""
from __future__ import annotations

import os

from ..core import SPEED_RATE, AudioResult, TTSProvider, TTSRequest, Voice, content_type_for
from ._http import need_env, post

INSTRUCTIONS = {
    "en-GB": "Speak in clear, standard British English (Received Pronunciation) suitable for a young child learning English. "
             "Use careful, accurate pronunciation of every word, natural British rhythm and intonation, and a calm, moderate pace. "
             "Do not add words, sounds or expressions that are not in the text.",
    "en-US": "Speak in clear, standard American English suitable for a young child learning English. Careful pronunciation, calm moderate pace.",
}


class OpenAIProvider(TTSProvider):
    id = "openai"
    default_voice = {"en-GB": os.environ.get("OPENAI_TTS_VOICE", "fable"), "en-US": os.environ.get("OPENAI_TTS_VOICE", "nova")}
    supports_ssml = False
    supports_ipa = False
    supports_lexicon = False

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        text = self.apply_substitutions(req.text, req.pronunciation)
        instr = INSTRUCTIONS[req.language]
        if req.speed != "normal":
            instr += " Speak slowly and deliberately, separating words clearly." if req.speed == "slow" else " Speak very slowly, one word at a time, with clear gaps between words."
        body = {"model": os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"), "voice": voice, "input": text,
                "response_format": {"mp3": "mp3", "ogg": "opus", "wav": "wav"}[req.format], "speed": SPEED_RATE[req.speed], "instructions": instr}
        data, _ = post("https://api.openai.com/v1/audio/speech", body, {"Authorization": f"Bearer {need_env('OPENAI_API_KEY')}"})
        return AudioResult(data, content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        return [Voice(v, v, "prompted", "", "neural", False, False, "accent via instructions, not native en-GB")
                for v in ("alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse")]
