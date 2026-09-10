import { describe, expect, test } from 'vitest';

import type { CoworkMessage } from '../../types/cowork';
import type { ToolGroupItem } from './messageDisplayUtils';
import {
  getFileBasename,
  getToolStepFailureText,
  getToolStepKind,
  getToolStepResult,
  getToolStepSubline,
  getToolStepTitle,
  ToolStepKind,
} from './toolStepPresentation';

const toolUse = (toolName: string, toolInput: Record<string, unknown>): CoworkMessage => ({
  id: `use-${toolName}`,
  type: 'tool_use',
  content: '',
  timestamp: 1,
  metadata: { toolName, toolInput },
});

const toolResult = (content: string, isError = false): CoworkMessage => ({
  id: 'result',
  type: 'tool_result',
  content,
  timestamp: 2,
  metadata: { isError },
});

const group = (use: CoworkMessage, result?: CoworkMessage): ToolGroupItem => ({
  type: 'tool_group',
  toolUse: use,
  toolResult: result ?? null,
});

describe('a step in plain words', () => {
  test('maps the engine tool names to kinds', () => {
    expect(getToolStepKind('read')).toBe(ToolStepKind.Read);
    expect(getToolStepKind('exec')).toBe(ToolStepKind.Command);
    expect(getToolStepKind('Bash')).toBe(ToolStepKind.Command);
    expect(getToolStepKind('web_search')).toBe(ToolStepKind.WebSearch);
    expect(getToolStepKind('web_fetch')).toBe(ToolStepKind.WebPage);
    expect(getToolStepKind('browser')).toBe(ToolStepKind.Browser);
    expect(getToolStepKind('search_library')).toBe(ToolStepKind.Library);
    expect(getToolStepKind('sessions_spawn')).toBe(ToolStepKind.AgentStart);
    expect(getToolStepKind('multi_edit')).toBe(ToolStepKind.Edit);
    expect(getToolStepKind('mcp__notion__query')).toBe(ToolStepKind.Tool);
    expect(getToolStepKind(undefined)).toBe(ToolStepKind.Tool);
  });

  test('titles never say the tool name', () => {
    expect(getToolStepTitle(ToolStepKind.Read)).toBe('Reading a file');
    expect(getToolStepTitle(ToolStepKind.WebSearch)).toBe('Searching the web');
    expect(getToolStepTitle(ToolStepKind.Command)).toBe('Running a command');
    expect(getToolStepTitle(ToolStepKind.Edit)).toBe('Editing a file');
    expect(getToolStepTitle(ToolStepKind.Library)).toBe('Looking in the library');
    expect(getToolStepTitle(ToolStepKind.Browser)).toBe('Opening the browser');
    expect(getToolStepTitle(ToolStepKind.Tool)).toBe('Using a tool');
    for (const kind of Object.values(ToolStepKind)) {
      expect(getToolStepTitle(kind)).not.toMatch(/exec|token|index|permission/i);
    }
  });

  test('a failure says what failed in plain words', () => {
    expect(getToolStepFailureText(ToolStepKind.Read)).toBe('Could not read the file');
    expect(getToolStepFailureText(ToolStepKind.Command)).toBe('The command did not finish');
    expect(getToolStepFailureText(ToolStepKind.Tool)).toBe('This step did not work');
  });

  test('the sub-line is the thing the step works on', () => {
    expect(getToolStepSubline('read', { file_path: '/Users/eva/Documents/budget.xlsx' })).toBe('budget.xlsx');
    expect(getToolStepSubline('exec', { command: 'ls -la' })).toBe('ls -la');
    expect(getToolStepSubline('web_search', { query: 'OHADA uniform act' })).toBe('OHADA uniform act');
    expect(getToolStepSubline('mcp__notion__query', { database: 'x' })).toBe('mcp__notion__query');
  });

  test('a file step produces the file with its diff', () => {
    const edit = group(
      toolUse('edit', { file_path: '/tmp/notes.md', old_string: 'a\nb', new_string: 'a\nc\nd' }),
      toolResult('ok'),
    );
    expect(getToolStepResult(edit)).toEqual({
      type: 'file',
      path: '/tmp/notes.md',
      name: 'notes.md',
      diff: { added: 2, removed: 1 },
    });
    const read = group(toolUse('read', { path: 'C:\\Users\\eva\\budget.xlsx' }));
    expect(getToolStepResult(read)).toMatchObject({ type: 'file', name: 'budget.xlsx', diff: null });
  });

  test('a search counts what it found; a page shows its title', () => {
    const search = group(
      toolUse('web_search', { query: 'q' }),
      toolResult('1. https://a.example\n2. https://b.example\n3. https://c.example'),
    );
    expect(getToolStepResult(search)).toMatchObject({ type: 'line', text: '3 results', number: '3' });
    const page = group(
      toolUse('web_fetch', { url: 'https://example.com' }),
      toolResult('<html><head><title>Example Domain</title></head></html>'),
    );
    expect(getToolStepResult(page)).toEqual({ type: 'line', text: 'Example Domain' });
  });

  test('a command shows its first line, a failure its reason', () => {
    const command = group(toolUse('exec', { command: 'npm test' }), toolResult('\n\n 12 passed\n'));
    expect(getToolStepResult(command)).toEqual({ type: 'line', text: '12 passed' });
    const failed = group(toolUse('exec', { command: 'rm x' }), toolResult('', true));
    expect(getToolStepResult(failed)).toEqual({ type: 'line', text: 'The command did not finish' });
    expect(getToolStepResult(group(toolUse('exec', { command: 'sleep 1' })))).toBeNull();
  });

  test('basenames', () => {
    expect(getFileBasename('/a/b/c.txt')).toBe('c.txt');
    expect(getFileBasename('C:\\a\\b\\')).toBe('b');
    expect(getFileBasename('plain.md')).toBe('plain.md');
  });
});
