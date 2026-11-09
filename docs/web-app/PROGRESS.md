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
| 1. The base: the server and the computer, signing in, the window | Done, 1 November 2026 (1a to 1d); the first run for a new account and the access cover, carried to step 2, done there |
| 2. The sidebar and the chat | Done, 1 November 2026: 2a (the chat's core and the chat on screen), 2b (a message's actions, find, the working line, names in colour, link icons, the emoji picker), 2c (file cards, pictures, link cards, the preview with PDF, Word, sound and Excel, the viewer), 2e (the message field's own parts: files, ":", "@", "/", "#", dictation), 2f (the sidebar: pins, sections, picked rows, menus, renaming, hiding, deleting, dragging, the rail, the width), 2g (a new account's first run, the access cover). The sidebar's head and foot (search, new chat, the account, Connect apps) come with their screens in step 4. Next: step 3, the cards |
| 3. The cards | Done, 2 November 2026: 3a (the card's frame, the question, the email and Slack drafts, the auto-review approval), 3b (the secret, the computer handed over, the in-chat form, 1Password's fill and connect cards), 3c (apps to connect, Slack or GitHub for a routine, the cloud agent, a new teammate), 3d (the flights, a flight's details, the travellers' form, the checkout, the products). What needs the computer's screen comes with it in step 5, an app's Connect in step 6, a teammate's View Profile in step 4. Next: step 4 |
| 4. The agent's pane, search, new chat, the org chart, starter packs | Done, 2 November 2026: 4a (the agent's pane: its frame, Profile and Notifications, a flight's details taken in; the window's model; Search and New Agent in the sidebar), 4b (the avatar editor: faces and voices, a picture generated or of one's own; New Agent), 4c (an agent's routines and a routine's editor), 4d (search, ⌘K; an agent's channels; a group's members), 4e (the org chart, starter packs from `?pack=`). An agent's own Computer tab and the computer's screen come with step 5 (done); in search and "/", Settings' pages, Connectors and the themes come with step 6, Update Simeon's Computer with step 5 (done); the sidebar's account and Connect apps with step 6. Next: step 5, the computer and calls |
| 5. The computer and calls | Done, 2 November 2026: 5a (the frame: the window model's and the store's places, noVNC and ElevenLabs' kit, the app window's policy), 5b (the pane's Computer tab, the full computer view with its keys, paste and helpers, the agent's pointer, step 3's buttons that open the computer), 5c (the rebuild, recovery and move, the computer's dialogs and pills, low disk, the access notice, the sidebar's card and Update pill, Update Simeon's Computer in ⌘K and "/"), 5d (calls with an agent: the ring, the banner, the call's line and its lines over the chat; and two agents' exchange over the chat, missed in step 2). Next: step 6, Connectors and Settings |
| 6. Connectors and Settings | Done, 2 November 2026: 6a (the frame: the window's overlay slot, the theme chosen, Settings' shell and parts, the sidebar's account and Connect apps), 6b (connecting an app: the consent, the sign-in in a tab, the card's Connect, Add Another Account, the new app's return page), 6c (Connectors' core, model and list), 6d (Connectors' pages: an app's, a server's, setup, a skill, accounts and tools; the 232 written pages as data), 6e (Settings' General, Account, Permissions, Computer, Help & support and Legal; Send Feedback and Report an Issue), 6f (Usage & Billing, Wallet, the Credentials Store, the credits' line, the account menu and About). Updates and the Mac's "Your Computer" are left out (the Mac's alone). Next: step 7, Windows |
| 7. Windows | Done, 2 November 2026: 7a (the frame: `windows/`, the committed build served from inside the app at `app://simeon/app-next/`, the bridge's contract, the policy, the window and its drag areas, the server's CORS for the app), 7b (signing in through the browser, the session, the agents and chats kept on the PC, Relaunch, About's and a report's facts and logs), 7c (Windows' notifications, the taskbar's number, the tray, the menu and zoom keys, Control-Tab, the call's own window), 7d (`simeon://` links, connecting through the default browser and the loopback, Stripe's window and `billing/settle`, Windows Hello, the clipboard, 1Password through `op.exe`), 7e (updates and Settings › Updates, the release, the icon, the workflow, the server's Windows routes), 7f (the agent's hands on the PC: commands in PowerShell, Windows' places that hold keys refused, the Allow card, Settings › Computer › Your Computer with the team's ceiling and the commands allowed once; the engine told the PC runs Windows, which reaches the computers with the next host bundle). Nothing has run on a Windows PC yet, and no release is signed (Open questions). Next: the founder's open questions, then the first signed release tried on a Windows PC |

## Decisions

| Date | Decision | By |
|---|---|---|
| 1 November 2026 | A Windows app is the next project | The founder |
| 1 November 2026 | The Windows app is Electron around a web app. The web app is a translation of the Mac app into Simeon Labs' own code, and replaces the old web app at `app.simeonlabs.com/app`. It is not built on the old web app, whose window is another company's compiled renderer (`desktop/NOTICE.md`). (3 November 2026: the web app replaces nothing and is offered to no one; see below.) | Proposed in the session; the founder said "Go" |
| 1 November 2026 | The Mac app stays Swift. A new Mac feature is also needed in the web app, and the checks in `README.md` fail until it is there | Proposed in the session; the founder said "Go" |
| 1 November 2026 | Nothing is remembered: the checklist is generated from the code (`scripts/web_app_inventory.py`) and this file records the work as it happens | The founder |
| 1 November 2026 | The code lives in `clients/apps/app`: its own app in the web workspace, React, TypeScript and Vite, in the browser only. Not inside the Next website (`clients/apps/web`), because the Windows app loads the same files from disk, which needs plain built files and no server | The session; the founder left the open questions to the session ("Ok well all you") |
| 1 November 2026 | It is served at `app.simeonlabs.com/app-next` while it is built. The old web app stays at `/app` until the new one has everything the Mac app has; then the new one moves to `/app`. (3 November 2026: no move; see below.) | The session, as above |
| 1 November 2026 | Its built files are committed into `clients/apps/web/public/app-next`, as the old app's are, so the website's deploy does not change (Vercel builds only `web`). `pnpm test` fails when they are not the build of the source | The session, as above |
| 1 November 2026 | Skills publishing is left out, as on the Mac. If the Mac app gets it, the checks ask for it here too | The session, as above |
| 1 November 2026 | The web app keeps no copy of the agents and chats on the device, as the Mac does on disk (`SavedChats`): it shows the server's copy (`chats/agents`, `chats/lines`) while the computer is away, which the server keeps for exactly that. A browser's storage would hold the person's messages on a shared or public computer (Step 7: the Windows app keeps them on the PC, as the Mac; see below.) | The session, as above |
| 1 November 2026 | Signed out, the web app goes straight to the website's own sign-in page and comes back (`/login?return_to=…`), as the old web app does: the website's page is the gate. The Mac's sign-in screen comes with Windows (step 7) (Step 7: done; see below.) | The session, as above |
| 1 November 2026 | What the person has typed and not sent (the Mac's drafts, kept on disk) is kept in the tab's memory only, and goes with the tab: for the same reason as the chats | The session, as above |
| 1 November 2026 | The web app has no catalogue of its own: it reads the Mac's two String Catalogs, made into tables by a script, so a translation is written once, for the Mac, and the web app has it. The screens read the Mac app's catalogue and the code translated from the core reads the core's, because the two say some English differently ("Done": "OK" on a Mac screen, "Terminé" in the core) | The session, as above |
| 1 November 2026 | A message that is one link is drawn as the Mac's card with the site's icon, its name and the address, but not the page's title, which the Mac reads from the page. A web page may not read another site, and a route on Simeon's server that read it would hand the server every link the person opens | The session, as above |
| 1 November 2026 | Save hands the file to the browser as a download (the browser asks where, or puts it in Downloads, as the person set it), not the Mac's save panel; a file the computer won't hand over says "Couldn't save this file" in the browser's own alert, as the Electron app's error box did. A picture keeps the browser's own right-click menu (Copy image, Save image as), as a link does | The session, as above |
| 1 November 2026 | The preview uses the libraries the window itself used, at its versions: highlight.js 11.9 now (in a worker, with only the languages the preview asks for), pdf.js 5.4.296 and mammoth for PDF and Word in part 3. Not SheetJS 0.18.5, the window's reader for Excel: the copy on npm has known security holes (fixed only in releases off npm), and the files come from the internet through the agents. How Excel files show is decided in part 3 | The session, as above |
| 1 November 2026 | Attaching files in the browser: Photo or Video opens the browser's own file chooser showing only pictures and videos (a web page can't open the Photos library), and a photo goes as it is, not made a JPEG as the Mac makes HEIC; a picture the browser can't draw (HEIC outside Safari) shows the tile's symbol. A paste brings files unless it also holds the words as rich text (Office, iWork and web pages put a picture of copied words beside them; the words win, as on the Mac). Files dropped outside the chat are taken by nothing, so the browser never opens them in the window's place | The session |
| 1 November 2026 | The emoji picked lately from ":" are kept in the browser (`simeon.emojiRecents`, the Mac's own name for them): only which emoji, never words of a message | The session |
| 1 November 2026 | A pick from "@", "/" or "#" sits in the field as its own words ("@Nora", "#12") on the Mac's grey, kept track of as the words change (the iPhone's way), not as the Mac's picture of a chip with its face or logo: a browser's text field holds only words, and an editor of our own for it would be a large piece for a small gain. It goes with the message in the window's document, as on the Mac; Delete takes it whole; undo and redo bring it back. The agents picked lately from "@" are kept in the browser (`simeon.mentionRecents`): which rows, never words | The session |
| 1 November 2026 | Dictation records in the kind the browser can (WebM with Opus in Chrome, Edge and Firefox; MP4 in Safari), not the Mac's AAC: the transcription takes either. The browser asks for the microphone itself, the first time | The session |
| 1 November 2026 | Dictation's refused-microphone line stays the Mac's sentence ("…in your system settings."), in a browser and in the Windows app too | The founder: "keep the mac sentence" |
| 1 November 2026 | "/" offers the agent's skills now; each of the app's actions ("Org Chart", "Chat Settings", "Settings: General", the themes…) joins it with the screen it opens (steps 4 to 6), so the list never offers what does nothing (Step 6: done; see below.) | The session |
| 1 November 2026 | Excel workbooks (.xlsx) are read by a small reader of our own (`src/core/xlsx.ts`): the browser unzips them itself and the reader takes the first sheet, each value written as its number format says. No library: SheetJS's npm copy has known holes, and the other readers are either days old with unfamiliar dependencies or built for servers. The old binary .xls is not read; it says "Preview not available" with Download. The founder: "keep going on excel" | The session |
| 1 November 2026 | The sidebar's pins and sections live on the computer, in its settings (`pinnedAgentIds`, `sidebarSections`), as the Mac keeps them, so the Mac and the web app show the same; which sections are folded is kept in the browser (`simeon.sidebar.foldedSections`, the Mac's own name for it): which sections, never names | The session |
| 1 November 2026 | Several rows are picked with ⌘-click on a Mac and Control-click on Windows and Linux (each system's own way), and ⇧-click. Control-Tab, which walks the Mac's rows, is left out in a browser, which switches tabs with it; the Windows app (step 7) can take it back (Step 7: done; see below.) | The session |
| 1 November 2026 | The row's menu leaves out Edit Profile until the agent's pane (step 4), so it never offers what does nothing (as "/" does) (Step 4: done; see below.) | The session |
| 1 November 2026 | The confirmations and alerts are the window's own, drawn as the Mac's (the mark, the title and words, Cancel and Delete in red), not the browser's `confirm()`, which can't make Delete red, says the site's address over it, and stops the page | The session |
| 1 November 2026 | The sidebar's width and whether it is folded are kept in the browser under the Mac's names (`simeon.sidebar.width.320`, `simeon.sidebar.collapsed`), as the Mac keeps them on each Mac: each computer its own. ⌘B on a Mac, Control-B on Windows and Linux. The window is never narrower than 512 (the rail and the chat's 424), as the Mac's | The session |
| 1 November 2026 | Rows, pins and sections are dragged with the browser's own dragging, in a kind of their own, so the message field never takes a dragged row as words or files | The session |
| 1 November 2026 | Sign Out on the web drops this tab's pair (on the server and here), then goes to the website's own sign-out (`/v1/auth/logout`), which ends its cookie; otherwise the next visit would sign straight back in from it | The session |
| 1 November 2026 | The access cover's button opens its page (the plans page, Apple's, Simeon Labs', or Stripe's card page asked for first) in a new tab, and the cover reads the access, the plan and the agents again when the tab comes back to the front. The Mac's charge after Stripe's card page (`billing/settle`) is not made: the web can't tell when that page was finished (the Mac's sheet comes back on the app's own link) (Step 7: the Windows app makes it, after Stripe's window; see below.) | The session |
| 1 November 2026 | The wordmark's face (Suravaram, SIL Open Font License) ships with the web app, its licence served beside it (`/app-next/fonts/Suravaram-OFL.txt`) | The session |
| 2 November 2026 | **Windows is the goal.** The web app is the means: every choice in it is weighed for the Windows app (Electron around these same files), and what a choice becomes there is listed under "For Windows" below, so step 7 starts from a list, not from memory | The founder: "remember that we building for window. Window is the final goal" |
| 2 November 2026 | The secret card says Saved only once the computer's copy says it kept the secret (`secretProvided`), as the iPhone does (the Mac says it as soon as the command returns). What is pasted, or typed in a form's masked field, is left to the browser, read only when sent and emptied then, never copied into the page's HTML; the browser and the password managers are asked not to offer the person's own logins there, which would go to the agent's computer | The session |
| 2 November 2026 | Where the Mac asks for Touch ID (1Password's Fill, a checkout's Allow), the web asks in the window's own alert, with the words the Mac's Touch ID shows: a web page has no Touch ID of its own (WebAuthn would need the server to keep a key for each person), and the alert keeps the Mac's second, deliberate step. A checkout's Allow then carries no device approval, so Link asks the person in its own app, as the Mac does when there is none. In the Windows app: Windows Hello, decided at step 7 (Step 7: done; see below.) | The session |
| 2 November 2026 | 1Password's Connect is left out on the web: it runs 1Password's command-line tool on the person's computer to make the shared vault and its read-only key, which a page can't. The card shows the agent's reason, the Mac's paragraph on what connecting makes, and the X. It comes back in the Windows app (step 7) (Step 7: done; see below.) | The session |
| 2 November 2026 | What needs the computer's screen comes with it in step 5: the hand-off's Take over and Open computer, a Link checkout's Review order and its picture opening the checkout, the bank check's Open the computer. Until then they are left out, never a button that does nothing; a Shop checkout's Review order is the store's page, in a new tab, as on the Mac (Step 5: done; see below.) | The session |
| 2 November 2026 | An app card's Connect waits for step 6, with the founder's consent sheet (`ConnectConsent`) and the app's sign-in, built once there for the cards, the rows and the pages. Until then the card says Connected or Coming soon, and otherwise has no button (Step 6: done; see below.) | The session |
| 2 November 2026 | Pages a card opens (a pull request, Link's and Shop's pages, a shop's page) open in a new tab, without `opener` or the referrer. Slack's and GitHub's linking page opens in a tab opened blank at once, so the browser lets it open while the computer is asked, then sent to the page, without `opener` (that page may be told the app's address, its origin only); the card asks again whether it is linked when the tab comes back to the front | The session |
| 2 November 2026 | A cloud agent card has View PR and no Open: the Mac's Open goes to `app.simeonlabs.com/agents/<id>`, a page that doesn't exist. Its name and "PR #412" open the pull request when there is one; otherwise they are words | The session |
| 2 November 2026 | The joined card's View Profile waits for the agent's pane (step 4); meanwhile Go to Chat keeps its half of the row (Step 4: done; see below.) | The session |
| 2 November 2026 | The catalogue and the server's Coming soon list are kept in the tab's memory for the sign-in, read once each (the Mac also keeps the catalogue on disk) | The session |
| 2 November 2026 | A flight's details show beside the chat as the Mac's pane, until the agent's pane (step 4) takes them in: what the window leaves beside the chat's 424, from the Mac's 280 to 480 (a browser can't grow its window as the Mac does). Another chat opened closes them. Whether they folded the sidebar is kept under the Mac's name (`simeon.pane.tookSidebar`) (Step 4: done; see below.) | The session |
| 2 November 2026 | A day is picked on the Mac's calendar, drawn in the page's own parts, not the browser's date field, which looks and orders its parts differently in each browser and system. Title, Gender on ID and Issued by are the Mac's words over the system's own list. "Issued by" lists the Mac's 261 regions with their English names (measured from Foundation, kept in `countries.json`), English in every language, as on the Mac | The session |
| 2 November 2026 | What a traveller types is held by the sheet only and forgotten when it closes; nothing of it in the browser's storage. The names, email and phone carry the browser's autofill hints (the Mac's `textContentType`); the passport number none. The email is a plain field (a browser's email field rewrites an international domain) | The session |
| 2 November 2026 | Airline logos and the products' pictures come straight from their sites, as the Mac fetches them, without the referrer, https only. An airline logo is cut and lightened as the Mac's when its site lets a page read it, else drawn as it comes, else the initials. The checkout's picture and the shop's icon are read from the computer, a resting computer waited for, not woken | The session |
| 2 November 2026 | The card chooser is the window's own popover under the row, without the Mac popover's arrow; a product's sheet in a window narrower than 812 lets its picture give way so its words keep 240 | The session |
| 2 November 2026 | A card whose line can't be read is one notice, with the message's own words where the core keeps them (Chat.swift's `row(for:)`) | The session |
| 2 November 2026 | Book with Simeon belongs to its flight: another flight shows its own button, and a booking answered after another flight was opened doesn't close that one (the Mac's reused button keeps the last flight's spinner or refusal). No beep when the sheet finds something to fix (the Mac's `NSSound.beep`): a page has no system alert sound | The session |
| 2 November 2026 | The agent's pane takes what the window leaves beside the sidebar and the chat's 424, from 480 down to 280 (the Mac grows its window for it; a browser can't), and closes when dragged under 244. Whether it is open, its width and whether it folded the sidebar are kept in the browser under the Mac's names (`simeon.pane.open`, `simeon.pane.width`, `simeon.pane.tookSidebar`) | The session |
| 2 November 2026 | The pane's Computer tab is left out for an agent until the computer comes (step 5); a group's Computer tab is its members, as on the Mac (Step 5: done; see below.) | The session |
| 2 November 2026 | ⌘N and the sidebar's compose button open New Agent: the Mac's `Features.groupChats` is off, so its To: line (`NewChatPane`) never shows there, and is left out | The session |
| 2 November 2026 | "/" Open Hidden Agents opens the Hidden Agents list, as ⌘K's does, though the Mac's "/" offers it and does nothing (3 November 2026: the Mac's does too) | The session |
| 2 November 2026 | A picture of one's own comes from the browser's file chooser (the Mac's panel's kinds), a drop or a paste outside a field. The browser reads it (turned by its EXIF, as on the Mac), it is drawn down to 1024, cropped in a canvas and sent as the Mac's 256-pixel PNG. A picture pasted as a picture is "Pasted image"; a file pasted keeps its name | The session |
| 2 November 2026 | A voice's sample plays in the browser's own audio, one at a time, stopped when the editor closes; one the browser can't fetch or play greys its button. The website's policy for the app's window lets sound come from any https address (`media-src … https:`, as `img-src`): the samples are ElevenLabs' own links, whose host varies, and a sound can't run code | The session |
| 2 November 2026 | New Agent's editor is the window's own popover under the face, without the Mac popover's arrow, kept in the window. ⌘V pastes a picture into it too (the Mac's doesn't, though its drop zone says "paste"; 3 November 2026: it does now) | The session |
| 2 November 2026 | The voice field names the agent's voice after a face of the other gender changed it (the Mac's keeps the old name). No beep when Create is refused, as in 3d | The session |
| 2 November 2026 | The pass that gives a face to every agent without a picture (`assignMissingFaces`) waits for the store's own passes; meanwhile the web shows the face each would get, and the Mac and the iPhone give it | The session |
| 2 November 2026 | No check generates a picture on the real server: it costs the person's credits. The stand-in's is used | The session |
| 2 November 2026 | A routine's Delete asks nothing, as on the Mac and the iPhone | The session |
| 2 November 2026 | The routines' menus are drawn in the page as the window's own (glass, 10 round, items 13 on 24), not the browser's `<select>`, which can't hold the logos, submenus, headings or ticks that stay open. A click outside a menu or a trigger's popover only closes it, as the Mac's | The session |
| 2 November 2026 | Run history says "Just now" for a run begun since the last 30-second tick (the Mac's can say "In 1 min") | The session |
| 2 November 2026 | A routine's popover keeps its connecting words ("at", "on", "every"…) and Advanced's "minutes" and "hours" in English in every language, as the Mac draws them: they are in neither catalogue (3 November 2026: translated on the Mac and the web; see the log) | The session |
| 2 November 2026 | A time of day in another language is that language's short time ("09:00" in French, "9:00" in Spanish), CLDR's, as Apple's "jmm" | The session |
| 2 November 2026 | Search offers only the actions whose screens the window has, as "/" (`windowActionIds`): Org Chart, Open Hidden Agents, Members, Channels, Chat Settings. Settings: General, Usage & Billing, Connectors and the themes join it with step 6, Update Simeon's Computer with step 5; each is one id and one case in `runAction` (Step 5: done; see below.) (Step 6: done; see below.) | The session |
| 2 November 2026 | A routine found by search opens that routine in its agent's pane (`openRoutineFor`). The Mac, copying the Electron window, opens the open agent's pane on Computer, or another's on Profile (3 November 2026: the Mac opens the routine too) | The session |
| 2 November 2026 | A link found by search shows its address and its site's own icon, not the page's title (as in the chat, 1 November), and opens in a new tab without `opener` or the referrer | The session |
| 2 November 2026 | With ⌘ held, search's rows show ⌘ on an Apple computer and Ctrl elsewhere (the Mac's always show ⌘) | The session |
| 2 November 2026 | A channel's token is pasted in a masked field left to the browser, read once when sent and emptied, never in the page's HTML; the password managers are asked not to offer the person's logins there (the secret card's way, 3b) | The session |
| 2 November 2026 | Removing a group's member asks in the window's alert, its buttons waiting while the change goes, as the Mac's alert disables them | The session |
| 2 November 2026 | Search reads its three gates (the computer's search, the agent network, the chat's channels) together as it opens; the Mac reads them one after another. The same answers, sooner | The session |
| 2 November 2026 | A starter pack reaches the web app on its own address with the pack's id (`app.simeonlabs.com/app-next/?pack=<id>`, `/app/` after the move), read once the window is up (signed in, past the first run) and taken out of the address; the sign-in's `return_to` and the first run keep it. The website is not changed (Open questions). In the Windows app it is the `simeon://` link (Step 7: done; see below.) | The session |
| 2 November 2026 | The org chart zooms with the wheel about the pointer, and with a pinch (the browser's Control-wheel) five times as fast; the page never zooms over it. A drag from a node pans and opens no card, as the window's. A new agent's node appears in its place (the Mac's fades in) | The session |
| 2 November 2026 | The starter pack's sheet is 720 wide, or the window less 16 a side; Return adds from the sheet itself, a button with the keys does its own (3d's way). A pack that can't be read says the server's sentence, or "Simeon can't be reached…" for a machine's error; a team not made says this Add's last refusal (the Mac shows any problem the store holds) | The session |
| 2 November 2026 | The website's policy for the app's window lets it connect to the API's `wss` address (the screen's stream goes through the API's own proxy, as production has it) and to `https://*.elevenlabs.io` and `wss://*.elevenlabs.io` (the call): connections only, no script of theirs | The session |
| 2 November 2026 | The remote branch held step 4's commits, already squash-merged into `main` (#537): it was moved onto `main` with a force-with-lease push before step 5, as the branch's rules allow | The session |
| 2 November 2026 | The computer's screen is drawn by noVNC 1.7.0 from npm (MPL 2.0, its latest release), in the app's page, loaded only when a screen shows; its licences and where its source is are served beside the app (`public/novnc/`). The iPhone and the Mac bundle a build of noVNC whose version isn't recorded; noVNC failing in the page counts as the Mac's crashed screen page | The session |
| 2 November 2026 | The clipboard: a page can't read it without the browser asking, so this computer's words reach the agent's only with a paste (⌘V, Ctrl+V elsewhere) while its screen has the keys: the words onto the computer's clipboard, unless it holds them already, then Control and V pressed by the app on every computer. The computer's copied words are written to this computer's clipboard only while the page has the focus; one copied while it is behind is dropped | The session |
| 2 November 2026 | While the full computer view shows, every key is its screen's: the window's own do nothing and Escape doesn't close it, as on the Mac; Tab goes round the view's own buttons (the Mac swallows it). The bar has no traffic lights | The session |
| 2 November 2026 | A browser tab doesn't set Disk Saver to work by itself when the disk runs low, as the iPhone: the Mac app open beside it does, and two apps each making one would give two. The banner and Go to Disk Saver are there as on the Mac | The session |
| 2 November 2026 | The server's watch of the computer's move (`WatchSandBoxMigration`) is read with the browser's own fetch: Connect's stream needs its enveloped request, which the app's stream reader doesn't send | The session |
| 2 November 2026 | The window reads the account's access when it opens and each time it comes forward, not during a rebuild, as the Mac, so the access notice can show over the message field | The session |
| 2 November 2026 | A call's voice is ElevenLabs' web kit (`@elevenlabs/client` 1.28.0), loaded only when a call starts, over WebRTC only; the browser asks for the microphone before it loads; one session and one record per call. Its resampler from jsdelivr is only on its WebSocket path, never taken, and the app's policy would refuse it | The session |
| 2 November 2026 | The call's banner sits inside the window, over everything in it (a page can't float a window of its own), at the Mac's top right, 12 down and 16 in, of the chat's column: left of the agent's pane when it is open, 8 under find's bar when find is open, so it never covers the window's own controls | The session |
| 2 November 2026 | The ring and the hang-up are the core's samples played with the browser's audio at the Mac's loudness; the waveform follows the Mac (random bars scaled by the voice's activity). No environment on the web: calls are on, the Mac's default. Leaving the page with a call on ends it. No Agent › Call menu (a page has none). A stand-in voice exists only for the tests and a development build | The session |
| 2 November 2026 | Under a call's lines or an exchange, the chat, its head and its field are inert and files dropped refused, as the Mac's covers are modal; the cover takes its Escape, so find stays open | The session |
| 2 November 2026 | The theme chosen (System, Light, Dark, in Settings › General, ⌘K or "/") is kept in the browser under the Mac's name (`simeon.theme`) and set on the page's root (`data-theme`). The stylesheets keep their dark colours under `prefers-color-scheme: dark`; a build step (`scripts/theme-css.mjs`) makes each such rule follow the theme chosen, its weight unchanged. What the page draws by the scheme itself (a dark logo) asks `useDarkScheme()`, never the system. A change fades over 0.3 s (the browser's view transition), none with Reduce Motion | The session |
| 2 November 2026 | Settings has no Updates page: it is the Mac's alone (Sparkle), and a web page is always the latest (Step 7: the Windows app has it; see below.) | The session |
| 2 November 2026 | Computer's second group, "Your Computer" (Execution on Local Computer and the team's ceiling, hardware security keys, Commands Allowed Once), is left out: it is the Mac's own hands on the person's computer, which a browser doesn't have; so are the team's ceiling read and the `localToolPermission` and `webauthnProxyEnabled` pushes. It comes back with the agent's hands on the PC (Step 7: see below.) | The session |
| 2 November 2026 | Help & support has no "Simeon Help Center" row: on the Mac it does nothing (`HelpSupport.openHelpCenter() {}`, kept by the founder on 22 October 2026 though it points nowhere yet), and the web never shows a button that does nothing. It comes back when it points somewhere | The session |
| 2 November 2026 | An app's sign-in opens in a tab of the browser's own, not a sheet: a tab opened blank on the click (a browser lets a page open one only then: the consent's Connect, Reopen, the setup page's Add, Add Another Account), handed to its own sign-in (`holdingTab`, `signIn(…, { tab })`), then sent to the page once the computer gives it, http or https only. Asked every 2 s up to 150 times, as the Mac. A Connect that leads to a form first opens no tab (`{ signIn: false }`) | The session |
| 2 November 2026 | The app closes a sign-in's tab only while it may (blank, or on the web app's own pages); on another site the tab is left to its page. Keeping its `opener` would let the window close it, but would also let a maker's page send the Simeon tab itself to a page of its own (measured: reverse tabnabbing). The web app's return page closes its own tab; the server's "Connected, you can close this tab" page stays open (Open questions) | The session |
| 2 November 2026 | A sign-in's tab the person closed can't say whether the sign-in finished: ten more looks, then `unconfirmed`, and the app the connect added is never taken back (the Mac's browser fallback). A blank tab closed before its page came is the person changing their mind: `cancelled`, the app taken back. A tab the browser refused on the click asks nothing of the computer and says "<name> didn't connect. Try again." (the core's `didntConnect`) in the window's alert | The session |
| 2 November 2026 | The makers that take only the loopback (`loopbackOnly`: Dropbox, Canva, Square, Vercel, Lovable, Gamma, Semrush and eleven others), found as the core finds them, by the page's `redirect_uri`, are never opened: a browser can't listen on 8787. The connect ends `cancelled`, the app taken back, and nothing is said, as no sentence in the catalogues fits (Open questions) | The session |
| 2 November 2026 | A sign-in that comes back through Simeon Labs' server is not named to the server first (`mcp-oauth/return` takes only the apps' schemes): the server sends it to the web app's own return page, `connected.html`, built by Vite as a second page beside the window. Until the move to `/app`, the server's target is the old app's `/app/connected.html`, which finishes the new app's sign-ins too; the server is not changed | The session |
| 2 November 2026 | The return page trades the website's cookie for a pair in its memory only, hands the maker's code to the computer, says Connected, closes its tab and signs the pair out (with `keepalive`, and again on `pagehide`). It says a maker's refusal in the catalogues' words, not the address's, and tells the window how the sign-in ended, on the same site only (`BroadcastChannel` `simeon.sign-in-ends`: the state and whether it was refused, no code), so a refusal ends `cancelled` and the app is taken back, as on the Mac. The old page's second lines are in neither catalogue and left out | The session |
| 2 November 2026 | A refused Connect on a chat card says nothing on the card, as on the Mac: the spinner ends, Connect is back, and the store keeps the sentence (`problem`) | The session |
| 2 November 2026 | The apps are read again when the computer says they changed (Store.swift's `.appsChanged`), so a sign-in that finishes after its wait says Connected | The session |
| 2 November 2026 | Connectors' model is split as the store asks: the computer's state lives in the store until sign-out, the view and the order of each action in the window's model (`pluginsModel.ts`), which reads the state through getters | The session |
| 2 November 2026 | The categories' menu is the window's own, under its button, the chosen one ticked (the Mac pops its NSMenu with the chosen item over the button); a press outside only closes it and the click after it is swallowed, as an NSMenu takes that click. Available \| Yours is drawn in the page, a group of two, the chosen half sliding in 0.22 s | The session |
| 2 November 2026 | ⌘F on a Mac, Control-F elsewhere, gives Connectors' search the keys; the browser's own find never opens while Connectors is open. The window coming forward is the tab's `focus`, as for the computer and Channels | The session |
| 2 November 2026 | A browser tab left behind on Connectors doesn't keep the computer from resting: the servers are not read every 15 s while the page is hidden, and are read once when it shows again or comes forward (the Mac reads them every 15 s while open) | The session |
| 2 November 2026 | Only the skills of the agent the window shows are kept, whatever order the answers come in (the Mac lets the last answer win) | The session |
| 2 November 2026 | A logo the computer reads is kept only as an image data address, drawn in an `<img>`, where an SVG runs no script. A sign-in page from the computer is opened only when it is an http or https address; another says "didn't connect" and the app is taken back (the Mac opens any address in Apple's sheet) | The session |
| 2 November 2026 | Available's order and its sections' are English's collation in every language, as the Mac's; a section's › says "Shows every app in …" to a screen reader, without a tooltip, as the Mac's accessibility hint | The session |
| 2 November 2026 | The 0.9 s between two sign-in pages is the sign-in's own wait (`after`), so it takes its click's tab at once; each page's moment is kept as it is asked, so two asked together are spaced too (the Mac's two could both find the last page old enough) | The session |
| 2 November 2026 | The 232 written connector pages are data made from the core's ConnectorPages.swift (`scripts/make-connector-pages.mjs`, `pnpm pages`), each sentence a literal `t('…')` made only when its page is asked for, in the app's language then. `pnpm test` checks the table is the Swift's; the script stops on a case of another shape | The session |
| 2 November 2026 | A connector page's Information links and View Source open in a new tab without `opener` or the referrer, and only http and https addresses are drawn as links (the Mac opens whatever scheme `NSWorkspace` takes) | The session |
| 2 November 2026 | A connector's setup values stay in the browser's own fields, read when sent; a secret is masked, offered no saved logins and emptied when sent (3b's way), so after a refusal it is typed again; only whether each field is filled is kept, for the required lines | The session |
| 2 November 2026 | An app's accounts: a read, or an earlier change's answer, that left before a later change is dropped, and a refused last change reads the list again; an account's Remove runs once at a time. The core keeps whichever answer comes last (proposed for it) | The session |
| 2 November 2026 | On a connector page, the rename is the window's alert with a field (the Mac's alert with a `TextField`); the examples' picture is the Mac's own asset (`ConnectorHero`), shipped with the app; a long value is cut in its middle; the instructions' field grows with its words where the browser can (`field-sizing: content`), else stays 94 high and scrolls; a page reads its server's tools as it shows and again once its server is there; Add Another Account is faded while another app's sign-in is open | The session |
| 2 November 2026 | " (optional)" after a setup value's label and "URL" in a server's Details stay English in every language, as the Mac draws them (neither is in a catalogue) | The session |
| 2 November 2026 | The language chosen in Settings is kept in the browser (`simeon.language`) and read once as the page loads, as Apple reads an app's language at launch, so the window never mixes two; Relaunch loads the page again; System gives it back to the browser's languages. The server and the computer are told it from the next load | The session |
| 2 November 2026 | General's time zone and Permissions wait until the computer's values are read: the switches greyed, the rules coming with the read; a failed read says "Couldn't load your settings" and keeps them waiting; a read answering after a change is dropped. The Mac writes on its defaults meanwhile; on the web the read can wake a resting computer and take tens of seconds, and a write replaces every rule or the zone chosen (proposed for the Mac and the iPhone; 3 November 2026: done on both) | The session |
| 2 November 2026 | The time zone menu lists the browser's own zones (`Intl.supportedValuesOf('timeZone')`, 418 in Chromium 141), drawn as the window's menus with each zone's time in grey and the Mac's type-to-select, not the browser's `<select>`; a zone chosen elsewhere that the browser doesn't list shows first, ticked | The session |
| 2 November 2026 | The browser's zone is told to the computer each time the stream comes (back), beside the language, without waking it, as the Mac tells its own on every connect; the person's own pick stays (the computer keeps it apart, `userTimeZoneOverride`). A browser that says exactly UTC (the privacy browsers hide the zone so) tells nothing and writes no zone of its own; General then shows the computer's | The session |
| 2 November 2026 | The account's password is typed in the browser's own masked fields, as a new password (a password manager may keep it: it is the person's own Simeon password), read once as it is sent and emptied once saved; never in the page's HTML or storage | The session |
| 2 November 2026 | A report says where it comes from as the browser tells every site: platform "Web", the app's version (`web-next-0.1.0`), the browser and its major version, the system with its version only from Chromium's client hints (Safari and Firefox freeze theirs), the language and the zone. Diagnostics, when the person agrees, are what the tab keeps (its state, its recent activity, the screens' log), scrubbed; there is no `voice-call.log` on the web | The session |
| 2 November 2026 | A report's screenshots come from the browser's file chooser or a drop, drawn into a canvas at 1,600 on the long side at most and sent as a JPEG at 80%, as the Mac's ImageIO makes them; a file the browser can't draw is left out. The agent menu is the browser's own list laid unseen over its button (3d's way), so Escape closes the list, not the sheet | The session |
| 2 November 2026 | Legal's pages open in a new tab without `opener` or the referrer. The copyright line is written once (`copyrightLine`, read by Legal and About), and the names check allows the legal company's name there and in the committed build | The session |
| 2 November 2026 | Stripe's pages (Start Plan Now, Upgrade, Add Credits, Manage Billing) and the plans page open in a new tab, blank on the click, then sent by a link of its own without the referrer, https only; no `back` and no `billing/settle` (the 1 November decision). When the tab comes back to the front, the access, the plan and the usage are read again, once, Settings open or not. A tab the browser blocks says "Couldn’t open billing. Try again." | The session |
| 2 November 2026 | The usage is read once signed in from the account's disc (there as long as the window is), as a chat opens and as each of its answers ends; only the latest read's answer lands. The computer's notices are read as a chat opens and when the stream comes back, not waking a resting computer, and their events applied as they come | The session |
| 2 November 2026 | The line near the limit, once closed, is kept closed in the browser under the Mac's name (`simeon.usage.approachingClosed`), the last twelve | The session |
| 2 November 2026 | Wallet reads the connected apps and the catalogue (`loadAppCards`), without which "Link by Stripe" can't be matched to its app; a row opens the app's page in Connectors | The session |
| 2 November 2026 | In the Credentials Store, a saved password shows only after the window's alert with the words the Mac's Touch ID shows ("Show the password for GitHub", Cancel and Show), then is read from the server. Its field is a text field masked by CSS while hidden, with no password field and no form on the page, so the browser's own password manager finds no sign-in or sign-up to offer or save; a browser that can't mask a text field gets a password field. Never in the page's HTML or storage; emptied before the sheet closes | The session |
| 2 November 2026 | A login's icon is the site's own `/favicon.ico`, loaded without the referrer, the name's letter until it comes and for a site without one (the Mac reads the site's page for its touch icon, which a page may not) | The session |
| 2 November 2026 | The Credentials Store's sheet is drawn in the page: Escape closes it, a click outside only while nothing changed, Return in a one-line field saves; its Country menu (the 261 regions) scrolls inside the window | The session |
| 2 November 2026 | The account menu is drawn by the page, as the window's other menus, with Apple's badge and the submenu's figures; a click on the disc while it is open closes it | The session |
| 2 November 2026 | About shows the Mac's app icon, and Copy version info writes the web's own facts in the Mac's three lines: the version without "web-" or "web-next-", the track ("next" at `/app-next`, else "stable") and the system in the Mac's words ("darwin", "win32", "linux"). It sits over the window and the computer's dialogs, under the computer's pills | The session |
| 2 November 2026 | The call's banner sits over everything in the window, About and an app's consent included, as the Mac's banner is a window of its own; the consent sits over the computer's dialogs and pills | The session |
| 2 November 2026 | Every tab opened blank on a click (an app's sign-in, the billing pages, the access cover's and the access notice's pages, Slack's and GitHub's linking page) has the copy of the window's tab storage it starts with emptied, the sign-in's pair with it, and no `opener`, before it goes anywhere (`openBlankTab`) | The session |
| 2 November 2026 | `?api=` in the page's address is followed on a page served from this computer (a developer's, the checks' stand-ins) and elsewhere only to Simeon Labs' own servers over https, so a link can't send a person's window to another server; the return page follows it only on this computer | The session |
| 2 November 2026 | Delete Account is left out of the account's page, as on the Mac (the iPhone's alone, by Apple's rule for apps that make accounts) | The session |
| 2 November 2026 | The app's tests stay without a page library (no new dependency): the pages' clicks and typing are checked in Chromium by the step's scripts, their state by the tests | The session |
| 2 November 2026 | The Windows app lives in `windows/`, beside `mac/` and `ios/`, with its own npm lockfile (as `runner/`), so Electron stays out of the web's installs (Vercel, CI). Named in CLAUDE.md's table | The session |
| 2 November 2026 | Its code is written fresh by Simeon Labs in TypeScript, from the Mac's Swift and the core, as the web app is. Nothing is taken from the retired Electron app's `desktop/source` (`desktop/NOTICE.md`); its contracts (routes, link forms, port 8787) are read as facts only | The session |
| 2 November 2026 | It loads the committed web build itself (`clients/apps/web/public/app-next`), copied into the app when it is packaged and served at `app://simeon/app-next/` (a standard, secure scheme: a real origin); anything else answers 404. No second build: the one `pnpm test` checks is the one Windows ships | The session |
| 2 November 2026 | The server is `https://api.simeonlabs.com`, told to the page by the app; `--api=` or `SIMEON_API`, the Mac's two ways, are followed only to this computer or to Simeon Labs' own servers over https (`windows/src/main/facts.ts`) | The session |
| 2 November 2026 | The server lets `app://simeon` call the API with the window's headers, never a cookie: a rule of its own (`DESKTOP_APP_ORIGINS`, `server/simeon/app.py`), not a Render setting | The session |
| 2 November 2026 | Electron 44.10.1 (Chromium 152), electron-builder 26.18.0 and electron-updater 6.8.11, exact versions in the lockfile | The session |
| 2 November 2026 | The installer is electron-builder's NSIS, for the person only (no administrator), in `%LOCALAPPDATA%\Programs\Simeon`, with Start menu and desktop shortcuts; the AppUserModelID is the Mac's bundle id, `com.simeonlabs.simeon`. x64 first, arm64 later | The session |
| 2 November 2026 | Updates are electron-updater's, from a feed through the server, as the Mac's appcast: its `latest.yml`, beside the versions' folders, names `<version>/Simeon-Setup-<version>.exe`, and the server 302s it (`/desktop/download/windows/latest.yml`), the installers and the blockmaps to the bucket's `releases/win32-x64/`; one range a request | The session |
| 2 November 2026 | `simeon://` is the Windows app's scheme too, so the server changes nothing (`back: "simeon"` everywhere) | The session |
| 2 November 2026 | The app names itself `windows-<version>+<build>`. The server knows a Windows app user (`has_windows_app`) beside a Mac app user and apart, so each platform's browser is sent back to its own app after a checkout, and a Mac app user on a PC still gets the download | The session |
| 2 November 2026 | Chrome's cookies and the security-key signer: nothing to port, as neither is built on the Mac | The session |
| 2 November 2026 | The website's Download for Windows waits for the first published release: a button with no file behind it would do nothing | The session |
| 2 November 2026 | The sign-in runs in the page, as the web's other calls: `fetch` from `app://simeon`, the browser opened by the app, the pair in the app's sealed values (`safeStorage`). Nothing of it in the main process | The session |
| 2 November 2026 | The Windows app keeps the agents and chats on the PC, as the Mac (`SavedChats`), so a launch shows them at once: plain JSON in `%LOCALAPPDATA%\Simeon\saved-chats`, not the roaming `%APPDATA%`, which a company's roaming profile copies at every sign-in. The web's decision of 1 November stays for the web | The session |
| 2 November 2026 | A page can't read a file at once: the list, the layout and the catalogue are read as a sign-in starts, a chat as it opens or is previewed, each kept in memory after. The window going behind is the page's `blur` or its hiding: what changed is kept then; quitting keeps it and waits for the files | The session |
| 2 November 2026 | A report says "Windows", the version as "0.1.0 (7)", the PC's maker and model from Windows' registry, and Windows by its build ("Windows 11 (10.0.26100)"); About's Copy version info says "OS: win32", as the Mac's "darwin" | The session |
| 2 November 2026 | With no language chosen, the page starts in Windows' own (`app.getPreferredSystemLanguages()`), not Chromium's | The session |
| 2 November 2026 | On the sign-in screen Return is Continue to sign in (the Mac's default button) and Escape is Cancel only while it waits; the spinner is the Mac's eight spokes; a long line under the buttons goes past the block, the buttons keeping their 40 | The session |
| 2 November 2026 | Enter on the button the keys are on presses that one (Windows' way: Tab to Sign up, Enter signs up); Return with no button focused is still Continue to sign in | The session, after the review (N2) |
| 2 November 2026 | Relaunch starts the app without the `simeon:` links of this one's command line (the Mac's relaunch carries no link), so a pack or a sign-in's code Windows started the app with is not handed over again | The session, after the review (S1) |
| 2 November 2026 | A delete or a rename of the kept chats is tried again while Windows holds a file a moment (Defender, the indexer, a backup), five times; and with no sign-in kept at launch, any copy left is forgotten, so none outlives its sign-in (the Mac relies on sign-out alone) | The session, after the review (S2) |
| 2 November 2026 | The page's reads of the kept copy wait for its own writes and forgets before them (the Mac's one queue) | The session, after the review (N1) |
| 2 November 2026 | In Windows' contrast themes the logo and the button's mark keep the theme's own text colours, and the logo shows at once | The session, after the review (N8) |
| 2 November 2026 | The logs are one line a line; `voice-call.log` past 5 MB at a launch keeps its newest 1 MB (the Mac never trims it; on Windows the data folder roams), its echo to stderr cut to 16 KB | The session, after the review (N6) |
| 2 November 2026 | The call's own window never signs in nor keeps the chats. A Reload keeps the chats on the PC: only a sign-out, an ended sign-in or another account's copy forgets them. The sign-in screen is its own layer, under the Deep Links dialog | The session |
| 2 November 2026 | The page decides what is told and in which words (the core's code, as the web app holds the store and the catalogues); the main process shows it with Windows' parts and keeps no account state | The session |
| 2 November 2026 | The Mac's menu keys are the page's own, not an Electron `Menu`: the computer's screen takes every key while it holds them, as on the Mac, and the window has no menu bar to draw a menu in. The cost: a page that hangs takes none (Alt-F4 still hides the window, the tray still quits) | The session |
| 2 November 2026 | The Mac's app menu items without keys are in the tray's menu (Windows has no app menu bar): Call <name>, About Simeon, Check for Updates…, each only signed in. New Agent, not New chat (`Features.groupChats` is off) | The session |
| 2 November 2026 | Control-Q quits, as the Mac's ⌘Q (Ctrl+Q in the tray's menu); Alt-F4, Windows' own, hides the window as its × does | The session |
| 2 November 2026 | The window's focus is the main process's (the BrowserWindow's focus and blur), as the Mac reads the window's key state, not `document.hasFocus()` | The session |
| 2 November 2026 | The taskbar's number is the overlay's, in full (never "99+"); a hidden window has no taskbar button, so the tray's mark takes the Dock's red dot while anything is unread. No taskbar flash: the Mac doesn't bounce its Dock icon. The overlay's description is the number alone: no catalogue sentence fits | The session |
| 2 November 2026 | The call's window isn't animated as it grows (Electron animates `setBounds` on macOS only); it is clear, so only its card shows the change | The session |
| 2 November 2026 | Reload (Control-R) keeps a call that is on and what was typed, as the Mac's ⌘R (Store.swift's `detach(endingCall:)`) | The session, after the review (S1, S2) |
| 2 November 2026 | The Mac's zoom keys: Control-= or Control-+, Control--, Control-0, by 0.1 from 50 % to 300 %, not kept, taken before anything in the window. Chromium zooms every window of the app alike, so the call's page draws itself back at 100 % | The session, after the review (S3) |
| 2 November 2026 | Windows' own close on the call's window (Alt-F4) asks the call, as the Mac's `performClose`: a call that is on ends, an ended one is dismissed | The session, after the review (S4) |
| 2 November 2026 | The call's window's page is held to its own five calls (`bridge.ts`'s `limit`): the kept values read empty there, and any other call is refused | The session, after the review (S5) |
| 2 November 2026 | Where a screen says it has touch, the call's window takes the card's shape, so taps reach the card and all else goes through; with a mouse alone it follows the pointer and keeps the Mac's shadow | The session, after the review (S7) |
| 2 November 2026 | The main process holds the `simeon://` links until the main window's page asks for them (`takeLinks`), then sends each as it comes; a page that reloads gets what came meanwhile | The session |
| 2 November 2026 | The Deep Links dialog is drawn in a root of its own, over everything the window draws but the call's banner, so it shows signed out too, as the Mac's | The session |
| 2 November 2026 | A plugin's and a pack's link wait until the signed-in window is drawn: signed in, past the first run and past the access cover | The session |
| 2 November 2026 | A connector's sign-in opens in the default browser and is asked every 2 s, 150 times, whatever comes back to the loopback (the browser's tab can't be watched); `simeon://connected` and `simeon://mcp-oauth` are the Mac's sheet closing on them. Nothing it added is taken back unless the server's page says it failed or the maker refused | The session |
| 2 November 2026 | A `simeon://mcp-oauth` answer is finished only for a sign-in this app named to the server, signed in, within 10 minutes, once; any other is dropped without a word, and a refusal says "<app> didn't connect. Try again.", never the link's own words | The session, after the review (S2) |
| 2 November 2026 | The loopback listens on 127.0.0.1 and ::1 (Edge and Chrome try ::1 first for `localhost`), port 8787: either taken is "busy", ::1 skipped only on a PC with no IPv6. It is let go when the sign-in ends or is replaced, when its page reloads or goes, on sign-out, at quit, or after 10 minutes at most | The session, after the review (S1, S3) |
| 2 November 2026 | Stripe's pages open in a window of the app's own, modal over the main one as the Mac's sheet: no preload and no permission, its own storage kept between openings (`persist:simeon-billing`), https and the API only, its title the page's site. It closes on any `simeon:` link, which never reaches Windows; the default browser when it can't be made (no charge then) | The session |
| 2 November 2026 | A new window's page from Stripe's window goes to the default browser only when it is https and the person pressed something there within the last second, one per press | The session, after the review (S4) |
| 2 November 2026 | Windows Hello through Windows PowerShell 5.1's `UserConsentVerifier`, the reason in the environment, never in the script or its command line; one ask at a time, three minutes at most. Verified alone confirms; the window's alert asks only when Hello said before asking that it isn't there, or PowerShell couldn't start; anything else is cancelled | The session, after the review (B2) |
| 2 November 2026 | A checkout's Allow hands Link the approval (`confirmed`, no method, as the Mac's passcode) only after Windows Hello; after the window's alert it hands none, as on the web, and Link asks in its app. The Mac's "no lock at all: the tap counts" is not taken: a PC without Hello may still have a password (Open questions) | The session |
| 2 November 2026 | The clipboard is Electron's, through the app: written whether or not the window is in front, read for the main window's page only. With no change count, the same words copied again count as no change | The session |
| 2 November 2026 | 1Password's tool is `op.exe` from folders no other account can write to: both Program Files' `1Password CLI`, then the person's winget and Scoop folders, then PATH's absolute folders; never ProgramData or the current folder. One run at a time, only an account it just listed connected; How to set it up shows for "no accounts" in every language | The session, after the review (B1) |
| 2 November 2026 | Downloads keep Electron's own save dialog (Windows' Save As), untouched. The pages' `window.open` with a known address (the shops' pages, search's links, Legal) stay as they are: the frame sends them to the default browser | The session |
| 2 November 2026 | The page's menus stay its own in the Windows app (a routine's, Connectors' categories, the account menu): Electron's `Menu.popup` has none of their logos, submenus, badges or figure rows | The session |
| 2 November 2026 | Settings › Updates is the Mac's page, its group "Simeon": the Mac's says "Simeon for Mac", and neither catalogue has "Simeon for Windows". No sentence of it names the Mac | The session |
| 2 November 2026 | Only a signed release updates itself (packaged, on Windows, with a release's build number and its signers, both written by `release.mjs`); an unsigned build, released or not, never asks, as the Mac's build without Sparkle's key. A stand-in feed on this computer (`SIMEON_UPDATES_FEED`) for the checks | The session, after the review (S1) |
| 2 November 2026 | Both switches on at first: the daily check downloads a release, and it is installed as Simeon quits, or at the next launch, before the window, when Windows ended Simeon with no quit (shutdown, sign-out). The Mac starts with Sparkle's (downloads off) because Sparkle shows a window of its own | The session, after the review (S6) |
| 2 November 2026 | A look (the page opening, Check Now) downloads nothing; only the daily check downloads by itself, a day after the last answer (the first 10 s after launch, a failed one an hour later); Update Now always does. A failed check says nothing, and a release found shows no window or notification: the dot beside Updates and the page say it | The session |
| 2 November 2026 | "Last checked 0 seconds ago." for a moment past (Foundation's formatter says "in 0 seconds" there) | The session |
| 2 November 2026 | An installer runs only when Windows' own check (`scripts/lib/signature.mjs`: Windows' PowerShell, no shell) says it is validly signed by one of the signers, each a certificate's whole subject, every part compared; refused on any error. Asked as the download ends and again just before it runs | The session, after the review (S2, S3) |
| 2 November 2026 | A release is published signed only, from Windows only, its installer checked as the installed app checks it. The signers are written in `windows/scripts/lib/release.mjs`, empty until the certificate exists, with the rename's rule beside them; the signer is the legal company (CLAUDE.md; `lib/release.mjs`'s `company`) | The session, after the review (S3, S4) |
| 2 November 2026 | The workflow (`.github/workflows/windows.yml`, by hand) builds a release and never publishes; a signed one only from main, through the `windows-release` environment, which alone holds the certificate | The session, after the review (S10) |
| 2 November 2026 | The icon is the Mac's tile, its own pictures at the sizes it has, 24 and 48 averaged from its 256; made by a script with nothing but Node, its output committed | The session |
| 2 November 2026 | Check for Updates… is 7c's tray item and its event (`checkForUpdates`), named once; offered only in a build that updates itself (`updatesItself`: a signed release) and signed in; Settings › Updates opens and looks. Signed out the tray has Open Simeon and Quit Simeon only; the daily check is the main process's anyway | The session |
| 2 November 2026 | Relaunch and Update Now are one path: each asks the app to quit and open again, and the installer starts only after the page's and every part's work. A release waiting is installed as Simeon quits; then the installer opens Simeon (`--force-run`) and the app doesn't, so the two never race; else the app opens a new instance itself, with no link | The session |
| 2 November 2026 | A report reads `updates.log` too (its last 256 KB, after the page's two logs); the page can't write it | The session |
| 2 November 2026 | Windows' caption buttons follow the theme: the page tells the app its look at start, at each theme chosen and when the system turns light or dark (`src/desktop/windowLook.ts`) | The session |
| 2 November 2026 | The agent's hands: the loop is the page's, the stream the main process's. The page has the gateway, so it dials, waits while the computer rests and asks again, as the Mac's `run`; the main process reads the stream it is handed and runs every request. The address and headers are handed over per stream and kept in memory only; no second credential (the Mac's way: no daemon) | The session |
| 2 November 2026 | Commands run in PowerShell 7 (`pwsh.exe` in PATH's absolute folders or `%ProgramFiles%\PowerShell\7`), else Windows PowerShell 5.1 by its full path; not cmd, not Git Bash | The session |
| 2 November 2026 | The state carried from one command to the next is the folder, the environment, functions and aliases (not plain variables, as zsh carries only exports). The command and the state go in on the shell's input, never its command line, which other programs can read on Windows; nothing of it is written to disk | The session |
| 2 November 2026 | The state comes back after a marker made for each run, which no variable a command lists holds; the app takes the state after its last occurrence, at most 16 MiB, else it is output | The session, after the review (S3) |
| 2 November 2026 | Windows' places that hold keys are the Mac's list translated (`windows/src/main/hands/sensitivePaths.ts`), with `Vault` and `Crypto` beside `Credentials` and `Protect`, `_netrc`, `%APPDATA%\gcloud`, the registry's hives (`System32\config`) and `.docker` whole; refused whatever the setting, before anything runs, in the Mac's sentence saying "this PC" | The session |
| 2 November 2026 | Also refused: Arc's folder, Windows' cookie stores and, installed, the app's own folder (per user, so writable by any of the person's programs) | The session, after the review (S5, N6) |
| 2 November 2026 | Two checks the Mac doesn't make: a command whose folder (the one asked for, or where the shell is) is such a place is refused, as written and at its real path (links, junctions, short names); a file's real place is checked again | The session, after the review (S1) |
| 2 November 2026 | A command's words are read as Windows reads a path before they are matched (`\\?\`, this PC's own shares, short names, the old junctions, streams, `..`, Windows' variables, names relative to the folder it runs in). What no guard on a command's words can catch is said in the file's header: names built or code fetched while it runs, wildcards, links it makes, secrets reached through Windows' interfaces, not paths. The Mac's guard has the same limits | The session, after the review (S2) |
| 2 November 2026 | The setting, the commands allowed once and the log (`local-exec-daemon.log`, the Mac's name) are in the app's data folder, not `~\.simeon`: there is no Electron app to share with, and the folder is itself refused | The session |
| 2 November 2026 | The setting and the commands allowed once are signed (HMAC-SHA256, a key sealed by `safeStorage`, `local-tool-key.sealed`), read once when the app starts and then held; a file that doesn't verify reads as "Ask every time", no ceiling, no answers. It stops a plain edit of the files, not a program of the same person (Open questions) | The session, after the review |
| 2 November 2026 | The root is the Mac's: its four variables, else the home folder (so `%USERPROFILE%\terminals`, as the Mac's `~/terminals`) | The session |
| 2 November 2026 | Only the main window may drive the hands; the address only Simeon Labs' servers over https, the app's own server, or this computer (only when the app's server is on it); only the gateway's three headers. The stream and the answers go through Electron's `net.fetch`, with Windows' proxy settings and certificates | The session (this computer: after the review, N2) |
| 2 November 2026 | A reload ends the stream and leaves commands running, as the Mac's Reload keeps its hands; signing out and quitting stop everything, and signing out forgets the setting and the commands allowed once | The session (the commands allowed once: after the review, N7) |
| 2 November 2026 | A stop is `taskkill /T /F` at once (a console program with no window can't be asked to close), then `child.kill()` a second later if the shell is still there, and its end told five seconds after whatever happens; what a command left holding its output is found by its parent's number, only among processes made before the shell ended | The session (the fallback and the sweep's limit: after the review, S4, N3) |
| 2 November 2026 | Files are read and written without holding the main process (`fs/promises`), at the real path that was checked; output reaches the agent with `\n` line ends, as zsh's | The session, after the review (S6, N5, N9) |
| 2 November 2026 | Pictures read for the agent are made smaller by `nativeImage` (PNG, JPEG; a WebP or GIF made smaller comes back PNG; one it can't read is given as it is) | The session |
| 2 November 2026 | An Allow once the app didn't write down: the card says the answer didn't go through, rather than telling the computer (the Mac tells it anyway). "Use hardware security keys" is left out: nothing answers it on a PC, or on the Mac. No word the catalogues lack | The session |
| 2 November 2026 | Two of the Mac's flaws are not followed: a failed read of the team's settings keeps the ceiling this PC last had (the Mac's lifts a team's "Never allow" at every offline launch); after taking the computer's Always or Never, the computer is told what holds when the team's ceiling lowers it | The session, after the review |
| 2 November 2026 | The engine hears the PC's system and shell in the hello (`platform`, `shell`, `shellVersion`, `osVersion`) and tells the agent in a section of its brief of its own ("The user's computer"), frozen as the channels and routines are; CopyToBox and CopyFromBox take a Windows path's own name and `Downloads\`. A Mac's hello says none, and nothing changes for it | The session, after the review (the engine, `ebc47f773`) |
| 3 November 2026 | The web app is offered to no one. It is only the means of building the Windows app, whose page it is, so it never moves to `/app` and replaces nothing there. The Windows app is the product | The founder: "know that the web app will be available to no one btw. the whole point of the web app is to build the window app" |
| 3 November 2026 | The old web app at `/app` is not touched by this. The new one stays at `/app-next` on the website, where the founder can look at it in a browser, until the founder says otherwise (Open questions). The plan's checks (`README.md`) still hold: they measure the Windows app's page | The session |
| 3 November 2026 | The Windows app is released through the Microsoft Store: a company account is free (since May 2026) and Microsoft signs the Store's package, so no certificate is bought. Microsoft's Artifact Signing (about $10 a month) takes only companies with three years of tax history, and the legal company (CLAUDE.md) is under one | The founder: "we'll use the microsoft store, it's free. plus [the legal company] is not even 1" |
| 3 November 2026 | The Store's package (MSIX, electron-builder's `appx` target) is built on Windows only: measured here, electron-builder 26.18.0 on Linux stops with "AppX is supported only on Windows 10". So it is built on GitHub's Windows machines (`.github/workflows/windows.yml`, once Actions runs) or on the Windows PC that tests it. The Store's app updates through the Store: its build leaves the app's own updater (step 7e) off | The session |
| 5 November 2026 | The Help Center is the website's docs (`https://www.simeonlabs.com/docs`): the Mac's "Simeon Help Center" row and the iPhone's "Help Center" open them. The web app's row can come back pointing there (done 6 November 2026, below) | The founder |
| 6 November 2026 | The Windows app reads pictures from other sites in its main process (an airline's logo, a saved login's touch icon) and keeps them on the PC a week, as the Mac's caches. Only `https:` on port 443, public hosts only, the host's addresses looked up before each request and each redirect (stricter than the Mac's, which checks the name only), 2 MB a picture, 512 KB a page's head, eight seconds a request; a picture must be one by its first bytes | The session |
| 6 November 2026 | The window doesn't grow for a flight's details in the Windows app, as on the Mac (`PaneState.toggleFlight` never grows it); it grows for the agent's pane and for ⌘B beside it | The session, from the Mac's code |
| 6 November 2026 | "…on your PC…" for the call's two lines is added to the core's String Catalog by hand (`extractionState: manual`), since only the Windows app says it | The session |
| 6 November 2026 | The Store's package takes its identity from `windows/store.json`, committed: the identity name, publisher and publisher name Partner Center gives are not secret (Partner Center shows them, every package carries them). `node scripts/store.mjs` refuses to build while one is empty or not in Partner Center's form, and says which field to copy from where | The session; the founder said "yup" to preparing the Store's build |
| 6 November 2026 | In a Store install (`process.windowsStore`) the app's own updater is off (`releasedBuild`), Settings › Updates is left out (as on the web; `DesktopFacts.store`), and the app doesn't register `simeon://` itself: the package's manifest declares it | The session |
| 6 November 2026 | The Store's manifest declares English (en-US) only, so the first submission has one listing to write; each language added later comes with its own listing. Its capabilities: the internet, the microphone (calls and dictation) and full trust (as the installer's app). Its tiles show the icon in their middle on a clear ground, without the name; its description is "Simeon" (package.json's is written for us) | The session |
| 7 November 2026 | The Windows app draws no blur (`backdrop-filter`) anywhere: Chrome drew every word of the chat in grey anti-aliasing instead of Windows' ClearType while any blurred glass was in the window (measured, below). Its glass is solid (white, `#1e1e1e` on dark), the chat's head fades the messages out without blurring them, the sidebar is a solid grey (`#f5f5f5`). The web keeps the Mac's glass | The founder: "how light our design seem"; the cause measured by the session |
| 7 November 2026 | In the Windows app the chat keeps to a column 960 wide, centred (its messages and the message field), as the other Windows chat app: in a wide window ours ran from the sidebar to the window's edge. A bubble's own limit stays the Mac's (640; the other app's 560). The Mac has no such column | The founder asked for the same limit as the other app's |
| 7 November 2026 | In the Windows app the sidebar's words are a size up: names 15, previews 14, times 13 at the previews' grey (not the lighter one), title tags 12.5, section names 13, as measured in the other app (its names 15, previews 14, sections 13); its pictures stay 46 | The founder: the sidebar is "either too small, or too light"; measured: as dark, a size smaller |
| 7 November 2026 | In the Windows app a message's words are 16 on 22 (the Mac's 14 on 20, 21 for the person's), as the other Windows chat app the founder compared: only the words grow, the gaps and a bubble's padding stay the Mac's | The founder, comparing the two apps side by side; the sizes measured by the session |
| 6 November 2026 | The web and Windows app's text is drawn with the system's own smoothing: no `-webkit-font-smoothing: antialiased` (`src/index.css`, `src/connected.css`). On a Mac that rule turns off macOS's text smoothing, so the words came out thinner and paler than the Mac app's, which SwiftUI draws with it on. It does nothing on Windows (ClearType either way) | The founder: "the mac app font is clearer web app/window seems cheap seems like its fading" |

## For Windows

What each web choice so far becomes in the Windows app (Electron around
these files, step 7). Electron draws with Chromium, so the checks run in
Chromium in each step stand for Windows' engine too; what they can't stand
for is listed here. Added to with every step.

This list was step 7's plan. Step 7 built most of it (the log of 2
November 2026, step 7, the Windows app): each item now says what was
built and where (files under `windows/` are the app's main process, the
rest the web app's), what was decided instead, or that it is not built
yet. Nothing of it has run on a Windows PC (Open questions).

- **Loading the app.** The web app is built for `/app-next/` and finds the
  server from its own address (`resolveApiBase`). Loaded from disk, it needs
  the server's address given (`https://api.simeonlabs.com`) and a base that
  works from disk (Electron's own `app://` protocol, or relative paths), and
  the security policy the website gives it now set by Electron. Step 7
  (7a): the committed build served at `app://simeon/app-next/`
  (`windows/src/main/appProtocol.ts`), the server from the app
  (`facts.ts`), the website's policy set by the app (`policy.ts`).
- **Signing in and out.** The web trades the website's cookie
  (`/auth/web-session`) and sends the person to the website's `/login`; Sign
  Out ends the website's cookie (`/v1/auth/logout`). Windows has no website
  cookie: the Mac's sign-in screen and its way (the browser, then
  `/auth/poll`), and Sign Out drops the pair and shows that screen. The pair
  kept in Windows' credential store (`safeStorage`), not the tab's. Step 7:
  done (7b: `core/signIn.ts`, `window/SignInScreen.tsx`, `session.ts`; the
  pair sealed by 7a's `windows/src/main/kept.ts` in `%APPDATA%\Simeon\kept`).
- **Pages opened elsewhere.** Links in messages and file cards
  (`target="_blank"`), and the access cover's pages (`window.open`): in
  Electron, `setWindowOpenHandler` sends them to the default browser with
  the Mac's allowlist (http, https, mailto, obsidian, tel), and denies the
  rest. Stripe's card page from the cover can open in a child window that
  comes back on the app's own link, as the Mac's sheet does; then the
  Mac's charge after it (`billing/settle`) can be made. Step 7: done; the
  default browser through `setWindowOpenHandler` and `will-navigate` (7a,
  `windows/src/main/main.ts`, `policy.ts`), Stripe's pages in a window of
  the app's own, then `billing/settle` after a failed payment (7d,
  `window/outside.ts`, `windows/src/main/outside/billing.ts`).
- **Saving files.** The web hands a file to the browser as a download
  (`Files.tsx`). In Electron, `will-download` with Windows' save dialog,
  as the Mac's save panel. Step 7: decided otherwise: Electron's own Save
  As, untouched (7d), with no `will-download` of our own.
- **The microphone.** The browser asks the person; Electron asks Windows
  and lets the page have it through `setPermissionRequestHandler` (audio
  only, the app's own page only). The refused line's "system settings" is
  right on Windows (Settings, Privacy, Microphone). Step 7: done (7a,
  `policy.ts`'s `allowsPermission`).
- **Keys.** The web uses Control where the Mac uses ⌘ (picking rows,
  Control-B, Control-F) whenever it isn't on an Apple computer, so Windows
  has these already. Control-Tab, left out in a browser (it changes tabs),
  can come back in Electron, which has no tabs. Step 7: done (7c,
  `window/controlTab.ts`), with the Mac's menu keys and zoom keys
  (`desktop/surfaces.ts`).
- **Kept on the device.** The folds, the sidebar's width, the emoji and
  "@" picked lately are in the page's storage, which Electron keeps per
  app. Drafts and the chats are kept in memory only on the web (a shared
  computer); the Windows app can keep them on disk as the Mac does
  (`SavedChats`), decided at step 7. Step 7 (7b): the chats are kept on
  the PC (`core/savedChats.ts`, `windows/src/main/session/savedChats.ts`,
  `%LOCALAPPDATA%\Simeon\saved-chats`); drafts stay in the window's memory
  (kept across a Reload, 7c), not on disk as the Mac's.
- **The window.** The Mac's window is moved by its sidebar's head and the
  chat's top (`WindowDragArea`): in Electron, `-webkit-app-region: drag` on
  the same places, Windows' own buttons through `titleBarOverlay`. The
  narrowest window is 512 wide, the Mac's. Step 7: done (7a,
  `window/desktop.css`, `windows/src/main/window.ts`: 512 × 520 at the
  least); the buttons follow the theme (the merge, `desktop/windowLook.ts`).
- **The cards (step 3).** Drawn with the page's own parts only (no
  browser dialogs, no pop-ups), so they are the same in Electron. A card's
  answer field: Return sends, Shift-Return starts a new line, as the
  message field; a draft's words take Return as a new line, as the Mac's.
  A long command in an approval scrolls sideways in its box with the
  pointer or the trackpad; with a mouse wheel on Windows that is
  Shift-wheel, Windows' own way.
- **The cards that need the person's OK (3b, 3d).** The window's alert in
  place of Touch ID becomes Windows Hello (`UserConsentVerifier` from
  Electron's main process): cancelled, nothing is sent; confirmed, a
  checkout's Allow carries the approval (`answerPurchase(…, confirmed)`,
  no method, as the Mac's passcode, since Hello doesn't say which it used)
  and Link asks no more. 1Password's Connect runs 1Password's
  command-line tool from the main process, as the Mac runs it (1Password's
  Windows app has the same integration, with Windows Hello). Electron keeps
  no passwords, so no "save password" offer on the masked fields. Step 7:
  done (7d: `window/presence.ts`, `windows/src/main/outside/hello.ts`,
  `outside/onePassword.ts`); the window's alert only where Hello isn't
  there, and then a checkout carries no approval (Open questions).
- **A flight's details (3d).** Their top bar moves the window on the Mac:
  `-webkit-app-region: drag` there, × not. Electron can grow the window
  for them, as the Mac does. The menus' lists are Chromium's on Windows.
  The airline logos can be fetched by the main process (no CORS) and kept
  on disk, as the Mac keeps them. Chromium's autofill offers the person's
  saved name, email and phone. Step 7: the pane's top bar moves the window
  (7a, `window/desktop.css`). 6 November 2026: the logos read by the main process and kept on the PC a week
  (`remotePicture`, `windows/src/main/native/pictures.ts`), so each is cut
  and lightened; the window does not grow for a flight's details, as on
  the Mac (`toggleFlight` never grows it).
- **Pictures from other sites.** The shops' pictures and the airline logos
  need `img-src https:` in the policy Electron sets. Step 7: done (7a,
  `policy.ts`).
- **Step 4's keys.** Off a Mac: Control-K and Control-Shift-F (search),
  Control-1 to 9 (search's rows), Control-N (New Agent), Control-Shift-I
  and Control-Alt-B (the pane). A browser keeps some for itself:
  Control-N (a new window), Control-1 to 9 (its tabs; not checked in a
  browser with tabs) and, on Windows, Control-Shift-I (its developer
  tools). The Windows app has no tabs and can have them all; the compose
  button and the chat's picture open the same meanwhile. Step 7: the app
  has no tabs and draws no menu bar (`Menu.setApplicationMenu(null)`, 7a),
  so nothing takes them before the page; not checked key by key.
- **The agent's pane (4a).** It takes in a flight's details, so the 3d
  note holds for it: Electron can grow the window for it, as the Mac does.
  The routine editor's top bar and the org chart's head move the window
  on the Mac (`WindowDragArea`): `-webkit-app-region: drag` there, their
  buttons not. Step 7: the drag places done (7a, `window/desktop.css`);
  the window growing for the pane done 6 November 2026 (`growWindow`,
  `shrinkWindow`: `window/windowModel.ts`, `windows/src/main/growth.ts`;
  ⌘B beside the pane makes room too).
- **A picture of one's own (4b).** Electron can open Windows' own file
  dialog, with the Mac's title ("Choose an avatar image", on the web only
  the hidden chooser's name for a screen reader). No beep on a refused
  Create on the web; Electron's `shell.beep()` could, as the Mac's. Step 7:
  6 November 2026, Windows' own dialog with the Mac's title
  (`chooseFiles`), and Windows' alert sound where the Mac beeps (`beep`: a
  refused Create, a traveller's problem, a login's).
- **Sound from other sites (4b).** The voices' samples are ElevenLabs' own
  links, whose host varies: the policy Electron sets needs
  `media-src … https:`, as the website's now has, beside `img-src https:`.
  Step 7: done (7a, `policy.ts`).
- **The routines' menus (4c).** Drawn by the page, so the same in
  Electron; the 96 times scroll in a menu as tall as the window. Electron's
  own menus (`Menu.popup`) could take them, decided at step 7. Step 7:
  decided: they stay the page's own (Decisions).
- **Search and Channels (4d).** A link found opens in the default browser
  through `setWindowOpenHandler`, as the chat's links. Channels is read
  again when the window comes forward (`focus`: in Electron, the
  BrowserWindow taking the keys). The token's field: Electron keeps no
  passwords, so nothing is offered. Control-F waits under search, as ⌘F on
  the Mac. Step 7: the links done (7a, `windows/src/main/main.ts`).
- **The org chart (4e).** A precision touchpad's pinch reaches Chromium as
  Control-wheel, so it zooms the chart as on a Mac; Control with a mouse
  wheel zooms five times as fast as a scroll. Electron's own page zoom
  never happens over the canvas (the wheel is taken there).
- **Starter packs (4e).** The link arrives through the `simeon://`
  handler: register it (`app.setAsDefaultProtocolClient`), read it from
  `second-instance` (and `open-url`), check it with
  `packLinked(url, 'simeon')`, the same code the web reads, hold it until
  signed in and past the first run, then `store.askPack(id)`; the same
  link within 2 s dropped, as on the Mac. The website's Add to Simeon
  could then offer `simeon://` on Windows too (Open questions). Step 7:
  done (7d, `desktop/links.ts`, `windows/src/main/outside/links.ts`), held
  until the signed-in window is drawn; the website waits for the first
  release (Open questions).
- **The computer's screen (5b).** The policy Electron sets needs the API's
  `wss:` in `connect-src`, as the website's now has. Electron's
  `clipboard` reads and writes without asking, so the Mac's way can come
  back: this computer's words sent on a click in the screen, the window
  coming forward and the screen coming up, by the clipboard's own change
  count; the computer's copy written at once, even while the window is
  behind. The full view's bar takes `-webkit-app-region: drag`, Exit not;
  with `titleBarOverlay`, Exit moves left of Windows' own buttons. The
  Windows key reaches the computer as Super. Step 7: the policy and the
  bar done (7a); the clipboard the Mac's way (7d, `window/clipboard.ts`),
  by the words themselves (Electron has no change count), sent as the
  screen comes up only while the window has the focus. The Windows key:
  not checked.
- **The computer's states (5c).** The dialogs take every key but Control
  combinations and the F-keys; Alt-F4 stays Windows'. The Windows app
  sets Disk Saver to work by itself on low disk, as the Mac. The move's
  stream is a fetch with a body, which Electron's Chromium sends as the
  browser does. The access notice's page opens in the default browser.
  Step 7: the access notice's pages through 7d's `window/outside.ts`
  (Stripe's in the app's own window). Disk Saver set to work by the app itself, done 6 November 2026
  (`startsDiskSaver`, `src/desktop/session.ts`).
- **Calls (5d).** The call's banner can have its own always-on-top window,
  as the Mac's and as the Electron banner had: frameless, at the top right
  of the work area under the pointer, shown without taking the keys, on
  every desktop; the in-window banner hidden then. The policy needs
  `connect-src https://*.elevenlabs.io wss://*.elevenlabs.io` and
  `script-src 'self' blob:` (the kit's worklet); the microphone through
  `setPermissionRequestHandler`, Windows' own microphone setting with it.
  `SIMEON_VOICE_CALLS` through the preload, `voice-call.log` in the app's
  data folder, `before-quit` ending a call and waiting for its record, and
  "Call <name>" in the app's menu. The exchange's head and a call's head
  move the window on the Mac: `-webkit-app-region: drag` there. Step 7:
  the banner's own window (7c, `desktop/CallWindow.tsx`,
  `windows/src/main/parts/surfaces.ts`), on the virtual desktop it opened
  on (Electron can't pin a window to every desktop on Windows), the
  in-window banner not drawn; Call <name> in the tray's menu (Windows has
  no app menu) and a call hung up before quitting (7c); the policy, the
  microphone and `SIMEON_VOICE_CALLS` (7a); `voice-call.log` in the app's
  data folder (7b); the exchange's head moves the window (7a,
  `window/desktop.css`), the call's lines' head too (6 November 2026).
- **The frame and the theme (6a).** Settings, Connectors, About and the
  sheets are drawn in the page, so the same in Electron. The theme chosen
  and the language are in the page's storage (`simeon.theme`,
  `simeon.language`), which Electron keeps per app; the theme's fade is
  Chromium's own. Off a Mac: Control-, (Settings), Control-Shift-M and
  Control-Shift-W (Connectors), Control-F in Connectors, Control-Return (a
  report). A browser keeps some of them for itself (Control-Shift-W closes
  its window, Control-Shift-M is Chrome's profile menu, ⌘, its settings on
  a Mac; not checked in a browser); the Windows app has them all. Step 7:
  as step 4's keys above.
- **Connecting an app (6b).** The sign-in page goes to the default browser
  (`shell.openExternal`), not a child window: Google and others refuse
  their sign-in inside an embedded web view ("disallowed_useragent"). The
  connector's browser is a seam (`ConnectorBrowser`): Electron's opens the
  page outside and has no tab to watch, so it is the Mac's browser fallback
  (asked every 2 s while it may finish, never taken back), and the tab
  rules of the web don't apply. Register `simeon://`
  (`app.setAsDefaultProtocolClient`, `second-instance`); name a sign-in
  that comes back through the server first (`POST
  /desktop/api/mcp-oauth/return` with `back: simeon`, which the server
  already takes), so it comes back on `simeon://mcp-oauth?state=…&code=…`
  and the app finishes it on its computer (`completeMcpOAuth`); open
  `/desktop/apps/start` with `back=simeon` (`Connecting.returning`, left
  out on the web), so the server's last page sends the browser back to the
  app. A scheme of Windows' own would need `back` widened on the server
  (`mcp_oauth_return.py`'s `AppScheme`, `billing/back`'s check). The makers
  that take only the loopback: the main process listens on `127.0.0.1:8787`
  while one's sign-in is open (the Electron Mac app's
  `mcp-oauth-loopback.ts`, the core's `LoopbackCatcher`: this state
  answered once with a 302 to `simeon://connected`, 404 otherwise), so
  Canva, Dropbox and the others connect on Windows; Windows' firewall
  doesn't ask for a loopback-only listener. The return page
  (`connected.html`) is then the web's alone. Step 7: done, with no server
  change (7d): the default browser (`window/outside.ts`), `back: simeon`
  on `mcp-oauth/return` and the start link, `simeon://mcp-oauth` finished
  only for a sign-in the app named (`desktop/links.ts`), the loopback on
  127.0.0.1 and ::1 (`windows/src/main/outside/loopback.ts`).
- **Connectors (6c, 6d).** The window coming forward is the BrowserWindow's
  `focus`, and a minimised window is the hidden page (no reads every 15 s,
  one when it shows again), as in a browser. The categories' menu could
  become Electron's own (`Menu.popup`, the chosen item over the button, as
  the Mac's), decided at step 7 with the routines' menus. The logos are
  data addresses: the policy Electron sets needs `img-src data:`, as the
  website's has. Information's links and View Source go to the default
  browser through `setWindowOpenHandler`, http and https only. The rename
  alert, the folds and the fields are the page's own; the masked setup
  field gets no save-password offer (Electron keeps none); `field-sizing:
  content` is in Electron's Chromium. The examples' picture and the logos
  are bundled: loaded from disk with `SIMEON_APP_BASE=./`, they resolve
  beside the page. Step 7: the categories' menu stays the page's own
  (Decisions); the policy has `img-src data:` (7a); the build is served at
  the website's own base, `app://simeon/app-next/`, so the bundled files
  resolve as on the website, with no `SIMEON_APP_BASE` (7a).
- **Settings (6e).** Relaunch can be `app.relaunch()` and quit, as the
  Mac's, or the window loaded again; with no language chosen, the Windows
  app may start from Windows' own (`app.getPreferredSystemLanguages()`).
  The time zones are Chromium's list, Windows' own zone names already
  turned into the database's. "Your Computer" comes back with the agent's
  hands on the PC: Execution on Local Computer and the team's ceiling, the
  commands allowed once, the hardware security keys with a Windows WebAuthn
  proxy. A report's facts: platform "Windows", `app.getVersion()`, the
  Windows version from `os.release()` (the main process), the PC's model if
  wanted; `voice-call.log` and `computer-stream.log` from the app's data
  folder, as the Mac reads them. Screenshots from Windows' own file dialog
  (`dialog.showOpenDialog`, titled with the Mac's "Choose screenshots to
  add") or a drop from Explorer; `nativeImage` could shrink them as ImageIO
  does. Legal's pages in the default browser; Electron's `clipboard` copies
  the e-mail without asking. A rule's Edit and Delete are always shown on a
  Windows touch screen or a 2-in-1 in tablet mode (`hover: none`). Step 7:
  Relaunch is the app's own quit and a new instance without the launch's
  link, one path with Update Now's (7b and the merge,
  `windows/src/main/main.ts`); Windows' own languages, a report's facts
  and its logs, `updates.log` too (7b, `desktop/facts.ts`,
  `windows/src/main/session/`); Legal's pages in the default browser (7a);
  the clipboard through the app's (7d). "Your Computer" is back (7f,
  `window/SettingsYourComputer.tsx`): Execution on Local Computer under
  the team's ceiling, Commands Allowed Once with Forget; the security keys
  left out: nothing to port (Decisions). 6 November 2026: the screenshots' dialog with the Mac's words
  (`chooseFiles`); the shrinking stays the page's (a canvas makes each a
  JPEG of at most 1,600, as the Mac's ImageIO), so `nativeImage` isn't
  needed.
- **Usage and billing (6f).** Stripe's pages in a child window that comes
  back on the app's own link, as the Mac's sheet (`back: "simeon"` once the
  scheme is registered on Windows, `/desktop/billing/back`); then the
  charge after Stripe's card page (`billing/settle`) after a failed
  payment, and the access and the usage read again as it closes. The plans
  page in the default browser. If the child window can't open, a sentence
  in Windows' own words is needed (Open questions). Step 7: done (7d,
  `window/outside.ts`, `windows/src/main/outside/billing.ts`, the store's
  `settleAfterCardPage`); a window that can't be made opens the page in
  the default browser (no charge then), so no new sentence is needed.
- **The Credentials Store (6f).** Showing a saved password asks Windows
  Hello (`UserConsentVerifier`) in place of the alert; cancelled, nothing
  is read. Electron keeps no passwords, so no manager offers or saves one;
  the masked text field is the same there (Chromium masks it). A login's
  icon: the main process can read the site's page for its touch icon (no
  CORS) and keep it on disk a week, as the Mac's `SiteIcons`. Step 7: Hello
  done (7d, `window/presence.ts`). The touch icon read by the main process and kept on the PC a week, done
  6 November 2026 (`siteIcon`, `native/pictures.ts`).
- **The account menu and About (6f).** Electron's `Menu.popup` could draw
  Windows' own menu, but it has no badge or figure rows, so the page's menu
  may stay; decided at step 7. About's facts from Electron
  (`app.getVersion()`, `process.platform`, "win32"), the same three lines;
  the clipboard through Electron's. When the call's banner has its own
  window (5d), its place over About and the consent goes with it. Step 7:
  the menu stays the page's (Decisions); About's facts (7b), the clipboard
  (7d) and the banner's own window (7c) done. About shows only in the
  signed-in window (the Mac's shows over the sign-in too).
- **Already listed in README.md's table:** notifications and the taskbar
  badge, the tray, updates, `simeon://` links, the agent's hands on the PC,
  1Password and Chrome on Windows. Step 7: notifications, the taskbar's
  number and the tray (7c), updates (7e), `simeon://` links and 1Password
  (7d) done; Chrome's cookies: nothing to port (Decisions); the agent's
  hands on the PC done (7f, below).
- **The agent's hands on the PC (7f).** Built: `windows/src/main/hands/`
  and `parts/hands.ts` (the stream, PowerShell, Windows' places that hold
  keys), the store's 7f section, `window/LocalAskDock.tsx` (the Allow card
  in the composer) and `window/SettingsYourComputer.tsx`. PowerShell 7 and
  5.1 differ for the agent: 5.1 has no `&&` or `||` and no `$PSStyle`, and
  reads UTF-8 only once told (the scripts tell it); the engine tells the
  agent which one runs, once a host bundle is published (Open questions). A
  native program's own output is read as UTF-8: one that writes the OEM
  code page shows replacement characters. Windows Defender may slow each
  PowerShell's start (each command starts one, as each zsh on the Mac).
  The terminal files and the answers use LF.

## Open questions

For the founder, each to be answered before the step that needs it:

- **The website's deploy.** Answered 3 November 2026: the founder
  deployed, and `app.simeonlabs.com/app-next` serves the build on `main`
  (its scripts' names are the committed build's; signed out, it goes to the
  website's sign-in, no page errors; not looked at signed in). What follows
  is how it stood before. `app.simeonlabs.com/app-next` had answered 404
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

- **The Microsoft Store account** (3 November 2026: the founder chose the
  Store; no certificate is bought, and the GitHub Environment
  `windows-release` with `WIN_CSC_LINK` is not needed). Needed before the
  first release: a company account in Microsoft's Partner Center (free;
  verified with a D-U-N-S number or the company's documents; 4 November
  2026, the founder: "last night i received my duns, so we can go with duns
  in the windows plan": the account is verified with the legal company's
  D-U-N-S number, typed by the founder into Partner Center), the name
  "Simeon" reserved for the app there, and the package's identity it gives
  (its identity name, publisher and publisher name) for the Store's build.
  6 November 2026: the account waits on Microsoft's business verification;
  the Store's build is ready and waits for those three values, pasted into
  `windows/store.json`, then `node scripts/store.mjs` on the Windows PC.
  Later that day the founder gave them, and they are in `store.json`
  (log below); next, the build on the Windows PC.
  Then the Store's listing: description, screenshots, the privacy policy's
  address, the age rating. The Store's review runs on each release.
- **GitHub Actions doesn't run.** Every job on every pull request (#539 to
  #542) ends 2 to 3 seconds after it starts, with no machine given to it
  (no runner's name, 0 ms billed) and no log: what GitHub does when an
  account can't run Actions (a failed payment, or the minutes used with a
  $0 spending limit; not confirmed: the organisation's billing page says).
  Meanwhile every check runs on this side before a merge. It matters for
  the Store's package, which is built on Windows: GitHub's Windows
  machines, or the Windows PC.
- **Who checks on a Windows PC.** Nothing is done until it has run on the
  machine people use; for Windows, someone installs each build on a
  Windows PC. Needed before the first release: nothing of step 7 has run on
  a Windows PC (the log of 2 November 2026, step 7, "Not checked"). First:
  Windows Hello and where its prompt opens, the toasts, the tray and the
  taskbar's number, the call's window, the Store's package installed,
  `simeon://` from a browser, the sealed pair. Without Actions, the same PC
  builds the Store's package (one command).
- **The Mac's and the core's own fixes found in step 3** (the log of 2
  November 2026, "Found in the Mac's and the core's code"): the secret
  card's Saved, the cloud agent's Open landing on a page that doesn't
  exist, Han numerals refused in a name, " to " and "Ms" in French, Link's
  line for a refused card, Review order's tooltip on a Shop checkout. For
  the founder: make them in the Mac and the core (then the web follows), or
  leave them. 3 November 2026, fixed (the log "the Mac's bugs fixed"): the secret card's Saved, Open on a cloud agent's card, Han numerals, " to "; the rest open.
- **The iPhone's 1Password connect sentence** ("Open Simeon on your Mac to
  connect it: …") is in neither catalogue the web reads. The web card says
  the Mac's paragraph instead. Adding a sentence to the Mac's catalogue
  (with a Windows one after step 7) would let the web say where to connect.
- **Add to Simeon without the app.** The website's Add to Simeon
  (`sites/simeonlabs.com/source/teams.py`, `ADD_JS`) opens the Mac's or
  the iPhone's link; on any other computer, Windows and Linux included
  (and on a Mac without the app, 1.5 s later), it gives way to Download
  for macOS. (3 November 2026: the web app is offered to no one, so the
  team is never offered there.) Once the Windows app is released:
  `simeon://` on Windows first, then Download for Windows, as on a Mac. A
  change to `ADD_JS` only.
- **The org chart's foot on a touch screen.** The web says the Mac's
  "Scroll to zoom, drag to pan, double-click to reset." there too; the
  iPhone has its own ("Pinch to zoom, …"). Leave it, or say the iPhone's
  on a touch screen?
- **The Mac's and the core's own fixes found in step 4** (the log of 2
  November 2026, step 4, "Found in the Mac's and the core's code"): a
  refusal's command name on screen ("setAgentAvatarBytes. …",
  "createAgent: Not now"); the voice field's old name; ⌘V in New Agent's
  editor; the routines' connecting words in English; "In 1 min" for a run
  just begun; a routines list that can't be read showing nothing; Teams'
  choice that does nothing; a routine found by search not opening; search
  and Channels waking a resting computer; the core's two searches; "/"
  Open Hidden Agents doing nothing; the pack sheet's older problem; the
  pack link nothing serves; two comments that say otherwise than the
  code. For the founder: make them in the Mac and the core (then the web
  follows), or leave them. 3 November 2026, fixed: a refusal's command name, ⌘V in New Agent, the routines' words, a routine found by search, "/" Open Hidden Agents; the rest open.
- **The Mac's and the core's own fixes found in step 5** (the log of 2
  November 2026, step 5, "Found in the Mac's and the core's code"): the
  Mac not following the open agent's computer after Reload; Take control
  and Stop task on the Mac (only the iPhone has them); the helpers'
  thumbnails all showing the agent's own screen; a failed call's `connect`
  running on and one voice session shared by every call (Voice.swift); the
  call's straight apostrophes; the waveform (random bars, or the sound's
  real volumes?); the move's record read again at launch and while
  offline; low disk saying Disk Saver audits when no app starts it; the
  rebuild card's English ", completed"; a refused billing page shown
  nowhere; the relay asking every 3 s for an account with no computer. For
  the founder: make them in the Mac and the core (then the web follows),
  or leave them. 3 November 2026, fixed: Reload and the open computer, a failed call's connect and the shared voice session, the relay every 3 s; the helpers' thumbnails are right (one screen); the rest open.
- **The Mac's and the core's own fixes found in step 6** (the log of 2
  November 2026, step 6, "Found in the Mac's and the core's code"): a
  refused Connect on a chat card saying nothing (the store's `problem`,
  drawn nowhere on the Mac); the computer's words shown raw after a
  sign-in; an older agent's skills landing after the newer one's; a logo
  that fails once never tried again; "Team" on a person's own marketplace;
  a change under way after a sign-out acting on the next account's
  computer; " (optional)" in no catalogue (and "URL", if it should be
  translated); the organization's skill page reached by no row; any address
  scheme handed to `NSWorkspace`; an app's accounts taken in the order the
  answers come (a removed account back, then a 404), and Remove pressable
  twice; General and Permissions writing their defaults over the person's
  rules or zone before the computer's values are read (the web's wait
  proposed for the Mac and the iPhone); a rule's 1,000 counted in
  characters by the apps and in JavaScript's units by the computer (the
  computer counts characters, or the apps cut as it does?); "your email" in
  English; "Up to date" when nothing is known; "Recovering Simeon's
  Computer" while the stream is only away; `SettingsPill`'s `primary`
  drawing nothing; the French plan line's two full stops; the credits' line
  flooring a share the meter rounds; the menu's spend never in the app's
  language; "Update card" opening two different pages; "%@, connected" in
  no catalogue; two usage reads landing out of order. For the founder: make
  them in the Mac and the core (then the web follows), or leave them. 3 November 2026, fixed: a refused Connect saying nothing, a change after a sign-out, General and Permissions writing first, the French plan line, the credits' line, two usage reads; the rest open.
- **A sentence for the makers a browser can't connect.** Eighteen makers
  take only the loopback (`loopbackOnly`: Dropbox, Canva, Square, Vercel
  and others). The web never opens their page and takes the app back, but
  says nothing: no sentence in either catalogue fits (the Mac's
  `busyMessage`, "another app is using it. Quit the other Simeon app",
  would be wrong). A sentence in the Mac's catalogue would let the web say
  why Connect did nothing. Windows doesn't need it: it listens on 8787
  (step 7).
- **A sentence for a page the browser blocks.** When the browser refuses
  the tab a click opens, the web says "<name> didn't connect. Try again."
  (an app's sign-in) or "Couldn’t open billing. Try again." (Usage &
  Billing), the catalogues' only words for it. Neither says the browser
  blocked the page or how to allow it. A sentence in the Mac's catalogue?
  (Windows needs none: when its own window can't open, the page opens in
  the default browser; step 7.)
- **The server's "Connected" page closing itself.** A sign-in started
  through the server (`/desktop/apps/start`) ends on its own page,
  "Connected, you can close this tab" (`/desktop/apps/connected`), which
  the web app can't close: closing a tab on another site would need its
  `opener`, which would let a maker's page send the Simeon tab elsewhere.
  The page could close itself after it says Connected (`window.close()`, as
  the new `connected.html` does), which a tab the app opened allows; then
  every sign-in's tab closes on the web as the Mac's sheet does. A server
  change, not made.
- **Cancel Trial's words and the server.** The Mac's question says "This
  ends your Simeon trial now and removes your remaining trial credits"; the
  server's `CancelSandTrial` says the subscription is scheduled to end when
  the trial does, the person keeping the remaining days
  (`server/simeon/sand/dashboard.py` 120-123; `plans_service.cancel_trial`
  not read further). Which is right? The words or the server then change;
  the web follows the Mac.
- **The old web app's `?api=`.** The new app now follows `?api=` only on a
  page served from this computer, or to Simeon Labs' own servers over
  https. The old web app at `/app` still follows it to any http or https
  server (`desktop/web/api.ts`, `resolveApiBase`), so a link can send its
  window to another server. The same rule there? A change to
  `desktop/web/api.ts`.
- **The return page's second lines.** The old `/app/connected.html` said
  "You can close this tab and go back to Simeon.", "The sign-in came back
  incomplete. Go back to Simeon and try again." and others under its
  titles; they are in neither catalogue, so the new page leaves them out.
  Add them to the Mac's catalogue, or leave them?
- **`/app-next` on the website.** The web app is offered to no one (3
  November 2026), but anyone who finds `app.simeonlabs.com/app-next` can
  sign in and use it, as the website serves the committed build. Keep it
  there, unlinked, as the founder's way to look at the Windows app's page
  on a Mac, or take it off the website (the build then lives beside the
  Windows app only, and the website stops serving it)?
- **Simeon Help Center.** Answered 5 November 2026: the website's docs
  (`https://www.simeonlabs.com/docs`), on the Mac and the iPhone; the web
  and Windows app's row is back, pointing there, since 6 November 2026.
- **A checkout's approval on Windows.** A checkout's Allow hands Link the
  approval only after Windows Hello says yes; where Hello isn't there, the
  window's alert asks and hands none, so Link asks in its own app, as on
  the web. The Mac lets the tap count when the Mac has no lock at all
  (`PurchaseApproval.swift`); the Windows app doesn't, as a PC without
  Hello may still have a password. Stricter than the Mac: keep it?
- **The website's Download for Windows.** It waits for the first published
  Windows release (step 7's decision), and is then the Store's own "Get it
  from Microsoft" link (3 November 2026); until then
  `/desktop/download/windows` says "Simeon for Windows is not published
  yet.", and the website's billing page still offers Download for Mac to a
  Windows visitor without the app. Needed after the first release: the
  website's button, the billing page's, and Add to Simeon's `simeon://` on
  Windows (above).
- **The Mac's and the core's own fixes found in step 7** (the log of 2
  November 2026, step 7, "Found in the Mac's, the core's and the server's
  code"): any `simeon://mcp-oauth` link, which any page or program can
  open, finished on the person's computer and its `error_description`
  shown as the app's own words, signed out too (`MacServices.handle`; the
  Windows app finishes only a sign-in it named); the device policy's 403
  (`sign_in_policy_violation`) never sent by the server, so its line can't
  show; `computer-stream.log`'s first line naming the home folder, which a
  report's scrub leaves (proposed: the scrub hides it); the browser
  fallback ending `.unconfirmed` at once (MacConnector.swift), its spinner
  stopping before the sign-in is done; How to set it up not offered in
  French for 1Password's "no accounts" (`needsSetup` reads English words);
  `op vault create`'s own refusal lost (`try?`); "the app refused the
  sign-in…" in lower case; the Mac's clipboard sent to the computer as the
  screen reconnects with the window behind (ComputerView.swift); "Last
  checked in 0 seconds." right after Check Now, and the line not moving as
  time passes; the server's Mac release reader matching a version only at
  its start (`releases.py`); on the web, `isForeground` never set, so a
  chat open in a tab behind another counts as read. From the agent's
  hands (7f): `SensitivePaths` matching letter case while the Mac's disk
  ignores it (`cat ~/.SSH/id_rsa` reads the key; its own test records it),
  and missing `cd ~/.ssh; cat id_rsa` (";" ends no name), `echo
  x>/etc/shadow` (">") and `${HOME}/.aws/x` as a path; a command's
  `workingDirectory`, the shell's carried folder and a file's real place
  (a link inside the root) not checked; plain-text tokens not on the list
  (`.git-credentials`, `.config/gh/hosts.yml`, `.config/op`); a wildcard
  (`~/.ss*/id_rsa`) caught on neither; `LocalRead`'s line-end rule
  counting bytes, so a UTF-16 file keeps its CRLF (the engine's too); a
  failed read of the team's settings lifting the ceiling
  (`ceiling(teamAdminSettings: nil)`), so a team's "Never allow" goes at
  every offline launch; after taking the computer's Always or Never, the
  computer not told when the team's ceiling lowers it, so no card can
  approve; and, not checked, whether the agent's Shell can write its
  computer's `settings.json` and so raise the PC from Ask to Always at the
  next connect (on the Mac too: worth a look in the engine). For the
  founder: make them in the Mac and the core (then the web and Windows
  follow), or leave them. 3 November 2026, fixed: `simeon://mcp-oauth`, the home folder in reports, "Last checked in 0 seconds", the guard's letter case, spellings, folders, links and missing files, the team's ceiling, and the computer's copy of the choice (the agent can no longer raise it); the rest open.
- **The engine on the cloud computers.** Step 7 changed the engine
  (`desktop/source`, `ebc47f773`): the hello says the PC's `platform`,
  `shell`, `shellVersion` and `osVersion`; the agent is told the PC runs
  Windows and to write PowerShell and Windows paths; CopyToBox and
  CopyFromBox take Windows' paths. It reaches the cloud computers only once
  a host bundle is published from a Mac (`cd desktop && npm run package &&
  npm run publish:host-bundle`, macOS arm64, CLAUDE.md). Until then the
  agent writes for a Mac: much of it fails in PowerShell, and in Windows
  PowerShell 5.1 `&&` doesn't parse, so nothing runs. Needed before the
  first Windows release: a host bundle published. `npm run package` runs the
  engine's whole suite first (`npm run check`); its feedback route test,
  failing since #502 moved the body into `feedback.py`, would have stopped
  it, and is fixed (3 November 2026). The packaging audit's test needs the
  Mac's `npm run bootstrap` and was not run here.
- **The call's words on a PC.** Done 6 November 2026: "Running a command
  on your PC…" and "Reading a file on your PC…" are in the core's String
  Catalog with their nine translations, and the Windows app says them
  (`core/voiceCall.ts`); the Mac and the iPhone keep "…on your Mac…".
- **What another program of the same Windows person can still do.** The
  agent's hands refuse the places that hold keys and sign the setting and
  the commands allowed once, but a program already running as the person
  on the PC can still: name those places in ways no guard on a command's
  words sees (a name built while it runs, a wildcard, a link it makes),
  reach secrets through Windows' own interfaces (the Credential Manager,
  which doesn't ask the person, DPAPI, the registry); open the sealed key
  (Windows opens it for any program of that person) and sign a setting of
  its own, or put back an earlier signed file, which counts at the next
  start; or change the app itself, or anything else the person can. What
  the signing stops is a plain edit of the files. The Mac's setting and
  `~/.simeon` have no check at all. Leave it at that?

## Log

Newest first.

### 9 November 2026: each AI account's page, its plan's usage like Usage & Billing

The founder: "we need the usage for both claude and chat gpt ... it should
look like usage and billing ... then a way to go to their plan in claude or
chat website ... you can click on chatgpt and claude, like with connectors".

- **Done (web and Mac, the same):**
  - AI Models: each connected account's row opens its page (the row and
    its `›`; `⋯` keeps its menu). `windowModel.showModelAccount`, the
    Settings page `modelAccount` under AI Models, named after the account.
  - The page (`SettingsModelAccountPage`): "Usage", the 5-hour limit and
    the weekly limit as Usage & Billing's meters (`UsageMeterLine`, now
    shared), "Updated …" under; one line before the account's first use;
    then "Plan": the plan and Manage Plan ↗ (`chatgpt.com/codex/settings/usage`,
    `claude.ai/settings/usage`, in a new tab; in the Windows app, the
    default browser).
  - Core: `planUsage`, `planUsageLines`, `planUsageUpdated`, `planPage`
    (SimeonCore's `PlanUsage`, `ModelAccount.planPage`); four new words in
    the core's catalogue and one in the Mac's, each in nine languages.
  - Server and engine: docs/your-own-models.md, "How much of the plan is
    used".
- **Checked:** in Chromium, the built app against a stand-in server: AI
  Models' rows with `›`, Claude's page with both meters and its plan,
  ChatGPT's with the line before its first use, Manage Plan opening
  claude.ai's page in a new tab (caught by the stand-in), Back, and `⋯`
  still opening its menu, not the page (screenshots sent to the founder);
  the core's and window's tests (192), typecheck, lint, the build's check,
  `check_names.py`, `check_translations.py`. The Mac's Swift checked for
  syntax; SimeonCore's new test run on Linux in a package of its own (the
  core's whole suite stops on Linux before any test, at a cast of its
  `@MainActor` test classes, on `main` too).
- **Not checked:** the Mac app built and run (no Xcode here); the Windows
  app itself; real figures from ChatGPT or Claude (only stand-ins).
- **Next:** what the founder says of the screenshots.

### 9 November 2026: + opens the files at once; Settings' forms simple, in our own parts

The founder: the + should open the computer's files directly ("leave
[Photo or Video] to iphone"); the Account page, the Credentials Store's
form and Permissions were "weak design and very confusing", with another
app's pages as examples of structure. A first try copied that app's look
(black buttons, outlined boxes) and was stopped: "make it simple in OUR
STYLE ... same font, same button style, same size, same colors".

- **Done (web and Mac, the same):**
  - `Attachments.tsx`: + opens the file chooser, no menu.
  - Permissions: each list's name over what it means, Add Rule (the blue
    words) at its right, Ask first first; Add Rule opens a card with the
    rule's field, Cancel and Add Rule (`GeneralSettingsModel.adding`,
    `openAdding`, `cancelAdding`); the rules' card under it; no plus rows.
  - The Credentials Store's sheet: each row's field in the Account page's
    Name box (no "Optional"), the person's details first, Name and Hints
    last.
  - Account: Password with Set Password or Change Password at its end; its
    form with Cancel and Save.
- **Checked:** in Chromium, the built app against a stand-in server (+
  opened the chooser with no menu; Permissions, Add Rule's card, Account
  with the password form, a contact, a new login; light and dark,
  screenshots sent to the founder); the sheet's and the model's tests (24),
  typecheck, lint, the build's check, `check_names.py`,
  `check_translations.py` (no new words). The Mac's Swift checked for syntax
  only.
- **Not checked:** the Mac app built and run (no Xcode here); the Windows
  app itself.
- **Next:** what the founder says of the screenshots.

### 9 November 2026: a chat opens at its newest (checked here; the fix is the Mac's)

The founder, with a recording of the Mac app: clicking Iris showed her
chat at its first message, then mid-chat, then dropped to the newest. "it
must open at the bottom ... if we have the same issue in windows/web, fix
that too."

- **Done:** nothing in the web app; it already opens at the newest. The Mac's
  chat is fixed (`mac/STEPS.md`, "A chat opens at its newest"). The
  inventory was run again for it.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer: chats of 80, 60 and 6 messages opened one after another, with
  the computer answering at once and after 0.2 s. Every painted frame from
  the click was measured (`requestAnimationFrame`), and every one that drew
  the chat's rows stood at the newest (0 from the bottom). The app sets the
  newest before the first paint (`useLayoutEffect`) and holds it while the
  rows grow (`ResizeObserver`).
- **Not checked:** the Windows app itself, which loads the same build.
- **Next:** what the founder asks.

### 9 November 2026: Claude stays signed in across engine updates; Claude's line shown; what Claude said kept

The founder, after publishing the engine: an agent's reply opened "Sorry, a
few of your messages got dropped on my end", Tessa's chat said "Something
didn't work here", and the log said `outcome=signed_out`. "but why does it
sign out is my question ... we cant have people always having to sign back
in"; then "go". Each engine published gave every person a new computer,
which got back only its backup, and Claude Code's sign-in is never in it.

- **Done:**
  - The server (not the web app): a new engine goes onto the same E2B
    computer, its disk kept (`docs/services-core.md`, "A new engine on the
    same computer"); a swap that fails replaces the computer as before.
  - The engine: what Claude said (its messages and reactions, its last
    words) goes into the model's history; Claude found signed out is told to
    the server, which shows the account signed out and offers Claude to the
    agents no more; the chat's line about Claude is marked `forPerson`.
  - `core/chat.ts`: a notice marked `forPerson` is shown as it is; the check
    for a machine's words hid Claude's line, as it names Claude. The same in
    the Mac's and iPhone's core (`Chat.swift`).
- **Checked:** the server's computer tests (238, six new: the swap's files
  and script, a failed swap replacing the computer, a busy computer waiting,
  a sleeping one woken and updated, the next opening changing nothing, a new
  template still replacing) and its AI Models tests (37, two new); the swap
  script run here against a stand-in supervisor and engine (the swap in 1.6
  seconds, a host ignoring TERM killed, nothing running, nothing staged,
  nothing restarting); the engine's Claude tests (21) and its typecheck; the
  core's notice test in `chat.test.ts`, and in Swift on Linux; `pnpm test`,
  `pnpm typecheck`, `pnpm lint`.
- **Not checked:** the swap on a real computer (box2's own supervisor
  restarting the engine is what it relies on; a swap that does not come back
  replaces the computer); a real Claude turn falling back after this; the Mac
  and iPhone built (no Xcode here).
- **Next:** what the founder asks.

### 9 November 2026: Claude's own words reach the person; the model on the composer in proportion; how hard it thinks

The founder, after his first real turns on his Claude plan: the agents
"TAKING FOREVER TO ANSWER", each reply opening "Sorry, I missed your last
message"; the model on the composer "unpropotionate"; "just say you're now
connected to claude"; "we should have a thinking effort" (Reason's Light,
Medium, High, Extra High, Max). The engine, the server, the Mac and the
iPhone change in the same pull request.

- **Done:**
  - The engine (not the web app): after a turn the person started that
    Claude Code ran, Claude's own last words are sent as the reply when
    nothing else reached them, or when it worked on after its last message;
    no hidden turns poke it. A model or effort chosen applies to the next
    message (the roles read again before a turn when older than fifteen
    seconds). Claude Code gets `--effort`. `docs/your-own-models.md`,
    section 6.
  - The server keeps the effort with the choice (`PUT models/own`
    `{effort}`), answers `effort` and `efforts` with `GET models/own`, names
    it on Claude's row for the engine (`claudeCodeEffort`), and puts it in
    ChatGPT's requests on the agent's turns.
  - `core/aiModels.ts`: `effort`, `efforts`, `effortName`, `chooseEffort`;
    the words Light, Medium, High, Extra High, Max in the core's table.
  - `ComposerModelMenu.tsx`: the mark and the name in the field's grey at
    13, centred on the microphone; on the person's own plan, the effort
    ("High ⌄") in a soft pill with its own menu, the model's chevron then
    left out. Simeon's: the mark, "Simeon" and the chevron, no effort.
  - The connect sheets end "You're now connected to Claude." (or ChatGPT).
- **Checked:** the engine's Claude tests (13, six new: the words sent, no
  pokes, the effort read and passed, the read before a turn) and the whole
  engine suite (1002 pass; the one failure is the renderer asset not built
  in this container, as before); the server's AI Models tests (60, two new);
  `pnpm test` (1218), `pnpm typecheck`, `pnpm lint`; the core's Swift tests
  on Linux (12, one new); in Chromium against the stand-ins, light, dark and
  French: "Simeon ⌄"; "Claude Opus 5.5" and "High ⌄", both 13 and centred
  with the field's words; the effort menu (Léger … Max in French); Max
  chosen, one `PUT models/own {"effort":"max"}`; no console errors.
- **Not checked:** the Mac and iPhone screens built (no Xcode here); a real
  turn with the new engine (it needs publishing); a real ChatGPT turn at a
  chosen effort.
- **Next:** what the founder asks.

### 9 November 2026: Connect ChatGPT and Claude like an app

The founder: "lets stay true to our design and have it like when you
connect an app" (the reference: an app's consent, its icon, name, summary,
three points, small print and Connect), and "all the many explanation like
open ai page names codex etc. and the absolute awful wording of starting
claude code on your computer needs gone". The Mac and the iPhone change in
the same pull request.

- **Done:**
  - `core/connectConsent.ts`: `modelConsent(provider)`, the shared core's
    `ConnectConsent(modelProvider:)`: "Your ChatGPT plan, for your agents.";
    Put ChatGPT to work, You stay in charge, When your plan runs out; the
    small print (sign-in on the provider's own page; voice calls, dictation
    and video still on the credits). Nine languages.
  - Subscriptions' Connect shows it in the window's consent
    (`connector.ask(…, { consent })`), then opens the sign-in sheet. Add
    Another and Connect Again go straight to the sheet.
  - `appLogo` draws ChatGPT's and Claude's App Store icons, so the consent
    has the whole icon; `ProviderIcon` is now the same tile.
  - The ChatGPT sheet lost the line about Codex; the Claude sheet shows a
    spinner alone while the computer starts the sign-in, and lost the line
    about where the sign-in stays. Its failures: "Simeon's computer needs an
    update first." and "Couldn't reach Claude. Try again in a moment."
- **Checked:** the affected tests, then `pnpm test` (1217), `pnpm
  typecheck`, `pnpm lint`; in Chromium against the stand-ins, light, dark
  and French: Connect opens the consent with the icon and the words above;
  Escape cancels it and Settings stays; Connect then opens the ChatGPT code
  sheet and the Claude sheet, neither with the removed lines; no console
  errors. The core's Swift tests on Linux (11 pass, one new for the
  consent).
- **Not checked:** the Mac and iPhone screens built (no Xcode here); a real
  sign-in with either provider.
- **Next:** what the founder asks.

### 9 November 2026: Claude's models by version; accounts by name, how they stand beside `⋯`

The founder: Claude's models with their versions, as Reason's menu ("this
is common sense"); on Connected, "dont put emails. keep the name of chat
gpt and claude"; how an account stands "next to the three dots" (the
reference: "● Usage available ⋯"), and only "Signed out", not "Connect
again". The Mac and the iPhone change in the same pull request; the server
too.

- **Done:**
  - The server offers Claude Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1 and
    Fable 5 (`own:claude:claude-opus-5-5`…; all five are in Claude Code
    2.1.311, read from its program), Opus first, the one chosen on
    connecting. The first `own:claude:opus` and `…:sonnet` still read as
    Opus 5.5 and Sonnet 5.5. The engine needs nothing: it passes the name
    to `--model`.
  - `SettingsModels.tsx`: each account by its provider's name ("ChatGPT",
    `shownName`), never the e-mail, or the person's own once renamed; under
    it "Subscription"; beside `⋯` a dot and how it stands ("Usage
    available" in green, "Signed out" in red, a limit in grey). Rename's
    field and Disconnect's question use the shown name.
  - The core's "Signed out. Connect again." is now "Signed out", in the
    nine languages.
- **Checked:** the server's AI Models tests (58, with one for the first
  ids); `pnpm test` (1217), `pnpm typecheck`, `pnpm lint`; in Chromium
  against the stand-ins, light, dark and French: the composer's Claude
  submenu with the five versions, "Claude Opus 5.5" on the composer,
  picking Sonnet 5.5; the page with "ChatGPT" and "Claude" over
  "Subscription", "● Usage available" and "● Signed out" beside `⋯`. The
  core's Swift tests on Linux (10 pass).
- **Not checked:** the Mac and iPhone screens built; a real Claude Code
  turn on each version (which a plan allows is Claude Code's to say).
- **Next:** the founder's Mac build.

### 9 November 2026: the model on the composer; AI Models without duplicates

The founder, on the AI Models page: "the model chosen is on the composer.
not on the setting app. ours will have the logo though" (Reason's composer
and menu as the reference, with "✳ Claude Opus 5.5" and "⌘ Simeon"); "do
not duplicate the subscription", Add Another and the rest in the `⋯`; "just
have subscription there. not plus or usage available"; the logos whole "as
link and shop" in Wallet, "not inside a box"; "my style is minimalist". The
Mac (`SettingsModels.swift`, `Composer.swift`) and the iPhone
(`ios/Simeon/AIModels.swift`, `ChatView.swift`) change in the same pull
request.

- **Done:**
  - `src/window/ComposerModelMenu.tsx`: before the microphone, the chosen
    model's mark, its name and a chevron ("Simeon" with Simeon's mark on
    Simeon's models); the window's menu opening upward, drawn on the page's
    body (the field's glass would place it wrong): Simeon, each connected
    provider with its logo, a tick at the end of the one in use and `›` to
    its models (the chosen one ticked), then Add More…, which opens
    Settings › AI Models. `ContextMenu` gained `endCheck` for that tick.
  - `SettingsModels.tsx`: no model menu; Connected lists the accounts with
    the app's icon, the name and "Subscription" (how it stands only when it
    can't be used), `⋯` with Add Another (ChatGPT), Connect Again, Rename,
    Disconnect; Subscriptions lists only the providers not yet connected
    and goes once both are; the line about voice calls under the last group.
  - The icons: ChatGPT's and Claude's own App Store icons (Apple's lookup,
    as `ios/scripts/app_icons.py` fetches the connectors'), whole as
    Wallet's Link and Shop; the bare marks (the founder's files, and
    Simeon's from the menu bar's) for the composer.
  - One model for the window (`store.aiModels`, `AppStore.aiModels` in the
    core), so the page and the composer show the same. The core's
    `unconnected`, `choices`, `chosenChoice`, `composerName`, `kindName`,
    with a test each side.
  - "Add More…" in the nine languages; "Your agents use" and its footer
    gone from the catalogues.
- **Decisions (the session):** the choice stays the person's, for every
  agent (per agent needs the engine and the server); no search in the menu
  (a handful of models) and no effort; on the iPhone the composer shows the
  mark and the chevron only, for room; a signed-out or limited account
  still says so beside "Subscription".
- **Checked:** `pnpm test` (1217), `pnpm typecheck`, `pnpm lint`; in
  Chromium against the stand-ins, light, dark and French: the composer
  saying Simeon, its menu (Simeon ✓, Add More…); with Claude connected,
  "Claude Opus" with Claude's mark, the menu (Claude ✓ ›), the submenu
  beside it, picking Claude Sonnet (`PUT models/own` once, the composer
  following), Add More… opening AI Models; the page with Claude under
  Connected and only ChatGPT under Subscriptions, Claude's `⋯` (Rename,
  Disconnect); both connected, no Subscriptions, ChatGPT's `⋯` (Add
  Another, Rename, Disconnect), a signed-out account in red. The core's
  Swift built and its AI Models tests run on Linux (10 pass).
- **Not checked:** the Mac and iPhone screens built (no Xcode here); the
  Windows app.
- **Next:** the founder's Mac build.

### 9 November 2026: AI Models with the providers' logos, fewer words

The founder, looking at the Mac app's page: "put the real logos", "remove
the 'use your chat gpt plan' and use your claude plan", and the line on top
"only said Connect providers and choose the models your agents use". The
Mac (`SettingsModels.swift`) and the iPhone (`ios/Simeon/AIModels.swift`)
change in the same pull request.

- **Done:**
  - The founder's two logos (ChatGPT's knot, Claude's mark) as
    `src/assets/providers/{chatgpt,claude}.png`, and as `Providers/…` in the
    Mac's and the iPhone's asset catalogues. `ProviderTile` draws them on
    the grey tile at 60% of its side: ChatGPT's in the ink (white on dark),
    Claude's in its orange. They replace the letter C on the accounts, both
    sheets and, new, before each provider's name under Subscriptions
    (`ProviderLine`).
  - Under Subscriptions, nothing under ChatGPT or Claude any more ("Use
    your ChatGPT plan" and "Use your Claude plan" gone from the catalogues).
  - The page's line: "Connect providers and choose the models your agents
    use.", in the nine languages; `pnpm words` and `pnpm build` run.
- **Decisions (the session):** the logos are the providers' own, kept apart
  from the connectors' marks and the chat's brands (`Providers/`), so
  "ChatGPT" and "Claude" in a message aren't coloured by this.
- **Checked:** `pnpm test` (1216 tests, the words, the brands, the connector
  pages, the build), `pnpm typecheck`; in Chromium against the stand-ins,
  light, dark and French: the new line, both logos loaded under
  Subscriptions, on both connected accounts and in the Connect Claude
  sheet, Claude's Connect gone once connected. `check_translations.py`,
  `check_names.py`.
- **Not checked:** the Mac and iPhone pages built (no Xcode here); the
  Windows app.
- **Next:** the founder's Mac build.

### 9 November 2026: Connect Claude in AI Models

The founder: "do it like Reason. Claude code.", then "ok go"
(`docs/your-own-models.md`, section 6, step C3). The Mac
(`SettingsModels.swift`) and the iPhone (`ios/Simeon/AIModels.swift`) have
it in the same pull request, with the shared core's model; the web app's is
their translation.

- **Done:**
  - `src/core/aiModels.ts`: the core's Claude part translated: the link
    Claude Code gives (only an https page of claude.com, claude.ai,
    platform.claude.com or console.anthropic.com is kept), `startClaude`,
    `finishClaude` (the code to the computer; signed in, the e-mail and plan
    to the server, the page read again, Claude Opus chosen when nothing
    was), `cancelClaude`, and Disconnect signing Claude Code out on the
    computer first. Its commands go to the computer through
    `store.modelsCommand` (waking it if it rests). A computer whose engine
    predates Claude Code answers 404 through the gateway (`GatewayError`),
    and the sheet says it needs an update. Two tests of its own.
  - `src/window/SettingsModels.tsx`: Claude under Subscriptions ("Use your
    Claude plan", Connect until it is connected; one Claude per computer, so
    no Add Another); the Connect Claude sheet: "Starting Claude Code on your
    computer…"; 1, "Open Claude's page and approve" with Open; 2, "Paste the
    code Claude shows", the field and Connect (Return sends it, greyed while
    empty, a spinner while Claude Code finishes); the line that the sign-in
    stays on the computer; Connected with the model now used; a refused code
    with Try Again; closing the sheet before the code ends the sign-in on
    the computer. The footer of "Your agents use" now names any plan.
    Connected's end is shared by the two sheets (`ConnectedEnd`).
- **Decisions (the session):**
  - Claude's page opens as OpenAI's does: a new tab without `opener` or the
    referrer (in the Windows app, the default browser).
  - The pasted code is trimmed and sent once; the field is emptied either
    way, so a refused code is never sent twice.
- **Checked:**
  - `pnpm test` (1216 tests, the words, the brands, the connector pages,
    the build), `pnpm typecheck`, `pnpm lint`;
  - in Chromium, the built app against a stand-in server and a stand-in
    computer answering `claudeCodeSignIn…` (nothing real reached; Claude's
    page answered by a stub, the only address outside), light, dark and
    French: ChatGPT and Claude under Subscriptions; Connect, the two steps,
    Connect greyed while empty; Open (Claude's address, no opener, no
    referrer); a wrong code (the spinner, "That code didn't work", Try
    Again starting afresh with the field empty); the right code, Connected,
    Claude Opus chosen (`POST models/accounts/claude` with the e-mail and
    plan, then `PUT models/own`); Claude's Connect gone once connected;
    Disconnect (`claudeCodeSignOut` once, then the row deleted, back to
    Subscriptions); Escape and the close disc each ending the computer's
    sign-in (`claudeCodeSignInCancel`); an old computer (404) saying it
    needs an update; ChatGPT and Claude both connected, the model menu
    offering GPT-6.1 Sol, GPT-6 Luna, Claude Opus and Claude Sonnet.
- **Not checked:** a real Claude Code sign-in on a computer (no engine with
  C2 is published); the Windows app. The tiles are the letter C for both
  ChatGPT and Claude: no logo for either yet, so two connected accounts
  differ only by their plan (the logos came the same day, in the entry
  above).
- **Next:** C4, the engine running an agent's turn through Claude Code.

### 9 November 2026: Settings › AI Models

The founder: "go ahead with the app screens" (the person's own ChatGPT
plan, `docs/your-own-models.md`; the server's side merged in #606 to #609).
The page is new on the Mac (`mac/Simeon/SettingsModels.swift`) and the
iPhone (`ios/Simeon/AIModels.swift`) in the same pull request, with the
shared core's model (`AIModels.swift`); the web app's is their translation.

- **Done:**
  - `src/core/aiModels.ts`: the core's `AIModels.swift` translated (an
    account and its words, the plans' names, the limit's time, the code
    sign-in, the page's model with its wait for approval), with the core's
    tests and two of its own (closing the sheet stops the asking; a server
    not reached while waiting is asked again).
  - `src/window/SettingsModels.tsx`: the page after Usage & Billing (the
    `cpu` symbol): what it is for; "Your agents use" with the model menu
    (Simeon's models, then the account's); Connected, each account its
    tile, its name, its kind and plan and how it stands (green while
    usable, red when signed out) and `⋯` (Rename, Connect Again when signed
    out, Disconnect, asked first); Subscriptions, ChatGPT's Connect or Add
    Another. The Connect ChatGPT sheet: the code with Copy, the page to
    enter it on with Open, the line on Codex, the wait; Connected with the
    model now used; the code expired, a refusal, Try Again.
  - `store.modelsCall`: the page's calls to the server.
- **Decisions (the session):**
  - OpenAI's page opens in a new tab without `opener` or the referrer (in
    the Windows app, the default browser, as the window's other pages);
    only an https address from the server is ever opened.
  - The code is copied with the window's clipboard (`clipboard.ts`: the
    browser's, or the Windows app's through the app).
  - The sheet asks the server every few seconds only while it is open;
    closing it, Escape or a click outside ends the asking.
- **Checked:**
  - `pnpm test` (1214 tests, the words, the brands, the connector pages,
    the build), `pnpm typecheck`, `pnpm lint`;
  - in Chromium, the built app against a stand-in server and computer
    (nothing real reached; OpenAI's page answered by a stub), light, dark
    and French: the page with nothing connected; Connect, the code, Copy
    (the clipboard read back), Open (the address, no opener, no referrer),
    three questions to the server, Connected and the best model chosen;
    the account green; the menu; Rename (the name tidied); Disconnect
    (asked, then back to Subscriptions only); a refused start
    (`device_code_off`) in the person's words; Escape; an expired code; Try
    Again then the sheet closed (no question after); a limited account
    ("Limit reached until 4:10 AM") and a signed-out one in red with
    Connect Again; the model menu, a model picked and sent.
- **Not checked:** a real ChatGPT sign-in or call; the Windows app (the
  default browser opening OpenAI's page). The tile is the letter C: the
  repository has no ChatGPT logo yet.
- **Next:** the founder's word on the screens; the composer's model pill
  (later).

### 7 November 2026: the Windows app's tests on the Dell

The Dell ran `npm test` in `windows/` for the first time, on `2db7c33`:
6 failed and 2 test files did not load. The founder asked what they were.

- **Measured** (the Dell's log, then each reproduced or read here):
  - **2 files not loaded** (`bridge`, `frame`): Vite read the web app's
    `tsconfig.json` for its files the tests import (the contract, the
    saved chats), and that file extends `@simeon/typescript-config`, there
    only after `pnpm install` in `clients/`, which the Dell hadn't run.
    Reproduced here by hiding that package: the same `TSConfckParseError`.
  - **2 timed out at 5 s**: the icon check (every icon drawn again, 5.3 s
    there) and the signature check (Node started six times, 7.4 s).
  - **The hello**: the test wanted Linux's names (`Windows_NT …`, `pwsh`);
    the app says what it should on Windows ("Windows 11 Pro 10.0.26200",
    `systemVersion`) and names the PowerShell it found (the Dell has
    Windows PowerShell, `powershell`, `shellName`). The app was right.
  - **S1**: a symbolic link, which Windows lets only an administrator make
    (`EPERM`); the test's own comment said a junction would be used there.
  - **S6**: `mkfifo`, Unix's; **S4's stand-in**: `/bin/sh` with a trap
    (exit 127, not found). Neither exists on Windows.
- **Done** (tests and their settings only, no app code):
  `vitest.config.ts` gives Vite the compile settings itself (the Windows
  app's target, the web app's JSX) so no tsconfig is read; the hello
  expects `systemVersion` and `shellName`; S1 makes a junction on Windows;
  S6 and S4's stand-in run off Windows only (a FIFO is Unix's; a forced
  stop on Windows always ends a program, and the test before S4's stops a
  real PowerShell there); the icon check 60 s, the signature check 30 s.
- **Checked here.** `npm test` 225 passed, 21 skipped; the same with the
  web app's settings package hidden, as on the Dell (before: 2 files not
  loaded); `test/handsRun.test.ts` with PowerShell 7 on the path, 25 of
  25; `npm run typecheck`.
- **Not checked.** On the Dell: the junction, the time limits, and the
  hands' tests under Windows PowerShell 5.1.

**Next:** `npm test` again on the Dell.

### 7 November 2026: the chat's column and the sidebar's words on Windows

The founder, the Windows app (with the sharp words) beside the other app
full screen: "it has a width max. we don't. our composer, and chats go
far even in a big screen … can we get the same", and the sidebar is
"either too small, or too light".

- **Measured** (the founder's screenshots, the same screen):
  - The other app's messages and field keep to a column 960 wide, centred
    in the chat (its agent's bubbles 675 to 1234, its person's and the
    field ending at 1634); ours ran from 415 to 1902.
  - The sidebars' words are as dark (a preview's darkest strokes 116 to
    its 112, the same grey #F5F5F5 behind), but each a size smaller:
    names 14 to its 15 ("Chief" 27 wide in our 11.5 tag, 35 in its name),
    previews 13 to its 14 ("the" 18 to 20), section names 12 to its 13;
    our pictures 46 to its 34.
- **Done** (`src/window/desktop.css`, the Windows app only): the
  messages' rows and the message field padded to a 960 column, 16 in at
  the least; the sidebar's names 15, previews 14, times 13 at the
  previews' grey, title tags 12.5, section names 13.
- **Checked.** The real app here at 1600 wide (Electron, the stand-in's
  chat): the chat 320 to 1600, its messages and the + from 480, the
  person's bubbles and the field to 1440; the sidebar's names 15,
  previews 14, times 13 (a section's name not shown: the stand-in has no
  sections); `pnpm typecheck`, `pnpm lint`, `pnpm test` (1205), the build
  committed; `npm run smoke` (all checks).
- **Not checked.** On the Dell, full screen.

**Next:** the founder's next design point.

### 7 November 2026: sharp, bigger words in the Windows app

The founder, the Windows app beside another Windows chat app: "first thing
is just how light our design seem. even tho you said we fixed it
yesterday … I'm thinking perhaps its the size of the message boxes, and
the sidebar." (6 November's fix, the Mac's font smoothing, does nothing on
Windows, as that entry said.)

- **Measured** (the founder's screenshots, both apps on the same screen):
  - The other app's words are ClearType (colour at the letters' edges, its
    text #1C1C1C); ours were grey anti-aliasing, most of each letter's
    pixels mid-grey (#4F4F51), so they read pale and thin. That is the
    "light" look.
  - Its words are about 16 on 22 lines (capitals 11 high to our 10;
    "computer" 68 wide to our 57); ours 14 on 20. Its gaps are ours (10
    between blocks, 4 between list items) on its taller lines.
  - The sidebars are the same width (88), spacing and avatar size (34 to
    our 36); its rail is a grey of its own (#F5F5F5), ours nearly white.
- **Why grey** (measured in the real app here: Electron with the
  stand-in's chat, ClearType-style text switched on, the colour pixels of
  an agent's bubble counted): 0 of 10,160 as it was; with every blur
  removed, 8,904 of 10,567. Any one blurred element in the window (the
  head's veil, the message field, the name pill, a round button, even the
  sidebar's) kept the whole chat grey; an opaque chat behind them changed
  nothing.
- **Done** (`src/window/desktop.css`, the Windows app only): no
  `backdrop-filter` anywhere; the glass solid (`--glass` white, #1e1e1e on
  dark), the head's veil the window's ground fading out, the sidebar
  #f5f5f5; a message's words 16 on 22 (and a small heading in one).
- **Checked.** The same capture after: 10,824 of 13,267 colour pixels in
  the agent's bubble, the person's and the sidebar's too; before and after
  side by side (the head still fades the messages out, nothing moved);
  `pnpm typecheck`, `pnpm lint`, `pnpm test` (1205), the build committed;
  `npm run smoke` (all checks).
- **Not checked.** On the Dell: ClearType itself (here it is FreeType's
  equivalent, with another font than Segoe UI), and how 16 reads there.

**Next:** the founder's next design point.

### 6 November 2026: a test copy of the Store's package for the Dell

The founder chose to try the package before the upload: "ok lets test
then".

- **Done.** `node scripts/store.mjs --test` (on Windows) builds the same
  package as a test copy, `out/store-test/Simeon-Store-<version>-test.appx`,
  and installs it. Windows installs only a signed package, so:
  - a certificate is made on the PC for the Store's publisher (Windows
    wants the two to match), "Simeon Store test (this PC only)" in the
    person's own certificates, for code signing only, three months;
    made once and found again after;
  - the PC is told to trust it (its public half into the PC's Trusted
    People), after Windows' own question;
  - electron-builder signs the copy with it from the person's certificates
    (`win.signtoolOptions.certificateSha1`), with no internet timestamp
    (`ELECTRON_BUILDER_OFFLINE`, which electron-builder uses for nothing
    else);
  - `Add-AppxPackage` installs it, over an earlier test copy.
  The PowerShell is written in `scripts/lib/store.mjs` and sent encoded
  (`-EncodedCommand`), so no quote or path is lost.
- **Checked.** `test/store.test.ts` (9); every script it runs parsed by
  PowerShell 7.4.6 here (the certificate, the trust and its elevated part,
  the install); electron-builder's own check of the test build's settings;
  the script stops on Linux with "made on Windows"; `npm test`, `npm run
  typecheck`.
- **Not checked.** Any of it on Windows: the certificate, the trust,
  signing and the install run first on the Dell. Windows PowerShell 5.1
  (the Dell's) parses the same as 7.4 for these lines, but wasn't run.

**Next:** on the Dell, uninstall the developer's Simeon, `node
scripts/store.mjs --test`, try it; then `node scripts/store.mjs` and the
upload.

### 6 November 2026: the Store's identity from Partner Center

The founder gave Partner Center's three values; "Next is building that
prepared Store version on the Dell and testing it before upload."

- **Done.** `windows/store.json`: the identity name, the publisher
  (`CN=95811681-55B1-49D5-8542-DCC11BB21E65`) and the publisher name,
  exactly as Partner Center writes them (the Store refuses any other, so
  the publisher name is the legal company's short name, without ", Inc.").
  `scripts/kept_names.json` keeps the legal name in that file, for that
  reason.
- **Checked.** `readStoreIdentity` takes the file; `test/store.test.ts`
  (6); the manifest written from it by electron-builder's own code (as in
  the entry below): the identity, the publisher, version `0.1.0.0`, the
  publisher name, display name Simeon; well-formed. `check_names.py` was
  run before this entry was written, and this entry first named the
  company itself, which it refuses: reworded in the next pull request.
- **Not checked.** The `.appx` itself, built on the Windows PC
  (`node scripts/store.mjs`). Installing it there before the upload needs
  it signed by a certificate whose subject is that publisher: the Store
  signs the uploaded one, and Windows installs no unsigned package.

**Next:** the build on the Dell; a test install signed for that PC only;
the upload.

### 6 November 2026: the Microsoft Store's build, ready for Partner Center

While Microsoft verifies the company, the session offered to prepare the
Store's build; the founder: "yup".

- **Done.**
  - **The build**: `node scripts/store.mjs` (in `windows/`, on Windows)
    reads the identity from `windows/store.json`, checks this is Windows
    and the web app's committed build is there, builds the app as the
    installer's is, and makes `out/store/Simeon-Store-<version>.appx` with
    electron-builder's `appx` target (`electron-builder.yml`). Nothing is
    signed: no certificate of the PC's is used (the Store signs). It
    prints where to upload it.
  - **The identity**: `windows/store.json` holds the three values, empty
    until Partner Center gives them (Apps and games › Simeon › Product
    management › Product identity). `scripts/lib/store.mjs` checks them:
    the identity name 3 to 50 letters, digits, dots and dashes; the
    publisher a `CN=…` name; each missing or malformed one named with the
    field to copy.
  - **The pictures**: `make-icon.mjs` now also draws the Store's 25 in
    `resources/appx/`: the app list's and taskbar's (44 at five scales, and
    16 to 256 with and without a plate), the Store's logo (50 at five
    scales), the Start menu's square and wide tiles (the icon at 60% of
    their height, in their middle, on a clear ground). `--check` covers
    them.
  - **A Store install**: the app tells the page it is one
    (`DesktopFacts.store`, from `process.windowsStore`); its own updater
    stays off (`releasedBuild`), Settings › Updates is left out
    (`SettingsWindow.tsx`), and it doesn't register `simeon://` itself
    (the manifest does).
- **Checked.** The package's manifest written here from the config with a
  made-up identity, by electron-builder's own code without `makeappx`
  (its `writeManifest` and `computeUserAssets`): the identity, version
  `0.1.0.0`, display name "Simeon", the capabilities, the `simeon`
  protocol, English, the tiles; well-formed XML; all 25 pictures mapped
  and none of electron-builder's samples. `windows`: `npm test` (221, with
  `store.test.ts`), `npm run typecheck`, `make-icon.mjs --check`.
  `clients/apps/app`: `pnpm typecheck`, `pnpm lint`, `pnpm test` (1205,
  with `SettingsWindow.test.tsx`), the build committed.
- **Not checked.** The `.appx` itself: electron-builder makes it only on
  Windows ("AppX is supported only on Windows 10"), so `makeappx` and
  `makepri` haven't run on these pictures. A Store install hasn't run
  (Settings without Updates, `simeon://` from a browser). Partner Center
  hasn't seen the package. If the name Partner Center reserved isn't
  exactly "Simeon", `appx.displayName` must be changed to it.

**Next:** when the account is verified, the three values into
`windows/store.json`, `node scripts/store.mjs` on the Windows PC, the
`.appx` uploaded with the listing.

### 6 November 2026: the Windows icon drawn for Windows

The founder: "we need to fix the window simeon icon as well … it's using
the iphone, which seems weird. the window should have a bigger logo …
inside the white background."

- **Done.** The icon was the Mac's as it is: a tile in macOS's grid, with
  room around it for its shadow and the mark 60% of the picture, small on
  Windows. It is now drawn for Windows (`windows/scripts/lib/tile.mjs`,
  `make-icon.mjs`): the white tile fills the picture (2% room each side,
  corners 22% of its side, white to the Mac tile's soft grey, a hair of
  grey at its edge so it shows on a white taskbar), and Simeon's mark, the
  outline the tray draws (`src/main/surfaces/picture.ts`), spans 78% of
  the tile. Each of the seven sizes (16 to 256) is drawn at its own size.
  `resources/icon.ico` and `icon.png` are the new ones; `make-icon.mjs
  --check` and `test/icon.test.ts` hold them to the script.
- **Checked.** The sizes compared before and after on a light and a dark
  background in Chromium; `npm test`, `npm run typecheck`.
- **Not checked.** On a Windows PC (the taskbar, the Start menu, the
  installer). The Store's own tiles come with the Store's build.

### 6 November 2026: the first install's two findings

The first run on a real Windows PC (the founder's Dell, a developer's
installer, by another session) found two things; the founder: "yes fix
both".

- **Done.**
  - **The install folder is `Simeon`**, not `simeon-windows`: a one-click
    install goes to `%LOCALAPPDATA%\Programs\Simeon`. electron-builder names
    that folder after the package (`simeon-windows`), so the build names
    the app "Simeon" (`extraMetadata.name`, `windows/electron-builder.yml`).
    The updater's own folder follows it: `%LOCALAPPDATA%\simeon-updater`
    (`releaseCacheName`, `release.mjs`'s check), and a check's stand-in feed
    has its own, `simeon-checks-updater`. No release was published under
    the earlier names, so nothing reads them. The data folder stays
    `%APPDATA%\Simeon` (the product's name). An install already in
    `simeon-windows` (the Dell's) is updated in place by the next
    installer, which reads its folder from the registry: uninstall it
    first to move it.
  - **The `.ssh` refusal in the PC's words.** The PC's own refusal already
    said "on this PC"; the agent's answer said "your Mac" and `cat` in
    Terminal. The refusal now asks the person to do it on their PC, in
    PowerShell (for example `Get-Content`), not in a Mac's Terminal
    (`refusalWords`, `windows/src/main/hands/sensitivePaths.ts`), and the
    engine's section on a Windows PC tells the agent to call it their PC
    and give PowerShell whenever it asks the person to do something
    themselves (`userComputerSection`,
    `desktop/source/host/extensions/local-exec/local-exec-platform.ts`).
- **Checked.** The installer built here under Wine (`npm run package`):
  its script's `APP_FILENAME` is `Simeon`, its `app-update.yml` names
  `simeon-updater`, the app inside is named Simeon. `windows`: `npm test`
  (214), `npm run typecheck`, `npm run smoke` (all checks). `desktop`:
  `npm test` 971 passed, 1 failed, the packaging audit that needs the
  Mac's `npm run bootstrap` (as before).
- **Not checked.** The install on a Windows PC; the agent's own words
  after a refusal (they follow the engine, which reaches the computers only
  when it is published from a Mac: `npm run package && npm run
  publish:host-bundle`). The Partner Center / Store build remains
  separate: this change is the developer installer, not that package.

### 6 November 2026: the Windows app's small things left from step 7

The founder: "ok fix all the small things in the windows app."

- **Done.**
  - **The window grows for the agent's pane** when it would not fit beside
    the rail and the chat's 424, within its screen, and gives it back once
    the pane has slid shut if its width wasn't changed since; ⌘B opening
    the sidebar beside the pane makes room too (AgentPane.swift). Not for a
    flight's details, as on the Mac. `growWindow`, `shrinkWindow`
    (`window/windowModel.ts`, `App.tsx`; `windows/src/main/growth.ts`,
    `window.ts`, `main.ts`).
  - **Airline logos and saved logins' icons read and kept by the app**:
    the main process reads them (no site's leave needed), keeps them in
    `%APPDATA%\Simeon\pictures` a week, and the page gets a `data:`
    address, so every logo is cut and lightened for the dark disc, and a
    login shows its site's touch icon (its page's, else its icon, else
    /favicon.ico) as on the Mac. `remotePicture`, `siteIcon`
    (`windows/src/main/native/`, `src/desktop/native.ts`, `FlightCards.tsx`,
    `SettingsCredentials.tsx`). On the web nothing changes.
  - **Windows' own file dialog with the Mac's words**: the avatar's Browse
    files ("Choose an avatar image") and the screenshots' Add ("Choose
    screenshots to add"), only the kinds asked for read back, 25 MB each.
    `chooseFiles` (`windows/src/main/parts/native.ts`, `AvatarEditor.tsx`,
    `Feedback.tsx`). The screenshots' shrinking stays the page's canvas.
  - **Windows' alert sound** where the Mac beeps: a refused Create in New
    Agent, a traveller's problem, a login's problem or refused save.
    `beep`.
  - **Disk Saver set to work by the app itself** when the disk runs low,
    as the Mac (`startsDiskSaver`, `src/desktop/session.ts`); a browser's
    tab still never does.
  - **The call's lines' head moves the window**, as the chat's head under
    it (`Call.tsx`, `window/desktop.css`).
  - **"…on your PC…"** in a call while the agent works on the PC
    (`core/voiceCall.ts`, the core's String Catalog, nine translations).
- **Checked.**
  - `clients/apps/app`: `pnpm typecheck`, `pnpm test` (1202), `pnpm lint`,
    the build committed and `check:built`.
  - `windows`: `npm test` (214, 21 skipped; new: the window's frames, the
    addresses refused, a touch icon found after a redirect, a redirect
    inside the network never followed, a name pointing inside the network
    never read, pictures kept a week and read once, the file dialog's
    words and kinds) and `npm run typecheck`.
  - `npm run smoke` under `xvfb-run` (the app itself, Electron 44, against
    the stand-in): the window grows for the pane through Control-Shift-,
    (900 → 992) and gives it back (900); no picture read from `localhost`,
    the stand-in or `127.0.0.1`; the beep answers. Its first run stopped at
    its first check (the page's address read as empty before it loaded),
    the next runs passed every check; `main` passed it too.
  - `check_translations.py`, `check_names.py`, the inventory run again.
- **Not checked.** Nothing on a Windows PC: Windows' dialog and its title,
  the beep's sound, the window growing on a real screen, a logo or a site
  icon read from the real sites (the checks never reach one). The call's
  lines' head was not dragged.

### 6 November 2026: clearer words, and the Help Center row

The founder, looking at the web app beside the Mac app: "the mac app font
is clearer web app/window seems cheap seems like its fading. can you fix
that. also i dont think you added help center in the webapp/window".

- **Done.** The words: the window (`src/index.css`) and the page after
  connecting an app (`src/connected.css`) no longer set
  `-webkit-font-smoothing: antialiased`. On macOS, Chrome and Electron then
  draw text with the system's own smoothing, as the Mac app's SwiftUI text
  is drawn; with the rule, every word was thinner and lighter. Sizes,
  weights and colours already matched the Mac's (the bubble's 14 points,
  `#1d1d1f`), so nothing else changed. On Windows the rule did nothing
  (ClearType), so the Windows app looks as before.
- **Done.** Help & support has the "Simeon Help Center" row again, first,
  in the Send feedback card, as on the Mac. It opens
  `https://www.simeonlabs.com/docs` in a new tab with no opener or referrer
  (`helpCenterPage`, `src/core/generalSettings.ts`). Its words were already
  in the Mac's catalogue, in every language. The test that said it was left
  out now asks for it; the inventory was run again (the string is now in
  the web app).
- **Checked.** `pnpm typecheck`, `pnpm test` (1195), `pnpm lint`, the
  build committed and `check:built`; `check_translations.py`,
  `check_names.py`. In Chromium, against a stand-in server, light and
  dark: the page lists Simeon Help Center, Send feedback, Report an issue;
  the first opens the docs with no opener or referrer, Send feedback still
  opens its sheet, no page errors. The built CSS carries no
  `font-smoothing`.
- **Not checked.** The words' look on a Mac: the rule only acts on macOS,
  and Chromium here runs on Linux, so no picture from here can show the
  difference. Open `/app-next` in Chrome on the Mac after the website
  deploys and compare with the Mac app. Nothing run on a Windows PC.

### 5 November 2026: the Help Center points at the docs

The founder: "add a help center in iphone and link it to docs. link that
in mac too."

- **Done.** The Mac's "Simeon Help Center" row in Help & support, which did
  nothing since 22 October, opens `https://www.simeonlabs.com/docs`
  (`HelpSupport.openHelpCenter`, `mac/Simeon/SettingsGeneral.swift`). The
  iPhone has a "Help Center" row first in the Send Feedback section of
  Settings, opening the same page. The inventory was run again.
- **Not done.** The web app's row, left out on 2 November until it pointed
  somewhere (Decisions), is not back yet: the founder asked for the iPhone
  and the Mac.
- **Checked.** The page answers 200 ("SimeonLabs | Docs");
  `check_translations.py` and `check_names.py` clean. **Not checked:** the
  rows on a Mac or an iPhone (no Xcode here).

### 5 November 2026: the browser in the app and the agents on the server taken back out

- **Decided by the founder:** back to the code as it was before the browser
  in the app was planned (#550), staying with E2B for the computer ("Revert
  as requested", after "Lets keep it now").
- **Done:** one change that puts back the code of #549, keeping four
  changes from the same days that belong to neither piece:
  - #557, the website's Windows drawn as a Mac draws it;
  - #564, the update not blocked by a waiting card;
  - #565, Skip and I'm done on a card the computer forgot;
  - #566, the sleeper's line before it puts a computer to sleep.

  From #564 and #566 only their log field for the browser (`stale_browser`)
  is left out, since that check is gone.
- **Taken out:**
  - #550–#563: the browser in the app, on the engine, the Mac, Windows and
    the web app;
  - #567–#580: the agents on the server (the plan, the engine's roles, the
    computer's router token, the brain's routes and door, the brain
    service).

  None of them changed the database. They stay in git's history, so any of
  them can be put back.
- **Checked:**
  - server `tests/sand`, `tests/auth`, `tests/desktop`: 951 passed and 10
    failed, the same 10 as on `main`;
  - `desktop` `npm test`: 971 passed; the 1 failure is the packaging audit,
    which needs the window built by `npm run bootstrap`;
  - `windows` `npm test` (196 passed) and `npm run typecheck`;
  - `check_names.py` and `check_translations.py`;
  - the inventory regenerated. Its counts now match the code
    (`LocalExecTests` 17 tests, `SensitivePaths.swift` 310 lines).
- **Not checked:** the Mac app (no Xcode here; `ios/SimeonCore` is not
  touched), the web app's own tests, and the apps on a Mac or an iPhone.
- **What it leaves for the founder:**
  - Anything published since #550 (the engine from the Mac, a Mac or
    Windows release) stays as it is until it is published again from this
    code.
  - Computers made with the browser switched on keep a setting
    (`SIMEON_APP_BROWSER=1`) that nothing reads any more. They need no
    rebuild.

### 4 November 2026: the sleeper says what it saw; what I got wrong

- **Found** by the founder's agent in Render's logs. Simeon's computer was
  put to sleep at 2:31 PM PT with no update tried and no reason logged. The
  sleep line had no fields at all.
- **My mistakes today**, in order:
  1. I said "Update Simeon's Computer" would appear. The Mac's update flag
     comes from a check the engine makes once a day
     (`FOREVER_BOX_IMAGE_WATCH_INTERVAL_MS`).
  2. I said the computer would update itself while it was asleep. The
     sleeper only looks at computers that are awake.
  3. I gave "On this Mac" as the sign it works. It shows only once an agent
     has a tab in the Mac's browser (`MacBrowserHelper.showsHere`), so
     saying "hi" could never show it.
  4. I never had the computer's own log read again after #563.
- **Done:** `sand.box.sleep`, logged before every sleep, says what the
  update check saw. A Redis failure while sending the update is now logged.
- **Checked:** `tests/sand`, 235 passed, with a new test for the sleep line.

### 4 November 2026: "Your turn on the computer" cards that outlived their hand-off

- **Found:** Simeon's card on the founder's Mac waited, and only Take over
  worked. A hand-off is kept in the engine's memory only
  (`session/box-handoff-service.ts`). The card's line in the chat had no
  answer, so the apps showed it waiting
  (`HandoffCardState`: waiting while the line has no resolution). After the
  computer started again on the new engine, `handBackForeverBox` found no
  hand-off to end and returned without a word.
- **Done:** `handBackForeverBox` (`host-gateway-api.ts`) now handles a card
  whose hand-off is gone. It answers the agent's latest unanswered card
  (`newestOpenBoxRequestId`): Skip gives Skipped, I'm done gives Done. Then
  it tells the agent, as a hand-off's end does. No app change.
- **Checked:** `tests/handoff-card-outlives.test.mjs` (4 tests) and the
  engine suite (990 passed). The one failure needs the renderer built by
  `npm run bootstrap`; it fails the same on `main` here.
- **Not done:** it reaches the computer only with a host bundle published
  from a Mac.

### 4 November 2026: the update not blocked by a waiting card

- **Found** by the founder's agent, reading Render's logs. The deploy was
  live at 12:13 PT. Box `f512cc0d` was put to sleep at 12:34 by
  `sand.box.hibernate_idle`, and about every 11 minutes since 11:05. There
  was never an `update_idle` line, and the skip wasn't logged.
- **Cause.** An unreachable box sleeps only after 30 minutes, so this one
  was reachable. The only condition left was busy: an agent was waiting on
  a card. The founder then reported Simeon's "Your turn on the computer"
  card, where only Take over works.
- **Done** (`box_service.py`):
  - the sleeper's update replaces a box that only waits on an approval;
  - `update_idle` now logs `awaiting_approval`;
  - an unreachable out-of-date box logs `sand.box.update_skipped`.
- **Checked:** `tests/sand`, 234 passed, with a new test for the founder's
  case.
- **Not checked:** the founder's computer after the deploy. Also not looked
  into yet: why Skip and I'm done do nothing on the card.

### 3 November 2026: the Mac's bugs fixed, the way the upstream app does

The founder, on the 29 compared below: "yes fix them all the way [the upstream app]
does - but be extremely careful not to break anything". Four parts, each
written in its own worktree off `main`, each read by a second, independent
reviewer, its findings fixed, then merged here and read once more as a
whole. Where the upstream app has the same bug, the fix follows the Windows
app or the web where they already did it right. Where the web and Windows
had the same bug, they were fixed the same way.

**Security** (`fix/a-security`)
- The guard on the places that hold keys (`SensitivePaths`,
  `LocalExecRules`, `MacLocalHands`, and Windows' `sensitivePaths.ts`):
  - letter case ignored, as the Mac's disk does (upstream's
    `_caseInsensitiveFs`);
  - `;`, `>`, `${HOME}`, quotes, escapes, `/./` and `x/../` read as zsh
    reads them (Windows' `commandTexts`);
  - the folder a command runs in, the shell's carried folder (read once,
    then passed to the run) and every `cd`/`pushd` target checked, with
    names relative to them, `../` included, and `-C <dir>` (git, make,
    tar). Every folder applies to the whole command, always. Three
    tries at leaving out the shell's earlier folder after `cd X &&` each
    opened a way in (`cd -`, `c''d -`, an alias), so the session's
    decision is none: a command run while the shell sits in or beside a
    folder that holds keys may be refused for a name there, and the agent
    runs `cd ~/project` on its own first. A bare name is a path everywhere
    but as the command's own name. The final reading compared some 300
    commands with `main`'s guard and the one before: nothing they refused
    passes, and each newly refused one names a key place, or is that
    accepted case;
  - a file's real path behind a link checked and opened;
  - `.git-credentials`, `.config/gh/hosts.yml`, `.config/op` and
    `.config/git/credentials` added, on the Mac and Windows (and GitHub's
    CLI file under `%APPDATA%` on Windows).
- A failed read of the team's settings keeps the last ceiling; `{}` (no
  team) lifts it.
- Execution on Local Computer: the device is the only writer of its
  choice. Every connect tells the computer this device's effective value
  (ceiling applied) and takes nothing back, as upstream's resync. Before,
  a computer saying Always or Never was adopted, and the agent can write
  that file. This applies to the Mac and to the web/Windows
  (`reconcile`/`reconcilePermission` removed).
- `simeon://mcp-oauth` is finished only for a sign-in this app named,
  signed in, within 10 minutes, once (`finishReturnedSignIn`, as the web).
  It covers the Mac's link and sheet and the iPhone's sheet. A refusal
  says "<app> didn't connect. Try again.", never the link's words.
- Reports: `computer-stream.log`'s first line names only the file (Mac and
  Windows); the scrub writes the home folder as `~`.

**State and data** (`fix/b-state`)
- General and Permissions wait for the computer's values on the Mac and
  the iPhone (the web's way, proposed 2 November), and read again only
  when the computer comes back with nothing read yet (web too), so an open
  page never wakes a resting computer.
- Sign-out: each Connectors action takes the signed-in computer once and
  stops when it changes (Mac `PluginsModel`, the iPhone's
  `ConnectAppsModel`, the web's flows); `changeName` writes only for the
  same sign-in.
- Calls: each call numbered; only its own connect, ring and voice events
  reach it. `fail()` cancels its work and lets its voice go. Each voice
  session keeps to its call. The iPhone's microphone is released only by
  the current session. A hang-up no longer wipes the next call's session.
- Reload: attaching the same computer again keeps the watched entries and
  their starts (`ComputerBook.reset(keepingStarts:)`), so the Computer tab
  follows again. Another sign-in still starts empty.
- Channels: read every 4 s only while the app is active (Mac, iPhone) or
  the page visible (web), with reads that don't wake a resting computer.
- The relay backs off (3 s to 60 s) only when the server's own end frame
  comes within 5 s with nothing in it (an account with no computer); a
  cut connection (`ConnectStreamCut`) doesn't count.
- Helpers' thumbnails: unchanged. A screen-driving helper uses its agent's
  own screen (`allocateWindow` gives it window 1), so the picture is right.

**What shows** (`fix/c-display`)
- The Mac's secret card says Saved only from `secretProvided`.
- Refusals: `GatewayError` keeps the command in `method`.
  - A 4xx keeps the computer's own sentence ("Not now", "50 is the
    maximum").
  - A 5xx, or no sentence, is the machine line the plain words hide, as
    before.
  - The apps' own "createAgent: …" lines are machine lines too.
  - Each failure is written to the recent-activity log with its command
    and status.
- Usage: the credits' line uses the meter's number, and a usage read
  superseded by a newer one is dropped.
- "Last checked" says "just now" under a minute and is redrawn every
  30 s, on the web too.
- Routines are read again when the stream comes back (Mac, web).
- A refused Connect, or a sign-in tab the browser blocks, turns the card's
  button to Retry, its accessible name too (Mac, web); `startConnect` tells started, connected and refused
  apart.
- Open on a cloud agent's card is left out on the Mac and the iPhone, as
  on the web (the page doesn't exist).

**Clicks and words** (`fix/d-words`)
- "/" Open Hidden Agents runs search's own action.
- A routine found by search opens that routine (`openRoutine`).
- ⌘V pastes into New Agent's avatar editor (its own key watcher).
- The routine popover's words and Advanced's units are translated (new Mac
  catalog entries, keys `hourly.at`, `weekly.on`, `between.and`; "from" as
  "From:"), Mac and web.
- Flights join airports with " → ".
- ", completed" is translated.
- The plan line's date has the full month ("7 novembre", not "7 nov.." in
  French, pt-BR, sv).
- A traveller's name refuses every decimal digit (`\p{Nd}`), as the server
  does, and takes Han numerals (李一), as the server and the computer do.

**Checked:**
- The core's 599 tests, run on Linux with Swift 6.2.1. A runner in the
  session's scratchpad makes the test methods `async` in a copy, because
  Linux's XCTest aborts on `@MainActor` test classes, on `main` too. Only
  the three that also fail on `main` fail:
  - `ChatTests.testEveryCardTheMacDraws`;
  - `ConnectorIconsTests.testEveryConnectorHasItsIconInTheApp` (its folder
    moved);
  - `LocalToolApprovalsTests.testRecordRetireAndClear` (a macOS path).
- The web app's 1,195 tests, its typecheck and lint, and the committed
  build matching the source.
- Windows' 195 tests (21 more need PowerShell) and its typecheck.
- `check_names.py` and `check_translations.py`.
- Every edited Mac and iPhone file parses (`swiftc -parse`), and each part
  was read line by line for compiling.

**Not checked:** the Mac and iPhone apps weren't built or run (no Xcode
here). That needs `mac/scripts/build.sh` and a try on a Mac and an
iPhone, above all:
- a call, hung up and called again;
- View › Reload with the Computer tab open;
- ⌘V in New Agent;
- a refused Connect;
- General and Permissions while the computer wakes;
- a routine found by search.

**Left as they are:**
- Not in the 29: the rest of each step's list (Open questions).
- Not closable by a word guard (a sandbox would be needed): globs, `$(…)`,
  input sent to a running shell, aliases and functions, the directory
  stack (`~1`), `~bass/`, `$PWD`, `/System/Volumes/…`, `/Volumes/…`
  (named in the guard's comment).
- The iPhone's routine words (`TriggerWord`).
- Search waking a resting computer: its first read must wake, so search
  stays as it is.

### 3 November 2026: the Mac's bugs against the upstream app

The founder asked how the reconstruction of the upstream app
(`desktop/NOTICE.md`; `desktop/source`, the untouched copy in commit
`86d49feb0`, and its window's compiled build in
`clients/apps/web/public/app/assets`) does each of the Mac's and the core's
bugs found in steps 3 to 7. Four readers compared 29 of them, read only:
nothing changed, nothing run on a Mac. Items 1 to 3 were measured by running
the old app's guard in node on the cases. "Simeon's" means a change Simeon
Labs made to the old Electron app, not upstream code.

**The upstream app avoids it** (the way to follow):
- A team's lower ceiling: upstream sends the device's choice, after the
  ceiling, to the computer at every connect. Simeon's change of 25 September
  (`5aca82560`, "adopts the box's standing choice") broke it, and the Mac
  copied that. Proposed: after adopting, push the effective value when it
  differs.
- The agent raising its own permission (not checked before): upstream never
  reads the choice back from the computer; only the device's window writes
  it. The computer's `settings.json` is under `/home/box/sand-data`, which
  the agent can write as root, so the raise looks reachable on the Mac (read,
  not run). Proposed: take only a lower value from the computer at connect.
- `simeon://mcp-oauth` from anyone: upstream has no such link; its sign-in
  return answers only a `state` it began, with an expiry, and shows its own
  fixed words, never the maker's text. Proposed: the same.
- The home folder in `computer-stream.log`: upstream sends no log file with
  feedback. Proposed: the file's name only on that line, or the scrub turns
  the home folder into `~`.
- Settings writing defaults first: upstream keeps the rules on the device
  and pushes them at each connect, so nothing is written over.
- A change after sign-out: upstream runs one engine per account, cuts the
  old calls at sign-out and drops late answers; one gap left (a three-step
  remove). Proposed: each action takes the account once and checks it after
  every await.
- Calls: upstream has no call; Simeon's own Electron call (30 September)
  kept one record and one voice session per call. Proposed: the same.
- Reload stuck on Booting up: upstream's watch lives as long as the view;
  an account change keeps watched entries. Proposed: watch from the view's
  lifetime, and `computer.reset()` in place of a new book.
- The secret card's Saved: upstream shows it only from `secretProvided`.
- Usage reads out of order: upstream numbers each read and keeps only the
  newest.
- "/" Open Hidden Agents: upstream gives each command its own `run`, which
  "/" and search share.
- ⌘V in New Agent: upstream's avatar editor takes the paste on its own view.
- "SEA to LAX": the old app's flight pane (Simeon's) wrote "SEA → LAX".
- ", completed": upstream treats the three states alike; the Mac translates
  two.
- Channels every 4 s: upstream reads only while the pane is shown and the
  window visible.
- Partly: a refusal's command name (upstream leaves it out but shows a code
  name instead: keep the command in a field, not the message); a refused
  Connect (upstream's button turns to Retry, with no reason).

**The upstream app has the same bug**:
- Letter case in the guard (`~/.SSH`), `;`, `>`, `${HOME}`, the working
  folder, the carried folder and links, and the missing
  `.git-credentials`, `gh` and `op` files: the old app's guard is Simeon's
  (25 September), the same rules; upstream had none, its sandbox's read list
  (which would block these) switched off. The old app also let `file://`
  through, which the Mac already refuses.
- A failed read lifting the team's ceiling: upstream's own
  (`catch { return undefined; }`), copied.
- Every helper's thumbnail the agent's screen: upstream's own, copied; no
  upstream mapping of a helper to its screen to learn from.
- A routines list that can't be read shows nothing: upstream's own; it only
  reads again later.
- A routine found by search not opened: upstream's own; the Mac already has
  `openRoutine(_:for:)` (the chat's chip).
- The routine words in English: upstream has no French at all.
- Open on a cloud agent's card: the old app's address (Simeon's), a page
  never made.
- "7 nov..": the old app's line (Simeon's); upstream's says "Resets in N
  days", no date. Proposed: the full month.
- The relay asking every 3 s: upstream's own.

**Simeon's own, no upstream counterpart**: 92% and 93% (use the meter's
number), "Last checked in 0 seconds" (upstream shows no time: "just now"
under a minute, redrawn), Han numerals in a name (flights are Simeon's:
`[0-9]` for `\d`; the server and the computer count digits and the 40
differently too), and search waking a resting computer (resting is
Simeon's, #420).

Next: the founder's word on the three batches (Open questions).

### 3 November 2026: the Microsoft Store

Asked what signing costs, the founder chose the Microsoft Store: "we'll use
the microsoft store, it's free. plus [the legal company] is not even 1". Measured: a
certificate bought now keeps its key in hardware (the CA/B Forum's rule
since June 2023), so the release script's `.pfx` (`WIN_CSC_LINK`) could not
have taken one; Artifact Signing (about $10 a month) needs three years of
tax history; the Store's company account is free since May 2026 and
Microsoft signs its package. electron-builder makes that package only on
Windows (tried here on Linux: "AppX is supported only on Windows 10"). Why
Actions fails was read from a job: no machine was given to it (Open
questions).

**Next:** the Store's build (the `appx` target with the identity Partner
Center gives, the app's own updater off in it), once the account exists;
the plan's checks.

### 3 November 2026: the web app is offered to no one

The founder deployed the website, and asked whether the new web app should
show at `/app`. It doesn't: it is at `/app-next`, which now serves the
build on `main` (checked: its scripts are the committed build's, signed out
it goes to the website's sign-in, no page errors). Then the founder: "know
that the web app will be available to no one btw. the whole point of the
web app is to build the window app". So the move to `/app` is dropped
(Decisions), the website's deploy question is answered, Add to Simeon
offers no web app, and whether `/app-next` stays on the website is asked
(Open questions). `README.md`'s plan says the same.

**Next:** the founder's open questions; the plan's checks, for the Windows
app's page.

### 2 November 2026: step 7, the Windows app

The founder: "lets finish everything , then we handle the open questions.
step 7". The session first read the Mac, the server and the web app for
what Windows needs, and planned the step (decisions above). Part a, the
frame, was written first by the session on the branch (`2d9a98545`,
`1c8fdd0cb`, `1cb5905f8`, `595e48eb0`), with a place for each other part: a
file each in the main process (`windows/src/main/parts/`), a section each
in the bridge's contract and the store, Settings' Updates page. Parts b to
f were then written at once, each in its own slim checkout (`web-7b` to
`web-7f`). Each was read by a second, independent reviewer against the
Mac's Swift and the core, fixed by its own builder after its review, and
merged into one branch (below).

**7a: the frame** (`2d9a98545`, `1c8fdd0cb`, `1cb5905f8`, `595e48eb0`)

- `windows/`, a package of its own (Electron 44.10.1, electron-builder
  26.18.0, its own lockfile): `src/main/main.ts` (one instance, the page's
  own scheme, links and permissions kept to the app's page, the window
  hidden by its ×, the quit that waits for the page, then each part, a
  second each); `appProtocol.ts` (the committed build at
  `app://simeon/app-next/`, 404 elsewhere); `policy.ts` (the website's
  policy, the Mac's list of addresses for the default browser, the
  microphone for sound only); `window.ts` (WindowChrome.swift: 1040 × 760,
  512 × 520 at the least, kept between launches, Windows' buttons through
  `titleBarOverlay`); `kept.ts` (the pair and the computer's address sealed
  by `safeStorage`); `facts.ts` (the version and build, Windows' version and
  languages, the server); `bridge.ts` and the preload (calls and events
  only); a stub for each part in `parts/`.
- The web app: `src/desktop/contract.ts` (the one contract both sides
  read, a section per part), `desktop()` and its stand-in for the tests,
  the session's desktop options (no website cookie, the app's own name,
  its kept pair), the quit's tasks (`quitting.ts`); `window/desktop.css`
  (the Mac's drag places, Windows' buttons' corner); `window/keys.ts` (one
  command-key rule in place of eight copies); a store section per part,
  reset on sign-out; Settings' Updates page, listed only in the Windows app.
- The server: `app://simeon` may call the API with the window's headers,
  never with a cookie (`DESKTOP_APP_ORIGINS`, `server/simeon/app.py`;
  `tests/desktop/test_windows_app_cors.py`).
- `scripts/smoke.mjs`: the app run for real against a stand-in server
  (`test/standIn.mjs`), on Linux under a virtual display;
  `electron-builder.yml`: the installer (NSIS, for the person only,
  `simeon://` registered), built here with Wine. `595e48eb0`: the root's
  `parts/` rule (a Python build folder) hid `windows/src/main/parts/`;
  `windows/.gitignore` takes it back.

**7b: signing in and the session** (`76af65fc5`, `24cdc26ec`, `b060ef607`,
`154795c3d`; after the review `73eb690f2`)

- `src/core/signIn.ts` (the core's SignIn.swift): the verifier and its
  challenge, `loginURL` with `redirectTarget=simeon`, `/auth/poll` with the
  Mac's waits (1 s growing by 1.2 to 10 s, 150 tries, three errors in a
  row), Cancel at once; `logoLightUp.ts` (LogoLightUp.swift).
- `src/window/SignInScreen.tsx` (SignInScreen.swift): the logo lighting
  up, Continue to sign in and Sign up, "Continue in your browser" with
  Reopen link and Cancel, "Setting up Simeon's computer", a 52 strip that
  moves the window; shown for every phase but the window and the first
  run. `src/session.ts` (MacSession.swift): the wait and its lines; Sign
  Out and an ended sign-in forget the pair, the computer's address and the
  chats kept, and show the screen.
- `src/core/savedChats.ts` and the store's 7b section (SavedChats.swift,
  StoreSaved.swift): the list, the pins and folders, the catalogue and
  each chat's newest 300 lines kept on the PC, shown at once at launch,
  replaced by the computer's copy, never another account's, forgotten on
  signing out. `windows/src/main/session/savedChats.ts`: the files in
  `%LOCALAPPDATA%\Simeon\saved-chats`, written whole, one after the other,
  every argument checked.
- `src/desktop/session.ts`, `facts.ts`, `savedChats.ts` and
  `windows/src/main/parts/session.ts`, `session/`: About's three facts and
  a report's (the PC's model from Windows' registry, by `reg.exe`'s full
  path), `computer-stream.log` and `voice-call.log` in the app's data
  folder, their last 256 KB for a report; Relaunch; the page in Windows'
  own languages when none is chosen.

**7c: notifications, the taskbar, the tray, the keys and the call's
window** (`fbfa2f240`, `57cf81a3c`, `7cf365742`, `f83fd017f`; after the
review `c8c1fd24f`, `a381fa3ff`, `37dba058d`)

- `src/core/agentNotifications.ts`, `dockBadge.ts` (SimeonMacCore's
  AgentNotifications.swift, DockBadge.swift): who is told what and when,
  the unread number. The store: `rosterNews` at the core's three places,
  the window's focus told to the computer (`setWindowFocused`), the
  computer's own notifications off once connected, `reloadFromComputer`
  (View › Reload).
- `src/desktop/surfaces.ts`, `badge.ts`, `useDesktopWindow.ts`
  (MacServices.swift, MainWindow): the news to Windows' toasts and the
  taskbar's overlay, the account followed, the focus as Windows has it, the
  tray's words and agents, the menu keys (Control-W, Control-R,
  Control-Q, F11) and the zoom keys, a call hung up before quitting.
  `src/window/controlTab.ts`: Control-Tab walking the sidebar, with the
  Mac's ring.
- `windows/src/main/parts/surfaces.ts` and `surfaces/`: Electron's
  `Notification` under the AppUserModelID; `setOverlayIcon` with the
  page's picture; the tray (MenuBar.swift: the Mac's mark drawn for each
  density in the taskbar's ink, the red dot while anything is unread; Open
  Simeon, New Agent, eight agents, Call <name>, About Simeon, Check for
  Updates…, Quit Simeon); every argument checked (`checks.ts`).
- The call's own window (CallBannerWindow.swift; `src/desktop/CallWindow.tsx`,
  `callWindow.ts`): frameless and clear, floating, out of the taskbar and
  Alt-Tab, at the top right of the work area under the pointer, shown
  without the keys, as tall as its card, taking clicks only over the card;
  the in-window banner not drawn. `bridge.ts`'s `limit` (`a381fa3ff`, a
  frame file) holds its page to its own five calls.

**7d: links and pages outside** (`c6ef88bc4`, `697165c31`, `e3c8b985b`,
`9cc3b9309`; after the review `a089a89f1`)

- `src/core/deepLink.ts` (DeepLink.swift) and `src/desktop/links.ts`
  (MacServices.swift's `handle`): `simeon://` read by the Mac's rules, the
  2 s rule, a pack's and a plugin's link held until the signed-in window;
  `src/window/DeepLinks.tsx`, the Deep Links dialog, signed out too. The
  main process holds the links until the page asks
  (`windows/src/main/outside/links.ts`).
- Connecting (MacConnector.swift, LoopbackSignIn.swift,
  AppReturnSignIn.swift): the default browser (`src/window/outside.ts`),
  each sign-in named to the server with `back: simeon` (`sendSignInBack`),
  `simeon://mcp-oauth` finished only for one the app named; the loopback
  on 127.0.0.1 and ::1, port 8787 (`outside/loopback.ts`,
  `loopbackSlot.ts`), let go when its sign-in or its page goes.
- Stripe's pages in a window of the app's own (`outside/billing.ts`;
  MacConnector.swift's `MacBillingPage`), back on the app's link, then
  `billing/settle` after a failed payment (`settleAfterCardPage`).
- `src/window/presence.ts` and `outside/hello.ts`: Windows Hello for
  1Password's Fill, a checkout's Allow and the Credentials Store's eye.
  `src/window/clipboard.ts`: the app's clipboard for the window's copy
  buttons and the computer's screen, the Mac's way. `src/desktop/onePassword.ts`
  and `outside/onePassword.ts` (MacOnePassword.swift): 1Password's Connect
  through `op.exe`, with the picker for several accounts and How to set it
  up.

**7e: updates and releases** (`da3968d53`, `236cc9b16`, `9f2ee238f`,
`3f43e0fa5`, `dd0738526`, `bcaaab475`, `c63848b31`; after the review
`c42c14cff`, `f77e9936a`)

- `windows/src/main/updates/` and `parts/updates.ts` (Updates.swift's
  `MacUpdates`, with electron-updater 6.8.11): a look as the page opens,
  the daily check, Update Now, the install as Simeon quits or at the next
  launch after Windows shut it down, only in a signed release; every
  installer checked by Windows' own signature check against the signers
  in full (`scripts/lib/signature.mjs`); `updates.json` and `updates.log`
  in the app's data folder.
- `src/desktop/updates.ts`, `window/SettingsUpdates.tsx` (SettingsPages.swift
  236-289): Settings › Updates, the dot beside it while a release waits,
  Check for Updates… from the tray.
- `windows/scripts/release.mjs`, `lib/release.mjs` (the Mac's
  `release.sh`): the version, the build number from the commit count, the
  installer, its record and the feed's two pointers in `out/release/`;
  `--publish` signed only, from Windows only. `make-icon.mjs`: the Mac's
  icon as `resources/icon.ico`. `.github/workflows/windows.yml`: by hand, on
  `windows-latest`, never publishing; signing only from main, through the
  `windows-release` environment.
- The server (`server/simeon/desktop/releases.py`;
  `tests/desktop/test_releases_windows.py`): `/desktop/download/windows`,
  `/latest`, `/latest.yml` and `/{version}/{file}`, 302s to the bucket's
  `releases/win32-x64/`; `has_windows_app`, so the website's billing page
  sends a Windows app user back to it after a checkout; the local-exec
  refusal no longer names the Mac ("…Open the Simeon app on your
  computer.").

**7f: the agent's hands on the PC** (`e24316d77`, `162cd8f39`, `ec0e935b6`,
`14c49323c`, `0b82bd46d`; after the review `17f81799f`, `ac08b47c7`,
`ebc47f773`)

- `windows/src/main/hands/` and `parts/hands.ts` (MacLocalHands.swift;
  SimeonMacCore's `LocalExecWire`, `LocalExecRules`, `LocalExecFiles`,
  `SensitivePaths`, `LocalToolApprovals`, `LocalToolPermission`): the
  stream from the computer's gateway (`wire.ts`, `provider.ts`: hello, a
  ping every 10 s, the Mac's retries), each command in a PowerShell of its
  own with the state carried (`powershell.ts`, `shell.ts`: the 1 MiB cap,
  the 30 s hold then the background with its terminal file, the whole tree
  stopped), reads, listings, uploads and downloads inside the root
  (`files.ts`), Windows' places that hold keys (`sensitivePaths.ts`), the
  gate in the Mac's order (`rules.ts`), the setting and the commands
  allowed once, signed (`permission.ts`, `approvals.ts`, `signed.ts`). The
  contract's nine calls, each argument checked, from the main window only.
- The page: `core/localToolPermission.ts`, `core/localAsk.ts`
  (LocalToolPermission.swift, Approvals.swift's `LocalToolAsk`); the
  store's 7f section (the account's setting and its team's ceiling, the
  computer told only when it changes what it should do, `runHands`, the
  card's answer, a message sent letting go of the commands allowed once);
  `window/LocalAskDock.tsx` (MacLocalPermission.swift's `LocalAskDock`:
  Always allow, Allow once, Never, × and Escape denying once);
  `window/SettingsYourComputer.tsx` (SettingsPages.swift's
  `YourComputerGroup`) in Settings › Computer. Outside 7f's files
  (`14c49323c`): the pane's Escape waits while the card shows, no working
  line while an ask waits.
- The engine (`ebc47f773`, Simeon's own files in `desktop/source/host` and
  `shared`): `local-exec-platform.ts` reads the hello's four fields (each a
  short plain line) and writes the agent's section for a Windows PC;
  `local-exec-bridge.ts` keeps them; `system-prompt-assembly.ts` takes the
  section; CopyToBox and CopyFromBox take Windows' paths
  (`sand-file-transfer-tools.ts`); the call's banner words say "on your
  PC" for a Windows PC (`voice-call-prompt.ts`). A Mac's hello and listing
  are as before. `tests/local-exec-windows.test.mjs`.

**Putting the parts together**

- On the branch, in this order: 7b (`4c677c148`), 7c (`ff90af46e`), 7e
  (`ba6c0f84b`), four of the merge's own commits, 7d (`d23387591`), one
  more of its own, then 7f (`7e76f30df`). Conflicts: the frame's stubs in
  `windows/src/main/parts/` met each part's own file (add/add: each part's kept); 7c's in `App.tsx`, the store
  (7b's `agents` and `account` accessors beside 7c's `rosterNews`),
  `main.tsx` and the stand-in (both sides kept) and `windows/.gitignore`;
  `checkForUpdates`, in 7c's and 7e's sections of the contract, kept once,
  in 7c's; 7d's in `main.tsx` (both kept: the caption buttons' look, the
  session, the surfaces, then 7d's links), `App.tsx`'s imports,
  `windows/.gitignore` (the branch's), the parts' files (each part's own)
  and the stand-in (7e's `{ body, headers }` answers and 7d's `{ text,
  type, headers }`, both taken); 7f's only in `windows/.gitignore` (the
  branch's), the parts' files (each part's own) and the stand-in (7f's
  `{ stream }` answer added beside the others).
- The merge's own commits: `024d4abe9`, the tray's Check for Updates…
  only in a build that updates itself (7c's review, S6); `6be3744d0`, a
  report reads `updates.log` too (7e's review, S8); `7d34b3d05`, Windows'
  caption buttons follow the theme (nothing called `setWindowLook`:
  `src/desktop/windowLook.ts`, `theme.ts`'s `onThemeChange`); `68e72f913`,
  one relaunch: Relaunch and Update Now ask the app to quit and open
  again, the installer opens Simeon when it runs as Simeon quits, else the
  app does once, with no link (decisions above); after 7d, `3c810e2aa`,
  Reload opens the chat on screen again. That one was found by running
  7c's check on the merged build and comparing its screenshots with 7c's
  own (the check passed; the picture didn't): after Control-R the chat on
  screen showed no lines, because Reload attaches again, which empties
  every chat, and the list kept on the PC (7b) shows at once, so the
  window keeps the chat and nothing opened it again.
  `reloadFromComputer` now opens it again as soon as a list shows it
  (tested in `savedChats.test.ts`).
- 7e's review, S7 (the tray signed out), checked at the merge: Open Simeon
  and Quit Simeon only (`surfaces.test.ts`); the daily check is the main
  process's, so a signed-out PC still installs as it quits.
- Then the committed build and the inventory ("Checked", below).
- Left for later, each named here so it isn't lost: the uninstaller
  leaves `%LOCALAPPDATA%\Simeon\saved-chats` unless the person signed out
  first (the Mac's caches also stay); each launch opens the sidebar's first
  chat (the Mac reopens the last, `simeon.window.selectedAgent`); About
  only in the signed-in window; a toast clicked after Simeon quit opens
  Simeon, not the agent (that needs a COM activator or a protocol launch);
  the tray's first words in English until the page says its own; the
  call's window covering a maximised app's caption buttons while a call is
  up (on the Mac that corner is free); `reg.exe`'s answer read as UTF-8; a
  late failure to start an installer can't bring Simeon back; a slow
  Update Now quits as its download ends, a call included (hung up first);
  electron-updater's own `.updaterId` in the data folder, sent nowhere;
  `resources/icon.png` read by nothing yet; from "For Windows", the window
  growing for the pane, the logos and the sites' icons fetched by the main
  process, Disk Saver started by the app, Windows' dialogs with the Mac's
  titles, the beep; an ask for a command longer than 256 KiB can't be
  allowed once (the card says it didn't go through: kept as a guard); a
  file is read at the real path that was checked, which narrows the moment
  between the check and the read without closing it; the call's labels
  saying "on your Mac" in the Windows app (Open questions).

**What the reviews found, and what was done**

- 7b (`73eb690f2`): nothing blocking.
  - Should fix: Relaunch handed the new instance the `simeon://` link
    Windows started the app with (a pack offered again, a spent code
    replayed): it starts with this command line less its links now;
  - should fix: a sign-out's delete of the kept chats could fail while
    Windows held a file a moment, leaving one account's chats for the next
    to see: tried again five times, and a copy left with no sign-in kept is
    forgotten at launch;
  - nits taken: the page's reads wait for its own writes and forgets;
    Enter on a focused button presses it; the pins wait only when the PC's
    copy shows (the web unchanged); a sign-in that can't start says so and
    frees the buttons; the call's log trimmed, its echo cut; the logo in
    Windows' contrast themes; the call's window never signing in; the
    ported tests as the Swift's. Left: `case 'stopped'`, unreachable as on
    the Mac; `reg.exe`'s code page (makers' names are ASCII in practice).
  - Clean, per the reviewer: the sign-in and its tests against the core's,
    the screen's measures, the session in the Mac's order, the kept chats
    field for field, every argument in the main process, no token in a log,
    a file name or a command line.
- 7c (`c8c1fd24f`, `a381fa3ff`, `37dba058d`): nothing blocking.
  - Should fix: Control-R hung up a call that was on and dropped every
    draft, where the Mac's ⌘R keeps both: kept now;
  - should fix: the Mac's zoom keys were gone: Control-= or +, -, 0 now,
    the call's page drawn back at 100 %;
  - should fix: Alt-F4 on the call's window took the banner away while the
    call went on: it asks the call now, as the Mac's close;
  - should fix: the call's window's page could make every call the main
    window's can, the sealed pair included: held to its own five;
  - should fix: the tray's Check for Updates… showed in any packaged build:
    left to the merge, done there (`024d4abe9`);
  - should fix: taps on the call's window may go through it on a touch
    screen: the card's shape takes them where a screen has touch (not
    checked: no touch screen here);
  - nits taken: Control-W, R and Q by their place on a non-Latin layout;
    Control-Q from the call's window; the focus read at start; a long name
    cut, never a toast refused; an earlier account's toasts lose their
    click; the call's window closes when the main page goes. Left: the
    tray's first words; the overlay sent as a PNG (a raw bitmap's layout,
    written blind, could draw the wrong colours on Windows); Control-W
    under an in-page dialog; the overlay's bare number.
  - Clean, per the reviewer: the core's ports line for line, MacServices'
    behaviour, the tray against MenuBar.swift, the call's window's sums
    against CallBannerWindow.swift, every call checked, the web unchanged.
- 7d (`a089a89f1`):
  - Blocking: `op.exe` was looked for first in
    `C:\ProgramData\chocolatey\bin`, a folder any account on the PC can
    make, so another account's program could run as the person and hand
    their agent a vault key of its own: only folders no other account can
    write to now, then PATH;
  - blocking: a timeout, a PowerShell ended or any error after Hello's
    prompt showed fell back to the window's one-click alert: only Hello
    saying, before asking, that it isn't there gives the alert now;
    anything else is cancelled;
  - should fix: a program holding `[::1]:8787` got the maker's answer
    (Edge and Chrome try ::1 first): both addresses must be had now;
  - should fix: any `simeon://mcp-oauth` link was finished on the computer
    and its words shown as Simeon's, signed out too: only a sign-in this
    app named, once, within 10 minutes, a refusal in the catalogue's words;
  - should fix: a sign-in's listener and wait outlived a sign-out or a
    reload, so a code could reach the next account's computer: let go now;
  - should fix: the billing window handed any page's `window.open` to
    Windows (`obsidian:`, `tel:`, with no click): https only, within a
    second of a press;
  - nits taken: the billing window titled with its page's site; an older
    loopback sign-in replaced, never "busy"; each page watched once; the
    computer's screen sending this PC's clipboard as it comes up only while
    the window has the focus; a vault id checked; the billing window's
    dialogs and device pickers. Left: the billing window's storage after a
    sign-out (as Safari's on the Mac, per account of the computer); a
    refused link bringing the window forward (the frame's); two refusals
    stricter than the Mac's; Hello's prompt behind the window (to check
    first on a PC).
  - Found while checking the fixes for real: a link to another site in the
    page's own frame counted as the page leaving (Electron says a
    navigation started before `will-navigate` can refuse it), so links
    stopped reaching the page: only a main-frame navigation to the app's
    own address counts now (`outside/leaving.ts`).
  - Clean, per the reviewer: the links against DeepLink.swift and its
    tests, the 2 s rule and the holding, the loopback's answer, the Stripe
    window's isolation, the billing flow, Hello's script, 1Password's
    commands, the clipboard, the web unchanged.
- 7e (`c42c14cff`, `f77e9936a`): nothing blocking; no release is
  published, and `--publish` refused an unsigned build.
  - Should fix: an unsigned build updated itself and ran what the feed
    named: only a signed release updates itself now;
  - should fix: electron-updater's signature check passed when PowerShell
    couldn't run: our own check, refused on any error;
  - should fix: the signer matched on its common name only: whole
    subjects now, every part compared;
  - should fix: the release checked the signature more loosely than the
    app: the same rule, `WIN_CSC_LINK` only, `--publish` only on Windows;
  - should fix: Update Now started the installer before the app had quit
    (its hard kill could cut a call or a save): after every part's work now;
  - should fix: Windows' shutdown sends no quit, so a release seldom
    installed: one waiting installs at the next launch, before the window;
  - should fix: Check for Updates… did nothing signed out: the tray offers
    only Open and Quit then (checked at the merge);
  - should fix: nothing recorded what the updater did: `updates.log`, read
    by a report (the merge);
  - should fix: a path with a space broke `--publish`: no shell now;
  - should fix: any branch's code could use the certificate: a `signed`
    job, from main only, through the `windows-release` environment;
  - nits taken: a version in a path matched whole, in ASCII; a look no
    longer postpones the daily check; a pulled release forgotten;
    `localhost` refused for the stand-in feed; one staging id for everyone;
    a shallow clone refused; the record's notes on partial downloads and
    the quit's length corrected. Left: two queries for the billing page; a
    late failure to start the installer; a slow Update Now quitting; the
    unused `icon.png`; the billing page's Download for Mac on Windows.
  - Clean, per the reviewer: the feed rule, no downgrade, garbage from the
    feed, web installers refused, the server's routes (no traversal, no
    open redirect), the release's upload order, the page against
    SettingsPages.swift, the icon, the web unchanged.
- 7f (`17f81799f`, `ac08b47c7`, `ebc47f773`): nothing blocking in 7f's own
  code, and nothing that makes the PC less safe than the Mac. What blocked
  shipping the hands was outside it: the agent wasn't told the PC runs
  PowerShell, so it would write zsh. The engine now tells it (`ebc47f773`;
  Open questions, for when it reaches the computers).
  - Should fix: a command's folder was checked as written only, so a
    junction or a short name (`Documents and Settings`, `SSH~1`) ran a
    command inside `.ssh`: checked at its real path now;
  - should fix: Windows' own spellings of a path passed in a command's
    words (`\\?\`, `\\localhost\c$`, short names, the old junctions,
    `::$DATA`, `HOMEDRIVE`, cmd's `%NAME:~…%`, a name relative to the
    folder it `cd`s into, so `cd $env:APPDATA; sc Simeon\…` could write the
    setting): read as Windows reads them now, and what no such guard can
    catch said in the file's header; the setting and the commands allowed
    once signed besides;
  - should fix: a command could see its run's marker, so an ordinary
    `Get-Variable | Format-List` cut its output and lost its state, and
    what followed the marker was held without a cap: the marker is in no
    variable now, the last one is taken, 16 MiB at most;
  - should fix: a cancel had no fallback when `taskkill` didn't stop the
    shell: `child.kill()` a second later, its end told whatever happens;
  - should fix: Arc and Windows' cookie stores were not on the list: added,
    with the app's own folder (nit 6);
  - should fix: large files were read and written while holding the main
    process: `fs/promises` now;
  - nits taken: the card's buttons greyed with no computer attached; this
    computer's address only when the app's server is on it; the sweep only
    among processes made before the shell ended; timeouts past 24.8 days
    held there; files read at the real path checked; the commands allowed
    once forgotten on sign-out; the answers not kept for the old address;
    `\n` line ends to the agent; the record's two overstated sentences.
    Left: the 256 KiB cap on what can be allowed once (a guard).
  - Clean, per the reviewer: the gate's order, Ask's exact match, the
    ceiling, the reconcile and the per-account scope, as the core's; the
    wire, its timings, retries, caps and parser, byte for byte with the
    Mac's; the root and `escapesRoot`; a file's real place checked; the
    shell found by its full path, the command and state on its input; the
    log with no command, content, address or key; the page's words and its
    gating to the Windows app.

**Found in the Mac's, the core's and the server's code** (proposed, for
the founder):

- Signing in: the device policy's 403 (`sign_in_policy_violation`) is
  never sent by the server (searched `server/simeon`), so its line can't
  show; `computer-stream.log`'s first line names the log's full path, the
  home folder with it, which a report's scrub leaves; `MacSession.signIn`'s
  `.stopped` never reaches the screen (harmless).
- Links and connecting: `MacServices.handle` finishes any
  `simeon://mcp-oauth` link on the computer and shows its
  `error_description` in the app's own sentence, signed out too;
  MacConnector.swift's browser fallback returns `.unconfirmed` at once, so
  the card's spinner stops before the sign-in is done; a sign-in answered
  outside a sheet is "the app", its refusal "the app refused the sign-in…"
  in lower case.
- 1Password: `needsSetup` reads English words in its own localised
  sentence, so How to set it up isn't offered in French; `op vault create`
  in `try?`, 1Password's own refusal lost.
- The computer's screen: ComputerView.swift sends the Mac's clipboard as
  the screen reconnects even with the window behind.
- Updates: "Last checked in 0 seconds." likely right after Check Now (not
  run on a Mac); the line doesn't move as time passes. The server's Mac
  reader matches a version only at its start (`0.1.0/../x` would pass);
  a non-object index crashed it, now nothing published for both (changed,
  two lines).
- The web: the store's `isForeground` is never set there, so a chat open
  in a tab behind another counts as read (the Windows app sets it).
- The agent's hands: `SensitivePaths` matches letter case while APFS
  ignores it (`cat ~/.SSH/id_rsa` reads the key on a Mac; its own test
  records it), and misses `cd ~/.ssh; cat id_rsa`, `echo x>/etc/shadow` and
  `${HOME}/.aws/x` as a path (the Windows app closes all four); a command's
  `workingDirectory` (`{command: "cat id_rsa", workingDirectory:
  "~/.ssh"}` reads the key under Always), the shell's carried folder and a
  file's real place are not checked; `.git-credentials`,
  `.config/gh/hosts.yml` and `.config/op` are not on the list; a wildcard
  (`~/.ss*/id_rsa`) is caught on neither (kept as a gap); `LocalRead`'s
  CRLF rule counts bytes, so a UTF-16 file keeps its CRLF (the engine's
  too). The team's settings: a failed read clears the ceiling
  (`LocalToolPermission.ceiling(teamAdminSettings: nil)`), so a team's
  "Never allow" is lifted at every offline launch; after taking the
  computer's always or never, a ceiling that lowers it isn't told to the
  computer, which then sends no asks this PC can answer (both done
  otherwise in the Windows app). Not checked: the reconcile trusts the
  computer's own copy, so if the agent's Shell can write its computer's
  `settings.json` (`host/extensions/settings/settings-service.ts`) it could
  raise this PC from Ask to Always at the next connect, on the Mac too.

**Tests:** on the merged tree the web app's 1,175 in 121 files (from step
6's 973) and the Windows app's 212 in 12 files, all passing (with
PowerShell 7 for Linux on PATH, so the tests that run a real PowerShell
run). 7a's 11 and 14 (the contract and the quit's tasks; the
frame's main process); 7b's 45 and 13 (`signIn.test.ts` with the core's
`SignInTests`, `logoLightUp.test.ts`, `savedChats.test.ts` with
`SavedChatsTests`, `desktop/session.test.ts`; `test/session.test.ts`); 7c's
37 and 16 (the core's `NotificationTests` on `notify.json` read in place,
`rosterNews`, the surfaces, the call's window, Control-Tab;
`surfaces.test.ts`, `bridge.test.ts`); 7d's 67 and 36 (the core's
`DeepLinkTests`, `AppReturnSignInTests`, `LoopbackSignInTests`,
`LoopbackSignInStoreTests` and the rest; `outside.test.ts`,
`outsideGuards.test.ts` with a real loopback listener); 7e's 10 and 59
(`updates.test.ts` with the Mac's French read in place; the updates'
rules, the signature, the icon, the release); the merge's 3 and 1
(`windowLook.test.ts`; the one relaunch), and one more after 7d (Reload
opening the chat again, `savedChats.test.ts`); 7f's 28 and 73
(`localTools.test.ts` with the core's `LocalToolPermissionTests` and
`ApprovalTests`' local card on its fixture, `handsStore.test.ts`,
`LocalAskDock.test.tsx`; `hands.test.ts` with `LocalExecTests` and
`LocalToolTests`, each Mac case beside its Windows path, and the review's
whole list of Windows spellings, `handsRun.test.ts` with the hands run in
a real PowerShell against a stand-in gateway). On the server: the CORS
test for `app://simeon` (7a), the Windows releases and `has_windows_app`
(7e). The engine: `tests/local-exec-windows.test.mjs`, 7, each failing
before the change (7f).

**Checked:**

On the merged tree, with every part in:

- The Windows app: `npx vitest run`, 212 tests in 12 files, with
  PowerShell 7 on PATH so the script's own test runs; `tsc` clean; `npm run
  build`.
- The web app: 1,175 tests in 121 files; `tsc`, Prettier, ESLint, the
  words', brands' and connector pages' checks clean. `check_names.py` and
  `check_translations.py` clean.
- The engine (`desktop`, the whole checkout, `node --test
  --test-timeout=120000 tests/*.test.mjs`): 990 tests, 966 pass, 22
  skipped, 2 fail, the two that fail before step 7 (the packaging audit's
  catalogue, which needs a Mac's bootstrap; the feedback route's test,
  which reads fields moved in #502). None new.
- The app run for real, Electron under `xvfb-run` against the stand-in, on
  the final merged build: the smoke check; 7b's 59 checks; 7c's 79; 7d's
  77 light, 75 dark and 75 French; 7e's 141; 7f's 59. All passing.
  Screenshots, looked at (7f's Allow card and Your Computer among them).
- The committed build, made again from the merged sources: `check-built.mjs`
  says it matches them (600 files); `web_app_inventory.py` run again
  (`strings.json`).
- The installer: `npm run package` in `windows/`, from the checkout's own
  `node_modules`, not linked: `Simeon-Setup-0.1.0.exe`, NSIS, x64, per
  user, unsigned (no certificate). electron-updater and its dependencies
  are inside `app.asar`; the web build inside it is the committed one, file
  for file; its feed is `https://api.simeonlabs.com/desktop/download/windows`.
  Not installed anywhere (no Windows PC); `out/` deleted after.
- The server, on this computer's Postgres and Redis with a local S3
  stand-in: step 7's three test files (the CORS rule, the Windows releases,
  the plans' `has_windows_app`), 23 passing. `tests/desktop`, `tests/sand`
  and `tests/plans`: 1,037 pass and 10 fail, the same 10 that fail on
  `main` (the model list's and the GPT proxy's tests), compared by name;
  `main` passes 1,024 of them. Ruff's check and format clean on every
  server file step 7 changed.

As the parts were merged, on the branch: after 7b and 7c, the web app's
1,066 tests and the Windows app's 43, both typechecks; after 7d, the last,
1,146 and 139, both typechecks, lint, and the words', translations' and
names' checks.

On the merged build before 7f, every part's real-app check ran again,
all passing: the smoke check, 7b's 59 checks, 7c's 79, 7d's 77 light, 75
dark and 75 French, 7e's 141. Two checks were brought up to date for the
merge, the app not changed for them: 7b's now shows the page a dark
Windows too (the page tells the app its theme, "System", which sets
Electron's theme back to the system's) and expects the starter pack's
sheet its launch link now opens (7d); 7c's reads the call's hang-up line
from `voice-call.log` (7b sends the call's lines there, as the Mac).

Before the merge, each part on its own branch: its tests, typechecks and
lint; the app run for real, Electron 44 under `xvfb-run` against the
stand-in server on 127.0.0.1, by the step's check scripts (Electron's own
parts recorded, `shell.openExternal` replaced before the page could call
it, no real service reached), light and dark, then French, no page errors;
the frame's smoke check on each part's build; screenshots, looked at:

- 7a, before the parts were begun: the smoke check (the page from
  `app://simeon`, the server called from that origin, the pair sealed,
  read back after a relaunch, signed in, the agents shown); the web app's
  984 tests, the Windows app's 14, the server's CORS tests; the installer
  built with Wine (127 MB, with its `latest.yml`).
- 7b, 58 checks after its review: the screen's words and measures, the
  drag strip; Return opening `/loginDeepControl?…&redirectTarget=simeon`;
  `/auth/poll` named `windows-0.1.0+0`; Reopen link, Escape, Enter on Sign
  up; three 500s' line and a 403's; then the pair: the window and the
  agents, the pair sealed on disk and in no page storage, a chat kept on
  disk; About, Copy version info, a report with its facts and the log, no
  token. Launched again with every call to the computer held 5 s: the
  agents and a chat's lines from the PC in 140 ms; Sign out: `kept/` empty,
  the chats gone, the server told once. A contrast theme (Chromium's
  emulation). French with no language chosen and another account's copy
  forgotten at launch; Relancer starting the app without the launch's
  link.
- 7c, 79 checks, three runs after its review: the tray and its menu;
  Control-W, the tray's click, Control-R, F11; Control-Tab's ring; with
  the window behind, a finished turn told silently and a question with the
  sound, the click opening that agent; in front, nothing told; the
  overlay's 4 and the tray's dot; the call's window at the top right of
  the work area, shown without the keys, as tall as its card, ringing,
  failed, on, hung up; Control-R during a ringing call keeping it and a
  draft; the zoom at 120 % with the call's page at 100 %; Windows' close on
  the call's window hanging up; Control-Q; French.
- 7d, 77, 75 and 75 checks after its review: a launch's link and a real
  second launch's; the 2 s rule; a pack's link held until signed in; a
  loopback sign-in end to end (Canva) and one through the server (Stripe),
  our start link (Linear) failing and its app taken back; Stripe's window
  over the app, back on the server's link with `billing/settle` after a
  failed payment; Hello's fallback alert (no Hello here); 1Password with a
  stand-in `op` (the picker, the key to the computer and nowhere in the
  data folder; no tool; locked); the clipboard and the computer's screen's;
  a download reaching Electron's own save dialog; a made-up `mcp-oauth`
  link finishing nothing; a reload and a sign-out freeing 8787.
- 7e, 141 checks after its review, with a stand-in feed and bucket in the
  server's shape: the look as the page opens through the server's 302s,
  nothing downloaded; Update Now downloading once (its sha512 checked),
  the installer started only after the quit's work; the quit installing; a
  launch with a release waiting installing it at once, not tried twice; a
  changed installer refused; the switches kept; `checkForUpdates`; a
  developer's build asking nothing; the daily check 10 s after launch; no
  one's folder and no token in `updates.log`. The installer with Wine, and
  `release.mjs` end to end in a throwaway copy of the repository with a real
  `node_modules` (the version and build inside, the feed and the signer,
  the icon, each refusal before any build or upload); the server's tests,
  ruff and mypy on its files.
- 7f, 59 checks after its review, against the stand-in server and a
  stand-in gateway, with a home, root and data folder of their own and
  PowerShell 7.5.4 for Linux: signed in from the kept pair, the hands'
  stream opening with the gateway's key and saying hello with the root,
  the system and the shell; the card's words and buttons, Ask refusing
  before Allow once, Allow once written before the computer hears it, the
  card going when the computer settles it, what was allowed running and
  nothing else; Settings › Computer › Your Computer, Always allow kept and
  told; a command run in PowerShell in the root, its stream and its
  environment carried; `~/.ssh` and the app's data folder refused under
  Always, the stand-in key never read, nor through a folder reached by a
  link, `..` or a stream; Never running nothing; a 30 s command cancelled
  1.5 s in, ended at 1.55 s; Forget; the team's ceiling (its line, Always
  allow greyed with its reason); Escape denying once; a plain edit of the
  setting and a forged answer changing nothing mid-run;
  `Get-Variable | Format-List` ending whole with its state carried;
  quitting and signing out each stopping a command in the background,
  signing out forgetting the setting and the answers; the log with no key,
  command or address.
- Found by 7e: packaged from a checkout whose `node_modules` is a link,
  electron-builder packs electron-updater without its dependencies (the
  app would not start); with a real `npm ci` they are all packed. The
  shipped installer is built only so (the workflow).
- One read-only CORS preflight from an `app://simeon` origin was sent to
  the real API while the server was read, before the server's rule: it
  was refused then, as expected.

**Not checked:**

- **Nothing ran on a Windows PC** (Open questions):
  - signing in and the session: DPAPI, `reg.exe`'s answer,
    `%LOCALAPPDATA%` and `%APPDATA%`, Windows' languages, the caption
    buttons over the sign-in screen, Segoe UI, a high-DPI screen, a
    contrast theme, `app.relaunch()` really starting the app (stubbed), a
    delete refused by Windows' file locking (unit-tested only);
  - the desktop's own: the toasts (the shortcut's AppUserModelID, the
    sound, the Action Center, a click after quitting), the overlay on a
    real taskbar, the tray at real densities in a light and a dark
    taskbar, its menu as Windows draws it, the call's window (its clear
    room, clicks passing through, on top of other apps, out of Alt-Tab, a
    second screen, scaling, touch), full screen with the caption buttons,
    other keyboard layouts, Alt-F4 itself;
  - outside: Windows Hello and Windows PowerShell 5.1 running its script,
    where Hello's prompt opens; `op.exe` in its Windows places and
    1Password's Windows app; the scheme's registration and a second launch
    from a browser; the billing window's look; Windows' Save As; Edge's
    and Chrome's `localhost` on ::1;
  - updates: the installer run, an update found, downloaded and installed
    (on quit, with Update Now, at a launch), the installer closing the
    running app, SmartScreen, the icon at each size, a PC sleeping around
    the daily check.
- Signing: no certificate here; Windows' own signature check on a real
  certificate; the `windows-release` environment; the workflow on
  `windows-latest`; `--publish` and the upload.
- Against the real server and services: `/loginDeepControl` in a real
  browser and its "Continue as" page, `simeon://app/v1/open` bringing the
  app forward, `/auth/poll`'s pair, the server's rule for `app://simeon` in
  production, a report really sent; real Stripe, makers, 1Password and a
  Composio sign-in through `/desktop/apps/start`; the release bucket, its
  302s and range answers, a partial download; a real call (`voice-call.log`,
  the call's window with a real voice).
- In the app, not driven: the access cover's and the access notice's
  Stripe page (the same `openBillingWindow` as Usage & Billing's); the
  Credentials Store's eye (the same ask as Fill's); a first run holding a
  link (unit-tested); signing out and in as another account taking the
  notifications back (the tests only); the window really going behind;
  the kept chats with many agents and pictures; Reduce Motion; a screen
  reader; the website's billing page in a browser (typecheck and lint
  only); side by side with the Mac.
- The agent's hands: on a Windows PC, Windows PowerShell 5.1 running the
  scripts (the input line, its JSON, the UTF-8 console, `GetNewClosure`),
  `pwsh.exe`, `taskkill /T /F`, `child.kill()` and the left-behind sweep,
  no window flashing, real junctions and short names through `realpath`,
  `safeStorage`'s key with DPAPI, a redirected `%APPDATA%`, `net.fetch`
  through a proxy; against a real computer, the gateway through
  `api.simeonlabs.com`, a real agent's commands and asks, the computer's
  own settling of an ask and its `retire-approval`, the team's ceiling from
  the real server, a computer that rests (in the store's tests only); the
  engine's change on a real cloud computer (no host bundle published); in
  Electron, a picture read and made smaller, an upload, a download and the
  terminal file (in the unit run only).

**Next:** the founder's open questions (above), then the first signed
release tried on a Windows PC.

### 2 November 2026: step 6, Connectors and Settings

The founder: "Go for it". Part a, the frame, was
written first by the session on the branch (`2036a744d`, `2a5e9eac7`), with
a place for each other part: a page file each, a section of the store each,
the window model's overlay slot, one connector for the window. Parts b to f
were then written at once, each in its own slim checkout (`web-6b` to
`web-6f`), 6d on 6c's model as it came, 6c and 6d on 6b's connector once
fixed. Each was read by a second, independent reviewer against the Mac's
Swift and the core, fixed by its own builder after its review, and merged
into one branch (below).

**6a: the frame** (`2036a744d`, `2a5e9eac7`)

- `windowModel.ts`: the window's one overlay slot, Settings or Connectors,
  never both (MainWindow.swift's `SettingsLayer`, `PluginsLayer`), each
  opening afresh; About and the feedback sheets; the window's keys wait
  under them. ⌘, (Settings), ⌘⇧M and ⌘⇧W (Connectors), Control off a Mac;
  ⌘K and ⌘B over the slot; Settings' pages, Connectors and the themes in ⌘K
  and "/".
- `theme.ts` (`MacTheme`) and `scripts/theme-css.mjs`: System, Light or
  Dark, kept as `simeon.theme`, faded over 0.3 s; a build step makes every
  dark rule follow the theme chosen.
- `SettingsWindow.tsx`, `SettingsParts.tsx` (SettingsWindow.swift,
  SettingsParts.swift): the dim and the panel (at most 960 × 720), its
  pages listed (Log out at the foot, asked first), the account under
  General with Back, Usage & Billing once the usage is in hand, no Updates
  (decision below); the shared rows, switches, menus, pills and glass
  discs; an empty page for each part.
- The sidebar's foot: the account's disc (its picture, or its letters,
  `accountInitials.ts`, on the core's fixture) and Connect apps; the disc
  in the rail. `connector.ts`, one for the window; an app's accounts' place
  (`2a5e9eac7`); a store section per part, each reset on sign-out.

**6b: connecting an app** (`afbf7bd8b`, `1cbef25c4`, `30d1cad3e`,
`bb6e472d1`)

- `src/core/connecting.ts` (Connecting.swift; LoopbackSignIn.swift's and
  AppReturnSignIn.swift's `state`) and `connectConsent.ts`
  (ConnectConsent.swift): Connect's words, which sign-ins come back to the
  loopback and which through Simeon Labs' server; an app's consent from the
  Swift's tables (189 reaches, 95 notes…), compared both ways by the tests.
- The store (Store.swift 1914-2060): `beginConnect` (install, the sign-in;
  an app it added that opened no sign-in taken back), `undoConnect`,
  `signInURL`.
- `src/window/connector.ts` (MacConnector.swift 21-283): `ask`, `connect`,
  `addAccount`, `signIn` (every 2 s, 150 times), `holdingTab` (the click's
  tab handed to its own sign-in); the browser behind it a seam for
  Electron. `ConnectConsent.tsx` (MacConnector.swift 285-451): 600 wide,
  Return connects, Escape, × or the dim cancel. The chat card's Connect
  (Cards.swift 470-550).
- The return page (`connected.html`, `connectedPage.ts`; the old app's
  bridge.ts 132-180), built by Vite beside the window: it trades the
  website's cookie for a pair in its memory, hands the maker's code to the
  computer, says Connected, closes its tab, signs its pair out, and tells
  the window how the sign-in ended.

**6c: Connectors' core, model and list** (`e591aaba6` to `3f5b048c4`,
`1fc94bf6b`, `4cfea0595`, `b729545dc`)

- `src/core/plugins.ts`, `pluginsOverlay.ts`, `pluginCalls.ts`
  (Plugins.swift, PluginsOverlay.swift, PluginCalls.swift): entries,
  servers, tools and skills, the search and sections, the words and
  notices, every `desktopMcp` call. The store: 3c's catalogue read once for
  both; the computer's side of PluginsModel.swift, kept until sign-out.
- `src/window/pluginsModel.ts` (PluginsModel.swift): Add with its sign-in
  and take-back, the setup page, Remove, Uninstall; Connect, Reopen and
  Retry 0.9 s apart; the switches, Save, Delete, Fix with agent.
- `Connectors.tsx` (PluginsWindow.swift 1-1125): the panel, search, the
  categories' menu, Available | Yours, the sections, the GitHub banner, the
  notice bar, the rows the pages share; the servers read every 15 s.

**6d: Connectors' pages** (`92f729450` to `eb6bf5fbf`, `a071e0bda` to
`a101379cd`)

- `scripts/make-connector-pages.mjs` → `writtenConnectorPages.ts` (the
  core's ConnectorPages.swift): the 232 written pages as data, each
  sentence a literal `t('…')` (`pnpm pages`, checked in `pnpm test`);
  `appAccounts.ts` (AppAccounts.swift) and the store's accounts: rename,
  Remove, another account's page.
- `ConnectorPages.tsx`, `ConnectorPageParts.tsx` (PluginsWindow.swift
  1126-2035): an app's page (Connect, the examples on the Mac's picture,
  accounts, Tools, Setup, the folds, Information, Uninstall), a server's
  page, the account rows, Add Another Account through 6b, the setup page, a
  skill's page.

**6e: Settings' General, Account, Permissions, Computer, Help and Legal;
feedback** (`680b839d9`, `98670b5ff`, `6258f0c7a`)

- `src/core/generalSettings.ts` (AccountSettings.swift, AppLanguage.swift,
  `GeneralSettingsModel`): the account's lines, Auto-review's rules (20 a
  list, 1,000 characters each), the zones, the languages; `language.ts`
  keeps the one chosen. `feedback.ts` (Feedback.swift): the report,
  screenshots, diagnostics, the web's device facts. The store: the name,
  the password, the computer's settings, the zone told on each connect,
  `sendFeedback`.
- `SettingsGeneral.tsx` (SettingsGeneral.swift): General (Language with
  Relaunch, Appearance, Time Zone), Account (name, e-mail, password; no
  Delete Account, as on the Mac), Permissions (Auto-review's rules edited
  in their rows), Help & support, Legal. `SettingsComputer.tsx`
  (SettingsPages.swift 105-187) from 5c's store. `Feedback.tsx`: Send
  Feedback and Report an Issue.

**6f: usage and billing, Wallet, the Credentials Store, the account menu
and About** (`860e6c241`, `d0734c1da`, `8f10d6800`)

- `src/core/usage.ts` (AccountSettings.swift's `UsageSummary`,
  `ManagePlan`, `UsageMeters`; AccountMenu.swift), `upgrade.ts`,
  `trays.ts`, `credentialsStore.ts` (Upgrade.swift, Trays.swift,
  CredentialsStore.swift). The store: the usage (not again within 30 s),
  Cancel Trial, the computer's notices, `billingPortal(flow, tier)`.
- `SettingsUsage.tsx`, `SettingsWallet.tsx`, `SettingsCredentials.tsx`
  (SettingsUsage.swift, SettingsPages.swift 17-89,
  SettingsCredentials.swift); `CreditsLine.tsx` (Composer.swift 119-219),
  in the access notice's place; `AccountMenu.tsx` (Account.swift 90-405):
  the menu from the disc, Weekly usage with its badge and submenu, and
  About. `ContextMenu` gains badges and figure rows.

**Putting the parts together**

- On one branch (`web-6-trial`): 6b, then 6d (with 6c's first commits), 6e
  and 6f (`4cb847aa6`, `4fccd1d46`, `53da8b4c8`), no conflicts, 930 tests.
  Then the merge's own fixes (`5680bce5b`, `0013ffa19`): the apps read
  again on the computer's `appsChanged`; every blank tab through
  `openBlankTab`; the copyright line in one place; `?api=` only from this
  computer or to Simeon Labs' servers; the call's banner over About and the
  consent (decisions below).
- Then each part's review fixes, merged again: 6e (`b569a66ce`), 6b
  (`82fe194b3`), 6c (`487e96ec0`), 6d (`ff19d916d`), 6f (`352cc19cb`). One
  conflict, `SettingsUsage.tsx`: 6f's blank tab now opened by
  `openBlankTab`. 6c and 6d merged 6b's fixed connector and wired it: every
  Connect, Reopen, Retry and Add hands its click's tab to its sign-in. One
  copy of Connecting's words, 6b's.
- The main branch fast-forwarded to the merge; then the committed build and
  the inventory (`b2c747e84`).
- Left for later, each named here so it isn't lost: the browser's
  notifications (the README's table; with Windows' own in step 7); the
  store's `problem` shown nowhere, as on the Mac (Open questions); a
  refused tool switch saying "Simeon isn't available…" for a plain
  refusal (the gateway's error read as an internal one, seen by 6d, not
  judged); the rule for the agent shown in three places (`App.tsx`,
  `ComputerStates.tsx`, `Connectors.tsx`); two reads of the quota (5c's
  `refreshPlan` and 6f's usage, both read again after Cancel Trial and a
  billing page); the usage's read at sign-in made by the account's disc.

**What the reviews found, and what was done**

- 6b (`30d1cad3e`, `bb6e472d1`):
  - medium: the click's tab went to whichever sign-in asked first (two
    clicks could swap tabs; a late sign-in found its tab closed): each tab
    is now handed to its own sign-in;
  - a tab the browser refused had a fallback no browser allows, leaving the
    app half added: now nothing is asked and the alert says so; the return
    page no longer takes its server or the maker's sentence from its
    address, signs its pair out even when its tab is closed first, and
    tells the window how the sign-in ended, so a refusal takes the app
    back, as on the Mac.
  - Found after, by 6c's and 6d's checks: the app couldn't close a
    sign-in's tab on another site, its `opener` nulled. Kept nulled
    (decision below).
  - Clean, per the reviewer: the timings, what is taken back and when, the
    consent's tables, measures, keys and words; no token or code in a log,
    an address or storage.
- 6c (`1fc94bf6b`):
  - medium: the open agent's skills could be dropped for an older ask,
    leaving Private empty: only the shown agent's are kept now;
  - a sign-in page that isn't a web address said it had opened; a click
    outside the categories' menu acted on what it landed on; the category
    button's and Coming soon's spoken names; reads while the tab is hidden:
    all fixed.
  - Clean, per the reviewer: the core's rules on its fixture (160
    catalogues), each call against the computer's, the model's flows, the
    list's measures and colours.
- 6d (`a071e0bda`):
  - medium: the setup page said a secret it had just sent was required:
    fixed;
  - medium: a slow read of an app's accounts brought back a renamed or
    removed one: older answers are dropped now (the core has the same
    race);
  - another account's page a web page only, none once signed out; Remove
    once at a time. Kept: " (optional)" and "URL" in English, as on the
    Mac.
  - Clean, per the reviewer: the generated table equal to the Swift (2,088
    strings, in order), the pages' order, measures and words, no secret in
    the HTML or storage.
- 6e (`6258f0c7a`):
  - medium: General and Permissions could write the page's defaults over
    the person's rules or zone before the computer's values came, as the
    Mac can: they wait for them now (decision below);
  - a browser hiding its zone as UTC moved the agents' zone: it tells
    nothing now; a report's system version from client hints only; a rule's
    line breaks; Edit and Delete shown on a touch screen.
  - Clean, per the reviewer: the zone told on every connect, right for how
    the computer keeps it; the language reaching the server and the
    computer; the rules' 390 cases; no token in the diagnostics.
- 6f (`8f10d6800`):
  - medium: the browser's own password manager could offer or save another
    site's password from the Credentials Store's sheet: no password field
    and no form now (decision below);
  - two usage reads at once could bring back Cancel Trial: only the latest
    lands; the menu's keys as its row comes or goes; About keeps Tab;
    billing pages without the referrer, https only, a blocked one said, the
    reads after one made though Settings closed; the sheet's outside click.
  - Clean, per the reviewer: the usage on the fixture's 500 quotas, Cancel
    Trial, the billing flows, the credits' line, the password's handling,
    the menu and About.

**Found in the Mac's and the core's code** (proposed, for the founder):

- Connecting: a refused Connect on a card goes to the store's `problem`,
  which the Mac draws nowhere; `MacConnector.connect` clears `connecting`
  though another sign-in took its place; the computer's `message` shown
  raw; the card's spoken name in the agent's words, its Coming soon's in
  the catalogue's.
- Connectors: an older agent's skills landing after the newer one's; the
  Filter menu's state, gone since 21 October, still kept; a logo that fails
  once never tried again; the servers read when any window becomes key;
  "Team" on a person's own marketplace; a change under way after a sign-out
  acting on the next account's computer.
- The pages: " (optional)" in no catalogue; the tools read only as a page
  appears; the organization's skill page reached by no row; any scheme
  handed to `NSWorkspace`; the accounts' answers taken in the order they
  come; Remove pressable twice.
- Settings: General and Permissions writing their defaults before the
  computer's values; a rule's 1,000 counted in characters by the apps and
  in JavaScript's units by the computer; "your email" in English; "Up to
  date" when nothing is known; "Recovering Simeon's Computer" while the
  stream is only away; `SettingsPill`'s `primary` drawing nothing;
  `changeName` writing into whichever account is signed in.
- Usage: the French plan line's two full stops ("7 nov.."); the credits'
  line flooring a share the meter rounds (92% and 93%); the menu's spend
  never in the app's language; "Update card" opening two different pages;
  Cancel Trial's question against the server's (Open questions); "%@,
  connected" in no catalogue; two usage reads landing out of order.

**Tests:** 973 (99 files), from step 5's 768 (73): 5 for the frame (the
account's letters on the core's fixture, the theme's build step, the window
model); 6b's 60 (`ConnectConsentTests` with the Swift's tables read in
place, the connecting parts of `PluginCallsTests`, `LoopbackSignInTests`,
`AppReturnSignInTests`, the connector with a stand-in browser, the return
page); 6c's 32 (`PluginsTests` on the core's fixture,
`PluginsOverlayTests`, `PluginCallsTests`, the model on the core's
`PluginsBox`); 6d's 23 (`ConnectorPagesTests`, `AppAccountsTests`, the
table against the Swift, the pages, the accounts' races); 6e's 37
(`SettingsTests`' rules on their 390 cases, `LanguageTests`,
`FeedbackTests`, the model's wait); 6f's 48 (`SettingsTests`' usage on 500
quotas, `AccountMenuTests`, `UpgradeTests`, `TraysTests`,
`CredentialsStoreTests`, the reads' order, the password field's shape).

**Checked:**

After the merge, on one build of the merged branch (the committed build,
`b2c747e84`), every check ran again in Chromium, light and dark, then French
(48 runs, `final6/run-all.sh`): step 6's six scripts (the frame, connecting,
the list, the pages, Settings, usage and billing), step 5's three (5d's also
on a development build with its stand-in voice), and every check of steps 3
and 4 with their probes, so nothing step 6 changed in the window broke an
earlier screen. No page errors. Every outside address answered by a stand-in:
those a screen opens on purpose (the billing pages, Privacy and Terms, an
app's Information links, the stand-in makers' sign-in pages, Add Another
Account's page on the server's address, the shop's and Link's pages, an
airline's logo) were caught as they opened.

- One script brought to the merged app, the app not changed for it: 6f's
  Report an issue now opens 6e's issue sheet (empty in 6f's own branch), so
  its check sees the sheet and closes it before going on.
- The names check found the code both pages share (the window and
  `connected.html`) in a chunk Rollup named after `theme.ts`, holding the
  plain words' guarded names: that chunk is now named as the window's own
  (`index-…`, `vite.config.ts`), the code unchanged (the same hash); the
  frame's and connecting's checks ran again on it, light, dark and French,
  no page errors.
- On the branch: 973 tests, the words', brands', connector pages' and
  committed build's checks, lint, typecheck, `check_names.py` and
  `check_translations.py` pass. The inventory: the web app shows 2,899 of
  the catalogues' 3,164 strings (1,316 after step 5).

Before the merge, each part on its own branch, in Chromium against
stand-ins (the session's scratchpad: `6b-check.cjs` to `6f-check.cjs` and
their probes; every outside address answered by a stand-in), light and
dark, then French, no page errors:

- 6a, before the parts were begun (`6a-check.cjs`): the sidebar's foot
  (the account's disc, Connect apps and its three tiles), Control-, on
  General, a page from the list, Control-K over Settings, Escape, a click
  on the dim, the sign-out question, a theme from Control-K kept after a
  reload and System again, Connect apps opening the slot.

- 6b: the card's Connect and its spinner; the consent's measures, colours
  and keys, a short window; Linear through the server to the new
  `connected.html` (one tab, the code handed over, Connected, its pair
  signed out, the tab closed, no copy of the window's pair in it); Notion's
  page closing its own tab (nothing taken back); Canva (only the loopback)
  and Stripe (refused) taken back. After the review: a maker's refusal
  taking the app back; a browser refusing the tab; a tab left on the
  server's "close this tab" page, the card Connected.
- 6c: Connect apps and Control-Shift-M; the sections, a section's page, the
  categories' menu, search; Escape's three steps, Control-F, Control-K over
  it; Yours and Fix with agent; the servers read every 15 s, never once
  closed nor while hidden. With 6b's connector: the consent, one tab,
  Reopen's tab blank for the 0.9 s, then its page.
- 6d: Notion's written page, its links without `opener` or the referrer;
  Gmail's accounts (rename, Remove double-clicked sending one `DELETE`, Add
  Another Account's tab on the click); Weather's rows, Retry ten minutes on
  (Playwright's clock); the setup page (its tab on the click, the key in
  neither the page nor its storage, a slow refused Save with nothing red);
  a skill's Save and Delete; Uninstall.
- 6e: Control-, on General; Appearance; the zone told, its switch and its
  menu of 418 zones; French after Relaunch, then sent to the server and the
  computer; the name, the e-mail, the password never in the HTML or
  storage; rules added, moved, deleted, twenty; the Computer page's states;
  a report with a 3000 × 1800 PNG sent as a 1600 × 960 JPEG, no token in
  it. After the review: a held and a refused read, everything waiting; a
  browser in UTC telling nothing.
- 6f: the account menu with and without the usage, from the foot and the
  rail; About; Usage & Billing (the trial, Cancel Trial and its refusal,
  the billing tabs without `opener`, the reads when the tab comes back, a
  failed payment); the credits' line near the limit, closed, spent; Wallet;
  the Credentials Store (a password read only after the alert, in neither
  the HTML nor storage). After the review: no password field or form; no
  `Referer` at the stubs; a blocked tab's line.

**Not checked:**

- Against the real computer, server and services (`/app-next` is not live):
  any real maker, Composio, the server's callback and its "Connected" page,
  Stripe, a real computer's settings and notices, a report really sent; the
  old `/app/connected.html` finishing a new app's sign-in, and the new one
  at `/app` after the move (only it tells the window how a sign-in ended).
- Whether a real maker's page (Google's, GitHub's, Slack's, Linear's) sends
  a Cross-Origin-Opener-Policy that makes its tab read closed: the spinner
  would end after about 22 s, the app kept. To measure before the move.
- Side by side with the Mac: every measure read from the Swift; the symbols
  drawn by eye.
- Windows, Safari, Firefox (a tab opened on a click, `BroadcastChannel`,
  `keepalive` across origins), a screen reader, Reduce Motion, a touch
  screen (but Edit and Delete, emulated), a Mac's browser (Control was
  pressed, on Linux); a browser's own password manager (headless Chromium
  has none); a site's own icon (this sandbox's Chromium fails other sites'
  pictures); the window really going behind (the scripts sent `focus`).
- The organization's skill page (no row reaches it); a screenshot dropped;
  HEIC; the usage read after an answer ends (no turn ran); the menus by
  keyboard alone. The pages' clicks and typing in Chromium only: the app's
  tests have no page to click in.

**Next:** step 7, Windows.

### 2 November 2026: step 5, the computer and calls

The founder: "go on with step 5". Part a, the frame, was written first by
the session on the branch (`448f8638d`, `f10de4653`), with a place for each
other part: a file for each part's screens, a section of the store each,
the window model's slots. Parts b to d were then written at once, each in
its own slim checkout (`web-5b`, `web-5c`, `web-5d`), each read by a second,
independent reviewer against the Mac's Swift and the core, merged one by
one, and fixed after its review by its own builder (below).

**5a: the frame** (`448f8638d`, `f10de4653`)

- `windowModel.ts`: the computer over the window (choosing any agent
  closes it, the open one too, as the Mac's `open`), the computer's
  questions (`computerAsk`), what covers the chat (`chatCover`: a call's
  lines or two agents' exchange; another agent opened or signing out
  closes it).
- `store.ts`: a section for each part, each reset on sign-out; the
  computer's four pushes to 5b, everything else unrouted to 5c, the
  connection's return and the window coming forward to 5b. The disk's
  state is kept with the computer's status (5b) and read by low disk (5c),
  whose Disk Saver starts on its change, as in StoreRebuild.swift.
- The screens' places, as the Mac's window has them: the computer after a
  viewer; its dialogs and pills over everything else; the call's banner on
  top. Low disk 8 under the head; the call's place in the head, its line
  in the chat, the covers over the chat. The sidebar's foot (`SidebarFoot`)
  with the Update pill at its right (the account and Connect apps join it
  in step 6). Every agent's pane has the Computer tab (Profile, Routines,
  Computer): an agent's is its computer, a group's its members, a shared
  room's empty.
- noVNC 1.7.0 and ElevenLabs' `@elevenlabs/client` 1.28.0 added, each
  loaded only when a screen shows or a call starts; the website's policy
  for the app's window lets it reach the API's `wss` address (the screen,
  through the API's own proxy) and `https://*.elevenlabs.io`,
  `wss://*.elevenlabs.io` (the call), connections only.
- Two agents' messages to each other over the chat (mac/Simeon/
  Exchange.swift) were missed in step 2: the "teammates" chip was drawn and
  opened nothing. Found while mapping step 5; built in 5d with the call's
  lines, since both cover the chat the same way.

**5b: an agent's computer on screen** (`6f00cd99d`, `95a6a2015`)

- `src/core/cloudComputer.ts` (CloudComputer.swift): the box's status, its
  phase, the words over a screen not there yet, the helpers' screens, the
  agent's pointer, crashes, the clipboard's go-between, the stream's reasons
  and its log (kept in the tab, its last 500 lines, never a token), the
  book of every agent's computer (one read at a time, a late answer kept,
  32 kept). The store (StoreComputer.swift): watch, read under 15 s, start
  (`ensureForeverBox`), retry, hand back (`handBackForeverBox`),
  `typingFocus`, `takeComputerControl`, `stopAgentTask`, the screen's socket
  through the gateway, helpers, the stream's return, the window coming
  forward (at most once a minute, not during a rebuild), the four pushes.
- `src/window/liveScreen.ts` (`LiveScreen`, shared by the iPhone and the
  Mac): noVNC with the Mac's settings (shared, scaled to fit, the session
  not resized, a click focusing it), its phases and log lines, its
  reconnects, the page failing counted as a crash; ⌘A ⌘C ⌘X ⌘Z sent as
  Control on a Mac; the paste. Its licences and where its source is
  (`public/novnc/`, as the wordmark's font).
- `src/window/ComputerView.tsx` and `.css` (ComputerPreview.swift,
  ComputerView.swift): the pane's Computer tab (Needs your attention; the
  16:10 frame watched only, the agent's pointer gliding and pressing, Open
  on hover or focus; Booting up, Setting up with its percent, Can't reach
  with Retry and the reason, the spinner and its notice after 20 s, Screen
  preview unavailable; "{name}'s screen"); the full view over the window
  (the 44 bar with Exit fullscreen, the hand-off's banner with Skip this
  step and I'm done, continue, the largest 16:10 screen that fits, the
  helpers' strip with "and N more"). Every key is the screen's while it
  shows.
- Step 3's buttons that waited for the screen (Cards.swift): the hand-off
  card's picture, Take over and Open computer; a Link checkout's picture and
  Review order; the bank's check's Open the computer.

**5c: the computer's states** (`66ecdbbe8` to `6d0de3722`, `d12132d01`)

- `src/core/computerRebuild.ts` (ComputerRebuild.swift): the server's
  steps, the lock, the steps and how far, the dialog or the banner, the
  words. `src/core/rebuildDriver.ts` (RebuildDriver.swift): update, update
  anyway, reset, recover; Update when done; a failure kept until dismissed
  or retried; Reconnecting 2.5 s after the stream drops; taking longer or
  Couldn't Reach after two minutes. `src/core/migrationWatch.ts`
  (MigrationWatch.swift): `RecreateSandBox`, `ForceRecreateSandBox`, the
  `WatchSandBoxMigration` stream and its relay.
- The store (StoreRebuild.swift): the driver follows the store's own
  changes and 5b's `computerChanged`; Disk Saver; the language told to the
  computer and the account each time the stream comes (back), as the core
  does ("A computer rebuilt meanwhile starts with no language").
- `src/window/ComputerStates.tsx` and `.css` (ComputerStates.swift): one
  dialog at a time over everything (the rebuild's card with its steps and
  bar, Continue in Background; Taking longer than expected; Couldn't Reach
  Simeon's Computer; the recovery's question; a failed update, reset or
  recovery; the update's question, idle or with agents at work), each
  holding the keys; the pills at the window's top; low disk in the chat's
  flow with Go to Disk Saver; the access notice over the message field
  (Send waits under it); the sidebar's card with Recover computer; the
  foot's Update pill; Update Simeon's Computer in ⌘K and "/".

**5d: calls, and two agents' exchange** (`0c78d17c8`, `803a86275`)

- `src/core/call.ts`, `callTones.ts`, `voiceCall.ts` (Call.swift,
  CallTones.swift, VoiceCall.swift): the banner's states and words; the
  ring and the hang-up made as samples and played at the Mac's loudness;
  the call itself (the ticket, `proxy/v1/voice/calls`, refused 503 or 402
  in the core's words; the agent's profile and last messages; the voice its
  picker shows; the call's channel, `send_task` and `recall_text_messages`,
  work said once the line is quiet; seven rings at most; the end with the
  server's summary and the record to the agent). Each call keeps its own
  record.
- `src/core/elevenLabsVoice.ts` (Voice.swift's `ElevenLabsVoice`): the kit
  over WebRTC only, the browser asked for the microphone first, one session
  per call. `standInVoice.ts`: a stand-in voice for the tests and a
  development build only.
- `src/core/exchanges.ts` (Exchanges.swift) and `src/window/Call.tsx` and
  `.css` (CallBannerWindow.swift, CallChat.swift, Exchange.swift,
  ChatPane.swift's `CallButton`): the banner (the agent, its status line,
  the waveform, Transcript, Mute, End; a failure's Close, 20 s); the phone
  8 past the name's pill, not for a group; a call's line in the chat and
  its lines over the chat; two agents' exchange over the chat from their
  chip ("Agents in this exchange" for several); "This chat is view-only"
  and Close Chat. Under a cover the chat, its head and its field are inert
  and drops refused.

**Putting the parts together**

- Merged as they were done: 5d (`c1c2f3778`), 5b (`338bdced3`), then 5c,
  which merged both into its own branch to wire its rebuild to 5b's status
  (`6d0de3722`, `ebc651986`). Then each part's review fixes (`37ba585bb`,
  `886169061`, `63434a28c`). One conflict, in `ChatPane.tsx`: 5d's cover
  wrapping the chat and 5c's low disk telling its height to the messages;
  both kept.
- Left by 5c for the merge, done (`e5cd65892`): the agents' list holds
  still through a rebuild and is read again after (Store.swift's
  `rosterHeld`); Resend does nothing while sending waits. Tested.

**What the reviews found, and what was done**

- 5b (`95a6a2015`):
  - High: off a Mac, a quick Ctrl+V typed "v" on the computer (noVNC holds
    Control back up to 100 ms on Windows, waiting for AltGr). Control and V
    are now pressed by the app on every computer, as the Mac's and the
    iPhone's pages do, and the keys still held put back after;
  - the same words pasted again after the computer copied others pasted
    the computer's: they now go unless the agent's clipboard holds them;
  - a copy the computer made while the page was behind overwrote a newer
    one when the window came forward: it is dropped now;
  - noVNC's source named beside its licences.
  - Clean, per the reviewer: the core and the store rule for rule, the
    races, no connection left open, the keys, nothing read without a
    paste, no token anywhere, step 3's buttons.
- 5c (`d12132d01`):
  - a closed dialog flashed back for 160 ms (with its scrim, the window's
    keys held) when a lock began or ended, and an open one blinked: the
    fade now follows what the previous render drew, as the Mac animates
    only a dialog that appears or goes;
  - the move's stream stopped during a token's read still went out: now
    nothing is sent; pages opened in a new tab no longer keep a handle on
    the app (`opener`); small tidying.
  - Clean, per the reviewer: the lock, steps, words, driver, stream and
    envelopes rule for rule with the Swift; the merge's two items right and
    complete.
- 5d (`803a86275`):
  - two calls shared the voice's session: a call hung up during the
    microphone's question still opened one once allowed, and an earlier
    call's late "connected" ended the next call's. Each call has its own
    session now;
  - an earlier call's work coming back late changed the next call (its
    channel left open, the ring cut, its task's line on the next call's
    banner): each call keeps its own record;
  - under a cover, Tab reached the hidden chat and Return acted on it: the
    chat, its head and its field are inert now; the cover takes its Escape,
    so find stays open;
  - the banner covered find's bar and the pane's Close: it sits in the
    chat's column now (decision below); the tones' audio is let go; limits
    count characters as Swift does.
  - Clean, per the reviewer: the banner's states, every sentence the voice
    is given, the flow and refusals, the record; no ticket logged or kept;
    jsdelivr never reached on the call's path; the stand-in absent from the
    production build.

**Found in the Mac's and the core's code** (proposed, for the founder):

- After View › Reload (⌘R) the Mac no longer follows the open agent's
  computer, so its Computer tab stays on Booting up (read in the code, not
  run on a Mac). The web keeps who is watching.
- The Mac's full view has no Take control or Stop task: only the iPhone
  uses them. The web follows the Mac (in the store, tested, not on screen).
  Should the Mac, the web and Windows have them?
- Every helper's thumbnail shows the agent's own screen, so the strip shows
  one picture four times and a switch only reconnects; an arrow pressed in
  the screen also switches the helper.
- A failed call leaves its `connect` running: closed and called again
  before the server answered, the first call's answer goes on as the new
  call's. Voice.swift keeps one session for every call, so an earlier
  call's late "connected" can end the next call's. The web keeps one record
  and one session per call.
- The call's words have a straight apostrophe ("Couldn't connect") where
  the app writes ’ elsewhere. The waveform is random bars scaled by the
  voice's activity (the old Electron banner drew the sound's real
  frequencies): keep, or use the kit's volumes?
- The move's record is read again from the start at launch and after each
  failed read while offline, so a past update can take the lock for 1 to
  2.5 s ("Updating Simeon's Computer", Send paused, the list held).
- Low disk says "Disk Saver is auditing usage…" while the web never starts
  Disk Saver by itself (the iPhone's choice too).
- The rebuild card's ", completed" is English in every language; a refused
  billing page from the access notice is kept where nothing shows it; the
  pills' comment says the opposite of the code; the relay asks the server
  again every 3 s for an account with no computer.

**Tests:** 768 (73 files), from step 4's 633 (61): 2 for the frame; 5b's
47 (the core's `CloudComputerTests` on its own fixture, `ComputerBookTests`,
`ComputerControlTests`, the helpers and the host's events, the screens'
states, the keys and the paste); 5c's 46 (the core's `ComputerRebuildTests`
on its fixture, read in place, `RebuildDriverTests`, the envelopes, the
relay, `FollowingTheRebuildTests`, the update's offer, the store's
commands, the fade, the language); 5d's 40 (the core's `CallBannerTests`,
`CallFlowTests`, `VoiceCallTests`, `ExchangePageTests`, the store's call,
and a test for each race the review found, four of which fail on the first
commit). The merge's two items were added to existing tests (the list
held through a rebuild, Resend while sending waits).

**Checked:**

After the merge, on one build of the merged branch (`63434a28c`, the code
of the committed build, `517282b47`), every check ran again in Chromium,
light and dark, then French: step 5's three scripts (5d's on the
production build, and with its stand-in voice on a development build of
the same code), and every check of steps 3 and 4 (the cards, 3b, 3c, the
flights, the shop, 4a to 4e and their probes), so nothing step 5 changed
in the window broke an earlier screen. No page errors. Every outside
address answered by a stand-in; those a screen opens on purpose (the plans
page from the access notice, a pull request, the shop's and Link's pages,
an airline's logo) were caught as they opened, and the call kit's one
socket (`wss://livekit.rtc.elevenlabs.io/rtc/v1`) was refused.

- One script brought to step 5's markup, the app not changed for it: the
  waiting hand-off card has the Mac's two buttons now (I'm done, and Take
  over in the blue), so 3b's check presses I'm done by its class.
- The development build with the stand-in voice is made with
  `NODE_ENV=development` and `--mode development`; with the mode alone,
  Vite makes a production build, which leaves the stand-in out, as it
  should.
- The inventory: the web app shows 1,316 of the catalogues' 3,164 strings
  (1,149 after step 4). The committed build made again from this code;
  `pnpm test`'s check of it passes.

Before the merge, each part on its own branch, in Chromium against stand-ins
(the session's scratchpad: `5b-check.cjs`, `5c-check.cjs`, `5d-check.cjs`
and their probes; every outside address answered by a stand-in, nothing
reached), light and dark, then French, no page errors:

- 5b: the screen drawn by noVNC against a small RFB 3.8 server in the
  script (its pixels read back from the canvas); the tab in each state; the
  full view, its keys staying with the screen (Control-K, Escape, Control-F,
  Control-B reached the computer and opened nothing), a paste, the
  computer's copy, six helpers and their menu, the hand-off's answers, the
  step 3 buttons; after the review, Chromium told it runs on Windows: a
  quick Control+V sent Control, V, Control up, with the words first.
- 5c: the update's pill, question and background pill from the server's
  steps; an agent at work; Update anyway refused; Recover computer and a
  failed reset; the stream lost: Reconnecting, Couldn't Reach after two
  minutes (Playwright's clock), the recovery, Taking longer than expected,
  the message sent once back; low disk and Go to Disk Saver; the move; the
  access notice with Send waiting; after the review, the reviewer's probes
  showing no dialog coming back.
- 5d: the phone's place, none for a group; the server refusing (503,
  402); a ticket given and the kit's one socket refused ("Couldn't
  connect"); the microphone refused; with the development build's stand-in
  voice: ringing, live, speaking, listening, the transcript, working,
  muted, ended, the hang-up, the record sent, the call's line then its
  lines; the exchange, its menu, Copy, its keys; after the review, Tab
  under a cover, Escape with find open, the banner clear of find and the
  pane, a late channel closed with its own id.

**Not checked:**

- Against the real computer, server and services (`/app-next` is not
  live): a real screen through the proxy's `wss` with its token, a real VNC
  server, real helpers and pointer pushes; a real rebuild, update, reset or
  move and their timings; a real call (ElevenLabs, LiveKit, the server's
  voice: nothing reached, no paid call), sound heard.
- Side by side with the Mac: every measure read from the Swift; the
  symbols drawn by eye.
- Windows, Safari, Firefox, a screen reader, Reduce Motion, a touch
  screen; a Mac's browser (⌘ keys: Control was pressed, on Linux); a real
  Windows keyboard (Chromium was told it runs on Windows); the window
  really going behind (a headless page always has the focus).
- Leaving the page with a call on; words outside Latin-1 pasted into the
  screen.

**Next:** step 6, Connectors and Settings.

### 2 November 2026: step 4, the agent's pane, search, New Agent, the org chart and starter packs

The founder: "Go on with step 4". Part a, the pane's frame and the
window's model, was written first by the session on the branch
(`6c9041df3`), with a place for each other part: a file for each of its
screens, and a section of the store each (`fbde101e8`). Parts b to e were
then written at once, each in its own slim checkout of the branch (`git
worktree` with a sparse checkout, in the session's scratchpad), each with
its own files and its own section of the store. Each was read by a second,
independent reviewer against the Mac's Swift and the core, and checked in
Chromium. They were merged into this branch one by one, and what the
reviews found was fixed after the merge (below).

**4a: the pane's frame and the window's model** (`6c9041df3`)

- `src/window/windowModel.ts` (MainWindow.swift's `WindowState`,
  AgentPane.swift's `PaneState`): the window's own state beside the store,
  shared through `WindowContext`: the agent asked for, the org chart,
  search, New Agent, the hidden agents; the pane open or closed, its width,
  its page, a flight's details, the avatar editor, a routine asked for.
  The actions "/" and ⌘K share run through it (`runAction`: Org Chart,
  Channels, Chat Settings, Members, Open Hidden Agents).
- `src/window/AgentPane.tsx` and `.css` (AgentPane.swift): the pane beside
  the chat. It folds an open sidebar as it opens and opens it again as it
  closes; it slides over 0.24 s, its page lingering while it shuts; its
  edge drags it from 280 to 480 and closes it below 244; Escape closes it.
  The top bar with Close; the head (the avatar's button with its pencil,
  the name, the title); the tabs with the sliding thumb (Profile and
  Routines; Computer for a group); Profile: Name, Title and Description,
  each saved as it lets go of the keys, Escape putting the words back; the
  Chief of Staff's title and description read only; Notifications. Its
  colours are its own, light and dark (moved from `FlightCards.css`).
- It opens from the chat's picture and name ("View agent settings"), the
  thread's title ("View conversation details"), Edit Profile in a row's
  menu, the joined card's View Profile, ⌘⇧, (Settings), ⌘⇧I and ⌥⌘B
  (details), and "/" (Chat Settings, Members, Channels). "/" also offers
  Org Chart and Open Hidden Agents behind the Mac's gates: the agent
  network on, some agent hidden. A flight's details moved into the pane
  (`FlightPage`); `FlightPane` and the store's flight state are gone.
- The sidebar's head has Search and New Agent (40 discs), and the rail's
  foot the same: ⌘K and ⌘⇧F open search, ⌘N New Agent.
- The store ("Step 4's agent's pane"): `saveProfileField` (the title sent
  only when it is the field changed; shown at once, a refusal putting the
  roster back quietly), also used by renaming a row; `setNotify`
  (`setAgentNotifyOnUpdates`); the gates "/" and ⌘K share
  (`agentNetworkEnabled`, `channelsAvailable`), read without waking a
  resting computer.

**4b: the avatar editor and New Agent** (`0d4fa8e1f`)

- The core's choices (SimeonCore's AgentVoices.swift, AgentFaces.swift,
  AgentDraft.swift, AvatarCrop.swift): `src/core/agentVoices.ts` (a name's
  gender from the core's own lists, imported, not copied; the voice an
  agent gets: Simeon's for the Chief of Staff, else the one fewest agents
  have of its name's or its face's gender, a tie by the Mac's hash); the
  end of
  `src/core/faces.ts` (the face worn, given and own, picked, Reset,
  Shuffle, and the voice that follows a face of the other gender);
  `src/core/agentDraft.ts` (a new agent before it exists);
  `src/core/avatarCrop.ts` (the crop on the 96 stage, the picture drawn
  down to 1024, the 25 MB check, the editor's words).
- The store (4b's section): the voices (`proxy/v1/voice/voices`, kept ten
  minutes), one given and saved to each agent without a listed one;
  `setAgentVoice` (shown at once, put back when refused); `wearFace`,
  `shuffleFace`, `resetFace` (the face's bytes, then the face kept on the
  agent, a voice of its gender with it); `setAvatarImage`;
  `generateAvatarImage` (`POST proxy/v1/images/generations`,
  `{prompt, size: auto, quality: low}`); `createAgentFromDraft`
  (`createAgent` as the core sends it, then the picture).
- `src/window/AvatarEditor.tsx` and `.css` (mac/Simeon/AvatarEditor.swift):
  the card 294 wide, 6 under the avatar and centred on it; Reset only
  while something else is worn; a group has no Faces:
  - Faces: Woman and Man, Shuffle, the faces five a row (36, ringed when
    worn); Voice, its list, and the play button;
  - Generate: the field, Generate (⌘Return, Control-Return elsewhere),
    "Generating…" with the disc breathing, then the crop;
  - Upload: the dashed drop zone and Browse files, then the crop (the 96
    stage dragged, the slider from 1 to 5, Restart and Set avatar); ⌘V
    outside a field pastes a picture there;
  - Escape closes it, the voices' list first; so does a click outside.
- `src/window/NewAgentSheet.tsx` and `.css` (NewAgentSheet.swift): 440
  wide; the face at 120 and Edit, both opening the editor under the face;
  Name and Title (60 characters each), Return in Title creating; Create in
  the blue, grey with no name, the spinner while the agent is made;
  refused, "Couldn’t create the agent. Try again." in red; made, the sheet
  and the pane close and its chat opens, as on the Mac. Escape and a
  click outside close the voices' list, then the editor, then the sheet.
- Before committing, the ports were run on 1,374 cases against the core's
  own code (SimeonCore built with Swift 6.2.1 on Linux in the session's
  scratchpad): the same answers; a sample is the fixture
  (`fixtures/avatar-core.json`).

**4c: an agent's routines and a routine's editor** (`ae86b16f1`)

- `src/core/routineTriggers.ts` (RoutineTriggers.swift, itself the shipped
  window's own functions): a schedule read, written and worded (cron
  lines, `@daily`, `@every 30m`, `CRON_TZ=`; "Every 15 minutes on
  weekdays, 9:00 AM – 5:45 PM"); the Frequency picker and Advanced's grid;
  when a run was ("Yesterday at 7:43 AM"); the event rows (Slack, Git,
  Teams, Linear, Sentry, PagerDuty): what each saves as (nothing while it
  isn't right) and its sentence.
- `src/core/routines.ts` (Routines.swift): a routine and its runs; its
  line (the host's words in English, the editor's own sentence in another
  language, "Paused"); the saving rules. `src/core/routineEditing.ts`
  (RoutineEditing.swift): nothing sent while typing, a field saved as it
  lets go of the keys, a new routine made once whole and later edits sent
  after it, a row put back when its popover closes unfinished; Test run's
  wait (until its run has ended, then 3 seconds).
  `src/core/routineTesting.ts`: a stand-in host, as the core's demo.
- The store (4c's section): each agent's list, kept only when it changed;
  load, create, update, pause (shown at once, put back when refused),
  delete and Test run, as StoreAgents.swift sends them
  (`getAgentAutomations`, `createAgentAutomation`, `updateAgentAutomation`,
  `setAgentAutomationEnabled`, `deleteAgentAutomation`,
  `runAgentAutomationNow`); the host's `agents-automation` pushes.
- `src/window/RoutinesPage.tsx` (RoutinesPage.swift): Routines (New
  Routine; rows 48 high with the green clock, the blue spinner while a
  run goes or the grey pause sign; active first; the empty state with
  Create Routine); a routine's editor over the whole pane: Back to
  Routines and Close; Active, Delete and Test run ("Running…"); Name,
  Instruction, When to run, Run history (each run's time, again every 30
  seconds, its sign, its detail under the pointer). Escape in a field
  closes the pane, the field saved.
- `src/window/RoutineTriggerCard.tsx` (RoutineTriggerCard.swift): When to
  run, a row per trigger (the clock or the source's logo, its sentence, ×
  under the pointer), Add trigger (eight at most); the popover under its
  row, with each source's fields; the Mac's menus: the Add menu (On a
  schedule › Cadence › the 96 times, then the six sources), a choice's
  list with the chosen one over its pill, ticks that stay open (months,
  days, Git's events). The logos are the Mac's asset catalogue's,
  imported. `Routines.css`: the colours light and dark, every measure.
- `ChatPane.tsx`: a "Created routine" chip opens the pane on that routine
  (`openRoutineFor`); three or more are a count whose menu lists them, as
  the Mac's `RoutinesLine`. The "@" list's routine rows were checked
  against the Mac's: nothing missing.

**4d: search (⌘K), an agent's channels and a group's members**
(`33ec877ec`)

- `src/core/jump.ts` (Jump.swift): the matching (accents and case off,
  letters in order and near together, a word's start worth more), the
  query's letters in bold, what each tab lists and in which order, the
  hidden agents last and only for words, the open chat's links.
  `src/core/search.ts` (Search.swift's Mac half): a message, a file and a
  routine as the computer finds them (`searchAgents`, `searchMedia`,
  `listAllAutomations`); "Theo to you · 5m ago". Both were run against
  SimeonCore's own code on 144 inputs (accents, ligatures, other scripts,
  emoji, odd addresses): the same answers.
- The store (4d's section): `globalSearchEnabled`, `searchMessages`,
  `searchFiles`, `allRoutines`, `loadUntil` (a found line's older pages
  read in, 20 pages or 30 s at most).
- `src/window/searchState.ts` (SearchPanel.swift's `SearchState`) and
  `SearchPanel.tsx` and `.css`: the window dimmed; the panel 640 wide, the
  field, the tabs (the computer's four only while its search is on); rows
  60 high (the query's letters at 600, "Hidden", a routine's date; ⌘
  held: each row's keys); five grey rows while the computer answers, "No
  results", "Search unavailable". The computer is asked 150 ms after the
  last key; ↑ ↓, Tab, ← → with nothing typed, Return, ⌘1–⌘9, Escape; ⌘F
  waits under search. A click outside closes it.
- A message or a file found opens its chat at that line, its older lines
  read in first, brought to the middle and lit in the yellow
  (`useSearchReveal`, ChatPane.swift's `pendingReveal`). On the way, step
  2's jump was fixed: a row far up the chat (a found line, a quote) was
  taken back to the newest by the smooth scroll's first steps.
- Channels (`src/core/channels.ts`, `src/window/ChannelsPage.tsx`;
  Channels.swift, ChannelsPage.swift): a row per platform (+, the green
  tick, the spinner, Reconnect, Coming soon), "…" with Refresh and
  Disconnect, + opening the token's field in the card; read when it
  shows, every 4 s after each answer, and when the window comes forward;
  `connectChannel`, `refreshChannel`, `disconnectChannel`, each given up
  after 15 s.
- A group's members (`src/core/groupMembers.ts`,
  `src/window/GroupMembers.tsx`; GroupMembers.swift,
  PaneMembersFlight.swift's `GroupMembersBody`): a row each, Remove under
  the pointer, Add Member and its menu, "Groups can have up to 6
  members."; a row opens that agent's chat. Remove asks in the window's
  alert, "Removing..." with both buttons waiting (`busy`, new in
  `Dialogs.tsx`); `setGroupMembers` shown at once, put back when refused.

**4e: the org chart and starter packs** (`75d47eedf`)

- `src/core/agentNetwork.ts` (AgentNetwork.swift): the links (a group to
  each member, dashed; two agents that have messaged each other, solid); a
  link's light (both ends working: talking; either changed in the last two
  minutes: recent); each agent's state and words; the count line ("5
  agents · 1 group · 3 message links"); the force layout (300 rounds,
  fitted, never enlarged); zoom (1 to 3) and pan; the conversation between
  two agents (their last 30 messages to each other). The store:
  `networkExchange`, the first agent's last 200 lines, read without
  opening its chat or waking a resting computer.
- `src/window/OrgChart.tsx` and `.css` (OrgChart.swift), in the chat's
  place: the head ("Org chart" over the count line, ×), the canvas, the
  foot; a node 120 wide (the picture with the sidebar's dot, the name,
  its line, green while it works); a line solid or dashed, darker when
  recent, green with a spark running along it while both ends work; the
  wheel zooms about the pointer, a pinch five times as fast, a drag pans,
  a double-click puts it back; the nodes glide to new places; the card
  (312 wide, in from the right) for an agent or a group (About, its
  members, its last activity, Open chat or Open room), a group and a
  member, or two agents and their messages ("Couldn't load this
  conversation." with Retry). Escape closes the card, then the chart.
  Less motion: no spark, no glide. The lines are named for a screen
  reader, not in the Tab order, as on the Mac. No sidebar row is lit while
  the chart shows (the Mac's `RowGround`).
- `src/core/starterPacks.ts` (StarterPacks.swift): the server's pack
  (`packs/{id}`); an id (1 to 64 of a–z, 0–9 and "-"); its section
  (`pack-<id>`); the app's link (`<scheme>://app/v1/pack/add?id=`, for the
  Windows app); the web app's own address (`?pack=`); each member's
  `createAgent` (speaking first, `origin: user`, a nonce). The store (4e's
  section): `addPack` (the five made one after another, then a section at
  the top named after the pack), and the sheet as MacServices.swift asks
  it (`askPack`, `addAskedPack`, `closePack`): a team already added only
  opens; an answer after the sheet closed or a sign-out is dropped.
- `src/window/StarterPackSheet.tsx` and `.css` (StarterPackSheet.swift):
  the sheet 720 wide; the five faces, the title, the summary, each agent
  (its face, name and job, what it does, its apps' icons); Add to Simeon
  across the foot (Adding…), Open “Coffee Shop Team” once added; "Couldn't
  open this team" with why. Return adds; ×, Escape and a click beside it
  close, not while it adds. Added, the first agent's chat opens.

**Putting the parts together**

- Merged as they were done: 4e, 4d and 4b (`a1e211385`, `e264c6dad`,
  `ee3404101`), then 4c (`328b932a5`). One conflict: the store's imports
  (`./agentDraft`, `./agentNetwork`, `./agentVoices`, in one place), all
  three kept in order; then 511 tests, typecheck and lint clean.
- Part c's writing was stopped mid-way by an interruption, not a failure.
  The session committed its last finished edits (`a9229282b`: a routine's
  menus give the keys back to what had them; the Months, ticks and Git
  events menus 180, 180 and 200 wide, the Mac's; in a narrow chat the
  "Created routine" chips share what is left; "Just now" for a run begun
  since the last tick), then merged it.
- An agent opened from search or the org chart's Open chat lets the
  sidebar's picked rows go, its own row the anchor, as on the Mac
  (`selection.plain`), through the window's model (`openChat`,
  `sidebarPlain`; `50836f17c`). 4d had left it for the merge; 4e's
  reviewer found it too.
- The website's policy for the app's window lets sound come from any
  https address (`media-src … https:` in
  `clients/apps/web/next.config.mjs`, as `img-src` has), so the voices'
  samples play (`78ae8a350`, proposed by 4b): they are ElevenLabs' own
  links, whose host varies. A sound file can't run code.
- A routine found by search says when it runs through the routines' own
  reader (`routineFrom`: the computer's words in English, the routine's own
  sentence in another language), as the Mac's search uses
  `Routine.summary` (`ba876f35e`). Until 4c was in, it said the computer's
  English words.
- The org chart's fixture (`fixtures/network.json`) put in the app's
  formatting, the core's data unchanged (`198512273`).

**What the reviews found, and what was done**

- 4b (`3b013f537`):
  - New Agent: a click on the dimmed window while the avatar editor was
    open closed the whole sheet, losing the name, the title and the
    picture; the Mac's sheet waits while the editor is open. Now the
    dimmed window leaves a click the editor took, and with the voices'
    list open a click outside closes only the list;
  - Return where no field takes it now creates (the Mac's Create is the
    sheet's default button), not while the editor is open;
  - Escape while letters are composed (Japanese, Chinese…) is the field's
    (`isComposing`, or key 229 in Safari), for every sheet;
  - in a development build (React's strict mode) the pane's editor was
    left closed and Generate skipped its crop: it opens again as it
    mounts;
  - ⌘V with the zoom's slider focused now pastes; "Loading voices" is
    announced; a draft's picture is made a data address once; two
    comments corrected.
  - Clean, per the reviewer: the commands, the crop, the choices, the words.
- 4c (`d5a38a6e5`; its builder was stopped by an interruption before it
  reported, so the session checked and committed its last three finished
  edits, `a9229282b`, and the review ran on both):
  - a click outside a trigger's popover or a routine's menu also did what
    it clicked (Back, Delete, Test run, Active…): the popover's own
    listeners went with it before the click came. The Mac's catcher and
    AppKit's menus swallow it; now the window does, apart from the popover;
  - the routine pills shared a class with the sidebar's Retry
    (`pill-button`), and the sidebar's rule won: 13 round, 12 a side, 12
    pt. They are `routine-pill` now, and Retry is its own again;
  - the "N routines" chip's list, opened from the keys, opened at the
    window's corner: it opens under the chip;
  - a field's blur that is the window's (another app or tab came forward)
    saved the half-typed name, instruction, channel or schedule; now it
    waits for the field to really let go, as a Mac field keeps its focus
    while the app is in the background (the Profile fields too);
  - Name and Custom: the words 10 in, the hairline inside that 10.
  - Left: a Select's menu opens with its panel holding the keys, not its
    ticked row (the reviewer wasn't sure the Mac's does otherwise).
  - Clean, per the reviewer: the three core files line for line with the
    core's fixtures, the commands and their arguments, the editor's rules
    (nothing sent while typing, a new routine made once whole), Test
    run's waits, the store's edits outside its section.
- 4d (`91019aeb7`):
  - with a history, search took 400 to 750 ms a listing (measured in Node
    22), about a second a keystroke: a new `Intl.Segmenter` for every
    character, the labels normalized again, the listing made twice. Now
    one segmenter, the normalized texts kept, the listing made once per
    change: 5 to 25 ms a keystroke for 150 snippets;
  - a found line far back was missed while the chat was itself reading an
    older page: `loadUntil` waits for it (a test fails without);
  - a jump that ended at the newest line left the chat unpinned: once its
    scroll ends, the chat holds the newest line when there
    (ChatPane.swift's follow);
  - a click on search's panel took the keys from its field; after a
    refusal, Remove's question lost its keys and its words: both fixed;
    the Connecting ring 17 across, as SwiftUI strokes a 15 circle; a found
    message opens its chat through `choose`, as the Mac's reveal does.
  - Clean, per the reviewer: the matching, the keys, the commands, words.
- 4e (`bed44c881`):
  - Open chat left the sidebar's picked rows: done at the merge (above);
  - a press let go outside the chart, then a press from outside dragged
    in, still panned (`3b8ae0fbe` had been tried on the sidebar's edge,
    which never reached the chart): a press let go anywhere is now over,
    and a lost pointer capture ends a drag;
  - a pack read with no answer said the browser's "Failed to fetch" in
    every language: now "Simeon can't be reached. Check your connection
    and try again." (the core's catalogue);
  - the card's shadow cut at the chart's foot, a picked line easing to
    blue, a band in the unlisted author's mark, a second copy of a group's
    members: fixed.
  - Left: a touch screen and Safari's pinch (Not checked, below).
  - Clean, per the reviewer: the core files, the calls, Add's order, the
    keys.

**Found in the Mac's and the core's code** (proposed, for the founder):

- A refusal keeps its command's name: "setAgentAvatarBytes. Try again in
  a little while." for a refused picture, "Couldn't create Arlo:
  createAgent: Not now" for a team, on the Mac, the iPhone and the web.
  Proposed: the core's plain words take a command's name as internal,
  bare or after a colon, so the screen's own line shows.
- The Mac's voice field keeps the old voice's name after a face of the
  other gender changed the voice; the web names the agent's voice. ⌘V
  doesn't paste into New Agent's editor on the Mac, though its drop zone
  says "paste"; the web pastes. Two comments say otherwise than the code
  (Reset "back to the face the agent was given"; a face cell "(40)",
  drawn 36).
- A routine's popover draws "at", "on", "every", "in", "from",
  "containing", "between", "and", "tenant", "channels", "cycles", "for"
  and Advanced's "minutes" and "hours" as plain text
  (`Word(_ text: String)`): English in every language. Proposed:
  `String(localized:)` and the catalogue; the web follows.
- The Mac's Run history reads "In 1 min" for a run begun since the last
  tick (the web: "Just now"). A routines list the computer can't read shows
  nothing, not even New Routine; Teams' one event choice ("New message in
  channel") does nothing. Both ported as they are.
- A routine found by search doesn't open the routine on the Mac; the web
  opens it. Search, and the Channels page every 4 s, read with calls that
  wake a resting computer, so a pane left on Channels keeps it awake (the
  web the same). The core has two searches (Jump.swift, the Mac's;
  Search.swift's, the iPhone's) that match and word some things
  differently. The Mac's search takes Control-1 to 9 but always reads ⌘.
- The Mac's "/" offers Open Hidden Agents and does nothing when it is
  picked (Composer.swift's `run` has no case for it); its ⌘K opens the
  list. The web opens it from both.
- When Add made nothing, the Mac's starter-pack sheet shows whatever
  problem the store holds (`problemShown`), even an older one; the web
  says this Add's last refusal. The Mac's `DeepLink` accepts
  `https://app.simeonlabs.com/sand/link/v1/pack/add?id=`, which nothing
  serves (the website's not-found page).

**Tests:** 633 (61 files), from step 3's 369 (40): part a's 22
(`windowModel.test.ts`, `paneStore.test.ts`); 4b's 53 (the core's
`AgentVoiceTests`, `AgentFaceTests`, `AgentDraftTests`, `testCrop`,
`testAvatarEditorWords`, and `avatarCore.test.ts` against the core's own
answers); 4c's 120 (the core's `RoutineTriggerTests` from
`fixtures/routine-triggers.json`, its routine editor and editing tests);
4d's 46 (the core's `JumpTests`, the Mac's half of `SearchTests`,
`ChannelsTests`, `ChannelCallTests`, the members half of
`PaneMembersFlightTests`, search's state); 4e's 22 (the core's
`NetworkTests` against `fixtures/network.json`, made from the window's own
functions, `StarterPacksTests`); and each part's store commands against
the stand-in computer. The merge and the reviews added the sidebar's
picked rows let go, a far line read while the chat reads an older page,
and a pack read with no answer.

**Checked:**

After the merge, on one build of the merged branch (`9640e1fb1`, whose
code is `d5a38a6e5`'s), every check ran again in Chromium, light and dark,
then French: step 4's nine scripts, and steps 3b and 3c's, the cards', the
flights' and the shop's, so nothing step 4 changed in the window broke an
earlier screen. Every outside address answered by a stand-in. No page
errors.

- Three scripts were brought to step 4's markup; the app was not changed
  for them: 3c's joined card has two buttons now (Go to Chat, View
  Profile); the flights' checks find a flight's details in the agent's
  pane; 4d's refused removal draws no empty message line.
- The addresses a card opens on purpose (a cloud agent's pull request,
  the shop's and Link's pages, an airline's logo) were caught as they
  opened, as each script expects.
- 4c's fixes on this build (and `4c-through.cjs`, written for them): with
  the Add menu open, Delete pressed only closes the menu (nothing sent);
  with Frequency's menu open, Active pressed only closes the menu (the
  popover stays, nothing sent); with a trigger's popover open, Delete
  only closes it, and the name field under a click outside doesn't take
  the keys; with nothing open, Delete deletes. "3 routines" opened by
  Return lists its three under the chip (at its left edge, 4 below it;
  `4c-chipkeys.cjs`), by the pointer at the pointer. The keys back on the
  pill after a menu ("routine-pill Frequency"); in a 388-wide pane a
  popover's sentence ("Issue status changed with status s1 in All
  projects for ENG") fits inside it. In French the routines read their
  own sentences ("En semaine à 08:00", "Toutes les 15 minutes en semaine,
  09:00 – 17:45", "En pause").
- In French, a routine found by search reads "Every Monday at 9:00 AM":
  the stand-in routine carries only the computer's English words, with no
  trigger to word, and the Mac shows the same.
- The committed build (`clients/apps/web/public/app-next`) made again from
  this code (`54775ac3a`); `pnpm test`'s check of it passes. The
  inventory: the web app now shows 1,149 of the catalogues' 3,164 strings
  (702 after step 3).

Before the merge, each part on its own branch, in Chromium against
stand-in servers and computers (the session's scratchpad: `4a-check.cjs`,
`4b-check.cjs`, `4c-check.cjs`, `4d-check.cjs`, `4d-check-none.cjs`,
`4e-check.cjs`, `4e-close.cjs`, `4e-spark.cjs`, `4e-press.cjs`; every
outside address answered by a stand-in, nothing reached), light and dark,
then French (every word from the catalogues). No page errors in any run.

- 4a (the build of `fbde101e8`): the sidebar folding into the rail as the
  pane opens and back as it closes; the pane 480 wide in a 1440 window;
  Name and Title sent `updateAgent` as the Mac sends it, the chat's head
  showing the new name at once; Escape in Description sent nothing;
  Notifications sent `setAgentNotifyOnUpdates`; Simeon's title and
  description read only; the edge held at 480, past 244 closing;
  Control-Shift-I, Control-Alt-B and Close; View Profile and Edit Profile
  on the right agent; at 900 wide the pane 388 and the chat 424.
- 4b: the editor under Iris's avatar (294 wide, her face ringed); Iris
  given Amanda's voice and saved; a face sent as its bytes
  (`setAgentAvatarBytes`), then `updateAgent` with `avatarShape`; Shuffle
  with Michael's voice; Reset on Nina's own picture; a voice refused and
  put back with "Couldn’t save the voice."; a sample played, a missing one
  greyed. Upload: a photo zoomed and dragged, Set avatar refused (the crop
  kept), then a 256 by 256 PNG with its pixels where the crop put them; a
  drop, 26 MB, a text file and a paste each with its line. Generate: the
  stand-in asked once with `{prompt, size: auto, quality: low}`, refused
  (402), thrown away when Upload was chosen, saved when the editor closed
  meanwhile. New Agent from Control-N and the compose button: closed with
  nothing made, refused with the Mac's line, then `createAgent` with the
  name, "Bookkeeper", the face, Michael's voice, speaking first,
  `origin: user` and a nonce, then the picture; Leo's chat open.
- 4c: the list (active first, the running one's spinner, "Paused", the
  empty state; one that can't be read: nothing); a new routine: nothing
  sent while typed, then one `createAgentAutomation` from the Add menu ›
  On a schedule › Cadence › Every day › 9:00 AM (`0 9 * * *`,
  `isEnabled: false`); Test run: "Running…", the run "Just now", "Test
  run" again 3 seconds after it ended; Delete with no alert; schedules
  saved as `0 8 * * 1`, `15 9 * 1,3 5` and `*/30 * * 1,3 3`; Custom's
  wrong line put back by Escape and `@every 45m` saved trimmed; Slack's
  reaction saved as `{kind: reaction, emoji: [eyes, +1], bySelf: true}`,
  Git's events in the window's order, Teams not saved until a tenant and a
  team, six rows as one group, none added at eight; the refusals; the
  host's pushes; the chat's chips opening their routines; a 388-wide pane
  and a short window; French with its own times ("Toutes les 15 minutes
  en semaine, 09:00 – 17:45"), the connecting words English, as on the Mac.
- 4d: Control-K on All; the panel 640 by 528 in a 1280 by 900 window, 528
  by 448 in a 560 by 520 one; the agents, then the actions, nothing of
  Settings; Ctrl 1 to 9 with Control held; "th" finding Theo, messages
  with "Th" in bold and the routine; the grey rows, "No results", each tab
  by keys; closed by Escape, Control-K, a click outside and the sidebar's
  Search; a message far back opening Theo's chat with two older pages read
  in, the line in the middle and lit; a link in a new tab without
  `opener`; a routine on its agent's Routines; the hidden Scout with
  "Hidden"; the computer's search off, and failing. Channels:
  `connectChannel` with the token (never in the page's HTML), Connecting,
  then "Nora Bot" with the tick; Refresh, Disconnect, a refusal,
  Reconnect. Members: Iris added, Theo removed ("Removing..." with both
  buttons off), a refusal kept in the alert, no Add Member at six.
- 4e: "/" then Org Chart, not offered with the network off; "5 agents · 1
  group · 3 message links", the dots, the dashed and solid lines, the
  talking one with its spark, no sidebar row lit; each kind of card, a
  refused conversation and Retry; the wheel (1.82 times), a pinch as
  Control-wheel (1.22, the page not zoomed), a drag, a drag from a node
  opening no card, a double-click back over 0.24 s; Escape: the card, the
  chart, then Simeon's row lit and the field with the keys; 32 agents and
  42 links (no two nodes closer than 40); less motion. A pack
  (`?pack=coffee-shop`): `pack` gone from the address at once, the five
  agents with their apps, Adding…, five `createAgent`s, the section
  "Coffee Shop Team" at the top, Bruno's chat open; again: Open “Coffee
  Shop Team”, nothing made; refused; unknown (`?pack=nope`) with the
  server's sentence ("Cette équipe n’est plus disponible."); a short
  window.
- Each part: its tests, typecheck, lint and formatting, the words' check;
  `check_translations.py` and `check_names.py` on a full tree of the
  branch with the part's files (a slim checkout lacks the files they
  read).

**Not checked:**

- Against the real computer, server and services (the address is not
  live yet): the host's answers to a face's bytes and the 256 PNG, the
  real voices and their samples, a picture generated; real routine runs,
  pushes and Slack, GitHub, Teams, Linear, Sentry and PagerDuty events;
  Discord and Slack channels (no token went anywhere); the agent
  network's real answer, five agents made speaking first at once, the
  server's packs live; a real site's icon in search.
- Side by side with the Mac: every measure was read from the Swift. Drawn
  by eye: the symbols, the slider, the spinners, the menus' headings and
  ticks, the spark's glow, SwiftUI's shadows, CSS's round corners for
  Apple's continuous ones, Create's capsule for macOS's glass.
- Windows, Safari and Firefox (Safari's pinch is a gesture, not
  Control-wheel; `:has()` needs Firefox 121), a touch screen (one finger
  pans, a pinch does nothing), a screen reader, an input method composing
  in the fields, Reduce Motion.
- The ⌘ keys on a Mac's browser (Control was pressed, on Linux), and
  Control-1 to 9 in a browser with tabs; a real drag of a file from the
  desktop and a real paste from the system's clipboard; HEIC and very
  large photos.
- Whether the Mac's node opens its card after a drag that began on it;
  what the Mac does when another overlay opens over a routine's popover
  (its `overlayOpened` closes it; on the web it stays, under search).
- The Profile and routine fields keeping their words when another window
  comes forward (the fix reads `document.hasFocus()`, which a headless
  browser always answers true).

**Next:** step 5, the computer and calls.

### 2 November 2026: step 3, parts b to d, the rest of the cards

The founder: "Please do all of step 3", then "Make no mistake taje ur time".
The three parts were written at once, each in its own slim checkout of the
branch (`git worktree` with a sparse checkout, in the session's
scratchpad), each with its own group of files, so they couldn't touch each
other's work. Each was then read by a second, independent reviewer against
the Mac's Swift and the core, and checked in Chromium. They were merged
into this branch one by one, and what the reviews found was fixed after
the merge (below).

**3b: the cards that ask the person for something**

- `src/core/requestCards.ts` (SimeonCore's Chat.swift `RequestCard.secret`
  and `.computer`; CloudComputer.swift's `HandoffCardState`,
  `HandoffOutcome`, `BoxStatus.Handoff`; UserForm.swift's `UserFormCard`;
  OnePasswordCards.swift's `CredentialRequestCard` and
  `OnePasswordConnectCard`):
  - a secret: its name ("A secret" when it has none), why, kept
    (`secretProvided`) or declined (`widgetDismissed`);
  - the computer handed over: its request, its words, how it ended
    (`boxResolution`: Done, Answered, Skipped, Canceled, and every word the
    engine writes), waiting while the line has no answer;
  - the in-chat form: title, site, instruction, each field (ten kinds; a
    password or a code always masked, a checkbox never required), trimmed
    as the core trims, a field it can't read left out, no form without a
    title, a site or a field; Fill in waits on every field it needs; what
    is sent (a checkbox "true" or "false"); the pill (Filling in…, Filled,
    Partly filled, Not filled, Dismissed) and each field's line;
  - 1Password's fill card: the login's name, the site, why, the words to
    confirm ("Fill your Acme login on acme.com"), the pill and what went
    in, in a line;
  - 1Password's connect card: why, Connected with the account, Dismissed.
- The store (`store.ts`, its 3b section): `submitSecret`,
  `handBackComputer` (`handBackForeverBox`: I'm done `button`, Skip
  `dismissed`), `submitUserForm`, `dismissUserForm`,
  `answerCredentialRequest`, `dismissOnePasswordConnect`; the secret's X is
  the question's `dismissQuestion`.
- `src/window/RequestCards.tsx` and `.css` (mac/Simeon/Cards.swift's
  `SecretCardView` and `ComputerHandoffCard`, UserFormCard.swift,
  OnePasswordCards.swift): the five cards at the Mac's measures.

**3c: apps to connect, Slack or GitHub for a routine, the cloud agent, a
new teammate**

- `src/core/connectCards.ts` (SimeonCore's Chat.swift `.connectors`,
  `.listenerConnect`, `.cloudAgent`, `CloudAgentInfo`; Store.swift's
  `CatalogApp`, `catalogApp`, `isConnected`, `isComingSoon`; Plugins.swift's
  `AppsComingSoon`; ConnectorIcons.swift; JoinedCard.swift,
  `AgentFaces.standing` and Colour.swift's blend):
  - an app: the names a card gives, the catalogue's app by its title, name
    or id, connected by its name or the catalogue's id, its tools, Coming
    soon by the server's list or the catalogue's word; its icon (the app
    icon, else the brand's logo, else its first letter);
  - Slack or GitHub: the platform and the reason; linked or not;
  - a cloud agent: its state as the core reads it, its badge, the files
    changed, when it is asked again (5 s while it works, 60 s after a
    failure with nothing read, never once done, failed, expired or empty);
  - a new teammate: its title by the roster's name, the face it stands as,
    its colours (16% lighter, 24% darker, 55% darker for Go to Chat).
- The store (3c's section): `loadAppCards` (the connected apps, and once a
  sign-in the catalogue in the app's language and the server's
  `GET apps`), `catalogApp`, `isConnected`, `isComingSoon`,
  `connectedToolCount`, `listenerConnected`, `listenerConnectURL`,
  `cloudAgent`.
- `src/window/ConnectCards.tsx` and `.css` (Cards.swift's
  `ConnectorCards`, `AppLogoTile`, `ListenerConnectCardView`,
  `CloudAgentCardView`, `JoinedCardView`).
- The pictures are read where the Mac's come from, not copied: the app
  icons from `desktop/brand/app-icons` (the same bytes as the Mac's and
  the iPhone's `AppIcons`), the cut-outs from the core's
  `Resources/Faces/Standing`, Slack's and GitHub's logos from
  `desktop/brand/connector-logos`. About 4.4 MB more in the build (232
  icons, 31 cut-outs), each fetched only when a card shows it.

**3d: the flights, a flight's details, the travellers' form**

- `src/core/flightCards.ts` (SimeonCore's Chat.swift `FlightsCard`,
  `FlightOffer`, `FlightLeg`; Flights.swift `FlightText`, `FlightTimes`,
  `FlightWay`, `AirlineLogo`; GroupMembers.swift `FlightPane`;
  FlightBooking.swift `FlightPassengersCard`, `BookedFlight`, `Traveller`,
  `FlightBookingAnswer`): a search and its offers (eight at most), each
  row's times ("2:30pm", "2h40m · 1 stop", "6:40am+1"), a round trip's way
  back; a flight's details (its two ways, each flight's day and number, who
  operates it, the layover, the fare's terms, who sells it); the form and
  each traveller checked as the core checks them (names, title, gender,
  date of birth, an adult 18 on the last flight's day, email, phone with
  its country code, the passport).
- The store (the flight section): `startFlightBooking`,
  `submitFlightPassengers`, `cancelFlightPassengers`, and the flight open
  beside the chat (`toggleFlight`, `closeFlight`).
- `src/window/FlightCards.tsx` and `.css` (Cards.swift's flights,
  FlightBooking.swift, PaneMembersFlight.swift's `FlightPage`,
  AgentPane.swift): the flights card (a row per offer across a wide chat,
  stacked as the iPhone's on a narrow one, each row deciding as
  `ViewThatFits` does); the airline's mark (the logo cut to its edges,
  sized by its shape, lightened on the dark disc, else the initials); the
  details beside the chat (480, down to 280); the travellers' card; the
  sheet (640 by 720) with its menus and the calendar.
- `App.tsx`: the details' column beside the chat, and the sidebar measured
  beside it. `src/window/countries.json`: the Mac's "Issued by" list.
- Before committing, every function was run on the same 275 inputs as the
  core's own code (SimeonCore built with Swift 6.2 on Linux in the
  session's scratchpad): the same answers.

**3d: the checkout and the products**

- `src/core/shopCards.ts` (SimeonCore's PurchaseCard.swift,
  PurchaseApproval.swift's `reason`, ProductsCard.swift):
  - a checkout: the shop, its site and page (https only), the total, what
    is bought ("Linen shirt ×2, Gift wrap"), the Link card that pays, the
    person's other cards, the checkout's picture and the shop's icon,
    Link's test mode, Link or Shop, the flight (read with the flights'
    `bookedFlight`);
  - where it stands, in the core's words (waiting, In progress, Approve
    with Link, Approved · placing your order, Ordered with its number and
    day, Didn't go through, Denied, Expired, Canceled; a flight's paying,
    bank check, booking, Booked, Not booked, Not confirmed); Get the Link
    app and Open Link (Link's pages only);
  - products: each with its picture (https only), name, seller or site,
    price and the price before a sale, stars to the nearest half, the
    rating with one decimal as the Mac's `%.1f` rounds it (half to even on
    an exact half: 4.25 is "4.2") in the person's language ("4,5"),
    Buying and Bought.
- The store (the shop section): `answerPurchase` (shown at once; the card
  picked rides with Allow, never with Deny), `purchaseApproval`,
  `pickPurchaseCard`, `buyProduct`, `keepWatchingPurchase`.
- `src/window/ShopCards.tsx` and `.css` (Cards.swift's `PurchaseCardView`,
  `MacPaymentMark`, `MacLinkByStripe`, `MacCardChooser`,
  `ProductsCardView`): the checkout card, the card marks drawn as the Mac
  draws them, Link's and Shop's marks from the Mac's own asset catalogue
  (imported, not copied), the chooser under the row; the products three to
  a line, or the iPhone's rows in a narrow chat; a product's sheet (780 by
  600).

**Putting the parts together**

- `ChatPane.tsx`: each kind of card at the Mac's widest (`cardCaps`: 640
  for the question, draft, secret, apps, cloud agent and products; 680 for
  the flights; 460 for a new teammate; 520 for the rest), drawn by its
  group's file.
- A card whose line can't be read is one notice in the chat's middle, as
  Chat.swift's `row(for:)`: the message's own words for a checkout,
  products, the travellers' form and a new teammate, else "This message
  can't be shown in this version of Simeon." (`unreadCardWords`,
  `chat.ts`).
- One flight model for both groups: the checkout's flight is the core's
  `BookedFlight`, read and drawn by the flights' code (the shop's copies
  of the times, the initials and the logo's box are gone). Both groups had
  set `.airline-mark` and `.flight-changed` for the whole window, so
  whichever loaded last drew the other's; the flights' rules are now the
  only ones, the checkout's line of what changed is `.checkout-changed`.
- Alerts and sheets give the keys back to what had them when they close
  (`useTakesFocus`, `Dialogs.tsx`). ⌘F, ⌘B and Delete on picked rows wait
  while an alert, a sheet or a viewer is over the window
  (`somethingOver`), as behind a Mac's sheet.

**What the reviews found, and what was done**

- 3b:
  - the 1Password connect card was a dead end: it now says the Mac's
    paragraph on what connecting makes;
  - the browser and password managers could offer to save an agent's key,
    or fill the person's own logins into a form that goes to the agent's
    computer: the secret and the form's masked fields now ask them not to
    (`autocomplete` `new-password` or `one-time-code`, and 1Password's,
    LastPass's and Bitwarden's own "ignore" marks);
  - React writes a controlled field's value into the page's HTML: the
    secret and the form's masked fields are now left to the browser, read
    only when sent and emptied then, so what is typed is never copied into
    the page;
  - a form or fill card that can't be read showed a grey box: now the
    notice above;
  - the lines the Mac gives no height now take the font's own (16 at 13,
    17 at 14, 18 at 15); the form's words field is named by its label; the
    keys go back to Fill after its alert.
- 3c:
  - Slack's and GitHub's Connected tick was white on dark: now cut out of
    the green, as the Mac's;
  - coming back to the tab asked twice, and still asked after Connected:
    now once, and not after; a blank tab closed before the page was known
    stays closed;
  - the cloud agent card asked every 5 s while scrolled away: now only
    while on screen, as the Mac's lazy chat;
  - the app cards' read could clear a newer read's after signing out and
    in: no more;
  - a group without a picture showed its members on the joined card: now
    the plain disc, as the Mac's `AgentPicture`.
- 3d, the flights:
  - a reload, a sign-out or the access cover while the details had folded
    the sidebar left it folded with nothing to open it: the fold is now
    kept under the Mac's name (`simeon.pane.tookSidebar`) and the sidebar
    opens again;
  - the travellers' sheet took the card's tighter letters: no more;
  - the details slid as the window was made narrower: now only as they
    open and shut;
  - a calendar opened years from 29 February started on 1 March: now the
    28th, as the Mac's;
  - the window's keys acted behind the sheet: see above.
- 3d, the checkout and the products:
  - Allow now asks first, in the window's alert, as 1Password's Fill does
    (decisions below);
  - Return in a product's sheet bought even from a button or a link in
    it: now only from the sheet itself;
  - the rating rounded exact halves up: now as the Mac's;
  - the shop's icon was read from the computer for every Link checkout,
    though only Review order wears it: now only then; a checkout picture
    that can't be drawn shows the photo symbol; pages open without the
    referrer; the chooser focuses the card that pays; the card marks in the
    Mac's heavy weight (800).

**Found in the Mac's and the core's code** (proposed, for the founder):

- The Mac's secret card says "Saved securely and kept private." as soon
  as the command returns, even when the computer couldn't keep the secret
  (it answers the same and says so only in its tray). The iPhone and the
  web wait for `secretProvided`. Proposed: the Mac waits too.
- The Mac's window never shows the store's problem line (3a's finding):
  on the web the same, until the trays and alerts (step 6). So a secret
  the computer couldn't keep says nothing on the web either, yet.
- Open on a cloud agent's card goes to `app.simeonlabs.com/agents/<id>`,
  a page that doesn't exist: the Mac's Open lands on the website's
  not-found page. The web leaves Open out (decisions below).
- The core's checks take any character with a number's value as a digit:
  91 Han characters (一, 二, 十…), so 李一 or 健一 is refused as a first
  name on the Mac and the iPhone, while the computer takes it. The web
  does as the core. Proposed: the core checks as the computer does.
- The flight's details join the airports with an English " to " in every
  language ("SEA to LAX" in French), in the Mac's code, not its catalogue;
  "Ms" is marked not to translate. The web does the same.
- A card picked on a checkout and refused by Link never shows Link's line
  on the device that picked it (Mac, iPhone, web): the core keeps the pick
  and drops the line whenever there is one. Ported as it is. Proposed:
  forget the pick when Allow comes back with the card still waiting.
- The Mac's Review order says "Open the computer on the checkout" on a
  Shop checkout too, where it opens the store's page; the web says "Open
  the store's page" (the core's words).
- The Mac's form card puts an empty stack under the head of a dismissed or
  failed form with no note; the web draws nothing there.

**Tests:** 369 (40 files), 114 of them new: the core's `UserFormTests`,
`OnePasswordCardsTests`, `testHandoffCard`, `JoinedCardTests`,
`ConnectorIconsTests`, `CloudAgentTests`, the connectors rows and Coming
soon, `FlightCardTests`, `PaneMembersFlightTests`, `FlightBookingTests`,
`PurchaseCardTests`, `ProductsCardTests`, against the core's own gallery
(`fixtures/flights.json`, from Demo.swift); each group's store commands
against the stand-in computer; the cards that can't be read; the rating's
rounding against C's `printf("%.1f")` (509 values, no difference).

**Checked:** in Chromium, on one build of the merged branch, against
stand-in servers and computers (the session's scratchpad:
`cards-check.cjs`, `3b-check.cjs`, `3c-check.cjs`, `flights-check.cjs`,
`flights-keys.cjs`, `shop-check.cjs`, `shop-extra.cjs`,
`review-check.cjs`; every page a card opens and every outside picture
answered by the stand-in, nothing reached), light and dark, then French.
Each part had also been checked on its own branch before merging. No
page errors in any run.

- 3a again, after the merge: the question, drafts and approvals as in
  part a's check.
- 3b:
  - secrets: Saved and Dismissed as the computer sends them; the field
    masked, Save securely off until something is pasted; Return saves and
    the field empties at once; a secret the computer answers but doesn't
    keep: the empty field again; the X: Dismissed; what was typed is in
    the page's HTML neither while typed nor after (the field's `value`
    stays empty), and the field carries `new-password` and the password
    managers' marks; the same for the form's password;
  - the hand-off: Answered and Canceled with their words; waiting with
    the breathing dot; Skip: Skipped; I'm done: Done;
  - forms: dismissed, failed, filled ("Typed in", "Left empty"), one that
    can't be read as a notice; Fill in off until Email and Password are
    there, then the four values sent (the checkbox "true", the menu "es"),
    "Filling in…", then "Partly filled" with "Couldn't type it in" in red;
    the code refused by the computer in red; the address field growing
    from three lines to six, then scrolling;
  - 1Password: Fill asks in the window's alert (Fill in focused; Cancel
    and Escape send nothing), then Filling in…, Filled; Not now: Declined;
    the connect card with the Mac's paragraph, its X: Dismissed;
- 3c:
  - apps: Connected with "12 tools", Coming soon from the server's list,
    the letter tile, a one-colour logo in the words' colour, a long reason
    cut with its whole as the tooltip; `listServers`, `getCatalog` (with
    the language) and `GET apps` each asked once;
  - Slack and GitHub: Connect opening the linking page in a new tab with
    no `opener`; Connected; in French the card says the agent's reason in
    the agent's own words, as the Mac does;
  - cloud agents: running, error, nothing and refused; asked again 5 s
    later, then Done and not asked again; only View PR, opening the pull
    request; the branch cut in its middle at 512 wide;
  - new teammates: their faces standing on the bottom edge in their
    colours, an own picture round on the grey, an agent gone, Go to Chat
    opening the chat;
- 3d, the flights:
  - the one-way search, the round trip, the test search, the logos cut
    and sized (and lightened on the dark disc), a logo served without CORS
    as it came, a missing one as initials; rows stacked in a 900-wide
    window;
  - the details: opened by a click, Return and Space; the sidebar folded
    to its rail and back; Escape from the page and from the message field
    (a reply over the field let go first); another chat closing them; Book
    with Simeon refused in red, then the form in the chat;
  - after the review: opening slides (0.24 s), a window narrowed to 900
    moves the details to 388 at once; a reload with them open brings the
    sidebar back (320) and clears `simeon.pane.tookSidebar`; behind the
    travellers' sheet ⌘F, ⌘B and Delete on a picked row do nothing, and ⌘F
    works again once it closes; the sheet's letters untracked;
  - the travellers' sheet: Link's details in the first traveller, the
    menus, the calendar by pointer and keys, "The date of birth isn't
    right." under the second, the computer's refusal under the first,
    Continue sending both, the card saved with both names; Cancel, Escape
    and a click outside sending nothing;
- 3d, the checkout and the products:
  - the chooser (Pay with, four cards with their marks, the one that pays
    ticked and focused, Mastercard after picking it), Escape closing it;
  - Allow: the window's alert ("Approve $80.00 at ncvss.com", the items,
    Allow focused); Cancel sends nothing; Allow sends the pick and no
    approval, then In progress, Approve with Link with its two pages in
    new tabs, Approved, Ordered with "Order #1043 · Arrives Thu, Oct 18";
    Deny: Denied, "Nothing was paid."; Link declining: Didn't go through;
    a pick Link refused: the buttons back (without Link's line, as on the
    Mac); a Shop checkout's Review order opening the store's page; the
    card it can't read as "Checkout at oldshop.com · $12.00";
  - the products: three to a line, the sheet (780 by 600), See more,
    More like this in place, Buy: Buying then Bought; Return on the sheet
    buys, Return on View website opens the page and buys nothing; the
    pictures fetched without the referrer;
  - French: every word of all the cards from the catalogues ("Approuver
    $80.00 chez ncvss.com", "Annuler", "Autoriser", "Enregistrer en
    sécurité", "Remplir", "Connecter Slack", "Voir la PR", "Réserver avec
    Simeon", "Acheter avec Theo", "Dans le même genre"…).
- The 369 tests, typecheck, lint and formatting, the words', the brands'
  and the committed build's checks (`pnpm test`), `check_names.py`,
  `check_translations.py`, `web_app_inventory.py`.

**Not checked:**

- Against the real computer, server, Link, Shop, Duffel, Slack or GitHub
  (the address is not live yet; nothing was bought, no call reached
  Stripe, Link or Shop). Real shops' pictures and airline logos
  (stand-ins), and whether Duffel's server lets a page read its logos.
- Side by side with the Mac: every measure was read from the Swift, not
  from a screenshot. Drawn by eye: the symbols (`display`, `lock.fill`,
  the branch and file marks), the ring spinner, CSS's round corners for
  Apple's continuous ones, the joined card's light.
- Windows, Safari and Firefox (Firefox before 125 has no
  `Intl.Segmenter`), a screen reader, a phone's keyboards.
- Whether a browser's password manager still offers to save a pasted
  secret, with 1Password, LastPass or Bitwarden installed; whether Chrome
  keeps a traveller's name, email or phone in its own form history.
- Whether the Mac's sheet puts the caret in its first field when it opens
  (the web's sheet takes the keys itself).
- A resting computer and the checkout's picture waited for.

**Next:** step 4, the agent's pane (which takes in the flight's details),
search, new chat, the org chart, starter packs.

### 2 November 2026: step 3, part a, the question, the drafts and the approval

- `src/core/cards.ts` (SimeonCore's Chat.swift `QuestionCard`, `DraftCard`,
  `RequestCard.approval`; Approvals.swift's `AutoReviewCard`;
  AccountSettings.swift's `AutoReviewInstructions`):
  - a question: its prompt, help, choices (each with its line, the reply it
    sends, recommended or destructive), several at once, its own answer,
    answered, dismissed or skipped; an answer shown by its choices' labels;
  - a draft: an email (a new one or a reply, Cc, files by name) or a Slack
    message, its state (Ready to send, Sending…, Sent, Discarded), the
    addresses typed split as the Mac splits them;
  - an approval: the title, where it runs, the summary said only when it
    says more than the command, the badge, the fold cut at 340 characters,
    the note under Always allow, secrets taken out of the rule, the rule
    added to Auto-review's allowed list (20 at most, 1,000 characters each).
- The store (`store.ts`), as the core's: `answer` (`respondToWidget`, shown
  at once and kept until the computer's copy has it, taken back with the
  core's line when it doesn't reach the agent), `dismissQuestion`
  (`dismissWidget`), `sendDraft` with what was changed, `discardDraft`,
  `resolveApproval` (`resolveAutoReviewApproval`; Always allow writes the
  rule into the computer's settings first and counts as Allow once when
  there is none or it can't be saved; a stale request reads Expired; any
  other refusal says nothing, as the Mac's card).
- `src/window/Cards.tsx` (mac/Simeon/Cards.swift): the card's frame (the
  agent's grey, 16 round, padded 12), the status pill, the two buttons, and
  the three cards at the Mac's measures; `ChatPane.tsx` draws them as wide
  as a message may be (640 for the question and the draft, 520 for the
  approval) and keeps the other cards' places until their parts.
- Tests: the core's approval table (`fixtures/approvals.json`, copied from
  the core: titles, badges, redactions, rules, the shipped cards, Always
  allow's writes), the question and draft cards; the store's commands
  (`cardsStore.test.ts`: an answer shown at once, taken back, kept until
  the copy has it, a dismissal refused, a draft sent and discarded, the
  three approval answers, Always allow without a rule or unsaved, Expired).
- **Found:** the Mac's window never shows the store's problem line (only
  the starter-pack sheet reads it), so a refused answer, dismissal or
  draft on the Mac quietly returns the card to waiting; the iPhone shows it
  in its "Something went wrong" alert. The web does as the Mac for now.
  Proposed for step 6 (Settings and the alerts): the iPhone's alert on the
  web and Windows, and on the Mac.
- **Checked:** in Chromium against a stand-in server and computer
  (`cards-check.cjs` in the session's scratchpad), light and dark, then
  French:
  - questions: the answered card with its blue tick and the dismissed one
    at 60% with its pill, as the computer sends them; the open card's
    choices (blue for the recommended, red for the destructive), the line
    under each, the hover; a choice sends its own reply ("Delete every spam
    email") and shows its label at once, then still once the computer's
    copy has it; several picked (blue rings, `aria-pressed`), Submit, the
    values one per line in the choices' order, shown "Order 1042, Order
    1044"; its own words: the field 30 high, 50 with a second line
    (Shift-Return), Submit only once something is written, Return sends;
    the X (its tooltip, "Dismissed");
  - drafts: Reply with From, To, Cc, Subject, the words six lines high, the
    file by name; Slack's logo, Workspace, To, "New message"; To, Subject
    and the words changed and sent as typed (two addresses split, Cc
    kept); then Sent with its green dot, the fields fixed, no buttons;
    Discard: "Discarded";
  - approvals: the five cards' titles, "Approval needed", where each runs,
    the reason while it waits; Show the command and Hide the command; a
    412-character command cut ("...[72 chars omitted]..."); Always allow:
    the rule added after the one already there, then "Always allowed" and
    its note; a stale request: "Expired"; Deny: "Denied" in red;
  - French: every word of the three cards from the Mac's catalogue ("Ta
    réponse : …", "Ignorée", "Prêt à envoyer", "Abandonné", "Expiré",
    "Refusé", "Toujours autorisé"). No page errors in any run. The 255
    tests, typecheck, lint, the words', the brands' and the build's
    checks, `check_names.py`, `check_translations.py`.
- **Not checked:** against the real computer (the address is not live
  yet); "Sending…" on screen (the stand-in's updates came together, after
  Sent was already set).
- **Next:** 3b, the secret, the computer hand-off, the in-chat form,
  1Password's fill and connect cards.

### 1 November 2026: step 2g, a new account's first run and the access cover

- `src/core/onboarding.ts` (SimeonCore's Onboarding.swift): the name
  step's words, the suggestion (the name chosen, else Google's, never the
  mail), the name as it is saved (60 at most), Simeon's profile, the
  hand-off's line.
- The store (`store.ts`), as the core's:
  - `firstRun()`, the start-up gate: seen when the host says so; else the
    agents counted (and the host told when there are some); a new account
    whose computer was never made, or asleep with agents in the server's
    copy, is told apart without waking or making it;
  - `handOff('web', …)`: the computer asked every 2.5 s (a minute at most),
    the name step waited for, the language told, the name read again by
    the computer (`refreshUserName`), and only then Simeon made, his
    introduction begun and the first run marked done; at least 1.5 s on
    screen; a second try makes no second Simeon; leaving makes none;
  - `namePrompt`, `saveName` (`POST user/name`), `finishNameStep`;
  - `refreshAccess` (`GetSandAccessStatus`, the account's Connect service,
    new on the backend as `dashboard`), `refreshPlan` (`user/quota`),
    `billingPortal`.
- `src/core/access.ts` (Access.swift and Upgrade.swift's `MacUpgrade`): the
  access words for every state and reason, the cover's words for an
  account without a plan (the trial, an ended trial, a card that failed,
  Apple's), and where its button goes.
- `src/session.ts`: the gate after the list (a silent computer asked once
  more after 2.5 s), the `firstRun` phase, `finishFirstRun`, `signOut`;
  `?first-run` forces the first run, as the Mac's `--first-run`.
- `src/window/FirstRun.tsx`: "What should we call you?", the mark, the
  field (Google's name in it, the keys after 0.45 s), Continue dim until
  there is a name; then the line in the window's moving light, "Getting
  your team ready…" once the computer answers; the window on Simeon's
  chat. A failure: "Simeon couldn’t finish setting up", why in red, Try
  again with the keys.
- `src/window/AccessCover.tsx`: the mark and "Simeon" in the wordmark's
  face, the tagline, the account's words and button, "Signed in as …" and
  Sign Out, asked first (Cancel, Sign out in red).
- `App.tsx`: the cover when the account was refused before its computer
  was ever reached, else the first run, else the window.
- Tests: the core's access table (`fixtures/access.json`, all 50), the
  server's numbers, the Mac's cover words and routes, the first run's
  words, the gate (new, known, never made, asleep with a copy), the
  hand-off's order, a sign-out meanwhile, a retry; the session's first run
  and Sign Out.
- **Decisions:** in the table above (Sign Out through the website's own
  sign-out; the cover's pages in a new tab, no charge after the card page;
  the wordmark's face and its licence).
- **Checked:** in Chromium against a stand-in server and computer
  (`firstrun-check.cjs` in the session's scratchpad), light and dark, then
  French:
  - a new account: the screen, "Bastian" from the profile in the field
    with the keys; the computer asked while the name shows, nothing made;
    an empty name: Continue dim, Return does nothing; "  Bass   Fall ",
    Return: "Getting your team ready…", then the window on Simeon (Chief of
    Staff, "Bras droit" in French), the address `?agent=simeon`; in order:
    the name saved as "Bass Fall", the language told ("fr" in French), the
    name read again, Simeon made (`web-onboarding-…`), his introduction,
    the first run marked done;
  - Simeon's making refused once: the failure's three lines, Try again
    with the keys, Return: the window on Simeon, made once;
  - a refused account (`EnsureSandBox` 403, a trial to start): the cover
    in the wordmark's face (loaded), "Start your free trial to send
    messages", Start Free Trial opening the plans page in a new tab, "Signed
    in as bass@simeonlabs.com"; Sign Out asked, Escape keeps it; Sign out:
    the pair dropped, the server told, then the website's sign-out.
  - The sidebar's and the dragging checks again on this build: every step
    as before. No page errors in any run. The 239 tests, typecheck, lint,
    the words', the brands' and the build's checks, `check_names.py`,
    `check_translations.py`.
- **Not checked:** against the real server and a new account's real
  computer being made (the address is not live yet); the website's real
  sign-out and its return; Stripe's card page from the cover.
- **Not done, with the step that brings it:** the hand-off's percentage
  while the computer's image is pulled, and "Waking your computer…" (the
  computer's status, step 5); the browser's notifications, which the Mac
  asks for as its window opens (step 6).
- **Next:** step 3, the cards.

### 1 November 2026: step 2f, part 2, dragging, the rail and the width

- Dragging (`Sidebar.tsx`, the Mac's `ListDrop` and `PinDrop`):
  - a row onto the pins pins it, at the tile it is let go on; with nothing
    pinned, a dashed zone 104 high says "Drag here to pin" while a row is
    dragged;
  - a pin onto another takes its place; onto the list it is unpinned, into
    the section it is let go on, if any;
  - a row onto another section moves it there, with the other picked rows
    when it is one of them (pins stay where they are); its own section
    takes nothing;
  - a section's header onto another puts it above (dragged up) or below
    (dragged down), a hairline showing where; "Unassigned" stays last;
  - where a drop would land greys (the list, a section, the pins, a tile).
- The rail (88): the pictures alone (36 in 54), unread blue and at work
  green on the corner, the pins and then a hairline, hairlines between the
  open sections; picked rows' Delete and Clear under the head; the roster's
  trouble as a glyph with its words as the tooltip.
- `src/window/sidebarLayout.ts` (the Mac's `SidebarLayout`) with its tests:
  320 at first, the edge dragged between 240 and 400 and never leaving the
  chat under 424; under 210 it folds, and from the rail it opens again
  from 220; the rail by itself while the chat would be narrower than 424;
  ⌘B (Control-B) folds and opens it. Kept in the browser.
- `App.tsx`: the edge (12 wide over the hairline), the width as the window
  is resized, ⌘B; folding and opening slide over 0.2 s on the window's
  curve, and the width follows the pointer while dragged.
- **Decisions:** in the table above (the width kept in the browser, ⌘B or
  Control-B, the window's 512; the browser's own dragging).
- **Checked:** in Chromium against the stand-in computer
  (`drag-check.cjs` in the session's scratchpad), light and dark, then
  French:
  - Theo onto the empty pins: the dashed zone, lit, 104 high; pinned and
    written. Nova onto Theo's tile: the grid lit, pinned first. Nova's tile
    onto Theo's: Theo lit; their places changed and written;
  - Nova's tile onto Work: Work lit; unpinned and in Work. Scout onto
    Work: lit, moved. Iris onto her own Work: nothing lit;
  - Clients' header dragged down onto Work: the hairline under Work; then
    Work, Clients, Unassigned, written;
  - the message field empty after every drag;
  - Control-B: the rail (88), the pins, the hairlines, the unread dot
    blue; kept; Control-B again: 320;
  - the edge: 380, held at 400, held at 240, folded under 210, open again
    at 300; the width kept;
  - a window 700 wide: the rail by itself, the chat 612; back at 1280: open;
  - a row picked on the rail: Delete and Clear under the head.
  - Part 1's check again on this build: every step as before. No page
    errors. The 226 tests, typecheck, lint, the words', the brands' and the
    build's checks, `check_names.py`, `check_translations.py`.
  - Found while checking: Chromium's emulated drag (the one Playwright
    drives) sends `dragover` once per drag, so the highlights are also set
    on `dragenter`, which a browser sends at each element crossed.
- **Not checked:** dragging with a real mouse and a trackpad; Safari and
  Firefox (no Firefox in the session; Firefox has been reported not to
  drag a `<button>`, which rows and tiles are: to be tried there, and the
  rows changed to another element if so); the Windows app's keys.
- **Next:** the first run for a new account and the access cover, which end
  step 2. The sidebar's head and foot (search, new chat, the account and
  Connect apps, and the rail's discs) come with their screens in step 4.

### 1 November 2026: step 2f, part 1, the sidebar's pins, sections, menus and picked rows

- `src/core/sidebarSections.ts` (SimeonCore's SidebarSections.swift): the
  sections as the computer keeps them, "Unassigned" always last and holding
  the rest; rename, remove, create, move agents in, move a section; what the
  sidebar draws and its order (the pins, then the open sections' rows);
  several rows picked (⌘ or Control, ⇧, a plain click); the delete
  confirmation's words. `sidebarSections.test.ts` runs the core's own cases
  from `fixtures/sidebar-sections.json` (copied from the Swift tests).
- The store (`store.ts`), each change shown at once and written to the
  computer, a refusal putting back what the computer holds:
  - the pins (`pinnedAgentIds`) and sections (`sidebarSections`), read once
    together, without waking a resting computer, on attaching, on
    reconnecting, and again when another device changes them
    (`settingsChanged`);
  - pin, unpin, move a pin; edit and create sections;
  - Mark as Read and Unread, hide and show, delete (false when refused),
    duplicate (the copy's id), rename (quiet on a refusal, as the Mac's).
  - `sidebarStore.test.ts`: the commands as the Mac's menu sends them.
- `src/window/Sidebar.tsx` (mac/Simeon/SidebarList.swift,
  SidebarMenus.swift, SidebarState.swift):
  - the pins as tiles (the picture 60, the name, the title in blue, the
    unread or working dot on its corner), in as many 80-point columns as
    fit;
  - the rows, or the person's sections: a header (a click folds it, its
    count while folded, the chevron under the pointer), "Drag chats here"
    in an empty one; Hidden Agents at the foot with its count; "No saved
    agents yet." and "All bots are hidden" with Show Hidden Agents; the
    list fading out over its last 24 points;
  - a row: the open one the white card, a picked one the blue wash, the
    group badge, "Draft: …" for words left unsent in another chat; a
    double click renames it in place (Return or leaving keeps it, Escape
    puts it back);
  - the row's menu: Pin or Unpin; Move to with the sections (its own
    ticked) and New section, or Move to new section while there are none;
    Mark as Read or Unread; Duplicate (not for groups or rooms from
    another account), which opens the copy; Copy conversation ID; Hide
    from sidebar; Delete in red. With several rows picked and this one
    among them, Move and Delete act on them all;
  - a section's menu: Rename, Move up, Move down (greyed at the ends),
    Delete; a new section opens with its name ready to type over;
  - picked rows: the head turns into the Mac's bar (Move, Delete, Clear);
    Escape lets them go, Delete or Backspace asks to delete them; not while
    a field has the keys or a menu, an alert or a sheet is open; picking
    takes the keys from the message field, as on the Mac;
  - Hidden Agents (520 by 440): each hidden agent, a click opens it,
    Unhide puts it back; "No hidden bots" when none.
- `src/window/ContextMenu.tsx`: a right-click menu in the Mac's look, at
  the pointer and kept in the window, submenus beside their item, the keys
  ↑ ↓ → ← and Return. `src/window/Dialogs.tsx`: the alert and the sheet;
  Escape reaches them wherever the keys are.
- `App.tsx`: with nothing open, the first agent in the sidebar's order
  opens (the pins first), as the Mac's `chooseFirst`.
- **Found on the Mac:** "Draft: …" and the refused delete's "OK" are
  English there (not in the catalogue); the web app says the same. The
  menus' names for a screen reader ("Agent actions", "Section actions") are
  the web app's own, in English, as the Mac's menus have none.
- **Decisions:** in the table above (where the pins, sections and folds
  are kept; ⌘ or Control and no Control-Tab; Edit Profile waits; the
  window's own alerts).
- **Checked:** in Chromium against a stand-in server and computer that
  keeps the settings and answers each command (`sidebar-check.cjs` in the
  session's scratchpad), light and dark, then French:
  - the tile, Work and Unassigned, the group badge, the working and unread
    dots, Hidden Agents 1;
  - the row's menu and its submenu (Work ticked); Theo moved to Unassigned,
    the sections written whole;
  - Control-click two rows: the bar's three buttons with their counts;
    Escape lets them go; ⇧-click a range of three; Delete: "Delete 3
    agents" with its words, Cancel and Delete in red, Delete with the keys;
    Escape cancels and nothing is deleted;
  - the bar's Move → New section: the field with "New section" chosen,
    "Clients" typed, written at the top with the three agents;
  - the section's menu with Move up greyed; Move down; folding Work: its
    count, kept in the browser;
  - a double click: "Iris B" sent as `updateAgent`; Escape sends nothing;
  - Mark as Unread: the dot, `setAgentUnread`; Pin Nova: two tiles,
    written; Unpin from the tile's menu (no Move to on a pin);
  - Copy conversation ID: "scout" on the clipboard; Duplicate: the copy
    opens (the address and the open row);
  - Hide Scout: gone, Hidden Agents 2; the sheet (520 by 440) with both,
    Unhide Old bot, Escape closes it; Delete Old bot, confirmed; a refused
    delete: "Deleting failed…" with OK; a section deleted: its agents in
    Unassigned;
  - French: every menu, the bar, the alerts and the sheet in French, the
    times on the 24-hour clock; no page errors in any run.
  The 223 tests, typecheck, lint, the words', the brands' and the build's
  checks, `check_names.py`, `check_translations.py`.
- **Not checked:** the Mac and the web app open together on one computer
  (a pin made on one showing on the other); a real computer's answers to
  these commands; Safari and Firefox; the Windows Control-click (Chromium
  on Linux was used, which picks with Control as Windows does).
- **Next:** 2f part 2: dragging (a row onto the pins, into a section, a
  pin to another place, a section above or below another), the rail, the
  width dragged (240 to 400), folding the sidebar and ⌘B; then the first
  run for a new account and the access cover.

### 1 November 2026: step 2e, part 3, dictation

- `src/window/Dictation.tsx` (mac/Simeon/Dictation.swift):
  - the grey microphone in Send's place while there is nothing to send;
    the browser asks for the microphone the first time;
  - while it listens, the recording chip in Send's place (Stop, the time,
    five sound bars from the microphone's loudness, -50 dB silent) and
    "Listening…" in the field; Stop sends the recording to Simeon's
    transcription (`/desktop/api/proxy/v1/audio/transcriptions`, in the
    app's language when it is not English) with a small spinner and
    "Transcribing…"; what was said goes in at the caret through the field's
    own typing (so undo takes it out), a space before it when the word
    before runs on;
  - under half a second is dropped; five minutes stops it; Escape, a
    message sent, or the chat closing drops it, and the microphone is let
    go each time (the browser's recording light goes out);
  - the window's red lines: microphone refused, no microphone, connection
    failed, anything else; gone when the microphone is tried again.
  - The chip's time and bars redraw only the chip.
- The store's `transcribe`, and the stand-in's (`FakeBackend`).
- `src/window/dictation.test.ts`: the lines, the space, the meter, and
  French.
- **Decisions:** in the table above (the recording kind, the session; the
  refused-microphone line, the founder).
- **Checked:** in Chromium with its fake microphone playing a 440 Hz tone
  (`dictation-check.cjs` and `tone.wav` in the session's scratchpad),
  against a stand-in server, light and dark, then French:
  - the microphone shown on an empty field, Send once there are words;
  - the chip, "0:01" and bars rising with the tone, "Listening…"; Stop: the
    spinner and "Transcribing…", then "Book a table for two" in the field,
    which keeps the keys; the request multipart with `audio.webm`, signed
    in, with `language` "fr" in French and none in English;
  - "Hi" typed while listening: "Hi Book a table for two";
  - Escape while listening, and a recording under half a second: nothing
    sent;
  - a dropped connection: "Network connection failed…", gone when the
    microphone is tried again; a refusal (the browser's `NotAllowedError`)
    and no microphone (`NotFoundError`): their lines; no page errors.
  The 212 tests, typecheck, lint, the words', the brands' and the build's
  checks, `check_names.py`, `check_translations.py`.
- **Not checked:** a real microphone and a person's real refusal (headless
  Chromium has no permission prompt: it answers "not supported", so the
  refusal was given as the browser gives it); Safari's MP4 recording and
  Firefox; the real transcription service from `app.simeonlabs.com` (the
  address is not live yet); five minutes.
- **Next:** the rest of step 2, as the entries for 1d and 2a left it: the
  sidebar's own parts (pins and folders, several rows picked, renaming, its
  right-click menu, dragging, the rail and the width), then the first run
  for a new account and the access cover.

### 1 November 2026: step 2e, part 2, "@", "/" and "#"

- The shared core's lists, translated with their tests
  (`ComposerMenuTests`, `testTheComposerOffersNamesAfterAnAt`):
  - `src/core/composerLists.ts` (ComposerLists.swift): the window's
    matching (its own scores, to the hundredth), where a list opens, what
    "@" offers (the other agents and the groups this one is in, or a
    group's members and "everyone"; the routines; the connected apps), what
    "/" offers (skills, then the app's actions, eight at most), what "#"
    offers (the pull requests the chat named, newest first), and the lines
    for nothing found;
  - `src/core/composerMenus.ts` (ComposerMenus.swift): the skills and
    routines in `getAgentWorkflows`' answer, and pull requests in a text;
  - `src/core/composerDocument.ts` (ComposerDocument.swift): a pick's
    words, the picks kept while the words change, and the message's
    document (`richText`) as the window's editor writes it, read back for a
    canceled message;
  - `src/core/connectedApps.ts`: the connected apps (`ConnectedApp`).
- The store reads the agent's skills and routines as a chat opens
  (`getAgentWorkflows`, waiting for a computer that rests, not waking it)
  and the connected apps (`desktopMcp` `listServers`, only while the
  computer is awake).
- `src/window/ComposerPicks.tsx`: one list for "@", "/", "#" and ":",
  hung 4 over the trigger's line: 360 wide (emoji 320), each row with its
  picture (the agent's face, a group's people, a routine's clock, an app's
  logo), its name, what it is at 40% and its kind at the right. "@" and "/"
  with nothing found say so, over "Press Esc to close".
- `Composer.tsx`: a pick goes in through the field's own typing, so undo
  takes it out; it sits on the Mac's grey (a layer under the words, laid
  out as the field lays them out); Delete or Backspace beside it takes it
  whole; a pick in the middle of the words keeps the words after it; a
  message with picks goes with its document; a canceled one comes back with
  its picks; each chat and thread keeps its picks while its words wait.
- **Decisions (the session):** in the table above.
- **Found on the Mac, not changed:** the "#" rows' "Pull request" is
  written in English in every language (the Mac's `PickLine` is given a
  plain string, and the catalogues have no such entry); the web shows the
  same. A routine's time in "@" is the computer's own English words in
  every language on the web until the routines' words come with step 4
  (the Mac writes them from the routine's schedule).
- **Checked:** in Chromium, the built app against a stand-in computer with
  four agents (one a group), two skills, a routine, two connected apps and
  three pull-request links in the chat (`picks-check.cjs` in the session's
  scratchpad), light and dark, then French:
  - "@" listing Nora, Nova, the group "Launch squad · 2 agents", "Morning
    brief · Every day at 9:00 · Routine", "Gmail (work@acme.com) · needs
    auth · Plugin", "Slack · connected"; "no" leaving Nora and Nova;
    Return putting in "@Nora" on the grey;
  - "/" listing "Weekly report · Sums up the week · Skill"; Tab putting it
    in; "#" listing #40, #41, #12 (newest first), "4" leaving #40 and #41,
    ↓ and Return putting in #41;
  - Backspace twice after "#41 " taking the space, then "#41" whole;
  - "@zz" saying "No matches for “zz”" over "Press Esc to close"; Escape
    putting it away and typing on keeping it away;
  - "@nov" typed at the start of the words, picked, the words after it
    kept; undo and redo taking a pick out and bringing it back as a pick;
  - the message sent with the words trimmed and its document: two
    mentions, a skill's reference and the text between;
  - in the group: "everyone" first, then its members and the apps; "all"
    finding "everyone"; "/" there saying "Nothing to reference yet";
  - the reads: `getAgentWorkflows` and `listServers` once per chat; no
    page errors. In French the kinds, the apps' lines and the empty lines
    read in French.
  The 207 tests, typecheck, lint, the words', the brands' and the build's
  checks, `check_names.py`, `check_translations.py`.
- **Not checked:** a real computer's skills, routines and apps; Safari's
  and Firefox's undo (the field's own typing is used, which both have).
  A pick copied and pasted comes in as plain words, as on the Mac.
- **Next:** step 2e, part 3: dictation.

### 1 November 2026: step 2e, part 1, attaching files and the ":" emoji list

- `src/core/attachmentLimits.ts` (SimeonCore's `AttachmentLimits`): six
  files at most, each up to 25 MB (200 MB for a video), none empty, and
  the line for what was left out, from the core's catalogue. Its tests
  are the core's `AttachmentLimitTests`, and French.
- `src/window/Attachments.tsx` (mac/Simeon/Attachments.swift):
  - `useStaging`: the chat's files waiting to go. As many as fit beside
    those waiting, files still being read counted; each size checked
    before it is read; the line over the words for five seconds, the
    latest kept. They belong to the chat on screen, as on the Mac: another
    chat starts with none.
  - Attach: the 40-point glass disc left of the field, off at six; its
    menu opens upward, its foot 4 over the disc: Photo or Video and
    Choose File (several files). A second click, Escape or a click
    elsewhere closes it.
  - The files over the words, lined up with the field (48 in): a picture
    as a 52-point square of it, any other file as a 220 by 54 chip with
    its kind's icon, its name (the extension always shown) and its size;
    Remove on each.
  - Files dragged over the chat: the blue wash (17%, 32% on dark) with
    "Drop files to add to chat"; dropped anywhere on the chat, they wait
    to go. Dropped outside the chat, nothing takes them.
  - A paste of files or a picture (a screenshot comes as "image.png")
    goes with them; words pasted with a picture of them stay words.
- `Composer.tsx`: the field starts 48 in, after Attach; with files
  waiting it says "Add a message, or hit send." and Send shows with no
  words; Return sends the files (each put on the computer first, then
  the message); a message canceled before it went comes back with its
  files.
- `src/window/ComposerPicks.tsx` (mac/Simeon/ComposerPicks.swift): ":"
  and two letters before the caret open the emoji list, hung 4 over the
  colon's line and from its left: 320 wide, twelve at most (those picked
  lately first), each as the emoji, ":shortcode:" and its name. ↑ and ↓
  choose, Return and Tab pick, Escape puts it away until that ":" is
  gone; a click picks, the field keeping the keys. Not in "10:30" or an
  address. Nothing found shows nothing. The catalogue is read when ":"
  first asks.
- **Decisions (the session):** in the table above.
- **Checked:** in Chromium, the built app against a stand-in server and
  computer (`compose-check.cjs` in the session's scratchpad), light and
  dark, then French:
  - the menu's two items and place, Escape and a second click closing it;
    Choose File taking several files, Photo or Video asking for
    `image/*,video/*`;
  - a picture, a PDF and a CSV in the strip with their sizes, the
    placeholder and Send;
  - five more dropped: six kept, "Only 6 attachments allowed — 2 weren't
    added.", Attach off; Remove; a 26 MB file, an empty one and two too
    large each with their line, gone after five seconds;
  - a pasted picture taken, an Office-style paste left as words;
  - Return with no words: five `uploadAttachment` calls, then `sendPrompt`
    with their five paths and names; the strip emptied;
  - the emoji list for ":tad" (🎉 first), Return, ↓ and Tab, Escape and
    typing on, a new ":" opening it again, "10:30" and "https://" not
    opening it, a click; the lately-picked kept;
  - a drop on the sidebar refused; no page errors. In French every line
    and the menu read in French.
  The 195 tests, typecheck, lint, the words', the brands' and the build's
  checks, `check_names.py`, `check_translations.py`.
- **Not checked:** a real file chooser and a real drag from Finder or
  Explorer (the check hands the page files as a browser would); a paste
  from Finder (what each browser puts on the clipboard for a copied file
  differs); Safari; against the real server and a real computer.
- **Next:** step 2e, part 2: "@" (agents, groups, routines and apps),
  "/" (skills and the app's actions) and "#" (pull requests); then
  dictation.

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
