# The self-test

Ten minutes on somebody's real Word, answering four questions that no
amount of reading settles.

## Why it exists

Every Office.js call in this repository is written and unproven. Office.js
exists only inside an Office host, and there is no honest way to fake one,
so the entire Word integration — upstream's 40,000 lines and ours — has
never executed. That is not a gap you close by being careful. It is closed
by running it once.

The self-test is the smallest thing that closes it. It needs no sign-in, no
Claidor API and no AI key, because the four questions are all about Word.

## What it answers

| | Question | Why it cannot be answered here |
|---|---|---|
| 1 | Does the pane load at all, and which WordApi sets does this host have? | The manifests declare a 1.6 floor. Whether a given Word meets it is a fact about that Word. |
| 2 | Is the string Word gives back the string the server indexes? | Every character offset the engine returns points into it. If it differs by one character — a different paragraph separator, a footnote included or not — every jump in the panel lands somewhere plausible and wrong, and nothing throws. |
| 3 | Does selecting the *n*th occurrence select the *n*th occurrence? | The server counts occurrences with a substring scan and says "this is the 3rd". Word searches and hands back matches. Whether those two orders agree is the single most likely silent bug in the product. |
| 4 | Does Word honour a request to turn change tracking on? | The add-in forces it, reads it back, and refuses to write if it did not take. Whether Word refuses or silently ignores is documented one way and behaves the other often enough that it has to be seen. |

It also checks that a custom XML part can be written and read back, because
that is where a reader's dismissed findings live. If it does not work, the
Ignored bucket has no home in the document and has to move somewhere it
evaporates.

## What it does to the document

Everything it writes goes into one paragraph it appends at the end,
starting `CLAIDOR SELF-TEST`. That paragraph is removed when the test
finishes, whatever happened, with change tracking turned off first so the
removal is not itself a revision. The reader's own text is only ever read.

If cleanup fails it says so and names the paragraph to delete by hand.

## Where it is now

Live at **https://claidor-selftest.vercel.app/selftest.html**, with the
manifest beside it at `/manifest.selftest.xml`.

Its own Vercel project, deliberately. The dashboard's project has
deployment protection on — every URL 302s to a Vercel SSO login — and its
Next.js config sends `X-Frame-Options: DENY`. Both are right for a
dashboard and both are fatal for a task pane, which Word loads in an iframe
with no session. The add-in needs its own origin, permanently, not just for
this test.

Verified from outside: `200` on the page, the manifest and every asset;
`frame-ancestors` allowing the Office web hosts; and no `X-Frame-Options`
header at all.

## Packaging it

```bash
pnpm selftest:package https://<the-origin-it-will-be-served-from>
```

That builds, drops `vercel.json` beside the bundle, and writes
`dist/manifest.selftest.xml` with the origin filled in. The script refuses
to write a manifest with a surviving placeholder, and refuses a non-HTTPS
origin — Office rejects a plain-HTTP task pane everywhere except localhost,
and Word on the web rejects it there too.

Deploy `dist/` as a static site. The headers in `vercel.json` matter:
`frame-ancestors` has to allow the Office web hosts or Word on the web
refuses to embed the pane, and there must be no `X-Frame-Options`, which
cannot express a per-origin allowlist.

## Sideloading it

**Word on the web.** Open a document at office.com, then
*Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in*, and choose
`manifest.selftest.xml`. A Claidor group appears on the Home tab.

**Word on a Mac.** Copy the manifest to
`~/Library/Containers/com.microsoft.Word/Data/Documents/wef` and restart
Word.

**Word on Windows.** Share a folder, add it under *File → Options → Trust
Center → Trust Center Settings → Trusted Add-in Catalogs*, tick *Show in
Menu*, restart Word, then *Insert → My Add-ins → Shared Folder*.

## Reading the results

Every step prints `OK` or `NO` and one sentence. The verdict is a word
rather than a colour so it can be read down a phone. `Copy the results`
puts the lot on the clipboard.

A failure here is the point. Four of five passing is a far better position
than a week of reasoning about which one would have failed.
