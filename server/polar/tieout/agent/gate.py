"""The house style, enforced before an answer reaches a person.

The founder's sentence, and the whole reason this is a separate step
rather than another paragraph in the prompt:

> The gate is the part that matters. A prompt rule is a request. A gate
> is a rule.

So the answer is checked (`style.check`), and if it breaks a rule at
`error` level it goes back to the model with the alerts attached and is
written again. Two attempts, then it ships with the alerts recorded —
never blocked, because an answer nobody sees is worse than one that
says « fairly ».

**Why the chat does not stream the answer.** It used to. The gate is
why it stopped: prose that may be sent back cannot be on screen while
it is being judged, and a person watching a paragraph get replaced
mid-read is worse than one waiting a moment longer. The status lines
still stream — those are the model's own line for each step and they
are not the claim.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import structlog

from polar.agent import Client

from . import style

log = structlog.get_logger()

#: How many times an answer may be sent back. The founder's number.
#: A third attempt on prose that failed twice is spending the person's
#: time on a model that is not going to get there.
MOST_TRIES = 2

#: What the model is told when its writing is sent back. Short on
#: purpose: the alerts carry the specifics, and a long lecture here
#: competes with them for attention.
ASK = """The answer below breaks the house style. Rewrite it.

Keep every fact exactly as it is — the same cells, the same numbers,
the same findings, in the same order. Change only the words.

{alerts}

Return the rewritten answer and nothing else. No preamble, no
explanation of what you changed.

---

{answer}"""


@dataclass
class Written:
    """What the gate produced, and what it had to do to get there."""

    answer: str
    #: What was still wrong when it stopped trying. Empty is the good
    #: case; not empty and shipped is recorded rather than hidden.
    alerts: list[style.Alert] = field(default_factory=list)
    #: How many rewrites it took. Zero means it was right first time.
    tries: int = 0
    #: The answer as the model first wrote it, kept when a rewrite
    #: happened. Nothing shows it; it is what makes « is the prompt
    #: getting better » answerable later without guessing.
    first: str = ""

    @property
    def clean(self) -> bool:
        return not style.errors(self.alerts)


async def written(
    client: Client,
    answer: str,
    *,
    model: str,
    ask: Callable[[Client, str, str], Any] | None = None,
) -> Written:
    """Check the answer, and rewrite it while it breaks a rule.

    `ask` is how the rewrite is requested, injected so this is testable
    without a network: it takes the client, the model and the prompt,
    and returns the rewritten text.
    """
    alerts = style.check(answer)
    if not style.errors(alerts):
        return Written(answer=answer, alerts=alerts)

    first = answer
    ask = ask or _one_call
    for attempt in range(1, MOST_TRIES + 1):
        note = style.rewrite_note(style.errors(alerts))
        try:
            again = await ask(client, model, ASK.format(alerts=note, answer=answer))
        except Exception as problem:
            #: A rewrite that could not happen is not a reason to lose
            #: the answer. Ship what there is and say it was not clean.
            log.warning("style.rewrite_failed", error=str(problem))
            return Written(answer=answer, alerts=alerts, tries=attempt - 1, first=first)
        again = (again or "").strip()
        if not again:
            break
        answer = again
        alerts = style.check(answer)
        if not style.errors(alerts):
            return Written(answer=answer, alerts=alerts, tries=attempt, first=first)

    #: Out of tries. The founder's rule: ship it with a flag rather than
    #: block. The alerts ride along so this is countable later.
    log.info(
        "style.shipped_with_alerts",
        alerts=[one.rule for one in style.errors(alerts)],
    )
    return Written(answer=answer, alerts=alerts, tries=MOST_TRIES, first=first)


async def _one_call(client: Client, model: str, prompt: str) -> str:
    """One model call, no tools, low effort — this is copy-editing."""
    async with client.messages.stream(
        model=model,
        max_tokens=2_000,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "low"},
    ) as stream:
        async for _ in stream.text_stream:
            pass
        message = await stream.get_final_message()
    return "\n".join(
        block.text for block in message.content if getattr(block, "type", "") == "text"
    ).strip()


__all__ = ["ASK", "MOST_TRIES", "Written", "written"]
