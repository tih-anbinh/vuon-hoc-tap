# Vocabulary Learning Visual System

> Read Oasis · Vocabulary Garden · Revision 1.0  
> Created: 2026-09-29

## Objective

Design and implement a complete visual-learning layer for Vocabulary Garden.

**This is NOT an SVG generation task. This is a learning-representation system.**

The goal: children should remember vocabulary meaning faster. Visuals must support learning. A useless picture is worse than no picture.

## Critical Principle

DO NOT use a single visual strategy for every word. Every vocabulary entry is classified into exactly one of five visual-learning representations:

| Type | `representation_type` | When to use | Example words |
|---|---|---|---|
| **Scene SVG** | `scene_svg` | Concrete nouns: animals, food, objects, body parts, places, colours | apple, cat, tree, red, ball |
| **Action SVG** | `action_svg` | Verbs: one character, one clear action | run, jump, sit, sing, sleep |
| **Position SVG** | `position_svg` | Prepositions/spatial words: highest educational value | under, behind, inside |
| **Concept Card** | `concept_card` | Abstract adjectives/adverbs where a picture alone can't teach meaning | big/small, happy/sad, empty, heavy |
| **No Visual** | `no_visual_needed` | Proper names, function words with no visual teaching value | Alex, Tom |

## Schema (in `teaching.visual`)

```json
{
  "representation_type": "position_svg",
  "visual_priority": "high",
  "asset_id": "vg-position-under-v1",
  "asset": null,
  "alt": "A cat sleeping under a table",
  "status": "not_started",
  "kind": "position",
  "template": "cat_and_table",
  "anchor_objects": ["cat", "table"]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `representation_type` | enum | One of the 5 types above. Drives rendering strategy. |
| `visual_priority` | `high\|medium\|low\|none` | How important a visual is for learning this word. |
| `asset_id` | string\|null | Identifier for the visual asset (e.g. `vg-scene-apple-v1`). Null until created. |
| `asset` | string\|null | Relative path to the asset file. Null until created. |
| `alt` | string\|null | Accessible description. |
| `status` | enum | `not_started → draft → approved → not_applicable` |
| `kind` | enum | Legacy field. Maps to representation_type for backward compat. |
| `template` | string\|null | For `position_svg`: reusable template name. |
| `anchor_objects` | string[] | For `position_svg`: objects demonstrating the spatial relationship. |

## Current Classification (60 approved words)

| Type | Count | Words |
|---|---|---|
| `scene_svg` | 38 | apple, arm, baby, ball, banana, bed, bird, blue, book, bread, brother, cat, chair, cow, dog, duck, ear, egg, elephant, eye, father, frog, green, hair, hand, horse, kite, milk, mother, mouth, nose, red, sister, sun, tail, tree, umbrella, yellow |
| `action_svg` | 7 | cross, cycle, jump, run, sing, sit, sleep |
| `position_svg` | 3 | behind, inside, under |
| `concept_card` | 12 | big, dry, empty, happy, heavy, midday, new, old, sad, slow, small, still |
| `no_visual_needed` | 0 | (none in current approved set) |

### Priority breakdown

- **high**: 51 words (immediate visual value)
- **medium**: 7 words (helpful but not critical)
- **low**: 2 words (still, midday — abstract, low visual ROI)

## Visual Taxonomy Details

### Type A: Scene SVG (`scene_svg`)

**Used for:** animals, food, transport, home objects, school objects, body parts, weather, toys, places, colours.

**Visual style:**
- Read Oasis style: rounded shapes, soft colours, friendly faces
- Large focal object, simple background, no clutter
- No text inside SVG, single concept only
- Pure SVG (no raster, no embedded fonts, no external assets)
- Responsive, accessible

**Every SVG must contain:**
```xml
<title>Dog</title>
<desc>A friendly brown dog standing on grass.</desc>
```

### Type B: Action SVG (`action_svg`)

**Used for:** verbs.

**Visual style:**
- One character, one action
- Action obvious within 2 seconds
- No secondary actions, no unnecessary scenery
- Use consistent Read Oasis characters (Mo, Nia, Ben)
- Character system must be reusable across action SVGs

**Goal:** Understand verb meaning without reading the definition.

### Type C: Position SVG (`position_svg`)

**Highest educational value.** Used for spatial prepositions.

**Visual style:**
- Reusable visual templates (not separate art per word)
- Same anchor objects in different positions teach the relationship
- Example: cat + table → under / on / next to

**Schema includes `template` and `anchor_objects`** so the same base scene can be reused.

**Goal:** Teach spatial relationships, not object recognition.

### Type D: Concept Card (`concept_card`)

**Used when a normal picture cannot clearly teach meaning.** Abstract adjectives, adverbs, contrast pairs.

**NOT decorative SVG scenes.** Structured learning cards rendered in HTML/CSS:

```
┌─────────────────────────────┐
│  ✓  She is happy when she   │  (example — green accent)
│     plays with friends.     │
├─────────────────────────────┤
│  ✗  He is sad because he    │  (non-example — warm tint)
│     lost his toy.           │
└─────────────────────────────┘
```

**Goal:** Teach relationship/contrast, not object recognition.

### Type E: No Visual Needed (`no_visual_needed`)

**Used for:** proper names, function words with no visual teaching value.

No SVG created. No concept card created. Status: `not_applicable`.

## Global SVG Style Guide

All generated SVG assets must share one visual language:

- Rounded shapes, soft colours
- Friendly facial features
- Low visual density, thick outlines
- Large silhouettes, high readability on tablets and TVs
- Pure SVG: no raster images, no embedded fonts, no external assets
- Responsive and accessible
- Target age: 6–10

## Asset Generation Strategy

**DO NOT generate all SVGs at once.**

### Step 1: Classify
Run `python tools/vocab/classify_visuals.py` → `visual-classification.json`

### Step 2: Review statistics
```
scene_svg:          38
action_svg:          7
position_svg:        3
concept_card:       12
no_visual_needed:    0
```

### Step 3: Create reusable template families
- Position templates (cat+table, dog+door, toy+box)
- Action character set (Mo, Nia, Ben)
- Scene object library (shared style)

### Step 4: Generate assets incrementally
Batch by letter groups: A–C, D–F, G–I, etc.

## Validation

Gate 8 in `tools/vocab/validate_vocab.py` enforces:

| Rule | Check |
|---|---|
| PASS | Every approved entry has a valid `representation_type` |
| PASS | Every approved entry has a valid `visual_priority` |
| PASS | `position_svg` entries have `anchor_objects` |
| PASS | `no_visual_needed` entries have priority `none` |
| FAIL | Missing `representation_type` on approved entry |
| FAIL | Invalid enum value |
| FAIL | Position word without anchor objects |

## Rendering (in `src/vocab-garden.mjs`)

The basket card renders differently per type:

- **scene_svg / action_svg**: Shows SVG asset when available; text-only until then
- **position_svg**: Structured position diagram (anchor objects + position label + example)
- **concept_card**: Contrast panels (✓ example / ✗ non-example)
- **no_visual_needed**: Text only

Visual type badges show on each card: "Picture word", "Action word", "Position word", "Idea word".

## Success Criteria

The final system should help a child:

```
see → understand → remember → use
```

Instead of:

```
see random picture → forget word
```

**Visual usefulness is more important than visual quantity.**

## What makes Read Oasis different

```
Story + Vocabulary + Visual Meaning + Context + Spaced Review
```

Priority order for visual investment:
1. **Position SVG** — highest educational ROI
2. **Action SVG** — verbs are hard to learn from text alone
3. **Concept Card** — already rendered in HTML (no asset needed)
4. **Scene SVG** — concrete nouns are easiest to learn; visuals help but aren't critical
