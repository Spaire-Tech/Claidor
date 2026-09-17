import { describe, expect, test } from 'vitest';

import { connectorItem, connectorItemId, connectorRequestId } from './connectorCards';
import { ConnectorOutcome, ThreadItemKind } from './types';

describe('connectorCards', () => {
  test('the card carries the catalogue entry and the agent\'s reason', () => {
    const item = connectorItem({ requestId: 'r1', connectionId: 'gmail', reason: 'To read the thread you named.' }, {}, 5);
    expect(item).toMatchObject({
      kind: ThreadItemKind.Connector,
      id: 'connector:r1',
      connectionId: 'gmail',
      name: 'Gmail',
      line: 'Search, read, draft, and manage email.',
      logo: 'gmail.webp',
      reason: 'To read the thread you named.',
      at: 5,
    });
    expect(item?.busy).toBeUndefined();
    expect(item?.resolved).toBeUndefined();
  });

  test('a connector the catalogue does not have is no card', () => {
    expect(connectorItem({ requestId: 'r1', connectionId: 'myspace' }, {}, 0)).toBeUndefined();
  });

  test('busy, resolved and failure ride on the card', () => {
    const busy = connectorItem({ requestId: 'r1', connectionId: 'notion' }, { busy: true }, 0);
    expect(busy?.busy).toBe(true);
    const failed = connectorItem(
      { requestId: 'r1', connectionId: 'notion' },
      { resolved: ConnectorOutcome.Failed, failure: 'Notion said no to that account.' },
      0,
    );
    expect(failed?.resolved).toBe(ConnectorOutcome.Failed);
    expect(failed?.failure).toBe('Notion said no to that account.');
  });

  test('the id round-trips the request id and refuses anything else', () => {
    expect(connectorRequestId(connectorItemId('abc-1'))).toBe('abc-1');
    expect(connectorRequestId('staff:abc-1')).toBeUndefined();
    expect(connectorRequestId('auth:abc-1')).toBeUndefined();
  });
});
