import { describe, expect, test } from 'vitest';

import type { CoworkMessage } from '../../types/cowork';
import type { ConsolidatedItem, ToolGroupItem } from './messageDisplayUtils';
import {
  collapseRepeatedFailures,
  FailureRunSlotKind,
  getFileBasename,
  getToolStepFailureText,
  getToolStepKind,
  getToolStepResult,
  getToolStepSubline,
  getToolStepTitle,
  planRepeatedFailureCollapse,
  stripEngineMarkers,
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

  test('the engine’s wrapper markers never reach the card', () => {
    const wrapped = [
      '<<<EXTERNAL_UNTRUSTED_CONTENT id="2c2f5fad50c00778">>>',
      '/opt/homebrew/lib',
      '<<<END_EXTERNAL_UNTRUSTED_CONTENT id="2c2f5fad50c00778">>>',
    ].join('\n');
    expect(stripEngineMarkers(wrapped)).toBe('/opt/homebrew/lib');
    const command = group(toolUse('exec', { command: 'brew --prefix' }), toolResult(wrapped));
    expect(getToolStepResult(command)).toEqual({ type: 'line', text: '/opt/homebrew/lib' });
  });

  test('the runtime’s own warnings never reach the card', () => {
    // What the founder saw on a step that had just written a document: a
    // warning addressed to whoever builds the program, on the error stream,
    // making a step that worked read as though it had gone wrong.
    const noisy = [
      '(node:23355) Warning: `--localstorage-file` was provided without a valid path',
      '(Use `node --trace-warnings ...` to show where the warning was created)',
      'npm notice New major version of npm available! 11.12.1 -> 12.0.2',
      'Productivity Plan.docx written',
    ].join('\n');
    expect(stripEngineMarkers(noisy)).toBe('Productivity Plan.docx written');
  });

  test('a real failure still reaches the card', () => {
    // The filter must not learn to swallow bad news. Nothing here
    // announces itself as a warning, so nothing here is dropped.
    const failed = [
      'Error: ENOENT: no such file or directory',
      '    at Object.open (node:fs:1234)',
      'npm error code ENOENT',
    ].join('\n');
    expect(stripEngineMarkers(failed)).toBe(failed);
  });

  test('a real path stays exactly as it is', () => {
    const command = group(toolUse('exec', { command: 'brew --prefix' }), toolResult('/opt/homebrew/lib\n'));
    expect(getToolStepResult(command)).toEqual({ type: 'line', text: '/opt/homebrew/lib' });
  });

  test('a line of brackets or punctuation is never shown', () => {
    const brackets = group(toolUse('exec', { command: 'x' }), toolResult('(\n)\n  ,\n---\nthe run finished'));
    expect(getToolStepResult(brackets)).toEqual({ type: 'line', text: 'the run finished' });
    const nothing = group(toolUse('exec', { command: 'x' }), toolResult('}\n]\n'));
    expect(getToolStepResult(nothing)).toEqual({ type: 'line', text: 'Done' });
  });

  test('pretty-printed JSON says something true instead of a lone brace', () => {
    const object = group(
      toolUse('mcp__notion__query', { database: 'x' }),
      toolResult('{\n  "ok": true,\n  "title": "Q3 board pack",\n  "rows": 42\n}'),
    );
    expect(getToolStepResult(object)).toEqual({ type: 'line', text: 'Q3 board pack' });

    const array = group(
      toolUse('mcp__notion__query', { database: 'x' }),
      toolResult('[\n  { "id": 1 },\n  { "id": 2 },\n  { "id": 3 }\n]'),
    );
    expect(getToolStepResult(array)).toEqual({ type: 'line', text: '3 items', number: '3' });

    const single = group(toolUse('mcp__notion__query', {}), toolResult('[{ "id": 1 }]'));
    expect(getToolStepResult(single)).toEqual({ type: 'line', text: '1 item', number: '1' });

    const opaque = group(toolUse('mcp__notion__query', {}), toolResult('{\n  "ok": true,\n  "rows": 42\n}'));
    expect(getToolStepResult(opaque)).toEqual({ type: 'line', text: 'Done' });

    // Truncated JSON parses no better than a brace does, and says as little.
    const truncated = group(toolUse('mcp__notion__query', {}), toolResult('{\n  "rows": [\n'));
    expect(getToolStepResult(truncated)).toEqual({ type: 'line', text: 'Done' });
  });

  test('a numbered list is not JSON because it opens with a bracket', () => {
    const search = group(
      toolUse('web_search', { query: 'q' }),
      toolResult('[1] https://a.example\n[2] https://b.example'),
    );
    expect(getToolStepResult(search)).toEqual({ type: 'line', text: '2 results', number: '2' });
  });

  test('a JSON search result counts what it found', () => {
    const search = group(
      toolUse('search_library', { query: 'OHADA' }),
      toolResult('<<<EXTERNAL_UNTRUSTED_CONTENT id="2c2f5fad50c00778">>>\n[{"a":1},{"a":2}]\n<<<END>>>'),
    );
    expect(getToolStepResult(search)).toEqual({ type: 'line', text: '2 results', number: '2' });
  });

  test('a failure in JSON says what failed, not a brace', () => {
    const failed = group(
      toolUse('read', {}),
      toolResult('{\n  "message": "The file is locked by another program"\n}', true),
    );
    expect(getToolStepResult(failed)).toEqual({ type: 'line', text: 'The file is locked by another program' });
    const opaque = group(toolUse('read', {}), toolResult('{\n  "code": 13\n}', true));
    expect(getToolStepResult(opaque)).toEqual({ type: 'line', text: 'Could not read the file' });
  });

  test('basenames', () => {
    expect(getFileBasename('/a/b/c.txt')).toBe('c.txt');
    expect(getFileBasename('C:\\a\\b\\')).toBe('b');
    expect(getFileBasename('plain.md')).toBe('plain.md');
  });
});

describe('a run of failures is one card', () => {
  const failure = (tool: string) => ({ kind: FailureRunSlotKind.Failure, tool } as const);
  const worked = { kind: FailureRunSlotKind.Boundary } as const;
  const thinking = { kind: FailureRunSlotKind.Transparent } as const;

  test('three fumbles of the same tool leave one card standing', () => {
    const plan = planRepeatedFailureCollapse([
      failure('browser'),
      failure('browser'),
      failure('browser'),
      worked,
    ]);
    // The first attempt survives with its real error text; only the
    // repeats fold into it.
    expect([...plan.foldedIndexes]).toEqual([1, 2]);
    expect(plan.repeatedByIndex.get(0)).toEqual({ attempts: 3, changedApproach: true });
  });

  test('thinking between two attempts does not break the run; an answer does', () => {
    expect([...planRepeatedFailureCollapse([
      failure('browser'),
      thinking,
      failure('browser'),
    ]).foldedIndexes]).toEqual([2]);

    // A word addressed to the person is a real boundary: two separate
    // failures either side of it are two separate pieces of news.
    expect([...planRepeatedFailureCollapse([
      failure('browser'),
      worked,
      failure('browser'),
    ]).foldedIndexes]).toEqual([]);
  });

  test('different tools are different news and never fold together', () => {
    const plan = planRepeatedFailureCollapse([failure('browser'), failure('exec')]);
    expect([...plan.foldedIndexes]).toEqual([]);
    expect(plan.repeatedByIndex.size).toBe(0);
  });

  test('a run that is still the last thing that happened does not claim a pivot', () => {
    const plan = planRepeatedFailureCollapse([failure('browser'), failure('browser')]);
    expect(plan.repeatedByIndex.get(0)).toEqual({ attempts: 2, changedApproach: false });
  });

  test('a single failure is never folded, and never annotated', () => {
    const plan = planRepeatedFailureCollapse([failure('browser'), worked]);
    expect([...plan.foldedIndexes]).toEqual([]);
    expect(plan.repeatedByIndex.size).toBe(0);
  });

  test('the card says what failed and that it tried more than once', () => {
    // Without a run, the wording is exactly what it always was.
    expect(getToolStepFailureText(ToolStepKind.Browser)).toBe('The page could not be opened');
    expect(getToolStepFailureText(ToolStepKind.Browser, { attempts: 1, changedApproach: true }))
      .toBe('The page could not be opened');
    expect(getToolStepFailureText(ToolStepKind.Browser, { attempts: 3, changedApproach: true }))
      .toBe('The page could not be opened · tried 3 times, then changed approach');
    // Still fumbling: the card reports the attempts and claims nothing more.
    expect(getToolStepFailureText(ToolStepKind.Browser, { attempts: 3, changedApproach: false }))
      .toBe('The page could not be opened · tried 3 times');
  });

  describe('over the rendered step list', () => {
    const step = (id: string, tool: string, isError: boolean, done = true): ConsolidatedItem => ({
      type: 'tool_group',
      group: {
        type: 'tool_group',
        toolUse: { id, type: 'tool_use', content: '', timestamp: 1, metadata: { toolName: tool, toolInput: {} } },
        toolResult: done
          ? { id: `${id}-r`, type: 'tool_result', content: isError ? 'element not found' : 'ok', timestamp: 2, metadata: { isError } }
          : null,
      },
    });
    const answer = (id: string): ConsolidatedItem => ({
      type: 'assistant',
      message: { id, type: 'assistant', content: 'Here is what I found.', timestamp: 3 },
    });

    test('the founder’s three identical browser clicks become one step', () => {
      const collapsed = collapseRepeatedFailures([
        step('a', 'browser', true),
        step('b', 'browser', true),
        step('c', 'browser', true),
        step('d', 'read', false),
        answer('e'),
      ]);

      expect(collapsed).toHaveLength(3);
      const first = collapsed[0];
      expect(first.type === 'tool_group' && first.group.toolUse.id).toBe('a');
      expect(first.type === 'tool_group' && first.group.repeatedFailure)
        .toEqual({ attempts: 3, changedApproach: true });
      // The answer and the step that worked are untouched and in place.
      expect(collapsed[1].type === 'tool_group' && collapsed[1].group.toolUse.id).toBe('d');
      expect(collapsed[2].type).toBe('assistant');
    });

    test('a real failure still reaches the card, with its own reason', () => {
      // One failure is news. It is neither folded, annotated, nor stripped
      // of the reason the step gives for failing: a filter that learns to
      // swallow bad news is worse than the noise it removed.
      const items = [step('a', 'browser', true), answer('b')];
      const collapsed = collapseRepeatedFailures(items);
      expect(collapsed).toBe(items);

      const failed = collapsed[0];
      expect(failed.type === 'tool_group' && failed.group.repeatedFailure).toBeUndefined();
      expect(failed.type === 'tool_group' && getToolStepResult(failed.group))
        .toEqual({ type: 'line', text: 'element not found' });
    });

    test('the surviving card of a run keeps the failure’s own reason', () => {
      const collapsed = collapseRepeatedFailures([
        step('a', 'browser', true),
        step('b', 'browser', true),
        answer('c'),
      ]);
      const survivor = collapsed[0];
      expect(survivor.type === 'tool_group' && getToolStepResult(survivor.group))
        .toEqual({ type: 'line', text: 'element not found' });
    });

    test('a step still running is never folded away underneath a person', () => {
      const items = [
        step('a', 'browser', true),
        step('b', 'browser', false, false),
        step('c', 'browser', true),
      ];
      const collapsed = collapseRepeatedFailures(items);
      // The running step sits between two failures of the same tool: it is
      // neither a failure nor a boundary, so the run spans it and the
      // running card stays exactly where it is.
      expect(collapsed).toHaveLength(2);
      expect(collapsed[1].type === 'tool_group' && collapsed[1].group.toolUse.id).toBe('b');
    });
  });
});
