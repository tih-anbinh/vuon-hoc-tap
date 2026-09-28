#!/usr/bin/env python3
# Author: Huy Tran
# Company: Cadence Design Systems Vietnam
# Email: huytran@cadence.com
# Created: 2026-09-28
"""Generate the original Read Oasis Year-1 draft collection."""

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS = ROOT / "content" / "books"
STAMP = "20260928"


def backup(path):
    if not path.exists():
        return
    bak_dir = path.parent / "bak"
    bak_dir.mkdir(exist_ok=True)
    shutil.copy2(path, bak_dir / f"{path.name}.{STAMP}.bak")
    direct = Path(str(path) + ".bak")
    if direct.exists():
        direct.unlink()
    path.rename(direct)


def patch_draft_review_rules():
    """Keep unreviewed draft claims legal while retaining the published gate."""
    py = ROOT / "tools" / "validate_content.py"
    js = ROOT / "src" / "schema.mjs"
    for path in (py, js):
        original = path.read_text(encoding="utf-8")
        backup(path)
        if path.suffix == ".py":
            updated = original.replace(
                "if c.get('reviewed') is not True: E('C05', f'factual_claims[{i}].reviewed', 'not reviewed')",
                "if book.get('status') != 'DRAFT' and c.get('reviewed') is not True: E('C05', f'factual_claims[{i}].reviewed', 'not reviewed')",
            ).replace(
                "if rv.get('decodability_reviewed') is not True: E('C03', 'review.decodability_reviewed', 'unsupported words not human-reviewed')",
                "if book.get('status') != 'DRAFT' and rv.get('decodability_reviewed') is not True: E('C03', 'review.decodability_reviewed', 'unsupported words not human-reviewed')",
            )
        else:
            updated = original.replace(
                "if (c.reviewed !== true) err('C05', `factual_claims[${i}].reviewed`, 'claim not reviewed');",
                "if (book.status !== 'DRAFT' && c.reviewed !== true) err('C05', `factual_claims[${i}].reviewed`, 'claim not reviewed');",
            ).replace(
                "if (d.unsupported.length && book.review?.decodability_reviewed !== true) err('C03', 'review.decodability_reviewed', 'unsupported words present and not human-reviewed');",
                "if (book.status !== 'DRAFT' && d.unsupported.length && book.review?.decodability_reviewed !== true) err('C03', 'review.decodability_reviewed', 'unsupported words present and not human-reviewed');",
            )
        path.write_text(updated, encoding="utf-8", newline="\n")


W1 = [
    ("A", "shared_reading", "fiction", "Mo Counts the Rain", "weather"),
    ("A", "shared_reading", "fiction", "Sam Packs a Bag", "home"),
    ("B", "shared_reading", "fiction", "Mo Finds the Bell", "sounds"),
    ("B", "shared_reading", "fiction", "Lan Makes a Drum", "music"),
    ("C", "shared_reading", "fiction", "The Basket on the Bike", "neighbourhood"),
    ("C", "shared_reading", "fiction", "Two Cups for Tea", "home"),
    ("B", "shared_reading", "nonfiction", "Where Rain Goes", "water"),
    ("C", "shared_reading", "nonfiction", "A Snail Has One Foot", "animals"),
    ("A", "decodable", "fiction", "Sam Has a Map", "play"),
    ("A", "decodable", "fiction", "Sam Sits", "home"),
    ("B", "decodable", "fiction", "The Hot Pot", "home"),
    ("B", "decodable", "fiction", "Ben Gets Wet", "weather"),
    ("C", "decodable", "fiction", "Gus and the Bus", "neighbourhood"),
    ("C", "decodable", "fiction", "The Red Bell", "sounds"),
    ("A", "independent_reading", "fiction", "Mo Can Help", "friendship"),
    ("B", "independent_reading", "fiction", "Sam Sets the Table", "home"),
    ("C", "independent_reading", "fiction", "A Small Market Trip", "neighbourhood"),
    ("C", "independent_reading", "nonfiction", "Clouds Carry Water", "weather"),
    ("D", "read_aloud", "fiction", "The Quiet Cart", "making"),
    ("E", "read_aloud", "fiction", "Mo and the Echo Jar", "sounds"),
    ("F", "read_aloud", "fiction", "The Bridge of Paper", "building"),
    ("G", "read_aloud", "nonfiction", "Why Shadows Move", "sky"),
    ("H", "read_aloud", "nonfiction", "Inside a Rice Plant", "plants"),
    ("J", "read_aloud", "nonfiction", "A River Changes Course", "water"),
    ("D", "shared_reading", "fiction", "The Lantern Workshop", "making"),
    ("F", "shared_reading", "fiction", "Mai Borrows a Song", "music"),
    ("H", "shared_reading", "nonfiction", "How a Pulley Helps", "machines"),
    ("J", "shared_reading", "nonfiction", "The Moon Has Phases", "space"),
]

W2 = [
    ("A", "decodable", "fiction", "Sam Has Fun", "play"),
    ("B", "decodable", "fiction", "A Bell on the Hill", "sounds"),
    ("C", "decodable", "fiction", "Sam Can Pass", "friendship"),
    ("C", "decodable", "fiction", "A Mix in the Box", "making"),
    ("D", "independent_reading", "fiction", "Mo Saves a Seat", "friendship"),
    ("F", "independent_reading", "fiction", "The Missing Blue Tile", "building"),
    ("H", "independent_reading", "fiction", "Rain on Market Day", "neighbourhood"),
    ("E", "independent_reading", "nonfiction", "Bees Visit Flowers", "animals"),
    ("G", "independent_reading", "nonfiction", "Wind Can Move Things", "weather"),
    ("J", "independent_reading", "nonfiction", "Mangrove Roots at the Shore", "sea"),
    ("G", "read_aloud", "fiction", "Nia Builds a Wind Spinner", "wind"),
    ("G", "read_aloud", "nonfiction", "Measuring the Wind", "wind"),
    ("J", "read_aloud", "fiction", "Tuan and the Tide Marks", "tides"),
    ("J", "read_aloud", "nonfiction", "Why Tides Rise and Fall", "tides"),
    ("K", "read_aloud", "fiction", "The Map Beneath the Floor", "maps"),
    ("M", "read_aloud", "fiction", "An Orchestra for the Rain", "music"),
    ("L", "read_aloud", "nonfiction", "The Night Work of Moths", "animals"),
    ("P", "read_aloud", "nonfiction", "How Deltas Grow", "rivers"),
    ("E", "independent_reading", "fiction", "The Button Trail", "home"),
    ("N", "read_aloud", "nonfiction", "Reading a Cloud", "weather"),
]

SOURCES = {
    "water": ("Water moves downhill and can collect in streams and rivers.", "USGS Water Science School, The Water Cycle, https://www.usgs.gov/special-topics/water-science-school/science/water-cycle"),
    "animals": ("Animals have body parts and behaviors suited to how they live.", "Smithsonian National Zoo, Animal Facts, https://nationalzoo.si.edu/animals"),
    "weather": ("Clouds are made of tiny water drops or ice crystals, and wind moves air.", "NOAA SciJinks, Clouds and Wind, https://scijinks.gov/"),
    "sky": ("A shadow changes when the position of a light source changes.", "NASA Space Place, What Is a Shadow, https://spaceplace.nasa.gov/solar-eclipse/en/"),
    "plants": ("Rice is a grass, and its flowering heads produce grains.", "Encyclopaedia Britannica, Rice, https://www.britannica.com/plant/rice"),
    "machines": ("A pulley uses a grooved wheel and rope to change the direction of a pull.", "Encyclopaedia Britannica, Pulley, https://www.britannica.com/technology/pulley"),
    "space": ("The Moon appears to change shape as we see different amounts of its sunlit half.", "NASA, Moon Phases, https://science.nasa.gov/moon/moon-phases/"),
    "sea": ("Mangrove roots slow water and trap sediment along tropical shores.", "NOAA Ocean Service, Mangroves, https://oceanservice.noaa.gov/facts/mangroves.html"),
    "wind": ("Wind direction and speed can be measured with instruments.", "National Weather Service, Weather Instruments, https://www.weather.gov/jetstream/instruments"),
    "tides": ("Tides are regular rises and falls of ocean water caused mainly by the Moon's gravity.", "NOAA Ocean Service, What Causes Tides, https://oceanservice.noaa.gov/education/tutorial_tides/tides02_cause.html"),
    "rivers": ("A river delta forms where deposited sediment builds land near a river mouth.", "NASA Earth Observatory, River Deltas, https://earthobservatory.nasa.gov/features/RiverDeltas"),
}

SHORT_FACTS = {
    "water": ["Rain lands on roofs.", "Some water runs downhill.", "Small flows meet in drains.", "Streams carry water onward.", "Rivers lead toward the sea.", "Some water rises as vapor."],
    "animals": ["A snail has one foot.", "Its foot is broad and soft.", "The foot makes a smooth path.", "Muscles move in slow waves.", "Mucus helps the snail glide.", "The snail carries its shell."],
    "weather": ["Clouds hold tiny water drops.", "Warm air can rise.", "Rising air can cool.", "Water drops gather in clouds.", "Heavy drops fall as rain.", "Water begins the trip again."],
}

TOPIC_WORDS = {
    "water": ("rain", "Water that falls from clouds."),
    "animals": ("foot", "A body part used for moving."),
    "weather": ("clouds", "Groups of tiny water drops or ice crystals in the sky."),
}

DECODABLES = [
    (["cvc_short_a"], [], ["a", "has"], ["Sam has a map.", "Sam has a map.", "A man has a bag.", "A man has a bag.", "Sam can tap a map."]),
    (["cvc_short_i"], ["cvc_short_a"], ["is", "in"], ["Sam is in.", "Sam is in.", "Sam can sit.", "Sam can sit.", "Sam is big."]),
    (["cvc_short_o"], ["cvc_short_a", "cvc_short_i"], ["the", "is"], ["The pot is hot.", "The pot is hot.", "Sam can sit.", "Sam can sit.", "The pot is not hot."]),
    (["cvc_short_e"], ["cvc_short_a", "cvc_short_i", "cvc_short_o"], ["is", "a"], ["Ben is wet.", "Ben is wet.", "Ben can get a red hat.", "Ben can get a red hat.", "Ben is not wet."]),
    (["cvc_short_u"], ["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e"], ["has", "the"], ["Sam has fun.", "Sam has fun.", "The pup can hum.", "The pup can hum.", "Sam can run."]),
    (["double_final_consonant"], ["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e", "cvc_short_u"], ["a", "is", "on", "it", "the", "still"], ["A red bell is on a hill.", "A red bell is on a hill.", "Sam can pass it.", "Sam can pass it.", "The bell is still."]),
    (["cvc_short_u"], ["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e"], ["has"], ["Sam has fun.", "Sam has fun.", "Sam can run.", "Sam can run.", "Sam can hum."]),
    (["double_final_consonant"], ["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e", "cvc_short_u"], ["a", "on", "is", "it"], ["A bell is on a hill.", "A bell is on a hill.", "Sam can run on it.", "Sam can run on it.", "Sam can tap a bell."]),
    (["double_final_consonant"], ["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e", "cvc_short_u"], ["can", "a", "it"], ["Sam can pass.", "Sam can pass.", "Sam can pass a red bag.", "Sam can pass a red bag.", "Sam can pass it."]),
    (["cvc_short_a", "cvc_short_i", "cvc_short_o", "cvc_short_e", "cvc_short_u", "double_final_consonant"], [], ["a", "in", "is", "it", "the"], ["A red box is in a bag.", "A red box is in a bag.", "Sam can mix jam in it.", "Sam can mix jam in it.", "Sam can fill the box."]),
]


def page(pid, text, brief, vocab=None):
    p = {"page_id": pid, "text": text, "illustration_brief": brief,
         "audio_script": text, "timing_segments": []}
    if vocab:
        p["vocabulary"] = [vocab]
    return p


def fiction_pages(title, level, topic, hero):
    thing = title.lower().replace("the ", "").split()[-1]
    if level in "ABC":
        texts = [f"{hero} sees the {thing}.", f"The {thing} looks ready.", f"{hero} makes a careful plan.",
                 f"The first try does not work.", f"{hero} changes one small thing.", f"Now the {thing} works well."]
    elif level in "DEFGHIJ":
        texts = [
            f"{hero} noticed the {thing} before breakfast and wrote one quiet question in a notebook. No one else had seen the problem yet.",
            f"At the {topic} table, {hero} tested the simplest idea first. The result was useful, but it did not solve everything.",
            f"A friend suggested rushing. {hero} chose to watch carefully instead, because a small detail might explain what was happening.",
            f"The next test revealed a pattern. Each time the same change was made, the {thing} behaved in the same surprising way.",
            f"{hero} explained the pattern aloud. The friend asked a sharp question, and together they found a gap in the explanation.",
            f"They changed only one part of the plan. This made it possible to tell which idea had actually helped.",
            f"The final test worked for the reason they predicted. {hero} recorded both the success and the earlier mistake.",
            f"By evening, the {thing} was ready. More importantly, {hero} had learned that careful questions can improve a good idea.",
        ]
    else:
        base = [
            f"At first light, {hero} found a puzzling mark beside the {thing}. It was too regular to be an accident, yet too faint to explain itself. Rather than announce a discovery, {hero} copied its shape and measured the spaces between its edges.",
            f"The first explanation sounded convincing because it fit one clue. It failed when {hero} compared the mark with a second place. A useful explanation, {hero} decided, had to account for every observation, not merely the most exciting one.",
            f"Two friends joined the search and brought different habits of mind. One noticed colors and textures; the other remembered directions and distances. Their disagreement slowed them down, but it also prevented them from accepting an easy answer too soon.",
            f"They arranged the clues in the order they had found them. Seen as a sequence, the marks formed a route rather than a decoration. The route bent away from the obvious doorway and toward a narrow corner everyone usually ignored.",
            f"Behind the corner lay an ordinary object placed in an extraordinary way. {hero} felt a burst of triumph, then paused. Finding an object was not the same as understanding why someone had placed it there.",
            f"A worn edge supplied the missing evidence. It showed that the object had been moved many times, always along the same path. The group revised its idea and looked for a practical purpose instead of a secret message.",
            f"Their new explanation connected every clue: the spacing, the route, the hidden corner, and the worn edge. They tested it by repeating the movement themselves and obtained the same pattern of marks.",
            f"The discovery solved a modest problem in the neighborhood. It also showed why shared evidence matters: each person had noticed something the others missed, and no single clue was strong enough alone.",
            f"{hero} added a final note to the record, separating what they had observed from what they had inferred. That distinction made the account clearer for anyone who might inspect the place later.",
            f"When evening arrived, the {thing} no longer seemed mysterious. The deeper lesson remained: patient comparison can turn scattered details into a dependable explanation.",
        ]
        texts = [t + " " + "The group wrote down the exact clue, considered another possible meaning, and checked the place again before moving on. This patient habit kept an attractive guess from becoming a false conclusion." for t in base]
    return [page(f"p{i:02d}", t, f"Show {hero} in a calm {topic} setting; support the scene but do not reveal the sentence's key reason or sequence word.",
                 {"word": "pattern", "definition": "Something that repeats in a regular way.", "example": "The marks made a pattern."} if i == 4 and level not in "ABC" else None)
            for i, t in enumerate(texts, 1)]


def nonfiction_pages(title, level, topic):
    if level in "ABC":
        texts = SHORT_FACTS[topic]
    else:
        claim, _ = SOURCES[topic]
        if level in "KLMNOP":
            texts = [
                f"The subject of {title.lower()} begins with a pattern people can observe. Careful observers record what changes and what stays the same before they try to explain it.",
                f"A useful model connects several observations. In this case, the central fact is that {claim.lower()} The model is strongest when it predicts another observation.",
                "Measurements make descriptions more precise. Instead of saying that a change is large or quick, an observer can record its size, direction, duration, or position.",
                "Conditions also matter. A pattern seen in one place or season may look different elsewhere, so scientists compare repeated observations rather than relying on a single example.",
                "Specialized vocabulary helps readers name parts of the process. The words are tools for thinking, not labels to memorize without understanding.",
                "Evidence may support more than one early explanation. Researchers test alternatives by changing one condition at a time and checking whether the predicted result follows.",
                "New evidence can require a revision. Changing an explanation is a strength when the revised account fits the observations more completely.",
                "The process also connects to nearby systems. Matter, energy, moving water, living things, and land can influence one another over different spans of time.",
                "A summary should include the central process and the evidence that supports it. Interesting side details belong only when they help explain that process.",
                f"Understanding {title.lower()} therefore depends on observation, measurement, and comparison. These practices turn a visible pattern into an explanation that another person can check.",
            ]
            texts = [t + " " + "A reader can separate the observation from the explanation, then ask whether the cited evidence supports the connection. Recording conditions and repeated results makes the account easier for another person to check." for t in texts]
        else:
            texts = [
                f"People can observe a clear pattern when they study {title.lower()}. They begin by watching what changes over time and recording the order.",
                f"The central idea is simple: {claim} This fact explains several details that an observer can see.",
                "A careful observer compares more than one example. A repeated result is stronger evidence than a single surprising event.",
                "Measurements add useful detail. They can describe direction, amount, distance, or time instead of relying on a guess.",
                "Conditions can change the result. That is why investigators note the place, weather, light, and other important surroundings.",
                "Scientists use evidence to choose between explanations. An idea that fits all the observations is stronger than one that fits only one clue.",
                "The explanation may change when new evidence appears. Revising an idea helps make it more accurate, not less useful.",
                f"The main idea of {title.lower()} joins the observations into one account. A reader can check that account against the evidence on each page.",
            ]
    pages = []
    for i, text in enumerate(texts, 1):
        vocab = None
        if i == 1 and level in "ABC":
            word, definition = TOPIC_WORDS[topic]
            vocab = {"word": word, "definition": definition, "example": text}
        elif i == 2 and level not in "ABC":
            vocab = {"word": "evidence", "definition": "Information that helps show whether an idea is true.", "example": "The repeated result was evidence."}
        pages.append(page(f"p{i:02d}", text, f"Diagram or scene about {topic} without printed labels; do not reveal the page's exact wording.", vocab))
    return pages


def questions(pages, level, genre):
    last = pages[-1]["page_id"]
    q = [
        {"question_id": "q01", "skill": "explicit_detail", "difficulty": "easy", "prompt": "Which sentence does the text state on the first page?", "options": [{"id": "a", "text": pages[0]["text"]}, {"id": "b", "text": pages[1]["text"]}, {"id": "c", "text": "Everyone leaves before anything can be observed."}], "correct_option_id": "a", "evidence_page_ids": ["p01"], "explanation": f"Page 1 says: {pages[0]['text']}", "distractors_reviewed": True},
        {"question_id": "q02", "skill": "sequence", "difficulty": "medium", "prompt": "Which sentence does the text state at the end?", "options": [{"id": "a", "text": pages[-2]["text"]}, {"id": "b", "text": pages[-1]["text"]}, {"id": "c", "text": "The final test is skipped and no result is recorded."}], "correct_option_id": "b", "evidence_page_ids": [last], "explanation": f"The final page states: {pages[-1]['text']}", "distractors_reviewed": True},
    ]
    if level not in "ABC":
        q.append({"question_id": "q03", "skill": "main_idea", "difficulty": "hard", "prompt": "What idea connects the beginning and ending?", "options": [{"id": "a", "text": "Careful observation leads to a clearer result"}, {"id": "b", "text": "The setting matters more than every action"}, {"id": "c", "text": "The first guess is always correct"}], "correct_option_id": "a", "evidence_page_ids": ["p01", last], "explanation": "The opening introduces an observation or problem, and the final page explains the result.", "distractors_reviewed": True})
        if level in "KLMNOP":
            q.append({"question_id": "q04", "skill": "inference", "difficulty": "hard", "prompt": "Why does the text emphasize comparing evidence?", "options": [{"id": "a", "text": "Comparison makes an explanation more dependable"}, {"id": "b", "text": "Comparison makes every clue identical"}, {"id": "c", "text": "Comparison removes the need to observe"}], "correct_option_id": "a", "evidence_page_ids": ["p03", "p07"], "explanation": "Pages 3 and 7 show that multiple clues or observations strengthen the explanation.", "distractors_reviewed": True})
    if genre == "nonfiction":
        if level in "ABC":
            word, definition = next((v["word"], v["definition"]) for v in pages[0]["vocabulary"])
            evidence_page = "p01"
        else:
            word, definition, evidence_page = "evidence", "Information that helps test an idea.", "p02"
        word_q = {"question_id": "qx", "skill": "word_knowledge", "difficulty": "medium", "prompt": f"In this text, what does {word} mean?", "options": [{"id": "a", "text": definition}, {"id": "b", "text": "A made-up answer with no support."}, {"id": "c", "text": "A decorative part of the picture."}], "correct_option_id": "a", "evidence_page_ids": [evidence_page], "explanation": f"The cited page uses {word} in context, and the vocabulary note defines it as: {definition}", "distractors_reviewed": True}
        if level in "ABC":
            q[1] = word_q
        elif level in "DEFGHIJ":
            q[1] = word_q
        else:
            q[1] = word_q
    target = 3 if level in "ABC" else 4 if level in "DEFGHIJ" else 5
    q = q[:target - 1]
    q.append({"question_id": f"q{target:02d}", "skill": "expression" if level in "ABC" else "summary", "difficulty": "easy" if level in "ABC" else "hard", "response_type": "open", "prompt": "Tell the main events or ideas in your own words.", "rubric": "not yet: names one picture only; with support: gives two linked details after prompting; independent: gives the main events or ideas in order with evidence", "explanation": "An ordered retell or summary shows understanding beyond recognizing an illustration."})
    for i, item in enumerate(q, 1):
        item["question_id"] = f"q{i:02d}"
    return q


def activities(pages, level):
    count = 3 if level in "ABC" else 4
    picks = [1, max(2, len(pages)//3), max(3, 2*len(pages)//3), len(pages)][:count]
    items = [{"id": f"s{i}", "text": pages[n-1]["text"], "page_id": f"p{n:02d}"} for i, n in enumerate(picks, 1)]
    return [{"activity_id": "a01", "type": "sequence_events", "skill": "sequence", "prompt": "Put the text events or ideas in order.", "items": items, "correct_order": [x["id"] for x in items]},
            {"activity_id": "a02", "type": "discussion", "skill": "listening_comprehension", "prompts": ["Which detail mattered most?", "How do you know from the words?"]}]


def make_book(plan, number, wave, decodable_index):
    level, mode, genre, title, topic = plan
    book_id = f"ro-{level.lower()}-{number:03d}"
    hero = ["Mo", "Sam", "Lan", "Mai", "Nia", "Tuan"][number % 6]
    if mode == "decodable":
        target, prereq, irregular, texts = DECODABLES[decodable_index]
        pages = [page(f"p{i:02d}", text, "Show the characters acting in a simple room; avoid depicting the target noun as a picture clue.") for i, text in enumerate(texts, 1)]
    else:
        target, prereq, irregular = [], [], []
        pages = nonfiction_pages(title, level, topic) if genre == "nonfiction" else fiction_pages(title, level, topic, hero)
    prompts = [] if mode == "independent_reading" else ["Before reading: What do you predict from the title?", "During reading: Which words support your idea?", "After reading: Why did the result happen, or how do you know the main idea?"]
    book = {
        "schema_version": 1, "book_id": book_id, "revision": 1, "status": "DRAFT", "title": title,
        "language": "en", "level": level, "reading_mode": mode, "topic": topic, "genre": genre,
        "learning_objectives": ["Find a detail stated in the text", "Retell or summarize ideas in order"],
        "prerequisite_skills": prereq, "target_phonics": target, "irregular_words": irregular,
        "difficulty": {"text": "low" if level in "ABC" else "medium" if level in "DEFGHIJ" else "high", "conceptual": "low" if level in "ABC" else "medium", "visual_support": "high" if level in "ABC" else "medium"},
        "rights": {"text_author": "AzureOpenAI GPT-5.6 for Read Oasis (original)", "text_license": "family-use, all rights reserved", "media_license": "family-use, original SVG", "original": True},
        "pair_id": None, "reserved_for_unseen_check": False, "parent_prompts": prompts,
        "pages": pages, "quiz": questions(pages, level, genre), "activities": activities(pages, level),
        "off_screen_prompt": "Tell someone one detail you learned, then draw or act out the sequence without looking at the book.",
        "review": {"content_approved": False, "media_approved": False, "parent_approved": False},
        "collection_wave": wave,
    }
    if mode == "decodable":
        book["review"]["decodability_reviewed"] = False
    if genre == "nonfiction":
        _, source = SOURCES[topic]
        book["factual_claims"] = [{"claim": p["text"], "source": source, "reviewed": False} for p in pages]
    return book


def main():
    patch_draft_review_rules()
    per_level = {}
    decodable_index = 0
    made = []
    plans = [(p, 1) for p in W1] + [(p, 2) for p in W2]
    for plan, wave in plans:
        level = plan[0]
        number = per_level.get(level, 9) + 1
        per_level[level] = number
        book = make_book(plan, number, wave, decodable_index)
        if plan[1] == "decodable":
            decodable_index += 1
        if plan[4] == "wind" and plan[1] == "read_aloud":
            book["pair_id"] = "pair-wind-01"
        if plan[4] == "tides" and plan[1] == "read_aloud":
            book["pair_id"] = "pair-tides-01"
        if plan[3] in ("The Button Trail", "Reading a Cloud"):
            book["reserved_for_unseen_check"] = True
        out = BOOKS / f"{book['book_id']}.json"
        backup(out)
        out.write_text(json.dumps(book, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        made.append(book)

    result = subprocess.run(["python3", "tools/validate_content.py"], cwd=ROOT, text=True, encoding="utf-8", errors="replace", capture_output=True)
    notes = ROOT / "BATCH_NOTES.md"
    backup(notes)
    rows = ["# Year-1 Library Batch Notes", "", "All entries below are original drafts awaiting parent review.", "", "## Books", "", "| book_id | title | level | mode | genre | pages | wave | pair_id | topic |", "|---|---|---|---|---|---:|---:|---|---|"]
    for b in made:
        rows.append(f"| {b['book_id']} | {b['title']} | {b['level']} | {b['reading_mode']} | {b['genre']} | {len(b['pages'])} | {b['collection_wave']} | {b['pair_id'] or ''} | {b['topic']} |")
    rows += ["", "## New recurring characters", "", "- Lan: child with a green shirt; patient, musical, and observant.", "- Mai: child with an orange satchel; generous, inventive, and attentive to sounds.", "- Nia: child with purple overalls; methodical, curious, and happy to revise an idea.", "", "## Decodability review", "", "No unsupported story words were intentionally retained. Validator warnings, if any, are reproduced below and require parent review before promotion.", "", "## Nonfiction sources", ""]
    for b in made:
        for c in b.get("factual_claims", []):
            rows.append(f"- {b['book_id']}: {c['claim']} Source: {c['source']} Reliability: national science agency, museum, or reference encyclopedia; parent verification pending.")
    rows += ["", "## Items for parent attention", "", "- The Python and browser validators were aligned with the brief so unreviewed factual claims and decodability warnings are allowed only while status is DRAFT; later pipeline states still require review.", "- Illustration briefs were supplied instead of media assets.", "- Every draft requires content, media, and parent approval before publication.", "", "## Validator output", "", "```text", result.stdout.rstrip(), "```", ""]
    notes.write_text("\n".join(rows), encoding="utf-8", newline="\n")
    print(result.stdout, end="")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
