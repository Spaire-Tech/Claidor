"""Booking a flight through Duffel, paid with the person's own card through
Link (13 October 2026; the founder: "we can book thru duffel. all we need is
a form. when they enter their info then we take care of checkouts thru
link", then "go").

Nobody holds a Duffel balance. Duffel's card payments let the traveller pay
the airline directly: the card goes into Duffel's own card form (an iframe on
api.duffel.cards, so it never reaches these servers), is confirmed with the
bank (3-D Secure), and the order is placed with that confirmation. The card
is the one-time card Link makes for exactly this purchase, after the person
allowed the flight's checkout card in the chat and approved it in Link.
Duffel has to switch card payments on for the account first (help@duffel.com);
until then, and with a `duffel_test_` key, everything runs in test mode.

The engine on the cloud computer drives it; these routes are the parts that
need the Duffel key, which never leaves the server:

- `POST /desktop/api/flights/offer`: the offer as it stands now (Duffel's
  prices hold for minutes): the total, the passengers' ids, whether passports
  are needed, the airline and its conditions of carriage, and the card's
  flight block.
- `POST /desktop/api/flights/client-key`: a component client key for the
  card form and the bank check (the pay page's only credential, short-lived).
- `GET /desktop/flights/pay`: the page the card form lives on
  (`flight_pay.html`), opened in the agent's own Chrome with the client key
  in the address's fragment.
- `POST /desktop/api/flights/order`: the instant order, paid by the card
  with its 3-D Secure session. One order per offer per person: a second ask
  for the same offer is refused, and an answer that never came back is
  reported as uncertain, never retried (Muse's rule, and ours).
"""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import structlog
from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse

from simeon.config import settings
from simeon.models import DesktopSession
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from . import flights
from .auth import get_desktop_or_box_session

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

PAY_PAGE = (Path(__file__).parent / "flight_pay.html").read_text(encoding="utf-8")

_OFFER_ID = re.compile(r"^off_[A-Za-z0-9_]{6,80}$")
_PASSENGER_ID = re.compile(r"^pas_[A-Za-z0-9_]{6,80}$")
_SESSION_ID = re.compile(r"^3ds_[A-Za-z0-9_]{6,80}$")
_AMOUNT = re.compile(r"^\d{1,7}(\.\d{1,3})?$")
_CURRENCY = re.compile(r"^[A-Z]{3}$")
_PHONE = re.compile(r"^\+[1-9]\d{6,14}$")
_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")
_NAME = re.compile(r"^[^\d!\"#$%&()*+,./:;<=>?@\[\\\]^_`{|}~]{1,40}$")
_DOCUMENT = re.compile(r"^[A-Za-z0-9]{5,20}$")
_COUNTRY = re.compile(r"^[A-Za-z]{2}$")
_TITLES = {"mr", "ms", "mrs", "miss", "dr"}
_GENDERS = {"m", "f"}
# Stripe's currencies without minor units, so Link is asked for ¥500, not ¥5.
_ZERO_DECIMAL = {
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
}  # fmt: skip


class BookingRefused(Exception):
    """A booking step this route will not take, with the sentence shown."""

    def __init__(self, message: str, status: int = 400) -> None:
        self.message = message
        self.status = status
        super().__init__(message)


def minor_units(amount: Any, currency: str) -> int | None:
    """Duffel's `"361.20"` as Link counts it: 36120 (¥500 stays 500)."""
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return None
    if value < 0:
        return None
    scale = 1 if currency.upper() in _ZERO_DECIMAL else 100
    return int((value * scale).to_integral_value())


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _requested_cabin(offer: dict[str, Any]) -> str:
    for slice_ in flights._slices(offer):
        for segment in flights._segments(slice_):
            for passenger in segment.get("passengers") or []:
                cabin = _text(_dict(passenger).get("cabin_class"))
                if cabin:
                    return cabin
    return "economy"


def offer_for_booking(offer: dict[str, Any], *, test: bool) -> dict[str, Any]:
    """What the engine needs to book this offer, as Duffel has it now."""
    owner = _dict(offer.get("owner"))
    currency = _text(offer.get("total_currency")).upper()
    amount = _text(offer.get("total_amount"))
    passengers = [
        {"id": _text(one.get("id")), "type": _text(one.get("type")) or "adult"}
        for one in offer.get("passengers") or []
        if isinstance(one, dict) and _text(one.get("id"))
    ]
    adults = sum(1 for one in passengers if one["type"] == "adult") or 1
    card = flights.offer_for_card(offer, adults=adults, cabin=_requested_cabin(offer))
    requirements = _dict(offer.get("payment_requirements"))
    slices = flights._slices(offer)
    first = slices[0] if slices else {}
    route = " to ".join(
        part
        for part in (
            flights._city(first.get("origin")) or flights._code(first.get("origin")),
            flights._city(first.get("destination"))
            or flights._code(first.get("destination")),
        )
        if part
    )
    return {
        "offerId": _text(offer.get("id")),
        "amount": amount,
        "currency": currency,
        "amountMinor": minor_units(amount, currency),
        "total": flights.money(amount, currency),
        "expiresAt": _text(offer.get("expires_at")),
        "priceGuaranteedUntil": _text(requirements.get("price_guarantee_expires_at")),
        "documentsRequired": offer.get("passenger_identity_documents_required") is True,
        "passengers": passengers,
        "airline": _text(owner.get("name")),
        "airlineCode": _text(owner.get("iata_code")),
        "conditionsUrl": _text(owner.get("conditions_of_carriage_url")),
        "route": route,
        "roundTrip": len(slices) > 1,
        "card": card,
        "test": test,
    }


def _born_on(value: Any) -> str:
    try:
        born = date.fromisoformat(_text(value))
    except ValueError as error:
        raise BookingRefused(
            "Each date of birth must be a date like 1990-04-21."
        ) from error
    if born >= date.today() or born.year < 1900:
        raise BookingRefused("A date of birth is not right; check it.")
    return born.isoformat()


def passenger_for_duffel(
    given: Any, *, expected_ids: set[str], documents_required: bool
) -> dict[str, Any]:
    """One traveller as Duffel's order takes them, checked field by field
    (the engine checked the form too; this side never trusts that)."""
    one = _dict(given)
    passenger_id = _text(one.get("id"))
    if not _PASSENGER_ID.match(passenger_id) or passenger_id not in expected_ids:
        raise BookingRefused("A traveller doesn't belong to this flight's offer.")
    given_name, family_name = (
        _text(one.get("given_name")),
        _text(one.get("family_name")),
    )
    if not _NAME.match(given_name) or not _NAME.match(family_name):
        raise BookingRefused(
            "First and last names must be written as on the ID, letters only."
        )
    title = _text(one.get("title")).lower()
    if title not in _TITLES:
        raise BookingRefused("Title must be Mr, Ms, Mrs, Miss or Dr.")
    gender = _text(one.get("gender")).lower()
    if gender not in _GENDERS:
        raise BookingRefused("Gender must be m or f, as on the ID.")
    email = _text(one.get("email"))
    if not _EMAIL.match(email):
        raise BookingRefused("The email address is not right.")
    phone = re.sub(r"[\s()-]", "", _text(one.get("phone_number")))
    if not _PHONE.match(phone):
        raise BookingRefused(
            "The phone number needs its country code, like +1 206 555 0100."
        )
    passenger: dict[str, Any] = {
        "id": passenger_id,
        "title": title,
        "gender": gender,
        "given_name": given_name,
        "family_name": family_name,
        "born_on": _born_on(one.get("born_on")),
        "email": email,
        "phone_number": phone,
    }
    passport = _dict(one.get("passport"))
    if passport:
        number = _text(passport.get("number")).replace(" ", "")
        country = _text(passport.get("issuing_country_code")).upper()
        try:
            expires = date.fromisoformat(_text(passport.get("expires_on")))
        except ValueError as error:
            raise BookingRefused("The passport's expiry must be a date.") from error
        if not _DOCUMENT.match(number) or not _COUNTRY.match(country):
            raise BookingRefused("The passport number or country is not right.")
        if expires <= date.today():
            raise BookingRefused("That passport has expired.")
        passenger["identity_documents"] = [
            {
                "type": "passport",
                "unique_identifier": number,
                "issuing_country_code": country,
                "expires_on": expires.isoformat(),
            }
        ]
    elif documents_required:
        raise BookingRefused("This airline needs each traveller's passport.")
    return passenger


def _duffel_sentence(error: flights.DuffelError) -> str:
    """Duffel's own words for a refusal (`errors[0].message`), short."""
    try:
        body = json.loads(error.body)
    except ValueError:
        body = None
    found = _dict(body).get("errors")
    first = _dict(found[0]) if isinstance(found, list) and found else {}
    message = _text(first.get("message")) or _text(first.get("title"))
    return message[:240] if message else "The airline did not accept it."


def _offer_id(body: dict[str, Any]) -> str:
    offer_id = _text(body.get("offer_id"))
    if not _OFFER_ID.match(offer_id):
        raise BookingRefused("offer_id must be the flight's offer id (off_…).")
    return offer_id


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        raise BookingRefused("Send the request as JSON.")
    return body


async def _over_limit(redis: Redis, key: str, limit: int, seconds: int) -> bool:
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, seconds)
    return count > limit


def _upstream(error: flights.DuffelError, what: str) -> JSONResponse:
    log.warning(
        "desktop.flights.upstream_refused",
        path=error.path,
        status=error.status,
        body=error.body[:1000] or "(empty)",
        step=what,
    )
    if error.status in (404, 410) or (400 <= error.status < 500 and what == "offer"):
        return flights._refuse(
            "That flight's price is no longer available; search again for a fresh one.",
            409,
        )
    return flights._refuse(
        f"The flight's {what} could not be reached; try again in a moment.", 502
    )


@router.post("/api/flights/offer", name="desktop:flights_offer")
async def flight_offer(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """`{offer_id}` in; the offer as it stands now out (`offer_for_booking`)."""
    if not settings.DUFFEL_ACCESS_TOKEN:
        return flights._refuse("Flight booking is not switched on yet.", 503)
    try:
        offer_id = _offer_id(await _json_body(request))
    except BookingRefused as refused:
        return flights._refuse(refused.message, refused.status)
    api = flights.client()
    try:
        offer = await api.offer(offer_id)
    except flights.DuffelError as error:
        return _upstream(error, "offer")
    shaped = offer_for_booking(offer, test=api.is_test)
    if not shaped["passengers"] or shaped["amountMinor"] is None:
        return flights._refuse("That flight can't be booked here.", 409)
    log.info(
        "desktop.flights.offer",
        user_id=str(desktop_session.user_id),
        offer_id=offer_id,
        total=shaped["total"],
        passengers=len(shaped["passengers"]),
        documents=shaped["documentsRequired"],
        test=api.is_test,
    )
    return flights._answer(shaped)


@router.post("/api/flights/client-key", name="desktop:flights_client_key")
async def flight_client_key(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """A component client key for the pay page: `{clientKey, test}`."""
    if not settings.DUFFEL_ACCESS_TOKEN:
        return flights._refuse("Flight booking is not switched on yet.", 503)
    user_id = str(desktop_session.user_id)
    if await _over_limit(
        redis,
        f"desktop:flights:client-key:{user_id}",
        settings.FLIGHT_BOOKINGS_PER_DAY * 4,
        86400,
    ):
        return flights._refuse(
            "Too many flight payments today; try again tomorrow.", 429
        )
    api = flights.client()
    try:
        key = await api.client_key()
    except flights.DuffelError as error:
        return _upstream(error, "payment form")
    if not key:
        return flights._refuse("The flight's payment form could not be set up.", 502)
    log.info("desktop.flights.client_key", user_id=user_id, test=api.is_test)
    return flights._answer({"clientKey": key, "test": api.is_test})


@router.get("/flights/pay", name="desktop:flights_pay")
async def flight_pay_page() -> HTMLResponse:
    """The page the card form lives on (`flight_pay.html`)."""
    return HTMLResponse(
        PAY_PAGE,
        headers={
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
        },
    )


@router.post("/api/flights/order", name="desktop:flights_order")
async def flight_order(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """`{offer_id, passengers, amount, currency, three_d_secure_session_id}`
    in; `{booked: true, orderId, bookingReference, …}`, or `{booked: false,
    uncertain: true, message}` when Duffel's answer never came back."""
    if not settings.DUFFEL_ACCESS_TOKEN:
        return flights._refuse("Flight booking is not switched on yet.", 503)
    user_id = str(desktop_session.user_id)
    api = flights.client()
    try:
        body = await _json_body(request)
        offer_id = _offer_id(body)
        session_id = _text(body.get("three_d_secure_session_id"))
        if not _SESSION_ID.match(session_id):
            raise BookingRefused("The card's bank check is missing.")
        amount = _text(body.get("amount"))
        currency = _text(body.get("currency")).upper()
        if not _AMOUNT.match(amount) or not _CURRENCY.match(currency):
            raise BookingRefused("amount and currency must be the offer's own.")
        given = body.get("passengers")
        if not isinstance(given, list) or not 1 <= len(given) <= 9:
            raise BookingRefused("Send each traveller's details.")
        # The offer again, so the order pays exactly what Duffel asks now and
        # names exactly its travellers.
        try:
            offer = await api.offer(offer_id)
        except flights.DuffelError as error:
            return _upstream(error, "offer")
        if (
            _text(offer.get("total_amount")) != amount
            or _text(offer.get("total_currency")).upper() != currency
        ):
            raise BookingRefused(
                "The price changed since it was approved; nothing was booked.", 409
            )
        expected = {
            _text(one.get("id"))
            for one in offer.get("passengers") or []
            if isinstance(one, dict)
        } - {""}
        passengers = [
            passenger_for_duffel(
                one,
                expected_ids=expected,
                documents_required=offer.get("passenger_identity_documents_required")
                is True,
            )
            for one in given
        ]
        if {one["id"] for one in passengers} != expected:
            raise BookingRefused("Every traveller on this offer needs their details.")
    except BookingRefused as refused:
        return flights._refuse(refused.message, refused.status)

    if await _over_limit(
        redis,
        f"desktop:flights:orders:{user_id}",
        settings.FLIGHT_BOOKINGS_PER_DAY,
        86400,
    ):
        return flights._refuse(
            "Too many flight bookings today; try again tomorrow.", 429
        )
    # One order per offer: a second ask (a retry, two devices) never books twice.
    lock = f"desktop:flights:order:{user_id}:{offer_id}"
    if not await redis.set(lock, "placing", nx=True, ex=86400):
        return flights._refuse(
            "This flight is already being booked. Check the airline's email before trying again.",
            409,
        )
    order_body = {
        "type": "instant",
        "selected_offers": [offer_id],
        "passengers": passengers,
        "payments": [
            {
                "type": "card",
                "amount": amount,
                "currency": currency,
                "three_d_secure_session_id": session_id,
            }
        ],
        "metadata": {"simeon_user": user_id},
    }
    try:
        order = await api.create_order(order_body)
    except flights.DuffelError as error:
        log.warning(
            "desktop.flights.order_refused",
            user_id=user_id,
            offer_id=offer_id,
            status=error.status,
            body=error.body[:1000] or "(empty)",
            test=api.is_test,
        )
        if error.status == 0 or error.status >= 500:
            # The airline may have it: never ask again for this offer.
            await redis.set(lock, "uncertain", ex=86400)
            return flights._answer(
                {
                    "booked": False,
                    "uncertain": True,
                    "message": "The airline didn't answer, so it isn't certain the flight was booked. Don't book it again: check for the airline's email first.",
                }
            )
        await redis.delete(lock)
        return flights._refuse(
            f"The flight was not booked: {_duffel_sentence(error)}", 409
        )
    await redis.set(lock, "booked", ex=86400)
    reference = _text(order.get("booking_reference"))
    log.info(
        "desktop.flights.order",
        user_id=user_id,
        offer_id=offer_id,
        order_id=_text(order.get("id")),
        booking_reference=reference,
        total=flights.money(order.get("total_amount"), order.get("total_currency")),
        passengers=len(passengers),
        test=api.is_test,
    )
    return flights._answer(
        {
            "booked": True,
            "orderId": _text(order.get("id")),
            "bookingReference": reference,
            "total": flights.money(
                order.get("total_amount"), order.get("total_currency")
            ),
            "airline": _text(_dict(order.get("owner")).get("name")),
            "test": api.is_test,
        }
    )
