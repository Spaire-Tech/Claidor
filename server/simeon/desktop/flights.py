"""Flight search for the agents, through Duffel (2 October 2026).

The founder: "Duffel is fine then. Design it exactly like muse", then
"lets build in test mode then". An agent asked for a flight calls one tool;
the tool calls `POST /desktop/api/flights/search` here with the box's own
credential; this asks Duffel and answers with the results card the window
draws (the ```simeon-flights block, `router-renderer-patch.mjs`) and a short
summary for the agent to write its one line from.

The key is `SIMEON_DUFFEL_ACCESS_TOKEN` on Render and never leaves the
server. Empty means the route answers 503 and the agent says flight search
is not switched on. A `duffel_test_` key searches Duffel's test mode: its
own pretend airline, Duffel Airways, and real airlines' sandboxes, at
unrealistic prices; the card then says "Test results" so nobody takes them
for real fares.

What it does, in order:

- A city or an airport is turned into an IATA code: three letters are taken
  as they are, anything else goes through Duffel's place suggestions.
- One offer request, one way or a round trip, with the times asked for
  ("arrive by 2 PM" is an arrival window) and at most one connection unless
  only non-stops were asked for.
- Offers that fail the filters asked for (refundable only, the airlines
  named) are dropped, and the same flights sold at several fares count as one
  itinerary at its cheapest fare.
- The shortlist is chosen the way Muse's own flight rules choose it (the
  founder, 2 October 2026: "take example from muse ... ours isnt smart"): the
  shortest whole journey first, nonstop preferred over a connection that
  saves only minutes; then a meaningfully cheaper longer option; then a
  refundable fare when none of those is one; then other distinct trips,
  never a near-copy of one already shown (same shape, departing close to it,
  no faster and no cheaper). Asked for the cheapest, it leads with the
  cheapest and keeps a meaningfully faster one.
- Each is shaped for the card: times in the airports' own local time, every
  connection airport with its layover, the operating airline when another
  one flies it, the fare brand, the bags of the first leg, and the refund
  and change rules with their fee. A fact the airline does not give reads
  "Not stated", never "none" or "no".

Searches are capped per person per hour (`FLIGHT_SEARCHES_PER_HOUR`): past
Duffel's free allowance each one is billed, and a looping agent must not run
that up.
"""

from __future__ import annotations

import re
import time
from datetime import date, datetime
from typing import Any

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from simeon.config import settings
from simeon.models import DesktopSession
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from .auth import get_desktop_or_box_session
from .proxy_common import error_response

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_TIMEOUT = httpx.Timeout(45.0, connect=10.0)
_IATA = re.compile(r"^[A-Za-z]{3}$")
_HHMM = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
_CABINS = {"economy", "premium_economy", "business", "first"}
_CABIN_NAMES = {
    "economy": "Economy",
    "premium_economy": "Premium Economy",
    "business": "Business",
    "first": "First",
}
_SYMBOLS = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "CAD": "CA$",
    "AUD": "A$",
    "JPY": "¥",
    "CHF": "CHF ",
}
MAX_OFFERS_SHOWN = 4
NOT_STATED = "Not stated"
# A connection has to save more than this, per stop, to lead over a nonstop.
_STOP_PENALTY_MINUTES = 30
# "Meaningfully" cheaper or faster, for the second pick.
_CHEAPER_SHARE, _CHEAPER_AT_LEAST = 0.9, 20.0
_FASTER_AT_LEAST_MINUTES = 45
# Two trips leaving within this of each other are the same choice to a person.
_NEAR_DEPARTURE_MINUTES = 120


class DuffelError(Exception):
    """Duffel answered, and not with success, or could not be reached
    (`status` 0)."""

    def __init__(self, status: int, body: str, path: str) -> None:
        self.status = status
        self.body = body
        self.path = path
        super().__init__(f"Duffel {path} answered {status}: {body[:300]}")


class SearchRefused(Exception):
    """A search this route will not make, with the sentence the agent reads."""

    def __init__(self, message: str, status: int = 400) -> None:
        self.message = message
        self.status = status
        super().__init__(message)


class DuffelClient:
    """The two Duffel calls Simeon makes, and nothing else."""

    def __init__(self, token: str, base_url: str) -> None:
        self.token = token
        self.base_url = base_url.rstrip("/")

    @property
    def is_test(self) -> bool:
        return self.token.startswith("duffel_test_")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Duffel-Version": "v2",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    params=params,
                    json=json,
                    headers=headers,
                )
        except httpx.HTTPError as error:
            raise DuffelError(0, str(error), path) from error
        if response.status_code >= 400:
            raise DuffelError(response.status_code, response.text, path)
        return response.json()

    async def place_suggestions(self, query: str) -> list[dict[str, Any]]:
        answer = await self._request(
            "GET", "/places/suggestions", params={"query": query}
        )
        data = answer.get("data") if isinstance(answer, dict) else None
        return [one for one in data or [] if isinstance(one, dict)]

    async def search(self, body: dict[str, Any]) -> dict[str, Any]:
        answer = await self._request(
            "POST",
            "/air/offer_requests",
            params={"return_offers": "true", "supplier_timeout": "15000"},
            json={"data": body},
        )
        data = answer.get("data") if isinstance(answer, dict) else None
        return data if isinstance(data, dict) else {}


def client() -> DuffelClient:
    """The client the route uses. Tests replace this function."""
    return DuffelClient(settings.DUFFEL_ACCESS_TOKEN, settings.DUFFEL_BASE_URL)


# --- shaping Duffel's offers for the card ------------------------------------


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def money(amount: Any, currency: Any) -> str:
    """`$361.20`, `€89.00`, `1,250.00 NOK`."""
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return ""
    code = _text(currency).upper()
    figure = f"{value:,.2f}"
    symbol = _SYMBOLS.get(code)
    return f"{symbol}{figure}" if symbol else f"{figure} {code}".strip()


def duration(value: Any) -> str:
    """ISO 8601 durations as the card writes them: `PT6H18M` is `6h 18m`,
    `P1DT2H` is `26h`."""
    match = re.fullmatch(
        r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?", _text(value)
    )
    if match is None:
        return ""
    days, hours, minutes = (int(part) if part else 0 for part in match.groups())
    return minutes_text(days * 24 * 60 + hours * 60 + minutes)


def minutes_text(total: int) -> str:
    hours, minutes = divmod(max(0, total), 60)
    if hours and minutes:
        return f"{hours}h {minutes:02d}m"
    return f"{hours}h" if hours else f"{minutes}m"


def _local(value: Any) -> datetime | None:
    """Duffel's departing_at and arriving_at are the airport's own local
    time; an offset, when one is given, is dropped so the clock reads as the
    traveller will see it."""
    text = _text(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=None)


def clock(moment: datetime | None) -> str:
    if moment is None:
        return ""
    hour = moment.hour % 12 or 12
    return f"{hour}:{moment.minute:02d} {'AM' if moment.hour < 12 else 'PM'}"


def day(moment: datetime | date | None) -> str:
    """`Fri, Oct 2`."""
    if moment is None:
        return ""
    return f"{moment.strftime('%a')}, {moment.strftime('%b')} {moment.day}"


def _days_later(start: datetime | None, end: datetime | None) -> str:
    if start is None or end is None:
        return ""
    later = (end.date() - start.date()).days
    return f" +{later}" if later > 0 else ""


def _city(place: Any) -> str:
    if not isinstance(place, dict):
        return ""
    return _text(place.get("city_name")) or _text(place.get("name"))


def _code(place: Any) -> str:
    return _text(place.get("iata_code")) if isinstance(place, dict) else ""


def _fee(rule: dict[str, Any]) -> str:
    try:
        fee = float(rule.get("penalty_amount") or 0)
    except (TypeError, ValueError):
        fee = 0.0
    return money(fee, rule.get("penalty_currency")) if fee > 0 else ""


def _known(rule: Any) -> dict[str, Any] | None:
    if not isinstance(rule, dict) or not isinstance(rule.get("allowed"), bool):
        return None
    return rule


def refund_terms(rule: Any) -> str:
    """Cancelling before departure, in the words a person reads on a fare:
    `Full refund`, `Refund minus $75.00`, `No refund`, or `Not stated` when
    the airline does not say (2 October 2026: the founder found "Yes, no fee"
    meant nothing; Muse's rules: an absent fact is "not stated", never
    "none")."""
    known = _known(rule)
    if known is None:
        return NOT_STATED
    if not known["allowed"]:
        return "No refund"
    fee = _fee(known)
    return f"Refund minus {fee}" if fee else "Full refund"


def change_terms(rule: Any) -> str:
    """Changing before departure: `Free`, `$75.00 fee`, `Not allowed`, or
    `Not stated`."""
    known = _known(rule)
    if known is None:
        return NOT_STATED
    if not known["allowed"]:
        return "Not allowed"
    fee = _fee(known)
    return f"{fee} fee" if fee else "Free"


def _bags(segment: dict[str, Any]) -> str:
    """`1 carry-on, 1 checked bag`; `No bags included` when the fare lists
    its bags and every count is zero; `Not stated` when it lists none."""
    passengers = segment.get("passengers")
    first = passengers[0] if isinstance(passengers, list) and passengers else {}
    listed = first.get("baggages") if isinstance(first, dict) else None
    if not isinstance(listed, list) or not listed:
        return NOT_STATED
    carry = checked = 0
    for bag in listed:
        if not isinstance(bag, dict):
            continue
        raw = bag.get("quantity")
        quantity = raw if isinstance(raw, int) else 0
        if bag.get("type") == "carry_on":
            carry += quantity
        elif bag.get("type") == "checked":
            checked += quantity
    if carry == 0 and checked == 0:
        return "No bags included"
    parts = []
    if carry:
        parts.append(f"{carry} carry-on")
    if checked:
        parts.append(f"{checked} checked bag{'s' if checked != 1 else ''}")
    return ", ".join(parts)


def _cabin(segment: dict[str, Any], requested: str) -> str:
    passengers = segment.get("passengers")
    first = passengers[0] if isinstance(passengers, list) and passengers else {}
    named = (
        _text(first.get("cabin_class_marketing_name"))
        if isinstance(first, dict)
        else ""
    )
    if named.isupper():
        named = named.title()
    return named or _CABIN_NAMES.get(requested, "")


def _fare(segment: dict[str, Any], requested: str, brand: str) -> str:
    """The cabin and, when the airline names one, its fare brand:
    `Economy · Main Cabin`, `Economy · Basic`."""
    cabin = _cabin(segment, requested)
    if not brand or brand.lower() == cabin.lower():
        return cabin
    if brand.isupper():
        brand = brand.title()
    return f"{cabin} · {brand}" if cabin else brand


def _carrier_flight(carrier: Any, number: Any) -> str:
    return f"{_text(_dict(carrier).get('iata_code'))} {_text(number)}".strip()


def _connections(slice_: dict[str, Any]) -> list[tuple[str, str]]:
    """Each connection in a slice: `(airport, layover)`, the layover worked
    out from the two segments' local times at that same airport, or
    `layover length not stated` when it cannot be (a change of airports, or
    a time missing), never guessed across time zones."""
    segments = _segments(slice_)
    found: list[tuple[str, str]] = []
    for here, there in zip(segments, segments[1:], strict=False):
        landed_at, leaves_from = (
            _code(here.get("destination")),
            _code(there.get("origin")),
        )
        landed, leaves = (
            _local(here.get("arriving_at")),
            _local(there.get("departing_at")),
        )
        if landed is None or leaves is None or landed_at != leaves_from:
            found.append((landed_at or leaves_from, "layover length not stated"))
            continue
        found.append(
            (landed_at, minutes_text(int((leaves - landed).total_seconds() // 60)))
        )
    return found


def _stops(count: int) -> str:
    return "Nonstop" if count == 0 else f"{count} stop{'s' if count != 1 else ''}"


def _stops_line(slice_: dict[str, Any]) -> str:
    """`Nonstop`, or the stops with every connection airport and its layover:
    `1 stop · PHX 1h 38m`."""
    connections = _connections(slice_)
    if not connections:
        return "Nonstop"
    where = ", ".join(f"{airport} {wait}".strip() for airport, wait in connections)
    return f"{_stops(len(connections))} · {where}"


def _segments(slice_: dict[str, Any]) -> list[dict[str, Any]]:
    return [one for one in slice_.get("segments") or [] if isinstance(one, dict)]


def _leg(
    segment: dict[str, Any], requested_cabin: str, brand: str = ""
) -> dict[str, str]:
    carrier = _dict(segment.get("marketing_carrier"))
    flight = _carrier_flight(carrier, segment.get("marketing_carrier_flight_number"))
    operator = _dict(segment.get("operating_carrier"))
    operator_name = _text(operator.get("name"))
    if (
        operator_name
        and _text(operator.get("iata_code"))
        and _text(operator.get("iata_code")) != _text(carrier.get("iata_code"))
    ):
        flight = f"{flight} · operated by {operator_name}"
    departs, arrives = (
        _local(segment.get("departing_at")),
        _local(segment.get("arriving_at")),
    )
    return {
        "from": _code(segment.get("origin")),
        "fromCity": _city(segment.get("origin")),
        "to": _code(segment.get("destination")),
        "toCity": _city(segment.get("destination")),
        "depart": clock(departs),
        "arrive": clock(arrives) + _days_later(departs, arrives),
        "departDay": day(departs),
        "arriveDay": day(arrives),
        "flight": flight,
        "carrier": _text(carrier.get("name")),
        "logo": _text(carrier.get("logo_symbol_url")),
        "cabin": _fare(segment, requested_cabin, brand),
        "duration": duration(segment.get("duration")),
    }


def _return_times(slices: list[dict[str, Any]]) -> str:
    """`Return 7:46 PM – 10:40 PM · Nonstop` on a round trip's row, so two
    offers that share the way out read as the different trips they are."""
    if len(slices) < 2 or not _segments(slices[1]):
        return ""
    back = _segments(slices[1])
    leaves, lands = (
        _local(back[0].get("departing_at")),
        _local(back[-1].get("arriving_at")),
    )
    times = f"{clock(leaves)} – {clock(lands)}{_days_later(leaves, lands)}"
    return f"Return {times} · {_stops_line(slices[1])}"


def _slices(offer: dict[str, Any]) -> list[dict[str, Any]]:
    return [one for one in offer.get("slices") or [] if isinstance(one, dict)]


def _itinerary_key(offer: dict[str, Any]) -> tuple[str, ...]:
    """The complete itinerary an offer flies (every segment's airports,
    local times and marketing and operating flight numbers, in order), so
    one itinerary sold at several fares counts once."""
    return tuple(
        "/".join(
            (
                _code(segment.get("origin")),
                _text(segment.get("departing_at")),
                _code(segment.get("destination")),
                _text(segment.get("arriving_at")),
                _carrier_flight(
                    segment.get("marketing_carrier"),
                    segment.get("marketing_carrier_flight_number"),
                ),
                _carrier_flight(
                    segment.get("operating_carrier"),
                    segment.get("operating_carrier_flight_number"),
                ),
            )
        )
        for slice_ in _slices(offer)
        for segment in _segments(slice_)
    )


def offer_for_card(
    offer: dict[str, Any], *, adults: int, cabin: str
) -> dict[str, Any] | None:
    slices = [one for one in offer.get("slices") or [] if isinstance(one, dict)]
    if not slices or not _segments(slices[0]):
        return None
    outbound = _segments(slices[0])
    first, last = outbound[0], outbound[-1]
    departs, arrives = (
        _local(first.get("departing_at")),
        _local(last.get("arriving_at")),
    )
    owner = _dict(offer.get("owner"))
    conditions = _dict(offer.get("conditions"))

    legs: list[dict[str, str]] = []
    for index, slice_ in enumerate(slices):
        segments = _segments(slice_)
        connections = _connections(slice_)
        brand = _text(slice_.get("fare_brand_name"))
        for position, segment in enumerate(segments):
            leg = _leg(segment, cabin, brand)
            if position < len(connections):
                wait = connections[position][1]
                if wait == "layover length not stated":
                    leg["layover"] = (
                        f"Layover length not stated in {leg['toCity'] or leg['to']}"
                    )
                else:
                    leg["layover"] = f"{wait} in {leg['toCity'] or leg['to']}"
            if index > 0 and position == 0:
                leg["heading"] = f"Return · {day(_local(segment.get('departing_at')))}"
            legs.append(leg)

    travellers = f"{adults} adult{'s' if adults != 1 else ''}"
    cabin_name = _fare(first, cabin, _text(slices[0].get("fare_brand_name")))
    return {
        "airline": _text(owner.get("name")),
        "logo": _text(owner.get("logo_symbol_url")),
        "price": money(offer.get("total_amount"), offer.get("total_currency")),
        "priceNote": " · ".join(
            part
            for part in (
                travellers,
                cabin_name,
                "Round trip" if len(slices) > 1 else "One way",
            )
            if part
        ),
        "date": day(departs),
        "from": _code(slices[0].get("origin")),
        "fromCity": _city(slices[0].get("origin")),
        "to": _code(slices[0].get("destination")),
        "toCity": _city(slices[0].get("destination")),
        "depart": clock(departs),
        "arrive": clock(arrives) + _days_later(departs, arrives),
        "duration": duration(slices[0].get("duration")),
        "stops": _stops_line(slices[0]),
        "refundable": refund_terms(conditions.get("refund_before_departure")),
        "changeable": change_terms(conditions.get("change_before_departure")),
        "bags": _bags(first),
        "legs": legs,
        "returnTimes": _return_times(slices),
    }


def _price(offer: dict[str, Any]) -> float:
    try:
        return float(str(offer.get("total_amount")))
    except (TypeError, ValueError):
        return float("inf")


def iso_minutes(value: Any) -> int | None:
    match = re.fullmatch(
        r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?", _text(value)
    )
    if match is None or not any(match.groups()):
        return None
    days, hours, minutes = (int(part) if part else 0 for part in match.groups())
    return days * 24 * 60 + hours * 60 + minutes


def journey_minutes(offer: dict[str, Any]) -> float:
    """The whole journey, connections included, from the airline's own
    durations (never two airports' local clocks subtracted): each slice's
    duration, or its segments' flying time and its layovers."""
    total = 0
    for slice_ in _slices(offer):
        whole = iso_minutes(slice_.get("duration"))
        if whole is None:
            flying = [iso_minutes(one.get("duration")) for one in _segments(slice_)]
            if not flying or any(part is None for part in flying):
                return float("inf")
            whole = sum(part for part in flying if part is not None)
            for _airport, wait in _connections(slice_):
                waited = re.fullmatch(r"(?:(\d+)h)?\s?(?:(\d+)m)?", wait)
                if waited is None or not any(waited.groups()):
                    return float("inf")
                whole += int(waited.group(1) or 0) * 60 + int(waited.group(2) or 0)
        total += whole
    return float(total) if total else float("inf")


def _stop_count(offer: dict[str, Any]) -> int:
    return sum(max(0, len(_segments(one)) - 1) for one in _slices(offer))


def _changes_airports(offer: dict[str, Any]) -> bool:
    return any(
        _code(here.get("destination")) != _code(there.get("origin"))
        for slice_ in _slices(offer)
        for here, there in zip(_segments(slice_), _segments(slice_)[1:], strict=False)
    )


def _carriers(offer: dict[str, Any]) -> set[str]:
    codes = {_text(_dict(offer.get("owner")).get("iata_code")).upper()}
    for slice_ in _slices(offer):
        for segment in _segments(slice_):
            for side in ("marketing_carrier", "operating_carrier"):
                codes.add(_text(_dict(segment.get(side)).get("iata_code")).upper())
    return codes - {""}


def _refundable(offer: dict[str, Any]) -> bool:
    rule = _dict(offer.get("conditions")).get("refund_before_departure")
    return isinstance(rule, dict) and rule.get("allowed") is True


def _departs(offer: dict[str, Any]) -> datetime | None:
    slices = _slices(offer)
    segments = _segments(slices[0]) if slices else []
    return _local(segments[0].get("departing_at")) if segments else None


def _speed(offer: dict[str, Any]) -> tuple[float, float]:
    """Shortest reasonable journey first: a connection must save more than
    half an hour a stop to lead over a nonstop; then the price."""
    return (
        journey_minutes(offer) + _STOP_PENALTY_MINUTES * _stop_count(offer),
        _price(offer),
    )


def _cheapness(offer: dict[str, Any]) -> tuple[float, float]:
    return (_price(offer), _speed(offer)[0])


def _near_copy(offer: dict[str, Any], of: dict[str, Any]) -> bool:
    """`offer` adds nothing next to `of`: no fewer stops, no shorter, no
    cheaper, and leaving at much the same time."""
    leaves, other = _departs(offer), _departs(of)
    close = (
        leaves is not None
        and other is not None
        and abs((leaves - other).total_seconds()) <= _NEAR_DEPARTURE_MINUTES * 60
    )
    return (
        close
        and _stop_count(of) <= _stop_count(offer)
        and journey_minutes(of) <= journey_minutes(offer)
        and _price(of) <= _price(offer)
    )


def pick_offers(
    offers: list[dict[str, Any]],
    *,
    refundable_only: bool,
    priority: str = "fastest",
    airlines: frozenset[str] = frozenset(),
    limit: int = MAX_OFFERS_SHOWN,
) -> list[tuple[dict[str, Any], str]]:
    """The shortlist, in the order it is shown, each with why it is there:
    `Fastest`, `Cheapest`, `Refundable`, or `` for another distinct trip."""
    cheapest: dict[tuple[str, ...], dict[str, Any]] = {}
    refundable: dict[tuple[str, ...], dict[str, Any]] = {}
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        if refundable_only and not _refundable(offer):
            continue
        if airlines and not _carriers(offer) & airlines:
            continue
        key = _itinerary_key(offer)
        if not key:
            continue
        held = cheapest.get(key)
        if held is None or _price(offer) < _price(held):
            cheapest[key] = offer
        if _refundable(offer):
            held = refundable.get(key)
            if held is None or _price(offer) < _price(held):
                refundable[key] = offer
    pool = list(cheapest.values())
    # An airport change mid-journey is shown only when nothing else is left.
    simple = [one for one in pool if not _changes_airports(one)]
    pool = simple or pool
    if not pool:
        return []

    by_speed = sorted(pool, key=_speed)
    by_price = sorted(pool, key=_cheapness)
    picked: list[tuple[dict[str, Any], str]] = []

    def chosen(offer: dict[str, Any]) -> bool:
        return any(offer is one for one, _why in picked)

    if priority == "cheapest":
        lead = by_price[0]
        picked.append((lead, "Cheapest"))
        fastest = by_speed[0]
        if (
            not chosen(fastest)
            and journey_minutes(lead) - journey_minutes(fastest)
            >= _FASTER_AT_LEAST_MINUTES
        ):
            picked.append((fastest, "Fastest"))
    else:
        lead = by_speed[0]
        picked.append((lead, "Fastest"))
        cheap = by_price[0]
        if (
            not chosen(cheap)
            and _price(cheap) <= _price(lead) * _CHEAPER_SHARE
            and _price(lead) - _price(cheap) >= _CHEAPER_AT_LEAST
        ):
            picked.append((cheap, "Cheapest"))

    if not refundable_only and not any(_refundable(one) for one, _why in picked):
        flexible = sorted(
            (
                one
                for one in refundable.values()
                if not (simple and _changes_airports(one))
            ),
            key=_speed if priority != "cheapest" else _cheapness,
        )
        if flexible and len(picked) < limit:
            picked.append((flexible[0], "Refundable"))

    order = by_price if priority == "cheapest" else by_speed
    for offer in order:
        if len(picked) >= limit:
            break
        if chosen(offer) or any(_near_copy(offer, one) for one, _why in picked):
            continue
        picked.append((offer, ""))
    # Still short (every other trip was a near copy): fill in order.
    for offer in order:
        if len(picked) >= limit:
            break
        if not chosen(offer):
            picked.append((offer, ""))

    rank = {id(one): index for index, one in enumerate(order)}
    head, rest = picked[:1], picked[1:]
    rest.sort(key=lambda pair: rank.get(id(pair[0]), len(order)))
    return head + rest


def card_for(
    offers: list[tuple[dict[str, Any], str]],
    *,
    origin_city: str,
    destination_city: str,
    departure: date,
    return_date: date | None,
    adults: int,
    cabin: str,
    refundable_only: bool,
    test: bool,
) -> dict[str, Any]:
    shown = []
    for offer, why in offers:
        card = offer_for_card(offer, adults=adults, cabin=cabin)
        if card:
            card["label"] = why
            shown.append(card)
    subtitle = [
        "Test results" if test else "",
        day(departure) + (f" – {day(return_date)}" if return_date else ""),
        "Refundable" if refundable_only else "",
        f"{adults} adult{'s' if adults != 1 else ''}",
    ]
    return {
        "title": f"{origin_city} to {destination_city}",
        "subtitle": " · ".join(part for part in subtitle if part),
        "test": test,
        "offers": shown,
    }


def summary_for(card: dict[str, Any]) -> list[dict[str, str]]:
    """What the agent reads back: enough to write one line, nothing more."""
    return [
        {
            key: offer.get(key, "")
            for key in (
                "label",
                "airline",
                "price",
                "priceNote",
                "depart",
                "arrive",
                "stops",
                "duration",
                "returnTimes",
                "refundable",
                "changeable",
                "bags",
            )
        }
        for offer in card.get("offers", [])
    ]


# --- the request ---------------------------------------------------------------


def _parse_date(value: Any, field: str) -> date:
    try:
        return date.fromisoformat(_text(value))
    except ValueError as error:
        raise SearchRefused(f"{field} must be a date like 2026-10-02.") from error


def _parse_time(value: Any, field: str) -> str | None:
    text = _text(value)
    if not text:
        return None
    match = _HHMM.match(text)
    if match is None:
        raise SearchRefused(f"{field} must be a time like 14:00.")
    return f"{int(match.group(1)):02d}:{match.group(2)}"


async def resolve_place(api: DuffelClient, query: str) -> tuple[str, str]:
    """`(IATA code, city name)` for a city or an airport."""
    text = _text(query)
    if not text:
        raise SearchRefused("Say where the flight leaves from and where it goes.")
    suggestions = await api.place_suggestions(text)
    if _IATA.match(text):
        code = text.upper()
        named = next(
            (one for one in suggestions if _text(one.get("iata_code")).upper() == code),
            None,
        )
        return code, _city(named) if named else code
    for one in suggestions:
        code = _text(one.get("iata_code"))
        if not code:
            continue
        # A city with one airport is searched as that airport's exact code;
        # a city with several (New York) keeps the city's code, and each row
        # names the airports it really uses.
        airports = [
            _text(airport.get("iata_code"))
            for airport in one.get("airports") or []
            if isinstance(airport, dict) and _text(airport.get("iata_code"))
        ]
        if one.get("type") == "city" and len(airports) == 1:
            code = airports[0]
        return code.upper(), _city(one) or text
    raise SearchRefused(f"I couldn't find an airport for “{text}”.")


async def _over_limit(redis: Redis, user_id: str) -> bool:
    key = f"desktop:flights:search:{user_id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    return count > settings.FLIGHT_SEARCHES_PER_HOUR


def _answer(data: dict[str, Any]) -> JSONResponse:
    return JSONResponse({"code": 0, "data": data})


def _refuse(message: str, status: int) -> JSONResponse:
    """The server's one error shape (`proxy_common.error_response`), which
    the host's `simeonApiData` reads the sentence out of."""
    kind = {
        400: "invalid_request_error",
        429: "rate_limit_error",
        503: "not_configured",
    }.get(status, "api_error")
    return error_response(kind, message, status)


@router.post("/api/flights/search", name="desktop:flights_search")
async def search_flights(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """`{origin, destination, date, return_date?, adults?, cabin?,
    depart_after?, arrive_before?, refundable_only?, nonstop_only?,
    priority?, airlines?}` in;
    `{card, summary, test, found}` out, `card` null when nothing matched."""
    if not settings.DUFFEL_ACCESS_TOKEN:
        return _refuse("Flight search is not switched on yet.", 503)
    user_id = str(desktop_session.user_id)
    if await _over_limit(redis, user_id):
        log.info("desktop.flights.rate_limited", user_id=user_id)
        return _refuse("Too many flight searches this hour; try again later.", 429)

    try:
        body = await request.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        return _refuse("Send the search as JSON.", 400)

    started = time.monotonic()
    api = client()
    try:
        departure = _parse_date(body.get("date"), "date")
        return_date = (
            _parse_date(body["return_date"], "return_date")
            if _text(body.get("return_date"))
            else None
        )
        if return_date is not None and return_date < departure:
            raise SearchRefused("The return date is before the departure date.")
        if departure < date.today():
            raise SearchRefused("That date has passed.")
        adults = body.get("adults", 1)
        if (
            not isinstance(adults, int)
            or isinstance(adults, bool)
            or not 1 <= adults <= 9
        ):
            raise SearchRefused("adults must be a number from 1 to 9.")
        cabin = _text(body.get("cabin")).lower() or "economy"
        if cabin not in _CABINS:
            raise SearchRefused(
                "cabin must be economy, premium_economy, business or first."
            )
        depart_after = _parse_time(body.get("depart_after"), "depart_after")
        arrive_before = _parse_time(body.get("arrive_before"), "arrive_before")
        refundable_only = body.get("refundable_only") is True
        nonstop_only = body.get("nonstop_only") is True
        priority = _text(body.get("priority")).lower() or "fastest"
        if priority not in {"fastest", "cheapest"}:
            raise SearchRefused("priority must be fastest or cheapest.")
        named = body.get("airlines") or []
        if not isinstance(named, list) or not all(
            isinstance(one, str) and re.fullmatch(r"[A-Za-z0-9]{2}", one.strip())
            for one in named
        ):
            raise SearchRefused(
                'airlines must be two-letter airline codes, like ["AS", "DL"].'
            )
        airlines = frozenset(one.strip().upper() for one in named)

        origin, origin_city = await resolve_place(api, _text(body.get("origin")))
        destination, destination_city = await resolve_place(
            api, _text(body.get("destination"))
        )

        outbound: dict[str, Any] = {
            "origin": origin,
            "destination": destination,
            "departure_date": departure.isoformat(),
        }
        if depart_after:
            outbound["departure_time"] = {"from": depart_after, "to": "23:59"}
        if arrive_before:
            outbound["arrival_time"] = {"from": "00:00", "to": arrive_before}
        slices = [outbound]
        if return_date is not None:
            slices.append(
                {
                    "origin": destination,
                    "destination": origin,
                    "departure_date": return_date.isoformat(),
                }
            )
        found = await api.search(
            {
                "slices": slices,
                "passengers": [{"type": "adult"} for _ in range(adults)],
                "cabin_class": cabin,
                "max_connections": 0 if nonstop_only else 1,
            }
        )
    except SearchRefused as refused:
        return _refuse(refused.message, refused.status)
    except DuffelError as error:
        log.warning(
            "desktop.flights.upstream_refused",
            path=error.path,
            status=error.status,
            body=error.body[:1000] or "(empty)",
        )
        if error.status == 0:
            return _refuse(
                "The flight search could not be reached; try again in a moment.", 502
            )
        return _refuse("The flight search did not answer; try again in a moment.", 502)

    offers = [one for one in found.get("offers") or [] if isinstance(one, dict)]
    picked = pick_offers(
        offers, refundable_only=refundable_only, priority=priority, airlines=airlines
    )
    card = card_for(
        picked,
        origin_city=origin_city,
        destination_city=destination_city,
        departure=departure,
        return_date=return_date,
        adults=adults,
        cabin=cabin,
        refundable_only=refundable_only,
        test=api.is_test,
    )
    log.info(
        "desktop.flights.search",
        user_id=user_id,
        origin=origin,
        destination=destination,
        date=departure.isoformat(),
        round_trip=return_date is not None,
        priority=priority,
        airlines=sorted(airlines),
        found=len(offers),
        shown=len(card["offers"]),
        test=api.is_test,
        ms=int((time.monotonic() - started) * 1000),
    )
    return _answer(
        {
            "card": card if card["offers"] else None,
            "summary": summary_for(card),
            "test": api.is_test,
            "found": len(offers),
        }
    )
