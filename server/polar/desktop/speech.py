"""The voice: what it costs, and what may be asked for.

The plan of record is explicit that "voices come from a speech service
behind Claidor's API, never from a key in the app"
(`docs/maties/plan.md`, step 1). So the desktop app never holds an
ElevenLabs key: it speaks to Claidor, Claidor speaks to ElevenLabs, and
the key stays on the server the way the model keys already do.

This module is the part of that with no I/O in it — the price, the
character count it is read from, and the shape of a voice id — so it can
be read and tested on its own, the way `polar.desktop.pricing` can.

**The price is a placeholder.** One number, in one place, so it can be
set once the real economics are known. It is not a guess dressed up as a
fact: see `SPEECH_CREDITS_PER_1000_CHARACTERS`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

__all__ = (
    "MAX_SPEECH_CHARACTERS",
    "SPEECH_MODEL_LABEL",
    "SPEECH_PROVIDER_LABEL",
    "SpeechRequest",
    "credits_for_characters",
    "is_valid_voice_id",
    "read_speech_request",
)

#: What a speech row is called in `desktop_usage`. Speech burns no
#: tokens, so its row stores zero of them and carries its cost in the
#: credits column alone. Writing a character count into a column named
#: `input_tokens` would make the two figures un-addable and the monthly
#: total a lie.
SPEECH_MODEL_LABEL = "elevenlabs:text-to-speech"
SPEECH_PROVIDER_LABEL = "elevenlabs"

#: The longest thing the app may ask to have spoken in one call. A
#: morning briefing read aloud is a few thousand characters; a runaway
#: loop handing the whole of a document to a paid API is not. The cap is
#: refused outright rather than truncated: speaking half of something is
#: a worse answer than saying it was too long.
MAX_SPEECH_CHARACTERS = 5_000

#: One credit is one input token on the middle model
#: (`polar.desktop.pricing.credits_for`), and the monthly allowance is
#: counted in those. Speech has to be expressed in the same unit or the
#: monthly figure stops meaning one thing.
#:
#: THIS NUMBER IS A PLACEHOLDER, chosen so that speech is not free and
#: not ruinous, and deliberately left as one obvious constant rather than
#: buried in a formula. It should be set from ElevenLabs' actual
#: per-character price and Claidor's actual per-token cost before anyone
#: is charged against it.
SPEECH_CREDITS_PER_1000_CHARACTERS = 1_000

#: ElevenLabs voice ids are opaque short alphanumerics. This is a
#: boundary check, not a claim that the voice exists — only ElevenLabs
#: can say that — but it keeps a path segment from carrying anything
#: that is not a voice id.
_VOICE_ID = re.compile(r"^[A-Za-z0-9_-]{10,64}$")


def is_valid_voice_id(value: str) -> bool:
    return bool(_VOICE_ID.match(value.strip()))


def credits_for_characters(characters: int) -> int:
    """What speaking this many characters costs the monthly allowance.

    Rounded up, and never zero for a call that actually said something:
    a charge that rounds to nothing is metering that has quietly stopped
    working, which is the same failure the model proxy guards against by
    always asking for stream usage.
    """
    if characters <= 0:
        return 0
    per_thousand = SPEECH_CREDITS_PER_1000_CHARACTERS
    return max(1, -(-characters * per_thousand // 1000))


@dataclass(frozen=True)
class SpeechRequest:
    """A request to say something, as it arrived."""

    text: str

    @property
    def characters(self) -> int:
        return len(self.text)

    @property
    def credits(self) -> int:
        return credits_for_characters(self.characters)


def read_speech_request(payload: Any) -> SpeechRequest | str:
    """The request, or the reason it cannot be served.

    A string return is the message to send back with a 400. Returning the
    reason rather than raising keeps the route free of exception plumbing
    for what is ordinary input validation.
    """
    if not isinstance(payload, dict):
        return "The body must be an object."
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return "The body needs a non-empty `text`."
    if len(text) > MAX_SPEECH_CHARACTERS:
        return (
            f"That is {len(text)} characters; the most that can be spoken "
            f"in one call is {MAX_SPEECH_CHARACTERS}."
        )
    return SpeechRequest(text=text)
