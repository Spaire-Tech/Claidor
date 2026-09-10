# The personal library

September 10, 2026. Step 2 of `docs/swen/plan.md`. Registered before code.

## What it is

Swen knows every document on the person's computer and answers with the
file and the page. The index is built on the machine with a small local
embedding model and kept in the app's own database. Nothing leaves the
machine to build it. At question time only the passages the task needs go
to the model, per the privacy sentence in the plan.

## What the person sees

- **Settings → Library.** A switch (on by default after onboarding asks),
  the folders being indexed (Documents, Desktop and the current project
  folder to start; add or remove any folder), the kinds of files (Word,
  Excel, PowerPoint, PDF, text, Markdown, CSV), a status line (« 1,240
  documents, last updated two minutes ago »), Pause and Rebuild.
- **In the chat.** When a question touches their documents, the answer
  names the file and the page, sheet or slide, and the file name is a link
  that opens or reveals the file. No new chat screen.
- **Nothing else in v1.** No separate search screen, no upload, no cloud.

## How it works

**Where the index lives.** In `swen.sqlite`, the app's single database,
through `initializeLibraryTables` (`src/main/library/libraryMigrations.ts`)
next to the artifact library tables that already exist. Three tables:
`library_documents` (path key, size, modified time, content hash, kind,
title, page count, indexed at, error), `library_chunks` (document, ordinal,
locator such as page 3 / sheet Budget / slide 7 / heading, text), and
`library_chunk_vectors` (chunk, a `Float32Array` blob of 384 numbers). A
FTS5 virtual table over the chunk text gives keyword search; SQLite's FTS5
is compiled into the app's better-sqlite3 already.

**Why no native vector extension.** The app never loads SQLite extensions,
the backup manager reopens the database with a plain connection, and a
personal corpus is thousands of chunks, not millions. Keyword candidates
from FTS5 reranked by cosine similarity in JavaScript over the blobs answer
a question in tens of milliseconds and add no native surface to package.

**The embedding model.** `bge-small-en-v1.5`, quantised, 34 MB, 384
dimensions, run by transformers.js. Proven on this machine: model ready in
under half a second, four passages embedded in sixty milliseconds, correct
file and page on three test questions. The model files ship inside the
installer (fetched at build time from a pinned revision with a checksum,
never committed), so the library works offline and no model download is
needed on first run.

**Extraction.** Pure JavaScript parsers in a separate process, not the
window: Word through mammoth (paragraphs and headings), PDF through
pdfjs-dist's Node build (text per page), Excel through the xlsx package
already in the app (rows per sheet, header row repeated), PowerPoint
through jszip and the slide XML (text per slide), text, Markdown and CSV
as they are. Chunks are about 700 characters with a 100-character overlap,
never crossing a page, sheet or slide, each carrying its locator.

**Where the work runs.** A `utilityProcess` « document worker » owned by a
new `LibraryContentIndexer` in the main process, modelled on the existing
`LibraryIndexService` (folder watchers with a 300 ms debounce, a bounded
queue, retry ladder, a resumable cursor in `kv`). The worker does
extraction, chunking and embedding; the main process owns the database.
Concurrency two, low priority; the machine must stay usable while the
first index builds. A document is re-indexed only when its size or
modified time changes; a deleted or moved file loses its chunks.

**How the agent reaches it.** A tool, `search_library`, not prompt
injection: a new OpenClaw extension in `openclaw-extensions/search-library`
registered the way `ask-user-question` is, hidden from chat-channel
sessions, calling back over the loopback bridge (`McpBridgeServer`, new
route `/library/search`, secret-authenticated) into the main process. It
takes a query and an optional folder filter and returns up to eight
passages with file path, locator and text. One paragraph is appended to
the managed section of the engine's `AGENTS.md`: the library exists, use
the tool when the question concerns the person's documents, cite the file
and the page. If recall proves weak, the per-turn injection hook in
`buildOutboundPrompt` stays available as an additive fallback.

**Settings and config.** New fields on `CoworkConfig`: `libraryEnabled`,
`libraryFolders`, `libraryExcludedFolders`. No migration: the config table
is key/value. The Library tab in Settings is its own component under
`src/renderer/components/library/`.

## What is out of scope in v1

OCR of scanned PDFs, images, email archives, Outlook PST files, cloud
drives that are not synced to a local folder, a team library (that is
WeKnora, step 11), re-ranking with a cross-encoder, multilingual models.

## How we know it works

- Unit tests: chunking (boundaries, overlap, locators), extraction on one
  sample of each kind, hybrid ranking on a fixed corpus, the bridge route
  with and without the secret, the migration.
- A measured run: index a folder of a few hundred mixed office files on
  this machine; report documents per minute, index size, memory, and the
  answer to ten questions with the expected file and page.
- The screenshot for the founder: a question about a document, the
  answer with the citation, the file opening from the link.

## Where things stand, September 10

Built as designed, with three things worth knowing.

**Search is a blend, not a rerank.** Keyword candidates alone missed
questions with no word in common with the passage (« remote working
rules » against « work from home »). So the vectors are scanned as well,
in memory, and the final order is roughly two thirds cosine and one third
keyword rank. Question words (« how much is the ») are dropped from the
keyword side. A passage with nothing in common with the question is never
returned, however short the list.

**The measured run**, on this build machine, all on the CPU, from the
guarded test `libraryContent.measured.test.ts`
(`SWEN_LIBRARY_MEASURE=1`): 340 generated office files of every kind, 340
indexed, none failed, 713 passages, in under ten seconds, so a few
thousand documents a minute; the index about 1.4 MB; the model loads in
about a third of a second; a question takes ten to twenty milliseconds.
All ten questions returned the right file and the right page, sheet,
slide or heading first. Real documents are longer and slower than
generated ones; the number to watch on a real disk is minutes for the
first index, not seconds.

**Seen running in the app.** The worker starts inside the built app as its
own process, loads the model, and reads the files in Documents and
Desktop; Settings → Library shows the switch, the folders and the status
line. Not yet seen: the agent answering a question with a citation through
the chat, which needs the real conversation of step 1 (a signed-in engine
run on the founder's machine).

**In the installer.** The macOS build on GitHub Actions (run 8, the
library commit) packaged with the model fetch, the ONNX runtime unpacked
and the other platforms' binaries left out, and produced the artifact.
The installer grew from about 300 MB to about 455 MB. The model is 34 MB
and the Mac ONNX binary 35 MB; the rest is the transformers.js package
and its optional dependencies, which the next packaging round should
trim (the browser runtime files and the image library it pulls in are
not used). One limit found on the way: the ONNX runtime package ships no
binary for Intel Macs, so on those the library would report « could not
start » until a build for them exists.
