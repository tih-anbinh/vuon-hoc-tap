# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Pronunciation layer: the source of truth that sits between the word database and any TTS renderer.

Data:   content/pronunciation/lexicon.json   -> entries keyed by lowercase word (see schema below)
        content/pronunciation/exceptions.json-> per-provider/per-voice overrides when a renderer mis-says a word
Output: PronunciationConfig for a TTSRequest, plus SSML fragments for providers that honour IPA.

Entry schema (lexicon.json):
{
  "water": {
    "definition": "clear liquid we drink",
    "example": "Drink some water.",
    "syllables": ["wa", "ter"],
    "stress": 1,                              # 1-based syllable index of primary stress
    "pronunciation": {
      "uk": {"ipa": "ˈwɔː.tə"},               # Received Pronunciation-style, no slashes
      "us": {"ipa": "ˈwɑː.t̬ɚ"}
    },
    "notes": "UK/US differ: final r",
    "source": "hand-transcribed by maintainer following Oxford/Cambridge conventions; see docs/tts_research.md §F"
  }
}
Licensing: transcriptions here are original work in standard IPA. We do not copy or redistribute dictionary
audio or proprietary datasets. Where a CC-licensed source (e.g. Wiktionary CC BY-SA) is used, cite it in `source`.
"""
from __future__ import annotations

import json
import os
import re
from typing import Optional

from .core import Locale, PronunciationConfig

HERE = os.path.dirname(os.path.abspath(__file__))
PRON_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "content", "pronunciation"))
LEXICON_PATH = os.path.join(PRON_DIR, "lexicon.json")
EXCEPTIONS_PATH = os.path.join(PRON_DIR, "exceptions.json")

ACCENT_FOR_LOCALE = {"en-GB": "uk", "en-US": "us"}


class Pronunciation:
    def __init__(self, lexicon_path: str = LEXICON_PATH, exceptions_path: str = EXCEPTIONS_PATH):
        self.lexicon = self._load(lexicon_path)
        self.exceptions = self._load(exceptions_path)

    @staticmethod
    def _load(path: str) -> dict:
        if not os.path.isfile(path):
            return {}
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return {k: v for k, v in data.items() if not k.startswith("_")}

    # ---- lookups
    def entry(self, word: str) -> Optional[dict]:
        return self.lexicon.get(word.lower().strip())

    def ipa(self, word: str, locale: Locale = "en-GB") -> Optional[str]:
        e = self.entry(word)
        if not e:
            return None
        acc = ACCENT_FOR_LOCALE[locale]
        p = e.get("pronunciation", {}).get(acc) or e.get("pronunciation", {}).get("uk")
        return p.get("ipa") if p else None

    def exception(self, word: str, provider: str, voice: Optional[str], locale: Locale) -> Optional[dict]:
        """Exception dictionary: {"schedule": {"azure": {"*": {"ipa": "ˈʃɛd.juːl"}}, "openai": {"*": {"substitute": "shed-yool"}}}}"""
        w = self.exceptions.get(word.lower())
        if not w:
            return None
        by_prov = w.get(provider) or w.get("*")
        if not by_prov:
            return None
        return by_prov.get(voice or "") or by_prov.get("*")

    # ---- building a request config
    def config_for_word(self, word: str, provider: str, voice: Optional[str], locale: Locale = "en-GB") -> Optional[PronunciationConfig]:
        exc = self.exception(word, provider, voice, locale)
        if exc:
            if "substitute" in exc:
                return PronunciationConfig(substitutions={word: exc["substitute"]})
            if "ipa" in exc:
                return PronunciationConfig(ipa=exc["ipa"])
        ipa = self.ipa(word, locale)
        return PronunciationConfig(ipa=ipa) if ipa else None

    def ssml_phoneme(self, word: str, ipa: str) -> str:
        return f'<phoneme alphabet="ipa" ph="{ipa}">{word}</phoneme>'

    def annotate_sentence(self, text: str, provider: str, voice: Optional[str], locale: Locale = "en-GB",
                          only_words: Optional[set] = None, use_ipa: bool = True) -> tuple[str, dict]:
        """Wrap known words in <phoneme> tags (for IPA-capable providers) or apply substitutions (others).
        Returns (ssml_or_text_fragment, substitutions_dict). Only words in `only_words` (if given) are touched,
        so ordinary sentences are left to the native en-GB voice and only known trouble words are pinned."""
        subs: dict = {}
        out = []
        for tok in re.split(r"(\W+)", text):
            w = tok.lower()
            if not w or not w.isalpha() or (only_words is not None and w not in only_words):
                out.append(_esc(tok)); continue
            exc = self.exception(w, provider, voice, locale)
            if exc and "substitute" in exc:
                subs[w] = exc["substitute"]; out.append(_esc(exc["substitute"])); continue
            ipa = (exc or {}).get("ipa") or (self.ipa(w, locale) if use_ipa else None)
            out.append(self.ssml_phoneme(_esc(tok), ipa) if ipa else _esc(tok))
        return "".join(out), subs

    # ---- authoring helpers
    def words_missing(self, words) -> list[str]:
        return sorted({w.lower() for w in words if w.isalpha() and w.lower() not in self.lexicon})


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def card(word: str, pron: Optional[Pronunciation] = None) -> dict:
    """Learning-card view model (§7 of the brief) built purely from the pronunciation layer."""
    pron = pron or Pronunciation()
    e = pron.entry(word) or {}
    return {
        "word": word,
        "definition": e.get("definition"),
        "example": e.get("example"),
        "syllables": e.get("syllables"),
        "stress": e.get("stress"),
        "uk_ipa": pron.ipa(word, "en-GB"),
        "us_ipa": pron.ipa(word, "en-US"),
        "speeds": ["very_slow", "slow", "normal"],
        "accents": ["en-GB", "en-US"],
        "default_accent": "en-GB",
    }
