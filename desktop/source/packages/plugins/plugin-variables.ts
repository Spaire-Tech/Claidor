export function expandPluginVariables(value: string, pluginPath: string): string {
  return value
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, () => pluginPath)
    .replace(/\$\{SIMEON_PLUGIN_ROOT\}/g, () => pluginPath)
    // A plugin written for the upstream app names the root this way (docs/kept-names.md).
    .replace(/\$\{CURSOR_PLUGIN_ROOT\}/g, () => pluginPath);
}
