import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import type { ScheduledTask } from '../../../scheduledTask/types';
import { agentService } from '../../services/agent';
import { mcpService } from '../../services/mcp';
import { scheduledTaskService } from '../../services/scheduledTask';
import { skillService } from '../../services/skill';
import type { RootState } from '../../store';
import type { Agent } from '../../types/agent';
import type { CoworkUserMemoryEntry } from '../../types/cowork';
import type { McpServerConfig } from '../../types/mcp';
import type { Skill } from '../../types/skill';
import { agentRoutines, agentSkills,AgentTab } from './detail';

/**
 * Everything the agent's five tabs need, loaded once when the sheet
 * opens.
 *
 * Five subsystems, five reads. They happen together rather than per tab
 * so that moving between tabs is instant — the alternative is a spinner
 * on every tap for data that was a few milliseconds away.
 *
 * Nothing here invents state the app already owns. Routines live in the
 * scheduled-task slice because toggling one goes through the service
 * that keeps that slice right; the rest are local because no other
 * screen in this shell reads them.
 */

export interface AgentDetailState {
  loading: boolean;
  agent: Agent | null;
  tab: AgentTab;
  onTab: (tab: AgentTab) => void;

  /** Instructions. */
  instructions: string;
  savedInstructions: string;
  onInstructions: (draft: string) => void;
  onSaveInstructions: () => void;
  saving: boolean;

  /** Memories. */
  memories: readonly CoworkUserMemoryEntry[];
  onAddMemory: (text: string) => void;
  onDeleteMemory: (id: string) => void;

  /** Skills: the ones it has, the ones it names but does not have, and all. */
  have: readonly Skill[];
  missing: readonly string[];
  allSkills: readonly Skill[];
  onToggleSkill: (skillId: string, on: boolean) => void;

  /** Routines. */
  routines: readonly ScheduledTask[];
  onToggleRoutine: (id: string, enabled: boolean) => void;
  onDeleteRoutine: (id: string) => void;

  /** Integrations. */
  servers: readonly McpServerConfig[];
  onToggleServer: (id: string, enabled: boolean) => void;
}

export function useAgentDetail(agentId: string, open: boolean): AgentDetailState {
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<AgentTab>(AgentTab.Instructions);

  const [savedInstructions, setSavedInstructions] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const [memories, setMemories] = useState<readonly CoworkUserMemoryEntry[]>([]);
  const [allSkills, setAllSkills] = useState<readonly Skill[]>([]);
  const [servers, setServers] = useState<readonly McpServerConfig[]>([]);

  const tasks = useSelector((state: RootState) => state.scheduledTask.tasks);

  const readMemories = useCallback(async () => {
    const result = await window.electron?.cowork?.listMemoryEntries?.({ agentId });
    setMemories(result?.entries ?? []);
  }, [agentId]);

  // Opening is the only trigger. Closing leaves what was loaded alone:
  // re-opening the same agent a second later should not blank the screen
  // and fill it again.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    // The sheet always opens on the first tab, so somebody who closed it
    // on Routines does not come back to a screen they did not choose.
    setTab(AgentTab.Instructions);

    void (async () => {
      const [full, skills, mcpServers] = await Promise.all([
        window.electron?.agents?.get?.(agentId) ?? Promise.resolve(null),
        skillService.loadSkills(),
        mcpService.loadServers(),
        scheduledTaskService.loadTasks(),
        readMemories(),
      ]);
      if (!current) return;
      setAgent(full ?? null);
      const prompt = full?.systemPrompt ?? '';
      setSavedInstructions(prompt);
      setInstructions(prompt);
      setAllSkills(skills);
      setServers(mcpServers);
      setLoading(false);
    })();

    return () => { current = false; };
  }, [agentId, open, readMemories]);

  const { have, missing } = useMemo(
    () => agentSkills(allSkills, agent?.skillIds ?? []),
    [allSkills, agent],
  );

  const routines = useMemo(() => agentRoutines(tasks, agentId), [tasks, agentId]);

  const onSaveInstructions = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await agentService.updateAgent(agentId, { systemPrompt: instructions });
      // Save what came back, not what was typed. If the store normalised
      // anything, the box should show the version the agent will read.
      const written = updated?.systemPrompt ?? instructions;
      setSavedInstructions(written);
      setInstructions(written);
    } finally {
      setSaving(false);
    }
  }, [agentId, instructions]);

  const onAddMemory = useCallback(async (text: string) => {
    const said = text.trim();
    if (!said) return;
    await window.electron?.cowork?.createMemoryEntry?.({ text: said, agentId });
    await readMemories();
  }, [agentId, readMemories]);

  const onDeleteMemory = useCallback(async (id: string) => {
    await window.electron?.cowork?.deleteMemoryEntry?.({ id, agentId });
    await readMemories();
  }, [agentId, readMemories]);

  const onToggleSkill = useCallback(async (skillId: string, on: boolean) => {
    const current = agent?.skillIds ?? [];
    const next = on
      ? (current.includes(skillId) ? current : [...current, skillId])
      : current.filter(one => one !== skillId);
    const updated = await agentService.updateAgent(agentId, { skillIds: next });
    // The agent record is what decides; showing `next` regardless would
    // leave a tick on a skill the store refused.
    if (updated) setAgent(updated);
  }, [agent, agentId]);

  const onToggleServer = useCallback(async (id: string, enabled: boolean) => {
    const updated = await mcpService.setServerEnabled(id, enabled);
    setServers(updated);
  }, []);

  return {
    loading,
    agent,
    tab,
    onTab: setTab,
    instructions,
    savedInstructions,
    onInstructions: setInstructions,
    onSaveInstructions: () => { void onSaveInstructions(); },
    saving,
    memories,
    onAddMemory: (text: string) => { void onAddMemory(text); },
    onDeleteMemory: (id: string) => { void onDeleteMemory(id); },
    have,
    missing,
    allSkills,
    onToggleSkill: (skillId: string, on: boolean) => { void onToggleSkill(skillId, on); },
    routines,
    onToggleRoutine: (id: string, enabled: boolean) => {
      // The service keeps the scheduled-task slice right and rolls back
      // on failure; it also raises its own message, so a rejected toggle
      // is not silent here.
      void scheduledTaskService.toggleTask(id, enabled).catch(() => undefined);
    },
    onDeleteRoutine: (id: string) => {
      void scheduledTaskService.deleteTask(id).catch(() => undefined);
    },
    servers,
    onToggleServer: (id: string, enabled: boolean) => { void onToggleServer(id, enabled); },
  };
}
