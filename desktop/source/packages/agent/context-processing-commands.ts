export interface SelectedAgentCommandForPrompt {
  readonly name: string;
  readonly content: string;
}

export interface AgentCommandsTextContent {
  readonly type: "text";
  readonly text: string;
}

// Extracted from ../packages/agent/dist/context-processing.js as an
// uncomposed cursor-command prompt leaf. The parent processSelectedContext
// function remains absent.
export function renderSelectedAgentCommands(
  agentCommands: readonly SelectedAgentCommandForPrompt[],
): AgentCommandsTextContent | undefined {
  if (agentCommands.length === 0) {
    return undefined;
  }
  const commandsText = agentCommands.map((command) => `

--- Command: ${command.name} ---
${command.content}
--- End Command ---`).join("\n");
  if (!commandsText) {
    return undefined;
  }
  return {
    type: "text",
    text: `<commands>${commandsText}
</commands>`,
  };
}
