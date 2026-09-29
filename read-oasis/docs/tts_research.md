# TTS research and architecture for Read Oasis (Yuki's English learning app)

Author: Huy Tran · Cadence Design Systems Vietnam · huytran@cadence.com · Created: 2026-09-28
Scope: brief "TTS Research & Architecture" §1–16. Priority order for every decision below:
**pronunciation accuracy → accent consistency → clarity → controllability → naturalness → cost.**

> Evidence notice. Everything in §A is compiled from the providers' official documentation and pricing
> pages as I know them, with the documentation links given so you can re-verify; **pricing changes often
> and must be re-checked on the linked page before budgeting**. No provider audio was generated on the
> machine this was written on (no network/keys). The listening scores in §B are therefore `NOT RUN` and
> are produced by `tools/tts_benchmark.py` + your ears, not by this document.

---

## A. Provider comparison

Legend for "Pronunciation control": SSML = full SSML; IPA = `<phoneme alphabet="ipa">` honoured per word;
LEX = server-side custom lexicon / dictionary; SUB = only text substitution possible.

| | **Azure AI Speech** | **Google Cloud TTS** | **ElevenLabs** | **Amazon Polly** | **OpenAI TTS** | **IBM Watson TTS** |
|---|---|---|---|---|---|---|
| **Native en-GB voices** | Yes: Sonia, Ryan, Libby, Abbi, Olivia, Thomas, **Maisie (child)**, Alfie, Bella, Elliot, Ethan, Hollie, Noah, Oliver, Mia + multilingual/HD (Ada, Ollie, …) | Yes: Neural2 A/B/C/D/F, WaveNet A–F, Studio B/C, Journey, Chirp3-HD (several) | No locale; British voices exist in the Voice Library (labels "british"); consistency depends on the specific voice | Yes: Amy, Emma, Brian, Arthur (neural); Amy also generative & long-form | **No.** Accent only via `instructions` prompt on gpt-4o-mini-tts | Yes: Kate, Charlotte, James (V3 "enhanced neural") |
| **Pronunciation accuracy (single words)** | High and *deterministic* for the same SSML; per-word IPA pin fixes any miss | High on Neural2/WaveNet with IPA; Studio/Chirp voices very natural but ignore phoneme SSML | Good but model-driven; occasional drift on rare/UK-specific words; dictionary fixes it on v2 models, not v3 | Good; IPA on neural; generative engine ignores phoneme | Variable; LLM-based, may re-interpret spelling; no pin mechanism | Good; IPA and custom-word models |
| **Naturalness** | Very good (neural), excellent on HD/multilingual | Very good; Studio/Chirp3-HD among the most natural | **Best in class** | Good (neural), very good (generative) | Very good | Good, slightly older sound |
| **Child suitability** | Clear, calm; **Maisie** is a real British child voice (good for "kid reads back" mode, not the model voice) | Clear; no child voice | Clear; child-like voices exist but licensing/consistency vary | Clear; no child voice | Clear | Clear |
| **Pronunciation control** | SSML, IPA, SAPI, UPS, **LEX (PLS via `<lexicon uri>`)**, `<say-as>`, `<sub>`, `<break>`, `<emphasis>`, `<prosody rate/pitch/volume>`, styles (`mstts:express-as`) | SSML, IPA/X-SAMPA (Neural2/WaveNet/Standard), `<sub>`, `<break>`, `<emphasis>`, `<prosody>`; **no lexicon files**; Studio/Journey/Chirp: limited/no SSML | **No SSML.** Pronunciation dictionaries (PLS) with IPA/CMU on flash_v2/turbo_v2/multilingual_v2; alias-only on v3; `speed` 0.7–1.2; stability/style sliders | SSML, IPA/X-SAMPA (standard/neural), **LEX** (PutLexicon), `<prosody>`, `<break>`, `<emphasis>` (standard) | **No SSML, no IPA, no lexicon.** `speed` 0.25–4.0; free-text `instructions` | SSML, IPA/IBM SPR, **custom models** (word→translation), `<prosody>`, `<break>`, `<say-as>` |
| **API** | REST + SDKs (C#, Python, JS, Java, …), WebSocket streaming, word-boundary events, batch synthesis | REST + gRPC, client libs, streaming (Chirp3-HD), SSML timepoints | REST + WebSocket streaming, SDKs (Py/JS), timestamps | REST/SDK (boto3 etc.), streaming, speech marks | REST + SDKs, streaming | REST + WebSocket, SDKs, word timings |
| **Latency (typical, short text)** | ~200–600 ms | ~200–600 ms | ~300–800 ms (flash lower) | ~200–500 ms | ~500–1500 ms | ~300–700 ms |
| **Pricing (list, re-verify)** | Neural: **$16 / 1M chars** (~$15 for HD family varies); 0.5M chars/month free (F0) | Neural2/WaveNet **$16 / 1M**, Standard $4 / 1M, Studio **$160 / 1M**, Chirp3-HD ~$30 / 1M; 1M (WaveNet) free/month | Subscription: Free 10k credits, Starter $5 / 30k, Creator $22 / 100k, Pro $99 / 500k chars per month; ≈ **$50–$220 / 1M chars** effective | Neural **$16 / 1M**, Standard $4 / 1M, Generative $30 / 1M, Long-form $100 / 1M; free tier 1M neural chars/mo for 12 months | gpt-4o-mini-tts ≈ **$0.015 / minute** of audio (~$12 / 1M chars equivalent), tts-1 $15 / 1M chars, tts-1-hd $30 / 1M | Lite: 10k chars/mo free; Standard **$20 / 1M** chars (neural) |
| **Reliability / limits** | 99.9% SLA; default 200 TPS per resource; regional | 99.9% SLA; 1000 req/min default | No SLA on self-serve; concurrency limits per tier (2–15) | 99.9% SLA; 80 TPS neural default | No SLA on standard tier; RPM by usage tier | 99.9% SLA on paid plans |
| **Customization** | rate, pitch, volume, styles, role-play, Custom Neural Voice (extra) | rate, pitch, volume gain, effects profiles | stability, similarity, style, speed; voice design & cloning | rate, pitch, volume; NTTS styles (newscaster, conversational) | speed, free-text instructions (tone, accent, pace) | rate, pitch, expressive styles on some voices |
| **Licensing of generated audio** | Yes, may be used in your app; standard Azure terms | Yes; standard GCP terms | Yes, commercial rights on paid plans; **free tier requires attribution** and is non-commercial | Yes; standard AWS terms | Yes; OpenAI usage policies apply | Yes; standard IBM Cloud terms |

Official documentation: Azure [voice list](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts), [SSML phonemes/lexicon](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation), [REST TTS](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech), [pricing](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/) · Google [voices](https://cloud.google.com/text-to-speech/docs/voices), [SSML](https://cloud.google.com/text-to-speech/docs/ssml), [pricing](https://cloud.google.com/text-to-speech/pricing) · ElevenLabs [TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [pronunciation dictionaries](https://elevenlabs.io/docs/product-guides/speech/pronunciation-dictionaries), [models](https://elevenlabs.io/docs/models), [pricing](https://elevenlabs.io/pricing) · Polly [voices](https://docs.aws.amazon.com/polly/latest/dg/voicelist.html), [SSML](https://docs.aws.amazon.com/polly/latest/dg/ssml.html), [lexicons](https://docs.aws.amazon.com/polly/latest/dg/managing-lexicons.html), [pricing](https://aws.amazon.com/polly/pricing/) · OpenAI [TTS guide](https://platform.openai.com/docs/guides/text-to-speech), [pricing](https://openai.com/api/pricing/) · IBM [synthesize](https://cloud.ibm.com/apidocs/text-to-speech#synthesize), [SSML](https://cloud.ibm.com/docs/text-to-speech?topic=text-to-speech-ssml), [pricing](https://cloud.ibm.com/catalog/services/text-to-speech).

### Azure en-GB voices worth trying (all support IPA `<phoneme>`)
| Voice | Character | Use in Read Oasis |
|---|---|---|
| en-GB-SoniaNeural | neutral RP, clear, slightly formal | **default model voice** for pages and word cards |
| en-GB-LibbyNeural | brighter, warmer | alternative default; A/B with Sonia in the benchmark |
| en-GB-RyanNeural | warm male | male narrator option / nonfiction |
| en-GB-MaisieNeural | British **child** voice | "a kid reads it" mode; encouraging for Yuki, but keep the adult voice as the pronunciation model |
| en-GB-Abbi / Olivia / Thomas / Alfie / Hollie / Oliver | varied timbres | character voices in dialogue books later |
| en-GB-AdaMultilingualNeural, en-GB-OllieMultilingualNeural, *-DragonHD* | HD/LLM-enhanced prosody | more natural; **verify phoneme support per voice** before relying on IPA pins |

---

## B. Recommendation

**Primary: Azure AI Speech, en-GB-SoniaNeural (Libby as alternate), driven by our own pronunciation lexicon.**

Why, in the brief's priority order:
1. **Pronunciation accuracy** — the only provider where *every* mechanism exists at once: per-word IPA in SSML, a hosted PLS lexicon applied to whole books, SAPI/UPS as alternatives, and deterministic output. When Sonia says *schedule* the American way, one lexicon line fixes it forever, for every book.
2. **Accent consistency** — a native en-GB neural voice does not drift between sentences or sessions; the same SSML yields the same audio. Prompted-accent systems (OpenAI) cannot promise this.
3. **Clarity** — Sonia/Libby are enunciated, mid-pace, low-breathiness voices; good for a learner and for slow playback via `<prosody rate="-20%">` without artefacts.
4. **Controllability** — rate/pitch/pauses/emphasis/styles, plus a real child voice (Maisie) for a distinct mode.
5. **Naturalness** — very good; not the best (ElevenLabs), but the gap is smallest on short, clear sentences, which is what a child's reader consists of.
6. **Cost** — $16/1M chars; the entire Year-1 library (≈60 books × ~300 chars × 2 speeds + ~400 word clips × 3 variants) is well under 100k characters, i.e. **under $2 one-off**, and $0 on the free tier. Because audio is built once and cached, cost is irrelevant at runtime.

**Benchmark references kept as optional providers:**
- **ElevenLabs** (`eleven_multilingual_v2` + a British library voice + a pronunciation dictionary) — naturalness reference. Kept optional: no SSML, dictionary-only phoneme control that v3 drops, higher effective price, and accent consistency depends on the voice. If it wins clearly on listening, use it for *read_aloud* story books only and keep Azure for word cards.
- **Google** (`en-GB-Neural2-C`) — the closest peer to Azure; IPA works on Neural2. Studio/Chirp3-HD are more natural but lose phoneme control, which puts them behind for this project.
- **Polly Amy** (neural) — solid, IPA + lexicons; fine as a second opinion.
- **OpenAI gpt-4o-mini-tts** — evaluated with the brief's prompt; treated as a *prompted accent* only. No pin mechanism means it cannot be the pronunciation model; it may serve for off-screen prompts or parent-facing text.
- **Watson** — capable but ageing; included for completeness.

**Not chosen as primary and why:** ElevenLabs (control & determinism), OpenAI (no native en-GB, no IPA), Google Studio/Chirp (no phoneme control), Polly generative (same).

---

## C–E. Abstraction layer, working provider, configuration

Implemented in `tools/tts/` (Python, stdlib only — the layer runs at **content build time** so keys never reach the browser and the child app stays offline and third-party-free):

```
tools/tts/core.py            TTSProvider / TTSRequest / PronunciationConfig / AudioResult / Voice  (+ SHA-256 cache)
tools/tts/pronunciation.py   Pronunciation layer: lexicon + exception dictionary -> PronunciationConfig / SSML fragments
tools/tts/providers/azure.py        primary (REST, SSML+IPA+lexicon, styles)        env AZURE_SPEECH_KEY/REGION
tools/tts/providers/google.py       benchmark (REST, SSML+IPA on Neural2)            env GOOGLE_TTS_API_KEY
tools/tts/providers/elevenlabs.py   benchmark (REST, pronunciation dictionary id)    env ELEVENLABS_API_KEY/VOICE_ID
tools/tts/providers/openai_tts.py   benchmark (REST, instructions prompt)            env OPENAI_API_KEY
tools/tts/providers/polly.py        benchmark (boto3)                                 AWS env
tools/tts/providers/watson.py       benchmark (REST)                                  env WATSON_TTS_APIKEY/URL
tools/tts/providers/local.py        offline silent provider for tests / dry runs
```
Switch with `TTS_PROVIDER=azure|google|elevenlabs|openai|polly|watson|local`. The UI (`src/kid-app.mjs`)
knows nothing about providers: it plays `audio_asset` / `audio_slow_asset` / vocabulary clips from the book
JSON, and only falls back to the device's `speechSynthesis` when a page has no built clip. The parent can
disable that fallback.

### Runtime device-voice fallback (`narrator` in `src/ui.mjs`)

When there is no built clip we must use whatever voices the child's device has. Quality varies wildly, so
`narrator._pickVoice(accent)` **scores** every installed voice instead of taking the first match:

- Exact accent match (`en-GB`) beats same-language-other-region (`en-US`) beats non-English (rejected).
- **Apple "Enhanced"/"Premium"** and any "Neural"/"Natural" voice get a big bonus. On iPad/iPhone the parent
  can install these under *Settings → Accessibility → Spoken Content → Voices*; once installed the app picks
  them automatically (e.g. *Daniel (Enhanced)*, *Serena*, *Kate*, *Arthur* for en-GB; *Samantha (Enhanced)*,
  *Ava (Premium)* for en-US). Apple's built-in *compact* voice is penalised.
- Known pleasant named voices are boosted: Windows/Edge (Sonia, Libby, Ryan, Maisie, Hazel, Aria, Guy),
  Google network voices on Android/Chrome ("Google UK/US English"), and the Apple names above.
- Novelty/joke voices (Zarvox, Bells, Bad News, Albert, …) are strongly penalised — never for a child.
- A network/remote voice (`localService === false`) gets a small bonus, since it is usually the natural one.

`getVoices()` is empty on the first call in many mobile browsers and populates asynchronously; we listen for
`voiceschanged`, clear the per-accent voice cache, and re-pick once the full list has loaded.

### Reading speed (three child-facing speeds)

`SPEED_RATE` in `src/ui.mjs` is the single source of truth, shared by the reader, the word card and parent
settings: `very_slow 0.6` (word-study only), **`slow 0.72`, `normal 0.95`, `fast 1.12` ("A bit fast")**. `slow`
is deliberately a touch slower than the old 0.8 so a struggling reader can follow every syllable; `fast` stays
gentle so it never sounds rushed. The reader's speed button cycles Slow → Normal → A bit fast; when a page has
a built clip the same rate is applied via `<audio>.playbackRate` (relative to the normal clip).

Mirror of the TypeScript interface from the brief: `TTSRequest{text, language, voice?, speed, pronunciation?, format}`,
`PronunciationConfig{ipa?, phoneme?, alphabet, substitutions}`, `AudioResult{audio_bytes, content_type, duration?}`.

## F. Pronunciation model

`content/pronunciation/lexicon.json` — word → `{definition, example, syllables[], stress, pronunciation:{uk:{ipa}, us:{ipa}}, notes, source}`.
`content/pronunciation/exceptions.json` — word → provider → voice → `{ipa}` or `{substitute}` (renderer-specific fixes, applied first).
Both are original transcriptions in standard IPA following Oxford/Cambridge conventions; no dictionary
data or audio is copied (brief §5 licensing). Rows to double-check are marked `review: true`.
`tools/build_audio.py` also writes `ipa_uk` / `ipa_us` into each book's vocabulary entries so the
learning card can display them offline.

Flow: **word → lexicon UK IPA → (exception?) → `<phoneme alphabet="ipa">` for Azure/Google/Polly/Watson, or
respelling substitution for OpenAI/ElevenLabs → audio → cached by SHA-256(provider, voice, locale, text,
pronunciation, speed, format) → committed as `content/audio/<book>/…mp3`.** Replace the provider and the
educational content is untouched.

## G. Benchmark script

`python3 tools/tts_benchmark.py --providers azure,google,elevenlabs,openai --out bench/`
- Same 23 words × {plain, pinned} × {normal, slow} + 4 sentences (including the Yuki sentence) for every column
- writes `bench/index.html`: side-by-side players and a 1–5 scoring grid for the 8 criteria in §9 of the brief
  (weighted: pronunciation ×3, British authenticity ×3, clarity ×2, others ×1)
- `--voices en-GB-SoniaNeural,en-GB-LibbyNeural,en-GB-MaisieNeural` compares Azure voices in one sheet
- `--providers local` runs the whole pipeline without keys (silent WAVs) — used here to verify the tooling

**Status: listening benchmark NOT RUN** (no network on the authoring host). Run it on your machine, score
by ear, and paste the score table into this section. The recommendation in §B should be *confirmed or
overturned by that table*, not by this document.

## H. Caching

Two layers: (1) provider cache `.tts-cache/<hash[:2]>/<hash>.mp3` + `.json` metadata (git-ignored, keeps
re-runs free); (2) committed `content/audio/` clips referenced from book JSON and indexed by
`validate_content.py` (sha256 per file, feeds the service-worker version). `build_audio.py` is idempotent
and only rewrites a file when bytes change.

## Runbook

```
# once
export TTS_PROVIDER=azure AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=southeastasia
python3 tools/tts_benchmark.py --providers azure --voices en-GB-SoniaNeural,en-GB-LibbyNeural   # pick the voice
# per content change
python3 tools/build_audio.py --voice en-GB-SoniaNeural --us      # pages normal+slow, word cards UK normal+very_slow (+US)
python3 tools/validate_content.py --index && python3 tools/build_single_file.py
```
Words missing from the lexicon are listed at the end of the build; add them to `lexicon.json` and re-run.

## Open items
- Run the listening benchmark and record scores (this is the real test; everything above is design).
- Confirm IPA support on the Azure HD/Dragon voices you want before using them for word cards.
- Decide whether Maisie should narrate a "kid mode" or only appear in dialogue books.
- Add the remaining Year-1 vocabulary to the lexicon as books are approved (`build_audio.py` reports gaps).
