import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { type AppUpdateRuntimeState, AppUpdateStatus } from '../../../shared/appUpdate/constants';
import AppUpdateBlockingPanel from './AppUpdateBlockingPanel';

const createState = (status: AppUpdateRuntimeState['status']): AppUpdateRuntimeState => ({
  status,
  source: null,
  info: {
    latestVersion: '2026.7.16',
    date: '2026-07-16',
    changeLog: {
      // The feed still carries a second locale; the panel only reads `en`.
      zh: { title: 'Unused locale', content: ['Unused first', 'Unused second', 'Unused third'] },
      en: { title: 'This release', content: ['First change', 'Second change', 'Third change'] },
    },
    url: 'https://updates.example.com/maties-2026.7.16.dmg',
  },
  progress: null,
  readyFilePath: '/tmp/maties-update.dmg',
  readyFileHash: 'hash',
  errorMessage: null,
});

const render = (state: AppUpdateRuntimeState): string => renderToStaticMarkup(
  React.createElement(AppUpdateBlockingPanel, { updateState: state }),
);

describe('AppUpdateBlockingPanel', () => {
  test('shows every release note without any actions while installing', () => {
    const html = render(createState(AppUpdateStatus.Installing));

    expect(html).toContain('Installing update');
    expect(html).toContain('The app will close and finish updating in the background');
    expect(html).toContain('v2026.7.16 · 2026-07-16');
    expect(html).toContain('This release');
    expect(html).toContain('First change');
    expect(html).toContain('Second change');
    expect(html).toContain('Third change');
    expect(html).not.toContain('Unused');
    expect(html).toContain('logo.png');
    expect(html).toContain('animate-shimmer');
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('max-h-full');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).not.toContain('What&#x27;s new');
    expect(html).not.toContain('<button');
  });

  test('covers the moment between confirming and the installer taking over', () => {
    const html = render(createState(AppUpdateStatus.Ready));

    expect(html).toContain('Update ready');
    expect(html).toContain('The app will close and finish updating in the background');
    expect(html).toContain('animate-shimmer');
    expect(html).not.toContain('Cancel');
    expect(html).not.toContain('<button');
  });

  test('falls back to a status panel when update metadata is unavailable', () => {
    const state = createState(AppUpdateStatus.Installing);
    state.info = null;

    const html = render(state);

    expect(html).toContain('Installing update');
    expect(html).not.toContain('v2026.7.16');
    expect(html).not.toContain('This release');
  });

  test('labels the release notes generically when the changelog has no title', () => {
    const state = createState(AppUpdateStatus.Installing);
    state.info!.changeLog.en.title = '  ';

    const html = render(state);

    expect(html).toContain('What&#x27;s new');
    expect(html).toContain('First change');
  });
});
