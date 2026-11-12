"""What the box proxy forwards from a browser (4 October 2026, Simeon on
the web). The host refuses any request carrying an `Origin` and any
cross-site avatar load; through the proxy the box is reached with its
own network token and the API's CORS rule says which pages may send it,
so the browser's markings, and the person's cookie, stop at the proxy.
"""

from simeon.sand.box_proxy import forwardable


def test_the_browser_s_markings_and_the_cookie_stop_at_the_proxy() -> None:
    forwarded = forwardable(
        {
            "Authorization": "Bearer gw",
            "x-anyrun-network-token": "net",
            "Accept": "text/event-stream",
            "traceparent": "00-abc-def-01",
            "Origin": "https://app.simeonlabs.com",
            "Referer": "https://app.simeonlabs.com/app",
            "Cookie": "simeon_session=secret",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Connection": "keep-alive",
        }
    )
    assert forwarded == {
        "Authorization": "Bearer gw",
        "x-anyrun-network-token": "net",
        "Accept": "text/event-stream",
        "traceparent": "00-abc-def-01",
    }


def test_our_password_moves_aside_only_when_the_dial_carries_its_own() -> None:
    """On Azure the dial carries Microsoft's token in `Authorization`, which
    its sign-in on the port removes; the gateway's password then goes in
    `x-simeon-box-authorization`, which the gateway also reads (12 November
    2026, docs/ops/box-host/azure-plan.md, section 3)."""
    from simeon.sand.box_service import BOX_AUTH_HEADER, _with, with_dial

    sent = {"Authorization": "Bearer gw", "accept": "application/json"}
    # E2B and Docker: nothing moves.
    assert with_dial(sent, {"e2b-traffic-access-token": "t"}) == {
        "Authorization": "Bearer gw",
        "accept": "application/json",
        "e2b-traffic-access-token": "t",
    }
    assert with_dial(sent, {}) == sent
    # Azure: Microsoft's token in Authorization, ours beside it.
    assert with_dial(sent, {"authorization": "Bearer azure"}) == {
        BOX_AUTH_HEADER: "Bearer gw",
        "accept": "application/json",
        "authorization": "Bearer azure",
    }
    # Nothing sent of ours: nothing to move.
    assert with_dial({"accept": "*/*"}, {"authorization": "Bearer azure"}) == {
        "accept": "*/*",
        "authorization": "Bearer azure",
    }
    # The server's own checks (`_with`) follow the same rule.
    assert _with("gw", None) == {"authorization": "Bearer gw"}
    assert _with("gw", {"authorization": "Bearer azure"}) == {
        BOX_AUTH_HEADER: "Bearer gw",
        "authorization": "Bearer azure",
    }
    assert sent == {"Authorization": "Bearer gw", "accept": "application/json"}, (
        "the request's own headers are left as they were"
    )
