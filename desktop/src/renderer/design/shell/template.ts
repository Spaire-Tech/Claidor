/**
 * A conversation, shared as a template.
 *
 * The canvas puts "Share as template" behind the share button in the
 * thread header, and does not say what comes out. What is worth sharing
 * about a conversation is not the conversation — it is the agent behind
 * it: what it is for, how it was told to behave, and which skills it has.
 * Somebody who receives that can have the same agent; somebody who
 * receives a transcript can only read yours.
 *
 * So the file is the agent, plus one opening line as an example of what
 * to say to it. It is JSON because it has to survive being sent through
 * anything, and it is small enough to read before you trust it — which
 * matters, since the whole file is instructions for an agent.
 */

/** Bumped only when an older file would be read wrongly by a newer app. */
export const TEMPLATE_VERSION = 1;

export interface AgentTemplateInput {
  name: string;
  description?: string;
  /** The agent's own instructions. */
  instructions?: string;
  /** Skill ids, as the app stores them. */
  skillIds?: readonly string[];
  /** The first thing said in this conversation, if anything was. */
  opening?: string;
}

export interface AgentTemplate {
  kind: 'agent';
  version: number;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  /** Absent rather than empty when the conversation has not started. */
  example?: string;
}

export function agentTemplate(input: AgentTemplateInput): AgentTemplate {
  const example = input.opening?.trim();
  return {
    kind: 'agent',
    version: TEMPLATE_VERSION,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    instructions: input.instructions?.trim() ?? '',
    skills: [...(input.skillIds ?? [])],
    ...(example ? { example } : {}),
  };
}

/** Indented, and ending in a newline, because a person will open it. */
export function templateJson(template: AgentTemplate): string {
  return `${JSON.stringify(template, null, 2)}\n`;
}

/**
 * The same thing as base64, which is what the app's inline file writer
 * takes.
 *
 * Through `TextEncoder` rather than `btoa` alone: an agent named `Café`
 * is not Latin-1, and `btoa` throws on it rather than writing something
 * wrong, which would have been a crash on somebody's real agent.
 */
export function templateBase64(template: AgentTemplate): string {
  const bytes = new TextEncoder().encode(templateJson(template));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * A file name a save dialog can offer.
 *
 * Anything a file system objects to becomes a hyphen, runs collapse, and
 * an agent named entirely in punctuation still gets a file.
 */
export function templateFileName(name: string): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-.\s]+|[-.\s]+$/g, '');
  return `${safe || 'Agent'}.caisra-agent.json`;
}
