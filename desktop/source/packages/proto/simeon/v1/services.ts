/**
 * Simeon's own Connect service names (5 October 2026).
 *
 * The methods and messages are the generated ones under
 * `../../generated/aiserver/v1` (recovered from the 0.18 bundle, unchanged):
 * only the service name on the wire is ours, so a call leaves as
 * `POST /simeon.v1.ComputerService/EnsureSandBox` instead of
 * `/aiserver.v1.GrokBotService/EnsureSandBox`. Simeon Labs' server mounts
 * each service under both names for one release
 * (`server/simeon/sand/connect.py`), so a Mac app or a box host built before
 * this day keeps working; `EARLIER_CONNECT_SERVICE_NAMES` in
 * `shared/cloud-agents-availability.ts` maps the earlier names for
 * `SAND_CONNECT_SERVED`.
 */
import type { ServiceType } from "@bufbuild/protobuf";

import { AiService as UpstreamAiService } from "../../generated/aiserver/v1/aiserver_connect.js";
import { AutomationsService as UpstreamAutomationsService } from "../../generated/aiserver/v1/automations_connect.js";
import { BackgroundComposerService } from "../../generated/aiserver/v1/background_composer_connect.js";
import { DashboardService as UpstreamDashboardService } from "../../generated/aiserver/v1/dashboard_connect.js";
import { GrokBotService } from "../../generated/aiserver/v1/grok_bot_connect.js";

/** The same methods and messages under another name on the wire. */
export function renamedService<Service extends ServiceType>(service: Service, typeName: string): Service {
  return { ...service, typeName };
}

export const COMPUTER_SERVICE_NAME = "simeon.v1.ComputerService";
export const DASHBOARD_SERVICE_NAME = "simeon.v1.DashboardService";
export const AUTOMATIONS_SERVICE_NAME = "simeon.v1.AutomationsService";
export const CLOUD_AGENT_SERVICE_NAME = "simeon.v1.CloudAgentService";
export const AI_SERVICE_NAME = "simeon.v1.AiService";

/** The box broker: `EnsureSandBox`, `RecreateSandBox`, `WatchSandBoxMigration`, `GetSandBoxRunState`, `NotifySandAgentTurnFinished`. */
export const ComputerService = renamedService(GrokBotService, COMPUTER_SERVICE_NAME);
/** Account, privacy mode, MCP OAuth, skills and plugins, listener connections. */
export const DashboardService = renamedService(UpstreamDashboardService, DASHBOARD_SERVICE_NAME);
/** Routines' listeners (`CreateSandAutomation` and the other three). */
export const AutomationsService = renamedService(UpstreamAutomationsService, AUTOMATIONS_SERVICE_NAME);
/** Cloud agents: launch, reply, conversation, artifacts, environments. */
export const CloudAgentService = renamedService(BackgroundComposerService, CLOUD_AGENT_SERVICE_NAME);
/** `AvailableModels`, web search and fetch. */
export const AiService = renamedService(UpstreamAiService, AI_SERVICE_NAME);
