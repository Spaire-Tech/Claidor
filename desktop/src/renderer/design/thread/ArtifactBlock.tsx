import '@openuidev/react-ui/index.css';
import '@openuidev/thesys/styles.css';
import './artifacts.css';

import { Presentation, Report } from '@openuidev/thesys';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { artifactCountOf, ArtifactKind, artifactTitleOf } from '../../../shared/artifacts/constants';
import { CloseIcon } from '../icons';
import { color, glass, line, motion, radius, shadow } from '../tokens';
import { FileCard } from './FileCard';
import { type CardItem, FileKind } from './types';

/**
 * A deck or a report in the thread.
 *
 * **In the thread, our card.** The founder, 17 September: *"the design
 * for the q4 board update, ohada etc. that says 'view' those you can
 * toss. and keep our own design, with pdf svgs, docs svgs, ppt etc. and
 * our buttons like it was before. this is still artifacts. we just
 * changed the design."* So a deck is the file card with the slides
 * icon and "9 slides" under the name; a report is the same card with
 * the document icon and "4 pages". The same card a file the agent made
 * gets (`FileCard`).
 *
 * **On press, OpenUI's viewer**, whole: their `Presentation` or `Report`
 * inline, at full size, in a sheet over the app with a scrim, Escape
 * and click-outside to close. Their stylesheet, their tokens, their
 * typeface (Inter, `artifacts.css`); nothing here restyles the deck or
 * the report. What is ours is only the card, the sheet and the close.
 */
export function ArtifactBlock({ item }: { item: CardItem }): JSX.Element {
  const kind = item.artifact ?? ArtifactKind.Report;
  const deck = kind === ArtifactKind.Presentation;
  const [open, setOpen] = useState(false);
  const title = artifactTitleOf(item.program) ?? (deck ? 'Presentation' : 'Report');
  const count = artifactCountOf(item.program, kind);
  const caption = count > 0
    ? `${count} ${deck ? (count === 1 ? 'slide' : 'slides') : (count === 1 ? 'page' : 'pages')}`
    : (deck ? 'Slides' : 'Report');

  return (
    <div data-artifact={kind} data-card-block={item.id} style={{ display: 'flex' }}>
      <FileCard
        name={title}
        caption={caption}
        kind={deck ? FileKind.Slides : FileKind.Word}
        onOpen={() => setOpen(true)}
      />
      {open && (
        <ArtifactSheet title={title} onClose={() => setOpen(false)}>
          {deck
            ? <Presentation preview={false} response={item.program} />
            : <Report preview={false} response={item.program} />}
        </ArtifactSheet>
      )}
    </div>
  );
}

/**
 * The sheet the viewer opens in: over the whole app, on a scrim, with
 * the close in the corner. Escape and the scrim close it.
 */
function ArtifactSheet(
  { title, onClose, children }: { title: string; onClose: () => void; children: ReactNode },
): JSX.Element | null {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (typeof document === 'undefined') return null;

  const scrim: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 60,
    background: glass.scrim, backdropFilter: glass.scrimBlur,
    display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', padding: 24,
    animation: `fsr-message-in ${motion.messageIn.duration} ${motion.messageIn.easing} both`,
  };
  const sheet: CSSProperties = {
    position: 'relative', flex: '1 1 auto', minWidth: 0, minHeight: 0,
    borderRadius: radius.modal, background: color.paper,
    border: `1px solid ${line.hairline}`, boxShadow: shadow.modal, overflow: 'hidden',
  };

  return createPortal(
    <div data-artifact-sheet role="dialog" aria-label={title} style={scrim} onClick={onClose}>
      <div style={sheet} onClick={event => event.stopPropagation()}>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 2,
            width: 32, height: 32, borderRadius: '50%', padding: 0,
            border: `1px solid ${line.hairline}`, background: color.paper, color: color.ink,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: shadow.flat,
          }}
        >
          <CloseIcon size={12} />
        </button>
        <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
