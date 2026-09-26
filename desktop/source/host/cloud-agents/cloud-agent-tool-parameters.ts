/**
 * The CloudAgent tool's schema on the wire (25 September 2026).
 *
 * `createCloudAgentTool` is built in the Sand shape with no `parameters`
 * at all, so the request builder (`provider-session.ts`,
 * `toolParameterSchema`) found no schema and left the tool out of every
 * request: the agent could never launch a cloud agent whatever the brief
 * said. This is `CloudAgentToolArgs` as Zod, the same fields and the same
 * action list, handed to `adaptContextFirstTool` by `turn-toolset.ts`.
 */
import { z } from "zod";

export const CLOUD_AGENT_ACTIONS = [
  "launch", "list", "models", "get", "dump", "watch", "reply", "rename", "cancel", "archive", "unarchive", "delete", "list_artifacts",
] as const;

const environmentSchema = z.union([
  z.object({ type: z.literal("cloud") }),
  z.object({ type: z.literal("pool"), name: z.string().optional(), team_id: z.number().int().optional() }),
  z.object({ type: z.literal("machine"), name: z.string(), team_id: z.number().int().optional() }),
  z.object({ type: z.literal("environment"), id: z.string().optional(), name: z.string().optional() }),
]);

export const cloudAgentToolParameters = z.object({
  action: z.enum(CLOUD_AGENT_ACTIONS).describe("What to do: launch a cloud agent, list them, list the models, get or dump or watch one, reply to it, rename, cancel, archive, unarchive, delete it, or list its artifacts."),
  prompt: z.string().optional().describe("The task, for launch; the follow-up message, for reply."),
  images: z.array(z.object({ url: z.string() })).optional().describe("Images to send with the prompt (file:// or https:// URLs)."),
  repo_url: z.string().optional().describe("The repository to work in, for launch."),
  starting_ref: z.string().optional().describe("The branch, tag or commit to start from, for launch."),
  model: z.string().optional().describe("A model id or alias from the models action."),
  model_params: z.record(z.string()).optional().describe("Model parameters by id, as the models action lists them."),
  title: z.string().optional().describe("A title for the cloud agent (launch), or the new name (rename)."),
  environment: environmentSchema.optional().describe("Where it runs; omit for the cloud runner."),
  interrupt: z.boolean().optional().describe("For reply: interrupt the agent's current work with this message."),
  agent_id: z.string().optional().describe("The cloud agent's id, for every action on one agent."),
  scope: z.enum(["launched", "all"]).optional().describe("For list: only the agents you launched (default), or all of the user's."),
  include_archived: z.boolean().optional().describe("For list: include archived agents."),
  limit: z.number().int().min(1).optional().describe("For list: how many to return."),
  confirm: z.boolean().optional().describe("Required true for cancel, archive, unarchive and delete."),
});

export type CloudAgentToolParameters = z.infer<typeof cloudAgentToolParameters>;
