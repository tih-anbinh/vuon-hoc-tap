# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""IBM Watson Text to Speech - benchmark provider.

Env:  WATSON_TTS_APIKEY, WATSON_TTS_URL (instance URL, e.g. https://api.au-syd.text-to-speech.watson.cloud.ibm.com)
REST: {url}/v1/synthesize?voice=en-GB_KateV3Voice   (basic auth apikey:KEY, JSON {"text": ...})
Docs: https://cloud.ibm.com/apidocs/text-to-speech#synthesize
      https://cloud.ibm.com/docs/text-to-speech?topic=text-to-speech-elements  (<phoneme alphabet="ipa|ibm">),
      custom models with word/translation pairs (customization_id).
en-GB voices: en-GB_KateV3Voice, en-GB_CharlotteV3Voice, en-GB_JamesV3Voice (V3 = neural "enhanced").
"""
from __future__ import annotations

import base64
import os

from ..core import SPEED_RATE, AudioResult, TTSProvider, TTSRequest, Voice, content_type_for
from ._http import need_env, post

ACCEPT = {"mp3": "audio/mp3", "ogg": "audio/ogg;codecs=opus", "wav": "audio/wav"}


class WatsonProvider(TTSProvider):
    id = "watson"
    default_voice = {"en-GB": "en-GB_KateV3Voice", "en-US": "en-US_AllisonV3Voice"}
    supports_ssml = True
    supports_ipa = True
    supports_lexicon = True   # customization models

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        text = self.apply_substitutions(req.text, req.pronunciation)
        body = self.ssml_escape(text)
        p = req.pronunciation
        if p and p.ipa and len(text.split()) == 1:
            body = f'<phoneme alphabet="ipa" ph="{self.ssml_escape(p.ipa)}">{body}</phoneme>'
        elif getattr(req, "_ssml_fragment", None):
            body = req._ssml_fragment
        rate = SPEED_RATE[req.speed]
        if rate != 1.0:
            body = f'<prosody rate="{int(round((rate - 1) * 100)):+d}%">{body}</prosody>'
        url = f"{need_env('WATSON_TTS_URL').rstrip('/')}/v1/synthesize?voice={voice}"
        cid = os.environ.get("WATSON_TTS_CUSTOMIZATION_ID")
        if cid:
            url += f"&customization_id={cid}"
        auth = base64.b64encode(f"apikey:{need_env('WATSON_TTS_APIKEY')}".encode()).decode()
        data, _ = post(url, {"text": f"<speak>{body}</speak>"}, {"Authorization": f"Basic {auth}", "Accept": ACCEPT[req.format]})
        return AudioResult(data, content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        return [Voice("en-GB_KateV3Voice", "Kate", "en-GB", "Female", "neural", False, True),
                Voice("en-GB_CharlotteV3Voice", "Charlotte", "en-GB", "Female", "neural", False, True),
                Voice("en-GB_JamesV3Voice", "James", "en-GB", "Male", "neural", False, True)]
