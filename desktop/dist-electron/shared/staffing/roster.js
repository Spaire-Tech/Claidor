"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RosterIpc = exports.RosterBehavior = exports.ROSTER_LIMITS = exports.PROPOSE_TEAM_TIMEOUT_MS = exports.PROPOSE_TEAM_ROUTE = exports.PROPOSE_TEAM_TOOL = void 0;
exports.parseProposeTeamInput = parseProposeTeamInput;
exports.rosterOption = rosterOption;
exports.briefOf = briefOf;
exports.buildRoster = buildRoster;
exports.checkRosterAnswer = checkRosterAnswer;
const strongs_1 = require("./strongs");
/**
 * The roster card: "Your starter team".
 *
 * The founder's page of 16 September, step two, beat B
 * (`docs/product/onboarding-step-two-2026-09-16.md` §5): one card, two or
 * three agents proposed from the twenty-three and never all of them,
 * each with a short name, a one-line job and a one-line anti-job; Swap
 * one, Something else, Just two / Add a third; and Stand them up.
 *
 * Yodo raises it with the `propose_team` tool, giving the work type
 * from step one (or his own two or three picks). The card is the
 * asking: Stand them up is the person's yes for every agent on it, so
 * no second card is raised per agent — the bridge stands them up
 * itself, by the same path `create_agent` uses, and tells Yodo who is
 * in. Something else comes back to Yodo as text, for him to map to one
 * of the twenty-three or design a custom brief; Not now comes back as a
 * decision, not an error.
 */
exports.PROPOSE_TEAM_TOOL = 'propose_team';
/** The bridge route the tool posts to. */
exports.PROPOSE_TEAM_ROUTE = '/propose-team';
/**
 * How long the card waits. Longer than a permission card: there are
 * three briefs to read and a swap to consider.
 */
exports.PROPOSE_TEAM_TIMEOUT_MS = 600_000;
exports.ROSTER_LIMITS = {
    /** "Propose exactly 2 or 3 (never the full 23)." */
    min: 2,
    max: 3,
    /** "Swap one → 3–4 alternates for that lane." */
    alternates: 4,
    /** The Something else line. */
    somethingElse: 300,
    workType: 80,
};
exports.RosterBehavior = {
    /** Stand them up, with the rows checked at that moment. */
    StandUp: 'standUp',
    /** Something else, with the line they typed. */
    SomethingElse: 'somethingElse',
    /** Not now, or the card timed out. */
    Decline: 'decline',
};
/** Renderer ↔ main, for the card. */
exports.RosterIpc = {
    /** main → renderer: draw the card. */
    Requested: 'roster:requested',
    /** main → renderer: the card is gone (timed out, or the turn ended). */
    Dismissed: 'roster:dismissed',
    /** renderer → main: Stand them up, Something else, or Not now. */
    Respond: 'roster:respond',
};
const clean = (value, max) => (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max);
/**
 * The tool's arguments, checked. A string back is the reason it was
 * refused, for the model.
 */
function parseProposeTeamInput(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const workType = clean(input.workType, exports.ROSTER_LIMITS.workType);
    if (!workType)
        return 'A work type is required: what the person said they do.';
    const rawPicks = Array.isArray(input.picks) ? input.picks : undefined;
    if (rawPicks === undefined)
        return { workType };
    const picks = [...new Set(rawPicks.map(one => clean(one, 60)).filter(Boolean))];
    if (picks.length < exports.ROSTER_LIMITS.min || picks.length > exports.ROSTER_LIMITS.max) {
        return `Picks must be ${exports.ROSTER_LIMITS.min} or ${exports.ROSTER_LIMITS.max} of the twenty-three, by slug.`;
    }
    const unknown = picks.filter(one => !(0, strongs_1.strongBySlug)(one));
    if (unknown.length > 0)
        return `Not in the twenty-three: ${unknown.join(', ')}.`;
    return { workType, picks };
}
/** The row for a strong. */
function rosterOption(strong) {
    return { slug: strong.slug, name: strong.name, label: strong.label, job: strong.job, antiJob: strong.cardAntiJob };
}
/** The brief the bridge stands a strong up with: the same shape `create_agent` takes. */
function briefOf(strong) {
    return {
        name: strong.name,
        label: strong.label,
        job: strong.job,
        antiJobs: [...strong.antiJobs],
        ...(strong.voice ? { voice: strong.voice } : {}),
    };
}
const optionsOf = (slugs) => slugs.map(strongs_1.strongBySlug).filter((one) => !!one).map(rosterOption);
/**
 * The card's rows for a work type: the founder's table (§7) gives the
 * team and the lane's alternates; Yodo's own picks replace the team
 * when he sends them. A work type not in the table with no picks is
 * refused, so "Something else" from step one goes through Yodo's one
 * clarifying line and then his picks, as the page says.
 */
function buildRoster(input) {
    const table = strongs_1.STARTER_TEAMS[input.workType];
    const teamSlugs = input.picks ?? table?.defaults;
    if (!teamSlugs) {
        return `"${input.workType}" is not one of the ten work types. Ask one clarifying line, then call again with your picks.`;
    }
    const team = optionsOf(teamSlugs);
    const onTeam = new Set(team.map(one => one.slug));
    const pool = [...(table?.alternates ?? []), ...(table?.defaults ?? []), ...strongs_1.SOMETHING_ELSE_ALTERNATES];
    const alternates = optionsOf([...new Set(pool)].filter(slug => !onTeam.has(slug))).slice(0, exports.ROSTER_LIMITS.alternates);
    return { workType: input.workType, team, alternates };
}
/**
 * The card's answer, checked against the card: only rows that were on
 * it, two or three of them, or a line of their own, or no.
 */
function checkRosterAnswer(raw, ask) {
    const answer = raw && typeof raw === 'object' ? raw : {};
    if (answer.behavior === exports.RosterBehavior.Decline)
        return { behavior: exports.RosterBehavior.Decline };
    if (answer.behavior === exports.RosterBehavior.SomethingElse) {
        const text = clean(answer.text, exports.ROSTER_LIMITS.somethingElse);
        return text ? { behavior: exports.RosterBehavior.SomethingElse, text } : 'Something else needs a line of text.';
    }
    if (answer.behavior === exports.RosterBehavior.StandUp) {
        const offered = new Set([...ask.team, ...ask.alternates].map(one => one.slug));
        const slugs = [...new Set((Array.isArray(answer.slugs) ? answer.slugs : []).filter((one) => typeof one === 'string'))];
        if (slugs.length < exports.ROSTER_LIMITS.min || slugs.length > exports.ROSTER_LIMITS.max) {
            return `Stand up ${exports.ROSTER_LIMITS.min} or ${exports.ROSTER_LIMITS.max}, not ${slugs.length}.`;
        }
        const strangers = slugs.filter(one => !offered.has(one));
        if (strangers.length > 0)
            return `Not on the card: ${strangers.join(', ')}.`;
        return { behavior: exports.RosterBehavior.StandUp, slugs };
    }
    return 'Not an answer the card can give.';
}
//# sourceMappingURL=roster.js.map