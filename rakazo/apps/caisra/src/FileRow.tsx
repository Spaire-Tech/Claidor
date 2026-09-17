import { fileMarkUrl } from "./filemarks.js";

/**
 * The file card: the founder's 15 September design, *"its pdf excel and word.
 * with their own svg."*
 *
 * One row: the file's own mark, its name, a line under it, and the round Save
 * button when there is something to save. The whole row opens it.
 *
 * Shared on purpose. A file the agent wrote and an artifact it composed are
 * the same object to a person — something to open, and something to keep — and
 * the founder said so when the artifacts were redesigned: *"keep our own
 * design, with pdf svgs, docs svgs, ppt etc. and our buttons like it was
 * before. this is still artifacts. we just changed the design."*
 */
export function FileRow({
  name,
  caption,
  logo,
  word,
  onOpen,
  onSave,
}: {
  name: string;
  /** The size, the page count, whatever goes under the name. */
  caption?: string;
  /** A bundled mark to draw, by name. */
  logo?: string;
  /** Drawn instead when there is no mark: the extension, in the mark's shape. */
  word?: string;
  onOpen?: () => void;
  onSave?: () => void;
}) {
  const url = logo ? fileMarkUrl(logo) : undefined;
  return (
    <div className="card card--file">
      {url ? (
        <img className="filemark" src={url} alt="" width={32} height={32} />
      ) : (
        <span className="filetype">{word ?? "File"}</span>
      )}
      <button type="button" className="card__stack file__open" onClick={onOpen}>
        <span className="card__title">{name}</span>
        {caption ? <span className="card__body">{caption}</span> : null}
      </button>
      {onSave ? (
        <button type="button" className="save" aria-label="Save a copy" title="Save a copy">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable="false"
          >
            <path d="M12 4v11" />
            <path d="M7.5 11l4.5 4.5 4.5-4.5" />
            <path d="M5 19.5h14" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
