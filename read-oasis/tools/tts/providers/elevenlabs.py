# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""ElevenLabs - naturalness benchmark (optional provider).

Env:  ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID (a British voice from your library),
      optional ELEVENLABS_MODEL (default eleven_multilingual_v2), optional ELEVENLABS_PRON_DICT_ID
REST: https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
      https://elevenlabs.io/docs/product-guides/speech/pronunciation-dictionaries
Pronunciation control: pronunciation dictionaries (PLS) with IPA/CMU phoneme entries are honoured by
eleven_flash_v2 / eleven_turbo_v2 / eleven_multilingual_v2 (and v1 family); *alias* (substitution) entries
work on all models. Inline SSML <phoneme> is NOT supported; eleven_v3 ignores phoneme entries (alias only).
Accent: there is no "en-GB" locale switch; British-ness comes from choosing a British voice.
"""
from __future__ import annotations

import os

from ..core import SPEED_RATE, AudioResult, TTSProvider, TTSRequest, Voice, content_type_for
from ._http import get, need_env, post

FMT = {"mp3": "mp3_44100_128", "ogg": "opus_48000_96", "wav": "pcm_24000"}


class ElevenLabsProvider(TTSProvider):
    id = "elevenlabs"
    default_voice = {"en-GB": os.environ.get("ELEVENLABS_VOICE_ID", ""), "en-US": os.environ.get("ELEVENLABS_VOICE_ID", "")}
    supports_ssml = False
    supports_ipa = False          # only via server-side pronunciation dictionary, not per request
    supports_lexicon = True

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        voice = voice or need_env("ELEVENLABS_VOICE_ID")
        text = self.apply_substitutions(req.text, req.pronunciation)
        body = {
            "text": text,
            "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
            "voice_settings": {"stability": 0.75, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True,
                               "speed": max(0.7, min(1.2, SPEED_RATE[req.speed]))},  # API clamps speed to 0.7-1.2
        }
        pd = os.environ.get("ELEVENLABS_PRON_DICT_ID")
        if pd:
            vid = os.environ.get("ELEVENLABS_PRON_DICT_VERSION")
            body["pronunciation_dictionary_locators"] = [{"pronunciation_dictionary_id": pd, **({"version_id": vid} if vid else {})}]
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format={FMT[req.format]}"
        data, _ = post(url, body, {"xi-api-key": need_env("ELEVENLABS_API_KEY")})
        return AudioResult(data, content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        key = os.environ.get("ELEVENLABS_API_KEY")
        if not key:
            return [Voice("(set ELEVENLABS_VOICE_ID)", "British voice from your library", "en-GB", "", "neural", False, False,
                          "Pick a voice labelled British/UK in the Voice Library; there is no locale parameter.")]
        import json
        raw = json.loads(get("https://api.elevenlabs.io/v1/voices", {"xi-api-key": key}))
        out = []
        for v in raw.get("voices", []):
            labels = v.get("labels", {}) or {}
            acc = (labels.get("accent") or "").lower()
            if "brit" in acc or "uk" in acc or "english" == acc:
                out.append(Voice(v["voice_id"], v["name"], "en-GB", labels.get("gender", ""), "neural", "child" in (labels.get("age", "") or ""), False, acc))
        return out
