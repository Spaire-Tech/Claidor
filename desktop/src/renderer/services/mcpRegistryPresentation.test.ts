import { describe, expect, test } from 'vitest';

import type { McpServerConfig } from '../types/mcp';
import { buildInstalledMcpItems } from './mcpRegistryPresentation';

function server(id: string, registryId?: string): McpServerConfig {
  return {
    id,
    name: id,
    description: '',
    enabled: true,
    transportType: 'http',
    url: `https://example.com/${id}`,
    isBuiltIn: Boolean(registryId),
    registryId,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('buildInstalledMcpItems', () => {
  test('infers a group from multiple historical records with the same registry id', () => {
    const items = buildInstalledMcpItems([
      server('first'),
      server('bundle-one', 'bundle'),
      server('bundle-two', 'bundle'),
      server('last'),
    ]);

    expect(items.map(item => item.id)).toEqual(['first', 'bundle', 'last']);
    expect(items[1]).toEqual(expect.objectContaining({
      kind: 'registryGroup',
      servers: [
        expect.objectContaining({ id: 'bundle-one' }),
        expect.objectContaining({ id: 'bundle-two' }),
      ],
    }));
  });

  test('keeps a lone server from a past install as an individual item', () => {
    expect(buildInstalledMcpItems([server('one', 'single')]))
      .toEqual([expect.objectContaining({ kind: 'server', id: 'one' })]);
  });

  test('keeps hand-added servers as individual items', () => {
    expect(buildInstalledMcpItems([server('one'), server('two')]).map(item => item.id))
      .toEqual(['one', 'two']);
  });
});
