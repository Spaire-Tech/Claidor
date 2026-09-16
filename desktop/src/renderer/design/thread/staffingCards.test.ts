import { describe, expect, test, vi } from 'vitest';

import { composeAuthHandlers, staffingItem, staffingRequestId } from './staffingCards';
import { AuthDecision, ThreadItemKind } from './types';

const ask = {
  requestId: 'req-1',
  name: 'Projects Manager',
  label: 'Project ops',
  job: 'Runs projects; specialists claim tasks.',
  antiJobs: ["Won't do specialist work itself"],
};

describe('the card Yodo raises to stand up an agent', () => {
  test('is the permission card, with the brief where the command goes', () => {
    const item = staffingItem(ask, 'Yodo', 1);
    expect(item.kind).toBe(ThreadItemKind.Auth);
    expect(item.id).toBe('staff:req-1');
    expect(item.text).toBe('Allow Yodo to continue — standing up Projects Manager, Project ops?');
    expect(item.note).toBe('Runs projects; specialists claim tasks.');
    expect(item.command).toContain("- Won't do specialist work itself");
    expect(item.staffing).toBe(true);
  });

  test('names nobody it does not know', () => {
    expect(staffingItem(ask, undefined, 1).text).toMatch(/^Allow this agent to continue/);
  });
});

describe('where the buttons go', () => {
  test('a staffing card answers the staffing bridge, an engine card answers the engine', () => {
    const engine = { onDecide: vi.fn() };
    const staffing = { onDecide: vi.fn() };
    const handlers = composeAuthHandlers(engine, staffing);

    handlers.onDecide('staff:req-1', AuthDecision.Once);
    expect(staffing.onDecide).toHaveBeenCalledWith('req-1', true);
    handlers.onDecide('staff:req-1', AuthDecision.Never);
    expect(staffing.onDecide).toHaveBeenLastCalledWith('req-1', false);
    expect(engine.onDecide).not.toHaveBeenCalled();

    handlers.onDecide('auth:req-2', AuthDecision.Always);
    expect(engine.onDecide).toHaveBeenCalledWith('auth:req-2', AuthDecision.Always);
    expect(staffing.onDecide).toHaveBeenCalledTimes(2);
  });

  test('only the marked id is a staffing card', () => {
    expect(staffingRequestId('staff:abc')).toBe('abc');
    expect(staffingRequestId('auth:abc')).toBeUndefined();
    expect(staffingRequestId('staffing')).toBeUndefined();
  });
});
