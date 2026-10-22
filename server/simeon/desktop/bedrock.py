"""Claude through Amazon Bedrock, so AWS credits pay for it.

Bedrock's runtime endpoint has an Anthropic route
(`bedrock-runtime.{region}.amazonaws.com/anthropic/v1/messages`) that takes
the same Messages request as api.anthropic.com and answers with the same
server-sent events, so the proxy relays it the same way. What differs:

- the address;
- the model, named by a cross-Region inference profile
  (`global.anthropic.claude-sonnet-5-5`): in the commercial Regions Claude
  5.5 is served only that way. Until 22 October 2026 calls went to
  `bedrock-mantle` as `anthropic.claude-…`, which Bedrock answered with
  404 "does not exist": its model cards list Claude 5.5 on bedrock-mantle in
  GovCloud only;
- the credential, an AWS access key whose requests are signed (SigV4,
  service `bedrock`), allowed `bedrock:InvokeModel` and
  `bedrock:InvokeModelWithResponseStream`;
- the thinking-binding beta, which Bedrock's list of Claude betas does not
  name: left out, with its `block_binding`. A call Bedrock refuses for a
  thinking block the beta would have dropped goes to the Anthropic key with
  the beta, as any refused call does.

Chosen by `SIMEON_DESKTOP_CLAUDE_VIA=bedrock` (`simeon.config`); the proxy
falls back to the Anthropic key when Bedrock does not answer
(`desktop.proxy.bedrock_fallback`).

https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html
https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
"""

import json
from typing import Any

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

from simeon.config import settings

BEDROCK_SERVICE = "bedrock"
BEDROCK_MODEL_PREFIX = "anthropic."
THINKING_BINDING_BETA = "thinking-binding-controls-2026-08-01"


def bedrock_configured() -> bool:
    """Whether Claude goes through Bedrock: chosen, and a key to sign with."""
    return (
        settings.DESKTOP_CLAUDE_VIA == "bedrock"
        and bool(settings.DESKTOP_BEDROCK_ACCESS_KEY_ID)
        and bool(settings.DESKTOP_BEDROCK_SECRET_ACCESS_KEY)
    )


def bedrock_messages_url() -> str:
    region = settings.DESKTOP_BEDROCK_REGION
    return f"https://bedrock-runtime.{region}.amazonaws.com/anthropic/v1/messages"


def bedrock_model_id(model_id: str) -> str:
    """`claude-sonnet-5-5` as Bedrock names it from this Region: its
    inference profile, `global.` (anywhere, no premium) unless
    `DESKTOP_BEDROCK_ROUTE` says `us`, `eu` or `au`."""
    return f"{settings.DESKTOP_BEDROCK_ROUTE}.{BEDROCK_MODEL_PREFIX}{model_id}"


def bedrock_body(payload: dict[str, Any]) -> bytes:
    """The request as Bedrock takes it: the model renamed, and thinking
    without the binding Bedrock does not know."""
    model = str(payload.get("model", ""))
    if BEDROCK_MODEL_PREFIX not in model:
        model = bedrock_model_id(model)
    body = {**payload, "model": model}
    thinking = body.get("thinking")
    if isinstance(thinking, dict) and "block_binding" in thinking:
        body["thinking"] = {k: v for k, v in thinking.items() if k != "block_binding"}
    return json.dumps(body).encode()


def bedrock_headers(url: str, body: bytes, forwarded: dict[str, str]) -> dict[str, str]:
    """`forwarded` (content type, accept, Anthropic version and betas, the
    thinking-binding one taken out) with the SigV4 signature over them and
    the body. No Anthropic key goes to AWS."""
    headers = dict(forwarded)
    betas = [
        beta.strip()
        for beta in headers.pop("anthropic-beta", "").split(",")
        if beta.strip() and beta.strip() != THINKING_BINDING_BETA
    ]
    if betas:
        headers["anthropic-beta"] = ",".join(betas)
    request = AWSRequest(method="POST", url=url, data=body, headers=headers)
    SigV4Auth(
        Credentials(
            settings.DESKTOP_BEDROCK_ACCESS_KEY_ID,
            settings.DESKTOP_BEDROCK_SECRET_ACCESS_KEY,
        ),
        BEDROCK_SERVICE,
        settings.DESKTOP_BEDROCK_REGION,
    ).add_auth(request)
    return dict(request.headers.items())
