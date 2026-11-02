// The Plugins overlay's words and small rules (SimeonCore's
// `PluginsOverlayTests`), against the window's.

import { describe, expect, it } from 'vitest'
import { pluginEntryFrom, pluginToolFrom } from './plugins'
import {
  canSaveSkill,
  detailValue,
  fillInLine,
  hostLine,
  installedEmpty,
  marketplaceEmpty,
  modeLabel,
  needsSetupPage,
  pageAction,
  privateEmpty,
  requiredLine,
  setupIntro,
  setupMissing,
  setupStart,
  setupSubmit,
  setupValues,
  signInButton,
  signInKey,
  sourceWord,
  teamMark,
  tone,
  toolsValue,
  transportWord,
} from './pluginsOverlay'

describe('Connectors’ words and small rules', () => {
  it('say the empty lines', () => {
    expect(marketplaceEmpty(false, true, true, 'x')).toBe('Loading connectors…')
    expect(marketplaceEmpty(true, false, true, 'x')).toBe(
      'No connectors match the current filters',
    )
    expect(marketplaceEmpty(true, false, false, ' zzzz ')).toBe(
      'No connectors match "zzzz"',
    )
    expect(marketplaceEmpty(true, true, false, '')).toBe(
      "Connectors aren't available right now. Check back later.",
    )
    expect(installedEmpty('')).toBe(
      'Nothing added yet. Find connectors in Available.',
    )
    expect(installedEmpty('lin')).toBe('No connectors you added match "lin"')
    expect(privateEmpty(false, 'x')).toBe(
      'Open an agent to see its private skills',
    )
    expect(privateEmpty(true, '')).toBe(
      'No private skills yet. Ask your Agent to create one for you.',
    )
    expect(privateEmpty(true, 'q')).toBe('No private skills match "q"')
  })

  it('say the team’s labels and the page’s action', () => {
    expect(pageAction(false, 'user')).toEqual({ kind: 'add' })
    expect(pageAction(true, undefined)).toEqual({ kind: 'add' })
    expect(pageAction(true, 'user')).toEqual({ kind: 'uninstall' })
    expect(pageAction(true, 'team-default')).toEqual({
      kind: 'remove',
      label: 'Added by your team',
    })
    expect(pageAction(true, 'team-required')).toEqual({
      kind: 'managed',
      label: 'Managed by your team',
    })
    expect(modeLabel('user')).toBeUndefined()
    const team = pluginEntryFrom({
      id: 'a',
      name: 'a',
      marketplace: {
        name: 'acme',
        displayName: 'Acme Team',
        ownership: 'team',
      },
    })!
    const mine = pluginEntryFrom({
      id: 'b',
      name: 'b',
      marketplace: { name: 'me', displayName: 'Mine' },
      publisher: { name: 'me', displayName: 'Me', isUserOwned: true },
    })!
    const plain = pluginEntryFrom({ id: 'c', name: 'c' })!
    expect(teamMark(team)).toBe('Acme Team')
    expect(teamMark(mine)).toBeUndefined()
    expect(teamMark(plain)).toBeUndefined()
    const fielded = pluginEntryFrom({
      id: 'd',
      name: 'd',
      fields: [{ key: 'token', isRequired: true }],
    })!
    expect(needsSetupPage(fielded, false)).toBe(true)
    expect(needsSetupPage(fielded, true)).toBe(false)
    expect(needsSetupPage(plain, false)).toBe(false)
  })

  it('colour the status and name the sign-in’s button', () => {
    expect(tone('connected')).toBe('success')
    expect(tone('needsAuth')).toBe('warning')
    expect(tone('error')).toBe('danger')
    expect(tone('initializing')).toBe('tertiary')
    expect(signInKey('Google_Calendar-2')).toBe('googlecalendar2')
    expect(signInKey('gmail--Work')).toBe('gmail--Work')
    expect(signInButton('none')).toBe('Connect')
    expect(signInButton('waiting')).toBe('Reopen')
    expect(signInButton('timedOut')).toBe('Retry')
  })

  it('fill the setup form', () => {
    const entry = pluginEntryFrom({
      id: 'acme',
      name: 'acme',
      displayName: 'Acme',
      fields: [
        { key: 'token', label: 'API token', isRequired: true, isSecret: true },
        { key: 'region', label: 'Region', defaultValue: 'eu' },
      ],
    })!
    const fields = entry.fields ?? []
    const values = setupStart(fields)
    expect(values).toEqual({ token: '', region: 'eu' })
    expect(setupMissing(fields, values).map((one) => one.key)).toEqual([
      'token',
    ])
    values.token = '  abc  '
    values.region = '   '
    expect(setupMissing(fields, values)).toEqual([])
    expect(setupValues(values)).toEqual({ token: 'abc' })
    expect(setupIntro('Acme', false)).toBe(
      'Acme needs a few values before it can be added',
    )
    expect(setupSubmit('Acme', false)).toBe('Add Acme')
    expect(setupSubmit('Acme', true)).toBe('Save Values')
    expect(requiredLine('API token')).toBe('API token is required')
    expect(fillInLine(1)).toBe('Fill in the required field to continue')
    expect(fillInLine(2)).toBe('Fill in the required fields to continue')
  })

  it('say a server’s details', () => {
    expect(transportWord('http')).toBe('HTTP')
    expect(transportWord('stdio')).toBe('Command')
    expect(sourceWord(false)).toBe('Added manually')
    expect(hostLine('https://mcp.acme.dev/sse')).toBe('mcp.acme.dev')
    expect(hostLine(undefined)).toBeUndefined()
    const tools = [
      pluginToolFrom({ name: 'a' })!,
      pluginToolFrom({ name: 'b', isDisabled: true })!,
    ]
    expect(toolsValue(tools, 9)).toBe('1 of 2 enabled')
    expect(toolsValue(undefined, 9)).toBe('9')
    expect(detailValue('')).toBe('—')
  })

  it('let a skill’s page save', () => {
    expect(canSaveSkill(true, true, 'a', 'b', 'c', false)).toBe(true)
    expect(canSaveSkill(false, true, 'a', 'b', 'c', false)).toBe(false)
    expect(canSaveSkill(true, false, 'a', 'b', 'c', false)).toBe(false)
    expect(canSaveSkill(true, true, 'a', '  ', 'c', false)).toBe(false)
    expect(canSaveSkill(true, true, 'a', 'b', 'c', true)).toBe(false)
  })
})
