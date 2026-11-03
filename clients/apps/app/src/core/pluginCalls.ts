// Connectors' calls to the computer (`desktopMcp` and the agent's
// workflows), as the Mac's window makes them (SimeonCore's PluginCalls.swift,
// used by mac/Simeon/PluginsModel.swift): the catalogue, the servers, the
// plugins, a server's tools, the agent's skills and the GitHub banner's
// plugins; Add with its setup values, Edit Values (`updatePluginInstall`),
// Uninstall (`uninstallPlugin`) and Remove (`removeServer`); the skills' sync
// and the agent's private copies it replaces; a skill's switch, Save and
// Delete; and Fix with agent's Plugin Setup agent. Each says what the
// computer answered, read into the overlay's types; what to show of it is
// the window's.

import type { AgentBackend } from './backend'
import { GatewayError } from './gatewayConnection'
import { arr, field, type JSONValue, str, text } from './json'
import { t } from './l10n'
import { currentLanguage } from './language'
import type { Agent } from './models'
import {
  type AgentSkill,
  agentSkillFrom,
  type EffectivePlugin,
  effectivePluginFrom,
  pluginEntriesFrom,
  type PluginEntry,
  type PluginServer,
  pluginServerFrom,
  type PluginTool,
  pluginToolFrom,
  setupAgentDescription,
  setupAgentName,
  setupAgentPurpose,
  setupAgentRequest,
} from './plugins'

function listOf<T>(
  answer: unknown,
  read: (json: unknown) => T | undefined,
): T[] {
  return (arr(answer) ?? []).map(read).filter((one): one is T => one != null)
}

/** The servers in an answer (under `servers`, or the answer itself a list); none when it holds none. */
export function serversIn(answer: unknown): PluginServer[] | undefined {
  const rows = arr(field(answer, 'servers')) ?? arr(answer)
  if (!rows) return undefined
  return listOf(rows, pluginServerFrom)
}

/** What Uninstall or Remove did: gone, or why not (`team-server`), and the servers as they are now. */
export interface Removal {
  removed: boolean
  reason?: string
  servers?: PluginServer[]
}

export function removalFrom(answer: unknown): Removal {
  return {
    removed: field(answer, 'removed') === true,
    reason: str(field(answer, 'reason')),
    servers: serversIn(field(answer, 'state')),
  }
}

/** The plugin's skills are synced again: it went, or the team keeps it. */
export function resyncsSkills(removal: Removal): boolean {
  return removal.removed || removal.reason === 'team-server'
}

/** The agent's private copies of a plugin's skills (`Is`): the skills made from one of its skills' sources. */
export function privateCopies(
  entry: PluginEntry,
  skills: readonly AgentSkill[],
): AgentSkill[] {
  const sources = new Set(
    (entry.skills ?? [])
      .map((skill) => skill.sourceUrl)
      .filter((url): url is string => url != null),
  )
  if (sources.size === 0) return []
  return skills.filter(
    (skill) => skill.sourceRef != null && sources.has(skill.sourceRef),
  )
}

/** What a skill's Save sends (`Hi`): the name and description trimmed, the instructions as written, its trigger and source kept. */
export function skillSpec(
  skill: AgentSkill,
  name: string,
  description: string,
  body: string,
): { [key: string]: JSONValue } {
  const spec: { [key: string]: JSONValue } = {
    name: name.trim(),
    description: description.trim(),
    body,
  }
  if (skill.trigger !== undefined) spec.trigger = skill.trigger
  if (skill.sourceRef != null) spec.sourceRef = skill.sourceRef
  return spec
}

/** Details' Tools for switches counted by the app (the iPhone's): "n of m enabled" once read, else the server's own count. */
export function toolsCounted(
  enabled: number,
  total: number,
  count: number,
): string {
  return total === 0 ? `${count}` : t`${enabled} of ${total} enabled`
}

/** The Plugin Setup agent already made, when there is one (by its purpose). */
export function setupAgentIn(agents: readonly Agent[]): Agent | undefined {
  return agents.find((agent) => agent.purpose === setupAgentPurpose)
}

export class PluginCalls {
  constructor(readonly backend: AgentBackend) {}

  /** One of the host's gateway commands. */
  call(method: string, args: JSONValue = {}): Promise<JSONValue> {
    return this.backend.command(method, args)
  }

  /** One action of the computer's manager (`desktopMcp`). */
  mcp(action: string, args: JSONValue[] = []): Promise<JSONValue> {
    return this.call('desktopMcp', { action, args })
  }

  // MARK: Reading

  /** The catalogue (`getCatalog`): a list, or one under `plugins`, its words in the app's language. */
  async catalog(): Promise<PluginEntry[]> {
    return pluginEntriesFrom(
      await this.mcp('getCatalog', [{ language: currentLanguage() }]),
    )
  }

  /** The plugins the computer has on (`listEffectivePlugins`). */
  async effectivePlugins(): Promise<EffectivePlugin[]> {
    return listOf(await this.mcp('listEffectivePlugins'), effectivePluginFrom)
  }

  /** Each account of each server (`listServers`); none when the answer holds no list. */
  async servers(): Promise<PluginServer[] | undefined> {
    return serversIn(await this.mcp('listServers'))
  }

  /** A server's tools, each with its switch (`listServerTools`). */
  async tools(serverId: string): Promise<PluginTool[]> {
    return listOf(await this.mcp('listServerTools', [serverId]), pluginToolFrom)
  }

  /** A tool switched off, or back on, for every agent (`toggleMcpToolDisabled`): the server's tools as they are now. */
  async toggleTool(toolName: string, serverId: string): Promise<PluginTool[]> {
    return listOf(
      await this.mcp('toggleMcpToolDisabled', [{ serverId, toolName }]),
      pluginToolFrom,
    )
  }

  /** The agent's skills (`getAgentWorkflows`). */
  async skills(agentId: string): Promise<AgentSkill[]> {
    return listOf(
      await this.call('getAgentWorkflows', { id: agentId }),
      agentSkillFrom,
    )
  }

  /** The plugins the GitHub banner names (`getPluginSyncStatus`): their content can't be fetched. */
  async authBlocked(): Promise<string[]> {
    const answer = await this.call('getPluginSyncStatus')
    return (arr(field(answer, 'authBlocked')) ?? []).map(
      (one) => str(field(one, 'pluginName')) ?? '',
    )
  }

  /** A catalogue entry's logo (`resolvePluginLogo`): a data URL, SVG or PNG. */
  async logo(address: string): Promise<string | undefined> {
    const answer = await this.mcp('resolvePluginLogo', [address])
    return str(answer) ?? str(field(answer, 'src'))
  }

  // MARK: Add, setup, remove

  /** Add (`installEntry`): the entry with its setup values, said to be the team's when the team set them; the servers as they are now. */
  async install(
    entryId: string,
    values: Readonly<Record<string, string>>,
    team: boolean,
  ): Promise<PluginServer[] | undefined> {
    const args: { [key: string]: JSONValue } = {
      entryId,
      values: { ...values },
    }
    if (team) args.hasTeamConfiguredVariables = true
    return serversIn(await this.mcp('installEntry', [args]))
  }

  /** The server a plugin from the app's own maker makes (`vendorServerIdForPlugin`), whose sign-in opens after Add; none for the rest. */
  async vendorServerId(entryId: string): Promise<string | undefined> {
    try {
      return text(await this.mcp('vendorServerIdForPlugin', [entryId]))
    } catch {
      return undefined
    }
  }

  /** An account's sign-in asked for (`authenticateServer`, no trigger: the overlay's own): the computer's answer, its status and the page to open. */
  signIn(serverId: string, accountKey: string): Promise<JSONValue> {
    return this.mcp('authenticateServer', [serverId, accountKey])
  }

  /** Edit Values (`updatePluginInstall`): all of the plugin's setup values replaced. */
  async updateInstall(
    pluginId: string,
    values: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.mcp('updatePluginInstall', [{ pluginId, values: { ...values } }])
  }

  /** Uninstall or Remove of a server (`removeServer`). */
  async removeServer(serverId: string): Promise<Removal> {
    return removalFrom(await this.mcp('removeServer', [serverId]))
  }

  /** Uninstall of a plugin (`uninstallPlugin`). */
  async uninstallPlugin(pluginId: string): Promise<Removal> {
    return removalFrom(await this.mcp('uninstallPlugin', [pluginId]))
  }

  // MARK: Skills

  /** The computer's plugin skills synced (`syncPluginSkills`): how many of those synced are the plugin's (none asked, none counted). */
  async syncSkills(pluginId?: string): Promise<number> {
    const answer = await this.call('syncPluginSkills')
    if (pluginId == null) return 0
    return (arr(answer) ?? []).filter(
      (one) => str(field(one, 'pluginId')) === pluginId,
    ).length
  }

  /** The agent's private copies of a plugin's skills, dropped before its own are synced (`deleteAgentWorkflow`); a failure is let go. */
  async dropPrivateCopies(
    entry: PluginEntry,
    skills: readonly AgentSkill[],
    agentId: string | undefined,
  ): Promise<void> {
    if (agentId == null) return
    for (const skill of privateCopies(entry, skills)) {
      try {
        await this.call('deleteAgentWorkflow', {
          id: agentId,
          workflowId: skill.id,
        })
      } catch {
        // Let go, as the overlay does.
      }
    }
  }

  /** A private skill's switch (`setAgentWorkflowEnabled`): the agent's skills as they are now. */
  async setSkillEnabled(
    skill: AgentSkill,
    on: boolean,
    agentId: string,
  ): Promise<AgentSkill[]> {
    return listOf(
      await this.call('setAgentWorkflowEnabled', {
        id: agentId,
        workflowId: skill.id,
        isEnabled: on,
      }),
      agentSkillFrom,
    )
  }

  /** Save on a skill's page (`updateAgentWorkflow`): the agent's skills as they are now, when the computer lists them. */
  async updateSkill(
    skill: AgentSkill,
    name: string,
    description: string,
    body: string,
    agentId: string,
  ): Promise<AgentSkill[] | undefined> {
    const answer = await this.call('updateAgentWorkflow', {
      id: agentId,
      workflowId: skill.id,
      spec: skillSpec(skill, name, description, body),
    })
    const list = arr(answer)
    return list ? listOf(list, agentSkillFrom) : undefined
  }

  /** Delete skill (`deleteAgentWorkflow`): the agent's skills as they are now, when the computer lists them. */
  async deleteSkill(
    skillId: string,
    agentId: string,
  ): Promise<AgentSkill[] | undefined> {
    const answer = await this.call('deleteAgentWorkflow', {
      id: agentId,
      workflowId: skillId,
    })
    const list = arr(answer)
    return list ? listOf(list, agentSkillFrom) : undefined
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent, made with its introduction held back (`createAgent`): its id. */
  async createSetupAgent(): Promise<string> {
    const answer = await this.call('createAgent', {
      name: setupAgentName,
      description: setupAgentDescription,
      purpose: setupAgentPurpose,
      isIntroductionSuppressed: true,
    })
    const id =
      text(field(field(answer, 'agent'), 'id')) ?? text(field(answer, 'id'))
    if (id == null)
      throw new GatewayError(
        'gateway createAgent failed: no agent in the answer',
        true,
        undefined,
        'createAgent',
      )
    return id
  }

  /** What the Plugin Setup agent is first told (`Zl`). */
  sendSetupRequest(agentId: string): Promise<void> {
    return this.backend.send(agentId, setupAgentRequest, [], {})
  }
}
