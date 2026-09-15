import { describe, expect, test } from 'vitest';

import { type AxNode, buildAccessibilitySnapshot, describeSnapshot } from './agentBrowserSnapshot';

const node = (
  id: string,
  role: string,
  extra: Partial<AxNode> & { name?: string; children?: string[] } = {},
): AxNode => ({
  nodeId: id,
  role: { value: role },
  ...(extra.name !== undefined ? { name: { value: extra.name } } : {}),
  ...(extra.children ? { childIds: extra.children } : {}),
  ...(extra.parentId ? { parentId: extra.parentId } : {}),
  ...(extra.backendDOMNodeId !== undefined ? { backendDOMNodeId: extra.backendDOMNodeId } : {}),
  ...(extra.ignored ? { ignored: true } : {}),
});

describe('buildAccessibilitySnapshot', () => {
  test('unnamed wrappers are dropped and their children move up', () => {
    const tree = [
      node('1', 'RootWebArea', { name: 'Shop', children: ['2'] }),
      node('2', 'generic', { parentId: '1', children: ['3', '4'] }),
      node('3', 'link', { parentId: '2', name: 'Sweetgreen', backendDOMNodeId: 30 }),
      node('4', 'generic', { parentId: '2', children: ['5'] }),
      node('5', 'button', { parentId: '4', name: 'Order', backendDOMNodeId: 50 }),
    ];
    const built = buildAccessibilitySnapshot(tree, { pageId: 1, title: 'Shop' });
    expect(built.snapshot).toEqual({
      role: 'RootWebArea',
      name: 'Shop',
      children: [
        { id: 'ax-1-3', role: 'link', name: 'Sweetgreen' },
        { id: 'ax-1-5', role: 'button', name: 'Order' },
      ],
    });
    expect(built.shown).toBe(3);
    expect(built.dropped).toBe(0);
    expect([...built.refs.entries()]).toEqual([['ax-1-3', 30], ['ax-1-5', 50]]);
  });

  test('a named generic is kept: it carries something', () => {
    const tree = [
      node('1', 'RootWebArea', { name: 'Page', children: ['2'] }),
      node('2', 'generic', { parentId: '1', name: 'Delivery to 12 Rue Foch' }),
    ];
    const built = buildAccessibilitySnapshot(tree, { pageId: 3, title: 'Page' });
    expect(built.snapshot.children).toEqual([{ role: 'generic', name: 'Delivery to 12 Rue Foch' }]);
  });

  test('the cap counts what is emitted, not what was read, and is reported', () => {
    const children = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const tree = [
      node('1', 'RootWebArea', { name: 'Feed', children: ['w'] }),
      node('w', 'generic', { parentId: '1', children }),
      ...children.map((id, i) => node(id, 'link', { parentId: 'w', name: `Place ${i}`, backendDOMNodeId: 100 + i })),
    ];
    const built = buildAccessibilitySnapshot(tree, { pageId: 1, title: 'Feed', cap: 4 });
    expect(built.shown).toBe(4);
    expect(built.dropped).toBe(7);
    expect(built.snapshot.children).toHaveLength(3);
    expect(describeSnapshot(built)).toContain('4 nodes shown, 7 further down not shown');
    expect(describeSnapshot(built)).toContain('do not conclude it is absent');
    // Only what was emitted can be clicked; a ref to a cut node would be a lie.
    expect(built.refs.size).toBe(3);
  });

  test('a whole page says nothing about cutting', () => {
    const built = buildAccessibilitySnapshot([node('1', 'RootWebArea', { name: 'Blank' })], { pageId: 1, title: 'Blank' });
    expect(describeSnapshot(built)).toBe('Accessibility snapshot captured.');
    expect(describeSnapshot(built, 'Element clicked. The page has settled.')).toBe('Element clicked. The page has settled.');
  });

  test('ignored nodes and cycles do not reach the agent', () => {
    const tree = [
      node('1', 'RootWebArea', { name: 'Loop', children: ['2', '3'] }),
      node('2', 'link', { parentId: '1', name: 'Back to 1', children: ['1'] }),
      node('3', 'link', { parentId: '1', name: 'Hidden', ignored: true }),
    ];
    const built = buildAccessibilitySnapshot(tree, { pageId: 1, title: 'Loop' });
    expect(built.snapshot.children).toEqual([{ role: 'link', name: 'Back to 1' }]);
  });
});
