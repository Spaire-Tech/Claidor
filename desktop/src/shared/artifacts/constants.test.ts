import { describe, expect, test } from 'vitest';

import { ArtifactKind, artifactKindOf, artifactTitleOf, rootComponentOf } from './constants';

describe('artifactKindOf', () => {
  test('a deck and a report are told by their root', () => {
    expect(artifactKindOf('root = SlideShow("Q4", "", [s1])\ns1 = Slide("s1", StandardTitle("Q4"))')).toBe(ArtifactKind.Presentation);
    expect(artifactKindOf('root = ReportView("Q4", "", [p1])')).toBe(ArtifactKind.Report);
  });

  test('answer cards are not an artifact', () => {
    expect(artifactKindOf('root = Stack([a])\na = Tile("Canlis")')).toBeUndefined();
    expect(rootComponentOf('root = Stack([a])')).toBe('Stack');
  });

  test('the root is read wherever it sits, and nowhere else', () => {
    expect(artifactKindOf('s1 = Slide("s1", StandardTitle("Q4"))\nroot = SlideShow("Q4", "", [s1])')).toBe(ArtifactKind.Presentation);
    expect(artifactKindOf('a = Text("root = SlideShow(")')).toBeUndefined();
    expect(artifactKindOf('')).toBeUndefined();
  });
});

describe('artifactTitleOf', () => {
  test('is the first argument of the root line', () => {
    expect(artifactTitleOf('root = SlideShow("Q4 Board Update", "September", [s1])')).toBe('Q4 Board Update');
    expect(artifactTitleOf('root = ReportView("Say \\"hi\\"", "", [p1])')).toBe('Say "hi"');
  });

  test('is nothing for cards or a deck with no title', () => {
    expect(artifactTitleOf('root = Stack([a], "Best restaurants")')).toBeUndefined();
    expect(artifactTitleOf('root = SlideShow(')).toBeUndefined();
  });
});
