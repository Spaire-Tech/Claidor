import type { ChannelOutboundMessage } from "../../../shared/channel-messaging.js";
import { SLACK_PLATFORM } from "../../../shared/channels.js";
import { chunkText, readAttachmentFile } from "./channel-http.js";
import type { SlackSend } from "./channel-server.js";
import type { ChannelConnector, ConnectorCallbacks } from "./connector.js";
import { SLACK_MESSAGE_LIMIT } from "./slack-connector.js";

/** A file larger than this goes as its address, not uploaded (the server's own limit, `slack_app.FILE_MAX_BYTES`). */
export const APP_SLACK_FILE_MAX_BYTES = 10 * 1024 * 1024;

export interface AppSlackConnectorOptions {
  readonly agentId: string;
  readonly callbacks: ConnectorCallbacks;
  readonly send: (message: SlackSend) => Promise<void>;
}

/**
 * An agent's Slack through Simeon's own Slack app (12 November 2026,
 * `server/simeon/desktop/slack_app.py`). There is nothing to open here: the
 * server hears the workspace (Slack's Events API) and puts what concerns this
 * agent in the inbox, and the agent's answers go back through the server,
 * which holds the workspace's token and posts them under the agent's name.
 * The thread an answer goes to is the last one heard in that conversation,
 * as the token bot's (`SlackConnector.noteThread`).
 */
export class AppSlackConnector implements ChannelConnector {
  readonly platform = SLACK_PLATFORM;
  private readonly threads = new Map<string, string>();

  constructor(private readonly options: AppSlackConnectorOptions) {}

  start(): void { this.options.callbacks.onStatus("connected"); }
  async stop(): Promise<void> {}
  setActivity(): void {}

  noteThread(chat: string, thread: string | undefined): void {
    if (thread != null) this.threads.set(chat, thread); else this.threads.delete(chat);
  }

  async deliver(chat: string, message: ChannelOutboundMessage): Promise<void> {
    const thread = this.threads.get(chat);
    const base = { agentId: this.options.agentId, chat, ...(thread == null ? {} : { thread }) };
    const log = this.options.callbacks.log;
    if (message.kind === "text") {
      for (const chunk of chunkText(message.text, SLACK_MESSAGE_LIMIT)) await this.options.send({ ...base, text: chunk });
      log("delivery", { chat, kind: "text", chars: message.text.length, thread: thread != null, via: "app" });
      return;
    }
    const file = await readAttachmentFile(message.url);
    if (file == null || file.bytes.byteLength > APP_SLACK_FILE_MAX_BYTES) {
      // An address the person can open, or a file too big to send: its words and its address.
      const text = [message.caption, file == null ? message.url : `${file.name} (too big to send)`].filter((part): part is string => part != null && part.length > 0).join("\n");
      await this.options.send({ ...base, text });
      log("delivery", { chat, kind: "link", via: "app" });
      return;
    }
    await this.options.send({ ...base, file: { name: file.name, data: Buffer.from(file.bytes).toString("base64") }, ...(message.caption == null ? {} : { caption: message.caption }) });
    log("delivery", { chat, kind: "file", name: file.name, bytes: file.bytes.byteLength, via: "app" });
  }
}
