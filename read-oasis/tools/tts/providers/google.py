# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Google Cloud Text-to-Speech - benchmark provider.

Env:  GOOGLE_TTS_API_KEY  (API key restricted to the TTS API) - or a bearer token in GOOGLE_TTS_TOKEN
REST: https://texttospeech.googleapis.com/v1/text:synthesize
Docs: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
      https://cloud.google.com/text-to-speech/docs/ssml   (<phoneme alphabet="ipa|x-sampa"> supported on
      Standard/WaveNet/Neural2; Studio/Journey/Chirp3-HD voices ignore or reject some SSML - verify per voice)
en-GB voices: en-GB-Neural2-A/B/C/D/F, en-GB-Wavenet-*, en-GB-Studio-B/C, en-GB-Journey-*, en-GB-Chirp3-HD-*.
"""
from __future__ import annotations

import base64
import os

from ..core import SPEED_RATE, AudioResult, TTSProvider, TTSRequest, Voice, content_type_for
from ._http import need_env, post

ENC = {"mp3": "MP3", "ogg": "OGG_OPUS", "wav": "LINEAR16"}


class GoogleProvider(TTSProvider):
    id = "google"
    default_voice = {"en-GB": "en-GB-Neural2-C", "en-US": "en-US-Neural2-F"}
    supports_ssml = True
    supports_ipa = True          # on Neural2/WaveNet/Standard; NOT on Studio/Journey/Chirp HD
    supports_lexicon = False     # no custom lexicon files; use inline <phoneme>/<sub>

    def _headers(self) -> dict:
        tok = os.environ.get("GOOGLE_TTS_TOKEN")
        return {"Authorization": f"Bearer {tok}"} if tok else {}

    def _url(self) -> str:
        key = os.environ.get("GOOGLE_TTS_API_KEY")
        base = "https://texttospeech.googleapis.com/v1/text:synthesize"
        if key:
            return f"{base}?key={key}"
        need_env("GOOGLE_TTS_TOKEN")
        return base

    def build_ssml(self, req: TTSRequest) -> str:
        text = self.apply_substitutions(req.text, req.pronunciation)
        body = self.ssml_escape(text)
        p = req.pronunciation
        if p and p.ipa and len(text.split()) == 1 and self._voice_accepts_phoneme(req):
            body = f'<phoneme alphabet="ipa" ph="{self.ssml_escape(p.ipa)}">{body}</phoneme>'
        elif getattr(req, "_ssml_fragment", None):
            body = req._ssml_fragment
        return f"<speak>{body}</speak>"

    def _voice_accepts_phoneme(self, req: TTSRequest) -> bool:
        v = (req.voice or self.default_voice[req.language])
        return not any(k in v for k in ("Studio", "Journey", "Chirp"))

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        body = {
            "input": {"ssml": self.build_ssml(req)},
            "voice": {"languageCode": req.language, "name": voice},
            "audioConfig": {"audioEncoding": ENC[req.format], "speakingRate": SPEED_RATE[req.speed]},
        }
        raw, _ = post(self._url(), body, self._headers())
        import json
        audio = base64.b64decode(json.loads(raw)["audioContent"])
        return AudioResult(audio, content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        return [
            Voice("en-GB-Neural2-A", "Neural2 A", "en-GB", "Female", "neural", False, True),
            Voice("en-GB-Neural2-B", "Neural2 B", "en-GB", "Male", "neural", False, True),
            Voice("en-GB-Neural2-C", "Neural2 C", "en-GB", "Female", "neural", False, True, "clear; default"),
            Voice("en-GB-Neural2-D", "Neural2 D", "en-GB", "Male", "neural", False, True),
            Voice("en-GB-Neural2-F", "Neural2 F", "en-GB", "Female", "neural", False, True),
            Voice("en-GB-Studio-B", "Studio B", "en-GB", "Male", "hd", False, False, "very natural; phoneme SSML not reliable"),
            Voice("en-GB-Studio-C", "Studio C", "en-GB", "Female", "hd", False, False, ""),
            Voice("en-GB-Chirp3-HD-Aoede", "Chirp3 HD Aoede", "en-GB", "Female", "hd", False, False, "LLM-based; no SSML phoneme"),
        ]
