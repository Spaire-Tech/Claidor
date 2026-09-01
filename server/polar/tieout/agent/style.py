"""The house style, as a checker rather than a request.

The founder's own note on this, and it is the reason this file exists:

> The gate is the part that matters. A prompt rule is a request. A gate
> is a rule.

`docs/pierce/house-style/` holds the two documents this enforces —
`findings-voice.md` (how to write) and `README.md` (the rules, measured
against the agent's real answers on 31 August: 39 alerts on what it
wrote, 0 on the rewrite). This is the machine half.

**Why Python and not Vale.** The founder built and measured this with
Vale, which is the right tool for a person editing prose: it runs on a
laptop, it has the Google and Microsoft packages beside it, and it is
how the rules were proven. But the gate has to run on every answer in
production, and that cannot depend on a binary downloaded from GitHub
at boot. So the rules are re-implemented here, one per class, each
carrying the founder's own replacement sentence. Vale stays the bench;
this is the gate.

**Every alert says what to write instead.** An alert the model cannot
act on is a rejection, not a correction, and the rewrite call needs the
correction — so `say` is never « avoid hedges », it is « write "6,200"
rather than "about 6,200" ».
"""

import re
from dataclasses import dataclass
from typing import Any

#: Below this a sentence is fine; at or above it, it is doing too much.
#: The founder's number, from `findings-voice.md`: « Keep sentences
#: under 20 words. »
LONGEST_SENTENCE = 20

#: « Write so a smart person who has never opened Excel understands
#: it. » The founder's targets, measured with `textstat`; the numbers
#: here are computed by the same formulas over a syllable count this
#: file estimates, so they track rather than match exactly.
GRADE_CEILING = 8.0
FOG_CEILING = 10.0


@dataclass(frozen=True)
class Alert:
    """One place the writing breaks a house rule."""

    #: The rule's name, as `README.md` lists it — « Hedges », « CellFirst ».
    rule: str
    #: `error` sends the answer back to be rewritten. `warning` is
    #: recorded and shipped: a long sentence is worth knowing about and
    #: is not worth a second model call on its own.
    level: str
    #: The offending words, quoted, so the model can find them.
    found: str
    #: What to write instead. Never « avoid X » — always the correction.
    say: str


def _alert(rule: str, level: str, found: str, say: str) -> Alert:
    return Alert(rule=rule, level=level, found=found, say=say)


# --- the rules ----------------------------------------------------------
#
# Each is a list of (pattern, what to write instead). The patterns are
# case-insensitive and word-bounded unless they carry their own anchors.

#: « Four softeners next to precise counts. It reads unsure of things it
#: actually knows. » — the founder, on an answer that said « about
#: 6,200 » about a number it had counted.
#:
#: « about » and « roughly » are only hedges in front of a number; « a
#: question about the model » is ordinary English and flagging it would
#: teach the model to write worse.
HEDGES: list[tuple[str, str]] = [
    (
        r"\b(?:about|roughly|approximately|around|circa)\s+(?=[\d~])",
        "You counted it. Give the number without a softener in front of it.",
    ),
    (
        r"~(?=\d)",
        "Give the number. « ~860 » is a number wearing a shrug.",
    ),
    (
        r"\bfairly\b",
        "Delete it. « fairly conventional » is either conventional or it is not.",
    ),
    (r"\bvery\b", "Delete it, or use a word that does not need it."),
    (r"\bsimply\b", "Delete it. Nothing is made simpler by being called simple."),
    (r"\bby far\b", "Give the comparison instead — « half the model »."),
    (r"\bquite\b", "Delete it."),
    (r"\bsomewhat\b", "Delete it, or say by how much."),
    (r"\brelatively\b", "Delete it, or say relative to what."),
]

#: « The whole report is a list of things to check. Saying it again
#: carries no information, and it makes the engine sound unsure of its
#: own work. »
CHECK_WHETHER: list[tuple[str, str]] = [
    (r"\bcheck whether\b", "State the fact and stop."),
    (r"\bcheck which\b", "State the fact and stop."),
    (r"\bworth noting\b", "If it is worth noting, note it. Delete the phrase."),
    (r"\bworth knowing\b", "If it is worth knowing, say it. Delete the phrase."),
    (r"\bworth checking\b", "State the fact and stop."),
    (r"\bit is worth\b", "State the fact and stop."),
    (r"\byou may want to\b", "Say what you found. The reader decides what to do."),
    (r"\byou might want to\b", "Say what you found. The reader decides what to do."),
]

#: « The user doesn't know Swens has a reader. When your engine talks
#: about its own parts, it sounds like a machine explaining itself
#: instead of a person explaining the model. »
MACHINE_VOICE: list[tuple[str, str]] = [
    (r"\bmy reader\b", "Say « I could not find it ». The reader is not the subject."),
    (r"\bthe reader (?:recognised|recognized|found|read)\b", "Say « I »."),
    (r"\bmy trace\b", "Say « I »."),
    (
        r"\bthe trace (?:stops|ends)\b",
        "Say what the model does, not what your walk did.",
    ),
    (
        r"\bwalked back from\b",
        "That belongs in the trace at the bottom, not the prose.",
    ),
    (
        r"\btraced back from\b",
        "That belongs in the trace at the bottom, not the prose.",
    ),
    (
        r"\bnothing matched a search\b",
        "Say « I could not find it ». The search is yours.",
    ),
    (r"\bI ran a search\b", "Say what you did not find, not that you searched."),
    (r"\bdirect inputs\)", "That is a tool line. Keep it out of the sentence."),
    (r"\bthe engine\b", "Say « I », or name the thing in the model."),
    (r"\bformula graph\b", "The reader has never heard of it. Say what you read."),
    (r"\bprecedent graph\b", "Say « what it reads »."),
    (r"\bdependents? graph\b", "Say « what reads it »."),
    (
        r"\bbanded order\b",
        "Say « inputs, then the calculations, then the statements ».",
    ),
]

#: « Use words a banker says out loud. » The left column is
#: `findings-voice.md`'s own table, plus the words that slipped through
#: in the founder's test. **This file is the house vocabulary and it
#: should grow** — the README says so, and every finance word that
#: reaches a person is a line to add here.
PLAIN_WORDS: list[tuple[str, str]] = [
    (r"\bsiblings?\b", "Write « the other 19 rows » — say how many."),
    (r"\bpinned reference\b", "Write « locked reference »."),
    (r"\babsolute reference\b", "Write « locked reference »."),
    (r"\bhardcodes?\b", "Write « typed in »."),
    (r"\bhardcoded\b", "Write « typed in »."),
    (r"\bin-service date\b", "Write « the date it goes into use »."),
    (r"\bvintage rows?\b", "Write « the rows for each year's spend »."),
    (r"\bprecedents?\b", "Write « what it reads »."),
    (r"\bdependents?\b", "Write « what reads it »."),
    (r"\bamorti[sz]ed?\b", "Write « written off »."),
    (r"\bcontains a fixed value\b", "Write « is typed in »."),
    (
        r"\bdoes not follow the formula\b",
        "Write « breaks the pattern of its row ».",
    ),
    (
        r"\bexcludes rows immediately above\b",
        "Write « starts below the rows it should cover ».",
    ),
    (r"\bthe departure\b", "Delete it."),
    (
        r"\biterative calculation\b",
        "Write « circular calculation », and say what it means.",
    ),
    (r"\bvolatile function\b", "Write « a formula that recalculates every time »."),
    (
        r"\bcircular reference\b",
        "Write « a loop where two cells depend on each other ».",
    ),
]

#: « `E42` means nothing until the file is open. Lead with the row label
#: every time. »
CELL_FIRST = re.compile(
    r"(?:^|(?<=[.!?]\s)|(?<=\n))\s*(?:[A-Za-z][\w ]{0,30}!)?\$?[A-Z]{1,3}\$?\d{1,5}\b"
)

#: « Never write a consequence you did not verify. Say only what you
#: read. » One invented finding costs the reader's trust in all the
#: others.
UNVERIFIED: list[tuple[str, str]] = [
    (r"\bpresumably\b", "Read it or leave it out."),
    (r"\bmost likely\b", "Read it or leave it out."),
    (r"\bit appears\b", "Say what you read."),
    (r"\bappears to be\b", "Say what you read."),
    (r"\bseems to\b", "Say what you read."),
    (r"\bwhatever it holds\b", "Say that you have not read it."),
    (r"\bprobably\b", "Read it or leave it out."),
    (r"\bwould suggest\b", "Say what you read."),
    (r"\bI would expect\b", "Say what you read."),
]

#: The things this assistant finds **by looking for them**.
#:
#: The distinction this whole rule turns on. « There is no circular
#: loop » is fine: the workbook carries a flag saying so and the reader
#: read it. « There is no depreciation line » is not: the assistant
#: searched, and a search that finds nothing has two explanations, only
#: one of which is about the model. So the rule fires on the nouns you
#: arrive at by searching, and leaves alone the ones you arrive at by
#: reading a setting.
_FOUND_BY_LOOKING = (
    r"(?:line|lines|row|rows|label|labels|axis|axes|column|columns|sheet|"
    r"sheets|tab|tabs|formula|formulas|reference|references|entry|entries|"
    r"name|names|section|sections|schedule|total|totals)\b"
)

#: **The rule underneath the Module1 mistake**, in the founder's words:
#: « keep the fourth part about the review, not about the model. "I
#: couldn't find X", never "the model doesn't have X." You did not look
#: everywhere. »
#:
#: This is the one that matters most, because it is the difference
#: between a limit of the review and a claim about somebody's file.
NOT_THERE: list[tuple[str, str]] = [
    (
        r"\bthe model (?:has no|does not have|doesn't have|lacks)\b",
        "Write « I could not find … in the model ». You did not look everywhere.",
    ),
    (
        r"\bno sheet has\b",
        "Write « I could not find … on any sheet ».",
    ),
    (
        r"\bthere (?:is|are) no\b(?:\s+\w+){0,2}\s+" + _FOUND_BY_LOOKING,
        "If you mean you could not find it, write « I could not find … ».",
    ),
    (
        r"\bno\s+" + _FOUND_BY_LOOKING + r"\s+(?:exists?|is present)\b",
        "Write « I could not find … ». You did not look everywhere.",
    ),
    (
        r"\bthe (?:file|workbook) (?:has no|does not have|doesn't have)\b",
        "Write « I could not find … ».",
    ),
]

#: The chat draws plain text. Markdown reaches the person as its own
#: punctuation — the founder saw `**CPO semiconductor**` printed with
#: the asterisks on it.
MARKDOWN: list[tuple[str, str]] = [
    (r"\*\*[^*\n]+\*\*", "The screen prints the asterisks. Write the words plainly."),
    (r"(?<![\w*])\*[^*\n]+\*(?![\w*])", "The screen prints the asterisks."),
    (r"^#{1,6} ", "The screen prints the hash. Write a sentence."),
    (r"^\s*[-*+] ", "The screen prints the hyphen. Write sentences, not a list."),
    (r"`[^`\n]+`", "The screen prints the backticks. Write the reference plainly."),
]

#: Every rule, with the level the README gives it.
RULES: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Hedges", "error", HEDGES),
    ("CheckWhether", "error", CHECK_WHETHER),
    ("MachineVoice", "error", MACHINE_VOICE),
    ("PlainWords", "error", PLAIN_WORDS),
    ("Unverified", "error", UNVERIFIED),
    ("NotThere", "error", NOT_THERE),
    ("Markdown", "error", MARKDOWN),
]


def _sentences(text: str) -> list[str]:
    """Split on sentence ends, keeping cell refs and figures intact.

    « Debt!F44. » ends a sentence; « 8.5bn » and « v22 » do not. The
    split therefore needs a following space and a capital or a line
    break, which is enough for prose and wrong only on prose that was
    already broken.
    """
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"'(])|\n{2,}", text.strip())
    return [one.strip() for one in parts if one.strip()]


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9'’.-]*", text)


def _syllables(word: str) -> int:
    """An estimate, and honest about being one.

    The founder measured with `textstat`, which uses a dictionary where
    it has one. This counts vowel groups and drops a silent « e », which
    tracks the same direction on the same text — enough for a gate that
    asks « is this reading like a university paper », not enough to
    quote as a published figure.
    """
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 0
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ee", "ye")) and count > 1:
        count -= 1
    return max(1, count)


@dataclass(frozen=True)
class Readability:
    """How hard the writing is, by the founder's two measures."""

    #: Flesch-Kincaid grade. The founder's ceiling is 8.
    grade: float
    #: Gunning Fog. The founder's ceiling is 10.
    fog: float
    #: Flesch reading ease. Higher is easier; the founder wants over 70.
    ease: float
    words_per_sentence: float
    sentences: int
    words: int

    @property
    def hard(self) -> bool:
        return self.grade > GRADE_CEILING or self.fog > FOG_CEILING


def readability(text: str) -> Readability:
    """The three numbers, over the text as it would be read."""
    sentences = _sentences(text)
    words = _words(text)
    if not sentences or not words:
        return Readability(0.0, 0.0, 100.0, 0.0, 0, 0)

    syllables = sum(_syllables(one) for one in words)
    #: Fog counts words of three syllables or more, which is its whole
    #: idea: long words are what make a sentence heavy.
    complex_words = sum(1 for one in words if _syllables(one) >= 3)
    per_sentence = len(words) / len(sentences)
    per_word = syllables / len(words)

    return Readability(
        grade=0.39 * per_sentence + 11.8 * per_word - 15.59,
        fog=0.4 * (per_sentence + 100 * complex_words / len(words)),
        ease=206.835 - 1.015 * per_sentence - 84.6 * per_word,
        words_per_sentence=per_sentence,
        sentences=len(sentences),
        words=len(words),
    )


def check(text: str) -> list[Alert]:
    """Every house rule this text breaks, with what to write instead.

    Order is the order a person would read them in — the errors first,
    then the sentences that ran long, then the aggregate. That is also
    the order the model should fix them in.
    """
    found: list[Alert] = []
    if not text.strip():
        return found

    for rule, level, patterns in RULES:
        for pattern, say in patterns:
            flags = re.IGNORECASE | (re.MULTILINE if pattern.startswith("^") else 0)
            for hit in re.finditer(pattern, text, flags):
                found.append(_alert(rule, level, hit.group(0).strip(), say))

    for sentence in _sentences(text):
        if CELL_FIRST.match(sentence):
            found.append(
                _alert(
                    "CellFirst",
                    "error",
                    sentence[:48],
                    "Lead with the row's name. The cell address goes after it.",
                )
            )
        length = len(_words(sentence))
        if length > LONGEST_SENTENCE:
            found.append(
                _alert(
                    "SentenceLength",
                    "warning",
                    f"{length} words: {sentence[:56]}…",
                    "One idea per sentence. Break it apart.",
                )
            )

    reading = readability(text)
    if reading.hard:
        found.append(
            _alert(
                "Readability",
                "warning",
                f"grade {reading.grade:.1f}, fog {reading.fog:.1f}",
                "Shorter sentences and plainer words. Write so a smart person "
                "who has never opened Excel understands it.",
            )
        )
    return found


def errors(alerts: list[Alert]) -> list[Alert]:
    return [one for one in alerts if one.level == "error"]


def rewrite_note(alerts: list[Alert]) -> str:
    """The alerts as an instruction the model can act on.

    Deduplicated by rule and correction, because eight hedges is one
    lesson and printing it eight times spends the model's attention on
    the list rather than on the rewrite.
    """
    seen: set[tuple[str, str]] = set()
    lines: list[str] = []
    for one in alerts:
        key = (one.rule, one.say)
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"- « {one.found} » — {one.say}")
    return "\n".join(lines)


def as_dicts(alerts: list[Alert]) -> list[dict[str, Any]]:
    return [
        {"rule": one.rule, "level": one.level, "found": one.found, "say": one.say}
        for one in alerts
    ]


__all__ = [
    "FOG_CEILING",
    "GRADE_CEILING",
    "LONGEST_SENTENCE",
    "Alert",
    "Readability",
    "as_dicts",
    "check",
    "errors",
    "readability",
    "rewrite_note",
]
