"use strict";
/**
 * Yodo standing up an agent from a conversation.
 *
 * **Why this exists.** The founder's onboarding, step two: Yodo proposes
 * two or three trained agents for the person's work type, and on "Stand
 * them up" they exist and are briefed. Until 16 September 2026 an agent
 * could only be created from the create screen, over IPC: the main agent
 * had no way to do it (review item 58). This is that way.
 *
 * **It asks first.** Standing up an agent is an action on this computer
 * like any other, so it goes through a card: who is being stood up, one
 * line of job, the brief behind a disclosure, and two buttons. The tool
 * blocks on the answer, like a file access does, and is told plainly
 * when the person says no.
 *
 * **One job, one voice, explicit anti-jobs.** The tool takes those as
 * separate fields rather than one blob of instructions, so a brief with
 * no anti-jobs cannot be written. `buildAgentInstructions` turns them
 * into the agent's own instructions, in the same shape every time.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAgentIpc = exports.CreateAgentBehavior = exports.CREATE_AGENT_LIMITS = exports.CREATE_AGENT_TIMEOUT_MS = exports.CREATE_AGENT_ROUTE = exports.CREATE_AGENT_MCP_SERVER = exports.CREATE_AGENT_TOOL = void 0;
exports.parseCreateAgentInput = parseCreateAgentInput;
exports.buildAgentInstructions = buildAgentInstructions;
exports.describeBrief = describeBrief;
exports.CREATE_AGENT_TOOL = 'create_agent';
/** The name the gateway knows this MCP server by. */
exports.CREATE_AGENT_MCP_SERVER = 'caisra-staffing';
/** The bridge route the tool posts to. */
exports.CREATE_AGENT_ROUTE = '/create-agent';
/**
 * How long the card waits. Same as the ask-input card: the person may be
 * reading the brief, and a card that vanishes mid-read is worse than one
 * that waits.
 */
exports.CREATE_AGENT_TIMEOUT_MS = 300_000;
exports.CREATE_AGENT_LIMITS = {
    name: 40,
    label: 60,
    job: 200,
    antiJob: 160,
    antiJobs: 8,
    voice: 300,
};
exports.CreateAgentBehavior = {
    /** The person pressed Stand up. */
    Allow: 'allow',
    /** They said not now, or the card timed out. */
    Decline: 'decline',
};
/** Renderer ↔ main, for the card and the sidebar. */
exports.CreateAgentIpc = {
    /** main → renderer: draw the card. */
    Requested: 'createAgent:requested',
    /** main → renderer: the card is gone (timed out, or the turn ended). */
    Dismissed: 'createAgent:dismissed',
    /** renderer → main: Stand up, or Not now. */
    Respond: 'createAgent:respond',
    /** main → renderer: an agent now exists; reload the list. */
    Created: 'createAgent:created',
};
const clean = (value, max) => (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max);
/**
 * The tool's arguments, checked. A string back is the reason it was
 * refused, for the model; the schema says the same in fewer words.
 */
function parseCreateAgentInput(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const name = clean(input.name, exports.CREATE_AGENT_LIMITS.name);
    const label = clean(input.label, exports.CREATE_AGENT_LIMITS.label);
    const job = clean(input.job, exports.CREATE_AGENT_LIMITS.job);
    const voice = clean(input.voice, exports.CREATE_AGENT_LIMITS.voice);
    const antiJobs = (Array.isArray(input.antiJobs) ? input.antiJobs : [])
        .map(one => clean(one, exports.CREATE_AGENT_LIMITS.antiJob))
        .filter(Boolean)
        .slice(0, exports.CREATE_AGENT_LIMITS.antiJobs);
    if (!name)
        return 'A name is required.';
    if (!label)
        return 'A label is required: the remit in a few words, shown under the name.';
    if (!job)
        return 'A job is required: one sentence saying what done looks like.';
    if (antiJobs.length === 0) {
        return 'At least one anti-job is required: something this agent refuses to do.';
    }
    return { name, label, job, antiJobs, ...(voice ? { voice } : {}) };
}
/**
 * The agent's own instructions, from the brief.
 *
 * The same shape every time, so an agent stood up by Yodo reads like one
 * made on the create screen, and the anti-jobs are in the agent's own
 * words to itself rather than in a note nobody reads.
 */
function buildAgentInstructions(input) {
    return [
        `Your job: ${input.job}`,
        '',
        'You do not:',
        ...input.antiJobs.map(one => `- ${one}`),
        ...(input.voice ? ['', `How you sound: ${input.voice}`] : []),
        '',
        'Draft by default. Never send, post or spend without the person saying yes.',
        'When something is not your job, say so and hand it back rather than doing it anyway.',
    ].join('\n');
}
/** What the card shows behind its disclosure: the brief, as written. */
function describeBrief(input) {
    return [
        `Job: ${input.job}`,
        'Does not:',
        ...input.antiJobs.map(one => `- ${one}`),
        ...(input.voice ? [`Voice: ${input.voice}`] : []),
    ].join('\n');
}
//# sourceMappingURL=constants.js.map