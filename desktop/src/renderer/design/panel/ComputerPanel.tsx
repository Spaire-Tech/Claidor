import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { normalizeBrowserWebAccessConfig } from '../../../shared/browserWebAccess/constants';
import { BrowserDisplayMode } from '../../../shared/browserWebAccess/constants';
import AgentBrowserInAppPanel from '../../components/artifacts/AgentBrowserInAppPanel';
import ArtifactPanel from '../../components/artifacts/ArtifactPanel';
import { configService } from '../../services/config';
import type { RootState } from '../../store';
import { ArtifactSpecialTab, selectSessionArtifacts } from '../../store/slices/artifactSlice';
import { CloseIcon, ComputerIcon, FilesIcon, GlobeIcon } from '../icons';
import { color, line, radius, text, tracking } from '../tokens';

export interface ComputerPanelProps {
  sessionId: string;
  workingDirectory?: string;
  onClose: () => void;
}

/**
 * Watching the agent work.
 *
 * "the computer icon in the top message is the panel built in
 * browser/artifacts stuff from lobster. dont forget that, its mega
 * important." So this is a mount, not a rebuild: `ArtifactPanel` is 8,676
 * lines of preview, file list and artifact rendering, and
 * `AgentBrowserInAppPanel` is the agent's live Chromium. Both are
 * upstream's and both are used whole.
 *
 * What is ours is the frame and the tab strip. Upstream keeps its tab
 * strip outside `ArtifactPanel`, in a 7,000-line session component, so
 * there was one to write either way — and writing it here means the tabs
 * are the ones we can actually stand behind.
 *
 * Two tabs, not five. Subagents and attachments are real tabs in
 * `ArtifactPanel`, but their content is driven by event wiring that lives
 * in that session component — several hundred lines of it — and a tab
 * that opens onto the file list because its panel was never passed is
 * worse than a tab that is not there. They come when the wiring does.
 *
 * The Browser tab is always here, including when the agent is set to use
 * its own window. Hiding it then was the first thing I wrote and it was
 * wrong: `External` is the shipped default, so the tab behind the icon
 * whose entire job is watching the agent work would have been missing for
 * everybody until they changed a setting they had no reason to look at.
 * It says what is happening instead.
 */

const PanelTab = {
  Browser: 'browser',
  Files: 'files',
} as const;
type PanelTab = typeof PanelTab[keyof typeof PanelTab];

export function ComputerPanel({
  sessionId, workingDirectory, onClose,
}: ComputerPanelProps): JSX.Element {
  const artifacts = useSelector((state: RootState) => selectSessionArtifacts(state, sessionId));

  // Upstream only mounts the in-app browser when the config asks for it;
  // in External mode the agent drives its own window and there is nothing
  // here to show.
  const inApp = useMemo(
    () => normalizeBrowserWebAccessConfig(
      configService.getConfig().browserWebAccess,
    ).displayMode === BrowserDisplayMode.InApp,
    [],
  );

  const [tab, setTab] = useState<PanelTab>(inApp ? PanelTab.Browser : PanelTab.Files);

  const tabButton = (value: PanelTab, label: string, icon: JSX.Element): JSX.Element => {
    const on = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        aria-pressed={on}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 30,
          padding: '0 12px', borderRadius: radius.pill, cursor: 'pointer',
          font: 'inherit', fontSize: text.small, letterSpacing: tracking.body,
          background: on ? color.paper : 'transparent',
          color: on ? color.ink : color.muted,
          border: on ? `1px solid ${line.hairline}` : '1px solid transparent',
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
        height: '100%', borderLeft: `1px solid ${line.hairline}`,
        background: color.paper,
      }}
    >
      <div
        style={{
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px', borderBottom: `1px solid ${line.hairline}`,
          background: 'rgba(250,251,252,.92)', backdropFilter: 'blur(20px)',
        }}
      >
        <ComputerIcon size={16} style={{ color: color.muted }} />
        {tabButton(PanelTab.Browser, 'Browser', <GlobeIcon size={14} />)}
        {tabButton(PanelTab.Files, 'Files', <FilesIcon size={14} />)}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the panel"
          style={{
            marginLeft: 'auto', width: 28, height: 28, border: 'none',
            background: 'transparent', cursor: 'pointer', color: color.muted,
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CloseIcon size={13} />
        </button>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/*
          Both are mounted at once and one is hidden, rather than swapped.
          The browser holds a live page: unmounting it on a tab change
          would throw away whatever the agent had loaded and reload it on
          the way back, which is the opposite of watching.
        */}
        <div
          style={{
            display: tab === PanelTab.Browser ? 'flex' : 'none',
            flex: '1 1 auto', minWidth: 0, minHeight: 0,
          }}
        >
          {inApp ? (
            <AgentBrowserInAppPanel sessionId={sessionId} visible={tab === PanelTab.Browser} />
          ) : (
            <div
              style={{
                flex: '1 1 auto', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 32, textAlign: 'center',
              }}
            >
              <span style={{ fontSize: text.body, color: color.muted, maxWidth: 320, lineHeight: 1.5 }}>
                This agent opens pages in its own browser window, so there is
                nothing to watch here. Settings → Browser can bring it in.
              </span>
            </div>
          )}
        </div>
        <div
          style={{
            display: tab === PanelTab.Files ? 'flex' : 'none',
            flex: '1 1 auto', minWidth: 0, minHeight: 0,
          }}
        >
          <ArtifactPanel
            key={sessionId}
            sessionId={sessionId}
            artifacts={artifacts}
            workingDirectory={workingDirectory}
            activeSpecialTab={ArtifactSpecialTab.FileList}
          />
        </div>
      </div>
    </div>
  );
}
