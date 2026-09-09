import { describe, expect, test } from 'vitest';

import { type Artifact, ArtifactTypeValue } from '@/types/artifact';

import {
  getPreviewCardDescriptor,
  PreviewCardDisplayKind,
  PreviewCardIconKind,
  PreviewCardOpenAction,
} from './previewCardPolicy';

const makeArtifact = (overrides: Partial<Artifact>): Artifact => ({
  id: 'artifact-1',
  messageId: 'message-1',
  sessionId: 'session-1',
  type: ArtifactTypeValue.Html,
  title: 'Welcome page',
  content: '',
  createdAt: 1,
  ...overrides,
});

describe('preview card presentation policy', () => {
  test('presents an HTML artifact as a web page while keeping browser open behavior', () => {
    const descriptor = getPreviewCardDescriptor(makeArtifact({
      fileName: 'welcome.html',
      filePath: '/tmp/welcome.html',
    }));

    expect(descriptor).toMatchObject({
      displayKind: PreviewCardDisplayKind.WebPage,
      iconKind: PreviewCardIconKind.File,
      title: 'Welcome page',
      subtitle: 'Web page',
      iconFileName: 'welcome.html',
      defaultOpenAction: PreviewCardOpenAction.Browser,
    });
  });

  test('forces the HTML file icon when an inline web page has no extension', () => {
    const descriptor = getPreviewCardDescriptor(makeArtifact({
      title: 'Inline page',
      fileName: undefined,
      filePath: undefined,
    }));

    expect(descriptor.iconKind).toBe(PreviewCardIconKind.File);
    expect(descriptor.iconFileName).toBe('page.html');
  });

  test('presents a local service separately with a globe icon', () => {
    const descriptor = getPreviewCardDescriptor(makeArtifact({
      type: ArtifactTypeValue.LocalService,
      title: 'Order system',
      url: 'http://localhost:4173',
      content: 'http://localhost:4173',
    }));

    expect(descriptor).toMatchObject({
      displayKind: PreviewCardDisplayKind.LocalService,
      iconKind: PreviewCardIconKind.Globe,
      title: 'Order system',
      subtitle: 'Local service',
      defaultOpenAction: PreviewCardOpenAction.Browser,
    });
  });

  test('keeps regular files on file icons and preview behavior', () => {
    const descriptor = getPreviewCardDescriptor(makeArtifact({
      type: ArtifactTypeValue.Document,
      title: 'Quarterly report.pdf',
      fileName: 'Quarterly report.pdf',
      filePath: '/tmp/Quarterly report.pdf',
    }));

    expect(descriptor).toMatchObject({
      displayKind: PreviewCardDisplayKind.Document,
      iconKind: PreviewCardIconKind.File,
      subtitle: 'Document · PDF',
      defaultOpenAction: PreviewCardOpenAction.Preview,
    });
  });
});
