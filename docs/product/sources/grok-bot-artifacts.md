# GrokBot Artifacts & Attachments — Internal Logic (From System)

**Private — Bass only.**  
**As of:** 2026-09-18 PT  
**Sources only:** live agent `SendToUser` contracts (injected host prompt strings), `/workspace/agent-system-contract.md`, `/workspace/caisra-chat-ui-logic.md`, `/workspace/bot-build-and-chat-report.md`, `/workspace/agent.md`, and host implementation in `/home/box/sand-host/host-main.cjs` (media classification / preview-kind / cloud-artifact sync).  
**Not invented.** Where client pixel chrome (exact iframe vs native pane) is not spelled out in those sources, it is labeled **Unknown — do not assume**.

---

## 0. Straight answer to “does a Word/Excel report open as an iframe?”

**Not established in system/agent docs.**  
What *is* established:

1. The agent delivers a **file** via `SendToUser` `type: "attachment"` (or an image gallery via `text` + `images[]`).
2. The **host classifies** that file into an attachment **kind** (image / video / audio / pdf / markdown / table / json / text / document / archive / file) from extension and/or MIME.
3. Word (`.doc`/`.docx`) classifies as **`document`**. Excel (`.xls`/`.xlsx`) plus `.csv`/`.tsv` classify as **`table`** (“spreadsheet” in user-facing kind labels).
4. PDF is a first-class preview kind; the host bundle includes **pdf.js** (`pdfjs-dist`) and a `pdf.worker` — i.e. PDF preview is implemented in-stack, not “mystery iframe Office.”
5. **No OnlyOffice / Collabora / generic office-iframe viewer** strings were found in `host-main.cjs` for chat attachments. Occurrences of `iframe` in that bundle include JS polyfill noise, not a documented chat artifact viewer.

So: **do not bake “artifacts open as an iframe” into Caisra design from agent-facing system truth.** Bake: **attachment message → kind classification → kind-specific preview or download affordance**, with Word=`document`, Excel/CSV=`table`, PDF=`pdf`. Exact Electron/webview chrome for `document`/`table` = **Unknown** until client UI source confirms it.

---

## 1. Vocabulary (don’t conflate)

| Term | Meaning in this stack |
| --- | --- |
| **Attachment** | A `SendToUser` message with `type: "attachment"` (or a user-uploaded file into chat). The durable chat object for a file. |
| **Inline images** | `type: "text"` with `images: [{url, alt?}]` — images render **inside the same bubble** under the text (one full width; several = compact gallery). |
| **Artifact (cloud agent)** | Files under a cloud agent VM path `/opt/cursor/artifacts/…`. Special sync rules (below). Not a separate SendToUser type. |
| **Computer preview** | Live desktop thumbnail in the per-agent info pane — **not** a file artifact. |
| **Cursor-agent card** | `type: "cursor-agent"` — opens a cloud agent; host text says “card” is only how the attachment renders. |

Agents do **not** have a SendToUser type literally named `artifact`. Product “artifacts” in chat = **attachments + inline images (+ cloud-artifact sync into attachments)**.

---

## 2. How an artifact gets into chat (agent path)

```
Agent creates file on box (/workspace/…)
        or on a registered user computer (machineId Shell)
        or receives tool path
        ↓
SendToUser
  • text + images[]     → image(s) with prose
  • type: attachment    → file/media message (url/path + optional alt)
        ↓
App copies/resolves path → transcript row
        ↓
Host classifies kind → UI preview or file chip
```

### 2.1 Path rules (live SendToUser guidance)

- Attachments use **`file://` paths on a registered user computer** or **`https://` URLs**.
- A **`/workspace` box file** can be attached by its **box path**; **the app copies it out**.
- Tool-returned images include a **real saved path** — use exactly; **never invent**.
- Prefer absolute paths (`file:///workspace/...` or real attachment/asset paths).
- **Never** invent paths.
- For **outside channels**: pass local `file://` or `https` — the platform **uploads the real file**; never send a bare path pretending to be the file.

### 2.2 Image vs attachment split (live prompt)

From host-injected SendToUser schema copy:

- If image(s) **belong WITH** what you’re saying → put them on the **text** message via `images[]` (same bubble, below text).
- Use `type: "attachment"` for an image **only when the image IS the whole message** (no accompanying text).
- **Videos and non-image files always go as attachments.**
- **Never** embed images as markdown `![](...)` in content.

Optional `alt` on attachment images: short description; shown on hover and in fullscreen viewer.

### 2.3 Delivery / turn rules

- Attachments are user-visible **only** via SendToUser (plain model text never delivers a file).
- Final “ping” may be the artifact itself; **ack ≠ delivery**.
- Prefer attaching when the file **proves** more than prose (reports, sheets, screenshots of totals, etc.) — showing-work rule.

---

## 3. Host classification (the real “artifact kinds”)

### 3.1 Public kind set (`SAND_ATTACHMENT_KINDS`)

Ordered kinds used for summaries / UI labeling:

1. `image`  
2. `video`  
3. `audio`  
4. `pdf`  
5. `markdown`  
6. `table`  ← user-facing label **“spreadsheet”** / “spreadsheets”  
7. `json`  
8. `text`  
9. `document`  ← Word  
10. `archive`  
11. `file`  ← fallback  

`formatAttachmentSentSummary` builds strings like `Sent 1 spreadsheet` / `Sent 3 files · 2 images, 1 PDF`.

### 3.2 Preview-kind function (`getFilePreviewKind`)

Extension → preview kind:

| Preview kind | Extensions (host) |
| --- | --- |
| `image` | Keys of servable image MIME map (png/jpg/webp/gif/… from extension tables) |
| `video` | `.m4v`, `.mov`, `.mp4`, `.ogv`, `.webm` (from VIDEO mime map) |
| `audio` | `.aac`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav`, `.weba` |
| `pdf` | `.pdf` |
| `table` | `.csv`, `.tsv`, `.xlsx`, `.xls` |
| `json` | `.json` |
| `markdown` | `.md`, `.markdown`, `.mdx` |
| `html` | `.html`, `.htm` |
| `docx` | `.docx` |
| `text` | If `isTextPreviewableName` (large TEXT_PREVIEWABLE_EXTENSIONS set: txt, log, code, yaml, xml, svg, …) |
| `unknown` | else |

### 3.3 Path/MIME → attachment kind (`classifyPathLike` / `classifyMimeType`)

Mapping highlights:

| Input | Attachment kind |
| --- | --- |
| preview `image|video|audio|pdf|markdown|table` | same |
| preview `docx` | **`document`** |
| preview `html` | **`text`** |
| preview `json` | `json` |
| preview `text` | `text` (or `json` if ext in JSON set) |
| preview `unknown` + archive ext | **`archive`** |
| MIME `image/*` / `video/*` / `audio/*` | image/video/audio |
| MIME `application/pdf` | pdf |
| MIME `text/markdown` | markdown |
| TABLE MIME set (csv, tsv, Excel OOXML / xls) | **table** |
| DOCUMENT MIME set (`application/msword`, Word OOXML) | **document** |
| ARCHIVE MIME set (zip, tar, gzip, rar, 7z, …) | archive |
| else | **file** |

**Implications for Bass’s examples:**

| User ask | Typical file | Kind label |
| --- | --- | --- |
| “Word doc” | `.docx` | **document** |
| “Excel / spreadsheet / report.csv” | `.xlsx` / `.xls` / `.csv` / `.tsv` | **table** (“spreadsheet”) |
| “PDF report” | `.pdf` | **pdf** |
| “Markdown report” | `.md` | **markdown** |
| “JSON dump” | `.json` | **json** |
| Screenshots with commentary | `.png` via `images[]` | inline gallery, not attachment kind |
| Zip of deliverables | `.zip` | **archive** |

---

## 4. Rendering logic (what system proves vs Unknown)

### 4.1 Proven
- Kind classification drives how the product **talks about** and **routes** the file (summary phrases, preview-kind switch).
- **PDF:** pdf.js present in host → in-process PDF preview capability.
- **Images:** fullscreen viewer mentioned in alt-text help; inline gallery for `images[]`.
- **Tables:** csv/tsv/xlsx/xls explicitly grouped as preview kind `table` / attachment kind `table`.
- **Documents:** docx → attachment kind `document` (distinct from `text` / `pdf`).

### 4.2 Unknown (do not assert in design docs)
- Whether `document` / `table` / `pdf` chrome is an **iframe**, WebContentsView, native panel, or download-only on some platforms.
- Editable-in-place Office (Word/Excel co-authoring) — **not** in agent/host attachment contracts.
- Pixel layout of the preview (side pane vs lightbox vs inline expand).

### 4.3 Safe design sentence for Caisra
> Chat files arrive as **attachments** (or inline images). The host **classifies** them into kinds; Word is a **document**, Excel/CSV a **table/spreadsheet**, PDF a **pdf**. Preview is kind-specific; do not assume a universal Office iframe.

---

## 5. Cloud agent “artifacts” (special case)

From live guidance + host sync helpers:

| Rule | Detail |
| --- | --- |
| VM path | Cloud agent writes under `/opt/cursor/artifacts/…` |
| Direct attach | **Renders blank** if you attach that VM path into chat |
| Fix | Use **cursor.com-hosted artifact URL** from the PR/body, **or copy out to the box** then attach the local file |
| Box landing | Host sync root: `/workspace/cloud-agent-artifacts/<bcId>/…` |
| Limits (host) | Max **12** synced artifacts; max **20 MiB** per artifact (`MAX_SYNCED_CLOUD_AGENT_ARTIFACTS`, `MAX_SYNCED_CLOUD_AGENT_ARTIFACT_BYTES`) |
| Planning | Sync prefers artifacts **cited** in the agent summary text; over-count / oversized → skipped with reason |

Agent-system-contract §29.6: don’t attach cloud VM-local paths that won’t render; use PR/hosted URLs or copy out first.

---

## 6. Surface matrix (where attachments work)

| Surface | Attachments | Notes |
| --- | --- | --- |
| In-app 1:1 chat | **Yes** | Full attachment + inline images |
| Group **room** turn | **No** | Only plain text to the room; widgets/attachments/cards never reach the room (`group-chat-turns`) |
| Private note during room | `to: "dm"` text (and normal 1:1 rules) | Room still doesn’t get the file via room SendToUser |
| External channel (`channel` set) | **Yes** (upload) | Text + attachments; degrade widgets/cards |
| Agent↔agent group | Images on SendToAgent are **1:1 only**; groups text-only for images | Separate from chat attachments |

---

## 7. User → agent file path (inverse)

- User can attach files in the composer.
- Attachments materialize with absolute paths; may live on a **registered machine**.
- Agent uses attached-files note → Read with `machineId` or **CopyToBox** before box-only tools.
- Nothing is preloaded into context as bytes unless the agent reads/copies.

---

## 8. Related non-file “cards” people confuse with artifacts

| Thing | Why it’s not a file artifact |
| --- | --- |
| Choice widget | Interactive decision card |
| Draft message composer | Editable outbound message |
| Cursor-agent card | Deep link into cloud agent |
| Computer live preview | Stream of box desktop |
| Voice memo | `voice_memo: true` on text — **not** an audio file attachment; fake `.m4a`/`.mp3` attachments forbidden for memos |

---

## 9. Agent authoring checklist (from system)

1. Create the real file on box or user machine.  
2. Prefer **box `/workspace/...`** then attach by path (app copies out).  
3. Word/Excel/PDF/CSV → `type: "attachment"`.  
4. Explaining a screenshot → `text` + `images[]`, not markdown image syntax.  
5. Standalone hero image → `attachment` with optional `alt`.  
6. Cloud agent outputs → hosted URL or copy to `/workspace/cloud-agent-artifacts/...` first.  
7. Don’t claim preview chrome (“opened as iframe”) unless client docs say so.  
8. In rooms, don’t try to attach — DM the file or share a link in text if policy allows.

---

## 10. Source map

| Source | Contribution |
| --- | --- |
| Host prompt: SendToUser images/attachment/path/cloud-artifact strings | §2, §5 |
| `host-main.cjs` `getFilePreviewKind`, `classifyAttachment`, kind labels, MIME sets, cloud artifact sync constants | §3, §5 |
| pdf.js in host bundle | §4 PDF preview capability |
| agent-system-contract §5 attachments, §29.6 artifacts | §2, §5 |
| caisra-chat-ui-logic / bot-build-and-chat-report SendToUser types + room matrix | §1, §6 |
| group-chat-turns skill | Room attachment ban |
| app-ui.md | Computer preview ≠ file artifact |

---

## 11. Gaps to close with client eng (explicit)

1. Confirm **document** and **table** preview implementation (iframe / webview / native / download-only).  
2. Whether `.doc` (legacy) preview equals `.docx`.  
3. Size limits for **non-cloud** chat attachments (only cloud sync limits found in host constants above).  
4. Whether preview is editable or read-only for spreadsheets/docs.

---

*Confidential. Bass / Caisra only. Do not publish.*
