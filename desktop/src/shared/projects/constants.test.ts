import { describe, expect, test } from 'vitest';

import {
  isProjectId,
  PROJECT_MEMORY_FILE,
  ProjectError,
  projectId,
  projectMemoryPath,
  projectProblem,
  projectProblemText,
  slugify,
} from './constants';

const known = ['eng', 'design'];

describe('turning a name into something safe for a filesystem', () => {
  test('lower case, hyphens, nothing else', () => {
    expect(slugify('Q4 Board Deck')).toBe('q4-board-deck');
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
  });

  test('accents are folded rather than dropped into escapes', () => {
    expect(slugify('Résumé Refresh')).toBe('resume-refresh');
  });

  test('punctuation cannot become a path', () => {
    // A directory name built from arbitrary text is how traversal and
    // case-collision bugs get in.
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a/b\\c')).toBe('a-b-c');
    expect(slugify('....')).toBe('');
  });

  test('a very long name is cut rather than making a very long path', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(48);
  });
});

describe('whether a project can be made', () => {
  test('a name is enough', () => {
    expect(projectProblem({ name: 'Q4 Deck', memberIds: [] }, known, [])).toBeUndefined();
  });

  test('a project with no members is allowed', () => {
    // Somebody may set one up before deciding who works on it. Refusing
    // would make them invent a member to get past the form.
    expect(projectProblem({ name: 'Q4 Deck', memberIds: [] }, known, [])).toBeUndefined();
  });

  test('a nameless project is refused', () => {
    expect(projectProblem({ name: '  ', memberIds: [] }, known, [])).toBe(ProjectError.NoName);
  });

  test('a name that slugifies to nothing is refused, and says why', () => {
    // Better than creating a project whose directory has no name.
    expect(projectProblem({ name: '!!!', memberIds: [] }, known, [])).toBe(ProjectError.NoSlug);
    expect(projectProblemText(ProjectError.NoSlug)).toMatch(/adding a word/);
  });

  test('two projects cannot share a slug', () => {
    expect(projectProblem({ name: 'Q4 Deck', memberIds: [] }, known, ['q4-deck']))
      .toBe(ProjectError.Duplicate);
    // Different text, same slug — which is the case a name check alone
    // would miss.
    expect(projectProblem({ name: 'q4   deck', memberIds: [] }, known, ['q4-deck']))
      .toBe(ProjectError.Duplicate);
  });

  test('an agent that no longer exists is refused', () => {
    expect(projectProblem({ name: 'Q4', memberIds: ['gone'] }, known, []))
      .toBe(ProjectError.Unknown);
  });

  test('the same agent twice is refused', () => {
    expect(projectProblem({ name: 'Q4', memberIds: ['eng', 'eng'] }, known, []))
      .toBe(ProjectError.DuplicateMember);
  });
});

describe('where the shared memory lives', () => {
  test('under the project, not inside any one agent’s workspace', () => {
    // No agent owns it. Every member opens the same path, which is the
    // whole reason this needs no sync.
    expect(projectMemoryPath('/state/projects', 'q4-deck'))
      .toBe(`/state/projects/q4-deck/${PROJECT_MEMORY_FILE}`);
  });
});

describe('project ids', () => {
  test('they are distinguishable from agents and rooms', () => {
    expect(isProjectId('project:abc')).toBe(true);
    expect(isProjectId('room:abc')).toBe(false);
    expect(isProjectId('engineering-lead')).toBe(false);
  });

  test('prefixing twice does not double it', () => {
    expect(projectId('abc')).toBe('project:abc');
    expect(projectId('project:abc')).toBe('project:abc');
  });
});

describe('what a person is told when it will not work', () => {
  test('every reason says which thing is wrong', () => {
    for (const problem of Object.values(ProjectError)) {
      const text = projectProblemText(problem);
      expect(text.length, problem).toBeGreaterThan(10);
      expect(text, problem).not.toMatch(/error|invalid|failed/i);
    }
  });
});
