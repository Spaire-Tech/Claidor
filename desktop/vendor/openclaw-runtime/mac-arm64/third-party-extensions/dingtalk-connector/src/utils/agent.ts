/**
 * Agent 相关工具函数
 * 
 * 提供 Agent 配置解析、工作空间路径解析等功能
 */
import * as os from "node:os";
import * as path from "node:path";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

/**
 * 解析 Agent 工作空间路径
 * 
 * 参考 OpenClaw SDK 的 resolveAgentWorkspaceDir 实现逻辑：
 * 1. 优先从 agents.list 中查找用户配置的 workspace
 * 2. 如果没有配置，使用默认路径规则：
 *    - 默认 Agent (main): ~/.openclaw/workspace
 *    - 其他 Agent: ~/.openclaw/workspace-{agentId}
 * 
 * @param cfg - OpenClaw 配置对象
 * @param agentId - Agent ID
 * @returns Agent 工作空间的绝对路径
 * 
 * @example
 * ```typescript
 * // 用户自定义工作空间
 * const cfg = {
 *   agents: {
 *     list: [{ id: 'bot1', workspace: '~/my-workspace' }]
 *   }
 * };
 * resolveAgentWorkspaceDir(cfg, 'bot1'); // => '/Users/xxx/my-workspace'
 * 
 * // 默认 Agent
 * resolveAgentWorkspaceDir(cfg, 'main'); // => '/Users/xxx/.openclaw/workspace'
 * 
 * // 其他 Agent
 * resolveAgentWorkspaceDir(cfg, 'bot2'); // => '/Users/xxx/.openclaw/workspace-bot2'
 * ```
 */
export function resolveAgentWorkspaceDir(
  cfg: ClawdbotConfig,
  agentId: string,
): string {
  const expandWorkspacePath = (workspace: string): string => (
    /* dingtalk_agent_workspace_defaults_patch */ workspace.startsWith('~')
      ? path.join(os.homedir(), workspace.slice(1))
      : workspace
  );

  const agentConfig = cfg.agents?.list?.find((a: any) => a.id === agentId);
  const configuredWorkspace = agentConfig?.workspace?.trim();
  if (configuredWorkspace) {
    return expandWorkspacePath(configuredWorkspace);
  }

  const defaultAgentId =
    cfg.defaultAgent ||
    cfg.agents?.list?.find((a: any) => a?.default === true)?.id ||
    'main';
  const fallbackWorkspace = cfg.agents?.defaults?.workspace?.trim();

  if (agentId === 'main' || agentId === defaultAgentId) {
    if (fallbackWorkspace) {
      return expandWorkspacePath(fallbackWorkspace);
    }
    return path.join(os.homedir(), '.openclaw', 'workspace');
  }

  if (fallbackWorkspace) {
    return path.join(expandWorkspacePath(fallbackWorkspace), agentId);
  }

  return path.join(os.homedir(), '.openclaw', `workspace-${agentId}`);
}
