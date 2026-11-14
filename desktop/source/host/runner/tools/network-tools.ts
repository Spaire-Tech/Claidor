/**
 * The Simeon Network's tools (10 November 2026, the founder: "ok do the
 * reason network"): the person's agents and the agents of the people on their
 * network ask each other for work through Simeon Labs' server
 * (server/simeon/desktop/network.py, simeonlabs.com/docs/network).
 *
 * ListNetwork reads who is on it: each person, their Simeon agents (always
 * on, asked by name: `maya/Nora`) and the coding agents of theirs seen lately
 * (Claude Code, Codex, Dots…), with where they work and whether they are busy.
 * SendNetworkMessage writes as this agent (`ana/Iris`). A colleague's Simeon
 * agent gets it in its chat as a colleague's request; a coding agent's
 * session in its inbox. Their answers come back to this chat as messages, so
 * nothing here waits. The server keeps an agent to 30 messages an hour, and a
 * person's agents to 30 an hour into another person's Simeon agents.
 *
 * Other people on a network are off for now (10 November 2026, the founder:
 * "that plus other people - is what we don't need for now"; the server's
 * `network.PEOPLE`): the network is the person's own agents, bots and coding
 * agents, and the words here say so.
 *
 * Nothing here runs for a message that came through a channel (Discord,
 * Slack…): others can write there, and a message on the network goes out in
 * the person's name.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";

export interface NetworkToolDependencies {
  /** Simeon Labs' server, as this computer (`network/team`, `network/send`); the answer's `data`. */
  call(path: string, request?: { readonly method?: "GET" | "POST"; readonly json?: unknown }): Promise<unknown>;
  /** The agent whose turn this is: it writes as itself. */
  agentId(): string;
  /** How this turn began: "connector" for a message through a channel (Discord, Slack, Telegram…). */
  requestSource(): string | undefined;
  /**
   * A message the server took, for the chat to keep as a message to that
   * agent ("Messaged", 14 November 2026): `name` as the chat shows it and
   * `bot` what it is, when the server said.
   */
  sent?(to: { readonly address: string; readonly name: string; readonly bot?: string }, message: string): void;
  log?(line: string): void;
}

const NOT_HERE = "The Simeon Network isn't used for a message that came through a channel (Discord, Slack, Telegram…): others can write there, and a network message goes out in the user's name. Ask the user in Simeon.";
const LIST_MAX = 60;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 0 ? message : "Simeon Labs' server could not be reached.";
}

/** One agent, as a line: its address, what it is, where it works, how it stands. */
export function networkAgentLine(agent: Record<string, unknown>, me: string): string {
  const address = text(agent.address);
  const parts = [`- ${address}${text(agent.id) === me && text(agent.kind) === "simeon" ? " (you)" : ""}: ${text(agent.agent) || "Agent"}`];
  if (text(agent.role)) parts.push(text(agent.role));
  const where = [text(agent.machine), text(agent.repo) && (text(agent.branch) ? `${text(agent.repo)}@${text(agent.branch)}` : text(agent.repo))].filter((part) => part.length > 0);
  if (where.length > 0) parts.push(where.join(" · "));
  if (text(agent.doing)) parts.push(`doing: ${text(agent.doing)}`);
  parts.push(text(agent.status) || "away");
  return parts.join("; ");
}

export const listNetworkParameters = z.object({
  query: z.string().trim().max(200).optional().describe("Only the agents that match: a person's name, an agent's name, a role, a repo or a machine. Leave it out for everyone."),
  all: z.boolean().optional().describe("true to include coding agents seen in the last day, not only the last 30 minutes."),
});

export const sendNetworkMessageParameters = z.object({
  to: z.string().trim().min(1).max(400).describe("Who it's for, from ListNetwork: an agent's address (maya/Nora, maya/claude), a name alone when only one agent has it, maya/* for a person's live coding agents, repo:api for the live ones in a repo, or * for every live one. Simeon agents are asked one at a time, by name."),
  message: z.string().trim().min(1).max(20_000).describe("What you ask or answer, complete in itself: the agent reading it hasn't seen this chat."),
  reply_to: z.string().trim().optional().describe("When you answer a message from the network that gave its id: that id."),
});

export function createNetworkTools(deps: NetworkToolDependencies) {
  const log = (line: string): void => deps.log?.(`[network] ${line}`);
  const fromChannel = (resolved: NetworkToolDependencies): boolean => resolved.requestSource() === "connector";

  const list = defineCommunicateTool(deps, {
    id: "LIST_NETWORK",
    name: "ListNetwork",
    description: "The user's other agents you can reach: their bots (Dots, Muse…) and the coding agents on their computers (Claude Code, Codex…) connected to Simeon, with where each works and whether it's busy, idle or away, and their Simeon agents. Call it when the user wants something from one of them (\"ask my Claude Code…\", \"what is Codex doing?\"), and before SendNetworkMessage.",
    parameters: listNetworkParameters,
    describeActivity: () => ({ detail: "Looking at the Simeon Network" }),
    execute: async (_ctx, args: z.infer<typeof listNetworkParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const params = new URLSearchParams();
      if (args.query) params.set("query", args.query);
      if (args.all === true) params.set("all", "true");
      let answer: Record<string, unknown> | undefined;
      try {
        answer = record(await resolved.call(`network/team${params.size > 0 ? `?${params}` : ""}`));
      } catch (error) {
        return `The Simeon Network couldn't be read: ${failure(error)}`;
      }
      if (answer == null) return "The Simeon Network couldn't be read: Simeon Labs' server answered with something unexpected.";
      const network = record(answer.network);
      const people = Array.isArray(answer.people) ? answer.people.map(record).filter((one) => one != null) : [];
      const agents = Array.isArray(answer.agents) ? answer.agents.map(record).filter((one) => one != null) : [];
      const me = resolved.agentId();
      const lines = [`The user's Simeon Network, "${text(network?.name) || "their network"}":`];
      // Other people only once they can be on a network (the server's `network.PEOPLE`).
      if (people.length > 1) lines.push(`People: ${people.map((p) => `${text(p.name)} (${text(p.handle)})${p.you === true ? " — the user" : ""}`).join(", ")}.`);
      lines.push(args.query ? `Agents matching "${args.query}":` : "Agents:");
      if (agents.length === 0) lines.push("- none");
      lines.push(...agents.slice(0, LIST_MAX).map((agent) => networkAgentLine(agent, me)));
      if (agents.length > LIST_MAX) lines.push(`- and ${agents.length - LIST_MAX} more: give query to narrow it.`);
      lines.push("Ask one with SendNetworkMessage. Its answer comes back to this chat as a message.");
      return lines.join("\n");
    },
  });

  const send = defineCommunicateTool(deps, {
    id: "SEND_NETWORK_MESSAGE",
    name: "SendNetworkMessage",
    description: "Write to one of the user's bots or coding agents connected to Simeon (from ListNetwork), as yourself (your address is the user's handle and your name, like ana/Iris), or answer a message from one that asked you (it said how). Its answer comes back to this chat as a message: don't wait for it in this turn; tell the user in a few words whom you asked. Share the user's private details, files or logins only when the user asked you to.",
    parameters: sendNetworkMessageParameters,
    describeActivity: (args: z.infer<typeof sendNetworkMessageParameters>) => ({ detail: `Writing to ${args.to}` }),
    execute: async (_ctx, args: z.infer<typeof sendNetworkMessageParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      let answer: Record<string, unknown> | undefined;
      try {
        answer = record(await resolved.call("network/send", {
          method: "POST",
          json: { agentId: resolved.agentId(), to: args.to, message: args.message, ...(args.reply_to ? { replyTo: args.reply_to } : {}) },
        }));
      } catch (error) {
        return `Not sent: ${failure(error)}`;
      }
      const reached = Array.isArray(answer?.sent) ? answer.sent.map(record).filter((one) => text(one?.to).length > 0) : [];
      const sent = reached.map((one) => text(one?.to));
      if (sent.length === 0) return "Not sent: Simeon Labs' server answered with something unexpected.";
      log(`sent to ${sent.length} on the network`);
      for (const one of reached) {
        const address = text(one?.to);
        const bot = text(one?.bot);
        // A server from before names nobody: the last part of the address stands for it.
        const name = text(one?.name) || (address.split("/").at(-1) ?? address);
        try {
          resolved.sent?.({ address, name, ...(bot.length > 0 ? { bot } : {}) }, args.message);
        } catch (error) {
          log(`the chat's line was not written: ${failure(error)}`);
        }
      }
      // An answer to a message that asked: nothing comes back, and the person has not asked for anyone to be asked.
      if (args.reply_to) return `Sent to ${sent.join(", ")}. It is kept in your conversation with it in this chat.`;
      return `Sent to ${sent.join(", ")}. The answer comes back to this chat as a message: don't wait for it now. Tell the user in a few words whom you asked.`;
    },
  });

  return [list, send];
}
