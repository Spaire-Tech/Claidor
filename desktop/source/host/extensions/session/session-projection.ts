import { classifyAttachment as classifySharedAttachment, countAttachmentKinds } from "../../../shared/media/attachment-summary.js";
import type { SandAttachmentKind } from "../../../shared/media/attachments.js";
import { say, type WordKey } from "../../../shared/say.js";
import { currentUserLanguage } from "../../../shared/user-language.js";
import { voiceCallLineText } from "../../../shared/voice-call/main-loop-voice.js";
export function getUpdatedAtFromStats(metadata: { createdAt: number }, stats?: { mtimeMs: number }): number { return Math.max(Number(metadata.createdAt), Math.floor(Number(stats?.mtimeMs ?? 0))); }
export function getSummaryUpdatedAt(metadata: { createdAt: number }, unread: { lastActivityAt: number }): number { return Math.max(Number(metadata.createdAt), unread.lastActivityAt); }
export function seedActivityFromMtime(db: { getUnreadState(): { lastActivityAt: number }; get(key: string): Uint8Array | number; markActivity(at: number): void }, agentId: string, stats?: { mtimeMs: number }): void { if (db.getUnreadState().lastActivityAt > 0) return; const root = db.get("latestRootBlobId"); if (!(root instanceof Uint8Array) || root.length === 0) return; db.markActivity(getUpdatedAtFromStats({ createdAt: Number(db.get("createdAt")) }, stats)); void agentId; }
export function isHttpsUrl(raw: string): boolean { try { return new URL(raw).protocol === "https:"; } catch { return false; } }
export interface AttachmentMessage { type: "attachment"; url: string; file_name?: string | null }
export function isLinkAttachmentMessage(message: { type: string; url: string; file_name?: string | null }): boolean { return message.type === "attachment" && isHttpsUrl(message.url) && !message.file_name; }
// The renderer reads `kinds` as an array of { kind, count } and calls
// .filter on it (`Yun`); until 23 September 2026 this file carried its own
// classifier and returned a { [kind]: count } object, and the first
// attachment an agent sent ("TypeError: n.filter is not a function" in the
// sidebar row) took the whole window down, on every launch, until that
// agent said something else. The shared classifier speaks the renderer's
// vocabulary (image, video, audio, pdf, markdown, table, json, text,
// document, archive, file) and its counter returns the array.
function classifyAttachment(value: { fileName?: unknown; urlOrPath?: unknown }): SandAttachmentKind { return classifySharedAttachment({ fileName: value.fileName == null ? null : String(value.fileName), urlOrPath: value.urlOrPath == null ? null : String(value.urlOrPath) }); }
function countKinds(kinds: readonly SandAttachmentKind[]): { kind: SandAttachmentKind; count: number }[] { return countAttachmentKinds(kinds); }
function sameBatch(candidate: unknown, anchor: unknown): boolean { return typeof anchor === "string" && anchor.length > 0 && candidate === anchor; }
export function collectLastAttachmentBatchKinds(entries: readonly Record<string, unknown>[], index: number): SandAttachmentKind[] { const last = entries[index], kinds: SandAttachmentKind[] = []; if (last?.kind === "user-attachment") { for (let i=index;i>=0;i--) { const entry=entries[i]; if (entry?.kind!=="user-attachment" || i!==index&&!sameBatch(entry.batchId,last.batchId)) break; kinds.push(classifyAttachment({fileName:entry.file_name,urlOrPath:entry.file_path})); } } else if (last?.kind === "send-message" && typeof last.message === "object" && last.message != null && (last.message as Record<string,unknown>).type === "attachment") { for(let i=index;i>=0;i--){const entry=entries[i],message=entry?.message as Record<string,unknown>|undefined;if(entry?.kind!=="send-message"||message?.type!=="attachment"||isLinkAttachmentMessage(message as unknown as AttachmentMessage)||i!==index&&!sameBatch(entry.batchId,last.batchId))break;kinds.push(classifyAttachment({fileName:message.file_name,urlOrPath:message.url}));} } return kinds.reverse(); }
export function buildAttachmentLastEntry(entries: readonly Record<string, unknown>[], index: number): Record<string, unknown> { const kinds=collectLastAttachmentBatchKinds(entries,index);return{kind:"attachment",count:kinds.length,kinds:countKinds(kinds)}; }
function previewText(raw: unknown): string { return String(raw ?? "").replace(/\s+/g," ").replace(/[*_`#>]/g,"").trim().slice(0,280); }
// A card's words for the list's row and the phone's notification (12 October 2026: a question card's push read "widget",
// its type's name): what the card says, as `sendMessagePreviewText` has it, read field by field since a stored card may
// be partial; a sentence of our own when it says nothing, never the type's name.
function cardText(object: unknown, key: string): string | null { const value = object != null && typeof object === "object" ? (object as Record<string, unknown>)[key] : undefined; return typeof value === "string" && value.trim().length > 0 ? value : null; }
// The words are the person's language (`say`, `currentUserLanguage`, 20 October 2026).
function cardPreviewText(message: Record<string, unknown>): string | null { const language = currentUserLanguage(); switch (message.type) { case "widget": return cardText(message.widget, "prompt") ?? say(language, "preview.hasQuestion"); case "secret-request": return cardText(message.secretRequest, "label") ?? say(language, "preview.needsSecret"); case "email-draft": return cardText(message.draft, "subject") ?? cardText(message.draft, "body") ?? say(language, "preview.draftedEmail"); case "slack-draft": return cardText(message.draft, "body") ?? say(language, "preview.draftedSlack"); case "permission-request": return cardText(message.permission, "title") ?? say(language, "preview.needsPermission"); case "auto-review-approval": { const summary = cardText(message.approval, "summary"); return summary == null ? say(language, "preview.needsApproval") : say(language, "preview.approvalRequired", { summary }); } case "local-tool-permission": { const target = cardText(message.ask, "target"); return target == null ? say(language, "preview.needsPermission") : say(language, "preview.permissionRequired", { target }); } case "connector": { const name = cardText(message, "connector"); return name == null ? say(language, "preview.connectApp") : message.variant === "connected" ? say(language, "preview.connected", { name }) : say(language, "preview.connect", { name }); } case "connectors": { const names = Array.isArray(message.connectors) ? message.connectors.filter((name): name is string => typeof name === "string" && name.length > 0) : []; return names.length > 0 ? say(language, "preview.connect", { name: names.join(", ") }) : say(language, "preview.connectTools"); } case "listener-connect": return say(language, "preview.connect", { name: message.platform === "slack" ? "Slack" : "GitHub" }); case "cloud-agent": return cardText(message, "title") ?? say(language, "preview.cloudAgent"); case "purchase": return cardText(message, "content") ?? say(language, "preview.checkout"); case "agent-joined": { const name = cardText(message, "name"); return name == null ? null : say(language, "joined.title", { name }); } } return null; }
const ATTACHMENT_KIND_WORDS: Readonly<Record<SandAttachmentKind, WordKey>> = { image: "attachment.image", video: "attachment.video", audio: "attachment.audio", pdf: "attachment.pdf", markdown: "attachment.markdown", table: "attachment.table", json: "attachment.json", text: "attachment.text", document: "attachment.document", archive: "attachment.archive", file: "attachment.file" };
export function lastMessagePreviewText(message: Record<string, unknown>): string { const language=currentUserLanguage();if(message.type==="text")return previewText(message.content);if(message.type==="attachment"&&typeof message.url==="string"&&isLinkAttachmentMessage(message as unknown as AttachmentMessage))return say(language,"preview.sentLink",{url:message.url});if(message.type==="attachment")return say(language,"preview.sentAttachment",{kind:say(language,ATTACHMENT_KIND_WORDS[classifyAttachment({fileName:message.file_name,urlOrPath:message.url})])});const card=cardPreviewText(message);if(card!=null)return previewText(card);if(typeof message.title==="string")return previewText(message.title);if(typeof message.label==="string")return previewText(message.label);return say(language,"preview.sentMessage"); }
export function getLastMessageFromTranscript(entries: readonly Record<string, unknown>[]): { id: string; preview: string } | null { for(let i=entries.length-1;i>=0;i--){const entry=entries[i];if(entry?.kind!=="send-message"||typeof entry.id!=="string"||entry.message==null||typeof entry.message!=="object")continue;return{id:entry.id,preview:lastMessagePreviewText(entry.message as Record<string,unknown>)}}return null; }
/**
 * Who a line in the chat list's preview is between, when it is not the agent
 * and the person (15 October 2026; the founder: "when two agents talk to each
 * other, the chat preview shows as if its talking to me"). The chat folds
 * these as "Messaged Theo" and "Message from Theo"; the preview says "To
 * Theo: …" and "From Theo: …". A group's member, or another person in a
 * shared room, is named as the speaker ("Theo: …"). Lines of a call written
 * before calls were one line (a `voice-call:` peer named for the person) are
 * the person's and stay as they were. The text stays a `text` entry, so every
 * window draws it as before.
 */
function speakerOf(entry: Record<string, unknown>): string {
  const party = (value: unknown): { id: string; name: string } | null => {
    if (value == null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return { id: typeof record.id === "string" ? record.id : "", name: typeof record.name === "string" ? record.name.trim() : "" };
  };
  if (entry.kind === "send-message") {
    const author = party(entry.author);
    return author != null && author.name.length > 0 ? `${author.name}: ` : "";
  }
  const to = party(entry.toAgent), from = party(entry.fromAgent);
  const peer = to ?? from;
  if (peer != null) {
    if (peer.id.startsWith("voice-call:")) return "";
    const language = currentUserLanguage();
    const name = peer.name.length > 0 ? peer.name : say(language, "preview.anotherAgent");
    return say(language, to != null ? "preview.to" : "preview.from", { name });
  }
  const person = party(entry.fromUser);
  return person != null && person.name.length > 0 ? `${person.name}: ` : "";
}
const spoken = (entry: Record<string, unknown>, text: string): string => text.length === 0 ? text : speakerOf(entry) + text;
export function getLastEntryFromTranscript(entries: readonly Record<string, unknown>[]): Record<string, unknown> | null { const visible=entries.filter((entry)=>entry.hidden!==true&&entry.branched!==true);for(let i=visible.length-1;i>=0;i--){const entry=visible[i];if(entry==null||entry.peerAgentId!=null)continue;const call=entry.kind==="event"?voiceCallLineText(entry.event):null;if(call!=null)return{kind:"text",text:call};if(entry.kind==="send-message"&&entry.message&&typeof entry.message==="object"){const msg=entry.message as Record<string,unknown>;if(msg.type==="text")return{kind:"text",text:spoken(entry,String(msg.content??""))};if(msg.type==="widget"){const widget=msg.widget as Record<string,unknown>|undefined,prompt=typeof widget?.prompt==="string"?widget.prompt:say(currentUserLanguage(),"preview.question");return{kind:"text",text:entry.respondedValue==null?prompt:`${prompt} — ${String(entry.respondedValue)}`}}if(msg.type==="attachment"&&typeof msg.url==="string"&&isLinkAttachmentMessage(msg as unknown as AttachmentMessage))return{kind:"link",url:msg.url};return msg.type==="attachment"?buildAttachmentLastEntry(visible,i):{kind:"text",text:lastMessagePreviewText(msg)}}if(entry.kind==="message"&&typeof entry.content==="string"&&entry.content.length>0)return{kind:"text",text:spoken(entry,entry.content)};if(entry.kind==="user-attachment")return buildAttachmentLastEntry(visible,i)}return null; }
