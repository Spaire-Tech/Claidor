"""Azure's sandbox data plane, for the scripts in box/azure (12 November 2026).

They run on the founder's Mac, signed in as the person running them
(`az login`), never with the server's own secret, which lives on Render only.
The calls are the ones the server makes (server/simeon/sand/box_azure.py);
docs/ops/box-host/azure-plan.md has the reference they follow.

Settings, all optional, read as the server reads them:

    SIMEON_AZURE_SUBSCRIPTION_ID   default: `az account show`
    SIMEON_AZURE_TENANT_ID         default: `az account show`
    SIMEON_AZURE_RESOURCE_GROUP    default: simeon-computers
    SIMEON_AZURE_SANDBOX_GROUP     default: simeon-computers
    SIMEON_AZURE_REGION            default: westus3

No token is ever printed: `az` hands them over in memory only.
"""

from __future__ import annotations

import os
import subprocess
from typing import Any

import httpx

API_VERSION = "2026-09-01-preview"
#: The data plane's sign-in audience; the second is the one older tools ask
#: for, tried once if the first is refused.
DATA_SCOPES = (
    "https://management.azuredevcompute.io/.default",
    "https://dynamicsessions.io/.default",
)
#: The audience of the token a locked port wants.
PORT_SCOPE = "https://auth.adcproxy.io/.default"


class AzError(RuntimeError):
    pass


def az(*args: str) -> str:
    """One `az` command's answer (`-o tsv`). Its error, never a token, is
    what an `AzError` says."""
    try:
        done = subprocess.run(
            ["az", *args, "-o", "tsv"], capture_output=True, text=True, timeout=120
        )
    except FileNotFoundError as error:
        raise AzError("the Azure command line is not installed: brew install azure-cli") from error
    if done.returncode != 0:
        said = done.stderr.strip().splitlines()
        raise AzError(f"az {' '.join(args[:2])}: {said[-1] if said else 'failed'}")
    return done.stdout.strip()


def token(scope: str) -> str:
    return az("account", "get-access-token", "--scope", scope, "--query", "accessToken")


class Group:
    """The sandbox group the server uses, called as the signed-in person."""

    def __init__(self) -> None:
        env = os.environ.get
        self.subscription = env("SIMEON_AZURE_SUBSCRIPTION_ID") or az(
            "account", "show", "--query", "id"
        )
        self.tenant = env("SIMEON_AZURE_TENANT_ID") or az("account", "show", "--query", "tenantId")
        self.resource_group = env("SIMEON_AZURE_RESOURCE_GROUP") or "simeon-computers"
        self.sandbox_group = env("SIMEON_AZURE_SANDBOX_GROUP") or "simeon-computers"
        self.region = (env("SIMEON_AZURE_REGION") or "westus3").strip().lower()
        self._scope = DATA_SCOPES[0]
        self._token: str | None = None

    @property
    def base(self) -> str:
        return (
            f"https://management.{self.region}.azuredevcompute.io"
            f"/subscriptions/{self.subscription}"
            f"/resourceGroups/{self.resource_group}"
            f"/sandboxGroups/{self.sandbox_group}"
        )

    def port_url(self, sandbox_id: str, port: int) -> str:
        return f"https://{sandbox_id}--{port}.{self.region}.adcproxy.io"

    def call(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        content: bytes | None = None,
        params: dict[str, str] | None = None,
        timeout: float = 60,
    ) -> httpx.Response:
        headers = {"accept": "application/json"}
        if content is not None:
            headers["content-type"] = "application/octet-stream"
        for attempt in range(2):
            if self._token is None:
                self._token = token(self._scope)
            response = httpx.request(
                method,
                self.base + path,
                params={"api-version": API_VERSION, **(params or {})},
                json=json,
                content=content,
                headers={**headers, "authorization": f"Bearer {self._token}"},
                timeout=timeout,
            )
            if response.status_code == 401 and attempt == 0:
                self._scope = DATA_SCOPES[1]
                self._token = None
                continue
            return response
        return response


def said(response: httpx.Response) -> str:
    """An error's words, in either shape Azure answers with."""
    try:
        body = response.json()
    except ValueError:
        return f"{response.status_code} {response.text[:300]}"
    if not isinstance(body, dict):
        return f"{response.status_code} {str(body)[:300]}"
    error = body.get("error")
    inner: dict[str, Any] = error if isinstance(error, dict) else {}
    code = inner.get("code") or body.get("title") or body.get("code") or ""
    message = inner.get("message") or body.get("detail") or body.get("message") or ""
    return f"{response.status_code} {code}: {message}"[:400]
