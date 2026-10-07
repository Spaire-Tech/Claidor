import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SIMEON_MARK_BOUNDS, SIMEON_MARK_PATH } from "./simeon-logo.mjs";

const REGISTRY_BEFORE = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"},{id:"beta",label:"Updates",icon:"cloud-download"}]';
// Two tabs (4 October 2026, the founder: "hide the whole update tab"). The
// Updates tab carried the upstream app's release tracks, which Simeon has
// none of, and the updater is off in every packaged build
// (build-asar.mjs); the cloud computer is updated from the server.
const REGISTRY_AFTER = 'const wDn=[{id:"general",label:"General",icon:"settings-gear"},{id:"usage",label:"Usage & Billing",icon:"chart-bars"}]';
const GENERAL_BEFORE = 'Q=x==="general"?a.jsx(Te,{children:a.jsx(Sa,{auth:t})}):null';
const USAGE_BEFORE = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx(Na,{})}):null';
const COMPONENT_ANCHOR = 'function Sa(s){';

/**
 * The product's name in the shipped 0.18.0 renderer, decided by the founder
 * on 22 September 2026: "replace all 'Grok Bot' by 'Simeon' everywhere in
 * the app. Replace all new names 'New Bot' by 'New Agent'". These are the
 * strings the checksum-pinned bytes carry (onboarding, About, the Computer
 * chrome, Settings titles, the default agent name); the pass runs over every
 * renderer chunk and the page, after the Settings patch.
 */
export const BRAND_REPLACEMENTS = Object.freeze([
  ["Grok Bot", "Simeon"],
  ["New Bot", "New Agent"],
  ["Caisra", "Simeon"],
]);

/**
 * "change all this by agent" (22 September 2026): the bare words Bot and
 * Bots ("Create new Bot", "Message Bot", "Search or create Bots", "Give
 * each Bot a job", "Hidden Bots", "Reset to the Bot"). In minified code a
 * three-letter identifier could be spelled Bot, so the word is only taken
 * where copy sits: between quotes, spaces or tag brackets, never next to
 * an operator, a dot or a bracket.
 */
export const BRAND_WORD_REPLACEMENTS = Object.freeze([
  [/(?<=["'` >])Bots(?=["'` <.,!?])/g, "Agents", "Bots"],
  [/(?<=["'` >])Bot(?=["'` <.,!?])/g, "Agent", "Bot"],
]);

/**
 * Whole sentences of the pinned window's copy that named Cursor, as they
 * read after the pass above (29 September 2026). A full sentence cannot be
 * an identifier, so these are safe to rewrite in minified code; each is
 * counted in the record like the words above. Found by reading every string
 * of the patched window for Cursor, Grok and Anysphere.
 */
export const BRAND_PHRASE_REPLACEMENTS = Object.freeze([
  ["Sign In with Cursor", "Sign In"],
  ["Signed in to Cursor", "Signed in"],
  ["Connect your Cursor account to Simeon", "Sign in to Simeon"],
  ["You\u2019ll need to sign in again to use your Cursor account with Simeon.", "You\u2019ll need to sign in again to use Simeon."],
  ["Sign in to Cursor in settings, then ask anything.", "Sign in to Simeon in settings, then ask anything."],
  ["Open this cloud agent in Cursor", "Open this cloud agent"],
  ["Open in Cursor", "Open"],
  ["Cursor cloud agent", "Cloud agent"],
  ["Cursor agent: ", "Cloud agent: "],
  ["This setting is shared with Cursor. Leaving Legacy can\u2019t be undone.", "Leaving Legacy can\u2019t be undone."],
  ["Cursor authentication failed.", "Sign-in failed."],
  ["Managed by Cursor", "Managed by your organization"],
  ["Cursor backend ", "Simeon Labs backend "],
  ["Cursor session ", "Simeon session "],
  ["session's Cursor tokens", "session's sign-in tokens"],
  // The About panel's line (4 October 2026: "about uses SpaceX ai, please make it SimeonLabs, Inc.").
  ["Copyright © 2026 SpaceXAI", "Copyright © 2026 SimeonLabs, Inc."],
  // The marketplace link in the plugins chunk (Track A of the detachment plan).
  ["https://cursor.com/marketplace", "https://simeonlabs.com"],
  // The access cover's button (6 October 2026): the window shows the cover
  // when the server refuses the box for want of a plan, and the button
  // opened the upstream's onboarding page. It opens Simeon's billing page;
  // once the plan is on Stripe, the window's next ask for its box succeeds
  // and the cover goes (docs/services-billing.md, section 3).
  ["https://cursor.com/bot/onboarding", "https://app.simeonlabs.com/billing?plan=standard"],
]);

/**
 * Words the brand pass does not rename, counted after it runs so the record
 * says whether any of Cursor's names are still in the shipped bytes (ledger
 * F-454, 26 September 2026). "Cursor" and "Anysphere" are left because in
 * a minified chunk they are as often identifiers as copy, and renaming an
 * identifier breaks the page; the count under `brand.residue` is the
 * measurement, and the visible occurrences are the Mac's to read.
 */
export const BRAND_RESIDUE_WORDS = Object.freeze(["Cursor", "Anysphere", "cursor.com", "cursor.sh"]);

export function countBrandResidue(sources) {
  const counts = {};
  for (const word of BRAND_RESIDUE_WORDS) {
    let count = 0;
    for (const source of sources) count += source.split(word).length - 1;
    counts[word] = count;
  }
  return counts;
}

/**
 * The window's own tokens that carry the upstream maker's name (Track B of
 * the detachment plan, 4 October 2026): the 424 CSS custom properties
 * `--cursor-*` and the two places the window builds their names from
 * pieces (`--cursor-${…}`), the theme classes cursor-light / cursor-dark /
 * cursor-high-contrast, the glass-mode attribute, the stylesheet's layer
 * names, the icon font's family (its file keeps its name: the packaged
 * renderer's inventory is pinned by file), the mark's class and state
 * attribute, and the cloud-agent card's class family. Nothing outside the
 * window reads any of them, so every chunk, the stylesheet and the page
 * are rewritten together, and the patch's own CSS spells the new names.
 * The stale-name check below refuses a build in which any `--cursor-` is
 * left, so a token this list misses is a build error, not a blank screen.
 */
export const UPSTREAM_TOKEN_REPLACEMENTS = Object.freeze([
  ["css-variables", /--cursor-/g, "--simeon-"],
  ["themes", /(?<![A-Za-z0-9_-])cursor-(light|dark|high-contrast)(?![A-Za-z0-9_])/g, "simeon-$1"],
  ["glass-attribute", /data-cursor-glass-mode/g, "data-simeon-glass-mode"],
  ["layers", /anysphere\.(tokens|scss|stylex)/g, "simeon.$1"],
  ["icon-font", /cursor-icons(?!-16)/g, "simeon-icons"],
  // The icon font's file: the stylesheet's src and the file itself, which
  // the patch renames on disk and records under `renames` (the founder, 5
  // October 2026: "do the icon font file too").
  ["icon-font-file", /cursor-icons-16-/g, "simeon-icons-16-"],
  ["mark-class", /sand-grok-bot-mark/g, "sand-simeon-mark"],
  ["mark-state", /data-grok-state/g, "data-mark-state"],
  ["cloud-agent-card", /sand-cursor-agent-card/g, "sand-cloud-agent-card"],
  // The account bridge between the window and the Mac (`desktop.account`
  // in the preload, the edge method names, the status event and the
  // status field): the window's own spellings carried the maker's name.
  // Our side spells the new names (preload.ts, main-edge.ts, web/backend.ts,
  // demo/backend.ts); the pass makes the window agree.
  ["account-bridge", /\bcursorAccount\b/g, "account"],
  ["account-auth-prop", /\bcursorAuth\b/g, "accountAuth"],
  ["account-event", /cursor-auth-changed/g, "account-changed"],
  ["account-staff-field", /\bisAnysphereUser\b/g, "isStaffUser"],
  ["account-method-status", /\bgetCursorAuthStatus\b/g, "getAccountStatus"],
  ["account-method-sign-in", /\bloginCursor\b/g, "signInAccount"],
  ["account-method-cancel-sign-in", /\bcancelCursorLogin\b/g, "cancelAccountSignIn"],
  ["account-method-sign-out", /\blogoutCursor\b/g, "signOutAccount"],
  ["account-method-name", /\bupdateCursorAccountName\b/g, "updateAccountName"],
  ["account-method-name-prompt", /\bgetCursorNamePrompt\b/g, "getAccountNamePrompt"],
  ["account-method-avatar", /\bgetCursorAvatar\b/g, "getAccountAvatar"],
  ["account-method-weekly-usage", /\bgetCursorWeeklyUsage\b/g, "getAccountWeeklyUsage"],
  ["account-method-usage-summary", /\bgetCursorUsageSummary\b/g, "getAccountUsageSummary"],
  // The maker's name where it was still readable in the shipped bytes
  // (measured 5 October 2026, the founder: "I want every mention of them to
  // be gone"): their UI package in two error messages, their auth module in
  // six, the icon class and two glyph names, an icon style, a few internal
  // names, and the type names of code-editor messages the window never
  // sends. The ordinary word "cursor" (the mouse and text cursor inside the
  // editor and the animation and highlighting libraries) is not theirs and
  // stays; the icon font's file keeps its name because the packaged
  // window's file inventory is pinned by name (macos-package-verification).
  ["ui-package", /@anysphere\/ui/g, "simeon-ui"],
  ["auth-module-note", /cursor-auth\.ts/g, "account-auth.ts"],
  ["icon-class", /(?<![A-Za-z0-9_-])cursor-icon(?!s)/g, "simeon-icon"],
  ["icon-glyphs", /"cursor-(logo|text)"/g, "\"simeon-$1\""],
  ["icon-style", /"cursor-mixed"/g, "\"simeon-mixed\""],
  ["signed-in-prop", /\bisCursorSignedIn\b/g, "isAccountSignedIn"],
  ["cycle-agent", /\b(cycle|get)CursorAgentId\b/g, "$1NextAgentId"],
  ["cycle-agent-state", /\bcursorAgentId\b/g, "nextAgentId"],
  ["editor-message-types", /"(aiserver|agent)\.v1\.[A-Za-z.]*Cursor[A-Za-z.]*"/g, (name) => name.replaceAll("Cursor", "Pointer")],
  ["editor-message-fields", /\b(matchingCursorRules|relatedCursorRules|relatedCursorRulePaths|relativePathToCursorFolder|isFusedCursorPredictionModel)\b/g, (name) => name.replace("Cursor", "Pointer")],
  // The same fields' wire spellings. `cursor_position` is not among them:
  // it is the pointer's place in agent.v1.ComputerUseSuccess, our own
  // computer-use contract (box-exec-daemon/computer-use.ts).
  ["editor-message-field-names", /\b(matching_cursor_rules|cursor_rules|cursor_prediction|is_fused_cursor_prediction_model|cursor_version|cursor_commands|user_explicitly_asked_to_generate_cursor_rules)\b/g, (name) => name.replace("cursor", "pointer")],
  ["sidebar-cycle-focus", /\b(is)?[cC]ycleCursor\b/g, (name) => name.replace("Cursor", "Focus")],
  // Where pull-request links open: the value our main process answers with
  // (electron-main/account/pr-review.ts) and the window compares, both
  // spelled reviewApp since 5 October 2026.
  ["pr-review-destination", /\breviewCursor\b/g, "reviewApp"],
  ["pr-review-gate", /\bopenGithubPrLinksInReviewCursor\b/g, "openGithubPrLinksInReviewApp"],
  ["pr-review-gate-name", /\bopen_github_pr_links_in_review_cursor\b/g, "open_github_pr_links_in_review_app"],
  ["editor-fields-more", /\b(cursorRules|cursorCommands|cursorCommandsExplicitlySet|cursorVersion|cursorSelections|cursorTarget)\b/g, (name) => name.replace("cursor", "pointer")],
  ["editor-field-names-more", /\b(related_cursor_rules|related_cursor_rule_paths|relative_path_to_cursor_folder|(suggest|reject|accept)_cursor_prediction_event|cursor_prediction_target|cursor_token_fee|cursor_selections|cursor_commands_explicitly_set)\b/g, (name) => name.replace("cursor", "pointer")],
  ["editor-dotfiles", /\.cursor(rules|ignore|indexingignore)\b/g, ".pointer$1"],
  // The cloud-agent card's type: the host writes cloud-agent since 5 October
  // 2026 and maps saved cursor-agent entries on read (session-runtime.ts).
  ["cloud-agent-card-type", /(?<![A-Za-z0-9_-])cursor-agent(?![A-Za-z0-9_])/g, "cloud-agent"],
  ["account-method-pr-review", /\bgetCursorPrReviewPreferences\b/g, "getAccountPrReviewPreferences"],
  ["account-method-privacy", /\bgetCursorPrivacyModeEnabled\b/g, "getAccountPrivacyModeEnabled"],
  ["account-method-dashboard", /\binvokeCursorDashboardAction\b/g, "invokeAccountDashboardAction"],
  ["account-method-trial", /\bcancelCursorSandTrial\b/g, "cancelAccountTrial"],
]);

export function patchOriginalUpstreamTokens(source) {
  let out = source;
  const counts = {};
  for (const [label, pattern, after] of UPSTREAM_TOKEN_REPLACEMENTS) {
    const count = (out.match(pattern) ?? []).length;
    counts[label] = count;
    if (count > 0) out = out.replace(pattern, after);
  }
  return { source: out, counts };
}

export function patchOriginalBrandStrings(source) {
  let out = source;
  const counts = {};
  for (const [before, after] of BRAND_REPLACEMENTS) {
    const count = out.split(before).length - 1;
    counts[before] = count;
    if (count > 0) out = out.split(before).join(after);
  }
  for (const [pattern, after, label] of BRAND_WORD_REPLACEMENTS) {
    const count = (out.match(pattern) ?? []).length;
    counts[label] = count;
    if (count > 0) out = out.replace(pattern, after);
  }
  for (const [before, after] of BRAND_PHRASE_REPLACEMENTS) {
    const count = out.split(before).length - 1;
    counts[before] = count;
    if (count > 0) out = out.split(before).join(after);
  }
  return { source: out, counts };
}


/**
 * The marks in the shipped screens, decided by the founder on 23 September
 * 2026 ("can we make it a cloud rather", "make it a cloud", and the petal
 * mark "with a slow turn so it still feels alive").
 *
 * Three anchors in the pinned chunk, each exactly once:
 *   1. The landing page's black mark next to the product name is an `sd`
 *      with no shape, so it draws the default blob. It becomes a cloud, one
 *      of the renderer's own shapes (`Jo.cloud`); the mood cycle is untouched.
 *   2. The onboarding hero, the mark that travels across the screens
 *      (`QBn`), is declared `shape:"blob"`. It becomes a cloud. The three
 *      teammates keep their shapes.
 *   3. The boot screen's logo (`tOt`, "Setting up …'s computer") is Grok
 *      Bot's own, an SVG path morphing through 158 frames. It becomes
 *      Simeon's mark, drawn from the path in simeon-logo.mjs (the four
 *      petals, 4 October 2026), same size, same colour variable (`MNe`,
 *      light-dark), same reduced-motion rule, turning once every 14 seconds
 *      instead of morphing.
 * Ocean, 26 September 2026 ("the onboarding cloud color is grey ish. i want
 * it this color", with a screenshot of the Ocean palette): the landing mark,
 * the hero and the no-agent mark (a fourth anchor) are `color:"blue"`, the
 * id Ocean is painted on, instead of `black` (Slate).
 * Plus one file: the hand-off screen ("Waking your computer…") and About
 * draw `assets/app-icon-C7NKj2u7.png`, and the pinned renderer carries Grok
 * Bot's icon under that name. Nothing replaced it before 23 September; the
 * founder's icon from frontend/runtime-assets is written over it now.
 */
const LANDING_MARK_BEFORE = 'p.jsx(sd,{"aria-hidden":!0,color:"black",paused:N,sizePx:ujn,state:E})';
const LANDING_MARK_AFTER = 'p.jsx(sd,{"aria-hidden":!0,color:"blue",paused:N,shape:"cloud",sizePx:ujn,state:E})';
const HERO_MARK_BEFORE = '{id:"hero",color:"black",shape:"blob",isGazing:!1,bob:null}';
const HERO_MARK_AFTER = '{id:"hero",color:"blue",shape:"cloud",isGazing:!1,bob:null}';
// The mark drawn when no agent is selected (the main screen before one is
// chosen): the renderer's own default was a black blob.
const IDLE_MARK_BEFORE = 'V=L==null?{color:"black",shape:"blob"}:';
const IDLE_MARK_AFTER = 'V=L==null?{color:"blue",shape:"cloud"}:';
const LOADING_LOGO_BEFORE = 'function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches;return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:V_t,width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsx("path",{d:Q_t,fillRule:"evenodd",style:{fill:MNe(e)},children:s?null:p.jsx("animate",{attributeName:"d",calcMode:"discrete",dur:`${X_t}s`,repeatCount:"indefinite",values:eOt})})})}';
/** The window of the 400 box the mark fills, with a hair of margin, so at 56 px the mark is as large as the logo it replaces. */
export const LOADING_LOGO_VIEWBOX = (() => {
  const { x, y, width, height } = SIMEON_MARK_BOUNDS;
  const side = Math.ceil(Math.max(width, height) * 1.04), cx = x + width / 2, cy = y + height / 2;
  return `${Math.round(cx - side / 2)} ${Math.round(cy - side / 2)} ${side} ${side}`;
})();
export const LOADING_LOGO_TURN_SECONDS = 14;
const LOADING_LOGO_MARK = `p.jsx("path",{d:"${SIMEON_MARK_PATH}",fillRule:"evenodd",style:r},"mark")`;
const LOADING_LOGO_AFTER = `function tOt({size:n,color:e="black",className:t}){const s=window.matchMedia("(prefers-reduced-motion: reduce)").matches,r={fill:MNe(e)};return p.jsx("svg",{"aria-hidden":"true",className:t,height:n,viewBox:"${LOADING_LOGO_VIEWBOX}",width:n,xmlns:"http://www.w3.org/2000/svg",children:p.jsxs("g",{children:[${LOADING_LOGO_MARK},s?null:p.jsx("animateTransform",{attributeName:"transform",type:"rotate",from:"0 200 200",to:"360 200 200",dur:"${LOADING_LOGO_TURN_SECONDS}s",repeatCount:"indefinite"},"turn")]})})}`;
export const MARK_REPLACEMENTS = Object.freeze([
  ["landing-mark-cloud", LANDING_MARK_BEFORE, LANDING_MARK_AFTER],
  ["hero-mark-cloud", HERO_MARK_BEFORE, HERO_MARK_AFTER],
  ["idle-mark-ocean-cloud", IDLE_MARK_BEFORE, IDLE_MARK_AFTER],
  ["loading-logo-mark", LOADING_LOGO_BEFORE, LOADING_LOGO_AFTER],
]);
export const APP_ICON_ASSET = "app-icon-C7NKj2u7.png";
export const APP_ICON_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/runtime-assets", APP_ICON_ASSET);

export function patchOriginalMarks(source) {
  let out = source;
  for (const [label, before, after] of MARK_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * One shape: the cloud, in any of the twelve colours (26 September 2026: "i
 * want to remove all those shapes, and make the cloud the absolute main and
 * only shape. it just comes in different colors … apply it everywhere, even
 * in onboarding").
 *
 * The renderer draws every mark from one geometry table, `Jo` (18 shapes:
 * the animator, the static SVG `rOt`, the icon `Y9e`, the face placement
 * `sOt`), sizes it by one per-shape factor, `$de` over `ont`, and offers,
 * hashes and cycles shapes from one list, `Ij` (the editor's and
 * onboarding's shape pickers, `u4e` for an agent with no shape stored,
 * `gqn` for onboarding's teammates, the failure screen's cycle). So:
 *   1. every entry of `Jo` is the cloud's geometry, which makes a saved
 *      "pebble" or "hex" draw a cloud without touching anyone's data, and
 *      turns shape morphs into no-ops;
 *   2. `$de` returns the cloud's factor for every name, so a former blob is
 *      exactly today's cloud size (`lnt`, which divides by it, too);
 *   3. `Ij` is `["cloud"]`;
 *   4. onboarding's create-step default shape is the cloud.
 * The two shape pickers ("Character shape") are hidden by the stylesheet
 * rule below; the colour rows stay.
 */
export const SHAPE_REPLACEMENTS = Object.freeze([
  ["shapes-geometry-cloud", "Jo.wedge.face.leftDX=-6;const Qtt=Object.keys(Jo)", "Jo.wedge.face.leftDX=-6;for(const k of Object.keys(Jo))Jo[k]=Jo.cloud;const Qtt=Object.keys(Jo)"],
  ["shapes-scale-cloud", "function $de(n){return ont[n]??1}", "function $de(n){return ont.cloud}"],
  ["shapes-list-cloud", 'const Ij=["blob","pebble","squircle","tablet","wedge","hex","cloud","teardrop"];', 'const Ij=["cloud"];'],
  ["shapes-onboarding-default-cloud", 'mde={color:"blue",shape:"blob"}', 'mde={color:"blue",shape:"cloud"}'],
]);

export function patchOriginalShapes(source) {
  let out = source;
  for (const [label, before, after] of SHAPE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * An agent's chat always opens as a chat, 28 September 2026 ("it starts like
 * this … the composer is different. i noticed the app sometimes start like
 * this too. please fix."). The window counted a chat active only once it had
 * entries or a run (`z=B||D.isRunning||F||R||q`), so an agent with nothing
 * said yet drew the empty hero instead: the shell marked data-empty, the
 * composer in the middle of the pane and expanded to 136 px, jumping to the
 * docked 44 px bar at the first message. A chat now counts as active whenever
 * an agent is open (`e`, the open agent's id, as `isChatInteractive` reads
 * it), so it is the docked chat from the start; the new-chat and new-agent
 * panes are untouched.
 */
export const CHAT_LAYOUT_REPLACEMENTS = Object.freeze([
  ["chat-active-when-open", ",z=B||D.isRunning||F||R||q,V=e!=null&&!d,", ",z=e!=null||B||D.isRunning||F||R||q,V=e!=null&&!d,"],
]);

export function patchOriginalChatLayout(source) {
  let out = source;
  for (const [label, before, after] of CHAT_LAYOUT_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * Voice calls, 30 September 2026 (the founder approved the call banner's
 * design the same day): two things in the window, both calling the
 * `window.desktop.voiceCall` bridge the main preload adds
 * (source/electron-preload/preload.ts).
 *
 *   1. A phone button beside the agent's name in the chat header. The
 *      identity row (`aSn`) draws [identity button, shared badge]; the call
 *      button goes between them, outside the identity button, which is
 *      itself a button that opens the agent's settings. The row's memo slot
 *      (e[97..101]) is replaced by a plain element so the button always
 *      carries the open agent's id. The stylesheet places it just right of
 *      the name pill, in the pill's own white glass. It tells main which
 *      agent is open (for Agent › Call <name>) and draws nothing when calls
 *      are switched off on this Mac (`SIMEON_VOICE_CALLS=0`).
 *   2. A voice dropdown under "Character color" in the agent's character
 *      settings (`e3n`): each option is the voice's name and description, and
 *      a round play button beside it plays the chosen voice (first a list
 *      with radios; the founder asked for a dropdown). Choosing saves the agent's
 *      `voiceId` through main (the host's updateAgent), and the next call
 *      speaks in it. The column's memo slot (e[21..23]) is replaced the same
 *      way.
 *
 * The two components are defined once, at module scope, before `e3n`; they
 * use the chunk's own React (`S`) and JSX runtime (`p`).
 */
const PHONE_ICON_PATH = "M7.2 3.5c.5 0 .9.3 1.1.7l1.4 3.3c.2.5.1 1-.3 1.3l-1.7 1.4a12 12 0 0 0 6.1 6.1l1.4-1.7c.3-.4.9-.5 1.3-.3l3.3 1.4c.5.2.7.6.7 1.1v2.7c0 .7-.5 1.2-1.2 1.2C10.6 20.7 3.3 13.4 3.3 4.7c0-.7.5-1.2 1.2-1.2h2.7z";
export const VOICE_CALL_COMPONENTS_SOURCE = [
  // The phone button.
  "function __simeonCallButton(n){",
  "const d=typeof window<\"u\"?window.desktop?.voiceCall:void 0,[a,s]=S.useState(null);",
  "S.useEffect(()=>{if(d==null)return;let l=!0;Promise.resolve(d.getAvailability()).then(v=>{l&&s(v)},()=>{});return()=>{l=!1}},[d]);",
  // The colour rides along (6 October 2026, the founder: "another avatar appears in the calling
  // banner"): an agent with no stored colour is drawn by the window in a colour hashed from its
  // id (`Cee`, AGENT_COLOR_RESOLVER), which the banner cannot work out on its own.
  "S.useEffect(()=>{if(d==null||n.agentId==null)return;Promise.resolve(d.noteAgent(n.agentId,n.agentName,n.agentColor)).catch(()=>{});return()=>{Promise.resolve(d.noteAgent(null)).catch(()=>{})}},[d,n.agentId,n.agentName,n.agentColor]);",
  "if(d==null||a?.enabled!==!0)return null;",
  "const c=`Call ${n.agentName}`;",
  `return p.jsx("button",{"aria-label":c,className:"simeon-call-button",onClick:e=>{e.stopPropagation(),Promise.resolve(d.start(n.agentId,n.agentName,n.agentColor)).catch(()=>{})},title:c,type:"button",children:p.jsx("svg",{"aria-hidden":!0,viewBox:"0 0 24 24",children:p.jsx("path",{fill:"currentColor",d:"${PHONE_ICON_PATH}"})})})}`,
  // The voice picker.
  "function __simeonVoicePicker(n){",
  "const d=typeof window<\"u\"?window.desktop?.voiceCall:void 0,[v,sv]=S.useState(null),[c,sc]=S.useState(null),[x,sx]=S.useState(null),[g,sg]=S.useState(null),au=S.useRef(null);",
  "S.useEffect(()=>{if(d==null||n.agentId==null)return;let l=!0;sx(null);Promise.all([d.getAvailability(),d.listVoices(),d.getAgentVoice(n.agentId)]).then(([a,o,k])=>{if(!l)return;if(a?.enabled!==!0){sv([]);return}sv(Array.isArray(o)?o:[]),sc(k)},()=>{l&&sx(\"Voices aren’t available right now.\")});return()=>{l=!1;au.current?.pause();au.current=null;sg(null)}},[d,n.agentId]);",
  "if(d==null||(v==null||v.length===0)&&x==null)return null;",
  "const pick=o=>{const b=c;sc({voiceId:o.id,isDefault:!1}),sx(null),Promise.resolve(d.setAgentVoice(n.agentId,o.id)).then(k=>sc(k),()=>{sc(b),sx(\"Couldn’t save the voice.\")})};",
  "const play=o=>{if(g===o.id){au.current?.pause();au.current=null;sg(null);return}au.current?.pause();sg(o.id);Promise.resolve(d.previewUrl(o.id)).then(u=>{if(u==null){sg(null);return}const m=new Audio(u);au.current=m;m.onended=()=>{au.current===m&&sg(null)};return m.play()}).catch(()=>sg(null))};",
  // A dropdown (the founder: "have voice be a drop down"), with a play button for the chosen voice beside it.
  // Names only (1 October 2026: "the voice description / name makes no sense. should be just names").
  "const cur=c?.voiceId??v?.[0]?.id??\"\",sel=v?.find(o=>o.id===cur)??null,pl=sel!=null&&g===sel.id;",
  `return p.jsxs("div",{"aria-label":"Voice",className:"simeon-voice-picker",children:[p.jsx("label",{className:"simeon-voice-picker__title",htmlFor:\`simeon-voice-\${n.agentId}\`,children:"Voice"}),x==null?null:p.jsx("div",{className:"simeon-voice-picker__note",role:"status",children:x}),v==null||v.length===0?null:p.jsxs("div",{className:"simeon-voice-picker__row",children:[p.jsx("select",{className:"simeon-voice-picker__select",id:\`simeon-voice-\${n.agentId}\`,value:cur,onChange:e=>{const o=v.find(q=>q.id===e.target.value);o!=null&&pick(o)},children:v.map(o=>p.jsx("option",{value:o.id,children:o.name},o.id))}),p.jsx("button",{"aria-label":sel==null?"Play":pl?\`Stop \${sel.name}\`:\`Play \${sel.name}\`,className:"simeon-voice-picker__play",disabled:sel==null||sel.hasPreview!==!0,onClick:()=>sel!=null&&play(sel),type:"button",children:p.jsx("svg",{"aria-hidden":!0,viewBox:"0 0 24 24",children:p.jsx("path",{fill:"currentColor",d:pl?"M7 5h4v14H7zM13 5h4v14h-4z":"M8 5.2v13.6L19 12z"})})})]})]})}`,
  // The call in the chat (1 October 2026, the founder: "the user should click on the summary to see the summary"):
  // a message that is a call record ("Voice call · 0:43", then the recap; `callRecordText` in
  // source/shared/voice-call/voice-call-prompt.ts) is drawn as one quiet row that opens to the recap.
  "function __simeonCallRecordParse(n){if(typeof n!==\"string\")return null;const m=/^Voice call · (\\d{1,2}:\\d{2}(?::\\d{2})?)(?:\\n\\n([\\s\\S]+))?$/.exec(n.trim());return m==null?null:{duration:m[1],recap:m[2]==null?null:m[2].trim()}}",
  "function __simeonCallRecord(n){",
  "const c=__simeonCallRecordParse(n.content),[o,so]=S.useState(!1);if(c==null)return null;const has=c.recap!=null&&c.recap.length>0;",
  `return p.jsxs("div",{className:"simeon-call-record","data-open":o&&has?"true":"false",children:[p.jsxs("button",{type:"button",className:"simeon-call-record__head","aria-expanded":has?o:void 0,disabled:!has,onClick:()=>so(v=>!v),children:[p.jsx("span",{className:"simeon-call-record__glyph","aria-hidden":!0,children:p.jsx("svg",{viewBox:"0 0 24 24",children:p.jsx("path",{fill:"currentColor",d:"${PHONE_ICON_PATH}"})})}),p.jsxs("span",{className:"simeon-call-record__what",children:[p.jsx("b",{children:"Voice call"}),p.jsx("span",{children:c.duration})]}),has?p.jsx("svg",{className:"simeon-call-record__chevron",viewBox:"0 0 24 24","aria-hidden":!0,children:p.jsx("path",{fill:"none",stroke:"currentColor",strokeWidth:2.4,strokeLinecap:"round",strokeLinejoin:"round",d:"M9 6l6 6-6 6"})}):null]}),has?p.jsx("div",{className:"simeon-call-record__recap",children:p.jsx("div",{children:p.jsx("p",{children:c.recap})})}):null]})}`,
  // The call in the chat (2 October 2026, the founder: "the after chat is just a chat opened in a
  // panel like the convo between agents, this time its just between us"; 1 October 2026's second
  // pass: "i want things to behave the same way as it should behave when i text"). The host writes
  // one event entry where the call began, `{type:"voice-call", callId, status, seconds, lines}`
  // (host/extensions/transcript/voice-call-channel.ts); the window draws it as one line, "Voice chat
  // · 01:49" ("Voice chat · now" while the call is on), which opens the call in the window's own
  // read-only exchange panel. Calls a host wrote before that are messages with one peer,
  // `voice-call:<call>:<seconds>`, named for the person: they draw the same way.
  "function __simeonVoiceDuration(t){const w=Math.max(0,Math.round(Number(t)||0)),h=Math.floor(w/3600),mm=String(Math.floor(w%3600/60)).padStart(2,\"0\"),ss=String(w%60).padStart(2,\"0\");return h>0?`${h}:${mm}:${ss}`:`${mm}:${ss}`}",
  "function __simeonIsVoicePeer(n){const id=typeof n===\"string\"?n:n?.id;return typeof id===\"string\"&&id.startsWith(\"voice-call:\")}",
  // A call written before: the window's summary of its lines.
  "function __simeonVoiceCall(n){const ps=n==null?null:n.kind===\"single\"?[n.peer]:n.peers;if(!Array.isArray(ps)||ps.length!==1||ps[0]==null)return null;const m=/^voice-call:[A-Za-z0-9_-]+:(\\d+)$/.exec(String(ps[0].id));if(m==null)return null;return{peerId:ps[0].id,name:ps[0].name,duration:__simeonVoiceDuration(Number(m[1]))}}",
  // A call's own line: openable once it ended with something said.
  "function __simeonVoiceCallOfEvent(t){const v=t?.event;if(v==null||v.type!==\"voice-call\"||typeof v.callId!==\"string\")return null;const ended=v.status===\"ended\"&&typeof v.seconds===\"number\",said=Array.isArray(v.lines)&&v.lines.length>0;return{peerId:ended&&said?`voice-call:${v.callId}`:null,name:\"Voice chat\",duration:ended?__simeonVoiceDuration(v.seconds):null}}",
  // A call's lines never share a line with anything else: not with the agent's exchanges with
  // teammates ("8 messages with 2 agents"), not with another call.
  "function __simeonVoiceKey(t){const a=t?.fromAgent??t?.toAgent;return a!=null&&__simeonIsVoicePeer(a)?String(a.id):\"\"}",
  // Inside the call's panel the person is the person (the founder: "why not just use the real blue on
  // me talking??? on the right side, like a real normal convo"): their lines are their own messages,
  // the agent's are the agent's, and the header is the agent's own, not "Agent ⇄ <name>".
  "function __simeonTunnelEntries(n,id,self){if(!__simeonIsVoicePeer(id))return Uan(n,id,self);const ev=n.find(x=>x?.kind===\"event\"&&x.event?.type===\"voice-call\"&&`voice-call:${x.event.callId}`===id);if(ev!=null){const ls=Array.isArray(ev.event.lines)?ev.event.lines:[],at=typeof ev.timestampMs===\"number\"?ev.timestampMs:0;return ls.map((l,i)=>{const k=`${ev.id}:${i}`,c=typeof l?.text===\"string\"?l.text:\"\";return l?.speaker===\"agent\"?{kind:\"send-message\",id:k,message:{type:\"text\",content:c},author:self,timestampMs:at+i}:{kind:\"message\",id:k,role:\"user\",content:c,isStreaming:!1,timestampMs:at+i}})}return Uan(n,id,self).map(e=>e.kind===\"send-message\"&&e.author!=null&&__simeonIsVoicePeer(e.author)?{kind:\"message\",id:e.id,role:\"user\",content:e.message?.content??\"\",isStreaming:!1,...(e.timestampMs!=null?{timestampMs:e.timestampMs}:{})}:e)}",
  "function __simeonVoiceEvent(n){",
  "const c=n.call,{openAgentExchange:r}=r1(),l=c.duration!=null?`Voice chat · ${c.duration}`:\"Voice chat · now\",open=c.peerId!=null;",
  `return p.jsx(fre,{className:"sand-system-event",children:p.jsx(X4e,{...(open?{"aria-label":\`Open \${l}\`,onClick:m=>{m.stopPropagation(),r(c.peerId,c.name)}}:{}),leading:p.jsx("svg",{"aria-hidden":!0,className:"simeon-voice-event__glyph",viewBox:"0 0 24 24",children:p.jsx("path",{fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",d:"M5 10v4M9 7v10M13 9v6M17 6v12M21 10v4"})}),leadingGap:4,title:l,children:l})})}`,
  // The name sheet (1 October 2026): once, after onboarding, "What should your agents call you?",
  // offered Google's first name, never one made from the e-mail. Saved through the account's own
  // rename (`cursorAccount.updateName`, now `POST /desktop/api/user/name`). "Not now" asks again next launch.
  "function __simeonNameSheet(){",
  "const d=typeof window<\"u\"?window.desktop:void 0,a=d?.cursorAccount,[st,ss]=S.useState(\"idle\"),[v,sv]=S.useState(\"\"),[er,se]=S.useState(null),ip=S.useRef(null);",
  "S.useEffect(()=>{if(a?.getNamePrompt==null||a?.updateName==null)return;let l=!0,t=null;const look=()=>{Promise.all([a.getNamePrompt(),d.onboarding?.getSeen?.()]).then(([q,seen])=>{if(!l)return;if(q?.needed===!0&&seen===!0){sv(typeof q.suggested===\"string\"?q.suggested:\"\");ss(\"ask\");return}if(q?.needed===!0)t=setTimeout(look,4e3)},()=>{l&&(t=setTimeout(look,15e3))})};look();return()=>{l=!1;t!=null&&clearTimeout(t)}},[]);",
  "S.useEffect(()=>{st===\"ask\"&&setTimeout(()=>{ip.current?.focus();ip.current?.select()},60)},[st]);",
  "if(st!==\"ask\"&&st!==\"saving\")return null;",
  "const name=v.replace(/\\s+/g,\" \").trim(),ok=name.length>0&&name.length<=60&&st!==\"saving\";",
  "const save=()=>{if(!ok)return;ss(\"saving\");se(null);Promise.resolve(a.updateName(name)).then(()=>ss(\"done\"),()=>{ss(\"ask\");se(\"Couldn’t save your name. Try again.\")})};",
  `return p.jsx("div",{className:"simeon-name-sheet",role:"presentation",children:p.jsxs("form",{className:"simeon-name-sheet__card",role:"dialog","aria-modal":!0,"aria-labelledby":"simeon-name-sheet-title",onSubmit:e=>{e.preventDefault();save()},children:[p.jsx("h2",{id:"simeon-name-sheet-title",className:"simeon-name-sheet__title",children:"What should your agents call you?"}),p.jsx("p",{className:"simeon-name-sheet__note",children:"They’ll use it in chat and on calls. You can change it later."}),p.jsx("input",{ref:ip,id:"simeon-name-sheet-input",className:"simeon-name-sheet__input",type:"text",autoComplete:"given-name",maxLength:60,placeholder:"Your name",value:v,onChange:e=>sv(e.target.value),"aria-label":"Your name"}),er==null?null:p.jsx("p",{className:"simeon-name-sheet__error",role:"alert",children:er}),p.jsxs("div",{className:"simeon-name-sheet__actions",children:[p.jsx("button",{type:"button",className:"simeon-name-sheet__later",onClick:()=>ss("later"),children:"Not now"}),p.jsx("button",{type:"submit",className:"simeon-name-sheet__save",disabled:!ok,children:st==="saving"?"Saving…":"Continue"})]})]})})}`,
].join("");
const VOICE_COMPONENTS_ANCHOR = "function e3n(n){";
const VOICE_PICKER_BEFORE = 'let A;return e[21]!==E||e[22]!==v?(A=p.jsxs("div",{className:f,children:[v,E]}),e[21]=E,e[22]=v,e[23]=A):A=e[23],A}';
const VOICE_PICKER_AFTER = 'return p.jsxs("div",{className:f,children:[v,E,p.jsx(__simeonVoicePicker,{agentId:t.id},"simeon-voice")]})}';
const CALL_BUTTON_BEFORE = 'let B;e[97]!==N||e[98]!==E||e[99]!==A||e[100]!==I?(B=p.jsxs("div",{className:N,style:E,children:[A,I]}),e[97]=N,e[98]=E,e[99]=A,e[100]=I,e[101]=B):B=e[101];';
const CALL_BUTTON_AFTER = 'const B=p.jsxs("div",{className:N,style:E,children:[A,p.jsx(__simeonCallButton,{agentId:t.id,agentName:t.name,agentColor:Cee(t)},"simeon-call"),I]});';
const CALL_RECORD_BEFORE = 'p.jsx(JPn,{cachedLinkUrls:nMn,content:r,isStreaming:h,matcher:b,promoteStandaloneLinks:!1})';
const CALL_RECORD_AFTER = `(!h&&__simeonCallRecordParse(r)!=null?p.jsx(__simeonCallRecord,{content:r}):${CALL_RECORD_BEFORE})`;
const VOICE_EVENT_BEFORE = "function vpt(n){const e=he.c(9),{summary:t}=n;";
const VOICE_EVENT_AFTER = "function vpt(n){const __sv=__simeonVoiceCall(n.summary);if(__sv!=null)return p.jsx(__simeonVoiceEvent,{call:__sv});const e=he.c(9),{summary:t}=n;";
const VOICE_EVENT_TEXT_BEFORE = "function JIn(n){switch(n.kind){";
const VOICE_EVENT_TEXT_AFTER = "function JIn(n){const __sv=__simeonVoiceCall(n);if(__sv!=null)return`Voice chat · ${__sv.duration}`;switch(n.kind){";
const VOICE_PANEL_ENTRIES_BEFORE = "return Uan(u,v.id,De)},[v,u,O,t])";
const VOICE_PANEL_ENTRIES_AFTER = "return __simeonTunnelEntries(u,v.id,De)},[v,u,O,t])";
const VOICE_OWN_GROUP_BEFORE = 'for(const r of n){if(r.kind==="entry"&&VIn(r.entry)){t.push(r);continue}s(),e.push(r)}return s(),e}';
const VOICE_OWN_GROUP_AFTER = 'for(const r of n){if(r.kind==="entry"&&VIn(r.entry)){t.length>0&&__simeonVoiceKey(t[0].entry)!==__simeonVoiceKey(r.entry)&&s();t.push(r);continue}s(),e.push(r)}return s(),e}';
const VOICE_CALL_LINE_BEFORE = "function EIn(n){const e=he.c(4),{entry:t}=n;";
const VOICE_CALL_LINE_AFTER = "function EIn(n){const __sc=__simeonVoiceCallOfEvent(n.entry);if(__sc!=null)return p.jsx(__simeonVoiceEvent,{call:__sc});const e=he.c(4),{entry:t}=n;";
const VOICE_TUNNEL_HEADER_BEFORE = "exchange:l?null:e.tunnelExchange";
const VOICE_TUNNEL_HEADER_AFTER = "exchange:l||__simeonIsVoicePeer(e.tunnelPeer)?null:e.tunnelExchange";
const NAME_SHEET_BEFORE = 'p.jsx(BGn,{}),p.jsx(Yzn,{children:p.jsx($zn,{})})]';
const NAME_SHEET_AFTER = 'p.jsx(BGn,{}),p.jsx(Yzn,{children:p.jsx($zn,{})}),p.jsx(__simeonNameSheet,{},"simeon-name-sheet")]';
export const VOICE_CALL_REPLACEMENTS = Object.freeze([
  ["voice-call-components", VOICE_COMPONENTS_ANCHOR, `${VOICE_CALL_COMPONENTS_SOURCE}${VOICE_COMPONENTS_ANCHOR}`],
  ["call-record-card", CALL_RECORD_BEFORE, CALL_RECORD_AFTER],
  ["voice-chat-event", VOICE_EVENT_BEFORE, VOICE_EVENT_AFTER],
  ["voice-chat-event-text", VOICE_EVENT_TEXT_BEFORE, VOICE_EVENT_TEXT_AFTER],
  ["voice-call-line", VOICE_CALL_LINE_BEFORE, VOICE_CALL_LINE_AFTER],
  ["voice-chat-own-line", VOICE_OWN_GROUP_BEFORE, VOICE_OWN_GROUP_AFTER],
  ["voice-chat-person-is-person", VOICE_PANEL_ENTRIES_BEFORE, VOICE_PANEL_ENTRIES_AFTER],
  ["voice-chat-agent-header", VOICE_TUNNEL_HEADER_BEFORE, VOICE_TUNNEL_HEADER_AFTER],
  ["name-sheet-at-root", NAME_SHEET_BEFORE, NAME_SHEET_AFTER],
  ["voice-picker-under-character-color", VOICE_PICKER_BEFORE, VOICE_PICKER_AFTER],
  ["call-button-beside-agent-name", CALL_BUTTON_BEFORE, CALL_BUTTON_AFTER],
]);

export function patchOriginalVoiceCall(source) {
  let out = source;
  for (const [label, before, after] of VOICE_CALL_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const VOICE_CALL_MARKER = "/* Simeon: voice calls, the phone button and the voice picker";
/**
 * The phone button sits in the header card's identity row, right of the name
 * pill: the identity button is 52 pt of avatar, a 4 pt gap, then the 24 pt
 * pill (HEADER_CARD_CSS), so the button's top is 56 pt and it is 24 pt round,
 * in the pill's white glass with the chat's blue glyph. The row is drawn
 * as wide as the header, so it is shrunk to its content for the button's
 * \`left:100%\` to land beside the pill. A function, as the
 * blue is declared further down the file.
 */
export const voiceCallCss = () => `${VOICE_CALL_MARKER} (30 September 2026). */
.sand-chat-header__identity-row:has(>.simeon-call-button){position:relative;flex:0 0 auto!important;width:max-content!important;max-width:100%}
.simeon-call-button{position:absolute;left:100%;top:56px;margin-left:0;width:24px;height:24px;padding:0;display:grid;place-items:center;border-radius:999px;cursor:pointer;color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8);background:linear-gradient(180deg,light-dark(rgba(255,255,255,.92),rgba(255,255,255,.18)),light-dark(rgba(255,255,255,.72),rgba(255,255,255,.08)));-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);border:.5px solid light-dark(rgba(255,255,255,.9),rgba(255,255,255,.18));box-shadow:inset 0 1px 0 light-dark(#fff,rgba(255,255,255,.22)),0 0 0 .5px light-dark(rgba(20,20,40,.1),rgba(0,0,0,.45)),0 2px 8px -2px light-dark(rgba(20,20,40,.14),rgba(0,0,0,.5))}
.simeon-call-button:hover{color:light-dark(#1b4a7d,#a9ccf0)}
.simeon-call-button:focus-visible{outline:2px solid light-dark(rgba(37,90,147,.45),rgba(140,184,232,.55));outline-offset:2px}
.simeon-call-button>svg{width:13px;height:13px}
.simeon-voice-picker{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:6px}
.simeon-voice-picker__title{font-size:12px;line-height:16px;font-weight:600;color:var(--sand-text-secondary);padding:0 2px}
.simeon-voice-picker__note{font-size:12px;line-height:16px;color:var(--sand-text-secondary);padding:0 2px}
.simeon-voice-picker__row{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:center;gap:8px}
.simeon-voice-picker__select{appearance:none;-webkit-appearance:none;min-width:0;height:30px;padding:0 30px 0 11px;border:0;border-radius:8px;font:inherit;font-size:13px;color:var(--sand-text-primary);background-color:light-dark(#fff,rgba(255,255,255,.08));background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 16'%3E%3Cpath d='M2 6l3-3 3 3M2 10l3 3 3-3' fill='none' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:8px 13px;box-shadow:0 0 0 .5px light-dark(rgba(20,30,60,.14),rgba(255,255,255,.12)),0 1px 1px light-dark(rgba(20,30,60,.05),transparent);text-overflow:ellipsis;cursor:pointer}
.simeon-voice-picker__select:focus-visible{outline:2px solid light-dark(${USER_BUBBLE_LIGHT},#5b9be0);outline-offset:1px}
.simeon-voice-picker__play{width:30px;height:30px;padding:0;border:0;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:var(--sand-text-primary);background:light-dark(rgba(120,120,128,.12),rgba(120,120,128,.24))}
.simeon-voice-picker__play:disabled{opacity:.4;cursor:default}
.simeon-voice-picker__play>svg{width:12px;height:12px}
.simeon-voice-event__glyph{width:14px;height:14px;flex:none}
.simeon-call-record{display:grid;width:340px;max-width:100%}
.simeon-call-record__head{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;border-radius:12px;margin:-2px -6px;padding:2px 6px}
.simeon-call-record__head:disabled{cursor:default}
.simeon-call-record__head:focus-visible{outline:2px solid light-dark(${USER_BUBBLE_LIGHT},#5b9be0);outline-offset:1px}
.simeon-call-record__glyph{flex:none;width:30px;height:30px;border-radius:999px;display:grid;place-items:center;color:var(--sand-text-primary);background:light-dark(rgba(0,0,0,.06),rgba(255,255,255,.10))}
.simeon-call-record__glyph>svg{width:15px;height:15px}
.simeon-call-record__what{display:grid;gap:1px;flex:1;min-width:0}
.simeon-call-record__what>b{font-weight:600}
.simeon-call-record__what>span{font-size:13px;line-height:17px;color:var(--sand-text-secondary);font-variant-numeric:tabular-nums}
.simeon-call-record__chevron{flex:none;width:14px;height:14px;color:var(--sand-text-secondary);transition:transform .2s ease}
.simeon-call-record[data-open="true"] .simeon-call-record__chevron{transform:rotate(90deg)}
.simeon-call-record__recap{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease;width:0;min-width:100%}
.simeon-call-record[data-open="true"] .simeon-call-record__recap{grid-template-rows:1fr}
.simeon-call-record__recap>div{overflow:hidden}
.simeon-call-record__recap p{margin:8px 0 0;padding:8px 0 0 40px;border-top:1px solid light-dark(rgba(0,0,0,.08),rgba(255,255,255,.10))}
.simeon-name-sheet{position:fixed;inset:0;z-index:2147483000;-webkit-app-region:no-drag;display:grid;place-items:center;padding:16px;background:light-dark(rgba(0,0,0,.18),rgba(0,0,0,.45));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.simeon-name-sheet__card{width:min(360px,100%);display:grid;gap:10px;padding:22px;border-radius:18px;background:light-dark(#fff,#2a2a2c);color:var(--sand-text-primary);box-shadow:0 24px 60px rgba(0,0,0,.22),0 0 0 1px light-dark(rgba(0,0,0,.06),rgba(255,255,255,.08))}
.simeon-name-sheet__title{margin:0;font-size:17px;line-height:22px;font-weight:600}
.simeon-name-sheet__note{margin:0;font-size:13px;line-height:18px;color:var(--sand-text-secondary)}
.simeon-name-sheet__input{margin-top:4px;height:36px;padding:0 12px;border:0;border-radius:10px;font:inherit;font-size:15px;color:var(--sand-text-primary);background:light-dark(rgba(120,120,128,.12),rgba(120,120,128,.24));outline:none}
.simeon-name-sheet__input:focus-visible{box-shadow:0 0 0 2px light-dark(${USER_BUBBLE_LIGHT},#5b9be0)}
.simeon-name-sheet__error{margin:0;font-size:13px;color:light-dark(#c4302b,#ff6b63)}
.simeon-name-sheet__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.simeon-name-sheet__actions>button{height:32px;padding:0 14px;border:0;border-radius:999px;font:inherit;font-size:14px;cursor:pointer}
.simeon-name-sheet__later{background:transparent;color:var(--sand-text-secondary)}
.simeon-name-sheet__save{background:light-dark(#1d1d1f,#f5f5f7);color:light-dark(#fff,#1d1d1f);font-weight:600}
.simeon-name-sheet__save:disabled{opacity:.4;cursor:default}
@media (prefers-reduced-motion:reduce){.simeon-call-record__chevron,.simeon-call-record__recap{transition:none}}
`;

// The Manage plan card in Settings → Usage & Billing (6 October 2026): the
// upstream's page had one from its own dashboard calls, which Simeon never
// answered. Drawn from the usage summary's `managePlan` (the server's quota:
// the plan, when it resets, the next plan up) under the usage meters, with
// two buttons that open Stripe's Customer Portal in the browser through the
// account bridge: the confirmation of the next plan up, and the portal's
// front page for cards and invoices. Nothing without a plan on Stripe.
export const MANAGE_PLAN_COMPONENT_SOURCE = [
  "function __simeonManagePlan(){",
  "const d=typeof window<\"u\"?window.desktop:void 0,a=d?.cursorAccount,[s,ss]=S.useState(null),[busy,sb]=S.useState(null),[er,se]=S.useState(null);",
  "S.useEffect(()=>{if(a?.getUsageSummary==null)return;let l=!0;Promise.resolve(a.getUsageSummary()).then(v=>{l&&ss(v?.managePlan??null)},()=>{});return()=>{l=!1}},[a]);",
  "if(s==null||a?.openBillingPortal==null||d?.openExternal==null)return null;",
  "const open=req=>{if(busy!=null)return;sb(req.flow??\"manage\");se(null);Promise.resolve(a.openBillingPortal(req)).then(r=>{if(r?.ok===!0&&typeof r.url===\"string\")return d.openExternal(r.url);se(typeof r?.message===\"string\"?r.message:\"Couldn’t open billing. Try again.\")},()=>se(\"Couldn’t open billing. Try again.\")).finally(()=>sb(null))};",
  "const when=s.periodEndMs!=null?new Date(s.periodEndMs).toLocaleDateString(void 0,{month:\"short\",day:\"numeric\"}):null;",
  "const line=s.status===\"trialing\"?(when!=null?`Your trial ends on ${when}.`:\"Your trial is running.\"):when!=null?`Usage resets on ${when}.`:\"\";",
  `return p.jsxs("div",{className:"simeon-manage-plan",children:[p.jsx("h3",{className:"simeon-manage-plan__title",children:"Manage Plan"}),p.jsxs("div",{className:"simeon-manage-plan__card",children:[p.jsxs("div",{className:"simeon-manage-plan__row",children:[p.jsxs("div",{children:[p.jsx("div",{className:"simeon-manage-plan__name",children:\`Current plan: \${s.planName}\`}),p.jsx("div",{className:"simeon-manage-plan__sub",children:\`\${line}\${s.nextTier!=null?" Upgrade for more usage.":""}\`.trim()})]}),s.nextTier!=null?p.jsx("button",{type:"button",className:"simeon-manage-plan__btn",disabled:busy!=null,onClick:()=>open({flow:"update_confirm",tier:s.nextTier.tier}),children:busy==="update_confirm"?"Opening…":\`Upgrade to \${s.nextTier.label}\`}):null]}),p.jsxs("div",{className:"simeon-manage-plan__row",children:[p.jsx("div",{className:"simeon-manage-plan__name",children:"Manage billing on Stripe"}),p.jsx("button",{type:"button",className:"simeon-manage-plan__btn simeon-manage-plan__btn--quiet",disabled:busy!=null,onClick:()=>open({}),children:busy==="manage"?"Opening…":"Manage Billing ↗"})]}),er!=null?p.jsx("div",{className:"simeon-manage-plan__error",children:er}):null]})]})}`,
  "globalThis.__simeonManagePlan=__simeonManagePlan;",
].join("");
// The settings chunk has its own jsx alias and no React alias of its own to
// lean on, so it reaches the component through the global the main chunk
// sets; a window where the main chunk has not run yet draws nothing there.
const MANAGE_PLAN_PANEL_AFTER = 'Z=x==="usage"?a.jsx(Te,{children:a.jsx("div",{children:[a.jsx(Na,{},"usage"),a.jsx(globalThis.__simeonManagePlan??(()=>null),{},"simeon-manage-plan")]})}):null';
export const MANAGE_PLAN_REPLACEMENTS = Object.freeze([
  ["manage-plan-component", VOICE_COMPONENTS_ANCHOR, `${MANAGE_PLAN_COMPONENT_SOURCE}${VOICE_COMPONENTS_ANCHOR}`],
]);
export const MANAGE_PLAN_PANEL_REPLACEMENTS = Object.freeze([
  ["manage-plan-under-usage", USAGE_BEFORE, MANAGE_PLAN_PANEL_AFTER],
]);

export function patchOriginalManagePlan(source) {
  if (source.includes("function __simeonManagePlan(){")) throw new Error("Original renderer Manage plan component is already present.");
  let out = source;
  for (const [label, before, after] of MANAGE_PLAN_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export function patchOriginalManagePlanPanel(source) {
  let out = source;
  for (const [label, before, after] of MANAGE_PLAN_PANEL_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const MANAGE_PLAN_MARKER = "/* Simeon: the Manage plan card in Usage & Billing";
export const managePlanCss = () => `${MANAGE_PLAN_MARKER} (6 October 2026). The upstream's card, redrawn: a bordered card under the meters, the plan and its reset date, a black pill to upgrade, a quiet pill to Stripe. */
.simeon-manage-plan{margin-top:28px}
.simeon-manage-plan__title{margin:0 0 10px;font-size:15px;font-weight:400;opacity:.6}
.simeon-manage-plan__card{display:grid;gap:18px;padding:20px 22px;border:1px solid rgba(127,127,127,.28);border-radius:14px}
.simeon-manage-plan__row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.simeon-manage-plan__name{font-size:17px;line-height:1.3}
.simeon-manage-plan__sub{margin-top:3px;max-width:34em;font-size:15px;line-height:1.4;opacity:.6}
.simeon-manage-plan__btn{flex:none;height:40px;padding:0 18px;border:0;border-radius:99px;background:#000;color:#fff;font:inherit;font-size:15px;cursor:pointer;white-space:nowrap}
.simeon-manage-plan__btn:disabled{opacity:.6;cursor:default}
.simeon-manage-plan__btn--quiet{background:rgba(127,127,127,.16);color:inherit}
.simeon-manage-plan__error{color:#ef8585;font-size:14px}
@media (prefers-color-scheme:dark){.simeon-manage-plan__btn{background:#fff;color:#000}.simeon-manage-plan__btn--quiet{background:rgba(255,255,255,.14);color:inherit}}
`;
export function patchOriginalManagePlanStylesheet(css) {
  if (css.includes(MANAGE_PLAN_MARKER)) throw new Error("Original renderer Manage plan block is already present.");
  return `${css}\n${managePlanCss()}`;
}

export function patchOriginalVoiceCallStylesheet(css) {
  if (css.includes(VOICE_CALL_MARKER)) throw new Error("Original renderer voice-call block is already present.");
  return `${css}\n${voiceCallCss()}`;
}

/**
 * The agent's pane (1 October 2026, the founder: "the computer icon goes
 * away. so the [panel] appears when you click on the avatar … no
 * 'connected' … the choices on the picker are obviously avatar edit,
 * routines, computer, channels … the apple style … no accent color, keep it
 * simple and apple premium"). The window's own pane (`p3n`) kept three views
 * behind a gear and a back arrow: an overview (the computer's preview, the
 * routines, a link to Channels), Settings (avatar, name, title, description,
 * notifications) and Channels. It is now one page: the agent's avatar with
 * its pencil, the name and the title, then a segmented control, Profile ·
 * Routines · Computer · Channels, over the same views the window already
 * draws. Channels is offered only where the window would offer it (the
 * channel manifests are served). The gear is gone; the back arrow is left
 * for the one level that is deeper, a routine's editor. The chat header's
 * computer button is gone, and the avatar in the header opens and closes
 * the pane. The pane opens on Profile.
 *
 * View ids are the window's own: `settings` is Profile, `overview` is
 * Computer, `channels` is Channels; `routines` is new and admitted by `pin`,
 * the view guard. A request for a routine (`automationId`) lands on
 * Routines, where the editor opens.
 */
const PANE_ICONS = {
  // Line glyphs in the weight of SF Symbols' regular, on a 24 pt grid, stroked in the text colour.
  settings: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 19.6c1.3-3.4 4-5.2 7.2-5.2s5.9 1.8 7.2 5.2"/>',
  routines: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.1 2"/>',
  overview: '<rect x="3.2" y="4.4" width="17.6" height="12" rx="2.2"/><path d="M8.8 19.8h6.4M12 16.4v3.4"/>',
  channels: '<path d="M19.8 11.6c0 3.8-3.5 6.9-7.8 6.9-1 0-2-.2-2.9-.5l-4.4 1.4 1.3-3.5c-1.1-1.2-1.8-2.7-1.8-4.3 0-3.8 3.5-6.9 7.8-6.9s7.8 3.1 7.8 6.9z"/>',
};
const AGENT_PANE_COMPONENTS_SOURCE = [
  `const __simeonPaneIcons=${JSON.stringify(PANE_ICONS)};`,
  // Whether the pane, not the person, compacted the sidebar: kept across launches, so a pane left
  // open at quit still gives the sidebar back when it closes.
  "let __simeonPaneTookSidebar=(()=>{try{return localStorage.getItem(\"simeon.paneTookSidebar\")===\"1\"}catch{return!1}})();",
  "function __simeonSetPaneTookSidebar(v){__simeonPaneTookSidebar=v;try{localStorage.setItem(\"simeon.paneTookSidebar\",v?\"1\":\"0\")}catch{}}",
  // Three tabs (5 October 2026, the founder: "remove the channel icon in the app as well"): the Channels view stays in the code, reachable by a request, with no tab of its own.
  "function __simeonPaneSegments(n){const{value:v,onChange:c}=n,items=[[\"settings\",\"Profile\"],[\"routines\",\"Routines\"],[\"overview\",\"Computer\"]],at=Math.max(0,items.findIndex(x=>x[0]===v));",
  "return p.jsxs(\"div\",{className:\"simeon-segments\",role:\"tablist\",\"aria-label\":\"Agent\",style:{\"--simeon-seg-count\":items.length,\"--simeon-seg-index\":at},children:[p.jsx(\"span\",{className:\"simeon-segments__thumb\",\"aria-hidden\":!0}),...items.map(([id,label])=>p.jsx(yo,{content:label,children:p.jsx(\"button\",{type:\"button\",role:\"tab\",\"aria-selected\":id===v,\"aria-label\":label,\"data-segment\":id,className:\"simeon-segments__item\",onClick:()=>c(id),children:p.jsx(\"svg\",{viewBox:\"0 0 24 24\",\"aria-hidden\":!0,dangerouslySetInnerHTML:{__html:__simeonPaneIcons[id]}})})},id))]})}",
].join("");
const AGENT_PANE_ANCHOR = "function p3n(n){";
const AGENT_PANE_BODY_BEFORE = "p.jsx(Ar,{className:re(\"sand-info-pane__section-content\",\"sand-1iyjqo2 sand-s83m0k sand-dl72j9 sand-2lwn1j\"),ref:Y,children:F===\"overview\"?p.jsxs(\"div\",{className:\"sand-9f619 sand-78zum5 sand-dt5ytf sand-1v2ro7d sand-1nn3v0j sand-yfqnmn sand-1l90r2v sand-nm25rq sand-1iyjqo2 sand-s83m0k sand-dl72j9\",children:[l,b?p.jsx(z2n,{agent:t,onOpenAgentChat:f}):null,p.jsxs(\"div\",{className:{0:{className:\"sand-78zum5 sand-dt5ytf sand-17d4w8g\"},1:{className:\"sand-78zum5 sand-dt5ytf sand-17d4w8g sand-1iyjqo2 sand-s83m0k sand-dl72j9 sand-2lwn1j\"}}[!!Cmt(x)<<0].className,children:[N.length>0?p.jsxs(\"div\",{className:\"sand-78zum5 sand-6s0dn4 sand-1qughib sand-167g77z sand-mix8c7\",children:[p.jsx(\"span\",{className:re(\"sand-info-pane__section-heading\",Fe(FUe.sectionHeading,Us.medium).className),id:ye,children:\"Routines\"}),p.jsx(yo,{content:\"Create Routine\",children:p.jsx(fr,{\"aria-label\":\"Create Routine\",className:\"sand-info-pane__section-heading-action\",\"data-routine-row\":\"new\",icon:\"plus\",onClick:xe,size:\"sm\",style:FUe.sectionHeadingAction})})]}):null,p.jsx(K2n,{agentId:t.id,labelledBy:ye,onCreateRoutine:xe,onOpenRoutine:Ie=>_({kind:\"existing\",id:Ie})})]}),k.length>0?p.jsx(D2n,{counts:I,onOpenSection:J,sections:k}):null]}):p.jsxs(\"div\",{className:\"sand-9f619 sand-78zum5 sand-dt5ytf sand-1v2ro7d sand-1nn3v0j sand-yfqnmn sand-1l90r2v sand-nm25rq sand-1iyjqo2 sand-s83m0k sand-dl72j9\",\"aria-labelledby\":ve,id:ge,role:\"region\",children:[F===\"settings\"?p.jsx(h3n,{agent:t,onDescriptionChange:m,onNameChange:u,onTitleChange:d}):null,F===\"channels\"?p.jsx(_0n,{agentId:t.id,labelledBy:ve}):null]})})";
const AGENT_PANE_BODY_AFTER = 'p.jsx(Ar,{className:re("sand-info-pane__section-content","sand-1iyjqo2 sand-s83m0k sand-dl72j9 sand-2lwn1j"),ref:Y,children:p.jsxs("div",{className:"simeon-pane","data-segment":F,children:['
  + 'p.jsxs("div",{className:"simeon-pane__head",children:[p.jsx(f3n,{agent:t}),p.jsx("div",{className:"simeon-pane__name",children:t.name}),typeof t.title==="string"&&t.title.trim().length>0?p.jsx("div",{className:"simeon-pane__title",children:t.title}):null]}),'
  + 'p.jsx(__simeonPaneSegments,{value:F,onChange:J}),'
  + 'p.jsxs("div",{className:"simeon-pane__body",id:ge,role:"tabpanel",children:['
  + 'F==="settings"?p.jsx(h3n,{agent:t,onDescriptionChange:m,onNameChange:u,onTitleChange:d}):null,'
  + 'F==="routines"?p.jsxs("div",{className:"simeon-pane__routines",children:[p.jsx("span",{id:ye,hidden:!0,children:"Routines"}),N.length>0?p.jsx("div",{className:"simeon-pane__add",children:p.jsxs("button",{type:"button","data-routine-row":"new",onClick:xe,children:[p.jsx(bt,{name:"plus",size:"sm"}),"New Routine"]})}):null,p.jsx(K2n,{agentId:t.id,labelledBy:ye,onCreateRoutine:xe,onOpenRoutine:Ie=>_({kind:"existing",id:Ie})})]}):null,'
  + 'F==="overview"?p.jsxs("div",{className:"simeon-pane__computer",children:[l,b?p.jsx(z2n,{agent:t,onOpenAgentChat:f}):null]}):null,'
  + 'F==="channels"?p.jsx(_0n,{agentId:t.id,labelledBy:ve}):null]})]})})';
export const AGENT_PANE_REPLACEMENTS = Object.freeze([
  ["agent-pane-components", AGENT_PANE_ANCHOR, `${AGENT_PANE_COMPONENTS_SOURCE}${AGENT_PANE_ANCHOR}`],
  ["agent-pane-routines-view", 'function pin(n,e){return e==="overview"||e==="settings"||', 'function pin(n,e){return e==="overview"||e==="settings"||e==="routines"||'],
  ["agent-pane-opens-on-profile", '[P,J]=S.useState("overview")', '[P,J]=S.useState("settings")'],
  ["agent-pane-routine-request", 'J(r.section??"overview")', 'J(r.automationId!=null?"routines":r.section??"overview")'],
  ["agent-pane-routine-editor", 'F!=="overview"&&O!=null&&_(null);const z=F==="overview"?O:null', 'F!=="routines"&&O!=null&&_(null);const z=F==="routines"?O:null'],
  ["agent-pane-no-subpage-title", 'Ne=F!=="overview";', "Ne=!1;"],
  ["agent-pane-no-gear", "(Ie={onOpenSettings:fe},", "(Ie={},"],
  ["agent-pane-close-x", 'icon:"chevrons-right",iconSize:zwe,onClick:c,title:"Close details"', 'icon:"x",iconSize:zwe,onClick:c,title:"Close"'],
  ["agent-pane-avatar-toggles", 'n.isOpen&&n.view==="settings"?"close":"open-settings"', 'n.isOpen?"close":"open-settings"'],
  ["agent-pane-no-computer-button", "ne=!o||m?p.jsx(yo,{content:iSn", "ne=!1?p.jsx(yo,{content:iSn"],
  ["agent-pane-one-page", AGENT_PANE_BODY_BEFORE, AGENT_PANE_BODY_AFTER],
  // The sidebar steps back while the pane is open (1 October 2026, the founder: "whenever the right
  // panel open, the left message sidebar should minimize like in mobile, and come back to normal once
  // the right side is close"): opening the pane compacts an open sidebar to its avatar rail (the
  // window's own ⌘B state, through the same `WFe`, which draws it on the shell and returns the
  // layout to keep); closing it gives the sidebar back, unless the person compacted it themselves. Whether the pane fits, and how far the window grows for it, is reckoned with the
  // rail it is about to have.
  ["agent-pane-compacts-sidebar", 'setInfoPaneOpen:L=>{y||r.get().isOpen===L||(r.update(D=>({...D,isOpen:L})),N())}', 'setInfoPaneOpen:L=>{if(y||r.get().isOpen===L)return;r.update(D=>({...D,isOpen:L}));const __sb=s.get(),__sh=document.querySelector(".sand-shell"),__to=c=>__sh!=null?WFe(__sh,__sb,c,window.innerWidth):{...__sb,isCollapsed:c};if(L){__simeonSetPaneTookSidebar(!__sb.isCollapsed);__sb.isCollapsed||s.set(__to(!0))}else{__simeonPaneTookSidebar&&__sb.isCollapsed&&s.set(__to(!1));__simeonSetPaneTookSidebar(!1)}N()}'],
  ["agent-pane-fits-beside-the-rail", 'A=S.useCallback(()=>{let V=h||E.current!=null;if(!h){', 'A=S.useCallback(()=>{const __fit=uan({windowWidth:window.innerWidth,sidebar:{...m,isCollapsed:!0},paneWidth:u});let V=__fit||E.current!=null;if(!__fit){'],
  ["agent-pane-grows-beside-the-rail", 'G=dan({windowWidth:H,sidebar:m,paneWidth:u})', 'G=dan({windowWidth:H,sidebar:{...m,isCollapsed:!0},paneWidth:u})'],
]);

export function patchOriginalAgentPane(source) {
  let out = source;
  for (const [label, before, after] of AGENT_PANE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const AGENT_PANE_MARKER = "/* Simeon: the agent's pane, one page with a segmented control";
const PANE_FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif';
export const AGENT_PANE_CSS = `${AGENT_PANE_MARKER} (1 October 2026). Measured on the founder's reference: a 96 pt avatar circle with a hairline and a 32 pt pencil on its edge, a 22 pt name, a 36 pt pill of icon segments, rows of 40 pt icon tiles with 15 pt titles, and air between them. No boxes, no accent. */
.sand-agents-sidebar~.sand-info-pane,.sand-info-pane .sand-info-pane__inner{background-color:light-dark(#fbfbfd,#1c1c1e)!important}
.simeon-pane{--simeon-ink:light-dark(#1d1d1f,#f5f5f7);--simeon-ink-2:light-dark(#86868b,#98989d);--simeon-fill:light-dark(#f2f2f4,#2c2c2e);--simeon-fill-2:light-dark(#e8e8ed,#3a3a3c);--simeon-hairline:light-dark(rgba(0,0,0,.08),rgba(255,255,255,.1));--simeon-paper:light-dark(#fbfbfd,#1c1c1e);display:flex;flex-direction:column;padding:6px 20px 40px;font-family:${PANE_FONT};-webkit-font-smoothing:antialiased;color:var(--simeon-ink);letter-spacing:-.01em}
.simeon-pane__head{display:flex;flex-direction:column;align-items:center;padding:6px 0 0}
.simeon-pane__head .sand-avatar-trigger-row{width:100%!important;height:auto!important;justify-content:center!important}
.simeon-pane__head .sand-avatar-trigger{width:auto!important;height:auto!important}
.simeon-pane__head .sand-avatar-trigger__button{position:relative;width:96px!important;height:96px!important;padding:0!important;overflow:visible!important;border-radius:50%!important;background:none!important;box-shadow:none!important}
.simeon-pane__head .sand-avatar-trigger__button>span:first-child{display:flex!important;align-items:center;justify-content:center;width:96px!important;height:96px!important;border-radius:50%;overflow:hidden;background:light-dark(#ffffff,#2c2c2e);box-shadow:inset 0 0 0 1px var(--simeon-hairline)}
.simeon-pane__head .sand-simeon-mark-avatar,.simeon-pane__head .sand-simeon-mark-avatar>svg{width:68px!important;height:68px!important}
.simeon-pane__head .sand-avatar-trigger__button>span:first-child img{width:96px!important;height:96px!important;object-fit:cover}
.simeon-pane__head .sand-avatar-trigger__overlay{position:absolute!important;inset:auto -3px -3px auto!important;width:32px!important;height:32px!important;border-radius:50%!important;opacity:1!important;-webkit-mask-image:none!important;mask-image:none!important;background:var(--simeon-fill)!important;box-shadow:0 0 0 3px var(--simeon-paper)!important;display:block!important;transition:background-color .15s}
.simeon-pane__head .sand-avatar-trigger__overlay>*{display:none!important}
.simeon-pane__head .sand-avatar-trigger__overlay::after{content:"";position:absolute;inset:7px;background:var(--simeon-ink);-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M15.6 4.6a2.1 2.1 0 0 1 3 3L8.4 17.8l-4 1 1-4z'/><path d='M13.9 6.3l3 3'/></svg>") center/contain no-repeat;mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M15.6 4.6a2.1 2.1 0 0 1 3 3L8.4 17.8l-4 1 1-4z'/><path d='M13.9 6.3l3 3'/></svg>") center/contain no-repeat}
.simeon-pane__head .sand-avatar-trigger__button:hover .sand-avatar-trigger__overlay{background:var(--simeon-fill-2)!important}
.simeon-pane__name{margin-top:14px;font-size:22px;line-height:28px;font-weight:500;letter-spacing:-.022em;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.simeon-pane__title{margin-top:1px;font-size:15px;line-height:20px;color:var(--simeon-ink-2);text-align:center}
.simeon-segments{position:relative;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;height:36px;padding:3px;margin:32px 0 26px;border-radius:999px;background:var(--simeon-fill)}
.simeon-segments__thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / var(--simeon-seg-count));transform:translateX(calc(var(--simeon-seg-index) * 100%));border-radius:999px;background:light-dark(#ffffff,#636366);box-shadow:0 1px 2px rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.06);transition:transform .34s cubic-bezier(.32,.72,0,1)}
.simeon-segments>:not(.simeon-segments__thumb){position:relative;z-index:1}
.simeon-segments__item{display:flex;align-items:center;justify-content:center;width:100%;height:30px;appearance:none;border:0;margin:0;padding:0;background:none;border-radius:999px;color:light-dark(#6e6e73,#aeaeb2);cursor:default;outline:none;transition:color .2s}
.simeon-segments__item[aria-selected="true"]{color:var(--simeon-ink)}
.simeon-segments__item svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.simeon-segments__item:focus-visible{box-shadow:0 0 0 3px light-dark(rgba(0,0,0,.14),rgba(255,255,255,.24))}
.simeon-segments>*+*::before{content:"";position:absolute;left:0;top:50%;height:16px;margin-top:-8px;width:1px;background:light-dark(#d8d8dd,#48484a);transition:opacity .2s}
.simeon-segments__thumb+*::before{display:none}
.simeon-segments>:has(>[aria-selected="true"])::before,.simeon-segments>:has(>[aria-selected="true"])+*::before,.simeon-segments>[aria-selected="true"]::before,.simeon-segments>[aria-selected="true"]+*::before{opacity:0}
.simeon-pane__body{display:flex;flex-direction:column;gap:22px;font-size:15px;line-height:20px}
.simeon-pane__body .sand-agent-settings{gap:22px!important}
.simeon-pane__body .sand-agent-settings div:has(>.sand-avatar-trigger-row){display:none!important}
.simeon-pane__body .sand-agent-settings>div:first-child{display:flex!important;flex-direction:column!important;gap:0!important}
.simeon-pane__body .sand-agent-settings>div:first-child>div:not(:has(.sand-avatar-trigger-row)){margin:0!important;padding:14px 0 2px!important;font-size:13px!important;line-height:16px!important;font-weight:400!important;letter-spacing:0!important;color:var(--simeon-ink-2)!important}
.simeon-pane__body .sand-agent-settings>div:first-child>div:nth-child(2){padding-top:0!important}
.simeon-pane__body .sand-agent-settings>div:first-child>:is(input,textarea){margin:0!important;padding:4px 0 12px!important;min-height:0!important;border:0!important;border-bottom:1px solid var(--simeon-hairline)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;outline:none!important;font:inherit!important;font-size:15px!important;line-height:20px!important;color:var(--simeon-ink)!important}
.simeon-pane__body .sand-agent-settings>div:first-child>:is(input,textarea):focus{border-bottom-color:var(--simeon-ink)!important}
.simeon-pane__body .sand-agent-settings>div:first-child>textarea{resize:none!important;field-sizing:content;min-height:44px!important}
.simeon-pane__body .sand-agent-settings__card{padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important}
.simeon-pane__body .sand-agent-settings__row{display:grid!important;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:14px!important;padding:0!important}
.simeon-pane__body .sand-agent-settings__row::before{content:"";width:40px;height:40px;border-radius:11px;background:var(--simeon-fill) no-repeat center/20px;background-image:none;-webkit-mask:none}
.simeon-pane__body .sand-agent-settings__row::after{content:"";position:absolute;width:20px;height:20px;margin:10px;background:var(--simeon-ink);-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.5 1.6H4.7z'/><path d='M10 20.2a2.1 2.1 0 0 0 4 0'/></svg>") center/contain no-repeat;mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.5 1.6H4.7z'/><path d='M10 20.2a2.1 2.1 0 0 0 4 0'/></svg>") center/contain no-repeat;pointer-events:none}
.simeon-pane__body .sand-agent-settings__row{position:relative}
.simeon-pane__body .sand-agent-settings__row::after{left:0;top:50%;margin:-10px 0 0 10px}
.simeon-pane__body .sand-agent-settings__text>span:first-child{font-size:15px!important;line-height:20px!important;font-weight:500!important;color:var(--simeon-ink)!important}
.simeon-pane__body .sand-agent-settings__text>span+span{font-size:13px!important;line-height:17px!important;color:var(--simeon-ink-2)!important}
.simeon-pane__routines{display:flex;flex-direction:column;gap:6px}
.simeon-pane__routines .sand-routine__empty{margin:0!important;font-size:15px!important;line-height:21px!important;color:var(--simeon-ink-2)!important;text-align:center}
.simeon-pane__routines>div:has(>.sand-routine__empty){display:flex!important;flex-direction:column!important;align-items:center!important;gap:18px!important;padding:12px 8px 0!important}
.simeon-pane__routines>div:has(>.sand-routine__empty)::before{content:"";width:56px;height:56px;border-radius:15px;background:var(--simeon-fill)}
.simeon-pane__routines>div:has(>.sand-routine__empty)::after{content:"";position:absolute;width:26px;height:26px;margin-top:27px;background:var(--simeon-ink);-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='8.2'/><path d='M12 7.4V12l3.1 2'/></svg>") center/contain no-repeat;mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='8.2'/><path d='M12 7.4V12l3.1 2'/></svg>") center/contain no-repeat}
.simeon-pane__routines>div:has(>.sand-routine__empty){position:relative}
.simeon-pane__routines>div:has(>.sand-routine__empty)::after{top:12px;margin:15px 0 0}
.simeon-pane .sand-kit-button[data-routine-row="new"],.simeon-pane .sand-channel-row .sand-button{height:32px!important;padding:0 16px!important;border:0!important;border-radius:999px!important;background:var(--simeon-ink)!important;color:var(--simeon-paper)!important;box-shadow:none!important;font-size:14px!important;font-weight:500!important}
.simeon-pane .sand-channel-row .sand-button{height:28px!important;padding:0 13px!important;font-size:13px!important;background:var(--simeon-fill)!important;color:var(--simeon-ink)!important}
.simeon-pane__add{display:flex;justify-content:flex-end}
.simeon-pane__add button{display:inline-flex;align-items:center;gap:5px;appearance:none;border:0;background:none;padding:2px 0;font:inherit;font-size:14px;font-weight:500;color:var(--simeon-ink);cursor:default}
.simeon-pane__add button:hover{opacity:.65}
.simeon-pane__body .sand-channels-tab{display:flex;flex-direction:column;gap:18px}
.simeon-pane__body .sand-channels-tab>p span{font-size:13px!important;line-height:18px!important;color:var(--simeon-ink-2)!important}
.simeon-pane__body .sand-channels-tab ul{display:flex!important;flex-direction:column!important;gap:16px!important}
.simeon-pane__body .sand-channel-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important}
.simeon-pane__body .sand-channel-row>div:first-child{display:grid!important;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:14px!important;min-width:0}
.simeon-pane__body .sand-channel-row>div:first-child>span:first-child{width:40px!important;height:40px!important;border-radius:11px!important;background:var(--simeon-fill)!important;display:flex!important;align-items:center;justify-content:center}
.simeon-pane__body .sand-channel-row>div:first-child>span:first-child svg{width:20px;height:20px}
.simeon-pane__body .sand-channel-row>div:first-child>span:nth-child(2){gap:1px!important}
.simeon-pane__body .sand-channel-row>div:first-child>span:nth-child(2)>span:first-child{font-size:15px!important;line-height:20px!important;font-weight:500!important;color:var(--simeon-ink)!important}
.simeon-pane__body .sand-channel-row>div:first-child>span:nth-child(2)>span+span{font-size:13px!important;line-height:17px!important;color:var(--simeon-ink-2)!important;white-space:normal!important;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.simeon-pane__body .sand-channel-row>div+div{padding:0!important;margin:0!important}
.simeon-pane__computer{display:flex;flex-direction:column;gap:10px}
.simeon-pane__computer .sand-computer-preview{padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;gap:10px!important}
.simeon-pane__computer .sand-computer-preview__frame{border-radius:14px!important;background:var(--simeon-fill)!important;border:0!important;box-shadow:inset 0 0 0 1px var(--simeon-hairline)!important}
.simeon-pane__computer .sand-computer-stage__placeholder{background:transparent!important;box-shadow:none!important;font-size:14px}
.simeon-pane__computer .sand-computer-stage__retry{height:28px!important;padding:0 13px!important;border-radius:999px!important;background:var(--simeon-fill-2)!important;border:0!important;box-shadow:none!important;color:var(--simeon-ink)!important;font-size:13px!important;font-weight:500!important}
.simeon-pane__computer .sand-computer-preview>:last-child{font-size:13px!important;color:var(--simeon-ink-2)!important}
`;

/**
 * Every switch in the window is the main blue when on (1 October 2026, the
 * founder: "every single toggle get the main blue"): the person's bubble
 * blue in light, one step brighter in dark so it reads on the dark pane.
 * The knob stays white.
 */
export const SWITCH_BLUE_DARK = "#2f6db0";
export const SWITCH_BLUE_MARKER = "/* Simeon: every switch is the main blue when on";
export const switchBlueCss = () => `${SWITCH_BLUE_MARKER} (1 October 2026). */
[role="switch"][aria-checked="true"]:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background-color:light-dark(${USER_BUBBLE_LIGHT},${SWITCH_BLUE_DARK})!important;border-color:transparent!important}
[role="switch"][aria-checked="true"]:not(#\\#):not(#\\#):not(#\\#):not(#\\#)>span{background-color:#ffffff!important}
`;

/**
 * The agent asks the person to take over the computer (a SendMessage that
 * carries `boxRequestId`; the window's own card is `Hbn`). Redrawn the
 * Simeon way on 1 October 2026 ("can we design it differently, in our apple
 * design"): the Messages grey of every card, a white 44 pt computer tile, "Your turn on the
 * computer" over a quiet status with a pulsing blue dot while it waits, the
 * agent's instruction in 15 pt, the screen's snapshot when the box sent one,
 * then a blue Take over pill beside a grey I'm done, and Skip as a quiet
 * link. Once settled the card says what happened (Done, Answered, Skipped)
 * and offers Open computer. The window's handlers are the same ones.
 */
const HANDOFF_DISPLAY_ICON = '<rect x="3.2" y="4.4" width="17.6" height="12" rx="2.2"/><path d="M8.8 19.8h6.4M12 16.4v3.4"/>';
const HANDOFF_CARD_SOURCE = [
  `function __simeonHandoffCard(n){const{instruction:t,status:s,snapshotDataUrl:r,onOpen:o,onHandBack:hb,onDismiss:ds}=n,w=s==="waiting",done={handed_back:"Done",replied:"Answered",dismissed:"Skipped"}[s]??"Done",txt=typeof t==="string"?t.trim():"";`,
  `return p.jsxs("article",{className:"simeon-handoff","data-status":s,"aria-label":w?"Your turn on the computer":"Computer",children:[`,
  `p.jsxs("div",{className:"simeon-handoff__head",children:[p.jsx("span",{className:"simeon-handoff__tile","aria-hidden":!0,children:p.jsx("svg",{viewBox:"0 0 24 24",dangerouslySetInnerHTML:{__html:${JSON.stringify(HANDOFF_DISPLAY_ICON)}}})}),`,
  `p.jsxs("div",{className:"simeon-handoff__titles",children:[p.jsx("div",{className:"simeon-handoff__title",children:w?"Your turn on the computer":"Computer"}),p.jsxs("div",{className:"simeon-handoff__status",role:"status",children:[p.jsx("span",{className:"simeon-handoff__dot","aria-hidden":!0}),w?"Waiting for you":done]})]})]}),`,
  `txt.length>0?p.jsx("p",{className:"simeon-handoff__text",children:txt}):null,`,
  `w&&r!=null?p.jsx("button",{type:"button",className:"simeon-handoff__screen",onClick:o,"aria-label":"Take over the computer",children:p.jsx("img",{src:r,alt:"",draggable:!1})}):null,`,
  `w?p.jsxs("div",{className:"simeon-handoff__actions",children:[p.jsx("button",{type:"button",className:"simeon-handoff__primary",onClick:o,children:"Take over"}),p.jsx("button",{type:"button",className:"simeon-handoff__secondary",onClick:hb,children:"I’m done"}),p.jsx("button",{type:"button",className:"simeon-handoff__skip",onClick:ds,title:"Cancel this request without doing the step; the agent continues without it",children:"Skip"})]}):p.jsx("div",{className:"simeon-handoff__actions simeon-handoff__actions--settled",children:p.jsx("button",{type:"button",className:"simeon-handoff__secondary",onClick:o,children:"Open computer"})})]})}`,
].join("");
const HANDOFF_BEFORE = "function Hbn(n){const e=he.c(47),{instruction:t,status:s,snapshotDataUrl:r,onOpen:i,onHandBack:o,onDismiss:l}=n,";
const HANDOFF_AFTER = `${HANDOFF_CARD_SOURCE}function Hbn(n){return p.jsx(__simeonHandoffCard,{...n})}function __simeonHbnOriginal(n){const e=he.c(47),{instruction:t,status:s,snapshotDataUrl:r,onOpen:i,onHandBack:o,onDismiss:l}=n,`;
export const HANDOFF_REPLACEMENTS = Object.freeze([["handoff-card", HANDOFF_BEFORE, HANDOFF_AFTER]]);

export function patchOriginalHandoff(source) {
  let out = source;
  for (const [label, before, after] of HANDOFF_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const HANDOFF_MARKER = "/* Simeon: the take-over card";
export const handoffCss = () => `${HANDOFF_MARKER} (1 October 2026). */
.simeon-handoff{--h-ink:light-dark(#1d1d1f,#f5f5f7);--h-ink-2:light-dark(#6e6e73,#98989d);--h-fill:light-dark(#ffffff,#3a3a3c);--h-blue:light-dark(${USER_BUBBLE_LIGHT},${SWITCH_BLUE_DARK});box-sizing:border-box;width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:20px;background:light-dark(${AGENT_BUBBLE_LIGHT},#2c2c2e)!important;box-shadow:none;font-family:${PANE_FONT};-webkit-font-smoothing:antialiased;color:var(--h-ink);letter-spacing:-.01em}
.simeon-handoff__head{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:12px}
.simeon-handoff__tile{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:var(--h-fill)}
.simeon-handoff__tile svg{width:22px;height:22px;fill:none;stroke:var(--h-ink);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.simeon-handoff__title{font-size:15px;line-height:20px;font-weight:600}
.simeon-handoff__status{display:flex;align-items:center;gap:6px;margin-top:1px;font-size:13px;line-height:17px;color:var(--h-ink-2)}
.simeon-handoff__dot{width:7px;height:7px;border-radius:50%;background:var(--h-ink-2)}
.simeon-handoff[data-status="waiting"] .simeon-handoff__dot{background:var(--h-blue);animation:simeon-handoff-pulse 1.8s ease-in-out infinite}
@keyframes simeon-handoff-pulse{0%,100%{box-shadow:0 0 0 0 light-dark(rgba(37,90,147,.35),rgba(47,109,176,.45))}50%{box-shadow:0 0 0 5px rgba(37,90,147,0)}}
.simeon-handoff__text{margin:0;font-size:15px;line-height:21px;white-space:pre-wrap}
.simeon-handoff:not([data-status="waiting"]) .simeon-handoff__text{color:var(--h-ink-2)}
.simeon-handoff__screen{display:block;width:100%;aspect-ratio:16/10;padding:0;border:0;border-radius:12px;overflow:hidden;background:var(--h-fill);box-shadow:inset 0 0 0 1px light-dark(rgba(0,0,0,.06),rgba(255,255,255,.08));cursor:default}
.simeon-handoff__screen img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.simeon-handoff__screen:hover img{transform:scale(1.02)}
.simeon-handoff__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.simeon-handoff__actions button{appearance:none;border:0;margin:0;font:inherit;cursor:default;outline:none}
.simeon-handoff__primary,.simeon-handoff__secondary{height:36px;padding:0 16px;border-radius:999px;font-size:15px!important;font-weight:500!important;transition:filter .15s,background-color .15s}
.simeon-handoff__primary{background:var(--h-blue);color:#ffffff}
.simeon-handoff__primary:hover{filter:brightness(1.08)}
.simeon-handoff__secondary{background:var(--h-fill);color:var(--h-ink)}
.simeon-handoff__secondary:hover{background:light-dark(#f5f5f7,#48484a)}
.simeon-handoff__skip{grid-column:1/-1;justify-self:center;height:24px;padding:0 8px;background:none;color:var(--h-ink-2);font-size:13px!important}
.simeon-handoff__skip:hover{color:var(--h-ink)}
.simeon-handoff__actions button:focus-visible{box-shadow:0 0 0 3px light-dark(rgba(37,90,147,.3),rgba(47,109,176,.45))}
.simeon-handoff__actions--settled{display:flex}
`;

export function patchOriginalHandoffStylesheet(css) {
  if (css.includes(HANDOFF_MARKER) || css.includes(SWITCH_BLUE_MARKER)) throw new Error("Original renderer take-over card or switch block is already present.");
  return `${css}\n${switchBlueCss()}${handoffCss()}`;
}

/**
 * Flight results (2 October 2026; the founder: "Design it exactly like muse.
 * Make ours match our design. Premium please", then "apple doesnt have
 * constant bold, apple is premium"). An agent's message whose whole text is
 * one ```simeon-flights block of JSON is drawn as a results card, and a row
 * opens that offer in a panel on the right that the chat steps aside for.
 *
 * The card is an Apple list: a quiet route line over the date and terms,
 * then one row per offer, the times as the row's title, the airline, time
 * in the air and stops under it in grey, then every connection airport with
 * its layover on a line of its own (Muse's rule: no row hides its layovers),
 * the price trailing, and a chevron.
 * Weight comes from size and grey, not bold: regular throughout, medium
 * only for the route line.
 *
 * The panel is described below, where it is drawn. The text stays the
 * message's own, so an older window and the phone still show it.
 *
 *   {"title":"Seattle to Los Angeles","subtitle":"Fri, Oct 2 · Refundable · 1 adult",
 *    "offers":[{"airline":"American Airlines","logo":"https://…/AA.svg",
 *     "price":"$361.20","priceNote":"1 adult · Economy · One way","date":"Fri, Oct 2",
 *     "from":"SEA","fromCity":"Seattle","to":"LAX","toCity":"Los Angeles",
 *     "depart":"6:00 AM","arrive":"12:18 PM","duration":"6h 18m","stops":"1 stop · PHX 1h 38m",
 *     "refundable":"Full refund","changeable":"Not stated","bags":"1 carry-on",
 *     "label":"Cheapest",
 *     "legs":[{"from":"SEA","fromCity":"Seattle","to":"PHX","toCity":"Phoenix",
 *       "depart":"6:00 AM","arrive":"9:10 AM","flight":"AA 3792",
 *       "carrier":"American Airlines","logo":"https://…","cabin":"Economy",
 *       "duration":"3h 10m","layover":"1h 38m in Phoenix"}, …]}]}
 *
 * A row opens the offer in the agent's own pane (2 October 2026, the founder:
 * "you see the right panel? should be one … the main right panel is when you
 * click on avatar … re-design the flight panel, same size as avatar panel,
 * same color"): the pane draws the flight in place of the profile page, in
 * the profile's own type and layout, and its close, its width, the sidebar
 * stepping back and the chat making room are all the pane's. Closing it
 * forgets the flight. A round trip's return legs say so in their heading,
 * and its row in the card says when the flight back leaves.
 */
const FLIGHT_CHEVRON = '<path d="M9.5 6.5 15 12l-5.5 5.5"/>';
const FLIGHTS_SOURCE = [
  "function __simeonFlightsParse(n){if(typeof n!==\"string\")return null;const m=/^```simeon-flights[^\\n]*\\n([\\s\\S]*?)\\n?```$/.exec(n.trim());if(m==null)return null;try{const d=JSON.parse(m[1]);if(d==null||!Array.isArray(d.offers)||d.offers.length===0)return null;const s=v=>typeof v===\"string\"?v.trim():\"\";",
  "const leg=l=>({from:s(l.from),fromCity:s(l.fromCity),to:s(l.to),toCity:s(l.toCity),depart:s(l.depart),arrive:s(l.arrive),flight:s(l.flight),carrier:s(l.carrier),logo:s(l.logo),cabin:s(l.cabin),duration:s(l.duration),layover:s(l.layover),heading:s(l.heading),departDay:s(l.departDay),arriveDay:s(l.arriveDay)});",
  "return{title:s(d.title),subtitle:s(d.subtitle),offers:d.offers.filter(o=>o!=null&&typeof o===\"object\").slice(0,8).map(o=>({airline:s(o.airline),logo:s(o.logo),price:s(o.price),priceNote:s(o.priceNote),date:s(o.date),from:s(o.from),fromCity:s(o.fromCity),to:s(o.to),toCity:s(o.toCity),depart:s(o.depart),arrive:s(o.arrive),duration:s(o.duration),stops:s(o.stops),refundable:s(o.refundable),changeable:s(o.changeable),bags:s(o.bags),returnTimes:s(o.returnTimes),legs:Array.isArray(o.legs)?o.legs.filter(l=>l!=null&&typeof l===\"object\").map(leg):[],raw:o}))}}catch{return null}}",
  "function __simeonInitials(n){const w=String(n||\"\").split(/\\s+/).filter(x=>x&&!/^(airlines?|airways|air)$/i.test(x));return(w.length>1?w[0][0]+w[1][0]:String(w[0]||\"?\").slice(0,2)).toUpperCase()}",
  "function __simeonAirlineMark(n){const[f,sf]=S.useState(!1),u=n.logo;return p.jsx(\"span\",{className:`simeon-flight-mark simeon-flight-mark--${n.size||\"row\"}`,\"aria-hidden\":!0,children:u&&!f?p.jsx(\"img\",{src:u,alt:\"\",draggable:!1,onError:()=>sf(!0)}):p.jsx(\"span\",{className:\"simeon-flight-mark__initials\",children:__simeonInitials(n.name)})})}",
  "function __simeonIcon(n){return p.jsx(\"svg\",{viewBox:\"0 0 24 24\",\"aria-hidden\":!0,className:n.className,dangerouslySetInnerHTML:{__html:n.d}})}",
  // One right-hand panel (2 October 2026, the founder: "the right panel? should be one … the
  // main right panel is when you click on avatar"). A flight opens in the agent's own pane, in its
  // place of the profile, and the pane's own close, sidebar and chat layout serve it. Which flight
  // is open is one value the card and the pane both read.
  "let __simeonFlightOpen=null,__simeonPaneSetOpen=null;const __simeonFlightSubs=new Set();",
  "function __simeonSetFlight(v){if(__simeonFlightOpen===v)return;__simeonFlightOpen=v;for(const f of __simeonFlightSubs)f()}",
  "function __simeonUseFlight(agentId){const[,bump]=S.useReducer(x=>x+1,0);S.useEffect(()=>{__simeonFlightSubs.add(bump);return()=>{__simeonFlightSubs.delete(bump)}},[]);const f=__simeonFlightOpen;if(f==null||agentId==null)return f;if(f.agentId==null)f.agentId=agentId;return f.agentId===agentId?f:null}",
  "function __simeonOpenFlight(key,offer){if(__simeonFlightOpen?.key===key){__simeonPaneSetOpen?.(!1);__simeonSetFlight(null);return}__simeonSetFlight({key,offer});__simeonPaneSetOpen?.(!0)}",
  "function __simeonFlights(n){const d=__simeonFlightsParse(n.content),fo=__simeonUseFlight();",
  "if(d==null)return null;const base=`${n.content.length}:${n.content.slice(-64)}`;",
  "return p.jsxs(\"section\",{className:\"simeon-flights\",\"aria-label\":d.title||\"Flights\",children:[d.title||d.subtitle?p.jsxs(\"header\",{className:\"simeon-flights__head\",children:[d.title?p.jsx(\"h3\",{children:d.title}):null,d.subtitle?p.jsx(\"p\",{children:d.subtitle}):null]}):null,",
  "p.jsx(\"ul\",{className:\"simeon-flights__list\",children:d.offers.map((f,i)=>{const k=`${base}:${i}`;return p.jsx(\"li\",{children:p.jsxs(\"button\",{type:\"button\",className:\"simeon-flights__row\",\"aria-pressed\":fo?.key===k,onClick:()=>__simeonOpenFlight(k,f),children:[p.jsx(__simeonAirlineMark,{logo:f.logo,name:f.airline}),",
  "p.jsxs(\"span\",{className:\"simeon-flights__body\",children:[p.jsx(\"span\",{className:\"simeon-flights__times\",children:[f.depart,f.arrive].filter(Boolean).join(\" – \")}),p.jsx(\"span\",{className:\"simeon-flights__meta\",children:[f.airline,f.duration,f.stops.split(\" · \")[0]].filter(Boolean).join(\" · \")}),f.stops.includes(\" · \")?p.jsx(\"span\",{className:\"simeon-flights__meta\",children:`${f.stops.slice(f.stops.indexOf(\" · \")+3)} layover`}):null,f.returnTimes?p.jsx(\"span\",{className:\"simeon-flights__meta\",children:f.returnTimes}):null]}),",
  "p.jsx(\"span\",{className:\"simeon-flights__price\",children:f.price}),p.jsx(__simeonIcon,{className:\"simeon-flights__chevron\",d:" + JSON.stringify(FLIGHT_CHEVRON) + "})]})},i)})})]})}",
  // The flight, drawn as the pane draws a profile: a centred head (the airline's mark where the
  // avatar sits, the route as the name, the date, stops and time in the air as the title), then
  // groups under 13 pt grey labels, rows of a 15 pt label and its value, hairlines between.
  "function __simeonFlightRow(k,v,sub){return v?p.jsxs(\"div\",{className:\"simeon-flight-pane__row\",children:[p.jsx(\"span\",{children:k}),p.jsxs(\"span\",{className:\"simeon-flight-pane__value\",children:[v,sub?p.jsx(\"small\",{children:sub}):null]})]},k):null}",
  "function __simeonFlightDetails(n){const o=n.offer,first=o.legs[0],last=o.legs[o.legs.length-1],from=o.from||first?.from||\"\",to=o.to||last?.to||\"\";",
  "const when=(d,t)=>[d,t].filter(Boolean).join(\" · \"),row=__simeonFlightRow;",
  "return p.jsxs(\"div\",{className:\"simeon-pane simeon-flight-pane\",children:[p.jsxs(\"div\",{className:\"simeon-flight-pane__head\",children:[p.jsx(__simeonAirlineMark,{logo:o.logo,name:o.airline,size:\"hero\"}),p.jsx(\"div\",{className:\"simeon-pane__name\",children:`${from} → ${to}`}),p.jsx(\"div\",{className:\"simeon-pane__title\",children:[o.date,o.duration,o.stops.split(\" · \")[0]].filter(Boolean).join(\" · \")})]}),",
  "p.jsxs(\"div\",{className:\"simeon-flight-pane__body\",children:[o.price?p.jsxs(\"section\",{children:[p.jsx(\"h4\",{children:\"Price\"}),row(\"Total\",o.price,o.priceNote)]}):null,",
  "...o.legs.map((l,i)=>p.jsxs(\"section\",{children:[p.jsx(\"h4\",{children:[l.heading,`${l.from} → ${l.to}`].filter(Boolean).join(\" · \")}),row(\"Departs\",when(l.departDay,l.depart)),row(\"Arrives\",when(l.arriveDay,l.arrive)),row(\"Flight\",[l.flight,l.carrier&&l.carrier!==o.airline?l.carrier:\"\"].filter(Boolean).join(\" · \")),row(\"Cabin\",l.cabin),row(\"Time in the air\",l.duration),",
  "l.layover&&i<o.legs.length-1?p.jsx(\"p\",{className:\"simeon-flight-pane__note\",children:`${l.layover.replace(/ in /,\" layover in \")}`}):null]},`l${i}`)),",
  "o.refundable||o.changeable||o.bags?p.jsxs(\"section\",{children:[p.jsx(\"h4\",{children:\"Fare\"}),row(\"Cancellation\",o.refundable),row(\"Changes\",o.changeable),row(\"Bags\",o.bags)]}):null]})]})}",
].join("");
const FLIGHTS_COMPONENTS_ANCHOR = "function __simeonHandoffCard(n){";
const FLIGHTS_MESSAGE_BEFORE = CALL_RECORD_AFTER;
const FLIGHTS_MESSAGE_AFTER = `(!h&&__simeonFlightsParse(r)!=null?p.jsx(__simeonFlights,{content:r}):${CALL_RECORD_AFTER})`;
export const FLIGHTS_REPLACEMENTS = Object.freeze([
  ["flights-components", FLIGHTS_COMPONENTS_ANCHOR, `${FLIGHTS_SOURCE}${FLIGHTS_COMPONENTS_ANCHOR}`],
  ["flights-message", FLIGHTS_MESSAGE_BEFORE, FLIGHTS_MESSAGE_AFTER],
  // The pane's own opener, so a flight row opens the one right-hand panel; closing it forgets the
  // flight, so the avatar opens the profile again.
  ["flights-pane-opener", "setInfoPaneOpen:L=>{if(y||r.get().isOpen===L)return;", "setInfoPaneOpen:__simeonPaneSetOpen=L=>{L||__simeonSetFlight(null);if(y||r.get().isOpen===L)return;"],
  // The pane reads which flight is open, for this agent…
  ["flights-pane-reads", "function p3n(n){", "function p3n(n){const __fo=__simeonUseFlight(n.agent?.id);"],
  // …and draws it in place of the profile page.
  ["flights-pane-body", 'ref:Y,children:p.jsxs("div",{className:"simeon-pane","data-segment":F,children:[', 'ref:Y,children:__fo!=null?p.jsx(__simeonFlightDetails,{offer:__fo.offer}):p.jsxs("div",{className:"simeon-pane","data-segment":F,children:['],
]);

/** Runs after the voice-call and take-over patches: it wraps the one and sits beside the other. */
export function patchOriginalFlights(source) {
  let out = source;
  for (const [label, before, after] of FLIGHTS_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const FLIGHTS_MARKER = "/* Simeon: flight results";
/**
 * Type on Apple's scale, SF at 400 with 500 for the few titles: 15 pt rows
 * over 13 pt grey, a 17 pt route over the panel, 13 pt leg details. Greys
 * are the system's (label, secondary, tertiary, separator, grouped fill);
 * the one colour is the window's blue, on the focus ring. Rows separate with hairlines inset past the mark, the selected
 * row takes the system fill. The flight itself is drawn in the agent's pane
 * with the pane's own tokens (`AGENT_PANE_CSS`).
 */
export const flightsCss = () => `${FLIGHTS_MARKER} (2 October 2026). */
.simeon-flights{--f-ink:light-dark(#1d1d1f,#f5f5f7);--f-ink-2:light-dark(#86868b,#98989d);--f-ink-3:light-dark(#c7c7cc,#48484a);--f-line:light-dark(rgba(60,60,67,.14),rgba(84,84,88,.5));--f-group:light-dark(#ffffff,#2c2c2e);--f-ground:light-dark(#f5f5f7,#1c1c1e);--f-panel:light-dark(#f5f5f7,#1c1c1e);--f-fill:light-dark(rgba(120,120,128,.1),rgba(120,120,128,.24));--f-blue:light-dark(${USER_BUBBLE_LIGHT},${SWITCH_BLUE_DARK});font-family:${PANE_FONT};font-weight:400;color:var(--f-ink);-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 1}
.simeon-flights{box-sizing:border-box;width:min(420px,100%);min-width:0}
.simeon-flights__head{padding:2px 0 8px}
.simeon-flights__head h3{margin:0;font-size:15px;line-height:20px;font-weight:500;letter-spacing:-.01em}
.simeon-flights__head p{margin:1px 0 0;font-size:13px;line-height:18px;color:var(--f-ink-2)}
.simeon-flights__list{list-style:none;margin:0 -10px;padding:0}
.simeon-flights__list li{position:relative}
.simeon-flights__list li+li::before{content:"";position:absolute;top:0;left:58px;right:10px;height:.5px;background:var(--f-line)}
.simeon-flights__row{appearance:none;display:grid;grid-template-columns:36px minmax(0,1fr) auto 12px;align-items:center;column-gap:12px;width:100%;margin:0;padding:10px;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:default;transition:background-color .2s}
.simeon-flights__list li:hover+li::before,.simeon-flights__list li:has(.simeon-flights__row:hover)::before,.simeon-flights__list li:has([aria-pressed="true"])::before,.simeon-flights__list li:has([aria-pressed="true"])+li::before{opacity:0}
.simeon-flights__row:hover{background:var(--f-fill)}
.simeon-flights__row[aria-pressed="true"]{background:var(--f-fill)}
.simeon-flights__row:focus-visible{outline:none;box-shadow:0 0 0 3px light-dark(rgba(37,90,147,.28),rgba(47,109,176,.45))}
.simeon-flights__body{display:flex;flex-direction:column;gap:1px;min-width:0}
.simeon-flights__times{font-size:15px;line-height:20px;letter-spacing:-.01em;white-space:nowrap}
.simeon-flights__meta{font-size:13px;line-height:18px;color:var(--f-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.simeon-flights__price{font-size:15px;line-height:20px;letter-spacing:-.01em;white-space:nowrap}
.simeon-flights__chevron{width:12px;height:12px;fill:none;stroke:var(--f-ink-3);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.simeon-flight-mark{flex:none;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#ffffff;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12);overflow:hidden}
.simeon-flight-mark img{object-fit:contain;display:block}
.simeon-flight-mark__initials{font-weight:500;color:#6e6e73}
.simeon-flight-mark--row{width:36px;height:36px}.simeon-flight-mark--row img{width:22px;height:22px}.simeon-flight-mark--row .simeon-flight-mark__initials{font-size:12px}
.simeon-flight-mark--small{width:24px;height:24px}.simeon-flight-mark--small img{width:15px;height:15px}.simeon-flight-mark--small .simeon-flight-mark__initials{font-size:9px}
.simeon-flight-mark--tiny{width:20px;height:20px}.simeon-flight-mark--tiny img{width:13px;height:13px}.simeon-flight-mark--tiny .simeon-flight-mark__initials{font-size:8px}
.simeon-flight-mark--hero{width:72px;height:72px;box-shadow:inset 0 0 0 1px var(--simeon-hairline,rgba(0,0,0,.08))}.simeon-flight-mark--hero img{width:42px;height:42px}.simeon-flight-mark--hero .simeon-flight-mark__initials{font-size:20px}
.simeon-flight-pane__head{display:flex;flex-direction:column;align-items:center;padding:12px 0 0}
.simeon-flight-pane__head .simeon-pane__name{margin-top:14px}
.simeon-flight-pane__body{display:flex;flex-direction:column;gap:22px;margin-top:30px}
.simeon-flight-pane__body h4{margin:0 0 2px;font-size:13px;line-height:16px;font-weight:400;letter-spacing:0;color:var(--simeon-ink-2)}
.simeon-flight-pane__row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:.5px solid var(--simeon-hairline);font-size:15px;line-height:20px}
.simeon-flight-pane__value{display:flex;flex-direction:column;align-items:flex-end;text-align:right;color:var(--simeon-ink-2)}
.simeon-flight-pane__value small{font-size:13px;line-height:18px}
.simeon-flight-pane__note{margin:10px 0 0;font-size:13px;line-height:18px;color:var(--simeon-ink-2)}
`;

export function patchOriginalFlightsStylesheet(css) {
  if (css.includes(FLIGHTS_MARKER)) throw new Error("Original renderer flight results block is already present.");
  return `${css}\n${flightsCss()}`;
}

/**
 * "Your Personal Chief of Staff", the welcome step after "Meet Simeon" (3
 * October 2026, the founder: "an animated very apple like, very premium thing
 * that says that simeon is your personal COO and that he staffs agents for
 * whatever
 * job you need done … agents coming out of simeon, and simeon at the
 * center … minimalist … inheriting our existing design").
 *
 * It is a real step of the window's own flow (`Gse`, between "meet" and
 * "computer-demo"), drawn with the window's own pieces: the step layout and
 * title (`tye`), Back and Next (`nye`), stage placement (`fde`) and the
 * agents' own animated avatars (`sd`), in the twelve palettes. Simeon is the
 * flow's hero avatar, already at the centre from the Meet step (`QBn`).
 *
 * Redrawn 8 October 2026 after the founder's reference (a file graph: nodes
 * faint, a blue curve drawing from the centre to each, the node coming to
 * life as the line reaches it; "lines in blue, and an animation that sees
 * it linking … make it spacious"): three agents a side, 300 px out, each a
 * faint ghost until its curve arrives, the curves drawn one after another
 * from Simeon's sides, each job in grey beneath; one line of copy under the
 * title, which now reads "Simeon is your personal Chief of Staff" so the
 * copy can say "He". People who reduce motion get the finished picture.
 */
const COO_HERO_Y = -40;
const COO_SIDE_X = 300;
const COO_CREW = Object.freeze([
  { id: "inbox", label: "Inbox", color: "violet", x: -COO_SIDE_X, y: -150 },
  { id: "research", label: "Research", color: "red", x: -COO_SIDE_X, y: -40 },
  { id: "travel", label: "Travel", color: "green", x: -COO_SIDE_X, y: 70 },
  { id: "finance", label: "Finance", color: "magenta", x: COO_SIDE_X, y: -150 },
  { id: "sales", label: "Sales", color: "orange", x: COO_SIDE_X, y: -40 },
  { id: "content", label: "Content", color: "mint", x: COO_SIDE_X, y: 70 },
]);
/** The curve from Simeon's side to an agent's inner edge, in the web's frame (origin at Simeon): an S of two horizontal tangents. */
const cooLine = ({ x, y }) => {
  const side = Math.sign(x), x1 = side * 60, x2 = x - side * 40, y2 = y - COO_HERO_Y, mx = Math.round((x1 + x2) / 2);
  return `M${x1} 0C${mx} 0 ${mx} ${y2} ${x2} ${y2}`;
};
export const COO_COPY = "He hires an agent for every job you hand off.";
export const COO_TITLE = "Simeon is your personal Chief of Staff";
const COO_SOURCE = [
  `const __simeonCooCrew=${JSON.stringify(COO_CREW.map((a, i) => ({ ...a, d: cooLine(a), delay: 700 + i * 180 })))};`,
  "function __simeonCooStep(n){const{headingId:t,onForward:r,onBack:i}=n,still=Fo();",
  "const lines=p.jsx(fde,{x:0,y:" + COO_HERO_Y + ",ariaHidden:!0,className:\"simeon-coo__web\",children:p.jsx(\"svg\",{width:800,height:400,viewBox:\"-400 -200 800 400\",children:__simeonCooCrew.map(a=>p.jsx(\"path\",{className:\"simeon-coo__line\",d:a.d,pathLength:1,style:{animationDelay:`${a.delay}ms`}},a.id))})},\"web\");",
  "const crew=__simeonCooCrew.map(a=>p.jsx(fde,{x:a.x,y:a.y,ariaHidden:!0,className:\"simeon-coo__seat\",children:p.jsxs(\"div\",{className:\"simeon-coo__agent\",style:{animationDelay:`${a.delay+520}ms`},children:[p.jsx(sd,{\"aria-hidden\":!0,color:a.color,paused:still,shape:\"cloud\",sizePx:56,state:\"idle\"}),p.jsx(\"span\",{className:\"simeon-coo__role\",children:a.label})]})},a.id));",
  `const line=p.jsx(fde,{x:0,y:-200,className:"simeon-coo__copy",children:p.jsx("p",{children:${JSON.stringify(COO_COPY)}})},"copy");`,
  `return p.jsx(tye,{className:re("sand-onboarding__coo","simeon-coo"),footer:p.jsx(nye,{onBack:i,onForward:r}),headingId:t,title:${JSON.stringify(COO_TITLE)},children:[lines,...crew,line]})}`,
].join("");

export const COO_REPLACEMENTS = Object.freeze([
  // "Give each Agent a job" is left out of the flow (the founder, the same day: "remove the give each agent a job step"); the COO step says it now.
  ["coo-step-list", 'const Gse=["landing","meet","computer-demo","jobs","tools","create"]', 'const Gse=["landing","meet","coo","computer-demo","name","tools"]'],
  ["coo-computer-title", 'N="Grok Bot has its own computer and works just like you"', 'N="Your agents have their own computer and work just like you"'],
  ["coo-step-screen", 'case"computer-demo":return p.jsx(Yqn,{', 'case"coo":return p.jsx(__simeonCooStep,{headingId:xn,onBack:()=>x.goBack(ln),onForward:()=>x.advance(ln)});case"computer-demo":return p.jsx(Yqn,{'],
  ["coo-step-hero", 'case"computer-demo":return{...e,x:$2e.x+n.demoCursor.x', `case"coo":return{...e,x:0,y:${COO_HERO_Y},scale:1,opacity:1,state:"proud",transition:"standard",isGazing:!0};case"computer-demo":return{...e,x:$2e.x+n.demoCursor.x`],
  ["coo-step-component", "function sjn(n){", `${COO_SOURCE}function sjn(n){`],
]);

/**
 * Simeon is the first agent, made for the person: the Chief of Staff (3
 * October 2026, the founder: "the create your first agent part is where we
 * need gone. The first agent should automatically be Simeon. (Chief of
 * Staff)"; 4 October: "Bring back Chief of staff. Chief of staff stays the
 * first agent, but its not pinned. it's changeable but only the name and
 * the avatar").
 *
 * - Next on the apps step runs the flow's own create-and-finish (`Pe`: the
 *   hand-off screen, the computer, the agent, the first-run cue) with
 *   Simeon's profile instead of the form's. The "create" step is out of the
 *   step list. The agent-creation path now carries a title, so Simeon's
 *   profile reads Chief of Staff.
 * - The Chief of Staff is the oldest agent titled "Chief of Staff" (or
 *   "COO", the title the day before). He is pinned, hidden, moved and
 *   deleted like any agent; only his title and description are read only,
 *   the title being what makes him the Chief of Staff. His name and avatar
 *   are the person's to change.
 * - The Chief of Staff suggestion is gone from the new-agent picker: there
 *   is one, and it is Simeon.
 */
export const SIMEON_COO_PROFILE = Object.freeze({ name: "Simeon", title: "Chief of Staff", description: "Your Chief of Staff: manages your other Agents and pulls you in for decisions.", avatarColor: "blue", avatarShape: "cloud", templateId: "chief-of-staff" });
const COO_PIN_SOURCE = "var __simeonCooId=null;function __simeonFindCoo(n){let c=null;for(const a of n??[]){if(a!=null&&typeof a.title===\"string\"&&(a.title.trim().toLowerCase()===\"chief of staff\"||a.title.trim().toLowerCase()===\"coo\")&&(c==null||(a.createdAt??0)<(c.createdAt??0)))c=a}return c}function __simeonPinCoo(n,e){const c=__simeonFindCoo(n);__simeonCooId=c?.id??null;typeof __simeonNoteAgents===\"function\"&&__simeonNoteAgents(n);return e}";
/**
 * "What should your agents call you?" as a step of the flow, after the
 * computer (3 October 2026, the founder: "have their a step … that's the
 * name part. And i want you to design it better than you did. make it
 * inherit the design we have, and remake the animation for What do you use
 * everyday avatars based on that").
 *
 * The three agents of the apps step bounce in and gather over one white field
 * (the founder: "no grey, make it white. no Hi, bass. thinner writing box");
 * on Next they fly from there to their places on the apps
 * step (the flow's own avatar choreography, `eqn`). The name is saved
 * through the account's own rename, the same as the name sheet, which then
 * never needs to ask. Empty is allowed: Next skips, and the sheet asks later.
 */
const NAME_SEATS = Object.freeze({ "weekly-standup": { x: -168, y: -64, scale: 0.62 }, "invoice-chaser": { x: 0, y: -96, scale: 0.72 }, "sales-forecast": { x: 168, y: -64, scale: 0.62 } });
const NAME_SOURCE = [
  `const __simeonNameSeat=${JSON.stringify(NAME_SEATS)};`,
  "function __simeonNameStep(n){const{headingId:t,onForward:r,onBack:i}=n,d=typeof window<\"u\"?window.desktop:void 0,a=d?.cursorAccount,[v,sv]=S.useState(\"\"),ip=S.useRef(null),touched=S.useRef(!1);",
  "S.useEffect(()=>{let l=!0;Promise.resolve(a?.getNamePrompt?.()).then(q=>{l&&!touched.current&&typeof q?.suggested===\"string\"&&sv(q.suggested)},()=>{});const f=setTimeout(()=>ip.current?.focus(),450);return()=>{l=!1;clearTimeout(f)}},[]);",
  "const name=v.replace(/\\s+/g,\" \").trim().slice(0,60);",
  "const go=()=>{name.length>0&&a?.updateName!=null&&Promise.resolve(a.updateName(name)).catch(()=>{});r()};",
  "const field=p.jsx(fde,{x:0,y:4,className:\"simeon-name__field-seat\",children:p.jsx(\"form\",{onSubmit:e=>{e.preventDefault();go()},children:p.jsx(\"input\",{ref:ip,className:\"simeon-name__input\",type:\"text\",autoComplete:\"given-name\",spellCheck:!1,maxLength:60,placeholder:\"Your name\",\"aria-label\":\"Your name\",value:v,onChange:e=>{touched.current=!0;sv(e.target.value)}})})},\"field\");",
  "const note=p.jsx(fde,{x:0,y:44,className:\"simeon-name__note-seat\",children:p.jsx(\"p\",{className:\"simeon-name__note\",children:\"They’ll use it in chat and on calls. You can change it later.\"})},\"note\");",
  "return p.jsx(tye,{className:re(\"sand-onboarding__name\",\"simeon-name\"),footer:p.jsx(nye,{onBack:i,onForward:go}),headingId:t,title:\"How should they call you?\",children:[field,note]})}",
].join("");
export const NAME_STEP_REPLACEMENTS = Object.freeze([
  ["name-step-screen", "case\"tools\":return p.jsx(Ljn,{", "case\"name\":return p.jsx(__simeonNameStep,{headingId:xn,onBack:()=>x.goBack(ln),onForward:()=>x.advance(ln)});case\"tools\":return p.jsx(Ljn,{"],
  ["name-step-agents", "case\"tools\":return{...t,x:r.x,y:r.y,scale:r.scale,opacity:1,state:\"idle\",transition:\"standard\",bob:YBn[e]}", "case\"name\":return{...t,...__simeonNameSeat[e],opacity:1,state:\"happy\",transition:\"bounce\",isGazing:!0};case\"tools\":return{...t,x:r.x,y:r.y,scale:r.scale,opacity:1,state:\"idle\",transition:\"standard\",bob:YBn[e]}"],
  ["name-step-hero", "case\"coo\":return{...e,x:0,y:", "case\"name\":return{...e,x:$2e.x,y:$2e.y,scale:Vve,opacity:0,state:\"happy\",transition:\"exit\"};case\"coo\":return{...e,x:0,y:"],
  ["name-step-component", "function __simeonCooStep(n){", `${NAME_SOURCE}function __simeonCooStep(n){`],
  // The last screen keeps only its line ("Getting your team ready…", with its moving light): the mark and the name above it go, as on the boot screen.
  ["hand-off-text-only", "x=p.jsxs(\"div\",{className:f,style:m.style,children:[y,v,b]})", "x=p.jsxs(\"div\",{className:f,style:m.style,children:[v,b]})"],
]);
export const COO_LOCK_CSS = `/* Simeon: the Chief of Staff's title and description are read only */
.sand-info-pane input[readonly],.sand-info-pane textarea[readonly],input[aria-label^="Agent "][readonly],textarea[aria-label^="Agent "][readonly]{cursor:default;caret-color:transparent}
/* Simeon: the apps step's "Skip for later" */
.simeon-tools__footer{display:flex;flex-direction:column;align-items:center;gap:10px}
.simeon-tools__skip{height:24px;padding:0 8px;border:0;background:none;font:inherit;font-size:13px;line-height:18px;letter-spacing:-.01em;color:light-dark(rgba(60,60,67,.6),rgba(235,235,245,.6));cursor:pointer}
.simeon-tools__skip:hover{color:light-dark(rgba(60,60,67,.9),rgba(235,235,245,.9))}
`;
export const NAME_CSS = `/* Simeon: the name step */
.simeon-name{--simeon-name-ink-2:light-dark(rgba(60,60,67,.6),rgba(235,235,245,.6))}
.simeon-name__input{box-sizing:border-box;width:300px;height:38px;padding:0 14px;border:1px solid light-dark(rgba(60,60,67,.16),rgba(235,235,245,.16));border-radius:10px;background:light-dark(#fff,#1c1c1e);color:inherit;font:inherit;font-size:16px;line-height:20px;letter-spacing:-.01em;text-align:center;outline:none;caret-color:#0a84ff;box-shadow:0 1px 2px light-dark(rgba(0,0,0,.04),rgba(0,0,0,.3));transition:border-color .2s,box-shadow .2s}
.simeon-name__input::placeholder{color:light-dark(rgba(60,60,67,.3),rgba(235,235,245,.3))}
.simeon-name__input:focus{border-color:light-dark(rgba(10,132,255,.55),rgba(10,132,255,.7));box-shadow:0 0 0 3px light-dark(rgba(10,132,255,.14),rgba(10,132,255,.28))}
.simeon-name__note{margin:0;font-size:13px;line-height:18px;color:var(--simeon-name-ink-2);white-space:nowrap;text-align:center}
`;

export const FIRST_AGENT_REPLACEMENTS = Object.freeze([
  ["first-agent-title", "isKickstartRequested:!0,...t.templateId!=null?{templateId:t.templateId}:{}", "isKickstartRequested:!0,...t.title!=null?{title:t.title}:{},...t.templateId!=null?{templateId:t.templateId}:{}"],
  ["first-agent-simeon", "createTeammate:async _n=>(await y({name:A.name.trim(),description:A.description,avatarPngBase64:null,avatarColor:A.color,avatarShape:A.shape,onAgentCreated:_n,...A.pickedTemplateId==null?{}:{templateId:A.pickedTemplateId}})).agentId", `createTeammate:async _n=>(await y({...${JSON.stringify(SIMEON_COO_PROFILE)},avatarPngBase64:null,onAgentCreated:_n})).agentId`],
  ["first-agent-from-apps", "onChange:x.chooseDailyTools,onForward:()=>x.advance(ln),picked:N", "onChange:x.chooseDailyTools,onForward:()=>{Pe()},picked:N"],
  ["first-agent-no-cos-template", '{id:"chief-of-staff",name:"Chief of Staff",description:"Manages your other Bots and pulls you in for decisions",eligibility:{kind:"universal"}},', ""],
  // The roster read that finds the Chief of Staff (the pinned list itself is the person's: 4 October 2026, "its not pinned").
  ["coo-pinned-split", "function t5e(n,e){const t=new Set(e);", `${COO_PIN_SOURCE}function t5e(n,e){e=__simeonPinCoo(n,e);const t=new Set(e);`],
  ["coo-pinned-sections", "function Cct({agents:n,pinnedIds:e,sections:t}){if(t.length===0)return[];", "function Cct({agents:n,pinnedIds:e,sections:t}){e=__simeonPinCoo(n,e);if(t.length===0)return[];"],
  // The apps step offers "Skip for later" under Next (the founder, 4 October 2026).
  ["tools-skip-for-later", "E=p.jsx(nye,{onBack:i,onForward:o}),e[32]=i,e[33]=o", 'E=p.jsxs("div",{className:"simeon-tools__footer",children:[p.jsx(nye,{onBack:i,onForward:o}),p.jsx("button",{type:"button",className:"simeon-tools__skip",onClick:o,children:"Skip for later"})]}),e[32]=i,e[33]=o'],
  // Simeon's title and description are read only (the founder, 3 October 2026: "make the simeon
  // uneditable"; 4 October: "changeable but only the name and the avatar"): both show as text in
  // his pane. The title is what makes him the Chief of Staff, so it can never be typed away.
  ["coo-readonly-title", 'p.jsx(Uwe,{ariaLabel:"Agent title",initialValue:t.title,', 'p.jsx(Uwe,{readOnly:t.id===__simeonCooId,ariaLabel:"Agent title",initialValue:t.title,'],
  ["coo-readonly-description", 'p.jsx(Uwe,{ariaLabel:"Agent description",initialValue:t.description,', 'p.jsx(Uwe,{readOnly:t.id===__simeonCooId,ariaLabel:"Agent description",initialValue:t.description,'],
  ["coo-readonly-field", 'N={"aria-label":t,placeholder:o,spellCheck:!1,value:d,onFocus:x}', 'N={"aria-label":t,placeholder:o,spellCheck:!1,value:d,onFocus:x,readOnly:n.readOnly===!0}'],
  ["coo-readonly-commit", "y=_=>{if(h.current){h.current=!1,m(s);return}", "y=_=>{if(n.readOnly===!0){m(s);return}if(h.current){h.current=!1,m(s);return}"],
]);

/**
 * "Meet Simeon" (7 October 2026, the founder: "remove all below. What i want
 * is a big simeon avatar turning around itself, then minimize into meet
 * simeon. needs to be smooth").
 *
 * The composer that typed a sentence under the avatar is gone. The step is
 * four beats of the flow's own 35 ms scene clock (`Kjn`), and everything
 * is the window's own motion: Simeon fades in large on an empty stage (the
 * hero's "slow" spring, from unseen and a little smaller: 8 October, "after
 * setting up simeon's computer, can the avatar fade in instead of just
 * appearing"); the avatar turns once around its own axis (a 1.4 s turn in
 * depth, eased both ways, in a box every placed avatar now sits in; the
 * mark's own `spin` only draws light trails and keeps the body upright);
 * then he shrinks in place to his seat on the "standard" spring while the
 * title and Next rise in beneath. The seat is the spot he holds on the
 * Chief of Staff step, so Next moves nothing but the words (8 October:
 * "make it be the same where your personal chief of staff next step avatar
 * is, so that the transition is smooth"); the title and Next sit closer to
 * him than the flow's own layout puts them. People who reduce motion get
 * the finished picture.
 */
const MEET_SEAT = Object.freeze({ x: 0, y: COO_HERO_Y, scale: 1 });
const MEET_BIG = Object.freeze({ ...MEET_SEAT, scale: 2.3 });
/** Ticks of the scene clock (35 ms): the fade-in begins; the turn begins; the avatar settles and the title appears. */
const MEET_BEATS = Object.freeze([1, 16, 56]);
/** The title and Next, closer to the avatar than the flow's own 264 and 200 px (the founder, 8 October: "too much space between everything"). */
const MEET_TITLE_TOP = -168;
const MEET_FOOTER_TOP = 56;
const MEET_HI = ":not(#\\#):not(#\\#):not(#\\#):not(#\\#)";
const MEET_SOURCE = "function __simeonMeetStep(n){const{headingId:t,onForward:r,beat:b}=n;return p.jsx(tye,{className:re(\"sand-onboarding__meet\",\"simeon-meet\",b>=3?\"simeon-meet--settled\":\"\"),footer:p.jsx(nye,{onForward:r}),headingId:t,title:\"Meet Simeon\"})}";
export const MEET_STEP_REPLACEMENTS = Object.freeze([
  ["meet-step-screen", 'case"meet":return p.jsx(Tjn,{headingId:xn,onForward:()=>x.advance(ln),typedCount:Njn(ce)})', 'case"meet":return p.jsx(__simeonMeetStep,{headingId:xn,onForward:()=>x.advance(ln),beat:Ejn(ce)})'],
  ["meet-step-beats", "function Ejn(n){return n>=Sjn?1:n>=0?0:-1}", `const __simeonMeetBeats=${JSON.stringify(MEET_BEATS)};function Ejn(n){return n>=__simeonMeetBeats[2]?3:n>=__simeonMeetBeats[1]?2:n>=__simeonMeetBeats[0]?1:0}`],
  // Beat 0: unseen at his seat, a little large. Beats 1 and 2: large, fading in on the slow spring, then turning. Beat 3: his seat, the same spot he holds on the Chief of Staff step.
  ["meet-step-hero", 'case"meet":return n.meetBeat<0?{...e,...zoe,y:hWe.y,state:"waking",transition:"none"}:{...e,...hWe,scale:.8,opacity:1,state:n.meetBeat===0?"idle":"listening",transition:"bounce",isGazing:!0};', `case"meet":return n.meetBeat<1?{...e,x:${MEET_SEAT.x},y:${MEET_SEAT.y},scale:1.6,opacity:1,state:"happy",transition:"none",isGazing:!1,turn:"in"}:n.meetBeat<3?{...e,x:${MEET_BIG.x},y:${MEET_BIG.y},scale:${MEET_BIG.scale},opacity:1,state:"happy",transition:"slow",isGazing:!1,turn:n.meetBeat===2?"spin":"in"}:{...e,x:${MEET_SEAT.x},y:${MEET_SEAT.y},scale:${MEET_SEAT.scale},opacity:1,state:"idle",transition:"standard",isGazing:!0};`],
  // Every placed avatar sits in one more box; the one whose placement says `spin` turns once around its own axis in it.
  // The placed element is memoised on its class, handlers, style and child; `turn` joins that list (one more cache slot). "in" fades the box in; "spin" keeps that fade and turns it.
  ["meet-step-turn-cache", "function mqn(n){const e=he.c(46),", "function mqn(n){const e=he.c(47),"],
  ["meet-step-turn", 'let x;return e[40]!==m||e[41]!==f||e[42]!==h||e[43]!==v||e[44]!==b?(x=p.jsx("div",{className:m,onClick:f,onTransitionEnd:h,style:v,children:b}),e[40]=m,e[41]=f,e[42]=h,e[43]=v,e[44]=b,e[45]=x):x=e[45],x}', 'let x;return e[40]!==m||e[41]!==f||e[42]!==h||e[43]!==v||e[44]!==b||e[46]!==t.turn?(x=p.jsx("div",{className:m,onClick:f,onTransitionEnd:h,style:v,children:p.jsx("div",{className:t.turn==="spin"?"simeon-turn simeon-turn--on":t.turn==="in"?"simeon-turn simeon-turn--in":"simeon-turn",children:b})}),e[40]=m,e[41]=f,e[42]=h,e[43]=v,e[44]=b,e[46]=t.turn,e[45]=x):x=e[45],x}'],
  ["meet-step-component", "function __simeonNameStep(n){", `${MEET_SOURCE}function __simeonNameStep(n){`],
]);
export const MEET_CSS = `/* Simeon: the Meet step */
.simeon-meet>div:first-child${MEET_HI}{top:calc(50% - ${-MEET_TITLE_TOP}px)}
.simeon-meet>div:last-child${MEET_HI}{top:calc(50% + ${MEET_FOOTER_TOP}px)}
.simeon-meet>div{opacity:0;transform:translateY(6px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.simeon-meet--settled>div{opacity:1;transform:none}
.simeon-turn--in{animation:simeon-meet-fade 1.2s cubic-bezier(.4,0,.2,1) both}
.simeon-turn--on{animation:simeon-meet-fade 1.2s cubic-bezier(.4,0,.2,1) both,simeon-meet-turn 1.4s cubic-bezier(.65,0,.35,1) both;will-change:transform}
@keyframes simeon-meet-fade{from{opacity:0}to{opacity:1}}
@keyframes simeon-meet-turn{from{transform:perspective(900px) rotateY(0)}to{transform:perspective(900px) rotateY(360deg)}}
@media (prefers-reduced-motion:reduce){.simeon-meet>div{opacity:1;transform:none;transition:none}.simeon-turn--in,.simeon-turn--on{animation:none}}
`;

export function patchOriginalCooStep(source) {
  let out = source;
  for (const [label, before, after] of [...COO_REPLACEMENTS, ...FIRST_AGENT_REPLACEMENTS, ...NAME_STEP_REPLACEMENTS, ...MEET_STEP_REPLACEMENTS]) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const COO_MARKER = "/* Simeon: the Chief of Staff welcome step";
/** Curves in the app's blue, drawn on a standard ease; agents brighten on an expo-out. Greys are the system's. */
export const COO_CSS = `${COO_MARKER} */
.simeon-coo{--simeon-coo-ink:light-dark(rgba(60,60,67,.6),rgba(235,235,245,.6));--simeon-coo-line:light-dark(rgba(10,132,255,.55),rgba(100,170,255,.65));--simeon-coo-arrive:cubic-bezier(.16,1,.3,1)}
.simeon-coo__web svg{display:block;overflow:visible}
.simeon-coo__line{stroke:var(--simeon-coo-line);stroke-width:1.5;stroke-linecap:round;fill:none;stroke-dasharray:1;stroke-dashoffset:1;animation:simeon-coo-draw .9s cubic-bezier(.4,0,.2,1) both}
.simeon-coo__agent{display:flex;flex-direction:column;align-items:center;gap:8px;animation:simeon-coo-link .8s var(--simeon-coo-arrive) both}
.simeon-coo__role{font-size:12px;line-height:16px;letter-spacing:-.01em;color:var(--simeon-coo-ink);white-space:nowrap}
.simeon-coo__copy p{margin:0;font-size:15px;line-height:20px;letter-spacing:-.01em;color:var(--simeon-coo-ink);white-space:nowrap;text-align:center;animation:simeon-coo-rise .9s var(--simeon-coo-arrive) .35s both}
@keyframes simeon-coo-link{from{opacity:.28;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes simeon-coo-draw{to{stroke-dashoffset:0}}
@keyframes simeon-coo-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.simeon-coo__line,.simeon-coo__agent,.simeon-coo__copy p{animation:none;stroke-dashoffset:0;opacity:1;transform:none}}
`;

export function patchOriginalCooStylesheet(css) {
  if (css.includes(COO_MARKER)) throw new Error("Original renderer COO step block is already present.");
  return `${css}\n${COO_CSS}\n${NAME_CSS}\n${MEET_CSS}\n${COO_LOCK_CSS}`;
}

export function patchOriginalAgentPaneStylesheet(css) {
  if (css.includes(AGENT_PANE_MARKER)) throw new Error("Original renderer agent pane block is already present.");
  return `${css}\n${AGENT_PANE_CSS}`;
}

/**
 * Onboarding copy, 27 September 2026 (the founder's words): the sign-in
 * tagline, the sentence typed into the composer on the "meet" screen, and
 * the three example teammates' names. Their ids (`invoice-chaser`,
 * `weekly-standup`, `sales-forecast`) are layout keys and stay; only the
 * names drawn under them change. The access cover's own tagline ("… that
 * finish the work.") was not named and is left.
 */
export const COPY_REPLACEMENTS = Object.freeze([
  ["copy-signin-tagline", 'tagline:"Your team of always-on agents that you can give real work to."', 'tagline:"Your personal team of agents for whatever needs doing."'],
  ["copy-meet-typed", 'const H2e="Hand off any task to your team of agents"', 'const H2e="Put any task in the hands of your agents"'],
  // The boot screen as the founder asked, 3 October 2026: "remove the logo
  // up there. and have only the setting up thing". The heading keeps the
  // window's own moving light (`Ude`, the shimmer "Getting your team ready…"
  // uses), and stays still for people who reduce motion, as before.
  ["setup-screen-text-only", 'children:[p.jsx(tOt,{className:"sand-loading__mark",size:SRn}),p.jsx("span",{"aria-hidden":!0,className:re("sand-loading__heading"', 'children:[p.jsx("span",{"aria-hidden":!0,className:re("sand-loading__heading"'],
  ["copy-teammate-names", 'XBn={"invoice-chaser":"Invoice Chaser","weekly-standup":"Weekly Standup","sales-forecast":"Sales Forecast"}', 'XBn={"invoice-chaser":"Email Chaser","weekly-standup":"Flight Booker","sales-forecast":"Content Planner"}'],
]);

export function patchOriginalCopy(source) {
  let out = source;
  for (const [label, before, after] of COPY_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * Files and apps wear their real logos, 27 September 2026 (the founder: "anything
 * pdf use the svg we have for it, anything word, exel etc. for MDs use word
 * too"; "can plugings become this desing": "Connect apps" with Gmail,
 * Calendar and Drive tiles; then "you used the wrong svgs for the
 * microsofts … use these attached", and "whenever you mention an app, like
 * loom or miro, or any app, use their logo next to the name, and their color
 * logo for the text/name").
 *
 * The window draws a file's icon in one component (`OCe`), a tinted box
 * carrying `data-kind` with a glyph inside, the kind coming from the file's
 * mime type or name (`yAe` → `NHe`). The stylesheet paints the logo over
 * that box by kind: `pdf` the PDF artwork (the Word add-in's own), `document`
 * (Word) and `markdown` Word, `table` (xlsx, xls, csv, tsv) Excel, `slides`
 * PowerPoint; the three Microsoft logos are the web app's
 * (`clients/apps/web/public/icons`), the founder's pick, cut to 96 px.
 * PowerPoint had no kind (a `.pptx` fell through to `file`), so `NHe` names
 * `slides` for `.pptx`/`.ppt` and `document` for `.doc`/`.rtf`, only on its
 * unknown-extension branch, and the kind table `tin` gains `slides`; the
 * preview router (`gAe`) is untouched, so nothing new is offered a preview.
 * The sidebar's Plugins button keeps its action and becomes "Connect apps".
 * Slack's service tile, one flat aubergine glyph in the window's table, is
 * a white tile with the founder's full-colour Slack mark ("you using the
 * wrong slack logo"), found by the start of its glyph path; the same mark
 * sits beside "Slack" in a message. A file card's empty second line (size,
 * date) is dropped so the title centres on the download button ("the
 * titles be proportionate with the download icon").
 *
 * An app named in a message wears its logo and its colour: one rehype step
 * appended to the message pipeline (`yPn`, after the prose cards) wraps each
 * known name in a text node as `span.simeon-app[data-app]` with an empty
 * logo span before it; text under `a`, `code`, `pre` and `kbd` is left
 * alone and the words themselves are unchanged. Every element the message
 * renderer draws must carry the structure tag the prose-card step (`s1t`)
 * brands (`data.sandMarkdown`, checked by `ls`), so the new spans share
 * their parent's, and text whose parent carries none is not touched. The names, their colours and
 * logos are `brand/app-logos/apps.json`: the repository's colour logos where
 * it has one (Google, Microsoft, Zoom, Mailchimp) and Simple Icons (CC0,
 * brand hex included) for the rest, drawn as a mask in the text's colour.
 * Each colour is nudged darker in light mode until it holds 3:1 on the
 * message grey, and lighter in dark mode until it holds 4.5:1 on the
 * renderer's dark bubble, a near-black brand (Notion, Vercel, Miro) turning
 * near-white in dark mode the way its own dark-mode logo does; names that are common words (X, Box,
 * Render, Apple, a bare "Word") are not in the list.
 */
const BRAND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../brand");
export const FILE_ICON_SOURCES = Object.freeze({ pdf: "file-icons/pdf.svg", word: "file-icons/word.webp", excel: "file-icons/excel.webp", powerpoint: "file-icons/powerpoint.webp" });
export const APP_LOGO_SOURCES = Object.freeze({ gmail: "app-logos/gmail.webp", calendar: "app-logos/google-calendar.webp", drive: "app-logos/google-drive.svg" });
/** Service tiles the window draws as one flat colour that should carry the brand's full-colour logo instead, keyed by the start of the tile's glyph path. */
export const TILE_LOGO_SOURCES = Object.freeze({ slack: { file: "app-logos/slack.webp", pathStart: "M5.042 15.165" } });
export const APP_MENTIONS_MANIFEST = "app-logos/apps.json";
/** Extra spellings that name the same app as a manifest entry. */
const APP_MENTION_ALIASES = Object.freeze({ "Microsoft Word": "word", "Microsoft Excel": "excel", "Microsoft PowerPoint": "powerpoint", "Google Calendar": "google-calendar", "Microsoft Outlook": "outlook" });
/** Manifest names that are too often an ordinary word to mark on their own. */
const APP_MENTION_EXCLUDED_NAMES = new Set(["Word"]);
const PLUGINS_BUTTON_BEFORE = 'c=p.jsx("span",{"aria-hidden":!0,className:"sand-9f619 sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-gd8bvy sand-1fgtraw sand-1hc762m sand-13fuv20 sand-t8lcch sand-u6mfa5 sand-32b0ac sand-14px5p1 sand-1hkp6id sand-1q0q8m5 sand-19145p9 sand-1yxlikc sand-19ypqd9 sand-1hovq1a sand-149ho13 sand-10e981r",children:p.jsx(bt,{name:"plug",size:14})}),u=p.jsx("span",{className:"sand-1iyjqo2 sand-s83m0k sand-euugli sand-b3r6kr sand-lyipyv sand-uxw1ft",children:"Plugins"})';
const PLUGINS_BUTTON_AFTER = 'c=p.jsxs("span",{"aria-hidden":!0,className:"simeon-connect-apps__logos",children:[p.jsx("i",{"data-app":"gmail"}),p.jsx("i",{"data-app":"calendar"}),p.jsx("i",{"data-app":"drive"})]}),u=p.jsx("span",{className:"simeon-connect-apps__label",children:"Connect apps"})';
const MESSAGE_REHYPE_BEFORE = "function yPn(n,e=!0){return[...i1t,[s1t,{classifyProseCard:e?gPn:void 0,syntheticProseCards:n}]]}";

/** The rehype step, as source: `names` maps each spelling to its app key. */
export function appMentionsPluginSource(names) {
  if (Object.keys(names).length === 0) return "const __simeonAppMentions=()=>()=>{};";
  const escaped = Object.keys(names).sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = `(?<![\\w@/.-])(?:${escaped.join("|")})(?![\\w-])`;
  return `const __simeonAppMentions=(()=>{const A=${JSON.stringify(names)},R=new RegExp(${JSON.stringify(pattern)},"g"),S=new Set(["a","code","pre","kbd","script","style"]);const w=n=>{if(!n||!Array.isArray(n.children)||S.has(n.tagName))return;const o=[];let c=!1;const d=n.data&&n.data.sandMarkdown;for(const k of n.children){if(k.type!=="text"||d===void 0){w(k);o.push(k);continue}const v=k.value;let i=0,m;R.lastIndex=0;while((m=R.exec(v))!==null){c=!0;m.index>i&&o.push({type:"text",value:v.slice(i,m.index)});o.push({type:"element",tagName:"span",properties:{className:["simeon-app"],dataApp:A[m[0]]},data:{sandMarkdown:d},children:[{type:"element",tagName:"span",properties:{className:["simeon-app__logo"],ariaHidden:"true"},data:{sandMarkdown:d},children:[]},{type:"text",value:m[0]}]});i=m.index+m[0].length}i===0?o.push(k):i<v.length&&o.push({type:"text",value:v.slice(i)})}c&&(n.children=o)};return()=>t=>{w(t)}})();`;
}

/**
 * An agent named in a message wears its face and its colour, the way the
 * website's phone still draws Scout and Yodo (3 October 2026, the founder: "i
 * want the color of the agents and logo when mentioned like in mobile"). The
 * window's colour resolver (`Cee`, an agent's palette, or the one its id
 * falls on) is followed by `__simeonNoteAgents`, which the roster sort
 * (`__simeonPinCoo`, run by the sidebar on every agent) calls to keep a
 * name → palette map on `globalThis.__simeonAgentColors`. A second rehype
 * step, after the app step, reads that map each time a message is drawn and
 * wraps each name in `span.simeon-agent[data-agent-color]` with an empty
 * mark span before it, under the same rules as the app step (text under
 * `a`, `code`, `pre`, `kbd` left alone, the structure tag shared with the
 * parent). The mark is the agent's butterfly in its palette (one image per
 * palette, drawn by `butterflyMarkSvg` like the call banner's copy in
 * `source/shared/voice-call/agent-mark.ts`), in the app logo's box: as tall
 * (1.05em), as far from the name, on the same baseline ("not proportionate
 * with their text … use the same logic as the connectors"). The name takes the palette's top
 * stop, nudged to 3:1 on the message grey (4.5:1 on the dark bubble).
 */
const AGENT_SHAPE_RESOLVER = "function Eee(n){return Qtt.find(t=>t===n.avatarShape)??u4e(n.id)}";
const AGENT_COLOR_RESOLVER = "function Cee(n){return PQ.find(t=>t.id===n.avatarColor)?.id??sle(n.id)}";
/**
 * The window's two fallbacks (`u4e`, `sle`: a shape and a colour hashed from
 * the id) run for any record without a face, and while the computer is
 * connecting that is every agent: a conversation's members and a message's
 * sender are looked up in the roster, which is empty until the box answers,
 * so each face is drawn hashed and jumps to the real one on connect (4
 * October 2026, the founder: "a whole different avatar for each avatar").
 * The roster note now also remembers each agent's resolved shape and colour
 * by id, in memory and in `localStorage` under `simeon.agent-avatars`, and
 * both resolvers read that memory before hashing. Only a record that carries
 * a face is remembered, so a hashed fallback never becomes the memory. The
 * signed-in person's name (`displayName` of `getCursorAuthStatus`) is noted
 * too, so the mention step never dresses the person as an agent ("Hi, Bass"
 * wore an agent's face when an agent shared the name).
 */
export const AGENT_AVATAR_MEMORY_KEY = "simeon.agent-avatars";
export const AGENT_NOTE_SOURCE = `var __simeonAvatarMemory=null;function __simeonAvatars(){if(__simeonAvatarMemory==null){__simeonAvatarMemory={};try{const s=globalThis.localStorage?.getItem("${AGENT_AVATAR_MEMORY_KEY}");if(s){const p=JSON.parse(s);p&&typeof p==="object"&&!Array.isArray(p)&&(__simeonAvatarMemory=p)}}catch{}}return __simeonAvatarMemory}function __simeonRememberedAvatar(n){return typeof n==="string"?__simeonAvatars()[n]:void 0}function __simeonNotePerson(r){const n=typeof r?.displayName==="string"?r.displayName.trim():"";globalThis.__simeonPersonName=n.length>0?n:null;return r}function __simeonNoteAgents(n){const m={},r=__simeonAvatars();let c=!1;for(const a of n??[]){if(a==null)continue;const k=typeof a.name==="string"?a.name.trim():"";k.length>1&&(m[k]=Cee(a));if(typeof a.id==="string"&&(a.avatarColor||a.avatarShape)){const v={color:Cee(a),shape:Eee(a)},o=r[a.id];(o==null||o.color!==v.color||o.shape!==v.shape)&&(r[a.id]=v,c=!0)}}globalThis.__simeonAgentColors=m;if(c)try{globalThis.localStorage?.setItem("${AGENT_AVATAR_MEMORY_KEY}",JSON.stringify(r))}catch{}}`;
export const AGENT_RESOLVERS_BEFORE = `${AGENT_SHAPE_RESOLVER}${AGENT_COLOR_RESOLVER}`;
export const AGENT_RESOLVERS_AFTER = `function Eee(n){return Qtt.find(t=>t===n.avatarShape)??__simeonRememberedAvatar(n.id)?.shape??u4e(n.id)}function Cee(n){return PQ.find(t=>t.id===n.avatarColor)?.id??__simeonRememberedAvatar(n.id)?.color??sle(n.id)}${AGENT_NOTE_SOURCE}`;
// The step keys its cache on names, colours and the person's name together: a
// roster that comes back with the real colours after the connect redraws
// (the first cut compared names only, and a mention kept the colour from
// before the reconnection).
export const AGENT_MENTIONS_PLUGIN_SOURCE = "const __simeonAgentMentions=(()=>{let K=null,R=null,A={};const S=new Set([\"a\",\"code\",\"pre\",\"kbd\",\"script\",\"style\"]);const e=x=>x.replace(/[.*+?^${}()|[\\]\\\\]/g,\"\\\\$&\");const sync=()=>{const m=globalThis.__simeonAgentColors||{},p=typeof globalThis.__simeonPersonName===\"string\"?globalThis.__simeonPersonName.toLowerCase():\"\",n=Object.keys(m).filter(x=>x.toLowerCase()!==p).sort(),k=n.map(x=>x+\"=\"+m[x]).join(\"\\n\")+\"\\n\"+p;if(k===K)return;K=k;A={};for(const x of n)A[x]=m[x];const l=n.sort((a,b)=>b.length-a.length).map(e);R=l.length?new RegExp(\"(?<![\\\\w@/.-])(?:\"+l.join(\"|\")+\")(?![\\\\w-])\",\"g\"):null};const w=n=>{if(!n||!Array.isArray(n.children)||S.has(n.tagName))return;const o=[];let c=!1;const d=n.data&&n.data.sandMarkdown;for(const k of n.children){if(k.type!==\"text\"||d===void 0){w(k);o.push(k);continue}const v=k.value;let i=0,m;R.lastIndex=0;while((m=R.exec(v))!==null){c=!0;m.index>i&&o.push({type:\"text\",value:v.slice(i,m.index)});o.push({type:\"element\",tagName:\"span\",properties:{className:[\"simeon-agent\"],dataAgentColor:A[m[0]]},data:{sandMarkdown:d},children:[{type:\"element\",tagName:\"span\",properties:{className:[\"simeon-agent__mark\"],ariaHidden:\"true\"},data:{sandMarkdown:d},children:[]},{type:\"text\",value:m[0]}]});i=m.index+m[0].length}i===0?o.push(k):i<v.length&&o.push({type:\"text\",value:v.slice(i)})}c&&(n.children=o)};return()=>t=>{sync();R&&w(t)}})();";

/** The butterfly's own box in the mark's square, the rim included (x 3.3–225.3, y 30.6–191.6; a test measures it). */
export const AGENT_MENTION_VIEWBOX = "3 30 223 163";
/** One butterfly per palette, as SVG data URLs, drawn by `butterflyMarkSvg` like the call banner's copy. */
export function agentMentionMarks() {
  return Object.fromEntries(AGENT_PALETTES.map(({ id, top, mid, bottom }) => [id, `data:image/svg+xml;base64,${Buffer.from(butterflyMarkSvg({ id: `mention-${id}`, from: top, mid, to: bottom, viewBox: AGENT_MENTION_VIEWBOX })).toString("base64")}`]));
}

export function agentMentionsCss(marks = agentMentionMarks()) {
  return `.simeon-agent{color:var(--simeon-agent-color,inherit);font-weight:500;white-space:nowrap}
.simeon-agent__mark{display:inline-block;width:1.44em;height:1.05em;margin:0 .22em 0 .02em;vertical-align:-.18em;background:var(--simeon-agent-mark) center/contain no-repeat}
.sand-mvmkjj .simeon-agent{color:inherit}
strong .simeon-agent,b .simeon-agent,h1 .simeon-agent,h2 .simeon-agent,h3 .simeon-agent{font-weight:inherit}
${AGENT_PALETTES.map(({ id, top }) => `.simeon-agent[data-agent-color="${id}"]{--simeon-agent-color:light-dark(${readableOn(top, MESSAGE_GREY_LIGHT, "#000000")},${readableOn(top, MESSAGE_GREY_DARK, "#ffffff", 4.5)});--simeon-agent-mark:url("${marks[id]}")}`).join("\n")}
`;
}

export const LOGO_REPLACEMENTS = Object.freeze([
  ["connect-apps-button", PLUGINS_BUTTON_BEFORE, PLUGINS_BUTTON_AFTER],
  ["file-kind-slides", 'return r!=null&&A6n.has(r)?"archive":null', 'return r==="pptx"||r==="ppt"?"slides":r==="doc"||r==="rtf"?"document":r!=null&&A6n.has(r)?"archive":null'],
  ["file-kind-table-slides", "tin={markdown:", 'tin={slides:{icon24:"file",icon36:"file",tint:"neutral"},markdown:'],
  ["notion-tile-light", 'notion:{kind:"brand",hex:"#0F0F10",path:', 'notion:{kind:"brand",hex:"#FFFFFF",path:'],
  ["slack-tile-light", 'slack:{kind:"brand",hex:"#4A154B",path:', 'slack:{kind:"brand",hex:"#FFFFFF",path:'],
  ["approval-badge-marker", 'p.jsxs("span",{...Fe(lc.badge,N?lc.badgePending:FAn[y.kind]),role:"status",children:[N?p.jsx(bt,{"aria-hidden":!0,color:"yellow"', 'p.jsxs("span",{...Fe(lc.badge,N?lc.badgePending:FAn[y.kind]),"data-simeon-approval":N?"pending":void 0,role:"status",children:[N?p.jsx(bt,{"aria-hidden":!0,color:"yellow"'],
  ["message-app-mentions", MESSAGE_REHYPE_BEFORE, (names) => `${appMentionsPluginSource(names)}${AGENT_MENTIONS_PLUGIN_SOURCE}${MESSAGE_REHYPE_BEFORE.replace("syntheticProseCards:n}]]}", "syntheticProseCards:n}],__simeonAppMentions,__simeonAgentMentions]}")}`],
  ["agent-mention-colours", AGENT_RESOLVERS_BEFORE, AGENT_RESOLVERS_AFTER],
  ["person-name-noted", 'GX("getCursorAuthStatus",t,()=>e.getStatus())', 'GX("getCursorAuthStatus",t,()=>e.getStatus().then(__simeonNotePerson))'],
  // The app icon in About and on the hand-off screen (`Plt`) sat on a dark
  // drop shadow (`sand-10xuot4`); the founder's icon is drawn flat (4 October
  // 2026: "no dark accent around it").
  ["app-icon-flat", 'kfSwDN:"sand-87ps6o",ku685b:"sand-10xuot4",$$css:!0}};function Plt(n){', 'kfSwDN:"sand-87ps6o",$$css:!0}};function Plt(n){'],
  // The account menu's Help Center opened the upstream app's help site, and
  // Send Feedback its form; both are hidden until Simeon has its own (4
  // October 2026: "hide help center until i figure that out. same for send
  // feedback"). The menu's children list takes a null. The handler's URL is
  // rewritten too, so no upstream address is left in the shipped bytes.
  ["help-center-hidden", 'Q=p.jsx(It.Item,{leading:le,onSelect:Y,children:"Help Center"})', "Q=null"],
  ["send-feedback-hidden", 'ce=p.jsx(It.Item,{leading:ae,onSelect:h.open,children:"Send Feedback"})', "ce=null"],
  ["help-center-url", 'G=()=>{v("https://cursor.com/help")}', 'G=()=>{v("https://simeonlabs.com")}'],
  // Track A of the detachment plan (4 October 2026): every address and
  // name of the upstream maker a person could reach from the window. The
  // spending link goes to our web app; the onboarding and privacy links
  // to our site and privacy policy; the review host to a name of ours the
  // window will never see (it only compares hostnames); the account's
  // fallback name is Simeon; the "Get … for iOS" item and its App Store
  // address go, there is no such app.
  ["upstream-link-spending", 'const Yln="https://cursor.com/dashboard/spending"', 'const Yln="https://app.simeonlabs.com/app"'],
  ["upstream-link-onboarding", 'const pft="https://cursor.com/bot/onboarding"', 'const pft="https://simeonlabs.com"'],
  ["upstream-link-privacy", 'const LOn="https://cursor.com/dashboard/settings?openPrivacy=true"', 'const LOn="https://www.simeonlabs.com/legal/privacy-policy"'],
  ["upstream-link-review", 'const QPt="https://review.cursor.com"', 'const QPt="https://review.simeonlabs.com"'],
  ["upstream-host-review", 't==="review.cursor.com"&&(s=C_n)', 't==="review.simeonlabs.com"&&(s=C_n)'],
  ["upstream-account-fallback", 'name:e.name??"Cursor"', 'name:e.name??"Simeon"'],
  ["upstream-ios-link", 'const Rln="https://apps.apple.com/us/app/grok-bot/id6794501026"', 'const Rln="https://simeonlabs.com"'],
  ["upstream-ios-item", 'ne=N?p.jsx(It.Item,{leading:p.jsx(bt,{name:"device-mobile",size:"base"}),onSelect:L,children:"Get Grok Bot for iOS"}):null', "ne=null"],
  // The window's Sentry address was the upstream maker's project; with no
  // address the SDK stays off (the packaged app disables it anyway).
  ["upstream-sentry-dsn", 'const QLn="https://9fb7a1b8cb70c207a28a00476311bd40@metrics.cursor.sh/4511747394240513"', 'const QLn=""'],
]);

/** Spelling → app key for every name the messages mark. */
export function appMentionNames(mentions) {
  const names = {};
  for (const { name, key } of mentions) if (!APP_MENTION_EXCLUDED_NAMES.has(name)) names[name] = key;
  const keys = new Set(mentions.map(({ key }) => key));
  for (const [alias, key] of Object.entries(APP_MENTION_ALIASES)) if (keys.has(key)) names[alias] = key;
  return names;
}

export function patchOriginalLogos(source, names) {
  let out = source;
  for (const [label, before, after] of LOGO_REPLACEMENTS) out = replaceExactlyOnce(out, before, typeof after === "function" ? after(names) : after, label);
  return out;
}

const MIME = { ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const dataUrl = (bytes, file) => `data:${MIME[path.extname(file)]};base64,${Buffer.from(bytes).toString("base64")}`;

export async function readLogoAssets(brandDir = BRAND_DIR) {
  const read = async (sources) => Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, file]) => [key, dataUrl(await readFile(path.join(brandDir, file)), file)])));
  const manifest = JSON.parse(await readFile(path.join(brandDir, APP_MENTIONS_MANIFEST), "utf8"));
  const mentions = await Promise.all(manifest.map(async (app) => ({ ...app, logo: dataUrl(await readFile(path.join(brandDir, "app-logos", app.logo)), app.logo) })));
  const tiles = await Promise.all(Object.entries(TILE_LOGO_SOURCES).map(async ([key, { file, pathStart }]) => ({ key, pathStart, logo: dataUrl(await readFile(path.join(brandDir, file)), file) })));
  return { files: await read(FILE_ICON_SOURCES), apps: await read(APP_LOGO_SOURCES), mentions, tiles, wordmarkFont: dataUrl(await readFile(path.join(brandDir, WORDMARK_FONT)), WORDMARK_FONT) };
}

/**
 * The sign-in wordmark in Suravaram (3 October 2026, the founder: "'Simeon'
 * logo is Suravaram font"), the face simeonlabs.com sets its name in. The
 * font travels inside the stylesheet (Latin subset, 16 KB, SIL Open Font
 * License, brand/fonts/Suravaram-OFL.txt), so the screen never waits on a
 * network. It is the `<h1>` of the onboarding landing, the only one there.
 */
export const WORDMARK_FONT = "fonts/suravaram-latin-400.woff2";
export const WORDMARK_MARKER = "/* Simeon: the sign-in wordmark in Suravaram";
export function patchOriginalWordmarkStylesheet(css, fontUrl) {
  if (css.includes(WORDMARK_MARKER)) throw new Error("Original renderer wordmark block is already present.");
  if (typeof fontUrl !== "string" || !fontUrl.startsWith("data:font/woff2;base64,")) throw new Error("The wordmark font did not load.");
  return `${css}\n${WORDMARK_MARKER} */\n@font-face{font-family:"Simeon Suravaram";src:url("${fontUrl}") format("woff2");font-weight:400;font-style:normal;font-display:block}\n.sand-onboarding__landing h1{font-family:"Simeon Suravaram",Georgia,serif!important;font-weight:400!important;letter-spacing:0!important}\n`;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const hexOf = (rgb) => `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
const luminance = (rgb) => { const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrastRatio = (a, b) => { const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** The brand colour, mixed toward `toward` in 5% steps until it holds 3:1 on `background`. */
export function readableOn(hex, background, toward, minimum = 3) {
  const from = rgbOf(hex), to = rgbOf(toward);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = hexOf(from.map((c, i) => c + (to[i] - c) * (step / 20)));
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return toward;
}
export const MESSAGE_GREY_LIGHT = "#eeeeee";
/** The renderer's own dark agent bubble; a dark-theme name must hold 4.5:1 on it, since a black brand lifted only to 3:1 reads as disabled grey. */
export const MESSAGE_GREY_DARK = "#262626";

export const LOGOS_MARKER = "/* Simeon: files and apps wear their real logos";
const HI = ":not(#\\#):not(#\\#):not(#\\#)";

export function logosCss({ files, apps, mentions = [], tiles = [] }) {
  const kinds = [["pdf", files.pdf], ["document", files.word], ["markdown", files.word], ["table", files.excel], ["slides", files.powerpoint]];
  const box = (kind) => `span[data-kind="${kind}"][data-size]${HI}`;
  return `${LOGOS_MARKER} (27 September 2026). */
${kinds.map(([kind]) => box(kind)).join(",")}{background:var(--simeon-file-logo) center/82% no-repeat;border-color:transparent;box-shadow:none}
${kinds.map(([kind]) => `${box(kind)}>*`).join(",")}{visibility:hidden}
${kinds.map(([kind, url]) => `${box(kind)}{--simeon-file-logo:url("${url}")}`).join("\n")}
.sand-agents-sidebar__plugins-entry${HI}{position:relative;z-index:1;height:40px;margin:0 0 -40px 56px;padding:0;pointer-events:none}
.sand-agents-sidebar__plugins-entry${HI}>*{pointer-events:auto}
.sand-agents-sidebar__plugins${HI}{justify-content:flex-start;gap:6px;width:auto;height:40px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8);font-size:13px;font-weight:500}
.sand-agents-sidebar__plugins${HI}:hover{background:transparent;color:light-dark(#1b4a7d,#a9ccf0)}
.sand-agents-sidebar__account:not([data-collapsed="true"])${HI}{flex:0 0 auto;width:auto}
.sand-agents-sidebar__account:not([data-collapsed="true"])${HI}>button>span:nth-child(2){display:none}
.sand-agents-sidebar__rail-new .sand-agents-sidebar__new${HI}:not(#\\#){width:36px;height:36px;border-radius:999px;background:var(--sand-fill-neutral-subtle);box-shadow:inset 0 0 0 .5px var(--sand-border-default)}
.sand-agents-sidebar__rail-new .sand-agents-sidebar__new${HI} .ui-icon{--icon-size:18px!important;color:var(--sand-text-secondary)}
.simeon-connect-apps__label{white-space:nowrap}
.simeon-connect-apps__logos{order:1;display:inline-flex;align-items:center;margin-left:2px}
.simeon-connect-apps__logos>i{display:block;width:20px;height:20px;margin-left:-3px;border-radius:5px;background:#fff center/14px no-repeat;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.1)}
.simeon-connect-apps__logos>i:first-child{margin-left:0;transform:rotate(-7deg)}
.simeon-connect-apps__logos>i:last-child{transform:rotate(7deg)}
${Object.entries(apps).map(([app, url]) => `.simeon-connect-apps__logos>i[data-app="${app}"]{background-image:url("${url}")}`).join("\n")}
${tiles.map(({ pathStart, logo }) => `.sand-tool-icon:has(>svg path[d^="${pathStart}"])${HI}{background:#fff url("${logo}") center/62% no-repeat!important;box-shadow:inset 0 0 0 1px var(--sand-border-default)}\n.sand-tool-icon:has(>svg path[d^="${pathStart}"])${HI}>svg{visibility:hidden}`).join("\n")}
.sand-file-card__meta:empty${HI}{display:none}
.simeon-app{color:var(--simeon-app-color,inherit);font-weight:500;white-space:nowrap}
.simeon-app__logo{display:inline-block;width:1.05em;height:1.05em;margin:0 .26em 0 .04em;vertical-align:-.18em;background:center/contain no-repeat}
.sand-mvmkjj .simeon-app{color:inherit}
strong .simeon-app,b .simeon-app,h1 .simeon-app,h2 .simeon-app,h3 .simeon-app{font-weight:inherit}
${mentions.map(({ key, color, logo, mono }) => `.simeon-app[data-app="${key}"]{--simeon-app-color:light-dark(${readableOn(color, MESSAGE_GREY_LIGHT, "#000000")},${luminance(rgbOf(color)) < 0.03 ? "#ececec" : readableOn(color, MESSAGE_GREY_DARK, "#ffffff", 4.5)})}\n.simeon-app[data-app="${key}"]>.simeon-app__logo{${mono ? `background:currentColor;-webkit-mask:url("${logo}") center/contain no-repeat;mask:url("${logo}") center/contain no-repeat` : `background-image:url("${logo}")`}}`).join("\n")}
`;
}

/**
 * Cards speak in the chat's blue, 27 September 2026 ("design the approval/
 * permission - approval needed make it our blue, the button allow once and
 * any other main button in cards to always be the blue of the chat"). Every
 * primary button inside a message card (`.sand-message-card`, which wraps
 * the approval, email draft, connector and permission cards) is filled with
 * the bubble's blue, white text; the Auto-review card's pending badge,
 * orange in Grok Bot, is marked `data-simeon-approval="pending"` where it
 * is drawn and tinted blue with a blue spinner. Outline buttons (Always
 * allow, Deny, Discard) are untouched.
 *
 * Every card is white like the file card ("all cards literally all, should
 * be white background … because the artifact/attachment background are
 * white"): the choice, connector, email, approval and permission cards
 * paint with `--sand-fill-bubble-agent`, the agent bubble's grey, so inside
 * `.sand-message-card` that token points at the file card's
 * `--sand-fill-elevated`, and each card's surface takes the file card's
 * border; the agent's message bubbles, outside any card, stay grey. A white
 * service tile (Gmail, and Notion, which draws its light-mode logo: white
 * tile, dark mark, "i want the light mode logo") gets a hairline so it does
 * not vanish on the white card.
 *
 * The agent's bubble, outside cards, is the grey Messages gives a
 * received text (#E9E9EB, "like grey but KINDA blue ish", sampled from the
 * founder's screenshot; #3B3B3D in dark), set on the bubble token where the
 * theme sets it. Blue lines and a white bubble were tried the same day and
 * reverted ("not a fan").
 */
export const CARD_BLUE_MARKER = "/* Simeon: cards speak in the chat's blue";
/**
 * The agent's bubble in the light theme: the grey Messages gives a received
 * text, a touch blue (#E9E9EB). The dark theme keeps the renderer's own
 * bubble colour ("make sure all the changes apply to dark mode … but there
 * dont change the ai chat"), and a card takes whatever the bubble is in the
 * current theme through `--simeon-card-fill`, resolved where the theme sets
 * the bubble, before a card clears the bubble token for itself.
 */
export const AGENT_BUBBLE_LIGHT = "#e9e9eb";

/**
 * A card fades, 27 September 2026 (the founder, after trying Apple-style
 * glass panes and white "water glass" buttons: "the cards should not be
 * waterglass in box, but more like something fading", then "a is fine, but
 * dont forget to remove the liquid glass, that goes for the buttons too").
 * Buttons are flat again. The fade was then dropped too ("never mind for
 * the cards being fading etc. just put everything grey"): a card is the
 * agent bubble's Messages grey, solid, with no border, rim, shadow or blur.
 * The agent's name pill under its avatar in the chat header is white
 * Liquid Glass ("the names up center of the avatar, make that box white
 * liquid glass": a top-lit white fill, blur, a bright rim and a soft drop),
 * and the composer's send button is the chat's blue.
 * The header of an exchange between two agents ("the convo between two ais
 * up top with the avatars be centered") is a three-column grid: the pair in
 * the middle column, the computer control in the last.
 */
/**
 * The choice card's options sit on the card's grey instead of a white box,
 * and each option's A/B/C key is a round radio: an empty ring, blue on
 * hover or focus, and a blue dot on the chosen answer ("instead of a or b or
 * c have it being round picker. blue for the dot"). The keyboard shortcut
 * letters still work; only their drawing changed.
 *
 * Once answered (30 September 2026: "after you choose a choice in the picker
 * card, the thing appears there just randomly without context"), the card
 * keeps its grey card and the question stays as its title. The answer is one
 * line on the same grey: a thin blue check mark where the ring was, then the
 * label (the founder, 7 October 2026: the white field read as a different
 * card and the ring with its dot was noise; "something more premium like a
 * thin blue check mark"). The renderer's own trailing check is not drawn.
 * The answered card is a div, which the article/form/section card rule never
 * reached.
 */
const CHOICE_RADIO_CSS = () => `.sand-widget__options${HI}{background:var(--simeon-card-fill);border-color:transparent}
.sand-widget-option__key${HI}{box-sizing:border-box;width:18px;height:18px;min-width:18px;padding:0;border-radius:999px;border:1.5px solid light-dark(rgba(20,20,20,.3),rgba(255,255,255,.4));background:transparent}
.sand-widget-option__key${HI}>*{display:none}
.sand-widget-option:is(:hover,:focus-visible) .sand-widget-option__key${HI}{border-color:light-dark(${USER_BUBBLE_LIGHT},#5b9be0)}
.sand-widget-option--selected .sand-widget-option__key${HI}{opacity:1;border-color:light-dark(${USER_BUBBLE_LIGHT},#5b9be0);background:radial-gradient(circle,light-dark(${USER_BUBBLE_LIGHT},#5b9be0) 0 4px,transparent 4.5px)}
.sand-widget-option--selected [title="Selected"]${HI}{display:none}
.sand-widget--resolved .sand-widget__options${HI}:not(#\\#){background:transparent;box-shadow:none}
.sand-widget--resolved .sand-widget-option__label${HI}{color:inherit;opacity:1}
.sand-widget--resolved .sand-widget-option--selected .sand-widget-option__key${HI}:not(#\\#){position:relative;border-color:transparent;background:transparent}
.sand-widget--resolved .sand-widget-option--selected .sand-widget-option__key${HI}::after{content:"";position:absolute;left:5px;top:1.5px;width:5px;height:10px;border-right:1.5px solid light-dark(${USER_BUBBLE_LIGHT},#8cb8e8);border-bottom:1.5px solid light-dark(${USER_BUBBLE_LIGHT},#8cb8e8);border-radius:0 0 1px 0;transform:rotate(45deg)}
.sand-widget--resolved .sand-widget-option--selected [title="Selected"]${HI}:not(#\\#){display:none}
`;

/**
 * Two things for both themes (the founder, 28 September 2026: "also the blue
 * color for toggles", "in dark mode the connectors logo are white. please make
 * it dark"): a switch that is on is the chat's blue instead of the renderer's
 * near-black, and in the dark theme the Gmail, Calendar and Drive tiles beside
 * "Connect apps" sit on a dark tile with a faint edge instead of white.
 */
const SWITCH_AND_TILES_CSS = () => `[role=switch][aria-checked="true"]${HI}:not(#\\#){background-color:light-dark(${USER_BUBBLE_LIGHT},#3a78b8)}
[data-theme*="dark"] .simeon-connect-apps__logos>i${HI}{background-color:#2c2c2e;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 1px 2px rgba(0,0,0,.45)}
`;

/**
 * The agent's messages speak like the permission sheet on the website
 * (the founder, 28 September 2026: "you really did a great job on Stay in
 * control … can you try to bring this style everywhere the ai talk. lets try
 * first in the chat, the ai messages"): a white sheet instead of the Messages
 * grey, a hairline edge, a soft deep shadow that lifts it off the page, more
 * air inside, Apple's system face at regular weight in near-black. Only the
 * agent's text bubbles (`.sand-message` without the user bubble's class);
 * the dark theme keeps the renderer's own bubble. No blur: a backdrop filter
 * on every bubble would cost frames on scroll.
 * The same day, "do the cards. and bring this design to the blue the user
 * speak. but it stays in blue": every card in the chat is the same white
 * sheet (its surface white, the choice card's options on white, one shadow
 * on the outermost surface only), and the person's bubble keeps its painted
 * blue under the sheet's edge, lift, air and type.
 * Then the sidebar ("can we do the same thing about the message sidebar"):
 * the selected agent is the white sheet with its lift and larger corners,
 * and the search field is white with a hairline. The initials circle stays
 * the renderer's own, as it has been since the glass came off.
 *
 * Since 29 September 2026 the agent's text bubbles and every card are the
 * Messages grey again (AGENT_BUBBLE_LIGHT, #E9E9EB; the founder: "the grey
 * it was before … not super grey, but apple grey. that counts for all cards
 * too"). Only the colour changed: the edges, padding and type stay.
 * Since 1 October the person's blue bubble has no edge at all: the white
 * line along its top and the hairline ring around it read as a stray
 * over/underline on the flat blue ("there's kind of probleme tho with the
 * above/underline").
 */
const AGENT_SHEET_CSS = () => `[data-theme*="light"] .sand-message.sand-1g0q52m:not(.sand-mvmkjj)${HI}{background:${AGENT_BUBBLE_LIGHT};color:#1d1d1f;padding:10px 15px;box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;font-weight:400;line-height:1.5;letter-spacing:-.003em;-webkit-font-smoothing:antialiased}
[data-theme*="light"] .sand-message-block:has(>.sand-message.sand-1g0q52m:not(.sand-mvmkjj))${HI}{gap:6px}
[data-theme*="light"] .sand-message.sand-mvmkjj${HI}:not(#\\#){padding:10px 15px;box-shadow:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;font-weight:400;line-height:1.5;letter-spacing:-.003em;-webkit-font-smoothing:antialiased}
[data-theme*="light"] .sand-agent-item[data-active="true"]${HI}:not(#\\#):not(#\\#){border-radius:14px;box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
[data-theme*="light"] .sand-agent-item${HI}{border-radius:14px}
[data-theme*="light"] .sand-agents-sidebar__search${HI}{background:#fff;border-radius:10px;box-shadow:0 0 0 .5px rgba(20,30,60,.09),0 1px 2px rgba(20,30,60,.05)}
[data-theme*="light"] .sand-message-card${HI}{--simeon-card-fill:${AGENT_BUBBLE_LIGHT}}
[data-theme*="light"] :is(.sand-settings-dialog,.sand-plugins-dialog)${HI}{background:#f5f5f7;box-shadow:0 0 0 .5px rgba(20,30,60,.10),0 30px 80px -24px rgba(20,30,60,.45)}
[data-theme*="light"] .sand-settings-nav${HI}{background:transparent;box-shadow:inset -.5px 0 0 rgba(20,30,60,.10)}
[data-theme*="light"] .sand-settings-nav__item:not(.sand-jbqb8w)${HI}{background:#fff;border-radius:10px;box-shadow: 0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
[data-theme*="light"] .sand-settings-pane section>div.sand-1b8i4yy${HI}{background:#fff;border-radius:14px;box-shadow: 0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
[data-theme*="light"] .sand-settings-pane :is(textarea,input:not([type=checkbox]):not([type=radio]))${HI}{background:#fff;box-shadow:0 0 0 .5px rgba(20,30,60,.14)}
[data-theme*="light"] .sand-plugins-dialog [role=tab][aria-selected="true"]${HI}{background:#fff;border-radius:9px;box-shadow:0 0 0 .5px rgba(20,30,60,.09),0 1px 2px rgba(20,30,60,.06)}
[data-theme*="light"] .sand-plugins__search${HI}{background:#fff;border-radius:10px;box-shadow:0 0 0 .5px rgba(20,30,60,.09),0 1px 2px rgba(20,30,60,.05)}
[data-theme*="light"] .sand-plugins-row${HI}{background:#fff;border-radius:14px;padding:10px 14px;box-shadow: 0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
[data-theme*="light"] .sand-plugins__grid${HI}{gap:12px}
[data-theme*="light"] :is(.sand-plugins-detail,.sand-plugins-dialog) .sand-connector-card${HI}{background:#fff;border-color:transparent;border-radius:14px;box-shadow: 0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
[data-theme*="light"] .sand-message-card :is(.sand-widget--resolved,.sand-widget--dismissed)${HI},[data-theme*="light"] .sand-message-card>:is(article,form,section)${HI},[data-theme*="light"] .sand-message-card>* :is(.sand-connector-card,.sand-widget--choices,.sand-email-composer,.sand-file-card):not(.sand-message-card>* :is(.sand-connector-card,.sand-widget--choices,.sand-email-composer,.sand-file-card) *)${HI}{background:${AGENT_BUBBLE_LIGHT};box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
`;

const GREY_CARD = [
  "background:var(--simeon-card-fill)",
  "border-color:transparent",
  "box-shadow:none",
].join(";");

export const cardBlueCss = () => `${CARD_BLUE_MARKER} (27 September 2026). */
[data-theme*="light"]:not(#\\#):not(#\\#),[data-theme*="light"] :is(.sand-1wuigm2,.ui-1lzgia1):not(#\\#):not(#\\#){--sand-fill-bubble-agent:${AGENT_BUBBLE_LIGHT}}
:root:not(#\\#):not(#\\#):not(#\\#),[data-theme]:not(#\\#):not(#\\#):not(#\\#),:is(.sand-1wuigm2,.ui-1lzgia1):not(#\\#):not(#\\#):not(#\\#){--simeon-card-fill:var(--sand-fill-bubble-agent)}
.sand-message-card{--sand-fill-bubble-agent:transparent}
.sand-message-card>:is(article,form,section)${HI},.sand-message-card :is(.sand-connector-card,.sand-widget--choices,.sand-widget--resolved,.sand-widget--dismissed,.sand-email-composer,.sand-file-card)${HI}{${GREY_CARD}}
.sand-message-card .sand-tool-icon[style*="background-color: rgb(255, 255, 255)"]${HI}{box-shadow:inset 0 0 0 1px var(--sand-border-default)}
${CHOICE_RADIO_CSS()}${AGENT_SHEET_CSS()}${SWITCH_AND_TILES_CSS()}.sand-agent-item[data-active="true"]${HI}:not(#\\#){background:light-dark(#fff,rgba(255,255,255,.12));box-shadow:0 0 0 .5px light-dark(rgba(20,20,20,.08),rgba(255,255,255,.08)),0 1px 2px light-dark(rgba(20,20,20,.06),rgba(0,0,0,.3))}
.sand-chat-header__name${HI}:not(#\\#){background:linear-gradient(180deg,light-dark(rgba(255,255,255,.92),rgba(255,255,255,.18)),light-dark(rgba(255,255,255,.72),rgba(255,255,255,.08)));-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);border:.5px solid light-dark(rgba(255,255,255,.9),rgba(255,255,255,.18));box-shadow:inset 0 1px 0 light-dark(#fff,rgba(255,255,255,.22)),0 0 0 .5px light-dark(rgba(20,20,40,.1),rgba(0,0,0,.45)),0 2px 8px -2px light-dark(rgba(20,20,40,.14),rgba(0,0,0,.5))}
.sand-prompt-send${HI}:not(#\\#){background-color:light-dark(${USER_BUBBLE_LIGHT},${USER_BUBBLE_DARK});color:#fff}
.sand-prompt-send${HI}:not(#\\#):hover:not(:disabled){background-color:light-dark(#1e4d80,#2a62a0)}
.sand-chat-header:has(>.sand-chat-header__exchange)${HI}{display:grid;grid-template-columns:1fr auto 1fr;align-items:center}
.sand-chat-header>.sand-chat-header__exchange${HI}{grid-column:2;justify-self:center}
.sand-chat-header:has(>.sand-chat-header__exchange)>.sand-chat-header__controls${HI}{grid-column:3;justify-self:end}
.sand-message-card button[data-variant="primary"]${HI}{background-color:light-dark(${USER_BUBBLE_LIGHT},${USER_BUBBLE_DARK});border-color:transparent;color:#fff}
.sand-message-card button[data-variant="primary"]${HI}:hover:not(:disabled){background-color:light-dark(#1e4d80,#2a62a0)}
.sand-message-card button[data-variant="primary"]${HI}:active:not(:disabled){background-color:light-dark(#1a4372,#1b4677)}
.sand-message-card button[data-variant="primary"]${HI}:focus-visible{outline:2px solid light-dark(rgba(37,90,147,.45),rgba(140,184,232,.55));outline-offset:2px}
[data-simeon-approval="pending"]${HI}{background-color:light-dark(rgba(37,90,147,.12),rgba(140,184,232,.16));color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
[data-simeon-approval="pending"]${HI} .ui-icon{color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
`;

export function patchOriginalLogosStylesheet(css, assets) {
  if (css.includes(LOGOS_MARKER)) throw new Error("Original renderer logos block is already present.");
  return `${css}\n${logosCss(assets)}${agentMentionsCss()}${cardBlueCss()}`;
}

export const SHAPE_PICKER_MARKER = "/* Simeon: one shape, the cloud";
export const SHAPE_PICKER_CSS = `${SHAPE_PICKER_MARKER} (26 September 2026): the shape pickers in the agent editor and onboarding are gone; colour stays. */
[aria-label="Character shape"]{display:none!important}
`;

export function patchOriginalShapePickerStylesheet(css) {
  if (css.includes(SHAPE_PICKER_MARKER)) throw new Error("Original renderer shape-picker block is already present.");
  return `${css}\n${SHAPE_PICKER_CSS}`;
}

/**
 * The agents' colours, replaced whole on 23 September 2026 ("i wanna change
 * the color palettes choices of the bots. completely … replace all existing
 * colors with this"): twelve soft vertical gradients in the founder's
 * reference style (a grainy sunset, a sage sphere, a blue-lavender one),
 * previewed on the cloud and the blob in light and dark before this was
 * written. The renderer's eleven colour ids keep their names so every saved
 * agent still resolves; each now names one of the twelve palettes, and a
 * twelfth id, `mint`, is added. Slate replaces black, so the landing mark and
 * the onboarding hero (both `color:"black"`) are slate.
 *
 * How the mark is painted after this patch: the `sd` and mirror spans set
 * --ink-from / --ink-mid / --ink-to next to --fg (the palette's middle
 * colour, which rings, particles and glyphs still use); the animator's SVG
 * always defines a three-stop gradient on those variables and a film-grain
 * filter, and the body path is filled with the gradient through the grain.
 * The `inkGradient` prop path the animator had (two stops, never passed by
 * `sd`) is replaced by this. Colour is the same in light and dark.
 */
export const AGENT_PALETTES = Object.freeze([{"id": "yellow", "label": "Dusk", "top": "#8b8bea", "mid": "#f7a1b3", "bottom": "#ffb98a"}, {"id": "cyan", "label": "Sage", "top": "#2f6f72", "mid": "#6e9c95", "bottom": "#b8d1c5"}, {"id": "violet", "label": "Lagoon", "top": "#7cc0e0", "mid": "#d7a9dc", "bottom": "#2b4c92"}, {"id": "red", "label": "Ember", "top": "#ff9a76", "mid": "#ffd0a0", "bottom": "#6b3e8f"}, {"id": "green", "label": "Moss", "top": "#6f8f4f", "mid": "#a8c58a", "bottom": "#dfeacb"}, {"id": "brown", "label": "Sand", "top": "#f6e2c4", "mid": "#f2b48b", "bottom": "#c6754e"}, {"id": "magenta", "label": "Berry", "top": "#e07aa8", "mid": "#f4b7d0", "bottom": "#3e2a7a"}, {"id": "blue", "label": "Ocean", "top": "#1f3b73", "mid": "#3c7fb7", "bottom": "#7fd4d0"}, {"id": "gray", "label": "Rose", "top": "#f6c1c7", "mid": "#f0a4b8", "bottom": "#8f5c86"}, {"id": "black", "label": "Slate", "top": "#8c9db8", "mid": "#5e6d86", "bottom": "#d9dfe8"}, {"id": "orange", "label": "Peach", "top": "#ffd1a6", "mid": "#ffb0a3", "bottom": "#e56f8f"}, {"id": "mint", "label": "Mint", "top": "#bff0e2", "mid": "#8fd3c3", "bottom": "#3c8a86"}]);
const PALETTE_G_T_BEFORE = "G_t={black:{lightFrom:\"#585858\",lightTo:\"#000000\",darkFrom:\"#FFFFFF\",darkTo:\"#C2C2C2\"},brown:{lightFrom:\"#AE8968\",lightTo:\"#855C36\",darkFrom:\"#A27952\",darkTo:\"#604227\"},red:{lightFrom:\"#FF5667\",lightTo:\"#E02135\",darkFrom:\"#FF3E51\",darkTo:\"#A21826\"},orange:{lightFrom:\"#FF8838\",lightTo:\"#E05B00\",darkFrom:\"#FF781C\",darkTo:\"#C24E00\"},yellow:{lightFrom:\"#FFAF38\",lightTo:\"#E08600\",darkFrom:\"#FFA31C\",darkTo:\"#C27400\"},green:{lightFrom:\"#1CCF82\",lightTo:\"#009957\",darkFrom:\"#00C972\",darkTo:\"#008048\"},cyan:{lightFrom:\"#58D3C5\",lightTo:\"#00A592\",darkFrom:\"#1CC3B0\",darkTo:\"#007769\"},blue:{lightFrom:\"#459FFE\",lightTo:\"#0E74E0\",darkFrom:\"#2A92FE\",darkTo:\"#0C64C1\"},violet:{lightFrom:\"#B792FE\",lightTo:\"#804EE0\",darkFrom:\"#9159FE\",darkTo:\"#5C39A1\"},magenta:{lightFrom:\"#FF77BE\",lightTo:\"#E02A88\",darkFrom:\"#FF47A6\",darkTo:\"#A21E62\"},gray:{lightFrom:\"#A6A6A6\",lightTo:\"#696969\",darkFrom:\"#B7B7B7\",darkTo:\"#777777\"}}";
const PALETTE_G_T_AFTER = "G_t={" + AGENT_PALETTES.map((p) => `${p.id}:{lightFrom:"${p.top}",lightMid:"${p.mid}",lightTo:"${p.bottom}",darkFrom:"${p.top}",darkMid:"${p.mid}",darkTo:"${p.bottom}"}`).join(",") + "}";
const PALETTE_SNT_BEFORE = "const snt={black:{light:\"#000000\",dark:\"#FFFFFF\"},brown:{light:\"#A27952\",dark:\"#855C36\"},red:{light:\"#FF3E51\",dark:\"#E02135\"},orange:{light:\"#FF781C\",dark:\"#FF6700\"},yellow:{light:\"#FFAF38\",dark:\"#FF9800\"},green:{light:\"#00C972\",dark:\"#009957\"},cyan:{light:\"#1CC3B0\",dark:\"#00A592\"},blue:{light:\"#2A92FE\",dark:\"#0E74E0\"},violet:{light:\"#A97EFE\",dark:\"#804EE0\"},magenta:{light:\"#FF5EB1\",dark:\"#E02A88\"},gray:{light:\"#959595\",dark:\"#777777\"}};";
const PALETTE_SNT_AFTER = "const snt={" + AGENT_PALETTES.map((p) => `${p.id}:{light:"${p.mid}",dark:"${p.mid}"}`).join(",") + "};";
const PALETTE_PQ_BEFORE = "PQ=[{id:\"black\",label:\"Black\",value:\"#000\"},{id:\"brown\",label:\"Brown\",value:\"#936439\"},{id:\"red\",label:\"Red\",value:\"#FF263C\"},{id:\"orange\",label:\"Orange\",value:\"#FF6700\"},{id:\"yellow\",label:\"Yellow\",value:\"#FF9800\"},{id:\"green\",label:\"Green\",value:\"#00C972\"},{id:\"cyan\",label:\"Cyan\",value:\"#00BCA6\"},{id:\"blue\",label:\"Blue\",value:\"#1084FE\"},{id:\"violet\",label:\"Violet\",value:\"#9159FE\"},{id:\"magenta\",label:\"Magenta\",value:\"#FF309B\"},{id:\"gray\",label:\"Gray\",value:\"#777777\"}]";
const PALETTE_PQ_AFTER = "PQ=[" + AGENT_PALETTES.map((p) => `{id:"${p.id}",label:"${p.label}",value:"${p.mid}"}`).join(",") + "]";
const PALETTE_PICKER_BEFORE = 'const nnt=PQ.filter(n=>n.id!=="black")';
const PALETTE_PICKER_AFTER = "const nnt=PQ.slice()";
const PALETTE_K_T_BEFORE = "function K_t(n){const e=G_t[n];return{from:`light-dark(${e.lightFrom}, ${e.darkFrom})`,to:`light-dark(${e.lightTo}, ${e.darkTo})`,angle:W_t}}";
const PALETTE_K_T_AFTER = 'function OrbInk(n){const e=G_t[n]??G_t.black;return{from:`light-dark(${e.lightFrom}, ${e.darkFrom})`,mid:`light-dark(${e.lightMid}, ${e.darkMid})`,to:`light-dark(${e.lightTo}, ${e.darkTo})`}}function K_t(n){return{...OrbInk(n),angle:W_t}}';
const PALETTE_Y_T_BEFORE = "function Y_t(n){const{from:e,to:t,angle:s}=K_t(n);return`linear-gradient(${s+90}deg, ${e}, ${t})`}";
const PALETTE_Y_T_AFTER = "function Y_t(n){const{from:e,mid:r,to:t,angle:s}=K_t(n);return`linear-gradient(${s+90}deg, ${e}, ${r} 55%, ${t})`}";
const PALETTE_DEFS_BEFORE = "b&&(()=>{const Q=(b.angle??90)%360*Math.PI/180,ae=Math.cos(Q)/2,ce=Math.sin(Q)/2;return p.jsxs(\"linearGradient\",{id:`${N}-ink`,x1:.5-ae,y1:.5-ce,x2:.5+ae,y2:.5+ce,children:[p.jsx(\"stop\",{offset:b.fromPos??0,style:{stopColor:b.from}}),p.jsx(\"stop\",{offset:Math.max(b.toPos??1,b.fromPos??0),style:{stopColor:b.to}})]})})()]})";
const PALETTE_DEFS_AFTER = 'p.jsxs("linearGradient",{id:`${N}-ink`,x1:0,y1:0,x2:.15,y2:1,children:[p.jsx("stop",{offset:0,style:{stopColor:"var(--ink-from)"}}),p.jsx("stop",{offset:.55,style:{stopColor:"var(--ink-mid)"}}),p.jsx("stop",{offset:1,style:{stopColor:"var(--ink-to)"}})]}),p.jsxs("filter",{id:`${N}-grain`,x:0,y:0,width:1,height:1,children:[p.jsx("feTurbulence",{type:"fractalNoise",baseFrequency:.9,numOctaves:2,seed:7,result:"n"}),p.jsx("feColorMatrix",{in:"n",type:"matrix",values:"0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .35 0",result:"g"}),p.jsx("feBlend",{in:"SourceGraphic",in2:"g",mode:"overlay",result:"b"}),p.jsx("feComposite",{in:"b",in2:"SourceGraphic",operator:"in"})]})]})';
const PALETTE_BODY_BEFORE = 'p.jsx("path",{ref:G,style:b?{fill:`url(#${N}-ink)`}:Rke,d:le.path})';
const PALETTE_BODY_AFTER = 'p.jsx("path",{ref:G,style:{fill:`url(#${N}-ink)`,filter:`url(#${N}-grain)`},d:le.path})';
const PALETTE_SD_STYLE_BEFORE = 'D={...Z.style,width:J,height:J,"--fg":r?.flat??MNe(t),"--bg":f??String(nd["--sand-bg-base"])}';
const PALETTE_SD_STYLE_AFTER = 'D={...Z.style,width:J,height:J,"--fg":r?.flat??MNe(t),"--ink-from":r?.gradientFrom??OrbInk(t).from,"--ink-mid":r?.gradientFrom??OrbInk(t).mid,"--ink-to":r?.gradientTo??OrbInk(t).to,"--bg":f??String(nd["--sand-bg-base"])}';
const PALETTE_MIRROR_STYLE_BEFORE = 'f={...x.style,width:m,height:m,"--fg":i?.flat??MNe(s),"--bg":o??String(nd["--sand-bg-base"])}';
const PALETTE_MIRROR_STYLE_AFTER = 'f={...x.style,width:m,height:m,"--fg":i?.flat??MNe(s),"--ink-from":i?.gradientFrom??OrbInk(s).from,"--ink-mid":i?.gradientFrom??OrbInk(s).mid,"--ink-to":i?.gradientTo??OrbInk(s).to,"--bg":o??String(nd["--sand-bg-base"])}';
// The still marks (group avatars, and every place the window draws a mark as an image rather
// than the animator): _Ne gave the drawing one flat colour, the old palette's middle, as a
// from = to gradient, so the Launch squad's three clouds were pale single colours next to the
// agents' own three-stop marks (the founder, 28 September 2026: "make sure the message side bar
// group message use the real colors"). They take the palette's three stops now, and the
// drawing's gradient carries the middle stop when one is given.
const PALETTE_STILL_INK_BEFORE = "inkGradient:{light:{from:r,to:r},dark:{from:i,to:i}}";
const PALETTE_STILL_INK_AFTER = "inkGradient:(e=>e?{light:{from:e.lightFrom,mid:e.lightMid,to:e.lightTo},dark:{from:e.darkFrom,mid:e.darkMid,to:e.darkTo}}:{light:{from:r,to:r},dark:{from:i,to:i}})(G_t[s])";
const PALETTE_STILL_STOPS_BEFORE = '<stop offset="0" stop-color="${A.from}"/><stop offset="1" stop-color="${A.to}"/>';
const PALETTE_STILL_STOPS_AFTER = '<stop offset="0" stop-color="${A.from}"/>${A.mid?`<stop offset=".55" stop-color="${A.mid}"/>`:""}<stop offset="1" stop-color="${A.to}"/>';

export const PALETTE_REPLACEMENTS = Object.freeze([
  ["palette-gradients", PALETTE_G_T_BEFORE, PALETTE_G_T_AFTER],
  ["palette-flat", PALETTE_SNT_BEFORE, PALETTE_SNT_AFTER],
  ["palette-picker-entries", PALETTE_PQ_BEFORE, PALETTE_PQ_AFTER],
  ["palette-picker-all", PALETTE_PICKER_BEFORE, PALETTE_PICKER_AFTER],
  ["palette-ink-helper", PALETTE_K_T_BEFORE, PALETTE_K_T_AFTER],
  ["palette-css-gradient", PALETTE_Y_T_BEFORE, PALETTE_Y_T_AFTER],
  ["palette-svg-defs", PALETTE_DEFS_BEFORE, PALETTE_DEFS_AFTER],
  ["palette-body-fill", PALETTE_BODY_BEFORE, PALETTE_BODY_AFTER],
  ["palette-mark-vars", PALETTE_SD_STYLE_BEFORE, PALETTE_SD_STYLE_AFTER],
  ["palette-mirror-vars", PALETTE_MIRROR_STYLE_BEFORE, PALETTE_MIRROR_STYLE_AFTER],
  ["palette-still-ink", PALETTE_STILL_INK_BEFORE, PALETTE_STILL_INK_AFTER],
  ["palette-still-stops", PALETTE_STILL_STOPS_BEFORE, PALETTE_STILL_STOPS_AFTER],
]);

export function patchOriginalPalette(source) {
  let out = source;
  for (const [label, before, after] of PALETTE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * The person's own chat bubble. It was iMessage blue from 23 September 2026
 * ("copy imessage style and make it blue"), then from 27 September the
 * "Sky wash": a gradient under film grain and a brush texture. Since 1 October
 * it is one flat blue, no gradient, no texture ("the blue in the user chat
 * looks dirty. make it one simple blue color, no gradiant or anything"). White
 * text holds 7.1:1 on the light blue and 8.4:1 on the dark one. In dark mode,
 * selected text on the bubble is drawn in white with the bubble's blue as its
 * ink ("in dark mode, you can't see well when you select a text in the blue
 * chat"); light mode keeps the system selection, which reads fine there.
 *
 * The renderer's theme variables are generated at runtime from a token list
 * in the chunk (`Ct("fill/bubble-user", El(light, dark, hcLight, hcDark))`,
 * emitted by `bzn` as `--sand-fill-bubble-user`); the stylesheet carries only
 * the light default for first paint. Both are patched to the painting's base
 * blue, which is also what `--simeon-foreground` (a checked checkbox) reads.
 * `USER_BUBBLE_PAINT_CSS`, appended to the stylesheet on `.sand-mvmkjj`, the
 * one atomic class that applies the bubble colour (it occurs once in the
 * pinned chunk, in the message's `user` style), clears any background image
 * so the token's flat colour is all that shows, and carries the dark-mode
 * selection. The renderer marks dark mode as `data-theme="simeon-dark"` on
 * the root. The text on the bubble is `text/on-color`, white in every theme.
 */
export const USER_BUBBLE_LIGHT = "#255a93";
export const USER_BUBBLE_DARK = "#1f5087";
const BUBBLE_TOKEN_BEFORE = 'Ct("fill/bubble-user",El(va("gray","dark",1),va("gray","dark",8),va("gray","dark",1),va("gray","dark",11)))';
const BUBBLE_TOKEN_AFTER = `Ct("fill/bubble-user",El({value:"${USER_BUBBLE_LIGHT}",alias:"simeon/sky-wash"},{value:"${USER_BUBBLE_DARK}",alias:"simeon/sky-wash-dark"}))`;
export const BUBBLE_REPLACEMENTS = Object.freeze([["user-bubble-blue", BUBBLE_TOKEN_BEFORE, BUBBLE_TOKEN_AFTER]]);
const BUBBLE_CSS_BEFORE = "--sand-fill-bubble-user:#070707;";
const BUBBLE_CSS_AFTER = `--sand-fill-bubble-user:${USER_BUBBLE_LIGHT};`;
export const BUBBLE_CSS_REPLACEMENT = Object.freeze(["user-bubble-blue-stylesheet", BUBBLE_CSS_BEFORE, BUBBLE_CSS_AFTER]);

export function patchOriginalBubble(source) {
  let out = source;
  for (const [label, before, after] of BUBBLE_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const USER_BUBBLE_PAINT_MARKER = "/* Simeon: the person's bubble is one flat blue";
export const USER_BUBBLE_PAINT_CSS = `${USER_BUBBLE_PAINT_MARKER} (1 October 2026), plain, and its selection reads in dark mode. */
.sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#){background-image:none}
[data-theme="simeon-dark"] .sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#)::selection,[data-theme="simeon-dark"] .sand-mvmkjj:not(#\\#):not(#\\#):not(#\\#) *::selection{background-color:#ffffff;color:${USER_BUBBLE_DARK}}
`;

/**
 * An agent's title tag ("Chief of staff") reads in the bubble's blue instead
 * of grey, in the sidebar and wherever the renderer draws
 * `.sand-agent-title-tag`, and since the same evening it is only that text:
 * no pill, no edge, no inset ("should not be in a box. just blue text").
 * Dark mode takes a lighter blue.
 */
export const TITLE_TAG_BLUE_MARKER = "/* Simeon: an agent's title tag is blue";
export const TITLE_TAG_BLUE_CSS = `${TITLE_TAG_BLUE_MARKER} (27 September 2026). */
.sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#),.sand-agent-title-tag *:not(#\\#):not(#\\#):not(#\\#){color:light-dark(${USER_BUBBLE_LIGHT},#8cb8e8)}
.sand-agent-title-tag:not(#\\#):not(#\\#):not(#\\#):not(#\\#){background:none;border-color:transparent;box-shadow:none;padding-inline:0}
`;

export function patchOriginalBubbleStylesheet(css) {
  const [label, before, after] = BUBBLE_CSS_REPLACEMENT;
  if (css.includes(USER_BUBBLE_PAINT_MARKER)) throw new Error("Original renderer bubble paint block is already present.");
  return `${replaceExactlyOnce(css, before, after, label)}\n${USER_BUBBLE_PAINT_CSS}${TITLE_TAG_BLUE_CSS}`;
}

/**
 * The chat header is the agent's card (23 September 2026: "the name of the
 * agent are up top, left. i want to middle it … like muse. you might wanna
 * remove the line up there … it feels more apple ish"). CSS only, appended
 * to the pinned stylesheet: the toolbar's divider line is hidden, the
 * toolbar itself is translucent with a backdrop blur so messages scroll under
 * it the way Muse's do ("muse let it go all the way up. and lighten/darken/blur
 * the top while we scroll"); its bottom edge is a 30 px mask fade, not a line,
 * so the glass dissolves into the page ("there is still a visible line"), the identity row (avatar + name) is a centred column, the avatar is drawn at
 * 52 px (88 was "way too big" on the Mac) (the mark's inline 20 px is overridden on the span AND on the SVG
 * inside it, which carries its own inline width/height from the animator's
 * size prop; the first build missed the SVG and drew a 20 px mark at the
 * top of an 88 px box, "genuinely terrible"), so it is the same animated
 * mark, larger, the name is a pill, and the controls (computer, info)
 * stay at the right edge. Scoped with :has() to the identity variant of
 * the header, so the thread breadcrumb and the agent-exchange variants keep
 * their layout. The transcript already offsets by the toolbar's measured
 * height (`--sand-toolbar-height`), so a taller header pushes it down.
 */
export const HEADER_CARD_CSS = `
/* Simeon: the chat header is the agent's card, centred, without the divider (23 September 2026). */
.sand-toolbar-divider{display:none!important}
.sand-toolbar:has(.sand-chat-header__identity-row){padding-top:4px!important;padding-bottom:28px!important;border-bottom-width:0!important;background-color:color-mix(in srgb,var(--simeon-bg-editor) 78%,transparent)!important;-webkit-backdrop-filter:blur(22px) saturate(1.5)!important;backdrop-filter:blur(22px) saturate(1.5)!important;-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 30px),transparent 100%)!important;mask-image:linear-gradient(to bottom,#000 0,#000 calc(100% - 30px),transparent 100%)!important}
.sand-chat-header:has(>.sand-chat-header__identity-row){justify-content:center!important;position:relative!important}
.sand-chat-header__identity-row{flex-direction:column!important;align-items:center!important;gap:6px!important}
.sand-chat-header__identity{flex-direction:column!important;align-items:center!important;gap:4px!important;padding:0 8px 2px!important;border-radius:16px!important}
.sand-chat-header__avatar .sand-agent-avatar,.sand-chat-header__avatar .sand-simeon-mark{width:52px!important;height:52px!important}
.sand-chat-header__avatar .sand-simeon-mark>svg{width:52px!important;height:52px!important}
.sand-chat-header__avatar img.sand-agent-avatar{border-radius:50%!important;object-fit:cover!important}
.sand-chat-header__title{align-items:center!important}
.sand-chat-header__name{font-size:13px!important;line-height:18px!important;padding:3px 12px!important;border-radius:999px!important;background-color:var(--sand-fill-bubble-agent)!important;font-weight:500!important}
.sand-chat-header__controls{position:absolute!important;right:0!important;top:50%!important;transform:translateY(-50%)!important}
/* Simeon: what the title-bar drag strip must not swallow (7 October 2026, the founder: "some icons
   don't click well … the x from settings when the page isn't in full screen"). The window's top
   44–52 px are a drag region whenever it is not full screen; the window computes that region from
   the elements that declare drag and no-drag, whatever lies on top. A dialog, a menu or our own
   sheet drawn over the strip lost its clicks there. Each declares no-drag, which subtracts its box. */
[role=dialog],[role=menu],[role=listbox],.sand-settings-dialog,.sand-plugins-dialog{-webkit-app-region:no-drag}
`;
export const HEADER_CARD_MARKER = "/* Simeon: the chat header is the agent's card";

export function patchOriginalHeaderStylesheet(css) {
  if (css.includes(HEADER_CARD_MARKER)) throw new Error("Original renderer header card block is already present.");
  return `${css}\n${HEADER_CARD_CSS}`;
}

/**
 * Liquid Glass over the app's chrome (23 September 2026: "i want to bring
 * apple liquidglass design in the whole app"). The Figma the founder linked
 * could not be opened from the build container, so this follows Apple's own
 * description of the material: a translucent, blurred and saturated surface,
 * a thin specular highlight along the top edge, a soft ambient shadow, and
 * large continuous radii on floating controls. Content (messages, text)
 * stays as it is; the material goes on the chrome: the sidebar, the info
 * pane, the composer shell, popover menus, dialogs, floating pills, the
 * computer's top bar; not the message hover actions or reaction pills ("too
 * noisy"), and no window transparency (tried, "terrible", reverted). CSS only, appended to
 * the pinned stylesheet after the header card; every rule is !important so
 * it wins over the atom classes and inline styles the renderer sets.
 */
export const LIQUID_GLASS_CSS = `
/* Simeon: Liquid Glass on the chrome (23 September 2026), the agents sidebar only since 27 September 2026. */
html:has(.sand-agents-sidebar),html:has(.sand-agents-sidebar) body,[data-theme]:has(>.sand-agents-sidebar){background-color:transparent!important}
.sand-agents-sidebar{background-color:color-mix(in srgb,var(--simeon-bg-chrome) 93%,transparent)!important;-webkit-backdrop-filter:blur(30px) saturate(1.8)!important;backdrop-filter:blur(30px) saturate(1.8)!important;border-right:.5px solid color-mix(in srgb,var(--simeon-text-primary) 10%,transparent)!important}
.sand-agents-sidebar~.sand-chat,.sand-agents-sidebar~.sand-info-pane{background-color:var(--sand-bg-base)!important}
`;
export const LIQUID_GLASS_MARKER = "/* Simeon: Liquid Glass on the chrome";

export function patchOriginalGlassStylesheet(css) {
  if (css.includes(LIQUID_GLASS_MARKER)) throw new Error("Original renderer Liquid Glass block is already present.");
  return `${css}\n${LIQUID_GLASS_CSS}`;
}

/**
 * The sidebar's round glass buttons (5 October 2026, the founder: "redesign
 * the + button that create agents with this, based on apple water glass.
 * next to it have a search icon that replace the search bar", then the
 * compose glyph for create, the same disc for the account initials and
 * the composer's plus; settled on the website's demo first
 * (sites/simeonlabs.com/source/demo-glass.css), then "bring those changes
 * to the mac app electron and not the web app"). The buttons only.
 *
 * In the window: the search bar under the sidebar header is gone and its
 * `onOpenSearch` moves to a search disc beside the create disc in the
 * header; the rail (the sidebar while the pane is open) already draws a
 * "New chat" button of its own at its foot above the account, so that one
 * becomes the same two discs; the account button's initials are the same
 * disc; and so is the composer's attach button, at its own size.
 */
const DISC_ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  // The founder's compose glyph (5 October 2026): a square and a pencil.
  create: '<path d="M12 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V12M18.3 3.7a1.9 1.9 0 0 1 2.7 2.7L13 14.4l-3.6.9.9-3.6z"/>',
};
const SIDEBAR_DISCS_SOURCE = [
  `const __simeonDiscIcons=${JSON.stringify(DISC_ICONS)};`,
  'function __simeonDisc(n){const{icon:i,label:l,className:c,onClick:o}=n;return p.jsx(yo,{content:l,children:p.jsx("button",{type:"button","aria-label":l,className:"simeon-disc "+c,onClick:o,children:p.jsx("svg",{viewBox:"0 0 24 24","aria-hidden":!0,dangerouslySetInnerHTML:{__html:__simeonDiscIcons[i]}})})})}',
  'function __simeonSidebarDiscs(n){const{onOpenSearch:s,onNewChat:c}=n;return p.jsxs(p.Fragment,{children:[p.jsx(__simeonDisc,{icon:"search",label:"Search",className:"simeon-disc--search",onClick:()=>{typeof s=="function"&&s()}},"search"),p.jsx(__simeonDisc,{icon:"create",label:"New chat",className:"simeon-disc--create",onClick:c},"create")]})}',
].join("");
const SIDEBAR_HEADER_ANCHOR = "function pcn(n){";
const SIDEBAR_HEADER_HEAD_BEFORE = "function pcn(n){const e=he.c(13),{isSelecting:t,selectedCount:s,sectionableSelectedCount:r,areSectionsSupported:i,sections:o,onMoveSelectionToNewSection:l,onMoveSelectionToSection:c,onRequestDeleteSelected:u,onClearSelection:d,onOpenNetwork:m,onOpenBroadcast:f,onNewChat:h}=n;let y;if(e[0]!==i||e[1]!==t||e[2]!==d||e[3]!==l||e[4]!==c||e[5]!==h||e[6]!==f||e[7]!==m||e[8]!==u||e[9]!==r||e[10]!==o||e[11]!==s){";
const SIDEBAR_HEADER_HEAD_AFTER = "function pcn(n){const e=he.c(14),{isSelecting:t,selectedCount:s,sectionableSelectedCount:r,areSectionsSupported:i,sections:o,onMoveSelectionToNewSection:l,onMoveSelectionToSection:c,onRequestDeleteSelected:u,onClearSelection:d,onOpenNetwork:m,onOpenBroadcast:f,onNewChat:h,onOpenSearch:__s}=n;let y;if(e[0]!==i||e[1]!==t||e[2]!==d||e[3]!==l||e[4]!==c||e[5]!==h||e[6]!==f||e[7]!==m||e[8]!==u||e[9]!==r||e[10]!==o||e[11]!==s||e[13]!==__s){";
const SIDEBAR_HEADER_NEW_BEFORE = 'p.jsx(yo,{content:"New chat",children:p.jsx(fr,{"aria-label":"New",className:"sand-agents-sidebar__new",focusAppearance:"none",icon:"plus",onClick:h,size:"sm",style:Ete.newButton})})]})}),e[0]=i,e[1]=t,e[2]=d,e[3]=l,e[4]=c,e[5]=h,e[6]=f,e[7]=m,e[8]=u,e[9]=r,e[10]=o,e[11]=s,e[12]=y}else y=e[12];return y}';
const SIDEBAR_HEADER_NEW_AFTER = 'p.jsx(__simeonSidebarDiscs,{onOpenSearch:__s,onNewChat:h})]})}),e[0]=i,e[1]=t,e[2]=d,e[3]=l,e[4]=c,e[5]=h,e[6]=f,e[7]=m,e[8]=u,e[9]=r,e[10]=o,e[11]=s,e[12]=y,e[13]=__s}else y=e[12];return y}';
const RAIL_NEW_BEFORE = 'function n0n(n){const e=he.c(4),{onNewChat:t}=n;let s,r;e[0]===Symbol.for("react.memo_cache_sentinel")?(s={className:"sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-2lah0s sand-10b6aqq sand-lvsv26 sand-r1vbnl sand-1aquc0h sand-5hsz1j sand-1lfcbla"},r=re("sand-agents-sidebar__rail-new",s.className),e[0]=s,e[1]=r):(s=e[0],r=e[1]);let i;return e[2]!==t?(i=p.jsx("div",{className:r,style:s.style,children:p.jsx(yo,{content:"New chat",children:p.jsx(fr,{"aria-label":"New",className:"sand-agents-sidebar__new",focusAppearance:"none",icon:"plus",onClick:t,shape:"circle",style:Xbe.newButton})})}),e[2]=t,e[3]=i):i=e[3],i}';
const RAIL_NEW_AFTER = 'function n0n(n){const{onNewChat:t,onOpenSearch:s}=n;return p.jsx("div",{className:"sand-agents-sidebar__rail-new simeon-rail-discs sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-2lah0s sand-10b6aqq sand-lvsv26 sand-r1vbnl sand-1aquc0h sand-5hsz1j sand-1lfcbla",children:p.jsx(__simeonSidebarDiscs,{onOpenSearch:s,onNewChat:t})})}';
// The sidebar (`u0n`) hands `onOpenSearch` to the header and the rail; both
// memo guards learn the callback, in two slots past the sidebar's 204.
const SIDEBAR_CACHE_BEFORE = "function u0n(n){const e=he.c(204),";
const SIDEBAR_CACHE_AFTER = "function u0n(n){const e=he.c(206),";
const SIDEBAR_HEADER_CALL_BEFORE = "let yi;e[115]!==de||e[116]!==On||e[117]!==_n||e[118]!==wt||e[119]!==gt||e[120]!==F||e[121]!==be||e[122]!==ke||e[123]!==we||e[124]!==St.length||e[125]!==Ue?(yi=p.jsx(pcn,{";
const SIDEBAR_HEADER_CALL_AFTER = "let yi;e[115]!==de||e[116]!==On||e[117]!==_n||e[118]!==wt||e[119]!==gt||e[120]!==F||e[121]!==be||e[122]!==ke||e[123]!==we||e[124]!==St.length||e[125]!==Ue||e[204]!==V?(yi=p.jsx(pcn,{onOpenSearch:V,";
const SIDEBAR_HEADER_STORE_BEFORE = "sectionableSelectedCount:St.length,sections:we,selectedCount:Ue}),e[115]=de,e[116]=On,e[117]=_n,e[118]=wt,e[119]=gt,e[120]=F,e[121]=be,e[122]=ke,e[123]=we,e[124]=St.length,e[125]=Ue,e[126]=yi):yi=e[126];";
const SIDEBAR_HEADER_STORE_AFTER = "sectionableSelectedCount:St.length,sections:we,selectedCount:Ue}),e[115]=de,e[116]=On,e[117]=_n,e[118]=wt,e[119]=gt,e[120]=F,e[121]=be,e[122]=ke,e[123]=we,e[124]=St.length,e[125]=Ue,e[126]=yi,e[204]=V):yi=e[126];";
const SIDEBAR_SEARCH_BAR_BEFORE = "ki=Hn?null:p.jsx(a0n,{onOpenSearch:V})";
const SIDEBAR_SEARCH_BAR_AFTER = "ki=null";
const SIDEBAR_RAIL_CALL_BEFORE = "let ai;e[173]!==Hn||e[174]!==gt||e[175]!==F?(ai=Hn&&!gt?p.jsx(n0n,{onNewChat:F}):null,e[173]=Hn,e[174]=gt,e[175]=F,e[176]=ai):ai=e[176];";
const SIDEBAR_RAIL_CALL_AFTER = "let ai;e[173]!==Hn||e[174]!==gt||e[175]!==F||e[205]!==V?(ai=Hn&&!gt?p.jsx(n0n,{onNewChat:F,onOpenSearch:V}):null,e[173]=Hn,e[174]=gt,e[175]=F,e[176]=ai,e[205]=V):ai=e[176];";
export const SIDEBAR_DISCS_REPLACEMENTS = Object.freeze([
  ["sidebar-discs-components", SIDEBAR_HEADER_ANCHOR, `${SIDEBAR_DISCS_SOURCE}${SIDEBAR_HEADER_ANCHOR}`],
  ["sidebar-header-takes-search", SIDEBAR_HEADER_HEAD_BEFORE, SIDEBAR_HEADER_HEAD_AFTER],
  ["sidebar-header-discs", SIDEBAR_HEADER_NEW_BEFORE, SIDEBAR_HEADER_NEW_AFTER],
  ["sidebar-rail-discs", RAIL_NEW_BEFORE, RAIL_NEW_AFTER],
  ["sidebar-cache-two-more", SIDEBAR_CACHE_BEFORE, SIDEBAR_CACHE_AFTER],
  ["sidebar-header-call-search", SIDEBAR_HEADER_CALL_BEFORE, SIDEBAR_HEADER_CALL_AFTER],
  ["sidebar-header-store-search", SIDEBAR_HEADER_STORE_BEFORE, SIDEBAR_HEADER_STORE_AFTER],
  ["sidebar-no-search-bar", SIDEBAR_SEARCH_BAR_BEFORE, SIDEBAR_SEARCH_BAR_AFTER],
  ["sidebar-rail-call-search", SIDEBAR_RAIL_CALL_BEFORE, SIDEBAR_RAIL_CALL_AFTER],
  // The pane opens at its widest (the founder, 5 October 2026: "make the avatar panel to open in max"): every
  // fallback for its width is `ume` (480) rather than `K4e` (320): a fresh install, a stored slice or key without
  // a width, and the width the sidebar's layout reads. A width the person dragged is still kept.
  ["pane-widest-default", "Olt={isOpen:!1,width:K4e}", "Olt={isOpen:!1,width:ume}"],
  ["pane-widest-stored-fallback", "bge(s.width,K4e)", "bge(s.width,ume)"],
  ["pane-widest-legacy-fallback", "bge(e.infoPaneWidth,K4e)", "bge(e.infoPaneWidth,ume)"],
  ["pane-widest-stored-key-fallback", '{fallback:K4e,min:DQ,max:ume}', '{fallback:ume,min:DQ,max:ume}'],
]);
export const PANE_WIDEST = 480;

export function patchOriginalSidebarDiscs(source) {
  let out = source;
  for (const [label, before, after] of SIDEBAR_DISCS_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

export const SIDEBAR_DISCS_MARKER = "/* Simeon: the sidebar's round glass discs";
export const SIDEBAR_DISCS_CSS = `${SIDEBAR_DISCS_MARKER} (5 October 2026): search and create in the header, the same two at the foot of the rail, the account initials, and the composer's attach button at its own size. Clear glass, a specular top edge, a hairline, a soft shadow; the same in the dark. */
.sand-agents-sidebar__search{display:none!important}
.simeon-disc{display:grid;place-items:center;width:40px;height:40px;padding:0;margin:0;border:0;border-radius:999px;appearance:none;cursor:default;outline:none;color:light-dark(rgba(0,0,0,.78),rgba(255,255,255,.86));background:linear-gradient(180deg,light-dark(rgba(255,255,255,.62),rgba(255,255,255,.16)),light-dark(rgba(255,255,255,.38),rgba(255,255,255,.08)));-webkit-backdrop-filter:blur(14px) saturate(1.6);backdrop-filter:blur(14px) saturate(1.6);box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.28)),inset 0 0 0 .75px light-dark(rgba(255,255,255,.6),rgba(255,255,255,.12)),inset 0 -1px 1px rgba(0,0,0,.04),0 0 0 .5px light-dark(rgba(0,0,0,.07),rgba(0,0,0,.5)),0 1px 3px rgba(0,0,0,.06);transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
.simeon-disc:hover{transform:scale(1.04)}
.simeon-disc:active{transform:scale(.97)}
.simeon-disc:focus-visible{box-shadow:0 0 0 3px light-dark(rgba(0,0,0,.14),rgba(255,255,255,.24))}
.simeon-disc svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sand-agents-sidebar__header:has(.simeon-disc){height:60px!important;padding-right:12px!important}
.sand-agents-sidebar__new-actions:has(.simeon-disc){gap:10px!important;align-items:center!important}
.simeon-rail-discs{gap:10px!important;padding-bottom:10px!important}
.sand-agents-sidebar__account>button{width:40px!important;height:40px!important;padding:0!important;border-radius:999px!important;display:grid!important;place-items:center!important}
.sand-agents-sidebar__account .sand-kit-base-avatar{width:40px!important;height:40px!important;border-radius:999px!important;font-size:13px!important;font-weight:500!important;letter-spacing:.02em!important;color:light-dark(rgba(0,0,0,.72),rgba(255,255,255,.86))!important;background:linear-gradient(180deg,light-dark(rgba(255,255,255,.62),rgba(255,255,255,.16)),light-dark(rgba(255,255,255,.38),rgba(255,255,255,.08)))!important;-webkit-backdrop-filter:blur(14px) saturate(1.6)!important;backdrop-filter:blur(14px) saturate(1.6)!important;box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.28)),inset 0 0 0 .75px light-dark(rgba(255,255,255,.6),rgba(255,255,255,.12)),inset 0 -1px 1px rgba(0,0,0,.04),0 0 0 .5px light-dark(rgba(0,0,0,.07),rgba(0,0,0,.5)),0 1px 3px rgba(0,0,0,.06)!important;transition:transform .18s ease!important}
.sand-agents-sidebar__account .sand-kit-base-avatar>span{display:none!important}
.sand-agents-sidebar__account>button:hover .sand-kit-base-avatar{transform:scale(1.04)!important}
.sand-prompt-attach{width:30px!important;height:30px!important;border-radius:999px!important;color:light-dark(rgba(0,0,0,.78),rgba(255,255,255,.86))!important;background:linear-gradient(180deg,light-dark(rgba(255,255,255,.62),rgba(255,255,255,.16)),light-dark(rgba(255,255,255,.38),rgba(255,255,255,.08)))!important;-webkit-backdrop-filter:blur(14px) saturate(1.6)!important;backdrop-filter:blur(14px) saturate(1.6)!important;box-shadow:inset 0 1px 0 light-dark(rgba(255,255,255,.95),rgba(255,255,255,.28)),inset 0 0 0 .75px light-dark(rgba(255,255,255,.6),rgba(255,255,255,.12)),inset 0 -1px 1px rgba(0,0,0,.04),0 0 0 .5px light-dark(rgba(0,0,0,.07),rgba(0,0,0,.5)),0 1px 3px rgba(0,0,0,.06)!important;transition:transform .18s ease!important}
.sand-prompt-attach:hover{transform:scale(1.04)!important}
.sand-prompt-attach:active{transform:scale(.97)!important}
.sand-prompt-attach .ui-icon{color:inherit!important}
`;

export function patchOriginalSidebarDiscsStylesheet(css) {
  if (css.includes(SIDEBAR_DISCS_MARKER)) throw new Error("Original renderer sidebar discs block is already present.");
  return `${css}\n${SIDEBAR_DISCS_CSS}`;
}

/**
 * The butterfly (6 October 2026, the founder: "what if the avatar was a
 * butterfly … i dont want to lose the animations"; then "i want actual
 * butterfly … i'm okay to lose the eyes. but i wanna keep the animation of
 * the avatar turning around, morphing into 3 dots", with three photographs
 * of pale blue, pink and lavender butterflies; and the spin's lights
 * "related to the specific agent avatar color").
 *
 * Every agent is a butterfly in its own palette (the twelve of
 * AGENT_PALETTES): the wings carry the palette's full gradient, as the
 * cloud did (the founder, 6 October 2026: "full colour"), with a soft darker border, a
 * thin rim, fine veins, a slim body and two antennae, the rim, veins and
 * body a dark shade of the palette's own colours. The window's mark engine
 * draws it, so all of its motion stays:
 *   1. The geometry every shape draws (`Jo.cloud`, which SHAPE_REPLACEMENTS
 *      gives every name; the key stays `cloud`, it is what agents have
 *      stored) is the wings: the outer edge of a union of rotated ellipses
 *      (BUTTERFLY_ELLIPSES), sampled by the engine's own `Yse`, with
 *      spheres for its turns (`solid`).
 *   2. The details (`simeon-wing-art`) sit over the body in the engine's
 *      moving group, clipped to the engine's outline, so they spin, sway
 *      and turn with it; they and the rim fade out as the body morphs into
 *      the orb (the morph's progress, `Jc`) and come back after it.
 *   3. No eyes: the eye group is not drawn (the expressions and the eye
 *      movement go with it; the founder: "i'm okay with the eye movement
 *      out"). The details are inserted just before it, after the body.
 *   4. The still renderer (`rOt`: the group avatar's members and every
 *      other still mark) draws the same wings and details, without the eye
 *      holes it cut.
 *   5. The spin's light trails and burst of sparks take the agent's own
 *      colours, read off the mark (`--ink-from`, `--ink-mid`, `--ink-to`,
 *      light-dark pairs resolved through a computed fill): each trail runs
 *      between two neighbouring stops with a little drift, each spark is a
 *      shade of one. They went round the whole colour wheel and six fixed
 *      colours (`k1e`).
 * The call banner's and the mentions' copies (source/shared/voice-call/
 * agent-mark.ts, `agentMentionsCss`) and the website's faces are drawn by
 * `butterflyMarkSvg` from the same pieces.
 */
const MARK_CENTRE = 114.2705;
/** The wings: rotated ellipses [cx, cy, a, b, degrees] around the mark's centre (y down), the left side mirroring the right. */
export const BUTTERFLY_ELLIPSES = Object.freeze([[52, -36, 63, 39, -30], [38, 36, 44, 35, 48], [0, 0, 7, 50, 90]].flatMap(([cx, cy, a, b, g]) => (cx === 0 ? [[cx, cy, a, b, g]] : [[cx, cy, a, b, g], [-cx, cy, a, b, 180 - g]])));
const BUTTERFLY_SPHERES = "[[-52,-36,10,46],[52,-36,-12,46],[-38,36,8,38],[38,36,-10,38],[0,0,14,12]]";
const BUTTERFLY_REACH_SOURCE = `const dx=Math.cos(t),dy=Math.sin(t);let k=0;for(const[cx,cy,a,b,g]of ${JSON.stringify(BUTTERFLY_ELLIPSES)}){const r=g*Math.PI/180,c=Math.cos(r),s=Math.sin(r),px=-cx*c-cy*s,py=cx*s-cy*c,vx=dx*c+dy*s,vy=-dx*s+dy*c,A=vx*vx/(a*a)+vy*vy/(b*b),B=2*(px*vx/(a*a)+py*vy/(b*b)),C=px*px/(a*a)+py*py/(b*b)-1,D=B*B-4*A*C;if(D<0)continue;const q=(-B+Math.sqrt(D))/(2*A);q>k&&(k=q)}`;
/** How far from the centre the wings reach along the angle `t` (radians, y down): the same code the window runs. */
export const butterflyReach = new Function("t", `${BUTTERFLY_REACH_SOURCE}return k;`);
const fixed = (value, digits) => Number(value.toFixed(digits)).toString();
/** The wings' outline as a path, sampled at the window's 200 angles. */
export const BUTTERFLY_OUTLINE = (() => {
  const points = [];
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * Math.PI * 2, k = butterflyReach(t);
    points.push(`${fixed(MARK_CENTRE + Math.cos(t) * k, 2)} ${fixed(MARK_CENTRE + Math.sin(t) * k, 2)}`);
  }
  return `M${points.join("L")}Z`;
})();
/** Veins: four on each forewing and three on each hindwing, from the wing's root to just inside its edge. */
export const BUTTERFLY_VEINS = (() => {
  const at = (x, y) => `${fixed(MARK_CENTRE + x, 1)} ${fixed(MARK_CENTRE + y, 1)}`;
  const vein = (x0, y0, x1, y1, bend) => {
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2 - ((y1 - y0) / l) * bend, cy = (y0 + y1) / 2 + ((x1 - x0) / l) * bend;
    return `M${at(x0, y0)}Q${at(cx, cy)} ${at(x1, y1)}`;
  };
  let d = "";
  for (const side of [1, -1]) {
    for (const [rootY, fan] of [[-8, [[-58, 4], [-40, 2], [-22, 1], [-6, -1]]], [6, [[22, -2], [42, 0], [64, 2]]]]) {
      for (const [degrees, bend] of fan) {
        const t = (degrees * Math.PI) / 180, k = butterflyReach(Math.atan2(Math.sin(t), Math.cos(t) * side));
        d += vein(4 * side, rootY, side * Math.abs(k * Math.cos(t)) * 0.97, k * Math.sin(t) * 0.97, bend * side);
      }
    }
  }
  return d;
})();
const R = MARK_CENTRE;
export const BUTTERFLY_ANTENNAE = `M${R - 2} ${R - 30}C${R - 6} ${R - 50} ${R - 14} ${R - 66} ${R - 24} ${R - 80}M${R + 2} ${R - 30}C${R + 6} ${R - 50} ${R + 14} ${R - 66} ${R + 24} ${R - 80}`;
const BUTTERFLY_KNOBS = `<circle cx="${R - 24}" cy="${R - 80}" r="2.6"/><circle cx="${R + 24}" cy="${R - 80}" r="2.6"/>`;
const BUTTERFLY_BODY = `<ellipse cx="${R}" cy="${R - 26}" rx="4" ry="4"/><ellipse cx="${R}" cy="${R - 11}" rx="4.6" ry="11"/><ellipse cx="${R}" cy="${R + 20}" rx="3.2" ry="22"/>`;
/** The rim and veins, and the body, as dark shades of a palette's first and last stops. */
export const wingEdgeColour = (from, to) => `color-mix(in oklab,color-mix(in oklab,${from},${to}) 60%,#10131c)`;
export const wingBodyColour = (from, to) => `color-mix(in oklab,color-mix(in oklab,${from},${to}) 35%,#1b1f29)`;
/** The antennae on a dark window would vanish: there they are a light shade of the palette. */
export const wingFeelerColour = (from, to) => `light-dark(${wingBodyColour(from, to)},color-mix(in oklab,color-mix(in oklab,${from},${to}) 45%,#dfe4ee))`;
/**
 * The details over the wings: veins and a soft darker border (clipped to
 * the wings; the pale wash from the body out was taken off on 6 October
 * 2026, "full colour, like before"), then the antennae and the body. With
 * `outlineId` the clip and the border reuse a path the caller defines;
 * without it they clip to the element `id` and draw the outline inline.
 */
export function butterflyArt({ id, edge, body, feelers = body, outlineId = null }) {
  const outline = (attributes) => (outlineId == null ? `<path d="${BUTTERFLY_OUTLINE}"${attributes}/>` : `<use href="#${outlineId}"${attributes}/>`);
  return `<defs>${outlineId == null ? "" : `<clipPath id="${id}">${outline("")}</clipPath>`}</defs>`
    + `<g clip-path="url(#${id})"><path d="${BUTTERFLY_VEINS}" fill="none" style="stroke:${edge}" stroke-opacity=".22" stroke-width=".9" stroke-linecap="round"/>${outline(` fill="none" style="stroke:${edge}" stroke-opacity=".22" stroke-width="22" stroke-linejoin="round"`)}</g>`
    + `<path d="${BUTTERFLY_ANTENNAE}" fill="none" style="stroke:${feelers}" stroke-width="1.8" stroke-linecap="round"/><g style="fill:${feelers}">${BUTTERFLY_KNOBS}</g><g style="fill:${body}">${BUTTERFLY_BODY}</g>`;
}
const GRAIN_FILTER = (id) => `<filter id="${id}-grain" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"></feTurbulence><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .35 0" result="g"></feColorMatrix><feBlend in="SourceGraphic" in2="g" mode="overlay" result="b"></feBlend><feComposite in="b" in2="SourceGraphic" operator="in"></feComposite></filter>`;
/** A whole butterfly as standalone SVG, in a palette's three stops (colours, or the mark's variables). */
export function butterflyMarkSvg({ id, from, mid, to, viewBox = "-15 -15 259 259" }) {
  const edge = wingEdgeColour(from, to);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><defs><path id="${id}-outline" d="${BUTTERFLY_OUTLINE}"></path><linearGradient id="${id}-ink" x1="0" y1="0" x2="0.15" y2="1"><stop offset="0" style="stop-color:${from}"></stop><stop offset="0.55" style="stop-color:${mid}"></stop><stop offset="1" style="stop-color:${to}"></stop></linearGradient>${GRAIN_FILTER(id)}</defs>`
    + `<use href="#${id}-outline" style="fill:url(#${id}-ink);filter:url(#${id}-grain);stroke:${edge};stroke-width:2.2;stroke-linejoin:round"></use>`
    + `${butterflyArt({ id, edge, body: wingBodyColour(from, to), feelers: wingFeelerColour(from, to), outlineId: `${id}-outline` })}</svg>`;
}

const CLOUD_SHAPE_BEFORE = 'cloud:Po("Cloud",YJt([[Re-62,Re+26,56],[Re+62,Re+26,54],[Re,Re+34,62],[Re-24,Re-30,62],[Re+38,Re-26,54]]),{solid:[[-62,26,10,58],[62,26,-14,56],[0,34,24,64],[-24,-30,-22,64],[38,-26,16,56]]}';
const BUTTERFLY_SHAPE_AFTER = `cloud:Po("Butterfly",Yse(t=>{${BUTTERFLY_REACH_SOURCE}return[Re+dx*k,Re+dy*k]},200),{solid:${BUTTERFLY_SPHERES}}`;
const LIVE_EDGE = wingEdgeColour("var(--ink-from)", "var(--ink-to)");
const LIVE_ART = butterflyArt({ id: "@@", edge: "var(--wing-edge)", body: "var(--wing-body)", feelers: "var(--wing-feelers)" });
const STILL_ART = `<defs><path id="@@-outline" d="%CLIP%"/></defs>${butterflyArt({ id: "@@", edge: "%EDGE%", body: "%BODY%", feelers: "%BODY%", outlineId: "@@-outline" })}`;
export const AGENT_SPARKS_SOURCE = "function __simeonInk(g){const d=[[212,62,52],[204,58,60],[190,50,68]];if(!g||!g.isConnected)return d;try{const p=document.createElementNS(kie,\"g\");g.appendChild(p);const o=[\"--ink-from\",\"--ink-mid\",\"--ink-to\"].map((v,i)=>{p.style.fill=`var(${v})`;const m=/rgba?\\(\\s*([\\d.]+)[ ,]+([\\d.]+)[ ,]+([\\d.]+)/.exec(getComputedStyle(p).fill||\"\");if(!m||!getComputedStyle(g).getPropertyValue(v).trim())return d[i];const r=m[1]/255,G=m[2]/255,b=m[3]/255,x=Math.max(r,G,b),n=Math.min(r,G,b),l=(x+n)/2,c=x-n;let h=0,s=0;if(c){s=c/(1-Math.abs(2*l-1));h=x===r?((G-b)/c)%6:x===G?(b-r)/c+2:(r-G)/c+4;h*=60;if(h<0)h+=360}return[h,Math.min(s*100,88),Math.min(Math.max(l*100,52),74)]});p.remove();return o}catch{return d}}function __simeonSpark(K,j=10){const a=K[Math.random()*K.length|0];return`hsl(${((a[0]+$t(-j,j))%360+360)%360|0} ${a[1]|0}% ${Math.min(Math.max(a[2]+$t(-6,6),50),76)|0}%)`}";
/** The still renderer's details, in a palette's literal first and last stops; one id per palette, so two copies on a page agree. */
export const WING_STILL_SOURCE = `function __simeonWingStill(o,f,t){const e=${JSON.stringify(wingEdgeColour("%F%", "%T%"))}.split("%F%").join(f).split("%T%").join(t),b=${JSON.stringify(wingBodyColour("%F%", "%T%"))}.split("%F%").join(f).split("%T%").join(t),i="simeon-w"+(f+t).replace(/[^A-Za-z0-9]/g,"");return{rim:e,art:${JSON.stringify(STILL_ART)}.split("@@").join(i).split("%EDGE%").join(e).split("%BODY%").join(b).split("%CLIP%").join(o)}}`;
export const BUTTERFLY_REPLACEMENTS = Object.freeze([
  ["mark-butterfly-shape", CLOUD_SHAPE_BEFORE, BUTTERFLY_SHAPE_AFTER],
  // The details sit between the body (`G`, as PALETTE_REPLACEMENTS leaves it) and the eye group, which is not drawn; at mount they give the body its rim.
  ["mark-wing-art", 'p.jsxs("g",{clipPath:`url(#${N})`,children:[p.jsx("path",{style:WBe,ref:Q=>{U.current[0]=Q}})',
    `p.jsx("g",{className:"simeon-wing-art",style:{"--wing-edge":${JSON.stringify(LIVE_EDGE)},"--wing-body":${JSON.stringify(wingBodyColour("var(--ink-from)", "var(--ink-to)"))},"--wing-feelers":${JSON.stringify(wingFeelerColour("var(--ink-from)", "var(--ink-to)"))}},ref:w=>{const b=w?.previousElementSibling;b&&(b.style.stroke=${JSON.stringify(LIVE_EDGE)},b.style.strokeWidth="2.2",b.style.strokeLinejoin="round")},dangerouslySetInnerHTML:{__html:${JSON.stringify(LIVE_ART)}.split("@@").join(N)}}),p.jsxs("g",{clipPath:\`url(#\${N})\`,style:{display:"none"},children:[p.jsx("path",{style:WBe,ref:Q=>{U.current[0]=Q}})`],
  ["mark-wing-art-fade", 'G.current?.setAttribute("d",_t),Y.current?.setAttribute("d",_t),Vr=Jc,si=bn,Yi=Ua,ri=R.current}',
    'G.current?.setAttribute("d",_t),Y.current?.setAttribute("d",_t),Vr=Jc,si=bn,Yi=Ua,ri=R.current}{const w=G.current?.nextElementSibling,o=Math.max(0,1-2.2*Jc).toFixed(3);w&&(w.style.opacity=o);G.current&&(G.current.style.strokeOpacity=o)}'],
  ["still-mark-no-eyes", "m=`${o.path} ${nqe(l,u)} ${nqe(c,d)}`", "m=o.path"],
  ["still-mark-wings", 'x=`<path${r?\' class="b"\':""} fill="${t}" fill-rule="evenodd" d="${m}"/>`',
    'W=__simeonWingStill(m,r?r.light.from:t,r?r.light.to:t),x=`<path${r?\' class="b"\':""} fill="${t}" fill-rule="evenodd" d="${m}" style="stroke:${W.rim};stroke-width:2.2;stroke-linejoin:round"/>${W.art}`'],
  ["spin-lights-helper", "GBe=5,N_t=.09;function E_t({back:n,front:e,idPrefix:t,reduceMotion:s,radius:r}){", `GBe=5,N_t=.09;${AGENT_SPARKS_SOURCE}${WING_STILL_SOURCE}function E_t({back:n,front:e,idPrefix:t,reduceMotion:s,radius:r}){`],
  ["spin-sparks-ink", "if(!(s||!n)&&!(m.length>120))for(let Y=0;Y<W;Y++){", "if(!(s||!n)&&!(m.length>120))for(let Y=0,K=__simeonInk(n);Y<W;Y++){"],
  ["spin-sparks-colour", "color:X?WJt:k1e[Math.random()*k1e.length|0],round:!X&&Math.random()<.3,star:X,", "color:X?__simeonSpark(K.map(c=>[c[0],c[1],76]),6):__simeonSpark(K),round:!X&&Math.random()<.3,star:X,"],
  ["spin-trails-ink", "I=(W,H,G)=>{if(m.length>110)return;x.length||A();", "I=(W,H,G)=>{if(m.length>110)return;x.length||A();const K=__simeonInk(n),Ka=K[Math.random()<.5?0:1],Kb=K[K.indexOf(Ka)+1];"],
  ["spin-trails-hue", "color:k1e[Math.random()*k1e.length|0],round:!U,star:U,hue:N+G*360/Math.max(E,1)+$t(-14,14),hueSpan:$t(45,95)*(Math.random()<.5?1:-1),hueVel:$t(18,42)*sae.hueDrift*(Math.random()<.5?1:-1),",
    "color:__simeonSpark([Ka]),round:!U,star:U,hue:Ka[0]+$t(-8,8),hueSpan:((Kb[0]-Ka[0]+540)%360-180)+$t(-8,8),hueVel:$t(1,3)*(Math.random()<.5?1:-1),sat:(Ka[1]+Kb[1])/2,lit:[Ka[2],Kb[2]],"],
  ["spin-trails-stops", "j.stops[we].setAttribute(\"stop-color\",`hsl(${((je%360+360)%360).toFixed(0)} 56% ${(56+11*Pe).toFixed(0)}%)`)",
    "j.stops[we].setAttribute(\"stop-color\",`hsl(${((je%360+360)%360).toFixed(0)} ${(j.sat??56).toFixed(0)}% ${(j.lit?j.lit[0]+(j.lit[1]-j.lit[0])*Pe:56+11*Pe).toFixed(0)}%)`)"],
]);

export function patchOriginalButterfly(source) {
  let out = source;
  for (const [label, before, after] of BUTTERFLY_REPLACEMENTS) out = replaceExactlyOnce(out, before, after, label);
  return out;
}

/**
 * The two appended blocks name classes the pinned markup is supposed to
 * carry; a selector that misses no-ops silently (F-206, 25 September 2026).
 * So every class name in them is counted in the shipped stylesheet and in
 * every renderer chunk before the patch, and the counts go into the record
 * under `marks.styles`, with the names that appear nowhere listed as
 * `missing`. A miss does not stop the build (the material is cosmetic); it
 * is the line to read when a surface on the Mac looks unpatched.
 */
export function styleAnchorClasses(css) {
  const names = new Set();
  for (const match of css.matchAll(/\.((?:sand|simeon)-[A-Za-z0-9_-]+)/g)) names.add(match[1]);
  return [...names].sort();
}

export function countStyleAnchors(classes, sources) {
  const counts = {};
  for (const name of classes) {
    let count = 0;
    for (const source of sources) count += source.split(name).length - 1;
    counts[name] = count;
  }
  return { counts, missing: Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw new Error(`Original renderer ${label} anchor is missing or ambiguous.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchOriginalSettingsRegistry(source) {
  return replaceExactlyOnce(source, REGISTRY_BEFORE, REGISTRY_AFTER, "settings registry");
}

export function patchOriginalSettingsPanel(source) {
  return source;
}

export async function applyOriginalRendererRouterPatch({ stageRoot }) {
  const assetsRoot = path.join(stageRoot, "dist", "renderer", "assets");
  const registryCandidates = [];
  const panelCandidates = [];
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const target = path.join(assetsRoot, name);
    const source = await readFile(target, "utf8");
    if (source.includes(REGISTRY_BEFORE)) registryCandidates.push({ name, target, source });
    if (source.includes(COMPONENT_ANCHOR) && source.includes(GENERAL_BEFORE) && source.includes(USAGE_BEFORE)) panelCandidates.push({ name, target, source });
  }
  if (registryCandidates.length !== 1 || panelCandidates.length !== 1) {
    throw new Error(`Expected one original Settings registry and panel chunk, found ${registryCandidates.length}/${panelCandidates.length}.`);
  }
  const changes = [];
  for (const [role, candidate, transform] of [
    ["registry", registryCandidates[0], patchOriginalSettingsRegistry],
    // The Settings panel's one change is the Manage plan card under the usage
    // meters (6 October 2026), recorded as the "panel" row: the verifier
    // (macos-package-verification.mjs, readRendererExtensionRecord) takes one
    // row per chunk and only the roles "registry" and "panel"; a third row,
    // "manage-plan", on the same chunk failed the release's tests on the Air
    // (7 October 2026).
    ["panel", panelCandidates[0], (source) => patchOriginalManagePlanPanel(patchOriginalSettingsPanel(source))],
  ]) {
    const patched = transform(candidate.source);
    // A transform that returns its input (the Settings panel since the Router
    // left the product) is not a change and is not recorded as one (F-199).
    if (patched === candidate.source) continue;
    await writeFile(candidate.target, patched);
    changes.push({
      role,
      path: `dist/renderer/assets/${candidate.name}`,
      original: { bytes: Buffer.byteLength(candidate.source), sha256: sha256(candidate.source) },
      patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) },
    });
  }
  // The marks: the landing and hero clouds and the loading logo live in one chunk.
  const markCandidates = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js")).map((name) => path.join(assetsRoot, name));
  const markChunks = [];
  for (const target of markCandidates) {
    const source = await readFile(target, "utf8");
    if (MARK_REPLACEMENTS.every(([, before]) => source.includes(before))) markChunks.push({ target, source });
  }
  if (markChunks.length !== 1) throw new Error(`Expected one original chunk carrying the landing mark, the onboarding hero and the loading logo, found ${markChunks.length}.`);
  if (!PALETTE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer palette anchors are not all in the mark chunk.");
  if (!BUBBLE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer user-bubble token is not in the mark chunk.");
  if (!SHAPE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer shape anchors are not all in the mark chunk.");
  if (!COPY_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer onboarding copy anchors are not all in the mark chunk.");
  if (!LOGO_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer file-kind and Plugins-button anchors are not all in the mark chunk.");
  if (!VOICE_CALL_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer voice-call anchors (chat header identity row, character settings) are not all in the mark chunk.");
  if (!AGENT_PANE_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer agent pane anchors (the info pane, its view guard, the chat header's computer button) are not all in the mark chunk.");
  if (!HANDOFF_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer take-over card anchor is not in the mark chunk.");
  if (!SIDEBAR_DISCS_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer sidebar anchors (the header, the rail's new button, the search bar) are not all in the mark chunk.");
  if (!BUTTERFLY_REPLACEMENTS.every(([, before]) => markChunks[0].source.includes(before))) throw new Error("Original renderer mark engine anchors (the cloud's geometry, the body and eyes, the still renderer, the spin's lights) are not all in the mark chunk.");
  const logoAssets = await readLogoAssets();
  const markPatched = patchOriginalButterfly(patchOriginalSidebarDiscs(patchOriginalCooStep(patchOriginalFlights(patchOriginalHandoff(patchOriginalAgentPane(patchOriginalManagePlan(patchOriginalVoiceCall(patchOriginalChatLayout(patchOriginalLogos(patchOriginalCopy(patchOriginalShapes(patchOriginalBubble(patchOriginalPalette(patchOriginalMarks(markChunks[0].source))))), appMentionNames(logoAssets.mentions)))))))))));
  // The stylesheet's light default of the same variable, for first paint.
  const stylesheets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  const bubbleSheets = [];
  for (const target of stylesheets) {
    const css = await readFile(target, "utf8");
    if (css.includes(BUBBLE_CSS_REPLACEMENT[1])) bubbleSheets.push({ target, css });
  }
  if (bubbleSheets.length !== 1) throw new Error(`Expected one stylesheet carrying the user bubble default, found ${bubbleSheets.length}.`);
  const stylesheetPatched = patchOriginalSidebarDiscsStylesheet(patchOriginalCooStylesheet(patchOriginalWordmarkStylesheet(patchOriginalFlightsStylesheet(patchOriginalHandoffStylesheet(patchOriginalAgentPaneStylesheet(patchOriginalManagePlanStylesheet(patchOriginalVoiceCallStylesheet(patchOriginalLogosStylesheet(patchOriginalShapePickerStylesheet(patchOriginalGlassStylesheet(patchOriginalHeaderStylesheet(patchOriginalBubbleStylesheet(bubbleSheets[0].css)))), logoAssets)))))), logoAssets.wordmarkFont)));
  const chunkSources = [];
  for (const target of markCandidates) chunkSources.push(await readFile(target, "utf8"));
  // The blocks spell the window's tokens as the token pass below leaves them.
  const anchorSources = [bubbleSheets[0].css, ...chunkSources].map((source) => patchOriginalUpstreamTokens(source).source);
  const styleAnchors = {
    header: countStyleAnchors(styleAnchorClasses(HEADER_CARD_CSS), anchorSources),
    glass: countStyleAnchors(styleAnchorClasses(LIQUID_GLASS_CSS), anchorSources),
    // Only the window's own classes: the simeon- ones are drawn by this patch.
    voiceCall: countStyleAnchors(styleAnchorClasses(voiceCallCss()).filter((name) => name.startsWith("sand-")), anchorSources),
    sidebarDiscs: countStyleAnchors(styleAnchorClasses(SIDEBAR_DISCS_CSS).filter((name) => name.startsWith("sand-")), anchorSources),
  };
  for (const [block, result] of Object.entries(styleAnchors)) {
    if (result.missing.length > 0) console.warn(`renderer patch: ${result.missing.length} ${block} style anchor(s) appear nowhere in the pinned renderer: ${result.missing.join(", ")}`);
  }
  await writeFile(bubbleSheets[0].target, stylesheetPatched);
  await writeFile(markChunks[0].target, markPatched);
  const appIconTarget = path.join(assetsRoot, APP_ICON_ASSET);
  const appIconBefore = await readFile(appIconTarget).catch(() => null);
  await copyFile(APP_ICON_SOURCE, appIconTarget);
  const appIconAfter = await readFile(appIconTarget);
  const marks = {
    chunk: path.relative(stageRoot, markChunks[0].target),
    replacements: [...[...MARK_REPLACEMENTS, ...PALETTE_REPLACEMENTS, ...BUBBLE_REPLACEMENTS, ...SHAPE_REPLACEMENTS, ...COPY_REPLACEMENTS, ...LOGO_REPLACEMENTS, ...CHAT_LAYOUT_REPLACEMENTS, ...VOICE_CALL_REPLACEMENTS, ...AGENT_PANE_REPLACEMENTS, ...HANDOFF_REPLACEMENTS, ...SIDEBAR_DISCS_REPLACEMENTS, ...BUTTERFLY_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT].map(([label]) => label), "chat-header-card", "liquid-glass-chrome", "sidebar-discs", "shape-pickers-hidden", "title-tag-blue", "file-and-app-logos", "voice-call-styles", "agent-pane-styles", "switch-blue", "take-over-card-styles"],
    userBubble: { light: USER_BUBBLE_LIGHT, dark: USER_BUBBLE_DARK, stylesheet: path.relative(stageRoot, bubbleSheets[0].target) },
    // The stylesheet's hashes, so `npm run verify` can check the packaged
    // file against what this patch wrote (25 September 2026: verify read
    // only the pinned inventory and failed on the first patched file).
    stylesheet: { path: path.relative(stageRoot, bubbleSheets[0].target), original: { bytes: Buffer.byteLength(bubbleSheets[0].css), sha256: sha256(bubbleSheets[0].css) }, patched: { bytes: Buffer.byteLength(stylesheetPatched), sha256: sha256(stylesheetPatched) } },
    original: { bytes: Buffer.byteLength(markChunks[0].source), sha256: sha256(markChunks[0].source) },
    patched: { bytes: Buffer.byteLength(markPatched), sha256: sha256(markPatched) },
    appIcon: { path: `dist/renderer/assets/${APP_ICON_ASSET}`, original: appIconBefore == null ? null : { bytes: appIconBefore.length, sha256: sha256(appIconBefore) }, patched: { bytes: appIconAfter.length, sha256: sha256(appIconAfter) } },
    styles: styleAnchors,
  };
  // The name, over every chunk and the page, after the Settings patch landed.
  const brandFiles = [];
  const brandTotals = Object.fromEntries([...BRAND_REPLACEMENTS.map(([before]) => before), ...BRAND_WORD_REPLACEMENTS.map(([, , label]) => label), ...BRAND_PHRASE_REPLACEMENTS.map(([before]) => before)].map((key) => [key, 0]));
  const brandTargets = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js") || name.endsWith(".css")).map((name) => path.join(assetsRoot, name));
  brandTargets.push(path.join(stageRoot, "dist", "renderer", "index.html"));
  const brandSources = [];
  const tokenTotals = Object.fromEntries(UPSTREAM_TOKEN_REPLACEMENTS.map(([label]) => [label, 0]));
  for (const target of brandTargets) {
    let source;
    try { source = await readFile(target, "utf8"); } catch { continue; }
    const branded = patchOriginalBrandStrings(source);
    const tokens = patchOriginalUpstreamTokens(branded.source);
    const patched = tokens.source;
    const counts = branded.counts;
    brandSources.push(patched);
    for (const [label, count] of Object.entries(tokens.counts)) tokenTotals[label] += count;
    if (patched === source) continue;
    await writeFile(target, patched);
    for (const [before, count] of Object.entries(counts)) brandTotals[before] += count;
    brandFiles.push({ path: path.relative(stageRoot, target), counts, tokens: tokens.counts, original: { bytes: Buffer.byteLength(source), sha256: sha256(source) }, patched: { bytes: Buffer.byteLength(patched), sha256: sha256(patched) } });
  }
  if (brandTotals["Grok Bot"] === 0) throw new Error("Expected the original renderer to name Grok Bot at least once; the brand pass found none.");
  if (bubbleSheets[0].css.includes("--cursor-") && tokenTotals["css-variables"] === 0) throw new Error("Expected the original renderer to carry the upstream's CSS variables; the token pass found none.");
  for (const source of brandSources) {
    if (source.includes("--cursor-")) throw new Error("A renderer file still carries an upstream CSS variable after the token pass.");
  }
  console.log(`renderer patch: upstream tokens renamed ${JSON.stringify(tokenTotals)}`);
  const brandResidue = countBrandResidue(brandSources);
  console.log(`renderer patch: brand residue after the pass ${JSON.stringify(brandResidue)}`);
  // Every renderer file this pass rewrote: its bytes before the first pass and
  // after the last. scripts/verify.mjs checks these files against `patched`.
  const firstOriginals = new Map();
  for (const [relative, original] of [
    ...changes.map((change) => [change.path, change.original]),
    [marks.chunk, marks.original],
    [marks.userBubble.stylesheet, { bytes: Buffer.byteLength(bubbleSheets[0].css), sha256: sha256(bubbleSheets[0].css) }],
    [marks.appIcon.path, marks.appIcon.original],
    ...brandFiles.map((file) => [file.path, file.original]),
  ]) if (!firstOriginals.has(relative)) firstOriginals.set(relative, original);
  const files = [];
  for (const [relative, original] of firstOriginals) {
    const bytes = await readFile(path.join(stageRoot, relative));
    files.push({ path: relative, original, patched: { bytes: bytes.length, sha256: sha256(bytes) } });
  }
  // A Settings chunk is rewritten again by the marks, brand and token passes
  // after `changes` recorded it, so its row carries the bytes after the last
  // pass, the same as `files`: the record's two inventories agree, which
  // `readRendererExtensionRecord` (macos-package-verification.mjs) requires
  // (measured 5 October 2026, on the first own-shell package).
  const finalPatched = new Map(files.map((file) => [file.path, file.patched]));
  // The icon font's file takes the stylesheet's new name for it. The pinned
  // inventory still lists the file under its old path; `renames` tells the
  // verification (macos-package-verification.mjs, verify.mjs) where it is.
  const renames = [];
  for (const name of await readdir(assetsRoot)) {
    if (!/^cursor-icons-16-.*\.woff2$/.test(name)) continue;
    const renamed = name.replace(/^cursor-icons-16-/, "simeon-icons-16-");
    await rename(path.join(assetsRoot, name), path.join(assetsRoot, renamed));
    renames.push({ from: path.posix.join("dist", "renderer", "assets", name), to: path.posix.join("dist", "renderer", "assets", renamed) });
  }
  // The pinned window has one; a staged renderer in a test may have none.
  if (renames.length !== (tokenTotals["icon-font-file"] > 0 ? 1 : 0)) throw new Error(`Expected ${tokenTotals["icon-font-file"] > 0 ? "one" : "no"} icon font file to rename, found ${renames.length}.`);
  const record = {
    schemaVersion: 3,
    mode: "original-renderer-settings-extension",
    chunks: changes.map((change) => ({ ...change, patched: finalPatched.get(change.path) ?? change.patched })),
    marks,
    files,
    renames,
    brand: { tokens: tokenTotals, tokenReplacements: UPSTREAM_TOKEN_REPLACEMENTS.map(([label, pattern, after]) => ({ label, pattern: String(pattern), after })), replacements: [...BRAND_REPLACEMENTS.map(([before, after]) => ({ before, after })), ...BRAND_WORD_REPLACEMENTS.map(([pattern, after, label]) => ({ before: label, pattern: String(pattern), after })), ...BRAND_PHRASE_REPLACEMENTS.map(([before, after]) => ({ before, after }))], totals: brandTotals, files: brandFiles, residue: brandResidue },
    // The router-provider and usage-panel features were listed here while
    // `patchOriginalSettingsPanel` returned its input (F-199): a no-op is
    // not a feature, and a chunk it did not change is not a chunk above.
    features: ["brand-simeon", "landing-mark-cloud", "hero-mark-cloud", "loading-logo-mark", "app-icon-simeon", "agent-palettes-twelve", "user-bubble-blue", "user-bubble-sky-wash", "chat-header-card", "liquid-glass-chrome", "marks-ocean", "shapes-cloud-only", "onboarding-copy", "title-tag-blue", "file-logos", "connect-apps-button", "app-mentions", "agent-mentions", "cards-blue", "cards-white", "notion-light", "agent-bubble-messages-grey", "cards-grey", "exchange-header-centred", "choice-radio", "sidebar-glass-only", "selected-row-white", "header-name-glass", "send-blue", "slack-logo", "file-title-centred", "chat-docked-when-empty", "agent-message-sheet", "cards-sheet", "user-bubble-sheet", "sidebar-sheet", "voice-call-button", "voice-picker", "wordmark-suravaram", "coo-step", "first-agent-simeon", "name-step", "meet-step-turn", "flight-results", "upstream-tokens", "sidebar-glass-discs", "pane-widest-default", "pane-three-tabs", "mark-butterfly", "mark-no-eyes", "spin-lights-agent-colours", "manage-plan-card"],
    transformations: ["settings-registry", "marks", "app-icon", "brand-strings", "upstream-tokens", "icon-font-file"],
  };
  const provenancePath = path.join(stageRoot, "dist", "renderer-router-extension.json");
  await writeFile(provenancePath, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, provenancePath, provenanceBytes: (await stat(provenancePath)).size };
}
