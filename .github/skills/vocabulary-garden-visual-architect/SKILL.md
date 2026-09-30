---
name: vocabulary-garden-visual-architect
description: Visual Learning Architect rules and generation standards for Read Oasis Vocabulary Garden SVG flashcards. Enforces pedagogical clarity, zero-text policy, 320x240 viewport, high-contrast silhouettes, and spatial/action visual archetypes for Cambridge YLE Starters ESL learners.
---

# Visual Learning Architect — Vocabulary Garden SVG Assets

## Core Mission
Every visual asset in Vocabulary Garden is a pedagogical vector flashcard designed for primary ESL learners (Cambridge YLE Starters).
The visual design must maximize instant word-to-concept recognition without written cues. A beautiful SVG that confuses a 6-year-old learner is a defect.

---

## 1. Non-Negotiable SVG Specifications

| Metric / Rule | Specification | Rationale |
|---|---|---|
| **Viewport** | `viewBox="0 0 320 240"` | Fixed 4:3 aspect ratio uniform across mobile & desktop flashcards |
| **No Text** | **ZERO `<text>` or `<tspan>`** | Audio-visual immersion; prevent learners reading instead of listening & recognizing |
| **Dominance** | Subject spans **60%–75%** of viewport | Immediate legibility even at 64px thumbnail size |
| **Outlines** | `#0f172a` / `#1e293b` with `stroke-width="3"` to `5"` | Sharp silhouette contrast against light backgrounds |
| **Palette** | Vibrant Tailwind-inspired tones (`#ef4444`, `#3b82f6`, `#10b981`, `#f59e0b`) | High visual appeal without muddiness |
| **Background** | Subtle soft rounded card (`rx="16"`) or gradient grounding | Clean canvas, low visual noise |

---

## 2. Categorical Design Archetypes

### Prepositions & Spatial Positions (`under`, `behind`, `inside`, `on`, `between`)
1. **Neutral Anchor**: Grounded reference prop (wooden table `#92400e`, cardboard carton `#d97706`, tree `#15803d`).
2. **Focal Subject**: Vivid, expressive character/object (e.g. orange tabby cat, bright ball).
3. **Directional Cue**: Bright crimson arrow (`#ef4444`, `marker-end`) directly indicating the spatial relationship.
4. **Occlusion Layering**: Respect front-to-back z-ordering (e.g. `behind`: reference object masks lower body of focal character).

### Actions & Verbs (`run`, `jump`, `sit`, `sing`, `sleep`, `cycle`, `cross`)
1. **Dynamic Silhouette**: Angled torso (15-30°), forward momentum, bent knees, dynamic limbs.
2. **Motion Cues**: Dashed motion trails (`stroke-dasharray="4,4"`), airborne dust puffs, musical notes (`sing`), crosswalk zebras (`cross`).
3. **Contextual Anchors**: Include key props (e.g. bicycle for `cycle`, pillow/bed for `sleep`).

### Concrete Objects & Animals (`bear`, `boat`, `apple`, `helicopter`, `kite`)
1. **Prototypical Silhouette**: Emphasize defining species/item traits (e.g. teddy bear rounded ears, helicopter dual rotors & landing skids, boat triangular mainsail).
2. **Friendly Expressions**: Subtle smiling facial features for animals/characters.

### Body Parts (`eye`, `ear`, `nose`, `mouth`, `hair`, `arm`, `hand`, `tail`, etc.)
**Lesson (2026-09-30 redo pass):** an isolated body part floating on the canvas (e.g. a lone nose curve, a pair of lips, faint grey face guide-lines) is NOT legible to a 6-year-old. First-batch versions failed this way.
1. **Full-Context Host**: Draw the body part *on a complete, friendly host* — a whole cartoon child's face for facial features (`eye`/`ear`/`nose`/`mouth`/`hair`), a whole child figure for `arm`/`hand`, a whole animal for `tail`. The host gives the learner an anchor for *where* the part belongs.
2. **Target Enlargement**: Make the target part noticeably larger / bolder than a realistic proportion so it reads as the subject.
3. **Highlight Ring**: Add a bright red (`#ef4444`) dashed ring / outline (`stroke-dasharray="10 7"`, `stroke-width="5"`) directly encircling the target part — the unambiguous "this is the word" cue. For long parts (`arm`), trace a dashed highlight line along the limb plus a ring at the hand.
4. **Reuse the Face Template**: Facial-feature cards share one consistent friendly-face template (skin `#ffe0c2→#fcc79a`, brown hair `#78350f→#451a03`, blue/brown eyes, rosy cheeks `#fb7185` @0.35), varying only which part is enlarged + ringed. Keeps the set visually coherent.

### Colors (`red`, `blue`, `green`, `yellow`, `pink`, `purple`, etc.)
**Lesson (2026-09-30 redo pass):** a single big color blob + brush reads like a candy/sticker, and a wood-colored brush handle adds an off-target hue that confuses the color lesson. Use the palette archetype instead.
1. **Wooden Palette Anchor (REQUIRED)**: A wooden artist palette (`#fde68a`/`#d97706`, thumb-hole) is the stage. Small daubs of *other* colors sit around the rim; the **target color is one dominant central blob** (radial gradient light→mid→dark of the hue). A brush loaded with the *target* color rests on the palette.
2. **Focal Color Dominance**: Target color = the single largest saturated area (dominant blob + matching brush bristles). Other-color daubs stay small so the target hue clearly wins.

---

## 3. Production & Verification Pipeline

```powershell
# 1. Validate SVG schema and zero-text constraint
python read-oasis/tools/validate_vocab.py

# 2. Recompile enrichment shards
python read-oasis/tools/build_enrichment.py

# 3. Execute unit test gate
npm --prefix read-oasis run test:unit
npm --prefix read-oasis run test:py

# 4. Push assets to remote repo
.\push.ps1 read-oasis/content/vocabulary/assets "feat(vocab): update flashcard visual assets"
```
