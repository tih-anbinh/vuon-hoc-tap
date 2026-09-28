# Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
"""Amazon Polly - benchmark provider (uses boto3 if installed; SigV4 by hand is out of scope for a stdlib tool).

Env:  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION; pip install boto3
Docs: https://docs.aws.amazon.com/polly/latest/dg/ssml.html  (<phoneme alphabet="ipa|x-sampa"> on standard
      and neural voices; NOT on generative/long-form), https://docs.aws.amazon.com/polly/latest/dg/managing-lexicons.html
en-GB voices: Amy (neural, generative, long-form), Emma (neural), Brian (neural), Arthur (neural, male).
"""
from __future__ import annotations

from ..core import SPEED_RATE, AudioResult, TTSError, TTSProvider, TTSRequest, Voice, content_type_for


class PollyProvider(TTSProvider):
    id = "polly"
    default_voice = {"en-GB": "Amy", "en-US": "Joanna"}
    supports_ssml = True
    supports_ipa = True       # neural/standard engines
    supports_lexicon = True   # PutLexicon + LexiconNames

    def _synthesize(self, req: TTSRequest, voice: str) -> AudioResult:
        try:
            import boto3  # type: ignore
        except ImportError:
            raise TTSError("Amazon Polly needs `pip install boto3` and AWS credentials in the environment") from None
        text = self.apply_substitutions(req.text, req.pronunciation)
        body = self.ssml_escape(text)
        p = req.pronunciation
        if p and p.ipa and len(text.split()) == 1:
            body = f'<phoneme alphabet="ipa" ph="{self.ssml_escape(p.ipa)}">{body}</phoneme>'
        elif getattr(req, "_ssml_fragment", None):
            body = req._ssml_fragment
        rate = SPEED_RATE[req.speed]
        if rate != 1.0:
            body = f'<prosody rate="{int(rate * 100)}%">{body}</prosody>'
        ssml = f"<speak>{body}</speak>"
        client = boto3.client("polly")
        out = client.synthesize_speech(Engine="neural", LanguageCode=req.language, VoiceId=voice, TextType="ssml", Text=ssml,
                                       OutputFormat={"mp3": "mp3", "ogg": "ogg_vorbis", "wav": "pcm"}[req.format])
        return AudioResult(out["AudioStream"].read(), content_type_for(req.format), self.id, voice)

    def get_voices(self) -> list[Voice]:
        return [Voice("Amy", "Amy", "en-GB", "Female", "neural", False, True, "also generative/long-form engines (no phoneme there)"),
                Voice("Emma", "Emma", "en-GB", "Female", "neural", False, True), Voice("Brian", "Brian", "en-GB", "Male", "neural", False, True),
                Voice("Arthur", "Arthur", "en-GB", "Male", "neural", False, True)]
