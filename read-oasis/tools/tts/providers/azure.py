# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Microsoft Azure AI Speech - primary provider.

Env:  AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. southeastasia)
REST: https://{region}.tts.speech.microsoft.com/cognitiveservices/v1  (SSML in, audio out)
Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
      https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
Why primary for this project: native en-GB neural voices incl. a child voice (MaisieNeural); full SSML with
<phoneme alphabet="ipa|sapi|ups"> honoured per word, <lexicon uri> custom lexicons, <prosody rate/pitch>,
<break>, <emphasis>, <say-as>; deterministic output for the same SSML. See docs/tts_research.md.
"""
from __future__ import annotations

import json
import os

from ..core import SPEED_RATE, AudioResult, TTSProvider, TTSRequest, Voice, content_type_for
from ._http import get, need_env, post

FORMATS = {"mp3": "audio-24khz-96kbitrate-mono-mp3", "ogg": "ogg-24khz-16bit-mono-opus", "wav": "riff-24khz-16bit-mono-pcm"}

# en-GB catalogue we care about (verify against get_voices(); notes are from the official voice list page)
EN_GB_VOICES = [
    Voice("en-GB-SoniaNeural", "Sonia", "en-GB", "Female", "neural", False, True, "clear, neutral RP; styles: cheerful, sad"),
    Voice("en-GB-RyanNeural", "Ryan", "en-GB", "Male", "neural", False, True, "warm male; styles: cheerful, chat, whispering, sad"),
    Voice("en-GB-LibbyNeural", "Libby", "en-GB", "Female", "neural", False, True, "bright, slightly younger timbre"),
    Voice("en-GB-AbbiNeural", "Abbi", "en-GB", "Female", "neural", False, True, ""),
    Voice("en-GB-OliviaNeural", "Olivia", "en-GB", "Female", "neural", False, True, ""),
    Voice("en-GB-ThomasNeural", "Thomas", "en-GB", "Male", "neural", False, True, ""),
    Voice("en-GB-MaisieNeural", "Maisie", "en-GB", "Female", "child", True, True, "British child voice; good for a 'kid reads' mode, not for the model pronunciation"),
    Voice("en-GB-AdaMultilingualNeural", "Ada (multilingual)", "en-GB", "Female", "hd", False, True, "multilingual/HD family; check phoneme support per release"),
    Voice("en-GB-OllieMultilingualNeural", "Ollie (multilingual)", "en-GB", "Male", "hd", False, True, ""),
]


class AzureProvider(TTSProvider):
    id = "azure"
    default_voice = {"en-GB": "en-GB-SoniaNeural", "en-US": "en-US-JennyNeural"}
    supports_ssml = True
    supports_ipa = True
    supports_lexicon = True

    def __init__(self, cache_dir=None):
        super().__init__(cache_dir)
        self.key = os.environ.get("AZURE_SPEECH_KEY")
        self.region = os.environ.get("AZURE_SPEECH_REGION")
        self.lexicon_uri = os.environ.get("AZURE_LEXICON_URI")  # optional hosted PLS file

    def _endpoint(self) -> str:
        return f"https://{need_env('AZURE_SPEECH_REGION')}.tts.speech.microsoft.com/cognitiveservices/v1"

    def build_ssml(self, req: TTSRequest, voice: str) -> str:
        text = self.apply_substitutions(req.text, req.pronunciation)
        body = self.ssml_escape(text)
        pron = req.pronunciation
        if pron and pron.ipa and len(text.split()) == 1:
            alphabet = {"ipa": "ipa", "sapi": "sapi", "x-sampa": "x-sampa"}[pron.alphabet]
            body = f'<phoneme alphabet="{alphabet}" ph="{self.ssml_escape(pron.ipa if alphabet == "ipa" else pron.phoneme or pron.ipa)}">{body}</phoneme>'
        elif getattr(req, "_ssml_fragment", None):
            body = req._ssml_fragment  # pre-annotated sentence from Pronunciation.annotate_sentence
        rate = SPEED_RATE[req.speed]
        if rate != 1.0:
            body = f'<prosody rate="{int(round((rate - 1) * 100)):+d}%">{body}</prosody>'
        if req.style:
            body = f'<mstts:express-as style="{self.ssml_escape(req.style)}">{body}</mstts:express-as>'
        lex = f'<lexicon uri="{self.ssml_escape(self.lexicon_uri)}"/>' if self.lexicon_uri else ""
        return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{req.language}">'
                f'<voice name="{voice}">{lex}{body}</voice></speak>')

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        ssml = self.build_ssml(req, voice)
        headers = {"Ocp-Apim-Subscription-Key": need_env("AZURE_SPEECH_KEY"), "Content-Type": "application/ssml+xml",
                   "X-Microsoft-OutputFormat": FORMATS[req.format], "User-Agent": "read-oasis-tts"}
        data, _ = post(self._endpoint(), ssml.encode("utf-8"), headers)
        return AudioResult(data, content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        if not (self.key and self.region):
            return EN_GB_VOICES
        url = f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/voices/list"
        raw = json.loads(get(url, {"Ocp-Apim-Subscription-Key": self.key}))
        out = []
        for v in raw:
            if v.get("Locale", "").startswith("en-GB"):
                out.append(Voice(v["ShortName"], v.get("DisplayName", v["ShortName"]), v["Locale"], v.get("Gender", ""),
                                 "hd" if "HD" in v["ShortName"] or "Multilingual" in v["ShortName"] else "neural",
                                 v["ShortName"] == "en-GB-MaisieNeural", True, ", ".join(v.get("StyleList", []) or [])))
        return out or EN_GB_VOICES
