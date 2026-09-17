import "@openuidev/react-ui/index.css";
import "@openuidev/thesys/styles.css";
import "./artifacts.css";

import { Presentation, Report } from "@openuidev/thesys";
import { CaisraArtifactKind, caisraArtifactCount, caisraArtifactTitle } from "@rakazo/core";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileRow } from "./FileRow.js";

/**
 * A deck or a report in the thread.
 *
 * **In the thread, our card.** The founder, 17 September: *"the design for the
 * q4 board update, ohada etc. that says 'view' those you can toss. and keep
 * our own design, with pdf svgs, docs svgs, ppt etc. and our buttons like it
 * was before. this is still artifacts. we just changed the design."* So a deck
 * is the file card with the slides mark and "9 slides" under the name; a
 * report is the same card with the document mark and "4 pages". The same card
 * a file the agent wrote gets.
 *
 * **On press, OpenUI's viewer**, whole: their `Presentation` or `Report`
 * inline, at full size, in a sheet over the app. Their stylesheet, their
 * tokens, their typeface. Nothing here restyles the deck or the report; what
 * is ours is the card, the sheet and the close.
 */
export function Artifact({ program, kind }: { program: string; kind: CaisraArtifactKind }) {
  const deck = kind === CaisraArtifactKind.Presentation;
  const [open, setOpen] = useState(false);
  const title = caisraArtifactTitle(program) ?? (deck ? "Presentation" : "Report");
  const count = caisraArtifactCount(program, kind);
  const unit = deck ? "slide" : "page";
  const caption =
    count > 0 ? `${count} ${count === 1 ? unit : `${unit}s`}` : deck ? "Slides" : "Report";

  return (
    <div className="row row--left">
      <FileRow
        name={title}
        caption={caption}
        // A deck wears PowerPoint's mark and a report Word's, because those are
        // the marks the design drew for those two shapes.
        logo={deck ? "powerpoint" : "word"}
        onOpen={() => setOpen(true)}
      />
      {open ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {deck ? (
            <Presentation preview={false} response={program} />
          ) : (
            <Report preview={false} response={program} />
          )}
        </Sheet>
      ) : null}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="sheet">
      {/* The dismiss surface is its own element behind the sheet, so the sheet
          needs no click handler of its own to stop one bubbling through it.
          Its keyboard route is Escape, handled on the document above, which is
          what a dialog does. */}
      <button type="button" className="sheet__scrim" aria-label="Close" onClick={onClose} />
      <div className="sheet__body" role="dialog" aria-label={title}>
        <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
            focusable="false"
          >
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
        <div className="sheet__viewer">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
