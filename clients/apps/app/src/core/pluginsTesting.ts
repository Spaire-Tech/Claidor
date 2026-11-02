// A stand-in computer for Connectors' tests (SimeonCore's `PluginsBox` in
// PluginCallsTests.swift), on the store's tests' `FakeBackend`: it writes
// down each command and answers from a script, `desktopMcp`'s actions by
// "desktopMcp:<action>"; a `createAgent` it answers puts the agent in the
// roster. For the tests only.

import { GatewayError } from './gatewayConnection'
import { field, type JSONValue, str, text } from './json'
import { makeAgent } from './models'
import { FakeBackend } from './testing'

const methods = [
  'desktopMcp',
  'getAgentWorkflows',
  'getPluginSyncStatus',
  'syncPluginSkills',
  'setAgentWorkflowEnabled',
  'updateAgentWorkflow',
  'deleteAgentWorkflow',
  'createAgent',
]

export class PluginsBox extends FakeBackend {
  /** The answer to each command, by "desktopMcp:<action>" or the command's name; null when none is written. */
  answers: Record<string, JSONValue> = {}
  /** The commands refused. */
  failing = new Set<string>()
  /** Called before a command is answered (a test's moment between the ask and the answer). */
  before?: (key: string, args: JSONValue) => void | Promise<void>

  static keyOf(method: string, args: JSONValue): string {
    return method === 'desktopMcp'
      ? `desktopMcp:${str(field(args, 'action')) ?? ''}`
      : method
  }

  override async command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    if (!methods.includes(method)) return super.command(method, args, options)
    this.commands.push({ method, args, wakes: options.wakes ?? true })
    const key = PluginsBox.keyOf(method, args)
    await this.before?.(key, args)
    if (this.failing.has(key)) throw new GatewayError(`${key} failed`, true)
    const answer = this.answers[key]
    if (key === 'createAgent') {
      const id = text(field(field(answer, 'agent'), 'id'))
      if (id != null && !this.agents.some((agent) => agent.id === id))
        this.agents = [
          ...this.agents,
          {
            ...makeAgent({ id, name: str(field(args, 'name')) ?? '' }),
            purpose: str(field(args, 'purpose')),
          },
        ]
    }
    return answer === undefined ? null : answer
  }

  /** The arguments of the last call to `key`. */
  sentTo(key: string): JSONValue | undefined {
    return this.all(key).at(-1)
  }

  /** The arguments of every call to `key`. */
  all(key: string): JSONValue[] {
    return this.commands
      .filter((one) => PluginsBox.keyOf(one.method, one.args) === key)
      .map((one) => one.args)
  }
}
