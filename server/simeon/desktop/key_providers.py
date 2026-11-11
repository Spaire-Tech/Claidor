"""The AI providers a person can bring their own API key for (10 November
2026, the founder: "these are all the keys i want our users to be able to
use. Below subscription something called api keys").

Each provider is one entry (`PROVIDERS`), in the founder's order: where its
API is, how it reads a key, which of the three wires the relay speaks to it
(`wire`), where the person gets a key, the models worth offering, and what
its Chat Completions takes where providers differ (`dialect`). The facts are
each provider's own documentation, read on 10 November 2026; none of it was
checked with a real key.

**The three wires.** The engine writes every call on OpenAI's Responses
wire. OpenAI, SpaceXAI (xAI's API) and Azure OpenAI take it as it is
(`responses`). Claude, and MiniMax, which recommends its Claude-shaped wire,
get Claude's own Messages (`messages`, `messages_wire.py`), with Claude's
prompt cache. Every other provider gets OpenAI's Chat Completions (`chat`,
`chat_wire.py`).

**The key is checked before it is kept** (`check_key`): the provider's
model list is asked for with it (no cost), or, where a provider has none, a
one-word call is made (a few tokens on the person's key). A key the
provider refuses is never kept. The models offered are the provider's own
list, read then (`offered`): the ones named here first, by their names;
for the providers that host many (Together, Fireworks, Hugging Face…),
others from the list too, best known families first.

**Not here.** GitHub Copilot has no API a key opens (its own CLI signs in),
and Meta's terms forbid a key passing through another's server (Meta Model
API Terms §3.1, §10.1): both are listed, `available=False`, "Soon" in the
apps. A coding plan's key (Z.AI's GLM Coding Plan, Qwen's Coding Plan) is
for their own coding tools only; the key here is the pay-as-you-go one.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

from .chat_wire import ChatDialect
from .proxy_common import ANTHROPIC_VERSION

Wire = Literal["responses", "chat", "messages"]
Auth = Literal["bearer", "api-key", "x-api-key"]
ModelsKind = Literal["openai", "anthropic", "cloudflare"]

#: A model whose context the provider doesn't say: what most take.
DEFAULT_CONTEXT = 128_000
#: How many models a provider that hosts many offers at most.
MOST_OFFERED = 24
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


@dataclass(frozen=True)
class KnownModel:
    """A model named here: its id at the provider, its name, its context."""

    slug: str
    name: str
    context_window: int = DEFAULT_CONTEXT


def _resource(value: str) -> str | None:
    """An Azure OpenAI endpoint (`https://name.openai.azure.com/…`, the host,
    or the resource's name alone) as its host, only on Azure's own
    domains: the server sends the person's key there."""
    text = value.strip().lower()
    text = re.sub(r"^https?://", "", text).split("/", 1)[0]
    if re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", text):
        return f"{text}.openai.azure.com"
    found = re.fullmatch(
        r"([a-z0-9][a-z0-9-]{1,62})\.(openai\.azure\.com|services\.ai\.azure\.com"
        r"|cognitiveservices\.azure\.com)",
        text,
    )
    return text if found else None


def _deployments(value: str) -> str | None:
    names = [one.strip() for one in value.split(",") if one.strip()]
    if not names or len(names) > 10:
        return None
    if not all(re.fullmatch(r"[A-Za-z0-9._-]{1,64}", one) for one in names):
        return None
    return ",".join(dict.fromkeys(names))


def _matching(pattern: str) -> Callable[[str], str | None]:
    def check(value: str) -> str | None:
        text = value.strip().lower()
        return text if re.fullmatch(pattern, text) else None

    return check


@dataclass(frozen=True)
class KeyField:
    """One more thing a provider needs besides the key, typed by the person
    (the apps name it in their own words, by `key`)."""

    key: str
    placeholder: str
    #: The value as kept, or None when it isn't one (never sent anywhere).
    normalize: Callable[[str], str | None]
    default: str | None = None


@dataclass(frozen=True)
class KeyProvider:
    slug: str
    name: str
    wire: Wire
    #: Where its API is; `{key}` of a field is that field's value.
    base_url: str
    #: Where the person makes a key.
    key_page: str
    auth: Auth = "bearer"
    fields: tuple[KeyField, ...] = ()
    dialect: ChatDialect = ChatDialect()
    #: Where its models are listed (`{base}` the API's address); None when
    #: the person names them (Azure's deployments).
    models_url: str | None = "{base}/models"
    models_kind: ModelsKind = "openai"
    known: tuple[KnownModel, ...] = ()
    #: Offer only the models named here (when the list has any of them).
    only_known: bool = False
    efforts: tuple[str, ...] = ()
    default_effort: str | None = None
    #: Claude's thinking settings on the Messages wire (MiniMax thinks its
    #: own way).
    thinking: bool = True
    available: bool = True
    #: A line under its name, for a person who has the provider's plan
    #: rather than a key (the apps say it in their own words).
    hint: str | None = None
    headers: tuple[tuple[str, str], ...] = ()

    def field_values(self, given: Mapping[str, str]) -> dict[str, str] | None:
        """The person's fields as kept, or None when one isn't valid."""
        out: dict[str, str] = {}
        for one in self.fields:
            raw = str(given.get(one.key) or "").strip() or (one.default or "")
            value = one.normalize(raw) if raw else None
            if value is None:
                return None
            out[one.key] = value
        return out

    def base(self, fields: Mapping[str, str]) -> str:
        return self.base_url.format(**fields).rstrip("/")

    def call_url(self, fields: Mapping[str, str]) -> str:
        path = {
            "responses": "/responses",
            "chat": "/chat/completions",
            "messages": "/v1/messages",
        }[self.wire]
        return f"{self.base(fields)}{path}"

    def list_url(self, fields: Mapping[str, str]) -> str | None:
        if self.models_url is None:
            return None
        return self.models_url.format(base=self.base(fields), **fields)

    def auth_headers(self, key: str) -> dict[str, str]:
        if self.auth == "api-key":
            out = {"api-key": key}
        elif self.auth == "x-api-key":
            out = {"x-api-key": key}
        else:
            out = {"authorization": f"Bearer {key}"}
        return {**out, **dict(self.headers)}

    def json(self) -> dict[str, Any]:
        """The provider as the apps' API keys section shows it."""
        return {
            "provider": self.slug,
            "name": self.name,
            "keyPage": self.key_page,
            "available": self.available,
            "fields": [
                {"key": one.key, "placeholder": one.placeholder, "default": one.default}
                for one in self.fields
            ],
            "hint": self.hint,
        }


_ANTHROPIC = (("anthropic-version", ANTHROPIC_VERSION),)
_CLAUDE_EFFORTS = ("low", "medium", "high", "xhigh", "max")
_OPENAI_EFFORTS = ("low", "medium", "high")

#: In the founder's order (10 November 2026): the four best known first,
#: then by name.
PROVIDERS: tuple[KeyProvider, ...] = (
    KeyProvider(
        "anthropic",
        "Anthropic",
        "messages",
        "https://api.anthropic.com",
        "https://platform.claude.com/settings/keys",
        auth="x-api-key",
        headers=_ANTHROPIC,
        models_url="{base}/v1/models?limit=100",
        models_kind="anthropic",
        known=(
            KnownModel("claude-opus-5-5", "Claude Opus 5.5", 1_000_000),
            KnownModel("claude-sonnet-5-5", "Claude Sonnet 5.5", 1_000_000),
            KnownModel("claude-haiku-5-5", "Claude Haiku 5.5", 1_000_000),
            KnownModel("claude-fable-5-2", "Claude Fable 5.2", 1_000_000),
            KnownModel("claude-fable-5-1", "Claude Fable 5.1", 1_000_000),
        ),
        only_known=True,
        efforts=_CLAUDE_EFFORTS,
        # Anthropic's own default for Opus 5.5: the person's key pays.
        default_effort="medium",
        hint="Claude Pro or Max? Connect Claude under Subscriptions.",
    ),
    KeyProvider(
        "openai",
        "OpenAI",
        "responses",
        "https://api.openai.com/v1",
        "https://platform.openai.com/api-keys",
        known=(
            KnownModel("gpt-6-astra", "GPT-6 Astra", 1_050_000),
            KnownModel("gpt-6.1-sol", "GPT-6.1 Sol", 1_050_000),
            KnownModel("gpt-6.1-terra", "GPT-6.1 Terra", 1_050_000),
            KnownModel("gpt-6-luna", "GPT-6 Luna", 1_050_000),
        ),
        only_known=True,
        efforts=_OPENAI_EFFORTS,
        default_effort="medium",
        hint="ChatGPT Plus or Pro? Connect ChatGPT under Subscriptions.",
    ),
    KeyProvider(
        "xai",
        "SpaceXAI",
        "responses",
        "https://api.x.ai/v1",
        "https://console.x.ai/team/default/api-keys",
        known=(
            KnownModel("grok-4.7", "Grok 4.7", 500_000),
            KnownModel("grok-4.3", "Grok 4.3", 1_000_000),
            KnownModel("grok-4.20-0309-reasoning", "Grok 4.20", 1_000_000),
            KnownModel("grok-build-0.1", "Grok Build", 256_000),
        ),
        only_known=True,
        efforts=_OPENAI_EFFORTS,
        default_effort="high",
        hint="SuperGrok or X Premium+? Connect Grok under Subscriptions.",
    ),
    KeyProvider(
        "google",
        "Google",
        "chat",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "https://aistudio.google.com/apikey",
        # Gemini wants its signature back on each tool call.
        dialect=ChatDialect(effort=True, call_extras=True),
        known=(
            KnownModel("gemini-4-argon", "Gemini 4 Argon", 1_048_576),
            KnownModel("gemini-3.8-flash", "Gemini 3.8 Flash", 1_048_576),
        ),
        only_known=True,
        efforts=_OPENAI_EFFORTS,
        default_effort="medium",
    ),
    KeyProvider(
        "bedrock",
        "Amazon Bedrock",
        "chat",
        "https://bedrock-mantle.{region}.api.aws/v1",
        "https://console.aws.amazon.com/bedrock/home#/api-keys",
        fields=(
            KeyField(
                "region",
                "us-east-1",
                _matching(r"[a-z]{2}(-gov)?-[a-z]+-\d{1,2}"),
                default="us-east-1",
            ),
        ),
    ),
    KeyProvider(
        "antling",
        "Ant Ling",
        "chat",
        "https://api.ant-ling.com/v1",
        "https://chat.ant-ling.com/open",
        known=(
            KnownModel("Ling-3.1-flash", "Ling 3.1 Flash", 1_000_000),
            KnownModel("Ling-3.2-flash", "Ling 3.2 Flash", 1_000_000),
            KnownModel("Ling-3.0-flash", "Ling 3.0 Flash", 256_000),
        ),
        only_known=True,
    ),
    KeyProvider(
        "azure",
        "Azure OpenAI",
        "responses",
        "https://{endpoint}/openai/v1",
        "https://ai.azure.com",
        auth="api-key",
        fields=(
            KeyField("endpoint", "my-resource.openai.azure.com", _resource),
            KeyField("deployments", "gpt-6-astra", _deployments),
        ),
        models_url=None,
        efforts=_OPENAI_EFFORTS,
        default_effort="medium",
    ),
    KeyProvider(
        "baseten",
        "Baseten",
        "chat",
        "https://inference.baseten.co/v1",
        "https://app.baseten.co/settings/api_keys",
        known=(KnownModel("zai-org/GLM-5.3", "GLM-5.3", 1_000_000),),
    ),
    KeyProvider(
        "cerebras",
        "Cerebras",
        "chat",
        "https://api.cerebras.ai/v1",
        "https://cloud.cerebras.ai",
        dialect=ChatDialect(images=False),
        known=(
            KnownModel("gpt-oss-120b", "GPT-OSS 120B", 131_000),
            KnownModel("qwen-3.8-27b", "Qwen 3.8 27B", 128_000),
        ),
    ),
    KeyProvider(
        "cloudflare",
        "Cloudflare Workers AI",
        "chat",
        "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
        "https://dash.cloudflare.com/?to=/:account/ai/workers-ai",
        fields=(
            KeyField(
                "account_id",
                "0123456789abcdef0123456789abcdef",
                _matching(r"[0-9a-f]{32}"),
            ),
        ),
        models_url=(
            "https://api.cloudflare.com/client/v4/accounts/{account_id}"
            "/ai/models/search?task=Text%20Generation&per_page=100"
        ),
        models_kind="cloudflare",
    ),
    KeyProvider(
        "deepseek",
        "DeepSeek",
        "chat",
        "https://api.deepseek.com",
        "https://platform.deepseek.com/api_keys",
        # What it thought goes back with its tool calls, in a tool loop.
        dialect=ChatDialect(images=False, reasoning_back=True),
        known=(
            KnownModel("deepseek-v4-pro", "DeepSeek V4 Pro", 1_000_000),
            KnownModel("deepseek-flash", "DeepSeek Flash", 1_000_000),
        ),
        only_known=True,
    ),
    KeyProvider(
        "fireworks",
        "Fireworks",
        "chat",
        "https://api.fireworks.ai/inference/v1",
        "https://app.fireworks.ai/settings/users/api-keys",
        dialect=ChatDialect(reasoning_back=True),
        known=(
            KnownModel("accounts/fireworks/models/kimi-k3p1-pro", "Kimi K3.1 Pro"),
            KnownModel(
                "accounts/fireworks/models/deepseek-v4p1-flash-1017",
                "DeepSeek V4.1 Flash",
            ),
            KnownModel("accounts/fireworks/models/glm-5p3", "GLM-5.3"),
            KnownModel("accounts/fireworks/models/minimax-m3", "MiniMax M3"),
        ),
    ),
    KeyProvider(
        "copilot",
        "GitHub Copilot",
        "chat",
        "https://api.githubcopilot.com",
        "https://github.com/settings/copilot",
        available=False,
    ),
    KeyProvider(
        "groq",
        "Groq",
        "chat",
        "https://api.groq.com/openai/v1",
        "https://console.groq.com/keys",
        known=(
            KnownModel("openai/gpt-oss-120b", "GPT-OSS 120B", 131_072),
            KnownModel("llama-3.3-70b-versatile", "Llama 3.3 70B", 131_072),
            KnownModel("openai/gpt-oss-20b", "GPT-OSS 20B", 131_072),
        ),
    ),
    KeyProvider(
        "huggingface",
        "Hugging Face",
        "chat",
        "https://router.huggingface.co/v1",
        "https://huggingface.co/settings/tokens/new?tokenType=fineGrained",
        known=(
            KnownModel("moonshotai/Kimi-K3.1-Pro", "Kimi K3.1 Pro", 1_048_576),
            KnownModel("zai-org/GLM-5.3", "GLM-5.3", 1_000_000),
            KnownModel(
                "deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash", 1_000_000
            ),
            KnownModel("openai/gpt-oss-120b", "GPT-OSS 120B", 131_072),
        ),
    ),
    KeyProvider(
        "meta",
        "Meta",
        "chat",
        "https://api.meta.ai/v1",
        "https://dev.meta.ai/api-keys/",
        available=False,
    ),
    KeyProvider(
        "minimax",
        "MiniMax",
        "messages",
        "https://api.minimax.io/anthropic",
        "https://platform.minimax.io/console/plan",
        headers=_ANTHROPIC,
        models_url="https://api.minimax.io/v1/models",
        known=(
            KnownModel("MiniMax-M3", "MiniMax M3", 1_000_000),
            KnownModel("MiniMax-M3.1-Flash", "MiniMax M3.1 Flash", 1_000_000),
        ),
        only_known=True,
        thinking=False,
    ),
    KeyProvider(
        "mistral",
        "Mistral",
        "chat",
        "https://api.mistral.ai/v1",
        "https://console.mistral.ai/api-keys",
        # Usage comes in the last chunk without asking; the option is refused.
        dialect=ChatDialect(stream_usage=False),
        known=(
            KnownModel("mistral-large-latest", "Mistral Large", 1_000_000),
            KnownModel("mistral-medium-latest", "Mistral Medium"),
            KnownModel("magistral-medium-latest", "Magistral Medium"),
            KnownModel("mistral-small-latest", "Mistral Small"),
        ),
        only_known=True,
    ),
    KeyProvider(
        "moonshot",
        "Moonshot AI",
        "chat",
        "https://api.moonshot.ai/v1",
        "https://platform.kimi.ai/console/api-keys",
        dialect=ChatDialect(effort=True, reasoning_back=True),
        known=(
            KnownModel("kimi-k3.1-pro", "Kimi K3.1 Pro", 1_000_000),
            KnownModel("kimi-k3.1-pro-highspeed", "Kimi K3.1 Pro Highspeed", 1_000_000),
            KnownModel("kimi-k3", "Kimi K3", 1_000_000),
        ),
        only_known=True,
        efforts=("low", "high", "max"),
        default_effort="high",
    ),
    KeyProvider(
        "nvidia",
        "NVIDIA",
        "chat",
        "https://integrate.api.nvidia.com/v1",
        "https://build.nvidia.com/settings/api-keys",
    ),
    KeyProvider(
        "opencode",
        "OpenCode Go",
        "chat",
        "https://opencode.ai/inference/go/openai/v1",
        "https://opencode.ai/console",
        headers=(("user-agent", "Simeon/1.0 (simeonlabs.com)"),),
        known=(
            KnownModel("glm-5.3", "GLM-5.3", 1_000_000),
            KnownModel("kimi-k3.1-pro", "Kimi K3.1 Pro", 1_000_000),
            KnownModel("deepseek-v4.1-flash", "DeepSeek V4.1 Flash", 1_000_000),
            KnownModel("mimo-v2.6-pro", "MiMo V2.6 Pro"),
        ),
    ),
    KeyProvider(
        "qwen",
        "Qwen",
        "chat",
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
        known=(
            KnownModel("qwen3.8-max", "Qwen3.8 Max"),
            KnownModel("qwen3.7-plus", "Qwen3.7 Plus"),
            KnownModel("qwen3.8-flash", "Qwen3.8 Flash"),
        ),
        only_known=True,
    ),
    KeyProvider(
        "together",
        "Together",
        "chat",
        "https://api.together.ai/v1",
        "https://api.together.ai/settings/api-keys",
        dialect=ChatDialect(reasoning_back=True),
        known=(
            KnownModel("moonshotai/Kimi-K3.1-Pro", "Kimi K3.1 Pro", 1_048_576),
            KnownModel("zai-org/GLM-5.3", "GLM-5.3", 1_048_575),
            KnownModel(
                "deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek V4.1 Flash", 1_000_000
            ),
            KnownModel("Qwen/Qwen3.7-Plus", "Qwen3.7 Plus", 1_000_000),
        ),
    ),
    KeyProvider(
        "xiaomi",
        "Xiaomi",
        "chat",
        "https://api.xiaomimimo.com/v1",
        "https://platform.xiaomimimo.com/#/console/api-keys",
        dialect=ChatDialect(reasoning_back=True),
        known=(
            KnownModel("mimo-v2.6-pro", "MiMo V2.6 Pro"),
            KnownModel("mimo-v2.6-flash", "MiMo V2.6 Flash"),
            KnownModel("mimo-v2.6-pro-ultraspeed", "MiMo V2.6 Pro Ultraspeed"),
        ),
        only_known=True,
    ),
    KeyProvider(
        "zai",
        "Z.AI",
        "chat",
        "https://api.z.ai/api/paas/v4",
        "https://z.ai/manage-apikey/apikey-list",
        dialect=ChatDialect(reasoning_back=True),
        known=(KnownModel("glm-5.3", "GLM-5.3", 1_000_000),),
        only_known=True,
    ),
)
_BY_SLUG: dict[str, KeyProvider] = {one.slug: one for one in PROVIDERS}
SLUGS = frozenset(_BY_SLUG)


def provider(slug: str) -> KeyProvider | None:
    return _BY_SLUG.get(slug)


def catalogue_json() -> list[dict[str, Any]]:
    return [one.json() for one in PROVIDERS]


# --- the models a key reaches -----------------------------------------------------

#: What a model list carries that no agent talks to: pictures, sound,
#: embeddings, moderation.
_NOT_CHAT = re.compile(
    r"(embed|whisper|tts|dall-e|image|moderation|rerank|guard|transcri|realtime"
    r"|audio|speech|babbage|davinci|ocr|imagen|veo|lyria|sora|clip|bge|e5-"
    r"|parakeet|canary|flux|diffusion|sdxl|aqa|vision-only)",
    re.IGNORECASE,
)
#: The families an agent does best with, best first, for the providers that
#: host many models (Together, Fireworks, NVIDIA…).
_PREFERRED = (
    "claude-opus",
    "claude-sonnet",
    "gpt-6",
    "kimi-k3",
    "glm-5",
    "deepseek-v4",
    "qwen3.8",
    "qwen3.7",
    "minimax-m3",
    "mimo",
    "deepseek-r",
    "qwen3",
    "claude-haiku",
    "gpt-oss-120b",
    "llama-5",
    "llama-4",
    "nemotron",
    "mistral-large",
    "mistral-medium",
    "gpt-oss-20b",
    "llama-3.3",
    "gemma",
)
#: Smaller than this (billions of parameters, read from its id), a hosted
#: model is left out when the host lists bigger ones: an agent needs a model
#: that calls its tools reliably, and the composer's menu stays short.
SMALLEST_B = 14
_WORDS = {
    "gpt": "GPT",
    "oss": "OSS",
    "glm": "GLM",
    "deepseek": "DeepSeek",
    "minimax": "MiniMax",
    "mimo": "MiMo",
    "qwen": "Qwen",
    "kimi": "Kimi",
    "llama": "Llama",
    "ai": "AI",
}
#: Words a host's id carries that say nothing to the person choosing.
_NOISE = frozenset({"instruct", "it", "hf"})


def pretty_name(slug: str) -> str:
    """A model's name from its id where the provider gives none:
    `openai/gpt-oss-120b` is GPT OSS 120B, `google/gemma-4-27b-it` Gemma 4
    27B, `Qwen/Qwen3.5-235B-A22B-Instruct` Qwen3.5 235B A22B."""
    last = slug.rsplit("/", 1)[-1].split(":", 1)[0]
    words = [one for one in re.split(r"[-_ ]+", last) if one]
    kept = [one for one in words if one.lower() not in _NOISE] or words
    shown = []
    for word in kept:
        low = word.lower()
        experts = re.fullmatch(r"(\d+)x(\d+(?:\.\d+)?)b", low)
        if low in _WORDS:
            shown.append(_WORDS[low])
        elif experts:
            shown.append(f"{experts[1]}x{experts[2]}B")
        elif re.fullmatch(r"a?\d+(\.\d+)?[bme]", low):
            shown.append(low.upper())
        elif re.fullmatch(r"v\d+(\.\d+)*", low):
            shown.append(low)
        else:
            shown.append(word[:1].upper() + word[1:])
    return " ".join(shown) or slug


def _size(model_id: str) -> float | None:
    """A model's size in billions of parameters, read from its id:
    `qwen3.5-235b-a22b` is 235 (A22B is the part active at once),
    `mixtral-8x22b` 176; None when the id doesn't say."""
    low = model_id.lower()
    experts = re.search(r"(?<![a-z0-9.])(\d+)x(\d+(?:\.\d+)?)b(?![a-z0-9])", low)
    if experts:
        return int(experts[1]) * float(experts[2])
    sizes = re.findall(r"(?<![a-z0-9.])(\d+(?:\.\d+)?)b(?![a-z0-9])", low)
    return max(float(one) for one in sizes) if sizes else None


def _bare(model_id: str) -> str:
    """A listed id as named here: Google lists `models/gemini-…`."""
    return model_id.removeprefix("models/")


def _context(entry: Mapping[str, Any]) -> int | None:
    for key in (
        "context_length",
        "context_window",
        "max_context_length",
        "max_model_len",
        "max_input_tokens",
        "inputTokenLimit",
    ):
        value = entry.get(key)
        if isinstance(value, int) and value > 0:
            return value
    top = entry.get("top_provider")
    if isinstance(top, Mapping) and isinstance(top.get("context_length"), int):
        return int(top["context_length"])
    return None


def listed(kind: ModelsKind, body: Any) -> list[dict[str, Any]]:
    """The chat models of a provider's model list: `{id, name?, context?}`."""
    if kind == "cloudflare":
        raw = body.get("result") if isinstance(body, Mapping) else None
    elif isinstance(body, list):
        # Together's list is bare.
        raw = body
    else:
        raw = body.get("data") if isinstance(body, Mapping) else None
        if raw is None and isinstance(body, Mapping):
            raw = body.get("models")
    out: list[dict[str, Any]] = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, Mapping):
            continue
        model_id = entry.get("name") if kind == "cloudflare" else entry.get("id")
        if not isinstance(model_id, str) or not model_id or _NOT_CHAT.search(model_id):
            continue
        kind_of = entry.get("type")
        if isinstance(kind_of, str) and kind_of not in (
            "chat",
            "language",
            "code",
            "model",
        ):
            continue
        capabilities = entry.get("capabilities")
        if (
            isinstance(capabilities, Mapping)
            and capabilities.get("function_calling") is False
        ):
            continue
        context = _context(entry)
        if kind == "cloudflare":
            for one in entry.get("properties") or []:
                if (
                    isinstance(one, Mapping)
                    and one.get("property_id") == "context_window"
                ):
                    try:
                        context = int(str(one.get("value")))
                    except ValueError:
                        context = None
        name = entry.get("display_name")
        aliases = entry.get("aliases")
        out.append(
            {
                "id": _bare(model_id),
                "name": name if isinstance(name, str) and name else None,
                "context": context,
                "aliases": [one for one in aliases if isinstance(one, str)]
                if isinstance(aliases, list)
                else [],
            }
        )
    return out


def _rank(model_id: str) -> tuple[int, float, str]:
    """Best first: the families agents do best with in their order, then
    the others; within each, the bigger model first."""
    low = model_id.lower()
    bigger = -(_size(low) or 0)
    for index, family in enumerate(_PREFERRED):
        if family in low:
            return index, bigger, low
    return len(_PREFERRED), bigger, low


def _too_small(model_id: str) -> bool:
    size = _size(model_id)
    return size is not None and size < SMALLEST_B


def _entry(model_id: str, name: str, context: int | None) -> dict[str, Any]:
    return {"id": model_id, "name": name, "contextWindow": context or DEFAULT_CONTEXT}


def offered(
    one: KeyProvider, models: Sequence[Mapping[str, Any]] | None
) -> list[dict[str, Any]]:
    """The models offered for a key, best first: those named here that the
    key's list has (all of them when the provider gave no list), then, for
    a provider that hosts many, others from its list."""
    if models is None:
        return [_entry(m.slug, m.name, m.context_window) for m in one.known]
    by_id: dict[str, Mapping[str, Any]] = {}
    for entry in models:
        by_id.setdefault(str(entry["id"]), entry)
        for alias in entry.get("aliases") or []:
            by_id.setdefault(str(alias), entry)
    out: list[dict[str, Any]] = []
    for known in one.known:
        found = by_id.get(known.slug)
        if found is not None:
            out.append(
                _entry(
                    known.slug, known.name, found.get("context") or known.context_window
                )
            )
    if out and one.only_known:
        return out
    taken = {entry["id"] for entry in out}
    taken |= {str(by_id[k.slug]["id"]) for k in one.known if k.slug in by_id}
    others = [entry for entry in models if entry["id"] not in taken]
    # The small ones only when the host lists nothing bigger.
    sized = [entry for entry in others if not _too_small(str(entry["id"]))]
    rest = sorted(
        sized if sized or out else others,
        key=lambda entry: _rank(str(entry["id"])),
    )
    # One line per name in the composer's menu: the best of two the host
    # lists under the same name.
    names = {entry["name"] for entry in out}
    for entry in rest:
        if len(out) >= MOST_OFFERED:
            break
        name = str(entry.get("name") or pretty_name(str(entry["id"])))
        if name in names:
            continue
        names.add(name)
        out.append(_entry(str(entry["id"]), name, entry.get("context")))
    return out


def deployments(fields: Mapping[str, str]) -> list[dict[str, Any]]:
    """Azure's models: the deployments the person named, by their names."""
    return [
        _entry(name, name, None)
        for name in (fields.get("deployments") or "").split(",")
        if name
    ]


# --- the key checked ------------------------------------------------------------------


class KeyRefused(Exception):
    """The provider didn't take the key (401, 403, or its own words)."""


class ProviderUnreachable(Exception):
    """The provider couldn't be asked."""


def _says_bad_key(status: int, body: bytes) -> bool:
    if status in (401, 403):
        return True
    if status != 400:
        return False
    # Google answers a key it doesn't know with a 400.
    words = body[:2000].decode(errors="replace").lower()
    return "api key" in words and ("invalid" in words or "not valid" in words)


@dataclass
class Checked:
    """A key the provider took, and the models it reaches."""

    models: list[dict[str, Any]] = field(default_factory=list)


def _probe_body(one: KeyProvider, model: str) -> dict[str, Any]:
    if one.wire == "responses":
        return {"model": model, "input": "Hi", "max_output_tokens": 16, "store": False}
    if one.wire == "messages":
        return {
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "Hi"}],
        }
    return {
        "model": model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
    }


async def check_key(
    one: KeyProvider,
    key: str,
    fields: Mapping[str, str],
    *,
    client: httpx.AsyncClient | None = None,
) -> Checked:
    """The key tried at the provider: its model list asked for, or, where it
    has none, a one-word call. Raises `KeyRefused` or `ProviderUnreachable`."""
    owned = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        headers = {**one.auth_headers(key), "accept": "application/json"}
        url = one.list_url(fields)
        if url is not None:
            try:
                answer = await http.get(url, headers=headers)
            except httpx.HTTPError as error:
                raise ProviderUnreachable(type(error).__name__) from error
            if _says_bad_key(answer.status_code, answer.content):
                raise KeyRefused(answer.status_code)
            if answer.status_code == 200:
                try:
                    body = answer.json()
                except ValueError:
                    body = None
                models = offered(one, listed(one.models_kind, body))
                return Checked(models or offered(one, None))
        models = deployments(fields) if one.slug == "azure" else offered(one, None)
        if not models:
            raise KeyRefused(0)
        try:
            answer = await http.post(
                one.call_url(fields),
                headers={**headers, "content-type": "application/json"},
                content=json.dumps(_probe_body(one, str(models[0]["id"]))),
            )
        except httpx.HTTPError as error:
            raise ProviderUnreachable(type(error).__name__) from error
        if _says_bad_key(answer.status_code, answer.content):
            raise KeyRefused(answer.status_code)
        if answer.status_code >= 500:
            raise ProviderUnreachable(str(answer.status_code))
        return Checked(models)
    finally:
        if owned:
            await http.aclose()
