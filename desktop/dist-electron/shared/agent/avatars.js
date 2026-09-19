"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAIN_AVATAR = exports.AVATAR_COUNT = exports.AVATARS = void 0;
exports.isAvatarIndex = isAvatarIndex;
exports.avatarSeed = avatarSeed;
exports.avatarColors = avatarColors;
exports.agentAvatar = agentAvatar;
exports.avatarInk = avatarInk;
exports.avatarFallback = avatarFallback;
exports.assignAvatar = assignAvatar;
const constants_1 = require("./constants");
/**
 * The twenty-five avatars, and how one is given to an agent.
 *
 * From the founder's canvas of 15 September
 * (`docs/product/design/canvas-2026-09-15-template.html`): an agent's
 * face is a `<cloud-blob>` — a soft cloud with eyes — tinted by one of
 * twenty-five three-colour gradients. Its shape comes from a seed, and
 * the canvas ties the seed to the avatar's index: `seed = i * 5 + 2`. So
 * an avatar is one number, 0–24, and everything else follows from it.
 *
 * **What was wrong before, in one line:** the face was a hash of the
 * agent's id, so nothing was chosen, nothing was stored, the create
 * screen showed one face and the saved agent wore another, and with four
 * palettes locked to four seeds there were exactly four faces in the
 * whole app. The founder called it a lie and it was.
 *
 * **The rule, in the founder's words:** "make sure that the first 25
 * created agents always have a different color. after 25, we re-do."
 * `assignAvatar` does exactly that and nothing cleverer — the avatars
 * nobody is wearing come first; once every one is worn, the least-worn
 * come first; among equals, chance. Deleting an agent frees its avatar
 * for the next one, because the rule counts what is *worn*, not what was
 * ever handed out.
 *
 * **Changing it is a different thing from being given it.** The canvas
 * lets a person pick any of the twenty-five, including one already in
 * use, from the create screen and from the agent panel. The rule above
 * governs the default; a choice is a choice.
 *
 * In `shared/` because the main process assigns and the renderer draws,
 * and they must agree on the list.
 */
/** Each entry is the gradient, top to bottom, exactly as the canvas has it. */
exports.AVATARS = [
    '#8fd3f4,#b9c4ee,#f7b2d9', '#a8e6cf,#c9e9a8,#f3e6a0', '#cdbdf5,#e3c2ee,#f9cfd6',
    '#ffd79a,#ffbfa3,#f7a3b4', '#9fe0e6,#9cc2ef,#b0a8ee', '#f2e2c9,#eec7a8,#e2a896',
    '#dbe3ee,#bccbdf,#9fb2cb', '#ffe3c7,#ffcdb2,#f7bfae', '#cfe6b8,#a9d49a,#87c08c',
    '#d8b8dd,#c095bb,#a3789d', '#a9c8ff,#8fb6f5,#86d4e8', '#ffd899,#f5b06a,#dd8a63',
    '#b4e4d6,#8fd0c6,#6fb9bd', '#f5b7e0,#dda5ea,#bd9ce6', '#e6e6e8,#cbcbd2,#adaebb',
    '#fdf0b4,#fbdd9d,#f6c6a0', '#e3e0bd,#c8c79b,#a9ab81', '#f7b6b6,#ef9a9f,#dd7d8c',
    '#cfe4f2,#aecbe2,#8fadc7', '#ffd2b0,#fbb6ad,#f2a2bb', '#b6cfc2,#93b3ab,#7e93a0',
    '#e0bdf0,#c3bcf2,#a8cdf3', '#e7d3c3,#d0b39f,#b4937f', '#e6efa8,#d2e58c,#f0d982',
    '#f7a8c4,#f2909e,#f0a785',
];
exports.AVATAR_COUNT = exports.AVATARS.length;
/**
 * Yodo's face, outside the twenty-five. The main agent wears it always
 * and nobody else can pick it: it is not an index into `AVATARS`, so
 * `isAvatarIndex` says no, the grid does not offer it, and the rotation
 * never hands it out. `avatarColors` and `avatarSeed` know it.
 */
exports.MAIN_AVATAR = -1;
function isAvatarIndex(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < exports.AVATAR_COUNT;
}
/** The canvas's pairing: `seed: i * 5 + 2`. The shape belongs to the index. */
function avatarSeed(avatar) {
    if (avatar === exports.MAIN_AVATAR)
        return constants_1.DefaultAgentProfile.Seed;
    return avatar * 5 + 2;
}
/** The three stops, top to bottom. */
function avatarColors(avatar) {
    if (avatar === exports.MAIN_AVATAR)
        return constants_1.DefaultAgentProfile.Colors.split(',');
    return (exports.AVATARS[avatar] ?? exports.AVATARS[0]).split(',');
}
/** The face an agent wears: the main agent's is fixed, the rest is what is stored or the fallback. */
function agentAvatar(id, stored) {
    if (id === constants_1.AgentId.Main)
        return exports.MAIN_AVATAR;
    return stored ?? avatarFallback(id);
}
/**
 * The first colour, for a name drawn in the agent's tint beside its
 * words in a room. The canvas takes the top of the gradient.
 */
function avatarInk(avatar) {
    return avatarColors(avatar)[0];
}
/**
 * A face for an id that has none stored.
 *
 * Only for the moments before the store has answered, or for things that
 * are not agents and never had one. Deterministic, so it does not flicker
 * — but it is not an assignment and is never written back.
 */
function avatarFallback(id) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < id.length; i += 1) {
        hash ^= id.charCodeAt(i);
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash % exports.AVATAR_COUNT;
}
/**
 * Which avatar a new agent gets.
 *
 * `worn` is every avatar currently on an agent, one entry per agent —
 * duplicates included, because duplicates are the whole point of
 * counting. Entries that are not avatars (an agent from before this
 * existed, mid-backfill) are ignored rather than counted against a slot.
 *
 * `pick` chooses among the candidates and is injectable so the rule can
 * be tested without chance in it; the default is chance.
 */
function assignAvatar(worn, pick = candidates => Math.floor(Math.random() * candidates)) {
    const count = new Array(exports.AVATAR_COUNT).fill(0);
    for (const one of worn) {
        if (isAvatarIndex(one))
            count[one] += 1;
    }
    const fewest = Math.min(...count);
    const candidates = [];
    for (let i = 0; i < exports.AVATAR_COUNT; i += 1) {
        if (count[i] === fewest)
            candidates.push(i);
    }
    const at = Math.min(candidates.length - 1, Math.max(0, Math.floor(pick(candidates.length))));
    return candidates[at];
}
//# sourceMappingURL=avatars.js.map