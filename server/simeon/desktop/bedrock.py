"""Claude through Amazon Bedrock, so AWS credits pay for it.

Claude in Amazon Bedrock (`bedrock-mantle.{region}.api.aws/anthropic`)
takes the same Messages request as api.anthropic.com and answers with the
same server-sent events, so the proxy relays it the same way. Three
things differ: the address, the model name (`anthropic.` in front), and
the credential, an AWS access key whose requests are signed (SigV4,
service `bedrock-mantle`). Chosen by `SIMEON_DESKTOP_CLAUDE_VIA=bedrock`
(`simeon.config`); the proxy falls back to the Anthropic key when Bedrock
does not answer (`desktop.proxy.bedrock_fallback`).

https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
"""

import json
from typing import Any

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

from simeon.config import settings

BEDROCK_SERVICE = "bedrock-mantle"
BEDROCK_MODEL_PREFIX = "anthropic."


def bedrock_configured() -> bool:
    """Whether Claude goes through Bedrock: chosen, and a key to sign with."""
    return (
        settings.DESKTOP_CLAUDE_VIA == "bedrock"
        and bool(settings.DESKTOP_BEDROCK_ACCESS_KEY_ID)
        and bool(settings.DESKTOP_BEDROCK_SECRET_ACCESS_KEY)
    )


def bedrock_messages_url() -> str:
    region = settings.DESKTOP_BEDROCK_REGION
    return f"https://{BEDROCK_SERVICE}.{region}.api.aws/anthropic/v1/messages"


def bedrock_model_id(model_id: str) -> str:
    return f"{BEDROCK_MODEL_PREFIX}{model_id}"


def bedrock_body(payload: dict[str, Any]) -> bytes:
    """The request as Bedrock takes it: the same body, the model renamed."""
    model = str(payload.get("model", ""))
    if not model.startswith(BEDROCK_MODEL_PREFIX):
        model = bedrock_model_id(model)
    return json.dumps({**payload, "model": model}).encode()


def bedrock_headers(url: str, body: bytes, forwarded: dict[str, str]) -> dict[str, str]:
    """`forwarded` (content type, accept, Anthropic version and betas)
    with the SigV4 signature over them and the body. No Anthropic key
    goes to AWS."""
    request = AWSRequest(method="POST", url=url, data=body, headers=forwarded)
    SigV4Auth(
        Credentials(
            settings.DESKTOP_BEDROCK_ACCESS_KEY_ID,
            settings.DESKTOP_BEDROCK_SECRET_ACCESS_KEY,
        ),
        BEDROCK_SERVICE,
        settings.DESKTOP_BEDROCK_REGION,
    ).add_auth(request)
    return dict(request.headers.items())
