#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Render narration for books through the pronunciation layer + configured TTS provider, and wire the
resulting files into the book JSON (audio_asset / audio_slow_asset / vocabulary[].audio_asset).

  TTS_PROVIDER=azure AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... python3 tools/build_audio.py
  python3 tools/build_audio.py --books ro-a-020 ro-b-020 --voice en-GB-SoniaNeural
  python3 tools/build_audio.py --provider local --dry-run            # no keys: shows what would be rendered

Per page:   audio_asset       = normal speed,  audio_slow_asset = slow speed
Per vocab:  audio_asset (word, pinned IPA), audio_slow_asset (very_slow), audio_us_asset (en-US, optional --us)
File names: content/audio/<book_id>/<page_id>[-slow].mp3, content/audio/<book_id>/w-<word>[-slow|-us].mp3
Idempotent: the provider cache means unchanged text costs nothing; files are overwritten only if bytes differ.
Only PUBLISHED / DRAFT books you name (or all by default) are touched; the reader falls back to
speechSynthesis for any page without audio_asset, so partial runs are safe.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts import Pronunciation, PronunciationConfig, TTSError, TTSRequest, get_provider  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BOOKS = os.path.join(ROOT, "content", "books")
AUDIO = os.path.join(ROOT, "content", "audio")


def write_if_changed(path, data):
    if os.path.isfile(path):
        with open(path, "rb") as f:
            if hashlib.sha256(f.read()).digest() == hashlib.sha256(data).digest():
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default=None)
    ap.add_argument("--voice", default=None)
    ap.add_argument("--books", nargs="*", default=None, help="book ids; default all")
    ap.add_argument("--language", default="en-GB", choices=["en-GB", "en-US"])
    ap.add_argument("--us", action="store_true", help="also render en-US word clips for the accent toggle")
    ap.add_argument("--format", default="mp3", choices=["mp3", "ogg"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    try:
        prov = get_provider(args.provider)
    except TTSError as e:
        print(e); return 1
    pron = Pronunciation()
    voice = args.voice or prov.default_voice.get(args.language)
    print(f"provider={prov.id} voice={voice} language={args.language} ipa={'yes' if prov.supports_ipa else 'no (substitutions only)'}")
    total = new = 0
    missing = set()
    for fn in sorted(os.listdir(BOOKS)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(BOOKS, fn), encoding="utf-8") as f:
            book = json.load(f)
        if args.books and book["book_id"] not in args.books:
            continue
        bid = book["book_id"]
        changed = False
        vocab_words = {v["word"].lower() for p in book["pages"] for v in p.get("vocabulary", [])}
        for p in book["pages"]:
            text = p.get("audio_script") or p["text"]
            for speed, key in (("normal", "audio_asset"), ("slow", "audio_slow_asset")):
                rel = f"audio/{bid}/{p['page_id']}{'-slow' if speed != 'normal' else ''}.{args.format}"
                req = TTSRequest(text, args.language, voice, speed, None, args.format)
                # pin only known trouble words / vocabulary inside sentences; leave the rest to the native en-GB voice
                if prov.supports_ipa:
                    frag, _ = pron.annotate_sentence(text, prov.id, voice, args.language, only_words=vocab_words | set(pron.exceptions))
                    if "<phoneme" in frag:
                        req._ssml_fragment = frag  # type: ignore[attr-defined]
                else:
                    _, subs = pron.annotate_sentence(text, prov.id, voice, args.language, only_words=set(pron.exceptions), use_ipa=False)
                    if subs:
                        req = TTSRequest(text, args.language, voice, speed, PronunciationConfig(substitutions=subs), args.format)
                total += 1
                if args.dry_run:
                    print(f"  {bid}/{p['page_id']} {speed}: {text[:60]}"); continue
                try:
                    res = prov.synthesize(req)
                except TTSError as e:
                    print(f"  ! {bid}/{p['page_id']} {speed}: {e}"); continue
                if write_if_changed(os.path.join(ROOT, "content", rel), res.audio_bytes): new += 1
                if p.get(key) != rel: p[key] = rel; changed = True
                if key == "audio_asset" and p.get("audio_script") is None: p["audio_script"] = text; changed = True
            for v in p.get("vocabulary", []):
                w = v["word"]
                if not pron.entry(w): missing.add(w.lower())
                jobs = [("normal", args.language, "audio_asset", ""), ("very_slow", args.language, "audio_slow_asset", "-slow")]
                if args.us: jobs.append(("normal", "en-US", "audio_us_asset", "-us"))
                for speed, lang, vkey, suffix in jobs:
                    rel = f"audio/{bid}/w-{re.sub(r'[^a-z]', '', w.lower())}{suffix}.{args.format}"
                    cfg = pron.config_for_word(w, prov.id, voice, lang)
                    req = TTSRequest(w, lang, voice if lang == args.language else None, speed, cfg, args.format)
                    total += 1
                    if args.dry_run:
                        print(f"  {bid} word {w} {lang} {speed} ipa={cfg.ipa if cfg else '-'}"); continue
                    try:
                        res = prov.synthesize(req)
                    except TTSError as e:
                        print(f"  ! {bid} word {w}: {e}"); continue
                    if write_if_changed(os.path.join(ROOT, "content", rel), res.audio_bytes): new += 1
                    if v.get(vkey) != rel: v[vkey] = rel; changed = True
                if v.get("ipa_uk") != pron.ipa(w, "en-GB") and pron.ipa(w, "en-GB"):
                    v["ipa_uk"] = pron.ipa(w, "en-GB"); v["ipa_us"] = pron.ipa(w, "en-US"); changed = True
        if changed and not args.dry_run:
            book.setdefault("audio_meta", {}).update({"provider": prov.id, "voice": voice, "language": args.language})
            with open(os.path.join(BOOKS, fn), "w", encoding="utf-8") as f:
                json.dump(book, f, indent=2, ensure_ascii=False); f.write("\n")
            print(f"updated {fn}")
    print(f"\n{total} clip(s) considered, {new} file(s) written/updated" + (" (dry run)" if args.dry_run else ""))
    if missing:
        print(f"vocabulary words with no lexicon entry (rendered with the voice's own pronunciation): {', '.join(sorted(missing))}")
    if not args.dry_run:
        print("next: python3 tools/validate_content.py --index && python3 tools/build_single_file.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
