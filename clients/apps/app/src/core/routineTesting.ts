// A stand-in for the host's routines, for the tests (the core's
// Demo.swift `routineCommand`): each command answers with the agent's whole
// list, as the host's do (host-gateway-api.ts), a create past 50 makes
// nothing, and Test run adds a manual run that went well.

import { type JSONObject, type JSONValue, field, str } from './json'
import { describeSchedule, triggerRows } from './routineTriggers'
import type { FakeBackend } from './testing'

/** A host that keeps routines as the demo's does: each command answers with the whole list. */
export function automationHost(backend: FakeBackend, seed: JSONObject[] = []) {
  const lists: Record<string, JSONObject[]> = {}
  let made = 0
  const record = (
    id: string,
    spec: JSONValue,
    createdAt?: JSONValue,
    runs?: JSONValue,
  ): JSONObject => {
    const trigger = field(spec, 'trigger') ?? {
      type: 'cron',
      schedule: '0 9 * * *',
    }
    const rows = triggerRows(trigger)
    const first = rows.find((row) => row.kind === 'schedule')
    return {
      id,
      name: field(spec, 'name') ?? 'Routine',
      prompt: field(spec, 'prompt') ?? '',
      trigger,
      schedule: first?.kind === 'schedule' ? first.text : null,
      triggerDescription:
        first?.kind === 'schedule' ? describeSchedule(first.text) : 'An event',
      isEnabled: field(spec, 'isEnabled') ?? true,
      createdAt: createdAt ?? Date.now() + made,
      runs: runs ?? [],
    }
  }
  const list = (args: JSONValue) => {
    const agentId = str(field(args, 'id')) ?? ''
    lists[agentId] ??= seed.map((spec, index) =>
      record(`seed-${index}`, spec, index + 1),
    )
    return lists[agentId]
  }
  const at = (args: JSONValue) =>
    list(args).findIndex((one) => one.id === field(args, 'automationId'))
  backend.commandAnswers.getAgentAutomations = (args) => list(args)
  backend.commandAnswers.createAgentAutomation = (args) => {
    const rows = list(args)
    // The host's limit: 50 routines an agent, then nothing is made.
    if (rows.length < 50) {
      made += 1
      rows.push(record(`r-${made}`, field(args, 'spec') ?? {}))
    }
    return rows
  }
  backend.commandAnswers.updateAgentAutomation = (args) => {
    const rows = list(args)
    const index = at(args)
    if (index >= 0) {
      const was = rows[index]!
      rows[index] = record(
        String(was.id),
        field(args, 'spec') ?? {},
        was.createdAt,
        was.runs,
      )
    }
    return rows
  }
  backend.commandAnswers.setAgentAutomationEnabled = (args) => {
    const rows = list(args)
    const index = at(args)
    if (index >= 0)
      rows[index] = {
        ...rows[index]!,
        isEnabled: field(args, 'isEnabled') ?? true,
      }
    return rows
  }
  backend.commandAnswers.deleteAgentAutomation = (args) => {
    const rows = list(args)
    const index = at(args)
    if (index >= 0) rows.splice(index, 1)
    return rows
  }
  backend.commandAnswers.runAgentAutomationNow = (args) => {
    const rows = list(args)
    const index = at(args)
    if (index >= 0) {
      const now = Date.now()
      made += 1
      rows[index] = {
        ...rows[index]!,
        runs: [
          {
            id: `run-${made}`,
            trigger: 'manual',
            startedAt: now,
            finishedAt: now + 1200,
            status: 'ok',
          },
          ...((rows[index]!.runs as JSONValue[]) ?? []).slice(0, 19),
        ],
      }
    }
    return null
  }
  return lists
}
