// Connectors' rules against the shipped overlay's own code (SimeonCore's
// `PluginsTests`): the core's own fixture, read where it is
// (ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/plugins.json), was made by
// running the overlay chunk's `Pl`, `Tl`, `ql`, `et`, `rt`, `ui`, `fi`,
// `nt`, `Hl`, `Ml`, `yi`, `Wl`, `Ue`, `sd`, `Gl`, `vi`, `ni`, `bi`, `_l`,
// `An`, `Tn`, `Jn` and `Ll` (with the main bundle's `MFe`, `RWn` and `P5n`)
// on 160 random catalogues with servers, accounts and plugins, and on
// skills, tools and words.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type PluginFilter,
  type PluginItem,
  accountLabel,
  addedNotice,
  agentSkillFrom,
  authBlockedLine,
  collapse,
  effectivePluginFrom,
  entryContributions,
  entryForServer,
  entryKept,
  fuzzyScore,
  installedState,
  itemKept,
  itemKeptByQuery,
  onePerServer,
  pluginEntryFrom,
  pluginItems,
  pluginSections,
  pluginServerFrom,
  pluginToolFrom,
  pluginsById,
  privateSkills,
  removedNotice,
  searchCatalog,
  searchServers,
  serverAccounts,
  serverContributions,
  serversByName,
  shareLink,
  signInNotice,
  skillKept,
  skillSubtitle,
  skillsAddedNotice,
  statusWord,
  toolNames,
} from './plugins'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture: any = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/plugins.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

const filterOf = (json: any): PluginFilter => ({
  type: json?.type ?? 'all',
  ownership: json?.ownership ?? 'all',
})

const some = <T>(list: (T | undefined)[]): T[] =>
  list.filter((one): one is T => one != null)

function describeItem(item: PluginItem): unknown {
  return item.kind === 'connector'
    ? {
        kind: 'connector',
        serverId: item.server.id,
        accountKey: item.server.accountKey,
        installMode: item.installMode,
      }
    : {
        kind: 'plugin',
        entryId: item.entry.id,
        installMode: item.installMode,
        connectors: item.connectors.map((one) => `${one.id}/${one.accountKey}`),
      }
}

describe('Connectors’ rules, as the overlay', () => {
  it('order Available and Yours and say what is added', () => {
    const scenarios: any[] = fixture.scenarios
    expect(scenarios.length).toBe(160)
    scenarios.forEach((row, index) => {
      const label = `scenario ${index}`
      const catalog = some((row.catalog ?? []).map(pluginEntryFrom))
      const servers = some((row.servers ?? []).map(pluginServerFrom))
      const plugins = some((row.plugins ?? []).map(effectivePluginFrom))
      const query: string = row.query ?? ''
      const chosen = filterOf(row.filter)
      const deduped = onePerServer(servers)

      const marketplace = searchCatalog(catalog, query)
      expect(
        marketplace.map((one) => one.id),
        label,
      ).toEqual(row.marketplace)
      expect(
        marketplace
          .filter((one) => entryKept(one, chosen))
          .map((one) => one.id),
        label,
      ).toEqual(row.marketplaceFiltered)
      const sections = pluginSections(searchCatalog(catalog, ''))
      expect(
        sections.map((one) => one.key),
        label,
      ).toEqual(row.sections.map((one: any) => one.key))
      expect(
        sections.map((one) => one.title),
        label,
      ).toEqual(row.sections.map((one: any) => one.title))
      expect(
        sections.map((one) => one.items.map((entry) => entry.id)),
        label,
      ).toEqual(row.sections.map((one: any) => one.items))

      const names = serversByName(deduped)
      const byId = pluginsById(plugins)
      catalog.forEach((entry, at) => {
        const answer = row.installed?.[at]
        if (answer == null) return
        const found = installedState(entry, deduped, names, byId)
        expect(found.isInstalled, `${label} ${entry.id}`).toBe(
          answer.isInstalled,
        )
        expect(found.plugin?.pluginId ?? null, `${label} ${entry.id}`).toBe(
          answer.plugin ?? null,
        )
        expect(found.server?.id ?? null, `${label} ${entry.id}`).toBe(
          answer.server ?? null,
        )
      })

      const found = searchServers(deduped, query)
      expect(
        found.map((one) => one.id),
        label,
      ).toEqual(row.serversFound)
      const items = pluginItems(found, catalog, plugins)
      expect(items.map(describeItem), label).toEqual(row.items)
      const kept = items.filter(
        (item) => itemKeptByQuery(item, query.trim()) && itemKept(item, chosen),
      )
      expect(kept.map(describeItem), label).toEqual(row.itemsKept)
      const lines = items.map((item) =>
        item.kind === 'plugin'
          ? entryContributions(item.entry)
          : serverContributions(item.server, catalog),
      )
      expect(lines, label).toEqual(row.itemLines)
      expect(
        deduped.map((server) => entryForServer(server, catalog)?.id ?? ''),
        label,
      ).toEqual(row.entryFor.map((one: string | null) => one ?? ''))
      for (const [id, order] of Object.entries(row.accountOrder ?? {}))
        expect(
          serverAccounts(servers, id).map((one) => one.accountKey),
          `${label} ${id}`,
        ).toEqual(order)
    })
  })

  it('list the private skills as the overlay', () => {
    ;(fixture.skillSets as any[]).forEach((row, index) => {
      const skills = some((row.skills ?? []).map(agentSkillFrom))
      expect(
        privateSkills(skills).map((one) => one.id),
        `set ${index}`,
      ).toEqual(row.private)
      expect(skills.map(skillSubtitle), `set ${index}`).toEqual(row.lines)
      expect(
        skills
          .filter((one) => skillKept(one, filterOf(row.filter)))
          .map((one) => one.id),
        `set ${index}`,
      ).toEqual(row.kept)
    })
  })

  it('name the tools and accounts, and say the words, as the overlay', () => {
    for (const row of fixture.toolSets as any[]) {
      const tools = some((row.tools ?? []).map(pluginToolFrom))
      expect(toolNames(tools)).toEqual(row.names)
    }
    for (const row of fixture.accounts as any[])
      expect(accountLabel(row.key)).toBe(row.label)
    for (const row of fixture.blocked as any[])
      expect(authBlockedLine(row.names)).toBe(row.line)
    for (const row of fixture.signIns as any[]) {
      const notice = signInNotice(row.status, row.message ?? undefined)
      expect(notice.text).toBe(row.notice.text)
      expect(notice.isError).toBe(row.notice.kind === 'error')
    }
    for (const row of fixture.added as any[]) {
      const notice = addedNotice(
        'Gmail',
        row.added ?? 0,
        row.failed ?? [],
        row.error ?? undefined,
      )
      expect(notice.text).toBe(row.notice.text)
      expect(notice.isError).toBe(row.notice.kind === 'error')
    }
    for (const row of fixture.removed as any[])
      expect(
        removedNotice('Gmail', row.removed ?? false, row.reason ?? undefined)
          .text,
      ).toBe(row.notice.text)
    for (const row of fixture.scores as any[]) {
      const score = fuzzyScore(row.text, row.query)
      if (row.score == null) expect(score, row.text).toBeUndefined()
      else expect(score, row.text).toBeCloseTo(row.score, 9)
    }
    for (const row of fixture.collapse as any[]) {
      const result = collapse(
        Array.from({ length: row.count }, (_, i) => i),
        row.expanded,
        row.limit,
      )
      expect(result.visible.length).toBe(row.visible)
      expect(result.hidden).toBe(row.hidden)
    }
    expect(shareLink('gmail plugin/1')).toBe(fixture.link)
    expect(statusWord('needsAuth')).toBe('Needs auth')
    expect(skillsAddedNotice('Docs', 2).text).toBe('Added 2 skills from Docs')
  })
})
