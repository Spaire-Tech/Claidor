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
- Offers that fail the filters asked for (refundable only) are dropped, the
  same itinerary at several fares keeps its cheapest, and the cheapest four
  are drawn.
- Each is shaped for the card: times in the airports' own local time, the
  layover between legs, the bags of the first leg, and the refund and change
  rules with their fee.

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
    `Full refund`, `Refund minus $75.00`, `No refund`, or `` when the
    airline does not say (2 October 2026: the founder found "Yes, no fee"
    meant nothing)."""
    known = _known(rule)
    if known is None:
        return ""
    if not known["allowed"]:
        return "No refund"
    fee = _fee(known)
    return f"Refund minus {fee}" if fee else "Full refund"


def change_terms(rule: Any) -> str:
    """Changing before departure: `Free`, `$75.00 fee`, `Not allowed`, or ``."""
    known = _known(rule)
    if known is None:
        return ""
    if not known["allowed"]:
        return "Not allowed"
    fee = _fee(known)
    return f"{fee} fee" if fee else "Free"


def _bags(segment: dict[str, Any]) -> str:
    passengers = segment.get("passengers")
    first = passengers[0] if isinstance(passengers, list) and passengers else {}
    carry = checked = 0
    for bag in first.get("baggages") or [] if isinstance(first, dict) else []:
        if not isinstance(bag, dict):
            continue
        raw = bag.get("quantity")
        quantity = raw if isinstance(raw, int) else 0
        if bag.get("type") == "carry_on":
            carry += quantity
        elif bag.get("type") == "checked":
            checked += quantity
    if carry == 0 and checked == 0:
        return ""
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


def _stops(count: int) -> str:
    return "Nonstop" if count == 0 else f"{count} stop{'s' if count != 1 else ''}"


def _segments(slice_: dict[str, Any]) -> list[dict[str, Any]]:
    return [one for one in slice_.get("segments") or [] if isinstance(one, dict)]


def _leg(segment: dict[str, Any], requested_cabin: str) -> dict[str, str]:
    carrier = _dict(segment.get("marketing_carrier"))
    number = _text(segment.get("marketing_carrier_flight_number"))
    code = _text(carrier.get("iata_code"))
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
        "flight": f"{code} {number}".strip(),
        "carrier": _text(carrier.get("name")),
        "logo": _text(carrier.get("logo_symbol_url")),
        "cabin": _cabin(segment, requested_cabin),
        "duration": duration(segment.get("duration")),
    }


def _return_times(slices: list[dict[str, Any]]) -> str:
    """`Return 7:46 PM – 10:40 PM` on a round trip's row, so two offers
    that share the way out read as the different trips they are."""
    if len(slices) < 2 or not _segments(slices[1]):
        return ""
    back = _segments(slices[1])
    leaves, lands = (
        _local(back[0].get("departing_at")),
        _local(back[-1].get("arriving_at")),
    )
    return f"Return {clock(leaves)} – {clock(lands)}{_days_later(leaves, lands)}"


def _itinerary_key(offer: dict[str, Any]) -> tuple[str, ...]:
    """The flights an offer flies, so one itinerary sold at several fares
    is shown once, at its cheapest."""
    return tuple(
        f"{_text(segment.get('departing_at'))}/{_text((segment.get('marketing_carrier') or {}).get('iata_code'))}{_text(segment.get('marketing_carrier_flight_number'))}"
        for slice_ in offer.get("slices") or []
        if isinstance(slice_, dict)
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
        for position, segment in enumerate(segments):
            leg = _leg(segment, cabin)
            if position + 1 < len(segments):
                landed = _local(segment.get("arriving_at"))
                leaves = _local(segments[position + 1].get("departing_at"))
                if landed is not None and leaves is not None:
                    wait = int((leaves - landed).total_seconds() // 60)
                    leg["layover"] = (
                        f"{minutes_text(wait)} in {leg['toCity'] or leg['to']}"
                    )
            if index > 0 and position == 0:
                leg["heading"] = f"Return · {day(_local(segment.get('departing_at')))}"
            legs.append(leg)

    travellers = f"{adults} adult{'s' if adults != 1 else ''}"
    cabin_name = _cabin(first, cabin)
    return {
        "airline": _text(owner.get("name")),
        "logo": _text(owner.get("logo_symbol_url")),
        "price": money(offer.get("total_amount"), offer.get("total_currency")),
        "priceNote": " · ".join(
            part
            for part in (
                travellers,
                cabin_name,
                "Round trip" if len(slices) > 1 else "",
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
        "stops": _stops(len(outbound) - 1),
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


def pick_offers(
    offers: list[dict[str, Any]],
    *,
    refundable_only: bool,
    limit: int = MAX_OFFERS_SHOWN,
) -> list[dict[str, Any]]:
    """The cheapest `limit` offers that pass the filters, one per itinerary."""
    kept: dict[tuple[str, ...], dict[str, Any]] = {}
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        if refundable_only:
            rule = _dict(offer.get("conditions")).get("refund_before_departure")
            if not isinstance(rule, dict) or rule.get("allowed") is not True:
                continue
        key = _itinerary_key(offer)
        if not key:
            continue
        held = kept.get(key)
        if held is None or _price(offer) < _price(held):
            kept[key] = offer
    return sorted(kept.values(), key=_price)[:limit]


def card_for(
    offers: list[dict[str, Any]],
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
    shown = [
        card
        for card in (offer_for_card(one, adults=adults, cabin=cabin) for one in offers)
        if card
    ]
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
                "airline",
                "price",
                "depart",
                "arrive",
                "stops",
                "duration",
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
        if code:
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
    depart_after?, arrive_before?, refundable_only?, nonstop_only?}` in;
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
    picked = pick_offers(offers, refundable_only=refundable_only)
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
