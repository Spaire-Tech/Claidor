# Memory backed up to Simeon Labs' server (25 September 2026)

`docs/product/cursor-dependencies-map.md` §4 said memory sync was "new
product work" because the two halves disagreed: the server accepted
three names from the OpenClaw layout, the app writes a different tree,
and no client existed. The founder's rule for this batch: "always assume
that we already have it … first preserve and use everything we already
have, then only build the missing server contract that the existing code
actually expects." So this build kept both halves and built the one
thing that was missing on each side.

## What was reused

- **The server routes and their merge**, unchanged in shape:
  `POST /desktop/api/memory/sync` (`{files: [{name, content,
  base_version}]}` → `{files: [{name, content, version, changed}],
  deleted: []}`, 400 `{code: 40001, message}` on refusal) and
  `GET /desktop/api/memory` (`{files: [{name, version, size}]}`), in
  `server/polar/desktop/endpoints.py`; `sync_memory_files` in
  `service.py` (version dance, the merge on a stale base, the size caps,
  the daily-note prune); `DesktopMemoryFileRepository` in `repository.py`;
  the `desktop_memory_files` table, which already carried `deleted_at`
  from `RecordModel` (`2026-09-11-1100_desktop_memory_files.py`), so no
  migration was needed; and the three merge rules of `memory_merge.py`
  (list, lines, document) with the three original names, which the maty
  runner still lays out (`runner/src/memory.ts`, `job.ts:48` filters the
  bundle to the names it knows, so the widened list does not reach it).
- **The app's memory files and the hooks around them**, untouched:
  `host/extensions/memory/memory-service.ts` (`FileMemoryStore`,
  `profile.md`, `log/YYYY-MM.md`, the `- (YYYY-MM-DD) <fact>` line,
  `memoryIdFor`), the user and project shards (`getUserMemoryShardDir`,
  `getProjectMemoryShardDir`), `WatchedDirectory.writeFileAtomic` (where
  `runTurnMemory`'s `addMemory`, the agent's `update_state` and the memory
  pane's delete all land), `MemoryService.subscribe`, the host's
  `auth.getAccessToken` (the box's own token, the one the model proxy
  takes), `getConfiguredBackendUrl`, and the `[claidor]` stdout channel
  of `shared/host-log.ts`.

## What was built

### Server (`server/polar/desktop/`)

- **The accepted names are the app's tree.** `memory_merge.py` keeps
  `MEMORY.md`, `USER.md`, `memory/YYYY-MM-DD.md` and adds, as strict
  regexes matched whole (`_APP_NAMES`; ≤200 characters; a folder is
  `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, so `.`, `..`, a leading slash, a
  backslash and the `.dreaming/` folder match nothing):
  `agents/<agentId>/memory/profile.md`,
  `agents/<agentId>/memory/log/YYYY-MM.md`,
  `user-memory/agents/<agentId>/profile.md`,
  `user-memory/agents/<agentId>/log/YYYY-MM.md`,
  `projects/<slug>/memory/agents/<agentId>/profile.md`,
  `projects/<slug>/memory/agents/<agentId>/log/YYYY-MM.md` (all rule
  `facts`) and `projects/<slug>/project.md` (rule `document`).
- **A fact-list merge.** `merge_fact_file` unions fact lines by the app's
  own id (`fact_id` = sha1 of the content with whitespace collapsed,
  trimmed, cut at 500 characters, lowercased; first 16 hex digits — the
  same function as `memoryIdFor` in `memory-service.ts`, read from it),
  so a fact learned on two machines on two days is stored once. Our lines
  in order, then theirs we do not have; their header is not copied.
- **Tombstones.** The sync body takes `deleted: [names]`; each becomes a
  row with `deleted_at` set, its text dropped, at version + 1. The
  response's `deleted` (which always existed and was always empty except
  for a prune) now lists every tombstone younger than
  `MEMORY_TOMBSTONE_DAYS` (90), so a machine that was away hears about
  it. A client that sends a tombstoned name from a base older than the
  tombstone keeps nothing (the deletion stands); one whose base is the
  tombstone's version writes the name again as a new file. The listing
  route hides tombstones.
- **The box's credential is accepted.** Both memory routes take
  `get_desktop_or_box_session` (`auth.py`), because the host that keeps
  the files runs in the box. The job token keeps its path
  (`tests/maty/test_endpoints.py`). `tests/desktop/test_box_credential.py`
  used to pin memory as refused for the box; it now pins it as answered.
- Tests: `tests/desktop/test_memory_merge.py` (the app's names accepted,
  the rest of the sand root refused, fact ids, the union), and
  `tests/desktop/test_memory.py` (the app's files stored, no fact twice
  across machines, a deleted name told and resurrected, an old tombstone
  forgotten, the wire, the box's credential).

### Desktop (`desktop/source/host/extensions/memory-sync/`)

- **`memory-sync-client.ts`**: `isSyncedMemoryName` (the server's shapes,
  mirrored); `scanMemoryFiles` over `agents/`, `user-memory/`,
  `projects/`; the state file `<sandRoot>/.memory-sync/state.json`
  (name → `{version, hash}`); `MemorySyncClient.syncNow()`, one round
  that never runs twice at once: sends every file whose hash differs from
  the state with `base_version` from the state (0 when unknown), sends as
  `deleted` every name the state knows that is no longer on disk, writes
  back each answered file whose content differs from what is on disk,
  removes every name under `deleted`, and rewrites the state. A round
  with nothing changed sends nothing (unless it is the start-up pull). A
  file that changed while the request was out is not overwritten: it is
  kept and re-sent in the round that follows. A file over 1 MB is
  skipped and named.
- **`extension.ts`**: host extension `memory-sync`, peers `auth` and
  `memory`, last slot of the registry (`extension-ids.generated.ts`,
  `registry.ts`, `host-production-extensions.ts`). After
  `whenBackgroundWorkReady`: `GET /desktop/api/memory` (logged), then one
  round that pulls everything; then three `WatchedDirectory`s on the
  memory roots and `MemoryService.subscribe`, each a round after a 5 s
  debounce (`MEMORY_SYNC_DEBOUNCE_MS`). Off with `SAND_MEMORY_SYNC=0`.
- Log lines, on the channel that reaches `/tmp/sand-host.log`:
  `[claidor] memory-sync server holds N file(s): <name@version …>`,
  `[claidor] memory-sync pushed=N pulled=N deleted=N [told-deleted=N]
  held=N versions=<name@version …>`, `[claidor] memory-sync refused
  <status> <the server's sentence>`, `[claidor] memory-sync failed
  <error>`, `[claidor] memory-sync skipped: no credential for <url>`,
  `[claidor] memory-sync off (SAND_MEMORY_SYNC=0)`.
- Test: `desktop/tests/memory-sync.test.mjs`, the extension against an
  in-process HTTP server that answers the two routes the way
  `service.py` does: a fresh box pulls; a local change pushes with its
  base version; a server-side newer version is merged into the file; a
  deleted name removes the file; a local deletion is told; the state
  carries the versions; the watcher triggers a round; a refusal is one
  line; no credential and the off switch send nothing.

## Which machine wins

The server merges and the server is truth. Two machines that both append
facts keep both (union by id). Two machines that both rewrite a document
(`project.md`): the server's copy wins, as `USER.md` always did. A fact
deleted on one machine while the other appends to the same file before
syncing comes back through the union — the merge has no base text, only
a base version. Known limit; the app's own `.dreaming/tombstones` are
local and are not consulted by the server.

## Not yet run on a Mac

Nothing here has run outside the offline tests. On a Mac with a box:

```
docker exec simeon-box grep "memory-sync" /tmp/sand-host.log
```

should show `server holds` and one `pushed=… pulled=…` line at box
start, then one per memorable turn (after the `memory extraction
added=…` line) and per `update_state` write. From the Mac:

```
curl -s -H "Authorization: Bearer $DESKTOP_ACCESS_TOKEN" https://api.simeonlabs.com/desktop/api/memory
```

lists what the server holds. Not measured: the cost of three recursive
watchers on a box whose `agents/` holds large transcripts and attachments
(the round only hashes memory files, but the watcher fires on every
write under `agents/`; the 5 s debounce is the guard), and whether the
box's `getAccessToken` answers before the credential file is first
written (a round before it logs `skipped: no credential` and the next
change retries).

## Ledger

F-065, F-252, F-358 (`design-audit-ledger.md`, cluster `memory-sync`):
`fixed`, `needs-mac` for the log line above.
