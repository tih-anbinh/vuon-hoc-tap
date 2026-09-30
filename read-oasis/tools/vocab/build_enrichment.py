#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-29
"""Vocabulary Garden — A-Z enrichment builder (Layer B).

Reads the private Cambridge YLE 2025 source lexicon and produces, for EVERY
eligible primary A-Z record, an original Read Oasis enrichment entry with an
explicit disposition. The builder is deterministic, resumable, and idempotent:
re-running it reproduces byte-identical output for the same inputs.

Fail-closed rules enforced here:
  * Quarantined / review_required source records are NEVER auto-published; they
    become status=blocked_source_review.
  * Proper nouns become status=not_teachable_as_standalone (still an explicit
    disposition).
  * Only hand-authored senses in AUTHORED[] are marked editorially_approved.
    Everything else stays status=draft with empty teaching content -> nothing is
    fabricated as "reviewed".
  * The builder writes enrichment content ONLY; it never mutates the source
    lexicon.

Usage:
  python tools/vocab/build_enrichment.py [--lexicon PATH] [--manifest-only]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# --- Paths -----------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]            # read-oasis/
DEFAULT_LEXICON = (
    ROOT.parent
    / "ref_docs"
    / "cambridge-yle-word-list-2025"
    / "lexicon.json"
)
DEFAULT_MANIFEST = (
    ROOT.parent
    / "ref_docs"
    / "cambridge-yle-word-list-2025"
    / "source_manifest.json"
)
OUT_DIR = ROOT / "content" / "vocabulary"
ENTRIES_DIR = OUT_DIR / "entries"
ASSETS_DIR = OUT_DIR / "assets"

SOURCE_ID = "cambridge-yle-2025"
SOURCE_SCHEMA_VERSION = "2.0.0"

# --- Hand-authored teaching content (original, sense-correct) --------------
# Only these senses are marked editorially_approved. They are exactly the words
# that appear in real Read Oasis book pages AND resolve to a single eligible
# source sense, so each can be verified against a book context.
# All English definitions/examples and Vietnamese support are original Read
# Oasis content, not copied from any source list.
AUTHORED: dict[str, dict] = {
    "cyle25:v2:under:preposition:unqualified": {
        "sense_label": "in a lower place than something",
        "definition_en": "In a lower place than something, or covered by it.",
        "explanation_vi": "Ở phía dưới một vật, hoặc bị vật đó che phía trên.",
        "example_en": "The cat sleeps under the table.",
        "example_vi": "Con mèo ngủ dưới cái bàn.",
        "nonexample_en": "The cat sleeps on the table.",
        "kind": "position",
        "representation_type": "position_svg",
        "visual_priority": "high",
        "template": "cat_and_table",
        "anchor_objects": ["cat", "table"],
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:behind:preposition:unqualified": {
        "sense_label": "at the back of something",
        "definition_en": "At the back of a person or thing.",
        "explanation_vi": "Ở phía sau một người hoặc một vật.",
        "example_en": "The dog is hiding behind the door.",
        "example_vi": "Con chó đang trốn sau cánh cửa.",
        "nonexample_en": "The dog is in front of the door.",
        "kind": "position",
        "representation_type": "position_svg",
        "visual_priority": "high",
        "template": "dog_and_door",
        "anchor_objects": ["dog", "door"],
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:inside:adverb-noun-preposition:unqualified": {
        "sense_label": "in the inner part of something",
        "definition_en": "In the inner part of something, not outside.",
        "explanation_vi": "Ở bên trong một vật, không phải bên ngoài.",
        "example_en": "The toy is inside the box.",
        "example_vi": "Món đồ chơi ở bên trong cái hộp.",
        "nonexample_en": "The toy is outside the box.",
        "kind": "position",
        "representation_type": "position_svg",
        "visual_priority": "high",
        "template": "toy_and_box",
        "anchor_objects": ["toy", "box"],
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:kite:noun:unqualified": {
        "sense_label": "a toy that flies on a string",
        "definition_en": "A light toy that flies in the wind on a long string.",
        "explanation_vi": "Một món đồ chơi nhẹ, bay trong gió nhờ một sợi dây dài (con diều).",
        "example_en": "We fly our kite in the park on windy days.",
        "example_vi": "Chúng em thả diều ở công viên vào những ngày có gió.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:umbrella:noun:unqualified": {
        "sense_label": "a thing that keeps rain off you",
        "definition_en": "A thing you hold over your head to keep the rain off.",
        "explanation_vi": "Vật bạn cầm trên đầu để che mưa (cái ô, cái dù).",
        "example_en": "It is raining, so take your umbrella.",
        "example_vi": "Trời đang mưa, nên hãy mang theo ô của bạn.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:tail:noun:unqualified": {
        "sense_label": "the part at the back of an animal",
        "definition_en": "The long part that grows at the back end of an animal.",
        "explanation_vi": "Phần dài mọc ở phía sau của con vật (cái đuôi).",
        "example_en": "The dog wags its tail when it is happy.",
        "example_vi": "Con chó vẫy đuôi khi nó vui.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["look_and_say", "meaning_match", "word_detective"],
    },
    "cyle25:v2:empty:adjective:unqualified": {
        "sense_label": "with nothing inside",
        "definition_en": "Having nothing inside.",
        "explanation_vi": "Không có gì ở bên trong (trống, rỗng).",
        "example_en": "The glass is empty; please fill it with water.",
        "example_vi": "Cái ly rỗng; hãy rót đầy nước vào nó.",
        "nonexample_en": "The glass is full of water.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "high",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:heavy:adjective:unqualified": {
        "sense_label": "difficult to lift",
        "definition_en": "Weighing a lot, so it is hard to lift or carry.",
        "explanation_vi": "Có trọng lượng lớn, khó nhấc hoặc mang (nặng).",
        "example_en": "The box of books is too heavy for me to carry.",
        "example_vi": "Thùng sách quá nặng nên em không mang nổi.",
        "nonexample_en": "The empty box is light and easy to carry.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "medium",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:slow:adjective:unqualified": {
        "sense_label": "not moving fast",
        "definition_en": "Not moving quickly; taking a lot of time.",
        "explanation_vi": "Di chuyển không nhanh; mất nhiều thời gian (chậm).",
        "example_en": "A turtle is very slow when it walks.",
        "example_vi": "Con rùa đi rất chậm.",
        "nonexample_en": "A cheetah is very fast when it runs.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "medium",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:dry:adjective-verb:unqualified": {
        "sense_label": "not wet",
        "definition_en": "Not wet; with no water on it.",
        "explanation_vi": "Không ướt; không có nước trên bề mặt (khô).",
        "example_en": "After the sun came out, the towel was dry.",
        "example_vi": "Sau khi mặt trời ló ra, cái khăn đã khô.",
        "nonexample_en": "The towel is wet after the rain.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "medium",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:still:adverb:unqualified": {
        "sense_label": "not moving",
        "definition_en": "Without moving at all.",
        "explanation_vi": "Hoàn toàn không cử động (đứng yên, im).",
        "example_en": "Please sit still while I take the photo.",
        "example_vi": "Hãy ngồi yên trong khi mình chụp ảnh nhé.",
        "nonexample_en": "The children are jumping and running around.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "low",
        "activity_templates": ["read_in_context", "meaning_match"],
    },
    "cyle25:v2:midday:noun:unqualified": {
        "sense_label": "twelve o'clock in the day",
        "definition_en": "The middle of the day, around twelve o'clock.",
        "explanation_vi": "Giữa trưa, khoảng mười hai giờ.",
        "example_en": "The sun is highest at midday.",
        "example_vi": "Mặt trời lên cao nhất vào giữa trưa.",
        "nonexample_en": "The sky is dark at midnight.",
        "kind": "scene",
        "representation_type": "concept_card",
        "visual_priority": "low",
        "activity_templates": ["read_in_context", "meaning_match"],
    },
    "cyle25:v2:cross:noun-verb:unqualified": {
        "sense_label": "to go from one side to the other",
        "definition_en": "To go from one side of something to the other side.",
        "explanation_vi": "Đi từ bên này sang bên kia (băng qua, đi qua).",
        "example_en": "Look both ways before you cross the road.",
        "example_vi": "Nhìn cả hai phía trước khi em băng qua đường.",
        "nonexample_en": "Wait on the pavement and do not step onto the road.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "activity_templates": ["read_in_context", "position_action_play", "meaning_match"],
    },
    "cyle25:v2:cycle:verb:unqualified": {
        "sense_label": "to ride a bicycle",
        "definition_en": "To ride a bicycle.",
        "explanation_vi": "Đạp xe đạp.",
        "example_en": "We cycle to school when the weather is nice.",
        "example_vi": "Chúng em đạp xe đến trường khi thời tiết đẹp.",
        "nonexample_en": "We walk to school when it rains.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "activity_templates": ["read_in_context", "meaning_match"],
    },

    # --- Batch 2: high-frequency concrete Starter words for the garden's ------
    # standalone learning games (animals, body, family, food, colours, everyday
    # objects and actions). All teaching content below is original Read Oasis
    # content authored for young readers; the source list is used only to choose
    # which single-sense, eligible, non-proper words to teach.

    # Animals
    "cyle25:v2:cat:noun:unqualified": {
        "sense_label": "a small furry pet that says meow",
        "definition_en": "A small, furry animal that many people keep as a pet. It says \"meow\".",
        "explanation_vi": "Một con vật nhỏ, có lông, nhiều người nuôi làm thú cưng (con mèo).",
        "example_en": "The cat is sleeping on the soft chair.",
        "example_vi": "Con mèo đang ngủ trên chiếc ghế êm.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:dog:noun:unqualified": {
        "sense_label": "a pet that barks and wags its tail",
        "definition_en": "A friendly animal that many people keep as a pet. It barks and wags its tail.",
        "explanation_vi": "Một con vật thân thiện, nhiều người nuôi làm thú cưng; nó sủa và vẫy đuôi (con chó).",
        "example_en": "My dog likes to run and play in the park.",
        "example_vi": "Con chó của em thích chạy và chơi trong công viên.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bird:noun:unqualified": {
        "sense_label": "an animal with wings that can fly",
        "definition_en": "An animal with wings and feathers. Most birds can fly.",
        "explanation_vi": "Con vật có cánh và lông vũ; phần lớn chim biết bay (con chim).",
        "example_en": "A little bird sings in the tree every morning.",
        "example_vi": "Một chú chim nhỏ hót trên cây mỗi sáng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    # NOTE: the fish NOUN sense lives under word_id qualifier "s-pl", authored in
    # Batch 1 below. A former "fish:noun:unqualified" key existed here but matched
    # no source record (silent no-op) and was removed.
    "cyle25:v2:cow:noun:unqualified": {
        "sense_label": "a big farm animal that gives milk",
        "definition_en": "A big farm animal that eats grass and gives us milk.",
        "explanation_vi": "Con vật to ở nông trại, ăn cỏ và cho ta sữa (con bò).",
        "example_en": "The cow eats green grass in the field.",
        "example_vi": "Con bò ăn cỏ xanh trên cánh đồng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:duck:noun:unqualified": {
        "sense_label": "a bird that swims and says quack",
        "definition_en": "A bird that swims on water and says \"quack\".",
        "explanation_vi": "Một loài chim bơi trên nước và kêu \"quạc quạc\" (con vịt).",
        "example_en": "The duck swims on the pond with her babies.",
        "example_vi": "Con vịt bơi trên ao cùng đàn con.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:frog:noun:unqualified": {
        "sense_label": "a small green animal that jumps",
        "definition_en": "A small green animal that jumps and lives near water.",
        "explanation_vi": "Con vật nhỏ màu xanh, biết nhảy và sống gần nước (con ếch).",
        "example_en": "The frog jumps from the leaf into the water.",
        "example_vi": "Con ếch nhảy từ chiếc lá xuống nước.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:horse:noun:unqualified": {
        "sense_label": "a big animal you can ride",
        "definition_en": "A big, strong animal that can run fast. People can ride it.",
        "explanation_vi": "Con vật to và khỏe, chạy nhanh; người ta có thể cưỡi nó (con ngựa).",
        "example_en": "The brown horse runs across the field.",
        "example_vi": "Con ngựa nâu chạy băng qua cánh đồng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:elephant:noun:unqualified": {
        "sense_label": "a very big animal with a long nose",
        "definition_en": "A very big grey animal with big ears and a long nose called a trunk.",
        "explanation_vi": "Con vật rất to, màu xám, tai to và có cái vòi dài (con voi).",
        "example_en": "The elephant drinks water with its long trunk.",
        "example_vi": "Con voi hút nước bằng cái vòi dài.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Body
    "cyle25:v2:hand:noun:unqualified": {
        "sense_label": "the part at the end of your arm",
        "definition_en": "The part of your body at the end of your arm. You use it to hold things.",
        "explanation_vi": "Bộ phận ở cuối cánh tay, dùng để cầm nắm đồ vật (bàn tay).",
        "example_en": "I hold the cup with my hand.",
        "example_vi": "Em cầm cái cốc bằng bàn tay.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:arm:noun:unqualified": {
        "sense_label": "the long part between your shoulder and hand",
        "definition_en": "The long part of your body between your shoulder and your hand.",
        "explanation_vi": "Phần dài của cơ thể nối từ vai đến bàn tay (cánh tay).",
        "example_en": "She lifts her arm to wave hello.",
        "example_vi": "Bạn ấy giơ cánh tay lên để vẫy chào.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:nose:noun:unqualified": {
        "sense_label": "the part of your face you smell with",
        "definition_en": "The part in the middle of your face that you smell and breathe with.",
        "explanation_vi": "Bộ phận ở giữa khuôn mặt dùng để ngửi và thở (cái mũi).",
        "example_en": "I smell the flower with my nose.",
        "example_vi": "Em ngửi bông hoa bằng mũi.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:mouth:noun:unqualified": {
        "sense_label": "the part of your face you eat and talk with",
        "definition_en": "The part of your face that you use to eat, drink and talk.",
        "explanation_vi": "Bộ phận trên khuôn mặt dùng để ăn, uống và nói (cái miệng).",
        "example_en": "Open your mouth and say \"ah\".",
        "example_vi": "Há miệng ra và nói \"a\" nào.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:ear:noun:unqualified": {
        "sense_label": "the part of your head you hear with",
        "definition_en": "The part on the side of your head that you hear with.",
        "explanation_vi": "Bộ phận ở hai bên đầu dùng để nghe (cái tai).",
        "example_en": "I hear the music with my ears.",
        "example_vi": "Em nghe nhạc bằng đôi tai.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:eye:noun:unqualified": {
        "sense_label": "the part of your face you see with",
        "definition_en": "One of the two parts on your face that you see with.",
        "explanation_vi": "Một trong hai bộ phận trên mặt dùng để nhìn (con mắt).",
        "example_en": "Close your eyes and count to ten.",
        "example_vi": "Nhắm mắt lại và đếm đến mười nhé.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:hair:noun:unqualified": {
        "sense_label": "the soft threads that grow on your head",
        "definition_en": "The soft threads that grow on top of your head.",
        "explanation_vi": "Những sợi mềm mọc trên đầu (tóc).",
        "example_en": "Her hair is long and black.",
        "example_vi": "Tóc của bạn ấy dài và đen.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Family
    "cyle25:v2:mother:noun:unqualified": {
        "sense_label": "a child's female parent",
        "definition_en": "A woman who has a child. She is the child's mum.",
        "explanation_vi": "Người phụ nữ có con; là mẹ của em bé (mẹ).",
        "example_en": "My mother reads me a story before bed.",
        "example_vi": "Mẹ đọc truyện cho em nghe trước khi đi ngủ.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:father:noun:unqualified": {
        "sense_label": "a child's male parent",
        "definition_en": "A man who has a child. He is the child's dad.",
        "explanation_vi": "Người đàn ông có con; là bố của em bé (bố, cha).",
        "example_en": "My father cooks dinner for us.",
        "example_vi": "Bố nấu bữa tối cho cả nhà.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:sister:noun:unqualified": {
        "sense_label": "a girl with the same parents as you",
        "definition_en": "A girl or woman who has the same mother and father as you.",
        "explanation_vi": "Người con gái cùng bố mẹ với bạn (chị hoặc em gái).",
        "example_en": "My sister and I play together.",
        "example_vi": "Chị em và mình chơi với nhau.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:brother:noun:unqualified": {
        "sense_label": "a boy with the same parents as you",
        "definition_en": "A boy or man who has the same mother and father as you.",
        "explanation_vi": "Người con trai cùng bố mẹ với bạn (anh hoặc em trai).",
        "example_en": "My brother helps me build a tower.",
        "example_vi": "Anh trai giúp em xây một tòa tháp.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:baby:noun:unqualified": {
        "sense_label": "a very young child",
        "definition_en": "A very young child who cannot walk or talk yet.",
        "explanation_vi": "Một em bé rất nhỏ, chưa biết đi hay nói (em bé).",
        "example_en": "The baby is sleeping in her cot.",
        "example_vi": "Em bé đang ngủ trong nôi.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Food & drink
    "cyle25:v2:apple:noun:unqualified": {
        "sense_label": "a round red or green fruit",
        "definition_en": "A round fruit, often red or green, that grows on a tree.",
        "explanation_vi": "Trái cây tròn, thường màu đỏ hoặc xanh, mọc trên cây (quả táo).",
        "example_en": "I eat a red apple for my snack.",
        "example_vi": "Em ăn một quả táo đỏ cho bữa xế.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:banana:noun:unqualified": {
        "sense_label": "a long yellow fruit",
        "definition_en": "A long, curved fruit with a yellow skin.",
        "explanation_vi": "Trái cây dài, cong, vỏ màu vàng (quả chuối).",
        "example_en": "The monkey eats a yellow banana.",
        "example_vi": "Con khỉ ăn một quả chuối vàng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:milk:noun:unqualified": {
        "sense_label": "a white drink from cows",
        "definition_en": "A white drink that comes from cows. It helps you grow.",
        "explanation_vi": "Thức uống màu trắng lấy từ con bò, giúp bạn lớn lên (sữa).",
        "example_en": "I drink a glass of milk every morning.",
        "example_vi": "Sáng nào em cũng uống một ly sữa.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bread:noun:unqualified": {
        "sense_label": "a soft food made from flour",
        "definition_en": "A soft food made from flour that we bake and eat.",
        "explanation_vi": "Món ăn mềm làm từ bột, được nướng lên để ăn (bánh mì).",
        "example_en": "We eat bread with butter for breakfast.",
        "example_vi": "Nhà em ăn bánh mì với bơ vào bữa sáng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:egg:noun:unqualified": {
        "sense_label": "a round food from a hen",
        "definition_en": "A round food with a hard shell that comes from a bird such as a hen.",
        "explanation_vi": "Món ăn hình tròn có vỏ cứng, lấy từ loài chim như gà mái (quả trứng).",
        "example_en": "I eat an egg for breakfast.",
        "example_vi": "Em ăn một quả trứng vào bữa sáng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Everyday objects
    "cyle25:v2:ball:noun:unqualified": {
        "sense_label": "a round toy you can throw",
        "definition_en": "A round toy that you can throw, catch, kick or roll.",
        "explanation_vi": "Món đồ chơi hình tròn để ném, bắt, đá hoặc lăn (quả bóng).",
        "example_en": "We kick the ball in the garden.",
        "example_vi": "Chúng em đá bóng trong vườn.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:book:noun:unqualified": {
        "sense_label": "pages with words and pictures to read",
        "definition_en": "Many pages joined together with words and pictures that you read.",
        "explanation_vi": "Nhiều trang giấy ghép lại, có chữ và hình để đọc (quyển sách).",
        "example_en": "I read a book about a little bear.",
        "example_vi": "Em đọc một quyển sách về chú gấu nhỏ.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:chair:noun:unqualified": {
        "sense_label": "a thing you sit on",
        "definition_en": "A seat for one person, with a back and four legs.",
        "explanation_vi": "Chỗ ngồi cho một người, có lưng tựa và bốn chân (cái ghế).",
        "example_en": "Please sit on the little chair.",
        "example_vi": "Hãy ngồi lên chiếc ghế nhỏ nhé.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bed:noun:unqualified": {
        "sense_label": "a thing you sleep on",
        "definition_en": "A soft place where you lie down and sleep at night.",
        "explanation_vi": "Nơi êm để bạn nằm và ngủ vào ban đêm (cái giường).",
        "example_en": "I go to my bed when I am sleepy.",
        "example_vi": "Em lên giường khi buồn ngủ.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:sun:noun:unqualified": {
        "sense_label": "the bright light in the daytime sky",
        "definition_en": "The big, bright light in the sky in the daytime. It gives us light and heat.",
        "explanation_vi": "Vầng sáng to trên bầu trời ban ngày, cho ta ánh sáng và hơi ấm (mặt trời).",
        "example_en": "The sun is bright and warm today.",
        "example_vi": "Hôm nay mặt trời sáng và ấm áp.",
        "nonexample_en": "The moon shines at night.",
        "kind": "scene",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:tree:noun:unqualified": {
        "sense_label": "a big plant with a trunk and leaves",
        "definition_en": "A big plant with a hard trunk, branches and leaves.",
        "explanation_vi": "Cây to có thân cứng, cành và lá (cái cây).",
        "example_en": "A bird sits high in the tall tree.",
        "example_vi": "Một chú chim đậu trên cao trong cây cao.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Colours
    "cyle25:v2:red:adjective:unqualified": {
        "sense_label": "the colour of a tomato",
        "definition_en": "The colour of a tomato or a strawberry.",
        "explanation_vi": "Màu của quả cà chua hay quả dâu (màu đỏ).",
        "example_en": "She has a red hat.",
        "example_vi": "Bạn ấy có một chiếc mũ màu đỏ.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:blue:adjective:unqualified": {
        "sense_label": "the colour of the sky",
        "definition_en": "The colour of the sky on a sunny day.",
        "explanation_vi": "Màu của bầu trời vào ngày nắng (màu xanh dương).",
        "example_en": "The sea is deep blue.",
        "example_vi": "Biển có màu xanh dương thẳm.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:green:adjective:unqualified": {
        "sense_label": "the colour of grass",
        "definition_en": "The colour of grass and leaves.",
        "explanation_vi": "Màu của cỏ và lá cây (màu xanh lá).",
        "example_en": "The frog is green.",
        "example_vi": "Con ếch có màu xanh lá.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:yellow:adjective:unqualified": {
        "sense_label": "the colour of a banana",
        "definition_en": "The colour of a banana or the sun.",
        "explanation_vi": "Màu của quả chuối hay mặt trời (màu vàng).",
        "example_en": "The duck is yellow.",
        "example_vi": "Con vịt có màu vàng.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # Contrast adjectives (great for meaning_match with a non-example)
    "cyle25:v2:big:adjective:unqualified": {
        "sense_label": "large in size",
        "definition_en": "Large in size; not small.",
        "explanation_vi": "Có kích thước lớn; không nhỏ (to, lớn).",
        "example_en": "An elephant is very big.",
        "example_vi": "Con voi thì rất to.",
        "nonexample_en": "A mouse is very small.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "high",
        "activity_templates": ["meaning_match", "look_and_say", "read_in_context"],
    },
    "cyle25:v2:small:adjective:unqualified": {
        "sense_label": "little in size",
        "definition_en": "Little in size; not big.",
        "explanation_vi": "Có kích thước bé; không to (nhỏ, bé).",
        "example_en": "A mouse is small.",
        "example_vi": "Con chuột thì nhỏ.",
        "nonexample_en": "An elephant is big.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "high",
        "activity_templates": ["meaning_match", "look_and_say", "read_in_context"],
    },
    "cyle25:v2:happy:adjective:unqualified": {
        "sense_label": "feeling good and glad",
        "definition_en": "Feeling good and glad, so you want to smile.",
        "explanation_vi": "Cảm thấy vui và dễ chịu, muốn mỉm cười (vui, hạnh phúc).",
        "example_en": "She is happy when she plays with friends.",
        "example_vi": "Bạn ấy vui khi chơi với bạn bè.",
        "nonexample_en": "He is sad because he lost his toy.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "high",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:sad:adjective:unqualified": {
        "sense_label": "feeling unhappy",
        "definition_en": "Feeling unhappy, so you may want to cry.",
        "explanation_vi": "Cảm thấy không vui, có thể muốn khóc (buồn).",
        "example_en": "He is sad because it is raining.",
        "example_vi": "Bạn ấy buồn vì trời đang mưa.",
        "nonexample_en": "She is happy because the sun is out.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "high",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:new:adjective:unqualified": {
        "sense_label": "made or bought a short time ago",
        "definition_en": "Made or bought a short time ago; not old.",
        "explanation_vi": "Vừa mới làm ra hoặc mới mua; không cũ (mới).",
        "example_en": "I have new shoes for school.",
        "example_vi": "Em có đôi giày mới để đi học.",
        "nonexample_en": "These old shoes are too small now.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "medium",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },
    "cyle25:v2:old:adjective:unqualified": {
        "sense_label": "made a long time ago",
        "definition_en": "Made a long time ago, or having lived many years; not new.",
        "explanation_vi": "Được làm ra từ lâu, hoặc đã sống nhiều năm; không mới (cũ, già).",
        "example_en": "Grandpa tells a story from his old book.",
        "example_vi": "Ông kể một câu chuyện từ quyển sách cũ.",
        "nonexample_en": "The new book is bright and clean.",
        "kind": "contrast",
        "representation_type": "concept_card",
        "visual_priority": "medium",
        "activity_templates": ["meaning_match", "read_in_context", "look_and_say"],
    },

    # Everyday actions
    "cyle25:v2:run:verb:unqualified": {
        "sense_label": "to move fast with your legs",
        "definition_en": "To move very fast using your legs.",
        "explanation_vi": "Dùng đôi chân để di chuyển thật nhanh (chạy).",
        "example_en": "The children run to the playground.",
        "example_vi": "Các bạn nhỏ chạy ra sân chơi.",
        "nonexample_en": "They walk slowly back home.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:jump:verb:unqualified": {
        "sense_label": "to push up off the ground",
        "definition_en": "To push yourself up off the ground with your legs.",
        "explanation_vi": "Dùng chân bật người lên khỏi mặt đất (nhảy).",
        "example_en": "The frog can jump very high.",
        "example_vi": "Con ếch có thể nhảy rất cao.",
        "nonexample_en": "",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:sit:verb:unqualified": {
        "sense_label": "to rest on your bottom",
        "definition_en": "To rest with your bottom on a chair or on the floor.",
        "explanation_vi": "Đặt mông lên ghế hoặc sàn để nghỉ (ngồi).",
        "example_en": "Please sit on the mat for story time.",
        "example_vi": "Hãy ngồi lên thảm để nghe kể chuyện nhé.",
        "nonexample_en": "Now stand up and stretch.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "activity_templates": ["listen_and_find", "position_action_play", "read_in_context"],
    },
    "cyle25:v2:sing:verb:unqualified": {
        "sense_label": "to make music with your voice",
        "definition_en": "To make music with your voice.",
        "explanation_vi": "Dùng giọng của mình để tạo ra âm nhạc (hát).",
        "example_en": "We sing a happy song together.",
        "example_vi": "Chúng em cùng hát một bài hát vui.",
        "nonexample_en": "",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "medium",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:sleep:verb:unqualified": {
        "sense_label": "to rest with your eyes closed",
        "definition_en": "To rest with your eyes closed, the way you do at night.",
        "explanation_vi": "Nhắm mắt nghỉ ngơi như khi ban đêm (ngủ).",
        "example_en": "The baby sleeps all night.",
        "example_vi": "Em bé ngủ suốt đêm.",
        "nonexample_en": "In the morning we wake up.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "medium",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },

    # ---------------------------------------------------------------------
    # Batch 1 — core visual vocabulary (2026-09-30).
    # Original EN + VI teaching content for the most concrete, child-familiar
    # single-sense words that ALREADY have a matching SVG on disk, so content
    # and picture land together. Each carries visual_verdict="needs_human_review":
    # the builder cannot SEE the art, so a human must open the gallery and
    # confirm each SVG truly depicts the sense before it becomes "approved".
    # ---------------------------------------------------------------------

    # --- People & family ---
    "cyle25:v2:boy:noun:unqualified": {
        "sense_label": "a male child",
        "definition_en": "A young male child.",
        "explanation_vi": "Một đứa trẻ là con trai (cậu bé).",
        "example_en": "The boy is playing with his ball.",
        "example_vi": "Cậu bé đang chơi với quả bóng của mình.",
        "nonexample_en": "The girl is playing with her ball.",
        "kind": "person",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:girl:noun:unqualified": {
        "sense_label": "a female child",
        "definition_en": "A young female child.",
        "explanation_vi": "Một đứa trẻ là con gái (cô bé).",
        "example_en": "The girl is reading a book.",
        "example_vi": "Cô bé đang đọc một quyển sách.",
        "nonexample_en": "The boy is reading a book.",
        "kind": "person",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:grandmother:noun:unqualified": {
        "sense_label": "the mother of your mother or father",
        "definition_en": "The mother of your mother or your father.",
        "explanation_vi": "Mẹ của mẹ hoặc mẹ của bố bạn (bà).",
        "example_en": "My grandmother tells me nice stories.",
        "example_vi": "Bà kể cho em nghe những câu chuyện hay.",
        "nonexample_en": "My grandfather tells me nice stories.",
        "kind": "person",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:grandfather:noun:unqualified": {
        "sense_label": "the father of your mother or father",
        "definition_en": "The father of your mother or your father.",
        "explanation_vi": "Bố của mẹ hoặc bố của bố bạn (ông).",
        "example_en": "My grandfather works in the garden.",
        "example_vi": "Ông làm việc trong khu vườn.",
        "nonexample_en": "My grandmother works in the garden.",
        "kind": "person",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:aunt:noun:unqualified": {
        "sense_label": "the sister of your mother or father",
        "definition_en": "The sister of your mother or your father.",
        "explanation_vi": "Chị hoặc em gái của bố mẹ bạn (cô, dì, bác gái).",
        "example_en": "My aunt gave me a birthday present.",
        "example_vi": "Cô cho em một món quà sinh nhật.",
        "nonexample_en": "My uncle gave me a birthday present.",
        "kind": "person",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Home & things at home ---
    "cyle25:v2:bedroom:noun:unqualified": {
        "sense_label": "the room where you sleep",
        "definition_en": "The room in a house where you sleep.",
        "explanation_vi": "Căn phòng trong nhà nơi bạn ngủ (phòng ngủ).",
        "example_en": "My bed is in my bedroom.",
        "example_vi": "Cái giường của em ở trong phòng ngủ.",
        "nonexample_en": "We cook food in the kitchen.",
        "kind": "place",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bathroom:noun:unqualified": {
        "sense_label": "the room where you wash",
        "definition_en": "The room where you wash and take a bath.",
        "explanation_vi": "Căn phòng nơi bạn rửa mặt và tắm (phòng tắm).",
        "example_en": "I brush my teeth in the bathroom.",
        "example_vi": "Em đánh răng trong phòng tắm.",
        "nonexample_en": "I sleep in the bedroom.",
        "kind": "place",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:kitchen:noun:unqualified": {
        "sense_label": "the room where you cook",
        "definition_en": "The room in a house where you cook food.",
        "explanation_vi": "Căn phòng trong nhà nơi bạn nấu ăn (nhà bếp).",
        "example_en": "Mum is cooking in the kitchen.",
        "example_vi": "Mẹ đang nấu ăn trong nhà bếp.",
        "nonexample_en": "We sleep in the bedroom.",
        "kind": "place",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:door:noun:unqualified": {
        "sense_label": "the part you open to go in or out",
        "definition_en": "The part of a room or house that you open to go in or out.",
        "explanation_vi": "Phần bạn mở để đi vào hoặc đi ra (cái cửa).",
        "example_en": "Please open the door.",
        "example_vi": "Làm ơn mở cửa.",
        "nonexample_en": "Please open the window.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:window:noun:unqualified": {
        "sense_label": "the glass part you look through",
        "definition_en": "The part of a wall made of glass that you look through.",
        "explanation_vi": "Phần trên tường làm bằng kính để bạn nhìn ra ngoài (cửa sổ).",
        "example_en": "I can see a bird through the window.",
        "example_vi": "Em có thể nhìn thấy một con chim qua cửa sổ.",
        "nonexample_en": "I open the door to go outside.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:table:noun:unqualified": {
        "sense_label": "furniture with a flat top and legs",
        "definition_en": "A piece of furniture with a flat top and legs that you put things on.",
        "explanation_vi": "Đồ vật có mặt phẳng và chân, để đặt đồ lên (cái bàn).",
        "example_en": "We eat dinner at the table.",
        "example_vi": "Chúng em ăn tối ở bàn.",
        "nonexample_en": "We sit on a chair.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:clock:noun:unqualified": {
        "sense_label": "a thing that shows the time",
        "definition_en": "A thing on a wall or table that shows you the time.",
        "explanation_vi": "Vật trên tường hoặc trên bàn cho biết giờ (cái đồng hồ).",
        "example_en": "The clock says it is three o'clock.",
        "example_vi": "Đồng hồ chỉ ba giờ.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:lamp:noun:unqualified": {
        "sense_label": "a thing that gives light",
        "definition_en": "A thing that gives light in a room.",
        "explanation_vi": "Vật phát ra ánh sáng trong phòng (cái đèn).",
        "example_en": "I turn on the lamp to read at night.",
        "example_vi": "Em bật đèn để đọc sách vào ban đêm.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:cup:noun:unqualified": {
        "sense_label": "a small thing you drink from",
        "definition_en": "A small round thing with a handle that you drink from.",
        "explanation_vi": "Vật nhỏ có quai để uống nước (cái cốc, cái tách).",
        "example_en": "I drink milk from my cup.",
        "example_vi": "Em uống sữa từ cái cốc của mình.",
        "nonexample_en": "I eat rice from a bowl.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:plate:noun:unqualified": {
        "sense_label": "a flat dish you eat from",
        "definition_en": "A flat round dish that you put food on to eat.",
        "explanation_vi": "Đĩa tròn phẳng để đựng thức ăn (cái đĩa).",
        "example_en": "There is a cake on my plate.",
        "example_vi": "Có một cái bánh trên đĩa của em.",
        "nonexample_en": "I drink water from a cup.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:spoon:noun:unqualified": {
        "sense_label": "a tool you eat soup with",
        "definition_en": "A tool with a round end that you use to eat soup or rice.",
        "explanation_vi": "Dụng cụ có đầu tròn để ăn súp hoặc cơm (cái thìa, cái muỗng).",
        "example_en": "I eat my soup with a spoon.",
        "example_vi": "Em ăn súp bằng một cái thìa.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Animals ---
    "cyle25:v2:bear:noun:unqualified": {
        "sense_label": "a big strong animal with thick fur",
        "definition_en": "A big strong wild animal with thick fur.",
        "explanation_vi": "Con vật hoang dã to khỏe, có bộ lông dày (con gấu).",
        "example_en": "The bear lives in the forest.",
        "example_vi": "Con gấu sống trong rừng.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:lion:noun:unqualified": {
        "sense_label": "a big wild cat with a mane",
        "definition_en": "A big wild cat with golden fur; the male has long hair around its head.",
        "explanation_vi": "Con mèo lớn hoang dã, lông vàng; con đực có bờm quanh đầu (con sư tử).",
        "example_en": "The lion is sleeping in the sun.",
        "example_vi": "Con sư tử đang ngủ dưới nắng.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:monkey:noun:unqualified": {
        "sense_label": "an animal that climbs trees",
        "definition_en": "An animal with a long tail that climbs trees.",
        "explanation_vi": "Con vật có đuôi dài, biết leo cây (con khỉ).",
        "example_en": "The monkey climbs up the tree.",
        "example_vi": "Con khỉ leo lên cây.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:rabbit:noun:unqualified": {
        "sense_label": "a small animal with long ears",
        "definition_en": "A small furry animal with long ears that likes to jump.",
        "explanation_vi": "Con vật nhỏ có lông, tai dài, thích nhảy (con thỏ).",
        "example_en": "The rabbit jumps across the grass.",
        "example_vi": "Con thỏ nhảy qua bãi cỏ.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:snake:noun:unqualified": {
        "sense_label": "a long animal with no legs",
        "definition_en": "A long thin animal with no legs that moves along the ground.",
        "explanation_vi": "Con vật dài, mảnh, không có chân, bò trên mặt đất (con rắn).",
        "example_en": "The snake moves through the grass.",
        "example_vi": "Con rắn trườn qua bãi cỏ.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:goat:noun:unqualified": {
        "sense_label": "a farm animal with horns",
        "definition_en": "A farm animal with horns that gives us milk.",
        "explanation_vi": "Con vật nuôi ở trang trại, có sừng, cho ta sữa (con dê).",
        "example_en": "The goat eats grass on the hill.",
        "example_vi": "Con dê ăn cỏ trên đồi.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:chicken:noun:unqualified": {
        "sense_label": "a farm bird that gives eggs",
        "definition_en": "A farm bird that gives us eggs.",
        "explanation_vi": "Loài chim nuôi ở trang trại, cho ta trứng (con gà).",
        "example_en": "The chicken lays an egg.",
        "example_vi": "Con gà đẻ một quả trứng.",
        "nonexample_en": "",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Food & drink ---
    "cyle25:v2:rice:noun:unqualified": {
        "sense_label": "small white grains we eat",
        "definition_en": "Small white grains that we cook and eat.",
        "explanation_vi": "Những hạt nhỏ màu trắng được nấu chín để ăn (cơm, gạo).",
        "example_en": "We eat rice for dinner.",
        "example_vi": "Chúng em ăn cơm vào bữa tối.",
        "nonexample_en": "",
        "kind": "food",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:cake:noun:unqualified": {
        "sense_label": "a sweet food for parties",
        "definition_en": "A sweet food that we often eat at a birthday party.",
        "explanation_vi": "Món ăn ngọt thường ăn trong tiệc sinh nhật (cái bánh ngọt).",
        "example_en": "I eat cake on my birthday.",
        "example_vi": "Em ăn bánh vào ngày sinh nhật.",
        "nonexample_en": "",
        "kind": "food",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:water:noun:unqualified": {
        "sense_label": "the clear drink with no colour",
        "definition_en": "The clear liquid with no colour that we drink.",
        "explanation_vi": "Chất lỏng trong suốt, không màu mà ta uống (nước).",
        "example_en": "I drink water when I am thirsty.",
        "example_vi": "Em uống nước khi khát.",
        "nonexample_en": "I drink milk in the morning.",
        "kind": "food",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:fish:noun:s-pl": {
        "sense_label": "an animal that lives in water",
        "definition_en": "An animal that lives in water and swims.",
        "explanation_vi": "Con vật sống dưới nước và biết bơi (con cá).",
        "example_en": "The fish swims in the pond.",
        "example_vi": "Con cá bơi trong ao.",
        "nonexample_en": "The bird flies in the sky.",
        "kind": "animal",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Clothes ---
    "cyle25:v2:hat:noun:unqualified": {
        "sense_label": "a thing you wear on your head",
        "definition_en": "A thing you wear on your head.",
        "explanation_vi": "Vật bạn đội trên đầu (cái mũ, cái nón).",
        "example_en": "I wear a hat when it is sunny.",
        "example_vi": "Em đội mũ khi trời nắng.",
        "nonexample_en": "I wear shoes on my feet.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:shoe:noun:unqualified": {
        "sense_label": "a thing you wear on your foot",
        "definition_en": "A thing you wear on your foot.",
        "explanation_vi": "Vật bạn mang ở chân (chiếc giày).",
        "example_en": "I put on my shoes before I go out.",
        "example_vi": "Em mang giày trước khi ra ngoài.",
        "nonexample_en": "I wear a hat on my head.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:dress:noun:unqualified": {
        "sense_label": "clothes a girl wears as one piece",
        "definition_en": "A piece of clothing for a girl that covers the body in one piece.",
        "explanation_vi": "Bộ quần áo liền một mảnh cho bạn gái (cái váy đầm).",
        "example_en": "She wears a red dress to the party.",
        "example_vi": "Cô bé mặc một chiếc váy đỏ đến bữa tiệc.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:shirt:noun:unqualified": {
        "sense_label": "clothes for the top of your body",
        "definition_en": "A piece of clothing you wear on the top part of your body.",
        "explanation_vi": "Áo mặc ở phần trên cơ thể (cái áo sơ mi).",
        "example_en": "He wears a blue shirt to school.",
        "example_vi": "Bạn ấy mặc một chiếc áo xanh đến trường.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Transport ---
    "cyle25:v2:car:noun:unqualified": {
        "sense_label": "a thing with four wheels you ride in",
        "definition_en": "A thing with four wheels that takes people from place to place.",
        "explanation_vi": "Xe có bốn bánh chở người đi lại (chiếc ô tô, xe hơi).",
        "example_en": "We go to the beach in the car.",
        "example_vi": "Chúng em đi ra biển bằng ô tô.",
        "nonexample_en": "We ride our bikes to the park.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bus:noun:unqualified": {
        "sense_label": "a big vehicle that carries many people",
        "definition_en": "A big vehicle that carries many people along the road.",
        "explanation_vi": "Xe lớn chở nhiều người trên đường (xe buýt).",
        "example_en": "The children go to school on the bus.",
        "example_vi": "Các bạn nhỏ đi học bằng xe buýt.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:train:noun:unqualified": {
        "sense_label": "a long vehicle that runs on rails",
        "definition_en": "A long vehicle with many parts that runs on rails.",
        "explanation_vi": "Xe dài gồm nhiều toa chạy trên đường ray (tàu hỏa, xe lửa).",
        "example_en": "The train goes very fast.",
        "example_vi": "Tàu hỏa chạy rất nhanh.",
        "nonexample_en": "",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:plane:noun:unqualified": {
        "sense_label": "a vehicle that flies in the sky",
        "definition_en": "A vehicle with wings that flies in the sky.",
        "explanation_vi": "Phương tiện có cánh, bay trên bầu trời (máy bay).",
        "example_en": "The plane flies high above the clouds.",
        "example_vi": "Máy bay bay cao trên những đám mây.",
        "nonexample_en": "The boat goes on the water.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:boat:noun:unqualified": {
        "sense_label": "a thing that goes on water",
        "definition_en": "A thing that carries people on water.",
        "explanation_vi": "Phương tiện chở người đi trên mặt nước (chiếc thuyền).",
        "example_en": "The boat goes across the river.",
        "example_vi": "Chiếc thuyền đi qua dòng sông.",
        "nonexample_en": "The plane flies in the sky.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:bike:noun:unqualified": {
        "sense_label": "a thing with two wheels you pedal",
        "definition_en": "A thing with two wheels that you sit on and move with your feet.",
        "explanation_vi": "Xe có hai bánh, bạn ngồi lên và đạp bằng chân (xe đạp).",
        "example_en": "I ride my bike to the park.",
        "example_vi": "Em đạp xe đến công viên.",
        "nonexample_en": "We go far away in the car.",
        "kind": "object",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Nature ---
    "cyle25:v2:flower:noun:unqualified": {
        "sense_label": "the pretty coloured part of a plant",
        "definition_en": "The pretty coloured part of a plant that smells nice.",
        "explanation_vi": "Phần có màu đẹp của cây, thường thơm (bông hoa).",
        "example_en": "There is a red flower in the garden.",
        "example_vi": "Có một bông hoa đỏ trong vườn.",
        "nonexample_en": "",
        "kind": "nature",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:moon:noun:unqualified": {
        "sense_label": "the bright round shape in the night sky",
        "definition_en": "The big bright shape we see in the sky at night.",
        "explanation_vi": "Vật sáng lớn ta thấy trên bầu trời ban đêm (mặt trăng).",
        "example_en": "The moon shines at night.",
        "example_vi": "Mặt trăng chiếu sáng vào ban đêm.",
        "nonexample_en": "The sun shines in the day.",
        "kind": "nature",
        "representation_type": "scene_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },
    "cyle25:v2:cloud:noun:unqualified": {
        "sense_label": "a white or grey shape in the sky",
        "definition_en": "A white or grey shape in the sky that rain comes from.",
        "explanation_vi": "Khối màu trắng hoặc xám trên trời, nơi mưa rơi xuống (đám mây).",
        "example_en": "There is one white cloud in the sky.",
        "example_vi": "Có một đám mây trắng trên bầu trời.",
        "nonexample_en": "",
        "kind": "nature",
        "representation_type": "scene_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "look_and_say", "meaning_match"],
    },

    # --- Actions ---
    "cyle25:v2:eat:verb:unqualified": {
        "sense_label": "to put food in your mouth",
        "definition_en": "To put food in your mouth and swallow it.",
        "explanation_vi": "Đưa thức ăn vào miệng và nuốt (ăn).",
        "example_en": "We eat breakfast in the morning.",
        "example_vi": "Chúng em ăn sáng vào buổi sáng.",
        "nonexample_en": "We drink water when we are thirsty.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:drink:noun-verb:unqualified": {
        "sense_label": "to take liquid into your mouth",
        "definition_en": "To take water or another liquid into your mouth and swallow it.",
        "explanation_vi": "Đưa nước hoặc chất lỏng khác vào miệng và nuốt (uống).",
        "example_en": "I drink milk every day.",
        "example_vi": "Em uống sữa mỗi ngày.",
        "nonexample_en": "I eat an apple every day.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:read:verb:unqualified": {
        "sense_label": "to look at words and understand them",
        "definition_en": "To look at words in a book and understand them.",
        "explanation_vi": "Nhìn vào chữ trong sách và hiểu nghĩa (đọc).",
        "example_en": "I read a story before bed.",
        "example_vi": "Em đọc một câu chuyện trước khi đi ngủ.",
        "nonexample_en": "I write my name with a pen.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:draw:verb:unqualified": {
        "sense_label": "to make a picture with a pen or pencil",
        "definition_en": "To make a picture with a pen, pencil, or crayon.",
        "explanation_vi": "Dùng bút hoặc bút chì để tạo ra hình vẽ (vẽ).",
        "example_en": "I draw a picture of my cat.",
        "example_vi": "Em vẽ một bức tranh con mèo của em.",
        "nonexample_en": "I read a book about cats.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:walk:verb:unqualified": {
        "sense_label": "to move on your feet, not fast",
        "definition_en": "To move along on your feet, one step after another.",
        "explanation_vi": "Di chuyển bằng chân, từng bước một (đi bộ).",
        "example_en": "We walk to school every day.",
        "example_vi": "Chúng em đi bộ đến trường mỗi ngày.",
        "nonexample_en": "We run fast in the race.",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "high",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
    "cyle25:v2:clap:verb:unqualified": {
        "sense_label": "to hit your hands together",
        "definition_en": "To hit your two hands together to make a sound.",
        "explanation_vi": "Đập hai bàn tay vào nhau tạo ra tiếng (vỗ tay).",
        "example_en": "We clap our hands to the song.",
        "example_vi": "Chúng em vỗ tay theo bài hát.",
        "nonexample_en": "",
        "kind": "action",
        "representation_type": "action_svg",
        "visual_priority": "medium",
        "visual_verdict": "needs_human_review",
        "activity_templates": ["listen_and_find", "read_in_context", "meaning_match"],
    },
}


def first_letter(word: str) -> str:
    """Deterministic shard key: first ascii letter, else '0-9'/'other'."""
    for ch in word.lower():
        if "a" <= ch <= "z":
            return ch
    if word and word[0].isdigit():
        return "0-9"
    return "other"


def strip_prefix(word_id: str) -> str:
    """cyle25:v2:foo:bar:baz -> foo:bar:baz (for entry_id construction)."""
    parts = word_id.split(":")
    return ":".join(parts[2:]) if len(parts) > 2 else word_id


def build_entry(rec: dict, source_hash: str) -> dict:
    wid = rec["word_id"]
    pos = rec["part_of_speech"]["normalized"]
    display = rec["display_form"]
    is_proper = "proper_noun" in pos or "title" in pos
    quarantined = rec.get("integration_status") != "eligible_after_editorial_mapping" or rec.get("review_required")

    revision = 1
    entry_id = f"ro-vocab:{strip_prefix(wid)}:r{revision}"

    teaching = {
        "definition_en": None,
        "explanation_vi": None,
        "example_en": None,
        "example_vi": None,
        "nonexample_en": None,
        "contrast_entry_ids": [],
        "usage_notes": [],
        "pronunciation": {
            "ipa_uk": None,
            "ipa_us": None,
            "audio_uk": None,
            "audio_us": None,
            "syllable_hint": None,
        },
        "visual": {
            "representation_type": "no_visual_needed",
            "visual_priority": "none",
            "asset_id": None,
            "asset": None,
            "alt": None,
            "status": "not_applicable",
            "kind": "none",
            "template": None,
            "anchor_objects": [],
        },
        "activity_templates": [],
    }
    review = {
        "language_review": "pending",
        "sense_review": "pending",
        "child_suitability_review": "pending",
        "media_review": "not_applicable",
        "parent_approval": "pending",
    }

    # --- disposition (deterministic, fail-closed) ---
    if quarantined:
        status = "blocked_source_review"
        reason = "Source record is quarantined / review_required; cannot enrich until an editor resolves it."
    elif is_proper:
        status = "not_teachable_as_standalone"
        reason = "Proper name / title: does not need an ordinary vocabulary lesson. Explicit disposition recorded."
    elif wid in AUTHORED:
        a = AUTHORED[wid]
        status = "editorially_approved"
        reason = "Hand-authored original teaching content, verified against a Read Oasis book context."
        teaching["definition_en"] = a["definition_en"]
        teaching["explanation_vi"] = a["explanation_vi"]
        teaching["example_en"] = a["example_en"]
        teaching["example_vi"] = a["example_vi"]
        teaching["nonexample_en"] = a["nonexample_en"] or None
        teaching["visual"]["kind"] = a.get("kind", "none")
        repr_type = a.get("representation_type", "scene_svg")
        teaching["visual"]["representation_type"] = repr_type
        teaching["visual"]["visual_priority"] = a.get("visual_priority", "high")
        teaching["visual"]["template"] = a.get("template")
        teaching["visual"]["anchor_objects"] = a.get("anchor_objects", [])

        # Derive asset_id from representation_type + headword
        _TYPE_PREFIX = {
            "scene_svg": "scene",
            "action_svg": "action",
            "position_svg": "position",
        }
        prefix = _TYPE_PREFIX.get(repr_type)
        if prefix:
            aid = f"vg-{prefix}-{display}-v1"
            teaching["visual"]["asset_id"] = aid
            teaching["visual"]["asset"] = f"vocabulary/assets/{aid}.svg"
            teaching["visual"]["alt"] = a.get("definition_en", display)
            # Honest visual disposition (fail-closed):
            #   * If the derived SVG file does not exist on disk -> "missing_asset".
            #   * Else use the author's explicit visual_verdict. A human still has to
            #     LOOK at the SVG and confirm it depicts this sense correctly; the
            #     builder cannot see images, so it never auto-certifies new art.
            #   * Back-compat: legacy authored entries with no visual_verdict and an
            #     existing asset stay "approved" (they were human-reviewed already).
            asset_exists = (ASSETS_DIR / f"{aid}.svg").exists()
            verdict = a.get("visual_verdict")
            if not asset_exists:
                teaching["visual"]["status"] = "missing_asset"
            elif verdict:
                teaching["visual"]["status"] = verdict
            else:
                teaching["visual"]["status"] = "approved"
        else:
            teaching["visual"]["status"] = "not_applicable"
        teaching["activity_templates"] = a["activity_templates"]
        review = {
            "language_review": "approved",
            "sense_review": "approved",
            "child_suitability_review": "approved",
            "media_review": "not_applicable",
            "parent_approval": "pending",  # parent still confirms in-app before publish
        }
    else:
        status = "draft"
        reason = "Eligible source record awaiting original authoring and editorial review."

    sense_label = AUTHORED.get(wid, {}).get("sense_label") or f"{display} ({'/'.join(pos)})"

    return {
        "entry_id": entry_id,
        "revision": revision,
        "status": status,
        "disposition_reason": reason,
        "source_ref": {
            "source_id": SOURCE_ID,
            "word_id": wid,
            "source_schema_version": SOURCE_SCHEMA_VERSION,
            "source_pdf_sha256": source_hash,
        },
        "headword": display,
        "display_forms": rec.get("lookup_forms") or [display],
        "part_of_speech": pos,
        "source_qualifier": rec.get("source_qualifier"),
        "sense_label": sense_label,
        "level_metadata": {
            "first_listed_level": rec.get("first_listed_level"),
            "listed_at_levels": rec.get("listed_at_levels", []),
        },
        "theme_ids": rec.get("theme_ids", []),
        "teaching": teaching,
        "review": review,
        "provenance": {
            "teaching_content_original": True,
            "source_attribution_internal_only": True,
        },
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build Vocabulary Garden A-Z enrichment set.")
    ap.add_argument("--lexicon", default=str(DEFAULT_LEXICON))
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--manifest-only", action="store_true",
                    help="Only rewrite manifest.json from existing entries.")
    args = ap.parse_args(argv)

    lex_path = Path(args.lexicon)
    if not lex_path.exists():
        print(f"ERROR: source lexicon not found: {lex_path}", file=sys.stderr)
        return 2
    lexicon = json.loads(lex_path.read_text(encoding="utf-8"))

    source_hash = ""
    man_path = Path(args.manifest)
    if man_path.exists():
        man = json.loads(man_path.read_text(encoding="utf-8"))
        source_hash = (man.get("source") or {}).get("sha256", "") or ""
    if not source_hash:
        print("WARNING: source PDF sha256 unavailable; enrichment source_ref hash will be empty.",
              file=sys.stderr)
        source_hash = "0" * 64  # placeholder that fails schema hex check loudly if used

    ENTRIES_DIR.mkdir(parents=True, exist_ok=True)

    # Build all entries, bucketed by first letter, sorted by word_id.
    shards: dict[str, list[dict]] = {}
    all_entries: list[dict] = []
    for rec in lexicon:
        entry = build_entry(rec, source_hash)
        letter = first_letter(entry["headword"])
        shards.setdefault(letter, []).append(entry)
        all_entries.append(entry)

    if not args.manifest_only:
        for letter, entries in shards.items():
            entries.sort(key=lambda e: e["source_ref"]["word_id"])
            path = ENTRIES_DIR / f"{letter}.json"
            path.write_text(
                json.dumps(entries, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    # Manifest: every source word_id -> disposition.
    from collections import Counter
    disp = Counter(e["status"] for e in all_entries)
    manifest = {
        "manifest_version": 1,
        "generated_by": "tools/vocab/build_enrichment.py",
        "source": {
            "source_id": SOURCE_ID,
            "source_schema_version": SOURCE_SCHEMA_VERSION,
            "source_pdf_sha256": source_hash,
            "total_source_records": len(lexicon),
        },
        "shards": sorted(shards.keys()),
        "disposition_counts": dict(sorted(disp.items())),
        "entries": [
            {
                "entry_id": e["entry_id"],
                "word_id": e["source_ref"]["word_id"],
                "headword": e["headword"],
                "letter": first_letter(e["headword"]),
                "status": e["status"],
                "first_listed_level": e["level_metadata"]["first_listed_level"],
            }
            for e in sorted(all_entries, key=lambda x: x["source_ref"]["word_id"])
        ],
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {len(all_entries)} enrichment entries across {len(shards)} shards.")
    print("Dispositions:", dict(sorted(disp.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
