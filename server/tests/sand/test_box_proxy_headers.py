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
