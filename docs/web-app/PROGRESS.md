# The web and Windows app: progress

The running record of the web and Windows app (the founder, 1 November
2026: "document everything as you go so we dont rely on memory"). The plan
and the checklist are in `README.md`; this file says where the work is.

**Every change to the web or Windows app updates this file in the same
pull request:** the date, what was done, what was checked and how, what was
not checked, any decision and who made it, and what comes next. If this
file and the code disagree, the code is right and this file is fixed.

## Where it is now

| Step (`README.md`, "The order of work") | State |
|---|---|
| 0. The audit | Done, 1 November 2026 |
| 1. The base: the server and the computer, signing in, the window | Done, 1 November 2026 (1a to 1d). Carried to step 2: the first run for a new account and the access cover |
| 2. The sidebar and the chat | In progress: 2a (the chat's core, and the chat on screen) done; 2b (a message's actions, find, the working line, names in colour, link icons, the emoji picker) done; 2c part 1 (file cards, pictures from the computer, link cards) part 2 (the preview: text and code, Markdown, JSON, tables) and part 3a (pictures and videos full screen), part 3b (PDF, Word, sound) and part 3c (Excel) done. Next: 2e, the message field's own parts (attaching files, the ":" emoji list, "@", "/" and "#", dictation) |
| 3. The cards | Not started |
| 4. The agent's pane, search, new chat, the org chart, starter packs | Not started |
| 5. The computer and calls | Not started |
| 6. Connectors and Settings | Not started |
| 7. Windows | Not started |

## Decisions

| Date | Decision | By |
|---|---|---|
| 1 November 2026 | A Windows app is the next project | The founder |
| 1 November 2026 | The Windows app is Electron around a web app. The web app is a translation of the Mac app into Simeon Labs' own code, and replaces the old web app at `app.simeonlabs.com/app`. It is not built on the old web app, whose window is another company's compiled renderer (`desktop/NOTICE.md`) | Proposed in the session; the founder said "Go" |
| 1 November 2026 | The Mac app stays Swift. A new Mac feature is also needed in the web app, and the checks in `README.md` fail until it is there | Proposed in the session; the founder said "Go" |
| 1 November 2026 | Nothing is remembered: the checklist is generated from the code (`scripts/web_app_inventory.py`) and this file records the work as it happens | The founder |
| 1 November 2026 | The code lives in `clients/apps/app`: its own app in the web workspace, React, TypeScript and Vite, in the browser only. Not inside the Next website (`clients/apps/web`), because the Windows app loads the same files from disk, which needs plain built files and no server | The session; the founder left the open questions to the session ("Ok well all you") |
| 1 November 2026 | It is served at `app.simeonlabs.com/app-next` while it is built. The old web app stays at `/app` until the new one has everything the Mac app has; then the new one moves to `/app` | The session, as above |
| 1 November 2026 | Its built files are committed into `clients/apps/web/public/app-next`, as the old app's are, so the website's deploy does not change (Vercel builds only `web`). `pnpm test` fails when they are not the build of the source | The session, as above |
| 1 November 2026 | Skills publishing is left out, as on the Mac. If the Mac app gets it, the checks ask for it here too | The session, as above |
| 1 November 2026 | The web app keeps no copy of the agents and chats on the device, as the Mac does on disk (`SavedChats`): it shows the server's copy (`chats/agents`, `chats/lines`) while the computer is away, which the server keeps for exactly that. A browser's storage would hold the person's messages on a shared or public computer | The session, as above |
| 1 November 2026 | Signed out, the web app goes straight to the website's own sign-in page and comes back (`/login?return_to=…`), as the old web app does: the website's page is the gate. The Mac's sign-in screen comes with Windows (step 7) | The session, as above |
| 1 November 2026 | What the person has typed and not sent (the Mac's drafts, kept on disk) is kept in the tab's memory only, and goes with the tab: for the same reason as the chats | The session, as above |
| 1 November 2026 | The web app has no catalogue of its own: it reads the Mac's two String Catalogs, made into tables by a script, so a translation is written once, for the Mac, and the web app has it. The screens read the Mac app's catalogue and the code translated from the core reads the core's, because the two say some English differently ("Done": "OK" on a Mac screen, "Terminé" in the core) | The session, as above |

| 1 November 2026 | A message that is one link is drawn as the Mac's card with the site's icon, its name and the address, but not the page's title, which the Mac reads from the page. A web page may not read another site, and a route on Simeon's server that read it would hand the server every link the person opens | The session, as above |
| 1 November 2026 | Save hands the file to the browser as a download (the browser asks where, or puts it in Downloads, as the person set it), not the Mac's save panel; a file the computer won't hand over says "Couldn't save this file" in the browser's own alert, as the Electron app's error box did. A picture keeps the browser's own right-click menu (Copy image, Save image as), as a link does | The session, as above |
| 1 November 2026 | The preview uses the libraries the window itself used, at its versions: highlight.js 11.9 now (in a worker, with only the languages the preview asks for), pdf.js 5.4.296 and mammoth for PDF and Word in part 3. Not SheetJS 0.18.5, the window's reader for Excel: the copy on npm has known security holes (fixed only in releases off npm), and the files come from the internet through the agents. How Excel files show is decided in part 3 | The session, as above |
| 1 November 2026 | Excel workbooks (.xlsx) are read by a small reader of our own (`src/core/xlsx.ts`): the browser unzips them itself and the reader takes the first sheet, each value written as its number format says. No library: SheetJS's npm copy has known holes, and the other readers are either days old with unfamiliar dependencies or built for servers. The old binary .xls is not read; it says "Preview not available" with Download. The founder: "keep going on excel" | The session |

## Open questions

For the founder, each to be answered before the step that needs it:

- **The website's deploy.** `app.simeonlabs.com/app-next` has answered 404
  since pull request #516 merged: the Vercel project `simeon` (the one
  that serves `clients/apps/web`) has not published it. Its previews say
  "Canceled by Ignored Build Step", a setting kept in Vercel, not in the
  repository. Measured 1 November 2026: the scripts `app.simeonlabs.com`
  serves were built from commit `982cd4527` (pull request #480, 29 October
  2026), so nothing merged since has reached it, the website's own changes
  included (#490, #501, #516 onward). Needed before anything of the new
  app can be checked live: the founder to open the project's Deployments
  in Vercel and say whether the newer ones were ignored, failed or are
  waiting to be promoted.

- **A Windows code-signing certificate.** An unsigned installer makes
  Windows warn people before it runs (SmartScreen). Simeon Labs needs a
  code-signing certificate in its name before the first public Windows
  release. Needed at step 7.
- **Who checks on a Windows PC.** Nothing is done until it has run on the
  machine people use; for Windows, someone installs each build on a
  Windows PC. Needed at step 7.

## Log

Newest first.

### 1 November 2026: step 2c, part 3c, Excel in the preview

- `src/core/xlsx.ts`: an Excel workbook (.xlsx) read by our own code,
  loaded with the first one (10 KB, 4 KB compressed):
  - the zip unzipped by the browser itself (`DecompressionStream`), its
    parts together held to 120 MB, so a small file that unzips to
    gigabytes is refused;
  - a small XML reader (no page needed, so the tests run it too);
  - the first sheet in the workbook's order, from its first cell: shared
    and inline words, numbers, true and false, errors, a formula's saved
    value; blank rows kept, 2,000 rows and 200 columns at most, and how
    many rows it has;
  - each number written as its format says: dates and times (and a
    workbook counted from 1904), percentages, decimals, thousands,
    currency, negatives in brackets, scientific, General's 11 digits.
- `Viewers.tsx`: an .xlsx shows as the CSV's table ("5 rows", a cell's
  words in the card); one it can't read says "Couldn't read this
  spreadsheet"; an .xls says "Preview not available" with Download. Every
  file card's name now opens, save a kind the window can't show.
- The table measures its words in the page's own font before drawing
  them: measured on a canvas, dates and figures came out a few points
  short and were cut.
- `src/core/xlsx.test.ts`: a workbook LibreOffice made
  (`src/core/fixtures/revenue.xlsx`, from `revenue.fods` beside it: two
  sheets, words with a comma, quotes and an emoji, a date, a percentage,
  formulas, two blank rows); one written the way Excel writes one (prefixed
  tags, a path from the root, inline words, true and false, an error, a
  1904 date, a sheet starting at B2), deflated and stored; a 2,500-row
  sheet; a zip that unzips past its limit; files that are not workbooks;
  and the number formats.
- **Decision (the session, on the founder's "keep going on excel"):** in
  the table above.
- **Fixed on the way:** part 3b's entry here quoted a font's name that
  `check_names.py` flags; it now says it without the name.
- **Checked:** in Chromium, the built app under the website's security
  policy (`excel-check.cjs` in the session's scratchpad), light and dark:
  LibreOffice's workbook showed "5 rows" and its six columns with
  "2026-07-01", "12.5%", "45500.75", the words with quotes and the
  emoji, the formulas' values, the two blank rows and "Total", no cell
  cut; a cell's card ("Note · row 1"); the .xls said "Preview not
  available" with Download; a broken .xlsx said "Couldn't read this
  spreadsheet"; no error but the policy probe's own. The CSV preview
  again. The 192 tests, typecheck, lint, the words', the brands' and the
  build's checks, `check_translations.py`, `check_names.py`.
- **Not checked:** a workbook saved by Excel itself (the test builds one
  the way Excel writes it; no copy of Excel here); formats beyond the
  common ones (fractions, conditions in brackets, colours are left out of
  the words); a sheet's other tabs (only the first is shown, as the CSV's
  one sheet is); against the real server and a real computer.
- **Next:** step 2e, the message field's own parts: attaching files, the
  ":" emoji list, "@", "/" and "#", and dictation.

### 1 November 2026: step 2c, part 3b, PDF, Word and sound in the preview

- `src/window/PDFBody.tsx` (`PDFControl`, `PDFToolbar`, `PDFBody`): a PDF
  drawn by pdf.js 5.4.296, the window's own version, loaded with the first
  PDF (its script 117 KB compressed, its worker apart):
  - the pages one under another, 16 apart, as wide as the panel less 32
    times the zoom; each page's number at its foot; a page is drawn when it
    comes near the view, sharp on a Retina screen;
  - its words can be chosen and copied (pdf.js's text layer);
  - in the head, "2 pages", then Zoom out, "1 / 2" (the page at the middle
    of the view) and Zoom in; the zoom 0.5 to 4, a quarter a step, + and −
    as well;
  - "Couldn't render this PDF" with Download when pdf.js can't read it.
- `Viewers.tsx`:
  - a Word document read by mammoth (the window's reader; the Mac uses
    Quick Look) onto the Markdown page, its HTML made safe by DOMPurify
    before it is drawn; "Loading document…" meanwhile;
  - a sound in the browser's own player, centred, not playing until asked
    (Quick Look on the Mac, the window's player in the window);
  - PDF, Word and sound cards' names now open the preview. Excel's stay
    plain until part 3c.
- `package.json`: pdfjs-dist 5.4.296, mammoth 1.13.0 (the window asked for
  1.12 or later), DOMPurify 3.3.1 (the version the workspace already has).
  The lockfile adds them and mammoth's own (jszip, underscore, and small
  helpers); nothing else changed.
- `scripts/kept_names.json`: pdf.js's built worker lists a font whose
  name holds one of the earlier names; a rule keeps that font's name there.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`docs-check.cjs` in the session's scratchpad, with a two-page
  PDF, a Word file and a sound made in the session), light and dark: the
  PDF said "2 pages" and "1 / 2", its first page painted 1068 wide in an
  1100 panel, its words in the text layer ("Launch plan", "Quarterly
  report, page 1") with the text cursor, its badge "1"; Zoom in and + took
  it to 1.5 (1602 wide), − four times to 0.5 (534 wide) with Zoom out
  disabled; scrolled to the end it said "2 / 2"; a broken PDF said
  "Couldn't render this PDF" with Download; the Word file showed its
  heading, its bold word and its table, and a `<script>` written in it
  stayed words; the sound opened in the player, paused, 2 seconds. Then the
  three previews' checks again (`docs-check`, `preview-check`,
  `media-check`) under the website's own security policy for /app-next
  (`appWindowCSP`, proved in force by an inline script it refused): no
  other error, the PDF, code colours, Word, sound, table and the media
  viewer all worked. The 185 tests, typecheck, lint, the words', the
  brands' and the build's checks, `check_translations.py`,
  `check_names.py`. The inventory counts 259 strings the new web app
  shows.
- **Not checked:** PDFs with JPEG 2000 pictures (pdf.js reads them with
  WebAssembly, which the security policy does not allow; such a picture
  would not show) and PDFs that lean on fonts they do not carry (pdf.js's
  font files are not shipped, so the browser's own fonts stand in); a long
  PDF (pages drawn as they come near the view were tried on two); against
  the real server and a real computer (the address is not live yet; see
  Open questions).
- Pull request #530.
- **Next:** step 2c, part 3c: Excel in the preview. The window's SheetJS
  is out (see Decisions); the choice is between a small reader of our own
  for .xlsx (the browser unzips and reads XML itself) and "Preview not
  available" with Download.

### 1 November 2026: step 2c, part 3a, pictures and videos full screen

- `src/window/MediaViewer.tsx` (`MediaViewer`): pictures and videos full
  screen, black at 92% over the window:
  - the picture as large as fits (at most 95% of the window's width and
    1400, never past its own pixels), 12 round; its caption ("two.webp ·
    2 / 3", or the picture's own words); with more than one, a strip of
    48-point squares, the one shown ringed in white, and Previous and Next
    at the sides; Close at the top right;
  - the arrows go round, Escape closes, a click on the picture closes it
    after a moment (so a double click can zoom), a click beside it closes;
  - a double click zooms to 2.5 where clicked, or back; the wheel zooms up
    to 4 where the pointer is; zoomed, a drag moves it, kept over the
    window;
  - a video plays in the browser's own player, not until asked;
  - pictures and videos are read from the agent's computer (a video under
    25 MB, its size asked first) or from the web.
- `Viewers.tsx`: one viewer at a time over the window, a file's preview or
  pictures and videos (`ViewerLayer`); a picture's or a video's card opens
  the viewer, any other file the preview (`Viewers.open`).
- `ChatPane.tsx`: a picture in the chat is a button ("Open image full
  screen", "Open video full screen") that opens the viewer at it, with the
  others of its message beside it.
- `Files.tsx`: a video in the chat stays grey, as on the Mac (it is no
  picture), and is no longer read for a picture it cannot make.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`media-check.cjs` in the session's scratchpad, with a two-second
  WebM made by ffmpeg): the five pictures' labels; the second of three
  opened at 512 by 512 ("two.webp · 2 / 3", "Media 2 of 3", focused); the
  right arrow went to the third and round to the first ("The shoot · 1 /
  3", its own words), Previous and the strip as well; a double click zoomed
  to 2.5 where clicked and kept it open, a drag moved it (and kept it
  open), a double click came back; the wheel zoomed to 1.82; a click on
  the picture closed it and the keys went back to its tile; an agent's
  picture and video sent as files opened together ("Media 1 of 2"); a click
  beside the picture closed it; the video tile stayed grey, and opened in
  the browser's player, paused, its 2 seconds read, 1216 by 684; Escape
  closed it; no errors on the page. The 185 tests, typecheck, lint, the
  words', the brands' and the build's checks, `check_translations.py`,
  `check_names.py`. The inventory counts 256 strings the new web app shows.
- **Not checked:** a trackpad's pinch (the browser sends it as the wheel
  with Ctrl; the zoom follows the same rule but was not tried); against
  the real server and a real computer (the address is not live yet; see
  Open questions).
- Pull request #529.
- **Next:** step 2c, part 3b: PDF (pdf.js), Word (mammoth), Excel and sound
  in the preview.

### 1 November 2026: step 2c, part 2, the preview (text and code, Markdown, JSON, tables)

- `src/core/filePreview.ts` (`FilePreview`): a text file's words (UTF-8,
  cut at 1.5 million characters, a cut inside an emoji or between "\r" and
  "\n" falling back to its start); a CSV's separator, rows and row count;
  a sheet (2,000 rows at most); "3 rows", "1,204 rows", "Revenue · row 2",
  "2 pages", "[2 items]", "{1 key}"; a picture's caption and previous and
  next wrapping round, for part 3.
- `src/core/store.ts` (`AppStore.readForPreview`): a file's size asked
  first (a piece of no length), so a file over 25 MB is never fetched;
  then its bytes, or nothing.
- `src/core/files.test.ts` adds `FilePreviewTests`' CSV, JSON sizes,
  captions and lines (with the window's own answers,
  `Fixtures/file-preview.json`), the text's cut, and the preview's read.
- `src/window/Viewers.tsx` (`FileViewer`, `ViewerState`, `MarkdownPage`,
  `CodeBody`, `JSONBody`, `TableBody`):
  - a card's name opens the file's preview over the whole window
    ("Open notes.md"), for text and code, Markdown, JSON, CSV and TSV
    once the computer read them as text; the other kinds stay plain until
    part 3;
  - the window dimmed, the panel up to 1100 wide; its head with the name,
    the grey line ("2,999 rows", "Showing the start of this file"),
    Download file and Close preview; Escape or a click outside closes it,
    and the keys go back where they were;
  - "Loading file…", "File unavailable", and too large ("Spreadsheet too
    large to preview" with Download) as the Mac says them;
  - Markdown as a page (624 wide, 15 on 24, the page's headings, lists,
    tables and quotes; names left as words);
  - text and code with their line numbers staying while the lines scroll
    sideways, coloured in the window's palette once highlight.js has read
    them (`codeColours.worker.ts`, 148 KB, loaded with the first code
    file);
  - JSON as a tree open two levels deep, 200 entries then "… 50 more";
    a file that is not JSON as text;
  - CSV and TSV as a table, the head row staying, a cell's words in a
    card at the foot ("Note · row 2"); only the rows in view are drawn.
- `MessageText.tsx`: `MessageBlocks` draws a file's page (`document`).
- `package.json`: highlight.js 11.9.0, the window's version. The lockfile
  adds it, and the same pnpm (10.28.1) records vitest's jsdom with its
  postcss peer for the two apps that test with it; no other version
  changed.
- **Decision (the session):** in the table above, the window's own
  libraries, and not SheetJS 0.18.5.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`preview-check.cjs` in the session's scratchpad), light and
  dark, then French: six cards' names open ("Open notes.md"), the PDF's
  stays plain; the panel 1100 by 780, focused, named for the file; the
  Markdown page 624 wide at 15, its heading 23.25, no names in pills nor
  site icons, its table and quote; Escape closed it and the card's name
  had the keys again; a TypeScript file in 23 numbered lines, keywords
  violet, strings green, comments italic, the numbers staying put when
  scrolled 300 sideways; a click outside closed it; a JSON file's tree with
  its sizes, "… 50 more" under 250 items, a closed entry opened with its
  caret ("Déplier deeper" in French); a broken JSON file shown as its text;
  a 3,000-line CSV said "2,999 rows" ("2 999 lignes"), drew 41 rows of
  1,999, its last row 1999 at the end with the head still at the top; a
  cell clicked showed "Note · row 2" and its words; the head's Download
  saved "revenue.csv"; a 30 MB CSV said it was too large, its size asked
  with a piece of no length and nothing else fetched; no errors on the
  page. The 185 tests, typecheck, lint, the words', the brands' and the
  build's checks, `check_translations.py`, `check_names.py`. The inventory
  counts 246 strings the new web app shows.
- **Not checked:** a file larger than a few megabytes in the browser
  (the colours run in the worker; a 1.5-million-character file was not
  tried); against the real server and a real computer (the address is not
  live yet; see Open questions); in the Windows app, where the worker is
  loaded from disk (step 7).
- Pull request #528.
- **Next:** step 2c, part 3: PDF (pdf.js), Word (mammoth), Excel, sound,
  and pictures and videos in their own viewer, from a card and from a
  picture in the chat.

### 1 November 2026: step 2c, part 1, file cards, pictures from the computer, link cards

- `src/core/fileLine.ts` (SimeonCore's `FileLine`): a file card's line,
  its size as the window writes it ("1.3 KB" under 10 KB, "42 KB",
  "3.4 MB", a tie rounded up), with the language's decimal mark and units
  ("2,9 Ko"), or "Couldn't read file".
- `src/core/filePreview.ts` (`FilePreview`'s kinds and names): a file's
  kind from its name, its highlighting language, whether its card opens a
  preview (never for an unknown kind; text, Markdown and JSON only once the
  computer read them as text), the parts of a name, the last part of a path,
  a `file://` address's path, and the name Save offers (the Electron app's
  `resolveSuggestedDownloadName`). The CSV, JSON and picture viewers' parts
  come with part 2.
- `src/core/store.ts` (`AppStore.readFile`, `fileFacts`): a file read from
  the computer in 4 MiB pieces (`readAttachmentChunk`), then as a picture
  (`readAttachmentImage`) when the pieces come empty; a file sent from this
  tab read from the tab. A card's line and whether it reads as text
  (`readAttachmentText`), kept once answered, asked again after a failed
  read. Both read without waking a computer that rests (`wakes: false`),
  as the Mac's cards and pictures do; Save wakes it.
- `src/core/files.test.ts` is the core's `FileLineTests`, `FilePreviewTests`'
  kinds, names and opening (with the window's own answers,
  `Fixtures/file-preview.json`), `SentPictureTests`, and the reads of
  `SleepingComputerTests`, translated. The stand-in computer
  (`src/core/testing.ts`) now answers commands as a test tells it and keeps
  whether each may wake it.
- `src/window/Files.tsx` (`FileCard`, `FileIcon`, `ChatPicture`,
  `LinkCardView`, `saveFile`):
  - a file's card, 220 to 340 wide and as wide as its words between; the
    icon for Word, Excel, PowerPoint, PDF and Markdown (the window's,
    from `desktop/brand/file-icons`, and the founder's Markdown page from
    the Mac's assets), a page for any other file; its name over its size;
    Save ("Save Q3 report.pdf"), which reads the file and hands it to the
    browser as a download under the card's name;
  - a picture on the agent's computer, read from it and drawn, grey until
    then;
  - a message that is one link (`Bubble.loneLink`, the core's rule): the
    card, at most 88% of the chat, 480, or the chat less 82; the site's
    icon (a globe until it comes, and for an email's page), the site's
    name and the address under it; it opens in a new tab, without telling
    the site where it came from. The hover bar beside it and the reactions
    under it as on a message.
- `MessageText.tsx`: the site icon's cache is shared with the link card
  (`useSiteIcon`), so a site is asked once.
- **Decisions (the session):** in the table above: the link card without
  the page's title; Save as a browser download, its failure in the
  browser's alert; the picture's right-click menu the browser's own.
- **Not in this part:** a card's name opening the preview (it stays plain
  until the viewers come, part 2).
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`files-check.cjs` in the session's scratchpad), light and dark,
  then French: four cards (PDF, Markdown, an unknown kind, a missing
  spreadsheet) with their icons at 36, "29 B", "8 B", "2.9 KB" and
  "Couldn't read file" ("29 o", "2,9 Ko", "Impossible de lire le fichier"
  in French); widths 220 and, for the long name, 340 with the name cut;
  one `readAttachmentText` per card; the picture on the computer read in
  one piece and drawn (192 high in its row); three link cards 480 wide and
  60 high, the person's on the right, the Gmail one with the globe, each
  `target=_blank` and `rel="noopener noreferrer"`; the message with words
  and a link stays a bubble; the bar shows beside a card on hover and its
  👍 under it; Save downloaded "Q3 report.pdf" with the computer's exact
  bytes; Save of the missing file said "Couldn't save this file"
  ("Impossible d'enregistrer ce fichier"); no errors on the page. The 180
  tests, typecheck, lint, the words', the brands' and the build's checks,
  `check_translations.py`, `check_names.py`. The inventory counts 208
  strings the new web app shows.
- **Fixed on the way:** `check_names.py` failed on main on part 4's entry
  here, which named the emoji the kept rule is for; the entry now says it
  without the name.
- **Not checked:** a site's icon showing in a link card (as in part 4, the
  test browser reaches no other site and can't stand in for a
  `/favicon.ico`); a large file read in several pieces in the browser (the
  core's test reads one in three); against the real server and a real
  computer (the address is not live yet; see Open questions).
- Pull request #527.
- **Next:** step 2c, part 2: the previews (pictures and video, PDF, text
  with its colours, Markdown, JSON, tables), opened from a card's name.

### 1 November 2026: step 2b, part 4, a link's site icon and the emoji picker

- `src/core/linkIcons.ts` (SimeonCore's `LinkIcons`, `CredentialSite`):
  the website a link goes to, its host without "www."; none for an email's
  page (Gmail's, Outlook's on the web) nor a link to no website.
  `linkIcons.test.ts` is the core's tests, translated.
- `MessageText.tsx` (`MessageLine.linked`, `InlineImages.site`): before each
  link in an agent's message, its site's icon, 1.05 of the words with a 22%
  corner, once it has come; nothing for a site without one.
- **Decision (the session):** the icon is the site's own `/favicon.ico`,
  loaded by the browser from the site itself, sent without the chat's
  address. The Mac reads the site's page for its touch icon first; a web
  page may not read another site's page, and a favicon service would show
  the person's sites to a third party, which the Mac rules out ("never a
  favicon service"). So a site whose icon is only named in its page shows
  none on the web.
- `src/core/emoji.ts` (SimeonCore's `Emoji.swift`): the window's 3,944 emoji
  in its nine groups, from the core's own `Resources/emoji.json`, read when
  the picker first opens (its own script, 119 KB compressed); search as the
  window's; the ":" being typed and recent picks, for the composer later.
  `emoji.test.ts` is the core's `EmojiTests`, translated.
- `src/window/EmojiPicker.tsx` (`EmojiPicker`, `EmojiPopover`): More emoji,
  the reactions capsule's seventh cell, opens the full picker under the
  message: 294 by 320, "Search emoji" with the keys, each group titled over
  its emoji 8 to a row, the person's own on the grey; "Results" or "No emoji
  found"; a pick reacts and closes, Return picks the first result, Escape or
  a click outside closes it. The message's bar stays while it is open.
- `scripts/kept_names.json`: the emoji rule that keeps one emoji's id in the
  core's emoji.json now covers the web app's built copy of it too.
- **Not in this part:** the ":" list in the field and the composer's own
  emoji (2e, with "@" and "/").
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`picker-check.cjs` in the session's scratchpad), light and dark:
  the capsule's seventh cell More emoji (the capsule 233 wide); the picker
  294 by 320 with the keys in its search, nine groups and 3,944 emoji, the
  capsule gone and the message's bar held; "tada" gave Results with 🎉
  first, Return reacted with it (`reactToMessage` with 🎉) and closed it, the
  message showing 🎉 as the person's own; "zzzzqqq" said "No emoji found";
  Escape closed it; on the brief, the person's 👍 stood on the grey. Links:
  the icons asked for were simeonlabs.com's, nosuch.example's and
  docs.example's (www. left out), none for the Gmail link, each without the
  chat's address, hidden until it comes and taken away when the site does
  not answer. The checks of parts 1 to 3 again. The 169 tests, typecheck,
  lint, the words', the brands' and the build's checks,
  `check_translations.py`, `check_names.py`. The inventory counts 202
  strings the new web app shows.
- **Not checked:** an icon coming and showing: the browser here reaches no
  other website, and the test browser does not let a stand-in answer for a
  `/favicon.ico`; against the real server and a real computer (the address
  is not live yet; see Open questions).
- Pull request #526.
- **Next:** step 2c: pictures and files read from the computer, files'
  kinds, sizes and Save, link cards, previews.

### 1 November 2026: step 2b, part 3, names in their colours

- `src/core/mentions.ts` (SimeonCore's `Mentions`, Markdown.swift): the
  apps and agents a message names, as the Mac reads them: case-sensitive,
  the longest spelling first, not glued to a word; an app whose name is an
  everyday word (Link, Shop, Square, Close…) only where its sentence makes it
  the app ("pay with Link", not "we can Shop here"); an agent anywhere but
  as a thing's ("the Simeon app", "an app called Simeon"), never the
  person's own name nor the speaker's, save in its introduction.
  `mentions.test.ts` is the core's tests of it, translated.
- `scripts/make-brands.mjs` makes `src/core/generatedBrands.ts` from the
  table the iPhone and the Mac use (`GeneratedBrands.swift`, made by
  `ios/scripts/make-assets.mjs`): 265 spellings with their colours in light
  and dark, and each of the 249 logos from the file the Mac's own is drawn
  from (`desktop/brand`). `pnpm test` fails when the table is out of date
  (`pnpm brands` makes it again), so a connector added for the Mac (the rule
  in CLAUDE.md) reaches the web app with one command. The logos are built as
  files of their own, fetched when a message names one.
- `MessageText.tsx` (`MessageLine.mention`, `MentionPills`): in an agent's
  message, an app's name after its logo in its colour (one-colour logos
  take it too), at 500, 600 in bold; an agent's name with its face in a
  pill of water glass, in the blue at 600, which opens its chat (the window
  is given `onOpenAgent`). Each kept on one line, find's marks on it too.
  The person's own words are not dressed, as on the Mac.
- **Decision (the session):** the web app takes the logos from
  `desktop/brand`, the Mac's sources (SVG, mostly, 1.3 MB), not the Mac's
  144-point PNGs (3.7 MB): smaller, and sharp at any size.
- **Not in this part:** a link's site icon and More emoji with the full
  picker (2b, part 4); names in the cards (step 3).
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`names-check.cjs` in the session's scratchpad), light and dark,
  an agent's message: "Ask Theo to post it on **LinkedIn** and Slack, then
  pay with Link. Notion has the brief; GitHub has the code." with a list
  "Iris drafts in Google Docs" and "the Simeon app ships Friday": LinkedIn
  (at 600, in bold), Slack, Link, Notion, GitHub and Google Docs each in
  its colour after its logo (15 points; Notion's, GitHub's and LinkedIn's
  one-colour logos tinted, the colours changing in dark), Theo and Iris in
  pills with their faces, "the Simeon app" plain, each name on one line;
  find lit "inked" inside LinkedIn's name; Theo's pill opened Theo's chat
  (the address said `agent=theo`). Find and the message actions of parts 1
  and 2 checked again. The 163 tests, typecheck, lint, the words', the
  brands' and the build's checks, `check_translations.py`, `check_names.py`.
- **Not checked:** against the real server and a real computer (the address
  is not live yet; see Open questions); every one of the 249 logos by eye
  (each is a file the Mac draws from, and the test asks that each app has
  one).
- Pull request #525.
- **Next:** step 2b, part 4: a link's site icon, More emoji and the full
  picker.

### 1 November 2026: step 2b, part 2, find and the working line

- `src/core/activity.ts` (SimeonCore's `Activity.swift`): what an agent is
  doing, in the Mac's words ("Searching the web", "Messaging Iris",
  "Connecting to Linear", "Theo is working", "Typing…"), with the time once
  past a minute ("1h 5m"), and the hold that keeps each activity's words for
  0.8 s so quick steps do not flicker. `activity.test.ts` is the core's
  `ActivityLineTests`, translated.
- `src/core/chatFind.ts` (SimeonCore's `ChatFind.swift`; `FindMarks`,
  `FindLine` and `FindText` from mac/Simeon/Find.swift): which lines hold the
  words and how often, oldest first, capitals aside (messages, a question's
  prompt, an email or Slack draft, a notice; not agents talking to each other,
  nor a file's name); where find stands and how it steps, round at either
  end; and where the words show on screen, each block, list item and table
  cell counted past the ones before so the current match is lit where it is.
  `chatFind.test.ts` is the core's `ChatFindTests`, translated, with the
  marks.
- `src/window/ActivitySlot.tsx` (`ActivitySlot`, `ActivityRow`,
  `ActivityWords` in ChatMotion.swift): the agent at work under the messages,
  in a place 40 high whether or not it works; its picture (28; a group's
  member at work, 22) beside what it is doing under the window's sweep of
  light, the time after a minute; it comes in, its words rise as they change,
  and it goes out over 0.14 s. The last message meets it at a 6-point corner.
- `src/window/FindBar.tsx` (`FindBar`, `FindButton`, `FindField`): find's bar
  8 under the chat's head and 16 from its right, with its count ("2/5", red
  "0/0" when nothing matches), Previous, Next and Close; Return goes to the
  next match and Shift-Return back, each brought to the middle unlit; Escape
  closes; ⌘F again chooses its words. Every match lies under the warning
  yellow at 30%, the current one on the yellow itself. On a thread, or back,
  the bar starts again, still open. `MessageText.tsx` carries the marks
  through an agent's paragraphs, headings, lists, quotes and tables; a code
  block's words count but are not lit, as on the Mac.
- **Decision (the session):** find opens with ⌘F on a Mac and Ctrl-F on
  Windows and other computers; on a Mac, Ctrl-F stays the field's own (it
  moves the caret). The browser's own find is not opened by the same keys
  while the app is shown.
- **Faults found on screen and fixed before the pull request:** find's bar
  and the chat's lines had the same React key (the thread's id), and lines
  left over from an earlier view stayed on screen with stale marks; the bar
  has its own key now. The find count's spoken words used a key the Mac's
  catalogue does not have ("Match %lld of %lld"; the Mac's is "Match %@ of
  %lld"), so they stayed English in French.
- **Not in this part:** names in their colours and pills, a link's site icon,
  More emoji and the full picker (2b, part 3); find in the cards (step 3);
  the motion of a line coming in, the time on a sideways swipe.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`find-check.cjs` in the session's scratchpad), light and dark:
  Simeon at work showed "Searching the web" beside his picture (28) in a slot
  40 high, its label "Simeon: Searching the web"; reading a file then running
  commands came in turn, each held its 0.8 s; when he stopped, the line went
  and the 40 stayed. ⌘F (Ctrl-F here) opened the bar 8 under the head and 16
  from the right, 34 high, with the keys; "launch" counted 4/4 with four marks
  across a message and the brief, the current one on the yellow; Return went
  to 1/4 and brought it into view, Shift-Return back to 4/4; "iris" lit the
  table's cell; "zzz" said a red 0/0, "No matches", Previous and Next off;
  ⌘F again chose the field's words; in a thread the bar stayed open with its
  words gone and found 2/2 there; Escape closed it and every mark went.
  Theo at work: "Messaging Iris", his last message's corner 6. French: the
  line, "Aucun résultat", "Résultat 4 sur 4". The message actions of part 1
  checked again. The 156 tests, typecheck, lint, the words' and the build's
  checks, `check_translations.py`, `check_names.py`. The inventory counts 188
  strings the new web app shows.
- **Not checked:** against the real server and a real computer (the address
  is not live yet; see Open questions); ⌘F on a Mac's browser (Ctrl-F was
  pressed here, on Linux).
- Pull request #524.
- **Next:** step 2b, part 3: names in their colours and pills, a link's site
  icon, More emoji.

### 1 November 2026: step 2b, part 1, a message's actions

- `src/window/MessageActions.tsx` (`MessageActions.swift`, `Tapback.swift`):
  - **The hover bar** (`HoverBar`): under the pointer, beside the message, 6
    from it and level with its middle; Add reaction, Reply and More (24, 8
    round), Add reaction nearest the message, so on the person's side the
    order runs More, Reply, Add reaction. It stays while its menu or capsule
    is open.
  - **The reactions' capsule** (`Tapback`): glass, over the message's outer
    corner (its bottom 2 above the message, its outer edge 8 past it), under
    the message when there is no room above; the six quick reactions, the
    person's own on the settings blue, larger under the pointer; it grows out
    of its corner. A pick shows on the message at once and goes to the
    computer (`reactToMessage`); refused, it is taken back. A click
    elsewhere, Escape, the wheel or the window going behind closes it; the
    same button pressed again within half a second closes it and opens
    nothing (`closedByClick`).
  - **The menus** (`MessageMenu`): More holds Start a thread and Copy, under
    its button (4 below, its left edge on the button's, its right edge for the
    person's message); the right click holds Add reaction, a line, Reply,
    Start a thread and Copy, at the pointer. No thread is started inside one.
    The arrows choose an item, Return picks it.
  - **Replying** (`ReplyPill`): the message's line (72 characters) over the
    field in glass, with Cancel reply; the field says "Reply…" (or "Reply to
    file…", "to link…", "to attachment…") and takes the keys; Escape lets go.
    The message goes as an answer to it (`replyToId`), and the line goes.
- `src/core/store.ts`: `command` (a command to the computer, its failure said
  once) and `react` (`AppStore.react`); `chatStore.test.ts` checks a
  reaction shows at once, goes with its message, emoji and agent, and is
  taken back when refused.
- `src/window/ChatPane.tsx`: the reactions under a message are buttons, which
  add the person's own or take it back. `src/window/Composer.tsx`: the reply's
  line, its words and Escape.
- `src/window/classes.ts`: class lists built from their parts. **A fault found
  on screen:** the formatter's Tailwind plugin (`prettier-plugin-tailwindcss`,
  from the workspace) trims the space before a class added inside a
  `className` template, so `"bubble theirs" + " short"` had become
  `bubble theirsshort` in 2a (a one-character message was not centred) and
  the row lit by a quote's jump was never lit. Both fixed with it.
- **Decision (the session):** a right click on a link keeps the browser's own
  menu (open in a new tab, copy the address); everywhere else on a message it
  is the message's menu, as on the Mac. A Mac takes the click there too, but
  a browser's link menu is what people use a link with.
- **As the Mac does:** a refused reaction is taken back and nothing else is
  said on screen (the Mac's window does not show the store's `problem`).
- **Not in this part:** More emoji (the capsule's seventh cell) and the full
  picker (`EmojiPopover`), find (⌘F), the agent's working line, names in their
  colours and pills, a link's site icon, Attach and the files (2b, part 2
  and after); the menus of two agents' messages and of a call's lines (only
  Copy), which come with those views.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`actions-check.cjs` in the session's scratchpad), light and dark:
  the bar under the pointer, 6 from the message and level with its middle,
  kept when the pointer moves onto it; the capsule 8 past and 2 above the
  message, its six reactions; ❤️ picked showed at once on the message as the
  person's own and reached `reactToMessage` with `{entryId, emoji,
  agentId}`; a pill of the person's own clicked took it back; the person's
  bar on the left in its order, More's menu 4 under the button with its right
  edge on the button's, the menu taking the keys and the arrows choosing; More
  pressed again closed it; the right click's menu in its order with its line;
  Escape closed it; Copy put the message's words on the clipboard; Add
  reaction from the menu opened the capsule over the message; Reply showed the
  line and "Reply…" with the keys in the field, Escape let go; the bar's
  Reply and a send reached `sendPrompt` with `replyToId` and the quote showed
  over the sent message; Start a thread opened the thread with the keys in its
  field and no Start a thread in its menus; a link's right click left to the
  browser; a refused reaction taken back. French: the menus, the field, the
  labels in "tu". The 149 tests, typecheck, lint, the words' and the build's
  checks, `check_translations.py`, `check_names.py`. The inventory counts 153
  strings the new web app shows.
- **Not checked:** against the real server and a real computer (the address
  is not live yet; see Open questions); a trackpad's scroll closing the
  capsule (the wheel event is the same in Chromium, not tried on a trackpad).
- Pull request #523.
- **Next:** step 2b, part 2: find (⌘F), the agent's working line, names in
  their colours and pills, a link's site icon, More emoji.

### 1 November 2026: step 2a, part 2, the chat on screen

- `src/window/ChatPane.tsx` (`ChatPane.swift`, with `ThreadChin` and
  `ThreadHeader` from `MessageActions.swift`, `ReplyQuote`, `ChannelTagView`
  and `PictureStrip` from `Cards.swift`, `CallLineRow` from `CallChat.swift`):
  the open agent's chat, its messages the whole height under a blurred head
  (its picture, 52, over its name in a pill) and over the field. It opens at
  the newest and is held there while lines come; scrolled up, it lets go,
  and ⌄ goes back with what came meanwhile; a message of the person's own
  goes to the newest wherever the chat was; near the top, older lines are
  read. Rows as the Mac draws them: stamps, "New", the person's bubbles in
  the blue and the agents' in grey, a run's corners, a group's names and
  pictures, a lone emoji large, a quote over a reply (a click goes to it, or
  opens its thread), reactions under the bubble (shown; sending one is 2b),
  a thread's "2 replies" joined under its message, agents talking to each
  other, routines, a call's line, notices, "Failed to send" with Resend and
  Delete, "Waiting to send…" with Cancel, files as a card with their name
  read as a title, pictures (the web's, and the person's own sent from this
  tab). A thread opens in the chat's place under its breadcrumb. The cards
  say the core's "This message can't be shown in this version of Simeon."
  until step 3.
- `src/window/MessageText.tsx` (`MessageText.swift`): an agent's words as
  the Mac draws them: paragraphs, headings, lists and tasks, quotes, code
  with Copy, tables, links in the link blue.
- `src/window/Composer.tsx` (`Composer.swift`): the field in glass, 40 high
  and growing to six lines, the blue send once there is something to send,
  Return to send and Shift-Return for a new line, what is typed kept per chat
  and per thread, a send's error over it; the messages fade into the ground
  under it.
- `src/App.tsx` (`MainWindow.swift`): the chat beside the sidebar; the agent
  left open stays open (the address keeps it, `?agent=`), else the first in
  the list opens, as the Mac's `chooseFirst`.
- **The Mac's own bug, seen while translating:** "1 reply" under a message is
  a plain string on the Mac (`ThreadChin`), so it stays English in every
  language, while the catalogue's "%lld replies" has the right plural ("1
  réponse"). The web says "1 reply" in English and uses the catalogue's
  plural in the others. Not changed on the Mac here.
- **Not in this part:** the hover bar (reply, react, copy), sending a
  reaction, replying with its line over the field, the right-click menu,
  find (⌘F), the agent's working line under the chat, the motion of a line
  coming in, the time on a sideways swipe, two agents' messages and a call's
  lines opened over the chat, names in their colours and pills, a link's
  site icon (2b); Attach and the files, dictation, "@", "/" and "#" (2b, 2e);
  pictures and files read from the computer, files' kinds, sizes and Save,
  link cards, previews, maths drawn (2c); the call button (step 5); the
  agent's pane from the head (step 4); the cards (step 3).
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`chat-check.cjs` in the session's scratchpad): Simeon's chat
  opened first, with Markdown, a quote, reactions, a thread, agents talking,
  a routine, a card, a notice, a picture and a lone emoji, held at the
  newest; scrolled to the top, ⌄ shown; a message typed and sent with
  Return reached `sendPrompt` with its nonce, showed at once and gave way to
  the computer's copy, and the agent's answer streamed in; the thread opened
  from its chip and closed from the breadcrumb; the group's names over the
  first of each run and pictures beside the last; the address kept the open
  chat. Light, dark and French (screenshots taken). The 148 tests, typecheck,
  lint, the words' and the build's checks, `check_translations.py`,
  `check_names.py`. The inventory counts 136 strings the new web app shows.
- **Not checked:** against the real server and a real computer (the address
  is not live yet; see Open questions).
- Pull request #522.
- **Next:** step 2b, the chat's actions: the hover bar, reactions, replying,
  find, the working line, names in their colours.

### 1 November 2026: step 2a, part 1, the chat's core

- `src/core/entry.ts` (`Entry` and `TranscriptChange` in `Models.swift` and
  `Backend.swift`): a chat's line, the person's own reactions, a thread's
  reply, and the changes the host streams (written, changed, taken away,
  cleared, a whole copy).
- `src/core/chat.ts` (`Chat.swift`): a chat's rows. Stamps after a quarter of
  an hour or on a new day, "New" before the first unread line, bubbles with
  their quotes (none on an agent's answer to the only line since), pictures
  sent together as one, files, agents talking to each other folded into one
  line, a call written before calls were one line, routines changed one
  after another, notices in plain words, a thread's replies counted under
  their message, a message that is one link, a group's names and pictures.
  The cards keep their line as a `card` row until step 3 draws them; until
  then the chat says "This message can't be shown in this version of Simeon."
  in their place, the core's own sentence for a card it cannot draw.
- `src/core/chatRuns.ts` (`ChatRuns.swift`): each line's run (12 lower when
  someone else spoke before it, its corners 6 round beside the same
  sender's), checked against the window's own functions run on the same
  lines (the core's fixtures `chat-runs.json` and `sender-keys.json`).
- `src/core/markdown.ts` (`Markdown.swift`): a message's blocks (headings,
  lists and tasks, quotes, code, tables, rules, maths). Within a line, bold,
  italics, code, links and strikethrough, then GitHub's bare links: the Mac
  reads these with Apple's own Markdown reader, which has no copy for the
  web, so this one follows CommonMark's rules (the Mac's tests have none for
  it; its own are in `markdown.test.ts`).
- `src/core/plainWords.ts` (`PlainWords.swift`): a notice that names
  something behind Simeon reads plainly. Like the Swift copy, it names two
  earlier names to keep them off the screen: `scripts/kept_names.json`'s rule
  for the filter now keeps this copy and the built index file too.
- The backend (`Backend.swift`): a chat opened on the host (`openAgentTail`,
  without waking a computer that rests), older lines (`getAgentTranscriptTail`),
  a preview read without opening it, a message (`sendPrompt`, in the host's
  names), read (`setAgentUnread`), the chat's live lines (`transcript`).
- The store (`Store.swift`, `StoreSaved.swift`): a chat opened shows the
  server's copy of its lines (`chats/lines`) while the computer's are on
  their way, then the computer's; its new lines stream, a growing answer
  redrawing only its own row; a line the stream missed is fetched; a chat on
  screen stays read; older lines when scrolled up; "Couldn't load" and Retry.
  A message shows at once and gives way to the host's copy (by its nonce);
  "Failed to send" with Resend and Delete; held while the computer is out of
  reach ("Waiting to send…", Cancel), handed to the server meanwhile
  (`chats/send`), and sent to the computer again when it is back. Threads,
  and the lines find will read.
- **Not in this part:** the chat on screen (part 2); names in the chat in
  their colours and pills (`Mentions`), sending a reaction, find, the
  composer's files and "/" and "@" (2b and after); the Mac's asks to use
  this Mac (the Mac's alone); sending held through a rebuild (step 5).
- **Checked:**
  - 148 tests pass (52 more), translated from the core's ChatTests,
    ChatThreadTests, ChatDeliveryTests, ChatQueueAndThreadTests,
    ChatRunsTests, ReactionsTests, SendArgumentTests, MarkdownTests and
    SavedChatsTests' server copy and held messages, with the two fixtures;
  - three deliberate breaks (the nonce match, the quote rule, a run's
    corner), each caught by a test;
  - typecheck, lint, the words' and the build's checks,
    `check_translations.py`, `check_names.py`. The inventory now counts 110
    strings the new web app shows.
- **Not translated:** the core's tests that run on its demo seed
  (`DemoData`: the morning brief, a group's names, every card, the cards'
  buttons); the cards' come with step 3.
- **Not checked:** in a browser (nothing on screen uses it yet), and against
  the real computer.
- Pull request #521.
- **Next:** step 2a, part 2: the chat on screen (its head, its rows, the
  bubbles and their Markdown, the composer).

### 1 November 2026: step 1d, part 2, the session and the window

- `src/session.ts` (`MacSession.swift`, and the old web app's
  `desktop/web/bridge.ts`): a pair kept in the tab, else the website's
  cookie traded, else the website's sign-in page told to come back here;
  "Setting up" until a list is on screen (the server's copy when it comes
  first); the profile read for the account; a sign-in the server ends goes
  back to the sign-in page and forgets the computer's address.
- `src/core/faces.ts` (`AgentFaces.swift`): the faces read from the shared
  core's own copy (`Resources/Faces`, the same files the Mac and the iPhone
  ship); which face an agent shows (worn, its own picture, given, or one its
  id picks with the voices' hash); a group's layout.
- `src/core/listTime.ts` (`Chat.listTime`): "8:33 AM", "Yesterday", the
  weekday, "9/22", "9/2/25"; in the app's language in the person's region.
- The window (`MainWindow.swift`, `Sidebar.swift`, `SidebarList.swift`,
  `Pictures.swift`, `Look.swift`): the colours light and dark as CSS
  (`src/index.css`); the sidebar 320 wide with its half-point edge; each row
  as the Mac's (62 high, the picture 46, the name, the title's tag in blue,
  the time or the unread dot, the last line, the green dot at work in a hole
  cut round it, the open row's white card); a group's members drawn together
  with the gaps cut between them; "Can’t reach your computer" with Retry over
  no list, "Reconnecting to your computer…" over one, read again every 4 s;
  the store's Retry asks the broker again.
- **Not in this step, each with its screen:** the chat (step 2); the head's
  search and new chat, the foot's account and Connect apps, pins and
  folders, several rows picked, renaming, the right-click menu, dragging,
  the rail and the width dragged (step 2 and after); the first run for a new
  account and the access cover (step 2); Recover computer (step 5); faces
  given to agents that have none (the store's actions).
- **Checked:**
  - 96 tests pass (13 more: the session's five ways in and out, the faces
    against `AgentFaceTests` with the hash worked out apart in Python, the
    group's layout, the list's time against `testStampTexts` and
    `testNoTimeIsNotNineteenSixtyNine`); typecheck, lint, the words' and
    the build's checks, `check_translations.py`, `check_names.py`;
  - in Chromium, the built app against a stand-in server (the cookie, the
    profile, the broker, the computer's list): the whole way in ran and the
    window drew six agents' rows, the hidden one left out, the faces loaded,
    light and dark (screenshots taken); in French ("Bras droit", "Hier",
    "jeudi", "22/09", "En attente de toi : …"); and with the computer
    answering 500, the "Can’t reach your computer" card with Retry.
- **Not checked:** against the real server and a real computer, signed in:
  the address is not live yet (`/app-next` answers 404 since the first
  merge; see Open questions). The inventory now counts 40 strings the new
  web app shows.
- Pull request #520.
- **Next:** step 2, the sidebar and the chat.

### 1 November 2026: step 1d, part 1, the agents and the store's roster

- `src/core/models.ts` (`Models.swift`): an agent's row, every field the host
  sends; the sidebar's preview line (the Mac's Markdown stripping, "Sent 2
  images", "Waiting for you: …"); the Chief of Staff and his title in the
  app's language; the list's order. A row is the same row whatever its stamp.
- `src/core/backend.ts` (`Backend.swift`): `LiveBackend` with the list
  (read without waking a resting computer), calls to the server, commands,
  and the host's events in the screens' terms (`LiveBackend.map`, every
  channel but the chat's lines, which come with the chat).
- `src/core/store.ts` (`Store.swift`, `StoreSaved.swift`): the roster part of
  the store. On attach the server's copy of the list shows while the
  computer has not answered, the computer's list replaces it (and wins when
  it answers first), a resting computer is no failure, a refused account
  (403) raises the access cover, the host's events keep the list current and
  the same row again redraws nothing. The account read as the Mac reads its
  profile. The rest of the store comes with its screens.
- **Left for later, on purpose:** the agents' faces given to rows that have
  none (`wearingFaces`, step 1d's window), the open chat (step 2), the
  account's initials (Settings, step 6).
- **The tests:** 19 more (83 in all): the row and its preview line, French
  included (`testTheListLineIsTheMacs`, `testNoTimeIsNotNineteenSixtyNine`,
  the row of `SavedChatsTests`, `LanguageTests`' Chief of Staff); the list at
  launch (`SavedChatsTests`' computer-first and no-copy-unless-asked,
  `SleepingComputerTests`' resting computer); the events (`GatewayTests`'
  mapping) and the store after them; the list read from a computer through
  the gateway; the account.
- **Checked:** the tests, typecheck and lint pass; `check_translations.py`
  finds every new sentence in the core's catalogue; the inventory now counts
  31 strings the new web app shows. Two of my own test expectations were
  wrong at first (French writes a narrow space before ":", and "the list is
  on screen" is told only for an early copy, as in Swift); the code was
  right in the first and made to match Swift in the second.
- **Not checked:** against a real computer; the window that draws this is
  next.
- Pull request #519.
- **Next:** 1d, part 2: the session (the cookie, else the website's sign-in)
  and the window drawn (its colours, the sidebar, the faces).

### 1 November 2026: step 1c, the words

- `clients/apps/app/scripts/make-words.mjs` turns the Mac app's and the
  core's String Catalogs into one table per language (`src/words/mac/`,
  `src/words/core/`): each entry the translation in Apple's format (`%@`,
  `%lld`, `%1$@`, `%%`) or its plural forms. `--check` fails when the tables
  are not the catalogues'.
- `src/core/words.ts`, with `t` and `tk` for the screens (`src/l10n.ts`, the
  Mac's catalogue) and for the core's code (`src/core/l10n.ts`, the core's):
  - the key is made the way Swift makes it: t`Couldn’t reach ${name}.` is
    "Couldn’t reach %@.", a number `%lld`, a written % `%%`;
  - values go where the translation puts them, by place where it numbers
    them; a plural picks its form by the language's own rules (Polish has
    four);
  - a sentence with no translation shows its English.
- The app loads its language before it draws: the browser's first language
  Simeon is in (Windows' in Electron), else English. Only that language's
  two tables are downloaded (French: 15 KB and 73 KB compressed). The page's
  `lang` says it.
- **The checks:**
  - `check_translations.py` fails on a `t(…)` in the web app that is in no
    catalogue, on a `t` or `tk` whose English is not written out, when the
    web app's languages are not the apps', and when the tables are not the
    catalogues' (it runs `make-words.mjs --check`). So a catalogue changed by
    Mac work fails it until `pnpm words` is run (`CLAUDE.md` says so);
  - `pnpm test` runs the same table check;
  - `web_app_inventory.py` now counts the strings the new web app shows:
    2 of 3,164 (the two sentences step 1b uses).
- `docs/localization.md` names the web app's place in its platform table and
  in "Adding a language".
- **Checked:**
  - 9 new tests against the real catalogues: the keys and the values; English;
    each table its own ("Done" is "OK" on a screen, "Terminé" in the core);
    values in the translation's order; French and Polish plurals; the
    keyed sentences; a missing translation shown in English. 64 tests pass;
  - the checks catch faults: four wrong calls planted in a file (a sentence
    in no catalogue, a template whose words are not the catalogue's, a `tk`
    built from a value, a `t` of a variable) each failed
    `check_translations.py`, and the valid ones passed; a language taken off
    the web app's list failed it; a table edited by hand failed
    `make-words.mjs --check`, from `pnpm test` and from
    `check_translations.py`;
  - in Chromium, served by Vite: French, Polish, English and Japanese
    browsers each load only their own tables (Japanese falls back to
    English), the page's `lang` is the language, nothing errs.
- **Not checked:** a sentence on screen in each language: the window
  (step 1d) is the first to show any.
- Pull request #518.
- **Next:** 1d, the window: signing in, the layout, the agents list.

### 1 November 2026: step 1b, talking to the server and the computer

- `clients/apps/app/src/core`: the shared core's plumbing translated, file
  for file, each file's header naming the Swift it comes from:
  - `tokens.ts` (`Tokens.swift`): the pair, its expiry and account read off
    the envelope, the refresh answer read the Mac's way;
  - `api.ts` (`SimeonAPI.swift`): the bearer and the client headers,
    refreshing with five minutes left and once for calls made together, a
    401 asking one refresh before it signs out, `/desktop/api/` and its
    envelope, Connect calls to the box broker, dictation, Delete Account
    (five minutes, then asking the server), sign-out. Plus the web's own:
    the cookie traded for the pair (`/auth/web-session`), where the API is
    (`resolveApiBase`) and the pair kept in the tab under the old web app's
    key (`simeon.web.tokens`), all from `desktop/web/api.ts`;
  - `savedGateway.ts` (`SavedGateway.swift`): the computer's address kept
    for its account for seven days, in the tab's storage;
  - `gatewayConnection.ts` and `gateway.ts` (`Gateway.swift`): the address
    from the broker, `/health` before the broker, the hold on a full box
    server, the kept address at launch, a call sent again only when it
    surely never arrived, the computer that sleeps while the app is open
    (reads that do not wake it, the launch's one question, the wait while
    it rests), and the event stream (35 s of silence ends it; dialled again
    after 1, 2, 4, 8, then 10 s);
  - `http.ts`: fetch, with timeouts, cancelling and streams, in the place of
    URLSession; `json.ts`, `language.ts`, `recentActivity.ts` (the last 400
    lines, scrubbed, for a report);
  - `l10n.ts`: every sentence the person reads already goes through `t()`,
    which answers in English until step 1c brings the catalogue.
- **Not translated here, and where it goes:**
  - the iPhone's notifications (`registerPushDevice`): the browser's and
    Windows' notifications are step 7;
  - the host's commands and events as the screens read them (`LiveBackend`)
    and the tests that need them: step 2;
  - the picture editor's wording of a refusal and the account's initials,
    which belong to their screens.
- **The tests:** 39 of the shared core's tests translated with the same
  inputs and answers (`TokenTests`, `GatewayTests`, `GatewayConnectTests`,
  the gateway's part of `SleepingComputerTests`, and base64url from
  `SignInTests`), plus 15 new ones: the event stream loop (the Swift one
  runs only on Apple's systems and has no test), letters split across
  chunks, which failures are sent again, French dictation, one refresh for
  calls made together, the web sign-in (4), and fetch itself against a
  server on the same machine (an answer, a timeout, a closed port, a
  cancelled call, a stream, a silent stream).
- **Checked:**
  - 55 tests pass, with the typecheck and lint;
  - the tests catch faults: with one line of the gateway undone at a time
    (the stream's trust, the hold on a full server, the kept address, the
    forgotten address of a refused account, the asleep state, the record's
    word), each run fails;
  - the live server: `POST /auth/web-session` without a cookie answers 401,
    which the app reads as "not signed in on the website"; the browser's
    preflight from `https://app.simeonlabs.com` to the box broker allows
    every header the app sends, and the server exposes
    `x-automation-failure-hint` and `retry-after`, which the hold reads.
- **Not checked:** signed in, against a real computer. Nothing on screen
  uses this code yet; step 1d's window does.
- Pull request #517.
- **Next:** 1c, the words.

### 1 November 2026: step 1a, the app's folder, build and address

- `clients/apps/app`: the new app (Vite 7.3.0, React 19.2.4, TypeScript
  5.9.3, Vitest 3.2.4, the versions the workspace already uses). For now it
  shows only the mark, so the address, the build and the headers could be
  checked on their own. Its `README.md` says how it is built and served.
- `clients/apps/web/next.config.mjs`: `/app-next` opens
  `public/app-next/index.html`; `/app-next` and everything under it get the
  old window's headers (its security policy, the microphone allowed, never
  in a frame, not indexed).
- `scripts/check-built.mjs`, run by `pnpm test`: builds again into a
  scratch folder and fails when the committed files differ.
- `pnpm-workspace.yaml`, `turbo.json` (the two build settings,
  `SIMEON_APP_BASE` and `SIMEON_APP_OUT`), `.prettierignore`,
  `clients/CLAUDE.md`.
- **The lockfile:** adding the app made pnpm settle Vitest on Vite 7.3.0
  for the website's tests too (it was on 5.4.21), and changed how Next's
  optional peers are recorded. No version of Next or React changed.
- **Checked:**
  - the new app's typecheck, lint and test pass;
  - the build check passes, fails when a style changes without a new build
    (`width: 64px` to `65px`), and passes again once restored;
  - the website (`clients/apps/web`) still builds (`pnpm build`, 77 s) and
    its 24 tests pass with the new lockfile;
  - served by `next start`: `/app-next`, `/app-next/`, its script and its
    mark answer 200 with the headers above, and `/app` still serves the old
    app;
  - in Chromium, light and dark: the page draws the mark, the title is
    Simeon, and the console has no errors under the security policy.
- **Not checked:** on Vercel. The deploy after the merge is the first time;
  `app.simeonlabs.com/app-next` should show the mark.
- Pull request #516.
- **Next:** 1b, talking to the server and the computer (`Tokens`,
  `SimeonAPI`, `Gateway` translated, with the shared core's tests).

### 1 November 2026: the audit

- `scripts/web_app_inventory.py` and `docs/web-app/inventory/`: the Mac
  app and the shared core read from the code. The totals:
  - 70 Mac files (36,822 lines) and 110 shared-core files (30,281 lines), 435 views;
  - 3,164 strings;
  - 50 server calls;
  - 70 box commands (the host answers 144);
  - 22 chat row kinds and 6 request cards;
  - 566 tests.

  Every file is placed in one of 14 areas.
- The old web app was measured against them:
  - it has 1,193 of the strings and 57 of the box commands;
  - what it lacks and what it has extra are in `README.md`, "The old web app".
- `README.md`: the plan, the area table, what the Mac's own parts become, the six checks, the order of work.
- **Checked:**
  - the script runs and its JSON files load;
  - the measurements were spot-checked by searching both codebases (routines' commands found in the old web app; `publishSkill` in the old web app only; the connector pages' strings almost all missing from it).
- **Not checked:** the strings measure can read a little high, because short words shared by many screens ("Cancel", "Done") count as found.
- Pull request #515.
- **Next:** step 1, the base, once the founder answers where the code lives.
