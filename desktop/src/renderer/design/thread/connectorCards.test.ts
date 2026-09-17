import { describe, expect, test } from 'vitest';

import {
  connectorItem,
  connectorItemId,
  connectorNote,
  connectorNoteItem,
  connectorRequestId,
} from './connectorCards';
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
  });

  test('a connector the catalogue does not have is no card', () => {
    expect(connectorItem({ requestId: 'r1', connectionId: 'myspace' }, {}, 0)).toBeUndefined();
  });

  test('busy rides on the card while the sign-in runs', () => {
    const busy = connectorItem({ requestId: 'r1', connectionId: 'notion' }, { busy: true }, 0);
    expect(busy?.busy).toBe(true);
  });

  test('the id round-trips the request id and refuses anything else', () => {
    expect(connectorRequestId(connectorItemId('abc-1'))).toBe('abc-1');
    expect(connectorRequestId('staff:abc-1')).toBeUndefined();
    expect(connectorRequestId('auth:abc-1')).toBeUndefined();
  });
});

describe('the line an answered card leaves behind', () => {
  test('connected says so, in the service\'s own name', () => {
    expect(connectorNote('Figma', ConnectorOutcome.Connected)).toBe('Figma is connected.');
  });

  test('declined is the person\'s own words back, and never names a failure', () => {
    expect(connectorNote('Figma', ConnectorOutcome.Declined)).toBe('Not now.');
  });

  test('failed carries the reason, with one full stop and not two', () => {
    expect(connectorNote('Figma', ConnectorOutcome.Failed, 'the sign-in window was closed.'))
      .toBe('Figma was not connected — the sign-in window was closed.');
    expect(connectorNote('Figma', ConnectorOutcome.Failed, '  the account was refused  '))
      .toBe('Figma was not connected — the account was refused.');
  });

  test('failed with no reason still says what happened', () => {
    expect(connectorNote('Figma', ConnectorOutcome.Failed)).toBe('Figma was not connected.');
    expect(connectorNote('Figma', ConnectorOutcome.Failed, '   ')).toBe('Figma was not connected.');
  });

  test('the line is a system item with an id of its own, not the card\'s', () => {
    const note = connectorNoteItem('r1', 'Figma is connected.', 9);
    expect(note).toEqual({
      kind: ThreadItemKind.System,
      id: 'note:connector:r1',
      text: 'Figma is connected.',
      at: 9,
    });
    expect(note.id).not.toBe(connectorItemId('r1'));
  });
});
