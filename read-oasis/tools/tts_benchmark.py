#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Synthesize the standard benchmark set with one or more providers and write a listening sheet.

  python3 tools/tts_benchmark.py --providers azure,google,elevenlabs --out bench/
  python3 tools/tts_benchmark.py --providers local                      # dry run, no keys, silent WAVs
  python3 tools/tts_benchmark.py --providers azure --voices en-GB-SoniaNeural,en-GB-RyanNeural,en-GB-MaisieNeural

Every provider gets exactly the same inputs (tools/tts/benchmark_set.json). Words are rendered twice:
"plain" (voice's own pronunciation) and "pinned" (lexicon IPA / exception applied) so you can hear whether
the pronunciation layer changes anything for that provider. Output: bench/<provider>/<voice>/*.mp3 and
bench/index.html (a scoring sheet with the 8-row rubric). Scores are yours to fill in by listening;
nothing here claims an audio quality result.
"""
import argparse
import datetime
import html
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts import Pronunciation, TTSError, TTSRequest, get_provider  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SET = os.path.join(HERE, "tts", "benchmark_set.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--providers", default=os.environ.get("TTS_PROVIDER", "local"))
    ap.add_argument("--voices", default="", help="comma list; applies to the first provider only. Default: provider default voice")
    ap.add_argument("--out", default=os.path.join(HERE, "..", "bench"))
    ap.add_argument("--language", default="en-GB", choices=["en-GB", "en-US"])
    ap.add_argument("--format", default="mp3", choices=["mp3", "ogg", "wav"])
    ap.add_argument("--words-only", action="store_true")
    args = ap.parse_args()

    with open(SET, encoding="utf-8") as f:
        bench = json.load(f)
    pron = Pronunciation()
    out_root = os.path.abspath(args.out)
    os.makedirs(out_root, exist_ok=True)
    manifest = []
    providers = [p.strip() for p in args.providers.split(",") if p.strip()]
    for pi, pname in enumerate(providers):
        try:
            prov = get_provider(pname)
        except TTSError as e:
            print(f"[{pname}] skipped: {e}"); continue
        voices = [v for v in args.voices.split(",") if v] if (pi == 0 and args.voices) else [prov.default_voice.get(args.language) or ""]
        for voice in voices:
            vdir = os.path.join(out_root, pname, voice or "default"); os.makedirs(vdir, exist_ok=True)
            items = []
            for w in bench["words"]:
                word = w["w"]
                for mode in ("plain", "pinned"):
                    cfg = pron.config_for_word(word, pname, voice, args.language) if mode == "pinned" else None
                    if mode == "pinned" and cfg is None:
                        continue
                    for speed in bench["speeds"]:
                        items.append((f"word-{word}-{mode}-{speed}", TTSRequest(word, args.language, voice or None, speed, cfg, args.format), word, mode, speed, pron.ipa(word, args.language)))
            if not args.words_only:
                pinned_words = {w["w"] for w in bench["words"]} | {"yuki"}
                for s in bench["sentences"]:
                    for mode in ("plain", "pinned"):
                        req = TTSRequest(s["text"], args.language, voice or None, "normal", None, args.format)
                        if mode == "pinned":
                            frag, subs = pron.annotate_sentence(s["text"], pname, voice, args.language, only_words=pinned_words, use_ipa=prov.supports_ipa)
                            if prov.supports_ipa:
                                req._ssml_fragment = frag  # type: ignore[attr-defined]
                            elif subs:
                                from tts import PronunciationConfig
                                req = TTSRequest(s["text"], args.language, voice or None, "normal", PronunciationConfig(substitutions=subs), args.format)
                            else:
                                continue
                        items.append((f"sent-{s['id']}-{mode}", req, s["text"], mode, "normal", None))
            for name, req, text, mode, speed, ipa in items:
                t0 = time.time()
                try:
                    res = prov.synthesize(req)
                except TTSError as e:
                    print(f"[{pname}/{voice}] {name}: {e}"); manifest.append({"provider": pname, "voice": voice, "name": name, "error": str(e)}); continue
                path = os.path.join(vdir, f"{name}.{args.format}")
                with open(path, "wb") as f:
                    f.write(res.audio_bytes)
                manifest.append({"provider": pname, "voice": voice or prov.default_voice.get(args.language), "name": name, "text": text, "mode": mode, "speed": speed,
                                 "ipa": ipa, "file": os.path.relpath(path, out_root), "bytes": len(res.audio_bytes), "cached": res.cached, "latency_ms": None if res.cached else int((time.time() - t0) * 1000)})
                print(f"[{pname}/{voice or 'default'}] {name} {'(cache)' if res.cached else f'{manifest[-1]['latency_ms']} ms'}")
    with open(os.path.join(out_root, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.datetime.now().isoformat(timespec="seconds"), "language": args.language, "items": manifest}, f, indent=1, ensure_ascii=False)
    write_sheet(out_root, manifest, bench)
    print(f"\n{len(manifest)} clips -> {out_root}/index.html")


def write_sheet(root, manifest, bench):
    cols = sorted({(m["provider"], m["voice"]) for m in manifest if "file" in m})
    names = []
    for m in manifest:
        if m.get("name") not in names: names.append(m.get("name"))
    rows = []
    for n in names:
        cells = []
        for p, v in cols:
            m = next((x for x in manifest if x.get("name") == n and x["provider"] == p and x["voice"] == v and "file" in x), None)
            cells.append(f'<td>{f"<audio controls preload=none src=\"{html.escape(m['file'])}\"></audio><br><small>{m['latency_ms'] or 'cache'} ms</small>" if m else "-"}</td>')
        first = next((x for x in manifest if x.get("name") == n), {})
        rows.append(f"<tr><th>{html.escape(n)}<br><small>{html.escape(first.get('text', ''))}{(' /' + first['ipa'] + '/') if first.get('ipa') else ''}</small></th>{''.join(cells)}</tr>")
    rubric = "".join(f"<tr><th>{r}</th>{''.join('<td><input type=number min=1 max=5 style=width:3em></td>' for _ in cols)}</tr>" for r in bench["rubric"])
    doc = f"""<!doctype html><meta charset=utf-8><title>Read Oasis TTS benchmark</title>
<style>body{{font-family:system-ui;margin:1rem}}table{{border-collapse:collapse}}td,th{{border:1px solid #ccc;padding:.3em .5em;vertical-align:top;text-align:left}}th small{{font-weight:400;color:#555}}audio{{width:14em}}</style>
<h1>TTS benchmark</h1><p>{html.escape(bench['rubric_note'])} Same inputs for every column. "pinned" = lexicon IPA / exception applied; "plain" = voice on its own.</p>
<table><tr><th>clip</th>{''.join(f'<th>{html.escape(p)}<br><small>{html.escape(v or "default")}</small></th>' for p, v in cols)}</tr>{''.join(rows)}</table>
<h2>Scores (1-5)</h2><table><tr><th></th>{''.join(f'<th>{html.escape(p)}/{html.escape(v or "default")}</th>' for p, v in cols)}</tr>{rubric}</table>"""
    with open(os.path.join(root, "index.html"), "w", encoding="utf-8") as f:
        f.write(doc)


if __name__ == "__main__":
    sys.exit(main())
