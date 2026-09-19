import { useState } from 'react';

import { logoUrl } from '../logos';
import { color, line, motion, radius, text, tracking } from '../tokens';
import { FILE_LOGO } from './attachment';
// The design's PDF icon, bundled by Vite like the service logos.
import pdfDoc from './pdf-doc.webp?url';
import { FileKind } from './types';

/**
 * The file card: the founder's 15 September design, *"its pdf excel and
 * word. with their own svg."* One row: the file's own icon, its name, a
 * line under it, and the round Save button on the right when there is
 * something to save. The whole row opens it.
 *
 * Drawn for a file the agent made (`AttachmentCard`) and, since
 * 17 September, for a deck or a report: *"keep our own
 * design, with pdf svgs, docs svgs, ppt etc. and our buttons like it
 * was before. this is still artifacts. we just changed the design."*
 *
 * The measurements are the 17 September canvas's (template.html
 * 759–769): white paper with a hairline and no shadow, which goes
 * transparent under the pointer, in a column no wider than 440px.
 */
export function FileCard(
  { name, caption, kind, title, onOpen, onSave }: {
    name: string;
    /** The size, the page count, whatever goes under the name. */
    caption?: string;
    kind: FileKind | undefined;
    /** The tooltip: the path for a file. */
    title?: string;
    onOpen?: () => void;
    onSave?: () => void;
  },
): JSX.Element {
  const [hover, setHover] = useState(false);
  const [saveHover, setSaveHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={onOpen ? 0 : -1}
      onClick={onOpen}
      onKeyDown={event => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 'min(70%, 440px)',
        boxSizing: 'border-box', padding: '11px 12px', borderRadius: radius.card,
        background: hover ? 'transparent' : color.paper,
        border: `1px solid ${line.hairline}`,
        cursor: onOpen ? 'pointer' : 'default', textAlign: 'left',
        transition: `background ${motion.hover.duration} ${motion.hover.easing}`,
      }}
    >
      <FileGlyph kind={kind} name={name} />
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: text.message, fontWeight: 500, letterSpacing: tracking.body, color: color.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </span>
        {caption && <span style={{ fontSize: text.caption, color: color.muted }}>{caption}</span>}
      </span>
      {onSave && (
        <button
          type="button"
          aria-label="Save a copy"
          title="Save a copy"
          onClick={event => { event.stopPropagation(); onSave(); }}
          onMouseEnter={() => setSaveHover(true)}
          onMouseLeave={() => setSaveHover(false)}
          style={{
            width: 27, height: 27, flex: '0 0 auto', borderRadius: '50%', padding: 0,
            border: 'none', background: saveHover ? color.window : color.paper,
            color: color.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            <path d="M12 4v11" /><path d="M7.5 11l4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** The file's own icon — the design's four — or a paperclip for the rest. */
export function FileGlyph({ kind, name }: { kind: FileKind | undefined; name: string }): JSX.Element {
  const logo = kind ? FILE_LOGO[kind] : undefined;
  const url = kind === FileKind.Pdf ? pdfDoc : logo ? logoUrl(logo) : undefined;
  if (!url) {
    return (
      <span style={{ width: 32, height: 32, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PaperclipGlyph />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      style={{
        width: 32, height: 32, flex: '0 0 auto',
        backgroundImage: `url(${url})`, backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
      }}
    />
  );
}

function PaperclipGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ flex: '0 0 auto' }}>
      <path d="M21.4 11.1l-8.5 8.5a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
    </svg>
  );
}
