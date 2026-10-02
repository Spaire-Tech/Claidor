"""Flight search (`simeon/desktop/flights.py`), end to end over HTTP with
Duffel mocked: cities turned into airports, the request Duffel is sent, the
shortlist chosen the way Muse chooses it (shortest journey first, then a
meaningfully cheaper one, then a refundable fare, never a near copy), shaped
for the card, the per-hour cap, and a sentence when Duffel fails."""

import json
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import flights
from simeon.desktop.service import desktop
from simeon.models import User
from simeon.postgres import AsyncSession

SEARCH = "/desktop/api/flights/search"
API = settings.DUFFEL_BASE_URL.rstrip("/")
DAY = date.today() + timedelta(days=30)


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


def _place(code: str, city: str) -> dict[str, Any]:
    return {"type": "city", "iata_code": code, "name": city, "city_name": city}


def _segment(
    origin: tuple[str, str],
    destination: tuple[str, str],
    departs: str,
    arrives: str,
    carrier: tuple[str, str],
    number: str,
    length: str,
    carry_on: int = 1,
) -> dict[str, Any]:
    return {
        "origin": {
            "iata_code": origin[0],
            "city_name": origin[1],
            "name": f"{origin[1]} Airport",
        },
        "destination": {
            "iata_code": destination[0],
            "city_name": destination[1],
            "name": f"{destination[1]} Airport",
        },
        "departing_at": f"{DAY.isoformat()}T{departs}:00",
        "arriving_at": f"{DAY.isoformat()}T{arrives}:00",
        "marketing_carrier": {
            "iata_code": carrier[0],
            "name": carrier[1],
            "logo_symbol_url": f"https://assets.duffel.com/{carrier[0]}.svg",
        },
        "marketing_carrier_flight_number": number,
        "duration": length,
        "passengers": [
            {
                "cabin_class_marketing_name": "ECONOMY",
                "baggages": [
                    {"type": "carry_on", "quantity": carry_on},
                    {"type": "checked", "quantity": 0},
                ],
            }
        ],
    }


SEA, PHX, LAX = ("SEA", "Seattle"), ("PHX", "Phoenix"), ("LAX", "Los Angeles")
AA, UA, AS = (
    ("AA", "American Airlines"),
    ("UA", "United Airlines"),
    ("AS", "Alaska Airlines"),
)


def _offer(
    amount: str,
    owner: tuple[str, str],
    segments: list[dict[str, Any]],
    length: str,
    *,
    refund: dict[str, Any] | None,
    change: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "total_amount": amount,
        "total_currency": "USD",
        "owner": {
            "iata_code": owner[0],
            "name": owner[1],
            "logo_symbol_url": f"https://assets.duffel.com/{owner[0]}.svg",
        },
        "slices": [
            {
                "origin": {"iata_code": "SEA", "city_name": "Seattle"},
                "destination": {"iata_code": "LAX", "city_name": "Los Angeles"},
                "duration": length,
                "segments": segments,
            }
        ],
        "conditions": {
            "refund_before_departure": refund,
            "change_before_departure": change,
        },
    }


FREE = {"allowed": True, "penalty_amount": "0.00", "penalty_currency": "USD"}
AMERICAN = [
    _segment(SEA, PHX, "06:00", "09:10", AA, "3792", "PT3H10M"),
    _segment(PHX, LAX, "10:48", "12:18", AA, "2027", "PT1H30M"),
]
OFFERS = [
    _offer(
        "446.40",
        AS,
        [_segment(SEA, LAX, "06:49", "09:34", AS, "1068", "PT2H45M")],
        "PT2H45M",
        refund=FREE,
    ),
    _offer("380.00", AA, AMERICAN, "PT6H18M", refund=FREE, change=FREE),
    _offer(
        "361.20",
        AA,
        AMERICAN,
        "PT6H18M",
        refund=FREE,
        change={"allowed": True, "penalty_amount": "75.00", "penalty_currency": "USD"},
    ),
    _offer(
        "299.00",
        UA,
        [_segment(SEA, LAX, "07:11", "09:50", UA, "1440", "PT2H39M")],
        "PT2H39M",
        refund={"allowed": False},
    ),
]


def _mock_duffel(
    mock: respx.MockRouter, offers: list[dict[str, Any]] = OFFERS
) -> respx.Route:
    def suggestions(request: httpx.Request) -> httpx.Response:
        query = request.url.params["query"].lower()
        found = (
            [_place("SEA", "Seattle")]
            if "seattle" in query or query == "sea"
            else [_place("LAX", "Los Angeles")]
        )
        return httpx.Response(200, json={"data": found})

    mock.get(f"{API}/places/suggestions").mock(side_effect=suggestions)
    return mock.post(f"{API}/air/offer_requests").mock(
        return_value=httpx.Response(201, json={"data": {"offers": offers}})
    )


@pytest.fixture(autouse=True)
def _keyed(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DUFFEL_ACCESS_TOKEN", "duffel_test_abc")


@pytest.mark.asyncio
class TestFlightSearch:
    async def test_the_fastest_then_a_cheaper_refundable_flight_come_back_as_the_card(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            searched = _mock_duffel(mock)
            response = await client.post(
                SEARCH,
                headers=headers,
                json={
                    "origin": "Seattle",
                    "destination": "Los Angeles",
                    "date": DAY.isoformat(),
                    "arrive_before": "14:00",
                    "refundable_only": True,
                },
            )
        assert response.status_code == 200, response.text
        data = response.json()["data"]

        sent = json.loads(searched.calls.last.request.content)["data"]
        assert sent["slices"] == [
            {
                "origin": "SEA",
                "destination": "LAX",
                "departure_date": DAY.isoformat(),
                "arrival_time": {"from": "00:00", "to": "14:00"},
            }
        ]
        assert sent["passengers"] == [{"type": "adult"}]
        assert sent["max_connections"] == 1
        assert searched.calls.last.request.headers["Duffel-Version"] == "v2"

        card = data["card"]
        assert data["test"] is True
        assert data["found"] == 4
        assert card["title"] == "Seattle to Los Angeles"
        assert (
            card["subtitle"]
            == f"Test results · {flights.day(DAY)} · Refundable · 1 adult"
        )
        assert [(offer["airline"], offer["label"]) for offer in card["offers"]] == [
            ("Alaska Airlines", "Fastest"),
            ("American Airlines", "Cheapest"),
        ], "United is not refundable; American's dearer fare is the same flights"
        american = card["offers"][1]
        assert american["price"] == "$361.20"
        assert (
            american["depart"],
            american["arrive"],
            american["duration"],
            american["stops"],
        ) == ("6:00 AM", "12:18 PM", "6h 18m", "1 stop · PHX 1h 38m")
        assert (american["refundable"], american["changeable"], american["bags"]) == (
            "Full refund",
            "$75.00 fee",
            "1 carry-on",
        )
        assert american["priceNote"] == "1 adult · Economy · One way", (
            "Duffel's ECONOMY reads as Economy"
        )
        assert american["legs"][0]["departDay"] == flights.day(DAY)
        assert american["returnTimes"] == ""
        assert [leg["flight"] for leg in american["legs"]] == ["AA 3792", "AA 2027"]
        assert american["legs"][0]["layover"] == "1h 38m in Phoenix"
        assert "layover" not in american["legs"][1]
        assert card["offers"][0]["stops"] == "Nonstop"
        assert data["summary"][1]["price"] == "$361.20"
        assert data["summary"][1]["label"] == "Cheapest"

    async def test_nothing_matching_is_no_card(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            _mock_duffel(mock, offers=[])
            response = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "LAX", "date": DAY.isoformat()},
            )
        data = response.json()["data"]
        assert data["card"] is None
        assert data["summary"] == []
        assert data["found"] == 0

    async def test_a_live_key_is_not_marked_as_test(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DUFFEL_ACCESS_TOKEN", "duffel_live_abc")
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            _mock_duffel(mock)
            response = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "LAX", "date": DAY.isoformat()},
            )
        data = response.json()["data"]
        assert data["test"] is False
        assert not data["card"]["subtitle"].startswith("Test results")

    async def test_without_a_key_or_signed_out_nothing_is_asked(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        assert (await client.post(SEARCH, json={})).status_code == 401
        mocker.patch.object(settings, "DUFFEL_ACCESS_TOKEN", "")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = _mock_duffel(mock)
            response = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "LAX", "date": DAY.isoformat()},
            )
        assert response.status_code == 503
        assert (
            response.json()["error"]["message"]
            == "Flight search is not switched on yet."
        )
        assert not route.called

    async def test_a_bad_request_is_a_sentence_and_duffel_is_not_asked(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = _mock_duffel(mock)
            past = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "LAX", "date": "2020-01-01"},
            )
            garbled = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "LAX", "date": "next friday"},
            )
        assert past.status_code == 400
        assert past.json()["error"]["message"] == "That date has passed."
        assert garbled.status_code == 400
        assert "date like" in garbled.json()["error"]["message"]
        assert not route.called

    async def test_duffel_failing_is_a_sentence(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/places/suggestions").mock(
                return_value=httpx.Response(
                    200, json={"data": [_place("SEA", "Seattle")]}
                )
            )
            mock.post(f"{API}/air/offer_requests").mock(
                return_value=httpx.Response(500, json={"errors": [{"message": "boom"}]})
            )
            response = await client.post(
                SEARCH,
                headers=headers,
                json={"origin": "SEA", "destination": "SEA", "date": DAY.isoformat()},
            )
        assert response.status_code == 502
        assert (
            response.json()["error"]["message"]
            == "The flight search did not answer; try again in a moment."
        )

    async def test_searches_are_capped_per_hour(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "FLIGHT_SEARCHES_PER_HOUR", 1)
        headers = await _signed_in(client, session, user)
        body = {"origin": "SEA", "destination": "LAX", "date": DAY.isoformat()}
        with respx.mock() as mock:
            _mock_duffel(mock)
            first = await client.post(SEARCH, headers=headers, json=body)
            second = await client.post(SEARCH, headers=headers, json=body)
        assert first.status_code == 200
        assert second.status_code == 429


class TestShaping:
    def test_fare_terms_read_as_a_person_would_say_them(self) -> None:
        assert (
            flights.refund_terms({"allowed": True, "penalty_amount": "0.00"})
            == "Full refund"
        )
        assert (
            flights.refund_terms(
                {"allowed": True, "penalty_amount": "75", "penalty_currency": "USD"}
            )
            == "Refund minus $75.00"
        )
        assert flights.refund_terms({"allowed": False}) == "No refund"
        assert flights.refund_terms(None) == "Not stated"
        assert flights.change_terms({"allowed": None}) == "Not stated"
        assert flights.change_terms({"allowed": True, "penalty_amount": None}) == "Free"
        assert (
            flights.change_terms(
                {"allowed": True, "penalty_amount": "50", "penalty_currency": "USD"}
            )
            == "$50.00 fee"
        )
        assert flights.change_terms({"allowed": False}) == "Not allowed"

    def test_durations_money_and_clocks(self) -> None:
        assert flights.duration("PT6H18M") == "6h 18m"
        assert flights.duration("PT45M") == "45m"
        assert flights.duration("P1DT2H") == "26h"
        assert flights.money("361.2", "USD") == "$361.20"
        assert flights.money("1250", "NOK") == "1,250.00 NOK"
        assert flights.clock(flights._local("2026-10-02T00:05:00")) == "12:05 AM"
        assert flights.clock(flights._local("2026-10-02T12:18:00+02:00")) == "12:18 PM"

    def test_an_overnight_flight_says_plus_one_and_a_return_is_headed(self) -> None:
        overnight = _segment(LAX, SEA, "23:30", "07:05", AA, "100", "PT7H35M")
        overnight["arriving_at"] = f"{(DAY + timedelta(days=1)).isoformat()}T07:05:00"
        offer = _offer("200", AA, AMERICAN, "PT6H18M", refund=None)
        offer["slices"].append(
            {
                "origin": {"iata_code": "LAX"},
                "destination": {"iata_code": "SEA"},
                "duration": "PT7H35M",
                "segments": [overnight],
            }
        )
        card = flights.offer_for_card(offer, adults=2, cabin="economy")
        assert card is not None
        assert card["priceNote"] == "2 adults · Economy · Round trip"
        assert card["refundable"] == "Not stated", "the airline did not say"
        assert card["returnTimes"] == "Return 11:30 PM – 7:05 AM +1 · Nonstop"
        assert card["changeable"] == "Not stated"
        assert card["legs"][2]["heading"] == f"Return · {flights.day(DAY)}"
        assert card["legs"][2]["arrive"] == "7:05 AM +1"


def _nonstop(
    amount: str,
    departs: str,
    arrives: str,
    number: str,
    length: str,
    *,
    refund: dict[str, Any] | None = None,
    carrier: tuple[str, str] = AS,
) -> dict[str, Any]:
    return _offer(
        amount,
        carrier,
        [_segment(SEA, LAX, departs, arrives, carrier, number, length)],
        length,
        refund=refund,
    )


class TestShortlist:
    def test_shortest_first_then_a_cheaper_one_then_a_refundable_fare(self) -> None:
        fast = _nonstop("300", "07:00", "09:40", "1", "PT2H40M")
        dearer_same = _nonstop("320", "07:00", "09:40", "1", "PT2H40M")
        near_copy = _nonstop("310", "08:00", "10:45", "2", "PT2H45M")
        evening = _nonstop("305", "18:00", "20:45", "3", "PT2H45M")
        flexible = _nonstop("420", "12:00", "14:45", "4", "PT2H45M", refund=FREE)
        cheap = _offer("199", AA, AMERICAN, "PT6H18M", refund={"allowed": False})
        picked = flights.pick_offers(
            [cheap, near_copy, dearer_same, flexible, evening, fast],
            refundable_only=False,
        )
        assert [(offer, why) for offer, why in picked] == [
            (fast, "Fastest"),
            (evening, ""),
            (flexible, "Refundable"),
            (cheap, "Cheapest"),
        ], (
            "shortest first after the lead; the 8 AM is no faster or cheaper than the 7 AM; one itinerary at two fares counts once"
        )

    def test_a_nonstop_leads_over_a_connection_that_saves_minutes(self) -> None:
        nonstop = _nonstop("300", "07:00", "10:00", "1", "PT3H")
        connection = _offer(
            "300",
            AA,
            [
                _segment(SEA, PHX, "07:00", "08:30", AA, "10", "PT1H30M"),
                _segment(PHX, LAX, "09:00", "09:50", AA, "11", "PT50M"),
            ],
            "PT2H50M",
            refund=None,
        )
        picked = flights.pick_offers([connection, nonstop], refundable_only=False)
        assert picked[0] == (nonstop, "Fastest")

    def test_a_price_first_ask_keeps_a_much_faster_option(self) -> None:
        fast = _nonstop("300", "07:00", "09:40", "1", "PT2H40M")
        cheap = _offer("199", AA, AMERICAN, "PT6H18M", refund=None)
        picked = flights.pick_offers(
            [fast, cheap], refundable_only=False, priority="cheapest"
        )
        assert picked == [(cheap, "Cheapest"), (fast, "Fastest")]

    def test_named_airlines_and_airport_changes(self) -> None:
        alaska = _nonstop("300", "07:00", "09:40", "1", "PT2H40M")
        united = _nonstop("250", "09:00", "11:40", "2", "PT2H40M", carrier=UA)
        assert flights.pick_offers(
            [alaska, united], refundable_only=False, airlines=frozenset({"UA"})
        ) == [(united, "Fastest")]
        swap = _offer(
            "100",
            AA,
            [
                _segment(SEA, PHX, "06:00", "09:10", AA, "1", "PT3H10M"),
                _segment(("AZA", "Phoenix"), LAX, "11:00", "12:30", AA, "2", "PT1H30M"),
            ],
            "PT6H30M",
            refund=None,
        )
        assert [
            offer
            for offer, _why in flights.pick_offers(
                [swap, alaska], refundable_only=False
            )
        ] == [alaska], "changing airports mid-journey only when nothing else is left"
        card = flights.offer_for_card(swap, adults=1, cabin="economy")
        assert card is not None
        assert card["stops"] == "1 stop · PHX layover length not stated"

    def test_operating_carrier_fare_brand_and_bags(self) -> None:
        segment = _segment(
            SEA, LAX, "07:00", "09:40", AS, "1068", "PT2H40M", carry_on=0
        )
        segment["operating_carrier"] = {"iata_code": "QX", "name": "Horizon Air"}
        offer = _offer("300", AS, [segment], "PT2H40M", refund=None)
        offer["slices"][0]["fare_brand_name"] = "Saver"
        card = flights.offer_for_card(offer, adults=1, cabin="economy")
        assert card is not None
        assert card["legs"][0]["flight"] == "AS 1068 · operated by Horizon Air"
        assert card["legs"][0]["cabin"] == "Economy · Saver"
        assert card["bags"] == "No bags included"
        segment["passengers"][0].pop("baggages")
        unlisted = flights.offer_for_card(offer, adults=1, cabin="economy")
        assert unlisted is not None
        assert unlisted["bags"] == "Not stated"
