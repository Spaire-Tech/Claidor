"""What a connector's tool call hands the agent (`simeon/desktop/app_results.py`).

Shapes are the founder's inbox log of 7 October 2026: Gmail thread fetches that
filled the 60,000 character cut with routing headers and base64 bodies."""

import base64
import json

from simeon.desktop.app_results import OUTPUT_LIMIT, readable_text, tidy_result


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


ROUTING = [
    {"name": name, "value": "x" * 400}
    for name in (
        "ARC-Seal",
        "ARC-Message-Signature",
        "DKIM-Signature",
        "Received",
        "X-Received",
        "X-Gm-Gg",
    )
]
PLAIN = "Hi Bass,\r\n\r\nPlease post a move in fee of $500.00 to WHV #403.\r\n\r\nThank you.\r\n\r\n> On Tue Aaron wrote:\r\n> Yes, please proceed.\r\n>> earlier\r\n"
HTML = (
    "<div>Hi Bass,<br>Please post a move in fee of $500.00 to WHV #403.</div>"
    + "<table><tr><td>signature</td></tr></table>" * 300
)


def _message(message_text: str) -> dict:
    return {
        "attachmentList": [
            {
                "attachmentId": "ANGjdJ" + "a" * 500,
                "filename": "statement.pdf",
                "mimeType": "application/pdf",
            }
        ],
        "messageId": "1a112c0d7a8f4865",
        "threadId": "1a0cf02ead9052b3",
        "messageText": message_text,
        "sender": "Prime Seattle <office@primeseattle.com>",
        "subject": "Fwd: Whitman Vista - Opportunity to Rent 403",
        "labelIds": ["IMPORTANT", "INBOX"],
        "payload": {
            "headers": ROUTING
            + [
                {"name": "From", "value": "Prime Seattle <office@primeseattle.com>"},
                {"name": "Cc", "value": "Lori Bennett <lorib@primeseattle.com>"},
                {"name": "Subject", "value": "Fwd: Whitman Vista"},
            ],
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "partId": "0",
                    "body": {"data": _b64(PLAIN), "size": 900},
                },
                {
                    "mimeType": "text/html",
                    "partId": "1",
                    "body": {"data": _b64(HTML), "size": 9000},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "statement.pdf",
                    "partId": "2",
                    "body": {"attachmentId": "ANGjdJ" + "a" * 500, "size": 29777},
                },
            ],
        },
    }


def test_a_full_message_keeps_what_the_agent_acts_on_and_drops_the_noise() -> None:
    raw = {"messages": [_message(PLAIN)]}
    before = len(json.dumps(raw, ensure_ascii=False))
    text = tidy_result(raw)
    tidy = json.loads(text)["messages"][0]
    assert len(text) < before / 5
    headers = {h["name"] for h in tidy["payload"]["headers"]}
    assert headers == {"From", "Cc", "Subject"}
    assert "move in fee of $500.00" in tidy["messageText"]
    assert "Yes, please proceed" not in tidy["messageText"]
    assert "[earlier quoted messages omitted]" in tidy["messageText"]
    # The text is in messageText and the attachment in attachmentList: the
    # MIME skeleton goes, the headers stay, the attachment id appears once.
    assert set(tidy["payload"]) == {"headers"}
    assert tidy["attachmentList"][0]["attachmentId"] == "ANGjdJ" + "a" * 500
    assert text.count("ANGjdJ") == 1
    assert tidy["messageId"] == "1a112c0d7a8f4865"
    assert tidy["threadId"] == "1a0cf02ead9052b3"


def test_without_message_text_the_body_is_decoded_not_dropped() -> None:
    tidy = json.loads(tidy_result(_message("")))
    plain = tidy["payload"]["parts"][0]["body"]
    assert "data" not in plain
    assert "move in fee of $500.00" in plain["text"]


def test_an_html_only_message_is_turned_into_text() -> None:
    message = {
        "payload": {"mimeType": "text/html", "body": {"data": _b64(HTML), "size": 1}}
    }
    text = json.loads(tidy_result(message))["payload"]["body"]["text"]
    assert "Please post a move in fee" in text
    assert "<div>" not in text
    assert "<table>" not in text


def test_a_body_that_does_not_decode_is_replaced_by_its_size() -> None:
    message = {
        "payload": {"mimeType": "image/png", "body": {"data": "\x00not base64!" * 50}}
    }
    body = json.loads(tidy_result(message))["payload"]["body"]
    assert body["data"].endswith("characters of encoded data omitted]")


def test_other_apps_pass_through_unchanged() -> None:
    data = {
        "results": [
            {
                "id": "page_1",
                "title": "Plan",
                "url": "https://x/" + "y" * 600,
                "text": "hello world",
            }
        ],
        "next_cursor": "c" * 600,
        "headers": {"content-type": "json"},
    }
    assert json.loads(tidy_result(data)) == data


def test_a_header_list_that_is_not_name_value_is_left_alone() -> None:
    data = {"headers": [{"name": "A", "value": "1"}, {"other": 2}]}
    assert json.loads(tidy_result(data)) == data


def test_a_long_result_is_capped_with_a_hint() -> None:
    data = {"items": [{"title": f"row {n}", "note": "z " * 50} for n in range(2_000)]}
    text = tidy_result(data)
    assert len(text) < OUTPUT_LIMIT + 300
    assert "Ask for fewer results" in text
    assert tidy_result("short text") == "short text"


def test_readable_text_collapses_blank_table_lines() -> None:
    assert readable_text("a\r\n|\r\n \r\n|  \r\n\r\nb") == "a\n\nb"


def test_a_result_that_cannot_be_tidied_still_comes_back() -> None:
    class Odd:
        def __str__(self) -> str:
            return "odd"

    assert "odd" in tidy_result({"value": Odd()})


SIGNATURE = (
    "\n\nRobin Bentley-Mackey\n\nAssociation Manager\n\nNotice: This message is"
    " intended for the sole use of the individual and entity to which it is"
    " addressed. It may contain information that is privileged.\n"
)
CHAIN = (
    "\n________________________________\nFrom: Lori Bennett <lorib@example.com>\n"
    "Sent: Saturday, September 19, 2026 9:26 PM\nTo: Robin; Bass\n"
    "Subject: RE: WHV- IRS UNPAID TAXES FORM 1120H\n\nHello Robin and Bass:\n\n"
    "I never got a reply as to the status of the check." + SIGNATURE * 6
)


def _listed(subject: str, text: str) -> dict:
    return {
        "attachmentList": [],
        "messageId": "1a0fd88f6e11bc98",
        "messageText": text,
        "subject": subject,
        "preview": {"body": text[:200], "subject": subject},
        "payload": {
            "headers": [{"name": "Subject", "value": subject}],
            "mimeType": "multipart/alternative",
            "parts": [{"filename": "", "headers": [], "mimeType": "text/plain"}],
        },
    }


def test_an_outlook_reply_chain_under_a_reply_is_folded() -> None:
    reply = "Good Morning Lori & Bass,\n\nThe letter confirms two checks were returned."
    tidy = json.loads(
        tidy_result(_listed("Re: WHV- IRS UNPAID TAXES", reply + SIGNATURE + CHAIN))
    )
    text = tidy["messageText"]
    assert "two checks were returned" in text
    assert "Robin Bentley-Mackey" in text
    assert "I never got a reply" not in text
    assert "[earlier messages in this thread omitted:" in text
    assert "preview" not in tidy


def test_a_forward_keeps_the_messages_it_carries() -> None:
    note = "Hello Bass:\n\nPlease get this done today."
    tidy = json.loads(
        tidy_result(_listed("FW: Westwater August Financials", note + CHAIN))
    )
    assert "I never got a reply as to the status of the check" in tidy["messageText"]
    assert "omitted" not in tidy["messageText"]


def test_a_short_reply_chain_stays() -> None:
    short = "Thanks.\n\nFrom: Lori\nSent: Monday\nTo: Bass\n\nCan you check?"
    tidy = json.loads(tidy_result(_listed("Re: Check", short)))
    assert "Can you check?" in tidy["messageText"]


APPLE_REPLY = (
    '<html class="apple-mail-supports-explicit-dark-mode"><head><meta charset="utf-8">'
    '</head><body dir="auto">Hello Bass,&nbsp;<div><br></div><div>I would really like to'
    " get this money back into my account.</div><div><br></div><div>Matt Rollins<br>"
    '<div dir="ltr">Sent from my iPhone</div><div dir="ltr"><br><blockquote type="cite">'
    "On Sep 3, 2026, at 9:38 AM, Invoices wrote:<br><br></blockquote></div>"
    '<blockquote type="cite"><div dir="ltr">Mathew would like the second withdrawal'
    " of $709.60 refunded.</div></blockquote></div></body></html>"
)


def test_a_reply_that_arrives_as_html_is_turned_into_text() -> None:
    tidy = json.loads(tidy_result(_listed("Re: Strathmore #3", APPLE_REPLY)))
    text = tidy["messageText"]
    assert "<" not in text
    assert "I would really like to get this money back" in text
    assert "Sent from my iPhone" in text
    assert "$709.60" not in text
    assert "[earlier quoted messages omitted]" in text


def test_an_html_forward_keeps_its_quoted_message() -> None:
    forward = APPLE_REPLY.replace("Sent from my iPhone", "Begin forwarded message:")
    tidy = json.loads(tidy_result(_listed("Strathmore #3", forward)))
    assert "$709.60" in tidy["messageText"]


def test_a_listing_without_text_keeps_its_preview_and_payload() -> None:
    message = _listed("Parc Mercer #302 - Fob Fee", "")
    tidy = json.loads(tidy_result(message))
    assert tidy["preview"] == message["preview"]
    assert tidy["payload"]["parts"] == message["payload"]["parts"]
