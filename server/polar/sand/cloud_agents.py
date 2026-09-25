"""`aiserver.v1.BackgroundComposerService` and `aiserver.v1.AiService`
(25 September 2026): the Connect surface the app's cloud-agent client
speaks, served over the maty queue. `cloud_agents_service.py` is the
projection; this module is the wire. Field names are the generated
protos' JSON spellings (`background_composer_pb.ts`, `aiserver_pb.ts`),
and enums travel as integers, which protobuf JSON accepts.

Sixteen methods of the first service and one of the second. `GetTeams`
and `GetTeamAdminSettingsOrEmptyIfNotInTeam` are `DashboardService`
(`dashboard.py`, `skill_registry.py`) and are not here.
"""

from __future__ import annotations

from typing import Any

from polar.desktop.service import offered_models

from .cloud_agents_service import cloud_agents
from .connect import ConnectCall, ConnectService

service = ConnectService("aiserver.v1.BackgroundComposerService")
ai_service = ConnectService("aiserver.v1.AiService")


def _text(message: dict[str, Any], key: str) -> str:
    value = message.get(key)
    return value.strip() if isinstance(value, str) else ""


@service.unary("StartBackgroundComposerFromSnapshot", auth="desktop-or-box")
async def start_background_composer_from_snapshot(call: ConnectCall) -> dict[str, Any]:
    agent, job = await cloud_agents.start(call.db, call.caller.user, call.message)
    return {
        "composer": cloud_agents.composer(agent, job),
        "initialRunId": str(job.id),
        "wasSwappedToDefault": False,
    }


@service.unary("GetBackgroundComposerInfo", auth="desktop-or-box")
async def get_background_composer_info(call: ConnectCall) -> dict[str, Any]:
    return {
        "composer": await cloud_agents.info(
            call.db, call.caller.user, _text(call.message, "bcId")
        )
    }


@service.unary("ListBackgroundComposers", auth="desktop-or-box")
async def list_background_composers(call: ConnectCall) -> dict[str, Any]:
    n = call.message.get("n")
    composers = await cloud_agents.list_composers(
        call.db,
        call.caller.user,
        n=int(n)
        if isinstance(n, (int, float, str)) and str(n).lstrip("-").isdigit()
        else 20,
        include_archived=call.message.get("includeArchived") is True,
    )
    return {
        "composers": composers,
        "didLoadStatus": True,
        "hasMore": False,
        "participants": [],
        "pinnedBcIds": [],
        "didLoadPinnedState": False,
    }


@service.unary("AddAsyncFollowupBackgroundComposer", auth="desktop-or-box")
async def add_async_followup_background_composer(call: ConnectCall) -> dict[str, Any]:
    from .cloud_agents_service import requested_model_id, user_message_text

    run_id = await cloud_agents.followup(
        call.db,
        call.caller.user,
        _text(call.message, "bcId"),
        text=user_message_text(call.message.get("followupConversationAction")),
        interrupt=call.message.get("synchronous") is True,
        model_id=requested_model_id(call.message),
    )
    return {"runId": run_id}


@service.unary("PauseBackgroundComposer", auth="desktop-or-box")
async def pause_background_composer(call: ConnectCall) -> dict[str, Any]:
    await cloud_agents.pause(call.db, call.caller.user, _text(call.message, "bcId"))
    return {}


@service.unary("RenameBackgroundComposer", auth="desktop-or-box")
async def rename_background_composer(call: ConnectCall) -> dict[str, Any]:
    await cloud_agents.rename(
        call.db,
        call.caller.user,
        _text(call.message, "bcId"),
        _text(call.message, "newName"),
    )
    return {}


@service.unary("ArchiveBackgroundComposer", auth="desktop-or-box")
async def archive_background_composer(call: ConnectCall) -> dict[str, Any]:
    await cloud_agents.archive(
        call.db,
        call.caller.user,
        _text(call.message, "bcId"),
        archived=call.message.get("unarchive") is not True,
    )
    return {}


@service.unary("DeleteBackgroundComposer", auth="desktop-or-box")
async def delete_background_composer(call: ConnectCall) -> dict[str, Any]:
    await cloud_agents.delete(call.db, call.caller.user, _text(call.message, "bcId"))
    return {}


@service.unary("ListBackgroundComposerArtifacts", auth="desktop-or-box")
async def list_background_composer_artifacts(call: ConnectCall) -> dict[str, Any]:
    return {
        "artifacts": await cloud_agents.artifacts(
            call.db, call.caller.user, _text(call.message, "bcId")
        )
    }


@service.unary("GetBackgroundComposerConversation", auth="desktop-or-box")
async def get_background_composer_conversation(call: ConnectCall) -> dict[str, Any]:
    return {
        "conversation": await cloud_agents.transcript(
            call.db, call.caller.user, _text(call.message, "bcId")
        )
    }


@service.unary("GetPullRequestMergeStatus", auth="desktop-or-box")
async def get_pull_request_merge_status(call: ConnectCall) -> dict[str, Any]:
    # No executor opens a pull request yet: the « no PR » shape, which the
    # client's `fetchLivePrState` reads as null.
    return {
        "isMerged": False,
        "isClosed": False,
        "isDraft": False,
        "state": "",
        "mergeableState": "",
        "title": "",
        "baseBranch": "",
        "behindBy": 0,
        "canUpdateBranch": False,
        "isAutoMergeEnabled": False,
    }


@service.unary("GetOptimizedDiffDetails", auth="desktop-or-box")
async def get_optimized_diff_details(call: ConnectCall) -> dict[str, Any]:
    # The run owns no checkout: no diffs, and the client draws no files.
    await cloud_agents.info(call.db, call.caller.user, _text(call.message, "bcId"))
    return {"diff": {"diffs": [], "diffType": 0}, "submoduleDiffs": []}


@service.unary("GetEnvironment", auth="desktop-or-box")
async def get_environment(call: ConnectCall) -> dict[str, Any]:
    from .cloud_agents_service import ENVIRONMENT_PUBLIC_ID

    if _text(call.message, "publicId") != ENVIRONMENT_PUBLIC_ID:
        return {}
    return {"environment": cloud_agents.environment()}


@service.unary("ListEnvironments", auth="desktop-or-box")
async def list_environments(call: ConnectCall) -> dict[str, Any]:
    return {"environments": [cloud_agents.environment()]}


# --- aiserver.v1.AiService/AvailableModels ----------------------------------


def available_model_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """One `/desktop/api/models/available` row as
    `AvailableModelsResponse.AvailableModel`: the same mapping the Mac's
    `availableModelFromClaidorRow` (`electron-main/models/claidor-model-catalog.ts`)
    applies, so the cloud-agent catalogue and the model picker agree."""
    if (
        row.get("accessible") is False
        or row.get("available") is False
        or row.get("role") == "fallback"
    ):
        return None
    model_id = str(row.get("modelId") or "").strip()
    if not model_id:
        return None
    body: dict[str, Any] = {
        "name": model_id,
        "defaultOn": row.get("role") == "primary",
        "serverModelName": model_id,
        "supportsAgent": row.get("agenticReady") is not False
        and row.get("supportsToolCalling") is not False,
        "supportsImages": row.get("supportsImage") is not False,
        "supportsThinking": row.get("supportsThinking") is True,
        "supportsMaxMode": False,
        "supportsNonMaxMode": True,
        "isHidden": False,
        "isChatOnly": False,
        "isLongContextOnly": False,
        "isRecommendedForBackgroundComposer": row.get("role") == "primary",
        "parameterDefinitions": [],
        "variants": [],
        "idAliases": [],
        "legacySlugs": [],
    }
    for source, target in (
        ("modelName", "clientDisplayName"),
        ("description", "tagline"),
        ("provider", "vendorName"),
    ):
        value = row.get(source)
        if isinstance(value, str) and value.strip():
            body[target] = value.strip()
    context = row.get("contextWindow")
    if isinstance(context, (int, float)) and context > 0:
        body["contextTokenLimit"] = int(context)
    price = row.get("costMultiplier")
    if isinstance(price, (int, float)):
        body["price"] = float(price)
    return body


def available_models_response(rows: list[dict[str, Any]]) -> dict[str, Any]:
    models = [
        model
        for model in (available_model_row(row) for row in rows)
        if model is not None
    ]
    # Exactly one default: the first primary, or the first row.
    first_default = next(
        (index for index, model in enumerate(models) if model["defaultOn"]), 0
    )
    for index, model in enumerate(models):
        model["defaultOn"] = index == first_default
    return {
        "models": models,
        "modelNames": [model["name"] for model in models],
        "useModelParameters": True,
    }


@ai_service.unary("AvailableModels", auth="desktop-or-box")
async def available_models(call: ConnectCall) -> dict[str, Any]:
    return available_models_response([one.available() for one in offered_models()])


router = service.router
router.include_router(ai_service.router)
