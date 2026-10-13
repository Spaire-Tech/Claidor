"""Booking a flight (`simeon/desktop/flight_booking.py`), over HTTP with
Duffel mocked: the offer asked for again, the client key for the card form,
the pay page, and the order: paid by card with its bank check, refused when
the price moved or a traveller is missing, never placed twice for one offer,
and reported as uncertain (not retried) when Duffel's answer never came."""

import json
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import flight_booking, flights
from simeon.desktop.service import desktop
from simeon.models import User
from simeon.postgres import AsyncSession

API = settings.DUFFEL_BASE_URL.rstrip("/")
OFFER_ID = "off_0000AxyzTestOffer01"
PASSENGER_ID = "pas_0000AxyzTestPass01"
SESSION_ID = "3ds_0000AxyzTestSession1"
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


def _offer(amount: str = "361.20", *, documents: bool = False) -> dict[str, Any]:
    return {
        "id": OFFER_ID,
        "total_amount": amount,
        "total_currency": "USD",
        "expires_at": f"{DAY.isoformat()}T10:00:00Z",
        "passenger_identity_documents_required": documents,
        "payment_requirements": {
            "requires_instant_payment": True,
            "price_guarantee_expires_at": f"{DAY.isoformat()}T09:00:00Z",
        },
        "passengers": [{"id": PASSENGER_ID, "type": "adult"}],
        "owner": {
            "iata_code": "ZZ",
            "name": "Duffel Airways",
            "conditions_of_carriage_url": "https://duffel.com/conditions",
        },
        "slices": [
            {
                "origin": {"iata_code": "SEA", "city_name": "Seattle"},
                "destination": {"iata_code": "LAX", "city_name": "Los Angeles"},
                "duration": "PT2H45M",
                "segments": [
                    {
                        "origin": {"iata_code": "SEA", "city_name": "Seattle"},
                        "destination": {
                            "iata_code": "LAX",
                            "city_name": "Los Angeles",
                        },
                        "departing_at": f"{DAY.isoformat()}T06:49:00",
                        "arriving_at": f"{DAY.isoformat()}T09:34:00",
                        "marketing_carrier": {
                            "iata_code": "ZZ",
                            "name": "Duffel Airways",
                        },
                        "marketing_carrier_flight_number": "1068",
                        "duration": "PT2H45M",
                        "passengers": [{"cabin_class": "economy"}],
                    }
                ],
            }
        ],
        "conditions": {},
    }


def _traveller(**changes: Any) -> dict[str, Any]:
    traveller = {
        "id": PASSENGER_ID,
        "title": "ms",
        "gender": "f",
        "given_name": "Amelia",
        "family_name": "Earhart",
        "born_on": "1987-07-24",
        "email": "amelia@example.com",
        "phone_number": "+1 (206) 555-0100",
    }
    traveller.update(changes)
    return traveller


def _order_body(**changes: Any) -> dict[str, Any]:
    body = {
        "offer_id": OFFER_ID,
        "passengers": [_traveller()],
        "amount": "361.20",
        "currency": "USD",
        "three_d_secure_session_id": SESSION_ID,
    }
    body.update(changes)
    return body


@pytest.fixture(autouse=True)
def _keyed(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DUFFEL_ACCESS_TOKEN", "duffel_test_abc")


@pytest.mark.asyncio
class TestOffer:
    async def test_the_offer_as_it_stands_now(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            asked = mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer()})
            )
            response = await client.post(
                "/desktop/api/flights/offer",
                headers=headers,
                json={"offer_id": OFFER_ID},
            )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert (
            asked.calls.last.request.url.params["return_available_services"] == "false"
        )
        assert data["amount"] == "361.20"
        assert data["amountMinor"] == 36120
        assert data["total"] == "$361.20"
        assert data["passengers"] == [{"id": PASSENGER_ID, "type": "adult"}]
        assert data["documentsRequired"] is False
        assert data["airline"] == "Duffel Airways"
        assert data["conditionsUrl"] == "https://duffel.com/conditions"
        assert data["route"] == "Seattle to Los Angeles"
        assert data["card"]["offerId"] == OFFER_ID
        assert data["card"]["priceNote"] == "1 adult · Economy · One way"
        assert data["test"] is True

    async def test_a_gone_offer_is_a_sentence(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(
                    404, json={"errors": [{"message": "Not found"}]}
                )
            )
            response = await client.post(
                "/desktop/api/flights/offer",
                headers=headers,
                json={"offer_id": OFFER_ID},
            )
        assert response.status_code == 409
        assert "no longer available" in response.json()["error"]["message"]

    async def test_a_bad_id_or_no_key_asks_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.get(f"{API}/air/offers/{OFFER_ID}")
            bad = await client.post(
                "/desktop/api/flights/offer",
                headers=headers,
                json={"offer_id": "../orders"},
            )
            mocker.patch.object(settings, "DUFFEL_ACCESS_TOKEN", "")
            off = await client.post(
                "/desktop/api/flights/offer",
                headers=headers,
                json={"offer_id": OFFER_ID},
            )
        assert bad.status_code == 400
        assert off.status_code == 503
        assert not route.called


@pytest.mark.asyncio
class TestClientKeyAndPage:
    async def test_a_client_key_for_the_card_form(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            made = mock.post(f"{API}/identity/component_client_keys").mock(
                return_value=httpx.Response(
                    201, json={"data": {"component_client_key": "a.b.c"}}
                )
            )
            response = await client.post(
                "/desktop/api/flights/client-key", headers=headers
            )
        assert response.status_code == 200, response.text
        assert response.json()["data"] == {"clientKey": "a.b.c", "test": True}
        assert json.loads(made.calls.last.request.content) == {}
        assert made.calls.last.request.headers["Duffel-Version"] == "v2"

    async def test_the_pay_page_carries_the_card_form_and_nothing_secret(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/desktop/flights/pay")
        assert response.status_code == 200
        page = response.text
        assert "https://api.duffel.cards" in page
        assert "/vault/create_card_for_temporary_use" in page
        assert "create-card-for-temporary-use" in page
        assert "/three_d_secure_sessions" in page
        assert "window.simeonPay" in page
        assert "duffel_test_abc" not in page
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.asyncio
class TestOrder:
    async def test_an_order_paid_by_card_with_its_bank_check(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer()})
            )
            placed = mock.post(f"{API}/air/orders").mock(
                return_value=httpx.Response(
                    201,
                    json={
                        "data": {
                            "id": "ord_0000Test",
                            "booking_reference": "RZPNX8",
                            "total_amount": "361.20",
                            "total_currency": "USD",
                            "owner": {"name": "Duffel Airways"},
                        }
                    },
                )
            )
            response = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
            again = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
        assert response.status_code == 200, response.text
        assert response.json()["data"] == {
            "booked": True,
            "orderId": "ord_0000Test",
            "bookingReference": "RZPNX8",
            "total": "$361.20",
            "airline": "Duffel Airways",
            "test": True,
        }
        sent = json.loads(placed.calls.last.request.content)["data"]
        assert sent["type"] == "instant"
        assert sent["selected_offers"] == [OFFER_ID]
        assert sent["payments"] == [
            {
                "type": "card",
                "amount": "361.20",
                "currency": "USD",
                "three_d_secure_session_id": SESSION_ID,
            }
        ]
        assert sent["passengers"] == [
            {
                "id": PASSENGER_ID,
                "title": "ms",
                "gender": "f",
                "given_name": "Amelia",
                "family_name": "Earhart",
                "born_on": "1987-07-24",
                "email": "amelia@example.com",
                "phone_number": "+12065550100",
            }
        ]
        assert again.status_code == 409, "one order per offer"
        assert placed.call_count == 1

    async def test_a_moved_price_or_a_missing_traveller_books_nothing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer("380.00")})
            )
            placed = mock.post(f"{API}/air/orders")
            moved = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
            stranger = await client.post(
                "/desktop/api/flights/order",
                headers=headers,
                json=_order_body(
                    amount="380.00",
                    passengers=[_traveller(id="pas_0000SomeoneElse")],
                ),
            )
            no_phone_code = await client.post(
                "/desktop/api/flights/order",
                headers=headers,
                json=_order_body(
                    amount="380.00", passengers=[_traveller(phone_number="2065550100")]
                ),
            )
        assert moved.status_code == 409
        assert "price changed" in moved.json()["error"]["message"]
        assert stranger.status_code == 400
        assert no_phone_code.status_code == 400
        assert "country code" in no_phone_code.json()["error"]["message"]
        assert not placed.called

    async def test_a_passport_when_the_airline_needs_one(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer(documents=True)})
            )
            placed = mock.post(f"{API}/air/orders").mock(
                return_value=httpx.Response(
                    201, json={"data": {"id": "ord_1", "booking_reference": "ABC123"}}
                )
            )
            without = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
            passport = {
                "number": "533 401 372",
                "issuing_country_code": "us",
                "expires_on": (DAY + timedelta(days=900)).isoformat(),
            }
            with_it = await client.post(
                "/desktop/api/flights/order",
                headers=headers,
                json=_order_body(passengers=[_traveller(passport=passport)]),
            )
        assert without.status_code == 400
        assert "passport" in without.json()["error"]["message"]
        assert with_it.status_code == 200, with_it.text
        sent = json.loads(placed.calls.last.request.content)["data"]
        assert sent["passengers"][0]["identity_documents"] == [
            {
                "type": "passport",
                "unique_identifier": "533401372",
                "issuing_country_code": "US",
                "expires_on": passport["expires_on"],
            }
        ]

    async def test_a_refusal_is_duffels_sentence_and_frees_the_offer(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer()})
            )
            placed = mock.post(f"{API}/air/orders").mock(
                side_effect=[
                    httpx.Response(
                        422,
                        json={
                            "errors": [
                                {
                                    "title": "Payment declined",
                                    "message": "The card was declined by the issuer.",
                                }
                            ]
                        },
                    ),
                    httpx.Response(
                        201, json={"data": {"id": "ord_2", "booking_reference": "Q1"}}
                    ),
                ]
            )
            declined = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
            retried = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
        assert declined.status_code == 409
        assert (
            declined.json()["error"]["message"]
            == "The flight was not booked: The card was declined by the issuer."
        )
        assert retried.status_code == 200
        assert placed.call_count == 2

    async def test_no_answer_is_uncertain_and_never_asked_again(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{API}/air/offers/{OFFER_ID}").mock(
                return_value=httpx.Response(200, json={"data": _offer()})
            )
            placed = mock.post(f"{API}/air/orders").mock(
                side_effect=httpx.ReadTimeout("no answer")
            )
            first = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
            second = await client.post(
                "/desktop/api/flights/order", headers=headers, json=_order_body()
            )
        assert first.status_code == 200
        assert first.json()["data"]["booked"] is False
        assert first.json()["data"]["uncertain"] is True
        assert second.status_code == 409
        assert placed.call_count == 1


class TestShapes:
    def test_minor_units(self) -> None:
        assert flight_booking.minor_units("361.20", "USD") == 36120
        assert flight_booking.minor_units("500", "JPY") == 500
        assert flight_booking.minor_units("x", "USD") is None

    def test_search_cards_carry_the_offer_id(self) -> None:
        card = flights.offer_for_card(_offer(), adults=1, cabin="economy")
        assert card is not None
        assert card["offerId"] == OFFER_ID
        assert flights.summary_for({"offers": [card]})[0]["offerId"] == OFFER_ID
