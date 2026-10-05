/**
 * Simeon's Connect services (5 October 2026).
 *
 * The generated code under `../../generated/simeon/v1` carries Simeon's
 * names: a call leaves as `POST /simeon.v1.ComputerService/EnsureSandBox`.
 * Simeon Labs' server mounts each service under its earlier name as well
 * for one release (`server/simeon/sand/connect.py`), so a Mac app or a box
 * host built before this day keeps working; `EARLIER_CONNECT_SERVICE_NAMES`
 * in `shared/cloud-agents-availability.ts` maps the earlier names for
 * `SAND_CONNECT_SERVED`. This module is the one place the app imports the
 * five services from.
 */
import type { ServiceType } from "@bufbuild/protobuf";

import { AiService } from "../../generated/simeon/v1/simeon_connect.js";
import { AutomationsService } from "../../generated/simeon/v1/automations_connect.js";
import { CloudAgentService } from "../../generated/simeon/v1/background_composer_connect.js";
import { ComputerService } from "../../generated/simeon/v1/computer_connect.js";
import { DashboardService } from "../../generated/simeon/v1/dashboard_connect.js";

/** The same methods and messages under another name on the wire. */
export function renamedService<Service extends ServiceType>(service: Service, typeName: string): Service {
  return { ...service, typeName };
}

export const COMPUTER_SERVICE_NAME = ComputerService.typeName;
export const DASHBOARD_SERVICE_NAME = DashboardService.typeName;
export const AUTOMATIONS_SERVICE_NAME = AutomationsService.typeName;
export const CLOUD_AGENT_SERVICE_NAME = CloudAgentService.typeName;
export const AI_SERVICE_NAME = AiService.typeName;

/** The box broker: `EnsureSandBox`, `RecreateSandBox`, `WatchSandBoxMigration`, `GetSandBoxRunState`, `NotifySandAgentTurnFinished`. */
export { ComputerService };
/** Account, privacy mode, MCP OAuth, skills and plugins, listener connections. */
export { DashboardService };
/** Routines' listeners (`CreateSandAutomation` and the other three). */
export { AutomationsService };
/** Cloud agents: launch, reply, conversation, artifacts, environments. */
export { CloudAgentService };
/** `AvailableModels`, web search and fetch. */
export { AiService };
