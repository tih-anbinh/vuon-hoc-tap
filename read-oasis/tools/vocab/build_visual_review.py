# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-30
"""Vocabulary Garden — human visual-review gallery + state file.

The enrichment builder can author teaching content and LINK an SVG by name, but
it cannot SEE the picture, so it never certifies new art as good. Every freshly
authored word is emitted with teaching.visual.status = "needs_human_review".

This tool closes that loop with a human in the seat:

  1. Reads the generated entries (content/vocabulary/entries/*.json).
  2. Selects entries whose visual.status is "needs_human_review" (or --all).
  3. Renders ONE self-contained HTML page per word showing, side by side:
       - the authored teaching content (EN definition, VI explanation, example),
       - the linked SVG rendered inline (so file:// works with no server),
       - one-click verdict buttons.
  4. Verdicts persist in localStorage AND can be exported as
     content/vocabulary/reviews/visual-review-state.json — the durable record of
     each human decision. That file is the input for the next authoring pass:
     copy each verdict into the AUTHORED entry's "visual_verdict" field, rebuild,
     and the picture flips from needs_human_review -> approved (or redraw, etc.).

Verdicts (match the child-gate + redraw workflow):
    approved            picture is correct for this sense -> becomes child-ready
    redraw_now          wrong/unclear picture, high priority to redo
    redraw_later        acceptable but should be improved eventually
    wrong_sense         picture shows a different meaning of the word
    duplicate           same art as another word; needs its own picture
    no_visual_needed    this word does not need a picture

This tool is READ-ONLY over the pipeline: it never edits entries/*.json,
manifest.json, or the AUTHORED dict. It only writes the review HTML and, when you
export from the page, the review-state JSON.

Usage:
    python read-oasis/tools/vocab/build_visual_review.py [--all]
Output:
    read-oasis/content/vocabulary/reviews/_visual_review.html
    (export from the page) content/vocabulary/reviews/visual-review-state.json
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]  # read-oasis/
VOCAB_DIR = ROOT / "content" / "vocabulary"
ENTRIES_DIR = VOCAB_DIR / "entries"
ASSETS_DIR = VOCAB_DIR / "assets"
REVIEWS_DIR = VOCAB_DIR / "reviews"
OUT_HTML = REVIEWS_DIR / "_visual_review.html"
STATE_JSON = REVIEWS_DIR / "visual-review-state.json"

VERDICTS = [
    ("approved", "Đúng ✓", "#1b7f3b"),
    ("redraw_now", "Vẽ lại (gấp)", "#b3261e"),
    ("redraw_later", "Vẽ lại (sau)", "#a06a00"),
    ("wrong_sense", "Sai nghĩa", "#8a1f7a"),
    ("duplicate", "Trùng hình", "#5a5a5a"),
    ("no_visual_needed", "Không cần hình", "#2a4b8d"),
]


def _load_entries() -> list[dict]:
    out: list[dict] = []
    for p in sorted(glob.glob(str(ENTRIES_DIR / "*.json"))):
        out.extend(json.loads(Path(p).read_text(encoding="utf-8")))
    return out


def _sanitize_svg(text: str) -> str:
    text = re.sub(r"<\?xml[^>]*\?>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<!DOCTYPE[^>]*>", "", text, flags=re.IGNORECASE)
    return text.strip()


def _load_existing_state() -> dict:
    if STATE_JSON.exists():
        try:
            data = json.loads(STATE_JSON.read_text(encoding="utf-8"))
            return {v["word_id"]: v for v in data.get("verdicts", [])}
        except Exception:
            return {}
    return {}


def _card(entry: dict, existing: dict) -> str:
    wid = entry["source_ref"]["word_id"]
    hw = entry["headword"]
    t = entry.get("teaching", {}) or {}
    vis = t.get("visual", {}) or {}
    asset = vis.get("asset")
    svg_inline = "<div class='noimg'>Không có hình liên kết</div>"
    if asset:
        fp = ASSETS_DIR / Path(asset).name
        if fp.exists():
            svg_inline = _sanitize_svg(fp.read_text(encoding="utf-8"))
        else:
            svg_inline = f"<div class='noimg'>Thiếu file: {html.escape(Path(asset).name)}</div>"
    prev = existing.get(wid, {}).get("verdict", "")
    buttons = "".join(
        f"<button class='v' data-v='{code}' style='--c:{color}'>{html.escape(label)}</button>"
        for code, label, color in VERDICTS
    )
    return f"""
    <article class="card" data-wid="{html.escape(wid)}" data-prev="{html.escape(prev)}">
      <div class="art">{svg_inline}</div>
      <div class="info">
        <h2>{html.escape(hw)}</h2>
        <p class="sense">{html.escape(entry.get('sense_label') or '')}</p>
        <p class="def"><b>EN:</b> {html.escape(t.get('definition_en') or '')}</p>
        <p class="vi"><b>VI:</b> {html.escape(t.get('explanation_vi') or '')}</p>
        <p class="ex">“{html.escape(t.get('example_en') or '')}” — {html.escape(t.get('example_vi') or '')}</p>
        <p class="meta">{html.escape('/'.join(entry.get('part_of_speech') or []))} · {html.escape(vis.get('representation_type') or '')} · <code>{html.escape(Path(asset).name if asset else '—')}</code></p>
        <div class="verdicts">{buttons}</div>
        <div class="chosen"></div>
      </div>
    </article>"""


def build(show_all: bool) -> int:
    REVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    entries = _load_entries()
    existing = _load_existing_state()

    def wanted(e: dict) -> bool:
        if e["status"] != "editorially_approved":
            return False
        st = ((e.get("teaching") or {}).get("visual") or {}).get("status")
        return show_all or st == "needs_human_review"

    todo = [e for e in entries if wanted(e)]
    todo.sort(key=lambda e: e["headword"].lower())
    cards = "\n".join(_card(e, existing) for e in todo)
    total = len(todo)

    page = f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vocabulary Garden — Duyệt hình ({total})</title>
<style>
  :root {{ font-family: system-ui, "Segoe UI", Arial, sans-serif; }}
  body {{ margin: 0; background: #f4f6f8; color: #1a1a1a; }}
  header {{ position: sticky; top: 0; background: #0f4c81; color: #fff; padding: 12px 18px; z-index: 5;
           display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }}
  header h1 {{ font-size: 18px; margin: 0; }}
  header .count {{ font-size: 14px; opacity: .9; }}
  header button {{ font-size: 14px; padding: 8px 14px; border: 0; border-radius: 8px; cursor: pointer; }}
  #export {{ background: #ffd166; color: #1a1a1a; font-weight: 600; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; padding: 18px; }}
  .card {{ background: #fff; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.08); overflow: hidden;
          display: flex; flex-direction: column; }}
  .card.done {{ outline: 3px solid #1b7f3b; }}
  .art {{ background: #fafafa; display: flex; align-items: center; justify-content: center; padding: 8px; }}
  .art svg {{ width: 100%; height: auto; max-height: 220px; }}
  .noimg {{ color: #b3261e; padding: 40px 8px; font-weight: 600; }}
  .info {{ padding: 12px 14px 16px; }}
  .info h2 {{ margin: 0 0 2px; font-size: 22px; }}
  .sense {{ margin: 0 0 8px; color: #555; font-style: italic; font-size: 14px; }}
  .def, .vi, .ex, .meta {{ margin: 4px 0; font-size: 14px; line-height: 1.4; }}
  .meta {{ color: #666; font-size: 12px; }}
  .verdicts {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
  .verdicts button.v {{ border: 1.5px solid var(--c); color: var(--c); background: #fff;
                        border-radius: 999px; padding: 6px 10px; font-size: 13px; cursor: pointer; }}
  .verdicts button.v.sel {{ background: var(--c); color: #fff; }}
  .chosen {{ margin-top: 8px; font-size: 13px; font-weight: 600; min-height: 18px; }}
</style></head>
<body>
<header>
  <h1>Vocabulary Garden — Duyệt hình</h1>
  <span class="count">{total} từ cần duyệt · <span id="doneCount">0</span> đã chọn</span>
  <button id="export">⬇ Xuất visual-review-state.json</button>
  <span class="count">Bấm nút xanh “Đúng ✓” khi hình đúng nghĩa. Lựa chọn tự lưu trong trình duyệt.</span>
</header>
<main class="grid">
{cards}
</main>
<script>
const LS_KEY = "vg.visual.review.v1";
function loadState() {{ try {{ return JSON.parse(localStorage.getItem(LS_KEY) || "{{}}"); }} catch (e) {{ return {{}}; }} }}
function saveState(s) {{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }}
let state = loadState();
// Seed from server-exported prev verdicts if localStorage is empty for a card.
document.querySelectorAll(".card").forEach(card => {{
  const wid = card.dataset.wid;
  const prev = card.dataset.prev;
  if (prev && !(wid in state)) state[wid] = prev;
}});
saveState(state);

function refreshDoneCount() {{
  document.getElementById("doneCount").textContent = Object.keys(state).filter(k => state[k]).length;
}}
function applyCard(card) {{
  const wid = card.dataset.wid;
  const v = state[wid];
  card.querySelectorAll("button.v").forEach(b => b.classList.toggle("sel", b.dataset.v === v));
  const chosen = card.querySelector(".chosen");
  if (v) {{ card.classList.add("done"); chosen.textContent = "Đã chọn: " + v; }}
  else {{ card.classList.remove("done"); chosen.textContent = ""; }}
}}
document.querySelectorAll(".card").forEach(card => {{
  applyCard(card);
  card.querySelectorAll("button.v").forEach(btn => {{
    btn.addEventListener("click", () => {{
      const wid = card.dataset.wid;
      state[wid] = (state[wid] === btn.dataset.v) ? "" : btn.dataset.v;
      if (!state[wid]) delete state[wid];
      saveState(state); applyCard(card); refreshDoneCount();
    }});
  }});
}});
refreshDoneCount();

document.getElementById("export").addEventListener("click", () => {{
  const verdicts = [];
  document.querySelectorAll(".card").forEach(card => {{
    const wid = card.dataset.wid;
    if (state[wid]) verdicts.push({{ word_id: wid, verdict: state[wid] }});
  }});
  const out = {{ schema: "vg.visual-review-state.v1", generated_at: new Date().toISOString(),
                count: verdicts.length, verdicts }};
  const blob = new Blob([JSON.stringify(out, null, 2)], {{ type: "application/json" }});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "visual-review-state.json";
  a.click();
}});
</script>
</body></html>"""

    OUT_HTML.write_text(page, encoding="utf-8")
    print(f"Wrote review gallery: {OUT_HTML}")
    print(f"Words needing human review: {total}")
    print("Open it in a browser, click a verdict per word, then 'Xuất' to save")
    print(f"the state file next to it as: {STATE_JSON}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true",
                    help="Show every approved entry with a visual, not just needs_human_review.")
    args = ap.parse_args(argv)
    return build(args.all)


if __name__ == "__main__":
    raise SystemExit(main())
