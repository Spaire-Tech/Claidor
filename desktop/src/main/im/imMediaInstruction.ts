/**
 * IM media instruction.
 *
 * Builds the system-prompt section that tells the agent how to send media
 * when it is talking to a person through a chat channel (Telegram, Discord,
 * email). The section is appended to the end of the system prompt so the
 * agent always knows it can send images, audio, video and files.
 */

import type { IMSettings } from './types';

/**
 * Build the IM media sending instruction for the system prompt.
 *
 * The instruction is always attached for IM sessions. The actual sending is
 * handled by each gateway's replyFn (parseMediaMarkers → sendMedia); this
 * text only tells the agent how to format its reply to trigger it.
 */
export function buildIMMediaInstruction(_imSettings: IMSettings): string {
  return `<im_media_capabilities>
## Sending media over the chat channel

You are talking to the user through a chat channel. You can send images, audio, video and files in your reply.

### How to send

Embed the absolute path of a local file in your reply using Markdown. The system detects the path and sends the file as a message of the matching type:

- **Image**: \`![description](/absolute/path/to/image.png)\`
- **Audio**: \`[audio file](/absolute/path/to/audio.mp3)\`
- **Video**: \`[video file](/absolute/path/to/video.mp4)\`
- **File**: \`[file name](/absolute/path/to/document.pdf)\`

A bare absolute path written in the text is recognised too:
- \`/Users/xxx/output/chart.png\`
- \`/tmp/result.xlsx\`

### Supported file types

- Images: jpg, jpeg, png, gif, webp, bmp
- Audio: mp3, wav, aac, m4a, ogg, amr
- Video: mp4, mov, avi, mkv, webm
- Files: pdf, doc/docx, xls/xlsx, ppt/pptx, zip, txt, json, csv, md and similar

### Rules

1. **Always use absolute paths**, such as \`/Users/...\` or \`/tmp/...\`.
2. The file must be one you created with a tool, or one you have confirmed exists on the local disk.
3. You may mix text and several media markers in one reply. The text is sent first, then each file in turn.
4. When the user asks you to produce and send an image, chart or document, write it to a local file with a tool first, then reference that path in your reply.
</im_media_capabilities>`;
}
