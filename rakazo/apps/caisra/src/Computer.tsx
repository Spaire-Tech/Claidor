import {
  CaisraFileKind,
  caisraFileKind,
  caisraFileLogo,
  caisraFileSize,
  caisraFileWord,
} from "@rakazo/core";
import { FileRow } from "./FileRow.js";
import "./computer.css";

/**
 * Watching the agent work: the panel behind the header's computer icon.
 *
 * **What this is and is not.** In the founder's tree the panel is a frame with
 * a tab strip around two things that are upstream LobsterAI's and mounted
 * whole: `ArtifactPanel`, 8,676 lines of preview and file list, and
 * `AgentBrowserInAppPanel`, the agent's live Chromium. Neither exists in this
 * fork. So the frame and the tab strip port, and the contents do not.
 *
 * **There is no Browser tab, and that is on purpose.** The founder's own file
 * sets the rule while explaining why it has two tabs and not five: *"a tab that
 * opens onto the file list because its panel was never passed is worse than a
 * tab that is not there. They come when the wiring does."* Rakazo's computer is
 * a sandbox with its own shape; until that is wired, a Browser tab here would
 * be exactly the control that rule forbids.
 *
 * What is real is the files. They are the attachments of this conversation,
 * which the thread already models, so the list is the same data the messages
 * are — not a second copy that can disagree with them.
 */
export function Computer({
  files,
  onClose,
}: {
  files: readonly { name: string; size?: number; mimeType?: string }[];
  onClose?: () => void;
}) {
  return (
    <div className="computer">
      <header className="computer__bar">
        <span className="computer__mark">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <rect x="3" y="4" width="18" height="12" rx="2.5" />
            <path d="M9 20h6M12 16v4" />
          </svg>
        </span>
        {/* One tab, drawn as the canvas draws the chosen one: lifted onto paper
            with the accent for its label. When the browser arrives it sits
            beside this and the strip is already the right shape. */}
        <span className="computer__tab computer__tab--on">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
          </svg>
          Files
        </span>
        <button
          type="button"
          className="computer__close"
          aria-label="Close the panel"
          onClick={onClose}
        >
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
            <path d="M5 5l14 14" />
            <path d="M19 5L5 19" />
          </svg>
        </button>
      </header>

      <div className="computer__body">
        {files.length === 0 ? (
          <p className="computer__empty">Nothing made yet. Files the agent writes land here.</p>
        ) : (
          files.map((file) => {
            const kind = caisraFileKind(file.name, file.mimeType);
            const logo = caisraFileLogo(kind);
            return (
              <FileRow
                key={file.name}
                name={file.name}
                {...(file.size === undefined ? {} : { caption: caisraFileSize(file.size) })}
                {...(logo ? { logo } : {})}
                word={
                  kind === CaisraFileKind.Image ? "Image" : (caisraFileWord(file.name) ?? "File")
                }
                onSave={() => undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
