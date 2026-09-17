/**
 * What kind of file a card is showing.
 *
 * The founder's 15 September instruction, and it is about the icon rather
 * than the file: *"its pdf excel and word. with their own svg."* A card for a
 * spreadsheet shows the spreadsheet's own mark; anything the design did not
 * draw is named behind a paperclip, and is never given a wrong icon to look
 * tidy.
 *
 * The decision is here rather than in the screen because the same answer has
 * to hold on web, on desktop and on mobile, and because it is the kind of
 * thing that quietly rots: a new extension gets added to one renderer and not
 * the others, and one surface starts calling a `.csv` a mystery.
 *
 * **Extension first, media type second.** The backend sends both, and the name
 * is the one a person reads. A `.xlsx` sent with the wrong media type is still
 * a spreadsheet on screen. The media type only decides what an unknown
 * extension is, which is how an image with no extension still reads as a
 * picture.
 */

export const CaisraFileKind = {
  Pdf: "pdf",
  Word: "word",
  Excel: "excel",
  Slides: "slides",
  /** A picture: shown, not named. */
  Image: "image",
  /** A drawing. Its own kind because a vector is not a photograph. */
  Vector: "vector",
  /** Named behind a paperclip. Everything the design did not draw. */
  Other: "other",
} as const;
export type CaisraFileKind = (typeof CaisraFileKind)[keyof typeof CaisraFileKind];

const BY_EXTENSION: Readonly<Record<string, CaisraFileKind>> = {
  pdf: CaisraFileKind.Pdf,
  doc: CaisraFileKind.Word,
  docx: CaisraFileKind.Word,
  rtf: CaisraFileKind.Word,
  xls: CaisraFileKind.Excel,
  xlsx: CaisraFileKind.Excel,
  csv: CaisraFileKind.Excel,
  ppt: CaisraFileKind.Slides,
  pptx: CaisraFileKind.Slides,
  key: CaisraFileKind.Slides,
  svg: CaisraFileKind.Vector,
  png: CaisraFileKind.Image,
  jpg: CaisraFileKind.Image,
  jpeg: CaisraFileKind.Image,
  gif: CaisraFileKind.Image,
  webp: CaisraFileKind.Image,
  avif: CaisraFileKind.Image,
  heic: CaisraFileKind.Image,
  bmp: CaisraFileKind.Image,
};

/** The extension, lower case, from a name or a path. */
function extensionOf(name: string): string | undefined {
  const base = name.split(/[\\/]/).pop() ?? name;
  return /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
}

export function caisraFileKind(name: string, mimeType?: string): CaisraFileKind {
  const byExtension = BY_EXTENSION[extensionOf(name) ?? ""];
  if (byExtension) return byExtension;
  if (mimeType === "image/svg+xml") return CaisraFileKind.Vector;
  if (mimeType?.startsWith("image/")) return CaisraFileKind.Image;
  return CaisraFileKind.Other;
}

/**
 * The bundled logo a kind draws, by name.
 *
 * PDF is not a service, so its mark is a file of its own rather than a
 * service logo; the loader treats both the same because both are files we
 * ship. A picture and a drawing have no logo: one shows itself and the other
 * gets the word.
 */
export function caisraFileLogo(kind: CaisraFileKind): string | undefined {
  switch (kind) {
    case CaisraFileKind.Pdf:
      return "pdf";
    case CaisraFileKind.Word:
      return "word";
    case CaisraFileKind.Excel:
      return "excel";
    case CaisraFileKind.Slides:
      return "powerpoint";
    default:
      return undefined;
  }
}

/**
 * The word on a card that has no logo — "SVG", "PNG", or nothing at all when
 * the name carries no extension worth repeating.
 */
export function caisraFileWord(name: string): string | undefined {
  const extension = extensionOf(name);
  return extension ? extension.toUpperCase() : undefined;
}

/** A file's size, the way a person says it. */
export function caisraFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}
