# Publishing a skill runs against Simeon Labs' server (25 September 2026)

Ledger F-157; `docs/product/cursor-dependencies-map.md` §7. The founder's
rule for this batch: "always assume that we already have it … first
preserve and use everything we already have, then only build the missing
server contract that the existing code actually expects."

## What was already there, and is used unchanged

Everything the app does to publish a skill was in the tree and is the
same code today:

- `desktop/source/host/extensions/mcp/skill-publish.ts`,
  `SandSkillPublishService`: `listTargets` (GetTeams), `publish` (stages
  the skill folder, packs it as a plugin with `synthesizeSkillPluginDir` +
  `packPluginArtifact`, posts `PublishPlugin`, confirms with up to five
  sync passes on `pluginId` and `pluginVersion === commitSha`, then moves
  the skill out of the library), `resync`, `unpublish` (restores the
  library copy, posts `UnpublishPlugin`).
- `plugin-skills.ts`, the daily sync: `GetEffectiveUserPlugins` + `GetMe`,
  through `createBackendMarketplaceClient` / `loadFromMarketplaceSource`
  (`packages/cursor-plugins/`), which installs a plugin that has **no
  `gitUrl`** from its `inlineContentJson` (`enableInlinePlugins: true`,
  `synthesizeInlinePluginDir`) and calls its version
  `sha256("{plugin.id}:{plugin.updatedAt}")[:40]`.
- The gateway commands `getSkillPublishTargets`, `publishSkill`,
  `resyncPublishedSkill`, `unpublishSkill` (`host-gateway-api.ts:532`,
  `gateway-protocol.ts`, `shared/rpc/coordinator.ts`), and the wiring in
  `mcp/production.ts`.
- On the server: Polar's organizations and memberships
  (`polar/models/organization.py`, `user_organization.py`) are the teams;
  `polar/integrations/aws/s3` keeps the upload; `polar/sand/connect.py`
  and `dashboard.py` (`GetMe`, `user_id_of`) carry the calls.

Searched for and not found (so built): any table or route holding a
published plugin (`rg -i "publishplugin|effectiveuserplugins|sand_plugin"
server/polar` → nothing before this commit); any client path that installs
a plugin from a tarball or a local directory (`backend-marketplace-client.ts`
knows git clones, GitHub release assets and inline JSON, nothing else).

## The decision: inline content, no git anywhere

The loader's three ways to get a plugin's files: clone `gitUrl`@`gitRef`
(a shallow clone or a sha fetch over ssh/https; a dumb static git host does
not serve `--depth 1`), download a GitHub release asset (`releaseRepo`,
`releaseAsset`; the host must be github.com or a GHES), or write
`inlineContentJson`. Only the third needs no new machinery. Its shape was
rules, commands, hooks and MCP servers only — no files, so no skill —
which is why `synthesizeInlinePluginDir` now also takes `files`
(`{path, content | contentBase64}`, unsafe paths refused, a root
`plugin.json` read for `displayName`/`description`, `skills/*/SKILL.md`
listed in the manifest it writes). That is the one change to the loader.

The version is the loader's own hash, so the server must send `updatedAt`
and compute the same thing: `commit_sha_of(numeric_id, updated_at_ms)` in
`polar/sand/skill_registry_service.py`, tested on both sides
(`loader_version()` in the server test; the real loader in the desktop
test).

## What was built

`server/polar/sand/skill_registry.py` (routes), `skill_registry_service.py`
(publish / unpublish / listing / teams), `skill_registry_repository.py`,
`polar/models/sand_plugin.py`, migration `2026-09-25-1300_sand_plugins.py`
(head `sand_plugins_0925`, on `desktop_box_credential_0925`).

| RPC | Answer |
|---|---|
| `GetTeams` | `teams[]`: **"Just me"** first (`id` = the person's `user_id_of` number, `isDirectMember: true`, `role` OWNER), then one team per organization the person is a direct member of (`id` = `stable_int32(organization.id)`, the same 31-bit hash, `teamSlug`). The app keeps `id > 0 && isDirectMember`. |
| `PublishPlugin` | `team_id` 0, absent or the personal id → the person's own account (no organization needed); an organization's id → that team, membership checked. The tar.gz is unpacked (10 MB packed, 50 MB unpacked, 2,000 files; absolute paths, `..`, links refused), must carry `skills/<name>/SKILL.md`, becomes `{"files": [...]}`; the same name in the same scope updates the row (`updated_at_ms` strictly increases), another person's row is `permission_denied`. Answers `pluginId`, `marketplaceId` (= team id), `commitSha`. The tarball is copied to S3 at `sand-plugins/<owner>/<id>/<content_hash>.tgz` in `S3_FILES_BUCKET_NAME`; if S3 does not answer, the publish still succeeds (the inline JSON is the content of record) and `sand.skill_registry.tarball_not_stored` is logged. |
| `UnpublishPlugin` | owner only; soft-deletes the row; answers a new `commitSha`. |
| `GetEffectiveUserPlugins` | `plugins[]` with `plugin{id, name, displayName, description, gitUrl: "", gitRef: commitSha, gitPath: "", updatedAt, publisher{ownerUserId}, marketplace{id, name (slug), teamId, allowUserPublish: true}, skills[], publishedByUser}`, `isTeamRequired: false`, `isEnabled` (per-person switch in `sand_plugin_user_settings`, absent = on), `pinnedGitRef: commitSha`, `configuredVariables: {}`, `inlineContentJson`, `installMode: USER`; `marketplaces[]` one per team seen. Personal plugins for their owner; a team's for every member; `team_id` in the request narrows. |
| `GetMe` | unchanged (`dashboard.py`); its `userId` is the number `publisher.ownerUserId` carries, so `requirePublishedPluginSkill` recognises the person's own plugin. |

Marketplace slugs are cache folder names on the Mac and in the box
(`getPluginInstallCachePath`): `just-me`, `team-<organization slug>`.

## What changed on the app side

- `skill-publish.ts`: the on-failure sentence "Publishing a skill to a
  team is coming soon in Simeon." is gone. A failed `GetTeams` shows
  `Publishing is not available right now: <the server's sentence>`
  (`serverSentence`, the Connect error's `rawMessage`); a refused
  `PublishPlugin` or `UnpublishPlugin` throws `SandSkillPublishError` with
  the server's sentence, which is what the card shows.
- `listTargets` with no organization shows one target, "Just me", because
  the server lists it; the renderer draws the gateway's `teams[]` as is.
- `plugin-skills.ts`: one `[claidor] plugins sync=<trigger> skills=N
  plugins=N changed=…` line per pass and `[claidor] plugins sync=<trigger>
  failed: …` on a failure, in the box's `/tmp/sand-host.log`. The daily
  poll already swallowed the throw (`startPluginSkillsWhenAuthenticated`,
  `extension.ts`), so nothing reaches a turn; the test pins that.
- **Found on the way, and it affects every Connect call in the app, not
  only this feature:** `@connectrpc/connect-node` defaults
  `useBinaryFormat` to `true`. `createSandBackendTransport` never set it,
  so every call went out as `application/proto` with a binary body and
  refused the JSON reply with `unsupported content type application/json`
  (measured by the desktop test before the fix). `polar/sand/connect.py`
  reads protobuf JSON and nothing else (the generated protos exist in
  `desktop/` and not in Python), and its docstring's "the default JSON
  codec" was an assumption. `cursor-inference.ts` and
  `cursor-marketplace-client.ts` now pass `useBinaryFormat: false`. Without
  this line none of the served Connect services would have answered a
  real app.

## Measured offline

- `server/tests/sand/test_skill_registry.py` (9): a tarball built in the
  test publishes and is listed with `inlineContentJson`, a `gitRef` equal
  to `commitSha`, and `loader_version(plugin) == commitSha`; the upload is
  read back from the S3 mock; `team_id` 0 and the personal id are one
  target and a re-publish moves the sha; unpublish removes; a bad archive
  and an escaping path are refused with a sentence; a stranger sees
  nothing and cannot unpublish; `GetTeams` is "Just me" alone with no
  organization; an organization is a team its second member sees, as
  someone else's, and can neither unpublish nor overwrite; a team the
  person is not in is refused.
- `desktop/tests/skill-publish-served.test.mjs` (4): the real
  `SandSkillPublishService`, `SandPluginSkillsService`,
  `createSharedInstalledPluginsLoader` and Connect client against an
  in-process JSON server with the shapes above: publish confirms on the
  **first** sync pass (one `GetEffectiveUserPlugins` call), the library
  copy moves to `plugin-1000-meeting-notes`, `runs.json` is not packed,
  the installed record carries the answered sha and the publisher's id,
  unpublish restores `workflows/meeting-notes` and empties the index; the
  server's sentence reaches the card; inline `files` are written and the
  manifest lists the skill; a failed sync writes one `[claidor] plugins`
  line.

## Not yet run on a Mac

Nothing above has run on a Mac or against the deployed server. To see it
work: publish a skill from the app, then read in the box's
`/tmp/sand-host.log`:

```
[claidor] skill-publish published: plugin=<name> team=<id> id=<n> sha=<40 hex> bytes=<n>
[claidor] plugins sync=install skills=<n> plugins=<n> changed=true
```

and on Render `sand.skill_registry.published … stored=true`. A
`stored=false` means S3 refused the copy (check the bucket's policy for
`sand-plugins/`); the publish still counts. If the card says "Publishing
is not available right now: …", the sentence after the colon is the
server's or the transport's, and `[claidor] skill-publish targets failed:`
in the box log carries the same words.

## Left as it was, on purpose

- `server/polar/desktop/skill_store.py` and `polar/desktop/skills/`, the
  read-only Anthropic catalogue, are untouched and are **not** served as
  built-in marketplace entries: every plugin in the listing is installed
  into every agent's skill set on the next daily sync, so listing all
  seventeen would put seventeen skills into every brief. A person who
  wants one publishes it. If the founder wants them as a catalogue, the
  shape allows it (each is a `files` inline plugin) and it is a loop over
  the catalogue in `effective_plugins`.
- `resync` (re-publishing an installed plugin skill after editing it) is
  the same `PublishPlugin` with the same name and is covered by the
  re-publish test; not driven end to end from the desktop test.
- Per-person enable/disable has a table and no writer: the app's
  `SetPluginEnabled`-style RPCs were not searched for callers in this
  build.
- Team ids are 31-bit hashes of UUIDs; a collision between a person's own
  hash and one of their organizations' is astronomically unlikely and
  would make the two targets one. A column would remove the chance; not
  done.
