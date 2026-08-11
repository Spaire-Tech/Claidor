/**
 * What every host has to be able to answer, in the same words.
 *
 * The panel is one React app running in four different applications. That
 * only works if the applications are hidden behind one interface, and the
 * interface has to be the *panel's* vocabulary — « which document am I in,
 * take me to this finding » — not Office's.
 *
 * Everything host-specific lives behind `HostBridge`. Nothing above it
 * imports `Office` or `PowerPoint` or `Excel`, ever. The moment a screen
 * has to know which host it is running in, this file has failed.
 */

/** Which application the panel is running inside. */
export type HostKind = 'powerpoint' | 'excel' | 'word' | 'outlook' | 'unknown'

/**
 * Where a finding physically sits, as the server records it.
 *
 * Mirrors `FindingWhere.anchor` in `polar/tieout/schemas.py`. Kept
 * deliberately loose — what identifies a position differs by shape, and a
 * host that does not understand a field ignores it rather than failing.
 */
export interface Anchor {
  /** `text` · `table` · `chart` · `cell`. */
  kind?: string
  /** PowerPoint's own id for the shape, as python-pptx read it. */
  shape_id?: number
  /** The shape's name. See `goTo` for why this is tried first. */
  shape_name?: string
  /** A table cell. Zero-based, header row included. */
  row?: number
  column?: number
  /** A chart point. */
  series?: string
  point?: number
  /** A sentence: which paragraph, and which characters inside it. */
  paragraph?: number
  start?: number
  end?: number
  /** A model cell — `Model!D26`. Excel selects this as it stands. */
  ref?: string
  sheet?: string
}

/** The document the panel is sitting in, as far as the host can say. */
export interface OpenDocument {
  host: HostKind
  /** The file's name, when the host will give it. */
  filename: string | null
  /**
   * The lineage id previously written into this document's own settings.
   *
   * The only identification that is not a guess: it lives inside the file,
   * survives Save As and a rename, and travels to whoever opens it next.
   */
  lineageId: string | null
  /** Which page/sheet the user is looking at, when the host will say. */
  currentPage: number | null
}

/**
 * What happened when the panel asked to be taken somewhere.
 *
 * Never a boolean. « It did not work » is not actionable, and a panel that
 * silently fails to move looks like a panel that moved to the wrong place.
 */
export interface GoToResult {
  moved: boolean
  /** How it got there — `shape` · `slide` · `cell` · `search` · `none`. */
  by: string
  /** Present when it did not, phrased for a person. */
  reason?: string
}

/**
 * What happened when the panel asked to write a correction in.
 *
 * The same shape as :type:`GoToResult` and for the same reason: « it did
 * not work » is not actionable, and a panel that silently fails to change
 * a figure looks exactly like one that changed it. Here the stakes are
 * higher — a banker who believes the slide was corrected sends the deck.
 */
export interface WriteResult {
  written: boolean
  /** How — `text` · `tracked`. */
  by: string
  /** Present when it did not, phrased for a person. */
  reason?: string
}

export interface HostBridge {
  readonly host: HostKind

  /** Which document is open, and what is already known about it. */
  read(): Promise<OpenDocument>

  /**
   * Write the lineage id into the document so the next open needs no
   * guessing. Returns false where the host has no document to write to.
   */
  stamp(lineageId: string): Promise<boolean>

  /**
   * Put `after` where `before` is, in the document open right here.
   *
   * **The banker's own copy is the one that gets sent**, so this is where
   * a correction has to land when the panel is the thing being used. The
   * deal's copy is corrected by the workspace instead, and the server
   * records which of the two happened.
   *
   * Refuses unless the characters about to be replaced are the characters
   * the reader recorded — the same rule the server's writer keeps, and the
   * only thing standing between a correction and a deck that has had the
   * wrong number changed in it.
   */
  write(
    anchor: Anchor,
    before: string,
    after: string,
    page?: number,
  ): Promise<WriteResult>

  /**
   * Select what a finding is about.
   *
   * `page` is the slide number the server recorded, 1-based, and is the
   * fallback when the anchor cannot be resolved: landing on the right
   * slide is worth having even when the exact shape is gone.
   */
  goTo(anchor: Anchor, page?: number): Promise<GoToResult>
}
