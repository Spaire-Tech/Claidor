/**
 * What a file is, told from its name or its first bytes: the extensions and
 * media types the engine knows, how large an attachment may be, the size of a
 * picture or a video read from its header, how a file is shown, and how
 * attachments are sorted and counted.
 *
 * Every picture and video here is a handful of bytes made in this file: the
 * header of each format the code tells apart, whole, cut short, and wrong.
 */
export const part = "shared/media";

const folder = "source/shared/media";
export const modules = {
  extensions: `${folder}/media-extensions.ts`,
  mime: `${folder}/image-mime.ts`,
  limits: `${folder}/attachment-limits.ts`,
  image: `${folder}/image-dimensions.ts`,
  video: `${folder}/video-dimensions.ts`,
  openPolicy: `${folder}/attachment-open-policy.ts`,
  preview: `${folder}/attachment-preview.ts`,
  previewKind: `${folder}/file-preview-kind.ts`,
  summary: `${folder}/attachment-summary.ts`,
};

/** The folder holds three more files (`attachments.ts`, `avatar-image.ts`, `markdown-preview.ts`) that are not this part's. */
export const covers = Object.values(modules);

// ---------------------------------------------------------------------------
// How the cases are asked and kept
// ---------------------------------------------------------------------------

/** Each input beside its answer, in the order asked. */
const asked = (inputs, ask) => inputs.map((input) => [input, ask(input)]);

/** Each named case's answer, under its name. */
const cases = (named, ask) => Object.fromEntries(Object.entries(named).map(([name, input]) => [name, ask(input)]));

/**
 * The answer, or the kind of failure. The part throws nothing of its own:
 * what fails here is JavaScript refusing a value of the wrong kind, and its
 * wording names whatever the code happened to read first, so only the kind
 * of failure is kept.
 */
const attempt = (ask) => {
  try {
    return ask();
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
};

/** What a looked-up value is, when it may be something a table never held. */
const told = (value) => {
  if (value === Object.prototype) return "the prototype of every object";
  if (typeof value === "function") return `the function ${value.name}`;
  return value;
};

/** A size in a few words, where answers are counted or grouped. */
const said = (answer) => (answer === null ? "nothing" : `${answer.width} by ${answer.height}`);

/** Numbers that look drawn by chance and are the same every run. */
function sequence(seed) {
  let state = seed >>> 0;
  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * below);
  };
}

/**
 * Every byte of a file changed in turn to each of its 256 values, and what
 * the reader then answers. Bytes next to each other that answer alike are
 * told once: how many of the 256 values give which answer. A byte whose
 * values give more than six answers (a byte of a side) is told by how many
 * answers there are, how many are nothing, and the sums of the widths and of
 * the heights.
 */
function everyByteChanged(whole, read) {
  const file = Uint8Array.from(whole);
  const perByte = [];
  for (let at = 0; at < file.length; at += 1) {
    const kept = file[at];
    const counts = new Map();
    let widths = 0;
    let heights = 0;
    for (let value = 0; value < 256; value += 1) {
      file[at] = value;
      const answer = read(file);
      counts.set(said(answer), (counts.get(said(answer)) ?? 0) + 1);
      widths += answer?.width ?? 0;
      heights += answer?.height ?? 0;
    }
    file[at] = kept;
    perByte.push(counts.size <= 6 ? Object.fromEntries(counts) : { answers: counts.size, nothing: counts.get("nothing") ?? 0, widths, heights });
  }
  const stretches = [];
  for (let at = 0; at < perByte.length; at += 1) {
    const alike = JSON.stringify(perByte[at]);
    const last = stretches.at(-1);
    if (last !== undefined && last.alike === alike) last.to = at;
    else stretches.push({ from: at, to: at, alike, answers: perByte[at] });
  }
  return { bytes: file.length, unchanged: said(read(file)), changed: stretches.map(({ from, to, answers }) => [from === to ? `byte ${from}` : `bytes ${from} to ${to}`, answers]) };
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

const letters = (word) => Array.from(word, (letter) => letter.charCodeAt(0));
const be16 = (n) => [(n >>> 8) & 255, n & 255];
const be24 = (n) => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >>> 8) & 255];
const le24 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const zeros = (count) => new Array(count).fill(0);
/** Lists inside lists, and typed arrays, laid out as one list of numbers. */
const flatten = (part) => (ArrayBuffer.isView(part) ? Array.from(part) : Array.isArray(part) ? part.flatMap(flatten) : [part]);
const flat = (...parts) => flatten(parts);
const bytes = (...parts) => Uint8Array.from(flat(parts));
const cut = (whole, length) => whole.subarray(0, length);
/** The same bytes with one changed. */
const withByte = (whole, at, value) => {
  const copy = Uint8Array.from(whole);
  copy[at] = value;
  return copy;
};
/** The same bytes seen through a window that starts partway into a larger buffer, as a Buffer read from a file can be. */
const windowed = (whole, lead = 7) => {
  const larger = new Uint8Array(lead + whole.length + 5).fill(255);
  larger.set(whole, lead);
  return larger.subarray(lead, lead + whole.length);
};

// PNG: eight fixed bytes, then the first chunk, whose name is IHDR and whose first eight bytes are the two sides.
const PNG_START = [137, 80, 78, 71, 13, 10, 26, 10];
const png = (width, height, { chunk = "IHDR", length = 13 } = {}) => bytes(PNG_START, be32(length), letters(chunk), be32(width), be32(height), [8, 6, 0, 0, 0], be32(0));

// GIF: six letters, then the two sides, the low byte first.
const gif = (width, height, start = "GIF89a") => bytes(letters(start), le16(width), le16(height), [0xf7, 0, 0]);

// JPEG: FF D8, then segments (FF, a marker, a length that counts itself, the inside).
const segment = (marker, ...inside) => {
  const body = flat(inside);
  return [255, marker, ...be16(body.length + 2), ...body];
};
/** A frame header: the segment that holds the two sides, the height first. */
const frame = (width, height, marker = 0xc0) => segment(marker, [8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const jpeg = (...segments) => bytes([255, 216], segments);
const APP0 = segment(0xe0, letters("JFIF"), [0, 1, 1, 0, 0, 72, 0, 72, 0, 0]);
const QUANT = segment(0xdb, [0], zeros(64));

// WebP: RIFF, a length, WEBP, then the first chunk, which is one of three kinds.
const riff = (kind, ...inside) => bytes(letters("RIFF"), le32(22), letters("WEBP"), letters(kind), inside);
const webpLossy = (width, height) => riff("VP8 ", le32(10), [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], le16(width), le16(height));
/** The packed word of a lossless picture: fourteen bits for each side less one, then four bits that are not the size. */
const webpLossless = (width, height, top = 0) => riff("VP8L", le32(9), [0x2f], le32((((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | (top << 28)) >>> 0), zeros(5));
const webpExtended = (width, height) => riff("VP8X", le32(10), [0x10, 0, 0, 0], le24(width - 1), le24(height - 1));

// The boxes of HEIC and MP4 files: a size that counts itself, four letters, the inside.
const box = (type, ...inside) => {
  const body = flat(inside);
  return [...be32(8 + body.length), ...letters(type), ...body];
};
/** The same box with its size written the long way: the word 1, the letters, then eight bytes of size. */
const longBox = (type, ...inside) => {
  const body = flat(inside);
  return [...be32(1), ...letters(type), ...be32(0), ...be32(16 + body.length), ...body];
};
/** The same box with no size (the word 0): it runs to the end of what holds it. */
const openBox = (type, ...inside) => [...be32(0), ...letters(type), ...flat(inside)];
/** A box that starts with a version byte and three bytes of flags. */
const fullBox = (type, version, flags, ...inside) => box(type, [version, ...be24(flags)], ...inside);
/** A box that says another size than it has. */
const sizedBox = (size, type, ...inside) => [...be32(size), ...letters(type), ...flat(inside)];

// HEIC: the picture's two sides are a property (ispe), its turn another (irot); a table (ipma) says which item has which, and pitm names the item that is the picture.
const HEIC_START = box("ftyp", letters("heic"), be32(0), letters("mif1heic"));
const ispe = (width, height) => fullBox("ispe", 0, 0, be32(width), be32(height));
const irot = (turns) => box("irot", [turns]);
const pitm = (item, version = 0) => fullBox("pitm", version, 0, version === 0 ? be16(item) : be32(item));
/** Which properties each item has, as `[item, [property numbers]]`. `wide` writes each number on two bytes. */
const ipma = (items, { version = 0, flags = 0 } = {}) =>
  fullBox("ipma", version, flags, be32(items.length), items.map(([item, numbers]) => [version === 0 ? be16(item) : be32(item), numbers.length, numbers.map((number) => ((flags & 1) === 1 ? be16(number) : number))]));
const HANDLER = fullBox("hdlr", 0, 0, zeros(4), letters("pict"), zeros(13));
const properties = (...list) => box("ipco", ...list);
/** A whole file: the start, then the box that holds the picture's item, its properties and their table, then anything after. */
const heic = ({ item = pitm(1), props, links = ipma([[1, [1]]]), after = [] }) => bytes(HEIC_START, fullBox("meta", 0, 0, HANDLER, item, box("iprp", props, links)), after);
/** A small picture's size first, the real picture's second: reading the tables gives the second, looking for the first "ispe" gives the first. */
const THUMB_THEN_PICTURE = properties(ispe(160, 120), ispe(4032, 3024), irot(1), box("pixi", [3, 8, 8, 8]));

// MP4: the size is in the track header (tkhd) of a track (trak) of the film (moov), after a matrix that says how it is turned.
const UPRIGHT = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
const TURNED_90 = [0, 0x00010000, 0, 0xffff0000, 0, 0, 0, 0, 0x40000000];
const TURNED_180 = [0xffff0000, 0, 0, 0, 0xffff0000, 0, 0, 0, 0x40000000];
const TURNED_270 = [0, 0xffff0000, 0, 0x00010000, 0, 0, 0, 0, 0x40000000];
/** The inside of a track header. Version 1 writes its three times on eight bytes each, so the matrix comes twelve bytes later. */
const trackHeader = ({ version = 0, width = 1920, height = 1080, matrix = UPRIGHT, widthPart = 0, heightPart = 0 } = {}) =>
  flat(
    [version, 0, 0, 3],
    version === 1 ? [zeros(16), be32(1), be32(0), zeros(8)] : [zeros(8), be32(1), be32(0), zeros(4)],
    zeros(8),
    zeros(8),
    matrix.map(be32),
    be16(width),
    be16(widthPart),
    be16(height),
    be16(heightPart),
  );
const tkhd = (options) => box("tkhd", trackHeader(options));
const trak = (...inside) => box("trak", ...inside);
const MVHD = box("mvhd", zeros(100));
const moov = (...inside) => box("moov", MVHD, ...inside);
const MP4_START = box("ftyp", letters("isom"), be32(512), letters("isomiso2mp41"));
const SOUND_TRACK = trak(tkhd({ width: 0, height: 0 }));

// ---------------------------------------------------------------------------
// Names, paths and addresses asked of more than one function
// ---------------------------------------------------------------------------

const NAMES = [
  "photo.png", "PHOTO.PNG", "Photo.JpEg", "archive.tar.gz", "name.tar.GZ", "a.b.c.D", "name", "", ".", "..", "...", ".env", ".env.local", ".ENV.LOCAL",
  "a.", "a..", "a.b.", "a. ", "a.b ", " .png", "a .png", "x.y z", "a.png?size=2", "a.png#top", "no extension here", "trailing.dot.", "..png", "...png",
  "a..png", "name.123", "x.PNG ", "\n.png", "a\n.png", "png", ".png", "PNG.", "a.p.n.g", "a.png.", "mp4", ".mp4", "x.mp4.txt",
];
const PATHS = [
  "dir/photo.png", "dir\\photo.PNG", "/abs/dir/photo.webp", "C:\\Users\\me\\file.JPEG", "dir.d/name", "dir.d\\name", "a/b\\c.txt", "a\\b/c.TXT",
  "dir/", "dir\\", "dir.d/", "dir.d\\", "/", "\\", "//", "\\\\", "/.hidden", "\\.hidden", "a/.hidden.txt", "a\\.hidden.TXT", "a/b.c/d.e\\f", "a/b.c\\d.e/f.G",
  "./file.md", "../up.MD", "a/./.", "a/..", "a/...", "a/b.", "a\\b.", "photo.png/", "photo.png\\", "photo.png/inside", "~/x.Y", "a:b.c", "dir/clip.mp4", "dir.mp4/file",
  "https://example.com/pic.png", "https://example.com/pic.png?w=1", "https://example.com", "file:///tmp/a.mov",
];
const OTHER_ALPHABETS = ["ÉCOLE.JPG", "x.İ", "x.ΑΣ", "x.ǅ", "x.ẞ", "x.Ⅷ", "写真.PNG", "x.😀A", "x.É", "X.ＰＮＧ"];
/** What is not a text, where a text is asked. */
const NOT_TEXTS = [null, undefined, 0, 5, true, {}];
/** Extensions and types that are also the names of things every object has. */
const OBJECT_WORDS = ["constructor", "__proto__", "prototype", "toString", "valueOf", "hasOwnProperty"];

/** Every extension a table of the part names, and others near them, without the dot. */
const PICTURE_EXTENSIONS = ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"];
const PHONE_PICTURE_EXTENSIONS = ["heic", "heif"];
const VIDEO_EXTENSIONS = ["m4v", "mov", "mp4", "ogv", "webm"];
const SOUND_EXTENSIONS = ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"];
const TEXT_EXTENSIONS = [
  "txt", "text", "log", "md", "markdown", "mdx", "rst", "adoc", "tex", "json", "jsonc", "json5", "ndjson", "csv", "tsv", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "env", "properties", "plist", "gradle", "html", "htm", "css", "scss", "sass", "less", "svg", "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "py", "pyi", "rb", "go", "rs",
  "java", "kt", "kts", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "php", "swift", "scala", "dart", "lua", "pl", "pm", "r", "sql", "graphql", "gql", "proto", "vue", "svelte",
  "astro", "sh", "bash", "zsh", "fish", "bat", "ps1", "tf", "tfvars", "dockerfile", "diff", "patch",
];
const PACKED_EXTENSIONS = ["zip", "tar", "gz", "tgz", "bz2", "tbz2", "xz", "txz", "zst", "7z", "rar"];
const OTHER_EXTENSIONS = [
  "pdf", "docx", "doc", "xlsx", "xls", "xlsm", "pptx", "ppt", "odt", "rtf", "pages", "numbers", "key", "epub", "exe", "bin", "dmg", "iso", "apk", "jar", "lz", "lzma", "z", "bz", "cab",
  "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "3gp", "tif", "tiff", "psd", "raw", "jfif", "apng", "jxl", "mid", "aiff", "wma", "jsonl", "geojson", "ipynb", "lock", "mm", "m", "zz", "unknown", "0", "pdf2", "xpdf",
];
const EVERY_EXTENSION = [...new Set([...PICTURE_EXTENSIONS, ...PHONE_PICTURE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...SOUND_EXTENSIONS, ...TEXT_EXTENSIONS, ...PACKED_EXTENSIONS, ...OTHER_EXTENSIONS])];

const ADDRESSES = [
  "https://example.com/files/Report.PDF",
  "https://example.com/files/photo%20one.JPG?size=large#top",
  "https://example.com/a%2Fb.png",
  "https://example.com/a%5Cb.png",
  "https://example.com/%E2%9C%93.md",
  "https://example.com/bad%E0%A4%A.png",
  "https://example.com/100%.csv",
  "https://example.com/name%2Ejson",
  "https://example.com",
  "https://example.com/",
  "https://example.com/dir/",
  "https://example.com/dir.v2/",
  "https://user:pw@example.com:8443/x.tar.gz",
  "HTTPS://EXAMPLE.COM/Up.PNG",
  "http://example.com/a.b/c",
  "https://example.com/a b.png",
  "https://example.com/été.Webp",
  "https://example.com/a.png;v=1",
  "https://example.com/../up.zip",
  "https://example.com/a/./b/../c.7z",
  "https://example.com/download?file=report.pdf",
  "https://example.com/clip.mp4#t=10",
  "https://example.com/.htaccess",
  "https://example.com/trailing.",
  "ftp://example.com/pub/x.rar",
  "s3://bucket/key/file.parquet",
  "file:///Users/me/clip.MOV",
  "file:///C:/Users/me/clip.mp4",
  "file://server/share/notes.docx",
  "data:image/png;base64,AAAA",
  "data:text/plain,hello.txt",
  "blob:https://example.com/0a1b.webm",
  "mailto:someone@example.com",
  "x:y.json",
  "about:blank",
  "urn:isbn:0451450523",
  "C:\\Users\\me\\notes.txt",
  "C:/Users/me/notes.TXT",
  "c:notes.md",
  "/Users/me/photo.heic",
  "relative/dir/table.csv",
  "name only.docx",
  "with%20percent.png",
  "bad%E0%A4%A.png",
  "",
  " ",
  "//example.com/a.png",
  "http://",
  "http://[",
  "https://exa mple.com/a.png",
  "?file=a.png",
  "#a.png",
];

/** Names put together from pieces by the same draw every run. */
const NAME_PIECES = [
  "", ".", "..", "/", "\\", "a", "B", "dir", "x.y", "é", " ", "?", "#", ":", "%20", "%2E", "https://h/", "file:///", "png", "MOV",
  ".png", ".PNG", ".Jpg", ".webp", ".heic", ".svg", ".mp4", ".MOV", ".ogg", ".mp3", ".pdf", ".csv", ".xlsx", ".json", ".json5", ".md", ".docx", ".txt", ".TS", ".tar", ".gz", ".zip", ".7z", ".bin",
];
const madeUpNames = (count, seed) => {
  const next = sequence(seed);
  return Array.from({ length: count }, () => Array.from({ length: 1 + next(5) }, () => NAME_PIECES[next(NAME_PIECES.length)]).join(""));
};

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

export const scenarios = [
  // ----- media-extensions -------------------------------------------------
  {
    name: "a name's extension is its last dot and what follows it, in small letters; a name that starts with its only dot has none",
    run: ({ extensions }) => asked(NAMES, extensions.extensionOf),
  },
  {
    name: "only what follows the last slash of either kind is looked at for an extension",
    run: ({ extensions }) => asked(PATHS, extensions.extensionOf),
  },
  {
    name: "an extension in another alphabet is made small the way JavaScript does it",
    run: ({ extensions }) => asked(OTHER_ALPHABETS, extensions.extensionOf),
  },
  {
    name: "asking the extension of what is not a text fails",
    run: ({ extensions }) => asked(NOT_TEXTS, (value) => attempt(() => extensions.extensionOf(value))),
  },
  {
    name: "the table of picture types by extension, whole",
    run: ({ extensions }) => tableOf(extensions.IMAGE_MIME_FROM_EXTENSION),
  },
  {
    name: "the table of the two picture types only the person's own device shows, whole",
    run: ({ extensions }) => tableOf(extensions.CLIENT_NATIVE_IMAGE_MIME_FROM_EXTENSION),
  },
  {
    name: "the table of extensions by picture type, whole",
    run: ({ extensions }) => tableOf(extensions.EXTENSION_FROM_IMAGE_MIME),
  },
  {
    name: "the table of video types by extension, whole",
    run: ({ extensions }) => tableOf(extensions.VIDEO_MIME_FROM_EXTENSION),
  },
  {
    name: "the table of sound types by extension, whole",
    run: ({ extensions }) => tableOf(extensions.AUDIO_MIME_FROM_EXTENSION),
  },

  // ----- image-mime -------------------------------------------------------
  {
    name: "each extension gives its picture, shown-picture, video and sound type, or none, in small letters and in capitals",
    run: ({ mime }) =>
      Object.fromEntries(
        EVERY_EXTENSION.map((extension) => [
          extension,
          [`file.${extension}`, `/Some Dir/FILE.${extension.toUpperCase()}`].map((name) =>
            [`picture ${mime.imageMimeFromPath(name)}`, `shown ${mime.servableImageMimeFromPath(name)}`, `video ${mime.videoMimeFromPath(name)}`, `sound ${mime.audioMimeFromPath(name)}`].join(", "),
          ),
        ]),
      ),
  },
  {
    name: "a type is read from the last part of a path only, and a name with no extension has none",
    run: ({ mime }) =>
      asked([...NAMES, ...PATHS, ...OTHER_ALPHABETS, "c:\\x\\y.HeIc", "a/b.HEIF", "clip.MOV", "song.Mp3", "song.mp3/", "a.ogg", "a.ogv", "a.oga", "a.weba", "a.webm", "a.webp", "a.m4a", "a.m4v"], (name) => [
        mime.imageMimeFromPath(name),
        mime.servableImageMimeFromPath(name),
        mime.videoMimeFromPath(name),
        mime.audioMimeFromPath(name),
      ]),
  },
  {
    name: "a picture type gives its extension whatever its capitals, and nothing is trimmed or cut from it first",
    run: ({ mime }) =>
      asked(
        [
          "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/x-icon", "image/vnd.microsoft.icon",
          "IMAGE/PNG", "Image/Jpeg", "image/SVG+XML", "IMAGE/VND.MICROSOFT.ICON",
          "image/jpg", "image/heic", "image/heif", "image/tiff", "image/svg", "image/x-png", "image/", "image", "png", ".png", "video/mp4", "audio/mpeg", "text/plain",
          " image/png", "image/png ", "image/png;charset=utf-8", "image/png; q=1", "image/png\n", "",
        ],
        mime.extensionFromImageMime,
      ),
  },
  {
    name: "a type that reads, in small letters, as 'constructor' or '__proto__' finds what every object has under that name, not an extension",
    run: ({ mime }) => asked(["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__", "CONSTRUCTOR", "ToString", "__PROTO__", "prototype", "length"], (type) => told(mime.extensionFromImageMime(type))),
  },
  {
    name: "the types follow the five tables as they are when asked: an entry added later is found, one taken out is gone",
    run: (all) =>
      whileChanged(
        all,
        ({ pictures, phonePictures, videos, sounds, byType }) => {
          pictures[".zzz"] = "image/zzz";
          phonePictures[".zzz"] = "image/never-reached";
          phonePictures[".yyy"] = "image/yyy";
          videos[".zzz"] = "video/zzz";
          sounds[".zzz"] = "audio/zzz";
          byType["image/zzz"] = ".zzz";
          delete pictures[".png"];
          delete phonePictures[".heic"];
          delete videos[".mp4"];
          delete sounds[".mp3"];
          delete byType["image/png"];
        },
        () => ({
          picture: [all.mime.imageMimeFromPath("a.zzz"), all.mime.imageMimeFromPath("a.png")],
          shown: [all.mime.servableImageMimeFromPath("a.zzz"), all.mime.servableImageMimeFromPath("a.yyy"), all.mime.servableImageMimeFromPath("a.png"), all.mime.servableImageMimeFromPath("a.heic")],
          video: [all.mime.videoMimeFromPath("a.zzz"), all.mime.videoMimeFromPath("a.mp4")],
          sound: [all.mime.audioMimeFromPath("a.zzz"), all.mime.audioMimeFromPath("a.mp3")],
          extension: [all.mime.extensionFromImageMime("image/zzz"), all.mime.extensionFromImageMime("image/png")],
        }),
      ),
  },
  {
    name: "asking the type of what is not a text fails",
    run: ({ mime }) =>
      asked(NOT_TEXTS, (value) => ({
        picture: attempt(() => mime.imageMimeFromPath(value)),
        shown: attempt(() => mime.servableImageMimeFromPath(value)),
        video: attempt(() => mime.videoMimeFromPath(value)),
        sound: attempt(() => mime.audioMimeFromPath(value)),
        extension: attempt(() => told(mime.extensionFromImageMime(value))),
      })),
  },

  // ----- attachment-limits ------------------------------------------------
  {
    name: "an attachment may be 25 MB, a video 200 MB, and a megabyte is 1,048,576 bytes",
    run: ({ limits }) => ({ attachment: limits.ATTACHMENT_BYTE_LIMIT, video: limits.VIDEO_BYTE_LIMIT, megabyte: limits.BYTES_PER_MB }),
  },
  {
    name: "a name is a video's by its extension alone, and a video's name is given the video's limit",
    run: ({ limits }) =>
      asked(
        [
          ...VIDEO_EXTENSIONS.flatMap((extension) => [`clip.${extension}`, `CLIP.${extension.toUpperCase()}`]),
          "clip.mkv", "clip.avi", "clip.gif", "clip.heic", "clip.mp3", "clip.m4a", "clip.ogg", "clip.mp4.txt", "clip.txt.mp4", "mp4", ".mp4", "clip.mp4.", "clip.mp4 ", "clip", "",
          "dir/clip.mov", "dir\\clip.MOV", "dir.mov/clip", "dir.mov\\clip", "https://example.com/clip.webm", "https://example.com/clip.webm?x=1",
        ],
        (name) => [limits.nameLooksLikeVideo(name), limits.attachmentByteLimitForName(name)],
      ),
  },
  {
    name: "a name's limit follows the video table as it is when asked",
    run: (all) =>
      whileChanged(
        all,
        ({ videos }) => {
          videos[".zzz"] = "video/zzz";
          delete videos[".mov"];
        },
        () => ["a.zzz", "a.mov", "a.mp4"].map((name) => [all.limits.nameLooksLikeVideo(name), all.limits.attachmentByteLimitForName(name), all.limits.formatAttachmentTooLargeNotice(name)]),
      ),
  },
  {
    name: "bytes are told in whole megabytes, the nearest one, a half going up",
    run: ({ limits }) =>
      asked(
        [
          0, 1, 524_287, 524_288, 524_289, 1_048_575, 1_048_576, 1_048_577, 1_572_863, 1_572_864, 1_572_865, 2_621_440, 26_214_400, 209_715_200, 1e12, Number.MAX_SAFE_INTEGER, 0.5, 1e-9,
          -0, -1, -524_287, -524_288, -524_289, -1_572_864, -1_572_865, -26_214_400, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE,
        ],
        limits.formatMegabytes,
      ),
  },
  {
    name: "what is not a number is told in megabytes as JavaScript counts it, and a big number fails",
    run: ({ limits }) => asked(["1048576", "", "five", " 2097152 ", null, undefined, true, false, [], [3_145_728], [1, 2], {}, 5n], (value) => attempt(() => limits.formatMegabytes(value))),
  },
  {
    name: "the notice for a file too large says its name and the limit, and 'for video' for a video",
    run: ({ limits }) =>
      asked(
        ["report.pdf", "clip.MP4", "clip.mov", "clip.m4v", "clip.ogv", "clip.webm", "holiday.heic", "song.mp3", "clip.mp4.zip", "dir/clip.webm", "dir.mp4/notes.txt", "", " ", "no extension", 'say "hi".png', "two\nlines.mov", "été.MOV", ".mp4"],
        limits.formatAttachmentTooLargeNotice,
      ),
  },
  {
    name: "the notice for what is not a text fails",
    run: ({ limits }) => asked(NOT_TEXTS, (value) => attempt(() => limits.formatAttachmentTooLargeNotice(value))),
  },
  {
    name: "the failure for a file too large carries its limit and its own name",
    run: ({ limits }) => {
      const { AttachmentTooLargeError } = limits;
      const failure = new AttachmentTooLargeError(26_214_400);
      return {
        failure,
        words: String(failure),
        message: failure.message,
        named: failure.name,
        limit: failure.limitBytes,
        fields: Object.keys(failure),
        limitField: Object.getOwnPropertyDescriptor(failure, "limitBytes"),
        nameField: Object.getOwnPropertyDescriptor(failure, "name"),
        messageField: Object.getOwnPropertyDescriptor(failure, "message"),
        isAnError: failure instanceof Error,
        isItsOwnKind: failure instanceof AttachmentTooLargeError,
        prototypeIsTheClass: Object.getPrototypeOf(failure) === AttachmentTooLargeError.prototype,
        classExtendsError: Object.getPrototypeOf(AttachmentTooLargeError) === Error,
        className: AttachmentTooLargeError.name,
        classTakes: AttachmentTooLargeError.length,
        onThePrototype: Object.getOwnPropertyNames(AttachmentTooLargeError.prototype),
        cause: "cause" in failure,
        asJson: JSON.parse(JSON.stringify(failure)),
      };
    },
  },
  {
    name: "the failure's message writes whatever limit it is given",
    run: ({ limits }) =>
      asked([0, 1, -1, 1.5, 209_715_200, Number.NaN, Number.POSITIVE_INFINITY, undefined, null, "12", "", true, [1, 2], {}, 9n], (limit) => {
        const failure = new limits.AttachmentTooLargeError(limit);
        return [failure.message, failure.limitBytes, Object.keys(failure)];
      }),
  },
  {
    name: "the failure made with no limit, with too much, without 'new', and with a limit that cannot be written",
    run: ({ limits }) => {
      const { AttachmentTooLargeError } = limits;
      const bare = new AttachmentTooLargeError();
      const crowded = new AttachmentTooLargeError(1, 2, { cause: "ignored" });
      return {
        bare: [bare.message, Object.keys(bare), "limitBytes" in bare, bare.limitBytes],
        crowded: [crowded.message, Object.keys(crowded), "cause" in crowded],
        withoutNew: attempt(() => AttachmentTooLargeError(5)),
        symbol: attempt(() => new AttachmentTooLargeError(Symbol("limit"))),
        twoAreNotOne: new AttachmentTooLargeError(5) !== new AttachmentTooLargeError(5),
        limitCanBeChanged: (() => {
          const failure = new AttachmentTooLargeError(5);
          failure.limitBytes = 6;
          failure.name = "Renamed";
          return [failure.limitBytes, failure.name, failure.message, String(failure)];
        })(),
      };
    },
  },
  {
    name: "the failure as a caller throws it",
    run: ({ limits }) => {
      throw new limits.AttachmentTooLargeError(limits.attachmentByteLimitForName("holiday.mov"));
    },
  },

  // ----- attachment-open-policy ------------------------------------------
  {
    name: "an attachment's extension is what follows its last dot, in small letters and without the dot; a first dot or a last dot gives none",
    run: ({ openPolicy }) => asked(NAMES, openPolicy.attachmentExtension),
  },
  {
    name: "only what follows the last slash of either kind is looked at for an attachment's extension",
    run: ({ openPolicy }) => asked(PATHS, openPolicy.attachmentExtension),
  },
  {
    name: "an attachment's extension in another alphabet is made small the way JavaScript does it",
    run: ({ openPolicy }) => asked(OTHER_ALPHABETS, openPolicy.attachmentExtension),
  },
  {
    name: "asking an attachment's extension of what is not a text fails",
    run: ({ openPolicy }) => asked(NOT_TEXTS, (value) => attempt(() => openPolicy.attachmentExtension(value))),
  },

  // ----- attachment-preview -----------------------------------------------
  {
    name: "the extensions shown as text, whole and in their order",
    run: ({ preview }) => ({ extensions: preview.TEXT_PREVIEWABLE_EXTENSIONS, count: preview.TEXT_PREVIEWABLE_EXTENSIONS.size, isASet: preview.TEXT_PREVIEWABLE_EXTENSIONS instanceof Set }),
  },
  {
    name: "a name is shown as text when its extension is one of them, in small letters or capitals, alone or in a path",
    run: ({ preview }) => Object.fromEntries(EVERY_EXTENSION.map((extension) => [extension, [`notes.${extension}`, `NOTES.${extension.toUpperCase()}`, `dir.d/sub\\notes.x.${extension}`].map((name) => preview.isTextPreviewableName(name))])),
  },
  {
    name: "a name with no extension is not shown as text, even when the whole name is one",
    run: ({ preview }) =>
      asked(
        [...NAMES, ...PATHS, "Dockerfile", "dockerfile", "x.dockerfile", "Makefile", "README", "README.md", "txt", ".txt", "a.txt.", "a.txt ", ".gitignore", ".env", "prod.env", "a.TXT", "dir.txt/file", "dir/file.Py", "a.d.ts", "a.tar.gz", "a.pdf", "a.docx", "a.xlsx"],
        preview.isTextPreviewableName,
      ),
  },
  {
    name: "a name is shown as text by the list as it is when asked",
    run: (all) =>
      whileChanged(
        all,
        ({ texts }) => {
          texts.add("zzz");
          texts.delete("txt");
        },
        () => ["a.zzz", "a.txt", "a.md"].map((name) => all.preview.isTextPreviewableName(name)),
      ),
  },
  {
    name: "asking whether what is not a text is shown as text fails",
    run: ({ preview }) => asked(NOT_TEXTS, (value) => attempt(() => preview.isTextPreviewableName(value))),
  },
  {
    name: "the binary test looks at 8,192 bytes and allows three control bytes in ten",
    run: ({ preview }) => ({ window: preview.BINARY_SNIFF_BYTE_WINDOW, ratio: preview.BINARY_CONTROL_BYTE_RATIO }),
  },
  {
    name: "bytes look binary when one of them is zero, wherever it is",
    run: ({ preview }) =>
      cases(
        {
          "no bytes": bytes(),
          "one zero": bytes(0),
          "a zero first": bytes(0, letters("hello")),
          "a zero last": bytes(letters("hello"), 0),
          "a zero in the middle of a long text": bytes(letters("a".repeat(500)), 0, letters("b".repeat(500))),
          "no zero": bytes(letters("hello, world\n")),
          "one letter": bytes(65),
        },
        preview.looksLikeBinary,
      ),
  },
  {
    name: "one byte alone looks binary when it is a control byte: below 32, and not a tab, a line end or their three neighbours",
    run: ({ preview }) => Array.from({ length: 256 }, (_, value) => value).filter((value) => preview.looksLikeBinary(bytes(value))),
  },
  {
    name: "bytes look binary when more than three in ten are control bytes, and not at three in ten exactly",
    run: ({ preview }) => {
      const mixed = (controls, total, control = 1) => bytes(new Array(controls).fill(control), new Array(total - controls).fill(97));
      return cases(
        {
          "3 of 10": mixed(3, 10),
          "4 of 10": mixed(4, 10),
          "2 of 10": mixed(2, 10),
          "30 of 100": mixed(30, 100),
          "31 of 100": mixed(31, 100),
          "300 of 1000": mixed(300, 1000),
          "301 of 1000": mixed(301, 1000),
          "1 of 3": mixed(1, 3),
          "1 of 4": mixed(1, 4),
          "all of 10": mixed(10, 10),
          "none of 10": mixed(0, 10),
          "tabs and line ends only": bytes(9, 10, 11, 12, 13, 9, 10, 11, 12, 13),
          "4 of 10, the control bytes being 8 and 14": bytes(8, 14, 8, 14, 97, 97, 97, 97, 97, 97),
          "4 of 10, the control bytes being 31": mixed(4, 10, 31),
          "4 of 10 being spaces (32)": mixed(4, 10, 32),
          "4 of 10 being 127": mixed(4, 10, 127),
          "4 of 10 being 128": mixed(4, 10, 128),
          "4 of 10 being 255": mixed(4, 10, 255),
          "control bytes last": bytes(letters("abcdef"), 1, 2, 3, 4),
          "control bytes spread": bytes(1, 97, 2, 97, 3, 97, 4, 97, 97, 97),
          "an escape sequence in a line of text": bytes(27, letters("[31mred"), 27, letters("[0m\n")),
          "a short escape sequence": bytes(27, letters("[m")),
        },
        preview.looksLikeBinary,
      );
    },
  },
  {
    name: "only the first 8,192 bytes are looked at, and the three in ten are counted over them",
    run: ({ preview }) => {
      const text = (length) => new Uint8Array(length).fill(97);
      const withZeroAt = (length, at) => withByte(text(length), at, 0);
      const withControls = (length, controls) => {
        const made = text(length);
        made.fill(1, 0, controls);
        return made;
      };
      const controlsAfter = (length) => {
        const made = text(length);
        made.fill(1, 8192);
        return made;
      };
      return cases(
        {
          "8,193 bytes, the zero last (past the window)": withZeroAt(8193, 8192),
          "8,193 bytes, the zero at the window's last byte": withZeroAt(8193, 8191),
          "8,192 bytes, the zero last": withZeroAt(8192, 8191),
          "8,191 bytes, the zero last": withZeroAt(8191, 8190),
          "20,000 bytes, a zero at 10,000": withZeroAt(20000, 10000),
          "20,000 bytes, a zero first": withZeroAt(20000, 0),
          "8,192 bytes of text then 8,192 control bytes": controlsAfter(16384),
          "8,192 bytes of text then one control byte": controlsAfter(8193),
          "8,192 bytes, 2,457 of them control bytes": withControls(8192, 2457),
          "8,192 bytes, 2,458 of them control bytes": withControls(8192, 2458),
          "8,193 bytes, 2,457 control bytes in the window": withControls(8193, 2457),
          "8,193 bytes, 2,458 control bytes in the window": withControls(8193, 2458),
          "100,000 bytes, 2,458 control bytes first": withControls(100000, 2458),
          "100,000 bytes, 2,457 control bytes first": withControls(100000, 2457),
        },
        preview.looksLikeBinary,
      );
    },
  },
  {
    name: "bytes are judged the same as a Buffer and as a window into a larger buffer",
    run: ({ preview }) => {
      const larger = bytes(0, 0, letters("plain text"), 0, 0);
      return {
        bufferOfText: preview.looksLikeBinary(Buffer.from("plain text\n")),
        bufferWithZero: preview.looksLikeBinary(Buffer.from([104, 0, 105])),
        windowBetweenZeros: preview.looksLikeBinary(larger.subarray(2, 12)),
        windowOverOneZero: preview.looksLikeBinary(larger.subarray(1, 12)),
        emptyWindow: preview.looksLikeBinary(larger.subarray(4, 4)),
        emptyBuffer: preview.looksLikeBinary(Buffer.alloc(0)),
        bufferOfControls: preview.looksLikeBinary(Buffer.from([1, 2, 3, 104])),
        windowPastTheLimit: preview.looksLikeBinary(new Uint8Array(20000).fill(97).fill(1, 0, 3000).subarray(1000, 9500)),
      };
    },
  },
  {
    name: "asking whether nothing at all looks binary fails",
    run: ({ preview }) => asked([null, undefined], (value) => attempt(() => preview.looksLikeBinary(value))),
  },

  {
    name: "four hundred made-up runs of bytes, each judged binary or not",
    run: ({ preview }) => {
      const next = sequence(8192);
      // Six control bytes in twenty: a run is near the three in ten, on either side of it. One run in five may hold a zero.
      const pool = [1, 7, 8, 14, 27, 31, 9, 10, 13, 32, 65, 97, 97, 97, 97, 97, 127, 128, 255, 97];
      const judged = Array.from({ length: 400 }, (_, run) => {
        const made = Array.from({ length: next(41) }, () => (run % 5 === 0 && next(25) === 0 ? 0 : pool[next(pool.length)]));
        return [made, preview.looksLikeBinary(Uint8Array.from(made))];
      });
      return {
        binary: judged.filter(([, binary]) => binary).length,
        each: judged.map(([made, binary]) => `${binary ? "binary" : "text"}: ${made.join(" ")}`),
      };
    },
  },

  // ----- file-preview-kind ------------------------------------------------
  {
    name: "each extension is shown one way: the first that fits of picture, video, sound, PDF, table, JSON, Markdown, Word, text, and unknown for the rest",
    run: ({ previewKind }) => Object.fromEntries(EVERY_EXTENSION.map((extension) => [extension, [previewKind.getFilePreviewKind(`file.${extension}`), previewKind.getFilePreviewKind(`DIR.png/FILE.X.${extension.toUpperCase()}`)]])),
  },
  {
    name: "a name is shown by its last extension, and one with none is unknown",
    run: ({ previewKind }) =>
      asked(
        [...NAMES, ...PATHS, ...OTHER_ALPHABETS, "report.PDF", "report.pdf.txt", "report.txt.pdf", "sheet.CSV", "sheet.Xlsx", "data.JSON", "data.json5", "notes.MD", "letter.DOCX", "letter.doc", "pdf", ".pdf", "report.pdf.", "report.pdf ", "report.pdf?page=2", "icon.svg", "clip.ts", "clip.mts", "song.ogg"],
        previewKind.getFilePreviewKind,
      ),
  },
  {
    name: "a file's bytes are needed to show a PDF, a table, a Word file, a text, JSON or Markdown, and for nothing else",
    run: ({ previewKind }) =>
      asked(["image", "video", "audio", "pdf", "table", "json", "markdown", "docx", "text", "unknown", "", "PDF", "Text", " pdf", "document", "archive", "file", undefined, null, 0, ["pdf"], { kind: "pdf" }], previewKind.previewKindNeedsBytes),
  },
  {
    name: "pictures, videos and sounds are those the tables held when the engine started; text follows its list as it is when asked",
    run: (all) =>
      whileChanged(
        all,
        ({ pictures, videos, sounds, texts }) => {
          pictures[".zzz"] = "image/zzz";
          videos[".yyy"] = "video/yyy";
          sounds[".xxx"] = "audio/xxx";
          texts.add("www");
          delete pictures[".png"];
          delete videos[".mp4"];
          delete sounds[".mp3"];
          texts.delete("txt");
          texts.delete("md");
          texts.delete("json");
          texts.delete("csv");
          texts.delete("svg");
        },
        () => ["a.zzz", "a.yyy", "a.xxx", "a.www", "a.png", "a.mp4", "a.mp3", "a.txt", "a.md", "a.json", "a.csv", "a.svg"].map((name) => [all.previewKind.getFilePreviewKind(name), all.summary.classifyPathLike(name)]),
      ),
  },
  {
    name: "asking how to show what is not a text fails",
    run: ({ previewKind }) => asked(NOT_TEXTS, (value) => attempt(() => previewKind.getFilePreviewKind(value))),
  },

  // ----- attachment-summary: media types ----------------------------------
  {
    name: "a media type is sorted by how it starts: any picture, video or sound type, known or not",
    run: ({ summary }) =>
      asked(
        ["image/png", "image/jpeg", "image/heic", "image/svg+xml", "image/x-anything", "image/", "video/mp4", "video/quicktime", "video/x-anything", "video/", "audio/mpeg", "audio/ogg", "audio/x-anything", "audio/", "image", "video", "audio", "images/png", "ximage/png", "application/image/png"],
        summary.classifyMimeType,
      ),
  },
  {
    name: "a media type is sorted by its exact name: PDF, Markdown, each table type, JSON, each Word type, each packed type",
    run: ({ summary }) =>
      asked(
        [
          "application/pdf", "text/markdown",
          "text/csv", "text/tab-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/json",
          "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/zip", "application/x-zip-compressed", "application/gzip", "application/x-tar", "application/x-bzip2", "application/x-xz", "application/zstd", "application/x-7z-compressed", "application/x-rar-compressed", "application/vnd.rar",
        ],
        summary.classifyMimeType,
      ),
  },
  {
    name: "any type that ends in +json is JSON, any other text type is text, and the rest is nothing",
    run: ({ summary }) =>
      asked(
        [
          "application/ld+json", "application/vnd.api+json", "application/geo+json", "+json", "x+json", "application/json+ld", "application/jsonl", "application/json5", "application/x-ndjson", "application/x-json", "json",
          "text/plain", "text/html", "text/css", "text/javascript", "text/x-python", "text/xml", "text/", "text", "text/x-markdown", "text/markdown2", "text/comma-separated-values",
          "application/octet-stream", "application/xml", "application/javascript", "application/x-pdf", "application/pdf2", "xapplication/pdf", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.oasis.opendocument.text", "application/rtf", "application/x-gzip", "application/x-compressed", "application/x-zip", "application/vnd.ms-excel.sheet.macroenabled.12", "font/woff2", "model/gltf+json", "multipart/form-data", "*/*", "",
          ...OBJECT_WORDS,
        ],
        summary.classifyMimeType,
      ),
  },
  {
    name: "when a media type fits more than one sort, the first of the list wins: a picture before JSON, a table and Markdown and JSON before text",
    run: ({ summary }) =>
      asked(["image/svg+xml", "image/x+json", "video/x+json", "audio/x+json", "text/x+json", "text/markdown", "text/csv", "text/tab-separated-values", "text/csv+json", "application/pdf+json", "application/zip+json", "text/plain+json", "image/pdf", "text/json"], summary.classifyMimeType),
  },
  {
    name: "a media type is read up to its first semicolon, without the spaces around it, in any capitals",
    run: ({ summary }) =>
      asked(
        [
          "text/plain; charset=utf-8", "TEXT/PLAIN;CHARSET=UTF-8", "application/json; charset=utf-8", "image/png;", "image/png;;", ";image/png", "; image/png", " ; ", ";", "  image/png  ", "\timage/png\n", "\u00a0image/png\u00a0", "\ufeffimage/png",
          "IMAGE/PNG", "Application/PDF", "APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT", "Text/Markdown ; variant=GFM", "application/ld+JSON ; profile=x", "image /png", "image/ png", "application/pdf ;", "application/ pdf", "text/csv;header=present", "multipart/mixed; boundary=image/png",
        ],
        summary.classifyMimeType,
      ),
  },
  {
    name: "sorting a media type that is not a text fails",
    run: ({ summary }) => asked(NOT_TEXTS, (value) => attempt(() => summary.classifyMimeType(value))),
  },

  {
    name: "media types put together from every first part, second part and ending, grouped by how they are sorted",
    run: ({ summary }) => {
      const firsts = ["image", "video", "audio", "text", "application", "IMAGE", "Text", "", "x", " image", "font"];
      const seconds = ["png", "plain", "markdown", "csv", "tab-separated-values", "json", "pdf", "zip", "msword", "x+json", "vnd.ms-excel", "octet-stream", "", "JSON", "PDF", "x+JSON", "gzip", "vnd.rar"];
      const endings = ["", ";charset=utf-8", " ; q=1", " ", ";"];
      const grouped = {};
      for (const first of firsts) for (const second of seconds) for (const ending of endings) (grouped[String(summary.classifyMimeType(`${first}/${second}${ending}`))] ??= []).push(`${first}/${second}${ending}`);
      return grouped;
    },
  },

  // ----- attachment-summary: names, paths and addresses --------------------
  {
    name: "of an address, the path is what an extension is looked for in, with its escapes read; what is not an address is taken as it is",
    run: ({ summary }) => asked(ADDRESSES, summary.extensionSubject),
  },
  {
    name: "names and paths are no addresses, save a drive letter or a word before a colon, which read as one",
    run: ({ summary }) => asked([...NAMES, ...PATHS, ...OTHER_ALPHABETS], summary.extensionSubject),
  },
  {
    name: "what is not a text is given back as it is when it does not read as an address, and its path when it does",
    run: ({ summary }) =>
      asked([null, undefined, 0, 5, true, {}, new URL("https://example.com/from%20a%20url.PNG?x=1"), { toString: () => "https://example.com/said.pdf" }, { toString: () => "said.pdf" }], (value) => {
        const answer = attempt(() => summary.extensionSubject(value));
        return answer === value ? "the same thing" : answer;
      }),
  },
  {
    name: "each extension sorts a name: pictures, videos, sounds, PDFs, Markdown and tables as they are shown, Word files as documents, the JSON family as JSON, other text as text, packed files as archives, the rest as nothing",
    run: ({ summary }) => Object.fromEntries(EVERY_EXTENSION.map((extension) => [extension, [summary.classifyPathLike(`file.${extension}`), summary.classifyPathLike(`https://example.com/Files/FILE.${extension.toUpperCase()}?download=1#top`)]])),
  },
  {
    name: "a name or a path is sorted by its last extension, and one with none is nothing",
    run: ({ summary }) => asked([...NAMES, ...PATHS, ...OTHER_ALPHABETS, "backup.tar.gz", "backup.TGZ", "backup.zip.txt", "data.json.zip", "x.7Z", "x.7z.", "zip", ".zip", "report.pdf?page=2", "report.PDF "], summary.classifyPathLike),
  },
  {
    name: "an address is sorted by the extension of its path, not of its host, its query or its fragment",
    run: ({ summary }) => asked(ADDRESSES, summary.classifyPathLike),
  },
  {
    name: "sorting a name that is not a text fails, save what reads as an address",
    run: ({ summary }) => asked([null, undefined, 0, 5, true, {}, new URL("https://example.com/from%20a%20url.PNG?x=1"), { toString: () => "https://example.com/said.pdf" }, { toString: () => "said.pdf" }], (value) => attempt(() => summary.classifyPathLike(value))),
  },

  {
    name: "an extension named like something every object has is no kind of file",
    run: (all) =>
      asked(OBJECT_WORDS.flatMap((word) => [`file.${word}`, `FILE.${word.toUpperCase()}`]), (name) => ({
        extension: all.extensions.extensionOf(name),
        attachment: all.openPolicy.attachmentExtension(name),
        types: [all.mime.imageMimeFromPath(name), all.mime.servableImageMimeFromPath(name), all.mime.videoMimeFromPath(name), all.mime.audioMimeFromPath(name)],
        video: all.limits.nameLooksLikeVideo(name),
        text: all.preview.isTextPreviewableName(name),
        shown: all.previewKind.getFilePreviewKind(name),
        sorted: all.summary.classifyPathLike(name),
      })),
  },
  {
    name: "five hundred made-up names, each asked of every function that reads a name",
    run: (all) =>
      madeUpNames(500, 20261114).map((name) => {
        const subject = all.summary.extensionSubject(name);
        return [
          name,
          [
            `extension ${JSON.stringify(all.extensions.extensionOf(name))}`,
            `attachment's ${JSON.stringify(all.openPolicy.attachmentExtension(name))}`,
            `types ${[all.mime.imageMimeFromPath(name), all.mime.servableImageMimeFromPath(name), all.mime.videoMimeFromPath(name), all.mime.audioMimeFromPath(name)].map(String).join(" ")}`,
            `limit ${all.limits.attachmentByteLimitForName(name)}`,
            `text ${all.preview.isTextPreviewableName(name)}`,
            `shown as ${all.previewKind.getFilePreviewKind(name)}`,
            `sorted as ${all.summary.classifyPathLike(name)}`,
            subject === name ? "read as it is" : `read as ${JSON.stringify(subject)}`,
          ].join(", "),
        ];
      }),
  },

  // ----- attachment-summary: an attachment -------------------------------
  {
    name: "an attachment is sorted by its media type first, then its name, then its address or path, and is a plain file when none tells",
    run: ({ summary }) =>
      cases(
        {
          "the type alone": { mimeType: "image/png" },
          "the name alone": { fileName: "notes.md" },
          "the address alone": { urlOrPath: "https://example.com/clip.mp4?x=1" },
          "nothing": {},
          "the type over the name and the address": { mimeType: "application/pdf", fileName: "photo.png", urlOrPath: "/tmp/clip.mp4" },
          "the name over the address": { fileName: "photo.png", urlOrPath: "/tmp/clip.mp4" },
          "a type that tells nothing, then the name": { mimeType: "application/octet-stream", fileName: "photo.png", urlOrPath: "/tmp/clip.mp4" },
          "a type and a name that tell nothing, then the address": { mimeType: "application/octet-stream", fileName: "blob", urlOrPath: "/tmp/clip.mp4" },
          "a type, a name and an address that tell nothing": { mimeType: "application/octet-stream", fileName: "blob", urlOrPath: "https://example.com/download" },
          "a name that tells nothing, then the address": { fileName: "download.bin", urlOrPath: "https://example.com/files/backup.tar.gz" },
          "a type with a parameter": { mimeType: "Text/Plain; charset=utf-8", fileName: "photo.png" },
          "a text type over a name that is more exact": { mimeType: "text/plain", fileName: "data.json" },
          "an address as the name": { fileName: "https://example.com/files/photo%20one.JPG?size=large" },
          "a name as the address": { urlOrPath: "sheet.xlsx" },
          "a Word file by its type": { mimeType: "application/msword" },
          "a Word file by its name": { fileName: "letter.docx" },
          "a packed file by its type": { mimeType: "application/gzip", fileName: "photo.png" },
          "a packed file by its address": { urlOrPath: "C:\\Users\\me\\backup.RAR" },
          "a sound by its name": { fileName: "voice.m4a" },
          "a phone picture by its name is a plain file": { fileName: "IMG_0001.HEIC" },
          "a phone picture by its type is a picture": { mimeType: "image/heic", fileName: "IMG_0001.HEIC" },
          "fields it does not know": { kind: "video", name: "clip.mp4", path: "/tmp/clip.mp4" },
        },
        summary.classifyAttachment,
      ),
  },
  {
    name: "an empty or missing type, name or address is passed over",
    run: ({ summary }) =>
      cases(
        {
          "an empty type": { mimeType: "", fileName: "photo.png" },
          "a null type": { mimeType: null, fileName: "photo.png" },
          "a type left undefined": { mimeType: undefined, fileName: "photo.png" },
          "a type of one space": { mimeType: " ", fileName: "photo.png" },
          "an empty name": { fileName: "", urlOrPath: "clip.mov" },
          "a null name": { fileName: null, urlOrPath: "clip.mov" },
          "a name of one space": { fileName: " ", urlOrPath: "clip.mov" },
          "an empty address": { urlOrPath: "" },
          "a null address": { urlOrPath: null },
          "all three null": { mimeType: null, fileName: null, urlOrPath: null },
          "all three empty": { mimeType: "", fileName: "", urlOrPath: "" },
          "a type that is a number": { mimeType: 5, fileName: "photo.png" },
          "a name that is a number": { fileName: 5, urlOrPath: "clip.mov" },
          "an address that is a number": { urlOrPath: 5 },
          "a type that is true": { mimeType: true, fileName: "photo.png" },
          "an empty list as the type": { mimeType: [], fileName: "photo.png" },
        },
        summary.classifyAttachment,
      ),
  },
  {
    name: "an attachment that is nothing at all fails, and one that is no object is a plain file",
    run: ({ summary }) => asked([null, undefined, 5, "photo.png", true, []], (value) => attempt(() => summary.classifyAttachment(value))),
  },
  {
    name: "the type, the name and the address are read in that order, and no further than the one that tells",
    run: ({ summary }) => {
      const reads = (fields) => {
        const read = [];
        const source = {};
        for (const [name, value] of Object.entries(fields)) Object.defineProperty(source, name, { enumerable: true, get: () => (read.push(name), value) });
        return { sorted: summary.classifyAttachment(source), read: [...new Set(read)] };
      };
      return [
        reads({ mimeType: "image/png", fileName: "a.pdf", urlOrPath: "a.mp4" }),
        reads({ mimeType: "application/octet-stream", fileName: "a.pdf", urlOrPath: "a.mp4" }),
        reads({ mimeType: null, fileName: "a", urlOrPath: "a.mp4" }),
        reads({ mimeType: "", fileName: "", urlOrPath: "" }),
      ];
    },
  },
  {
    name: "attachments are counted by sort, each sort once, in the order it first came",
    run: ({ summary }) =>
      cases(
        {
          "none": [],
          "one": ["image"],
          "the same three times": ["pdf", "pdf", "pdf"],
          "mixed": ["image", "file", "image", "video", "file", "image"],
          "every sort once, backwards": ["file", "archive", "document", "text", "json", "table", "markdown", "pdf", "audio", "video", "image"],
          "sorts it does not know": ["image", "IMAGE", "", "picture", "", "image "],
          "sorts named like things every object has": ["constructor", "__proto__", "toString", "constructor", "__proto__", "hasOwnProperty"],
          "what is not a text is counted as itself": ["1", 1, 1, null, undefined, null, Number.NaN, Number.NaN, 0, -0, true],
        },
        summary.countAttachmentKinds,
      ),
  },
  {
    name: "the count is a new list of new entries each time",
    run: ({ summary }) => {
      const kinds = Object.freeze(["image", "image", "pdf"]);
      const first = summary.countAttachmentKinds(kinds);
      const second = summary.countAttachmentKinds(kinds);
      first[0].count = 99;
      first.push("changed");
      return {
        second,
        notTheSameList: first !== second,
        notTheSameEntry: first[0] !== second[0],
        isAList: Array.isArray(second),
        entryFields: Object.keys(second[0]),
        entryIsAPlainObject: Object.getPrototypeOf(second[0]) === Object.prototype,
        theListGivenIsUntouched: [...kinds],
      };
    },
  },
  {
    name: "counting what cannot be walked fails",
    run: ({ summary }) => asked([null, undefined, 5, {}], (value) => attempt(() => summary.countAttachmentKinds(value))),
  },

  // ----- image-dimensions: PNG ---------------------------------------------
  {
    name: "a PNG's size is the two numbers after IHDR, read as whole numbers of any size",
    run: ({ image }) =>
      cases(
        {
          "640 by 480": png(640, 480),
          "1 by 1": png(1, 1),
          "1 by 65,536": png(1, 65536),
          "the largest numbers four bytes hold": png(0xffffffff, 0xffffffff),
          "numbers with the top bit set": png(0x80000000, 0x80000001),
          "each byte of a side different": png(0x01020304, 0x05060708),
          "a first chunk that says another length": png(640, 480, { length: 0 }),
          "a Buffer": Buffer.from(png(320, 200)),
          "a window into a larger buffer": windowed(png(321, 201)),
          "with a whole picture after the header": bytes(png(8, 9), box("IDAT", zeros(20)), box("IEND")),
        },
        image.readPngDimensions,
      ),
  },
  {
    name: "a PNG needs its 24 first bytes, its eight starting bytes, and IHDR as its first chunk",
    run: ({ image }) => {
      const whole = png(640, 480);
      return {
        cutShort: Object.fromEntries([0, 1, 8, 16, 20, 23, 24, 25, 33].map((length) => [length, image.readPngDimensions(cut(whole, length))])),
        oneStartingByteWrong: PNG_START.map((byte, at) => image.readPngDimensions(withByte(whole, at, byte ^ 1))),
        otherChunkNames: asked(["IDAT", "ihdr", "IHDr", "iHDR", "IHD\u0000", "JHDR", "IEND"], (chunk) => image.readPngDimensions(png(640, 480, { chunk }))),
      };
    },
  },
  {
    name: "a PNG with a side of nothing has no size",
    run: ({ image }) => cases({ "no width": png(0, 480), "no height": png(640, 0), "neither": png(0, 0) }, image.readPngDimensions),
  },

  // ----- image-dimensions: GIF ---------------------------------------------
  {
    name: "a GIF's size is the two numbers after its six letters, the low byte first",
    run: ({ image }) =>
      cases(
        {
          "a GIF89a of 320 by 240": gif(320, 240),
          "a GIF87a of 320 by 240": gif(320, 240, "GIF87a"),
          "1 by 1": gif(1, 1),
          "the largest numbers two bytes hold": gif(65535, 65535),
          "each byte of a side different": gif(0x0102, 0x0304),
          "a Buffer": Buffer.from(gif(11, 12)),
          "a window into a larger buffer": windowed(gif(13, 14)),
          "exactly ten bytes": cut(gif(15, 16), 10),
        },
        image.readGifDimensions,
      ),
  },
  {
    name: "a GIF needs ten bytes and one of its two starts, and a side of nothing gives no size",
    run: ({ image }) => ({
      cutShort: Object.fromEntries([0, 5, 6, 9, 10, 11].map((length) => [length, image.readGifDimensions(cut(gif(320, 240), length))])),
      otherStarts: asked(["GIF88a", "GIF89b", "gif89a", "GIF90a", "GIF8 a", "JIF89a", "GIF89A", "\u0089PNG\r\n"], (start) => image.readGifDimensions(gif(320, 240, start))),
      noWidth: image.readGifDimensions(gif(0, 240)),
      noHeight: image.readGifDimensions(gif(320, 0)),
    }),
  },

  // ----- image-dimensions: JPEG --------------------------------------------
  {
    name: "a JPEG's size is in its first frame header, the height before the width, after any segments that come first",
    run: ({ image }) =>
      cases(
        {
          "the frame right after the start": jpeg(frame(800, 600)),
          "after the usual first segments": jpeg(APP0, QUANT, frame(1024, 768)),
          "a progressive picture": jpeg(APP0, QUANT, frame(1025, 769, 0xc2)),
          "after a long segment": jpeg(segment(0xe1, zeros(5000)), frame(4000, 3000)),
          "after the longest segment there is": jpeg(segment(0xe2, zeros(65533)), frame(4001, 3001)),
          "after a segment that holds a small picture of its own": jpeg(segment(0xe1, letters("Exif"), [0, 0], [255, 216], frame(160, 120), [255, 217]), frame(4032, 3024)),
          "two frames: the first is the one": jpeg(frame(10, 20), frame(30, 40)),
          "each byte of a side different": jpeg(frame(0x0102, 0x0304)),
          "the largest numbers two bytes hold": jpeg(frame(65535, 65535)),
          "a Buffer": Buffer.from(jpeg(APP0, frame(33, 44))),
          "a window into a larger buffer": windowed(jpeg(APP0, frame(55, 66))),
          "a whole small picture": jpeg(APP0, QUANT, frame(2, 3), segment(0xc4, zeros(20)), segment(0xda, zeros(10)), [1, 2, 3], [255, 217]),
        },
        image.readJpegDimensions,
      ),
  },
  {
    name: "each of the 256 markers, met before the frame: thirteen are frame headers themselves, eleven have no inside, the scan's start ends the search, the rest are stepped over",
    run: ({ image }) => {
      // FF D8, then FF and the marker with a length of 4 and two bytes inside, then a frame of 300 by 200.
      const answers = Array.from({ length: 256 }, (_, marker) => image.readJpegDimensions(bytes([255, 216], [255, marker, 0, 4, 0xaa, 0xbb], frame(300, 200))));
      const grouped = {};
      answers.forEach((answer, marker) => (grouped[said(answer)] ??= []).push(marker));
      return grouped;
    },
  },
  {
    name: "markers with no inside are stepped over two bytes at a time, and filling bytes one at a time",
    run: ({ image }) =>
      cases(
        {
          "restart markers then the frame": jpeg([255, 0xd0], [255, 0xd7], frame(21, 22)),
          "the end marker then the frame": jpeg([255, 0xd9], frame(23, 24)),
          "a second start then the frame": jpeg([255, 0xd8], frame(25, 26)),
          "marker 1 then the frame": jpeg([255, 0x01], frame(27, 28)),
          "filling FF bytes before the frame": jpeg([255, 255, 255], frame(29, 30)),
          "bytes that are no marker before the frame": jpeg([1, 2, 3, 0, 254], frame(31, 32)),
          "a stray byte between segments": jpeg(APP0, [7], frame(33, 34)),
          "FF 00 is read as a segment with a length": jpeg([255, 0, 0, 2], frame(35, 36)),
          "FF 00 with a length that jumps past the frame": jpeg([255, 0, 0, 40], frame(37, 38)),
          "three segments that are no frames (C4, C8, CC) then the frame": jpeg(segment(0xc4, zeros(4)), segment(0xc8, zeros(4)), segment(0xcc, zeros(4)), frame(39, 40)),
        },
        image.readJpegDimensions,
      ),
  },
  {
    name: "a JPEG gives no size when the scan starts before any frame, when a length is under two, when it is cut, or when a side is nothing",
    run: ({ image }) => {
      const whole = jpeg(frame(800, 600));
      return {
        ...cases(
          {
            "the scan's start first": jpeg(segment(0xda, zeros(4)), frame(1, 2)),
            "the scan's start after a segment": jpeg(APP0, segment(0xda, zeros(4)), frame(1, 2)),
            "a segment with a length of 0": jpeg([255, 0xe0, 0, 0], frame(1, 2)),
            "a segment with a length of 1": jpeg([255, 0xe0, 0, 1], frame(1, 2)),
            "a segment with a length of 2": jpeg([255, 0xe0, 0, 2], frame(3, 4)),
            "a frame whose own length is 0": bytes([255, 216], [255, 0xc0, 0, 0, 8], be16(600), be16(800), zeros(4)),
            "a frame whose own length is 1": bytes([255, 216], [255, 0xc0, 0, 1, 8], be16(600), be16(800), zeros(4)),
            "a frame whose own length is 2": bytes([255, 216], [255, 0xc0, 0, 2, 8], be16(600), be16(800), zeros(4)),
            "a segment that runs past the end": jpeg([255, 0xe0, 0x10, 0], frame(1, 2)),
            "no frame at all": jpeg(APP0, QUANT),
            "no width": jpeg(frame(0, 600)),
            "no height": jpeg(frame(800, 0)),
            "neither side": jpeg(frame(0, 0)),
            "only the start and the end": bytes(255, 216, 255, 217),
            "only the start and zeros": bytes(255, 216, zeros(40)),
          },
          image.readJpegDimensions,
        ),
        cutShort: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, whole.length].map((length) => [length, image.readJpegDimensions(cut(whole, length))])),
        wrongStart: asked([[255, 217], [254, 216], [0, 216], [255, 0], [216, 255], [137, 80]], (start) => image.readJpegDimensions(bytes(start, frame(800, 600)))),
      };
    },
  },

  // ----- image-dimensions: WebP --------------------------------------------
  {
    name: "a WebP's size is read one of three ways, by the name of its first chunk",
    run: ({ image }) =>
      cases(
        {
          "lossy, 640 by 480": webpLossy(640, 480),
          "lossy, 1 by 1": webpLossy(1, 1),
          "lossy, the largest sides": webpLossy(16383, 16383),
          "lossy, the two top bits of each side are not the size": webpLossy(640 | 0x4000, 480 | 0xc000),
          "lossy, only the top bits set": webpLossy(0x8000, 0x4000),
          "lossless, 800 by 600": webpLossless(800, 600),
          "lossless, 1 by 1": webpLossless(1, 1),
          "lossless, the largest sides": webpLossless(16384, 16384),
          "lossless, the four last bits are not the size": webpLossless(801, 601, 0xf),
          "lossless, 1 by the largest": webpLossless(1, 16384),
          "lossless, the largest by 1": webpLossless(16384, 1),
          "extended, 1920 by 1080": webpExtended(1920, 1080),
          "extended, 1 by 1": webpExtended(1, 1),
          "extended, the largest sides": webpExtended(16777216, 16777216),
          "extended, each byte of a side different": webpExtended(0x010203 + 1, 0x040506 + 1),
          "a Buffer": Buffer.from(webpLossy(41, 42)),
          "a window into a larger buffer": windowed(webpExtended(43, 44)),
          "lossy with more after it": bytes(webpLossy(45, 46), zeros(50)),
        },
        image.readWebpDimensions,
      ),
  },
  {
    name: "a WebP needs 30 bytes, RIFF, WEBP and a first chunk it knows, and a lossy side of nothing gives no size",
    run: ({ image }) => ({
      cutShort: Object.fromEntries(
        [0, 12, 16, 25, 29, 30].map((length) => [length, [image.readWebpDimensions(cut(webpLossy(640, 480), length)), image.readWebpDimensions(cut(bytes(webpLossless(800, 600), zeros(4)), length)), image.readWebpDimensions(cut(webpExtended(1920, 1080), length))]]),
      ),
      otherFirstChunks: asked(["ALPH", "ICCP", "ANIM", "EXIF", "vp8 ", "VP8\u0000", "VP8l", "VP8x", "VP80", "    "], (kind) => image.readWebpDimensions(riff(kind, zeros(14)))),
      notRiff: asked(["RIFX", "riff", "RIF ", "FFIR"], (start) => image.readWebpDimensions(bytes(letters(start), webpLossy(640, 480).subarray(4)))),
      notWebp: asked(["WAVE", "webp", "WEBp", "AVI "], (kind) => image.readWebpDimensions(bytes(letters("RIFF"), le32(22), letters(kind), webpLossy(640, 480).subarray(12)))),
      lossyNoWidth: image.readWebpDimensions(webpLossy(0, 480)),
      lossyNoHeight: image.readWebpDimensions(webpLossy(640, 0)),
      lossyOnlyTopBitsOfTheWidth: image.readWebpDimensions(webpLossy(0xc000, 480)),
    }),
  },

  // ----- image-dimensions: HEIC --------------------------------------------
  {
    name: "a HEIC's size is the size property of the item named as the picture, not of the small picture that comes first",
    run: ({ image }) =>
      cases(
        {
          "one item, one size": heic({ props: properties(ispe(4032, 3024)) }),
          "the picture's size is the second property": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "the picture is the second item of the table": heic({ item: pitm(7), props: THUMB_THEN_PICTURE, links: ipma([[3, [1]], [7, [2, 4]]]) }),
          "the picture is the first of three items": heic({ item: pitm(7), props: THUMB_THEN_PICTURE, links: ipma([[7, [2]], [3, [1]], [4, [1, 3]]]) }),
          "the item is named twice in the table: the first naming counts": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]], [1, [1]]]) }),
          "two sizes for the picture: the first counts": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2, 1]]]) }),
          "the size after properties that are not sizes": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [4, 2]]]) }),
          "the largest numbers four bytes hold": heic({ props: properties(ispe(0xffffffff, 0x80000000)) }),
          "a Buffer": Buffer.from(heic({ props: properties(ispe(101, 102)) })),
          "a window into a larger buffer": windowed(heic({ props: properties(ispe(103, 104)) })),
          "with the picture's data after": heic({ props: properties(ispe(105, 106)), after: box("mdat", zeros(64)) }),
        },
        image.HeicDimensions.read,
      ),
  },
  {
    name: "a HEIC's two sides are swapped when the picture's turn property is a quarter turn or three",
    run: ({ image }) => {
      const turned = (turns) => heic({ props: properties(ispe(4032, 3024), irot(turns)), links: ipma([[1, [1, 2]]]) });
      const swappedOf = (make) => Array.from({ length: 256 }, (_, turns) => turns).filter((turns) => image.HeicDimensions.read(make(turns)).width === 3024);
      return {
        ...cases(
          {
            "no turn": turned(0),
            "a quarter turn": turned(1),
            "a half turn": turned(2),
            "three quarters": turned(3),
            "the turn before the size": heic({ props: properties(irot(1), ispe(4032, 3024)), links: ipma([[1, [1, 2]]]) }),
            "two turns: the last counts (1 then 2)": heic({ props: properties(ispe(4032, 3024), irot(1), irot(2)), links: ipma([[1, [1, 2, 3]]]) }),
            "two turns: the last counts (2 then 1)": heic({ props: properties(ispe(4032, 3024), irot(2), irot(1)), links: ipma([[1, [1, 2, 3]]]) }),
            "a turn that is another item's": heic({ item: pitm(1), props: THUMB_THEN_PICTURE, links: ipma([[2, [1, 3]], [1, [2]]]) }),
            "a turn the picture has, with the small picture upright": heic({ item: pitm(1), props: THUMB_THEN_PICTURE, links: ipma([[2, [1]], [1, [2, 3]]]) }),
            "a turn with no byte inside is no turn": heic({ props: properties(ispe(4032, 3024), box("irot")), links: ipma([[1, [1, 2]]]) }),
            "a turn with no byte inside leaves an earlier turn": heic({ props: properties(ispe(4032, 3024), irot(1), box("irot")), links: ipma([[1, [1, 2, 3]]]) }),
          },
          image.HeicDimensions.read,
        ),
        turnsThatSwap: swappedOf(turned),
        turnsThatSwapWhenTheTablesAreNotRead: swappedOf((turns) => bytes(HEIC_START, ispe(4032, 3024), irot(turns))),
      };
    },
  },
  {
    name: "the table of properties is read with short or long item numbers, and with one or two bytes for each property number, less its top bit",
    run: ({ image }) =>
      cases(
        {
          "short item numbers, one byte each": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "one byte each, the top bit set": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [0x80 | 2, 0x80 | 3]]]) }),
          "two bytes each": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2, 3]]], { flags: 1 }) }),
          "two bytes each, the top bit set": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [0x8000 | 2, 0x8000 | 3]]], { flags: 1 }) }),
          "two bytes each, a number past the last property": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [0x0102, 2]]], { flags: 1 }) }),
          "flags 3 also means two bytes": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]], { flags: 3 }) }),
          "flags 2 means one byte": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]], { flags: 2 }) }),
          "flags with only higher bits mean one byte": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]], { flags: 0xfffffe }) }),
          "long item numbers (version 1)": heic({ item: pitm(70000, 1), props: THUMB_THEN_PICTURE, links: ipma([[5, [1]], [70000, [2]]], { version: 1 }) }),
          "long item numbers (version 2)": heic({ item: pitm(70000, 1), props: THUMB_THEN_PICTURE, links: ipma([[5, [1]], [70000, [2]]], { version: 2 }) }),
          "long item numbers (version 255), two bytes each": heic({ item: pitm(70000, 1), props: THUMB_THEN_PICTURE, links: ipma([[5, [1]], [70000, [2, 3]]], { version: 255, flags: 1 }) }),
          "the picture's number written long, the table's short": heic({ item: pitm(9, 1), props: THUMB_THEN_PICTURE, links: ipma([[9, [2]]]) }),
          "the picture's number written long (version 2)": heic({ item: pitm(9, 2), props: THUMB_THEN_PICTURE, links: ipma([[9, [2]]]) }),
          "the picture's number written long (version 255)": heic({ item: pitm(9, 255), props: THUMB_THEN_PICTURE, links: ipma([[9, [2]]]) }),
          "an item with no properties before the picture": heic({ item: pitm(2), props: THUMB_THEN_PICTURE, links: ipma([[1, []], [2, [2]]]) }),
          "a short item number whose two bytes differ, after its mirror": heic({ item: pitm(0x0102), props: THUMB_THEN_PICTURE, links: ipma([[0x0201, [1]], [0x0102, [2]]]) }),
          "a long item number whose four bytes differ, after its mirror": heic({ item: pitm(0x01020304, 1), props: THUMB_THEN_PICTURE, links: ipma([[0x04030201, [1]], [0x01020304, [2]]], { version: 1 }) }),
          "a long item number with its top bit set": heic({ item: pitm(0x80000001, 1), props: THUMB_THEN_PICTURE, links: ipma([[1, [1]], [0x80000001, [2]]], { version: 1 }) }),
          "the picture's short number in a table of long numbers": heic({ item: pitm(1), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]], { version: 1 }) }),
          "a long number does not fit a table of short numbers": heic({ item: pitm(70000, 1), props: THUMB_THEN_PICTURE, links: ipma([[70000 & 0xffff, [2]]]) }),
          "the table says one item and holds two, the picture second": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, be32(1), be16(5), [1, 1], be16(1), [1, 2]) }),
          "a one-byte property number of 255 is read as 127": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [255, 2]]]) }),
        },
        image.HeicDimensions.read,
      ),
  },
  {
    name: "when the tables do not lead to a size, the first 'ispe' found anywhere is read instead, with the first 'irot' as its turn",
    run: ({ image }) => {
      const metaOf = (...inside) => bytes(HEIC_START, fullBox("meta", 0, 0, ...inside));
      const tables = box("iprp", THUMB_THEN_PICTURE, ipma([[1, [2]]]));
      return cases(
        {
          "no meta box at all": bytes(HEIC_START, box("free", ispe(640, 480))),
          "no meta box, a turn after": bytes(HEIC_START, ispe(640, 480), irot(3)),
          "no meta box, a turn before": bytes(HEIC_START, irot(1), ispe(640, 480)),
          "no meta box, two sizes: the first": bytes(HEIC_START, ispe(1, 2), ispe(3, 4)),
          "no meta box, two turns: the first": bytes(HEIC_START, ispe(5, 6), irot(1), irot(2)),
          "the letters 'ispe' outside any box": bytes(HEIC_START, letters("ispe"), zeros(4), be32(77), be32(88)),
          "the letters 'ispe' in the first box, before the real one": bytes(box("ftyp", letters("heic"), be32(0), letters("ispe"), zeros(4), be32(7), be32(8)), ispe(640, 480)),
          "no item named as the picture": metaOf(HANDLER, tables),
          "no properties box": metaOf(HANDLER, pitm(1), box("free", THUMB_THEN_PICTURE)),
          "properties with no list": metaOf(HANDLER, pitm(1), box("iprp", box("free", THUMB_THEN_PICTURE), ipma([[1, [2]]]))),
          "properties with no table": metaOf(HANDLER, pitm(1), box("iprp", THUMB_THEN_PICTURE)),
          "the picture's number cut short": heic({ item: fullBox("pitm", 0, 0, [1]), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "the picture's number cut to nothing": heic({ item: fullBox("pitm", 0, 0), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "the picture's long number cut short": heic({ item: fullBox("pitm", 1, 0, [0, 1]), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "the picture's long number cut by one byte": heic({ item: fullBox("pitm", 1, 0, [0, 0, 1]), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]]]) }),
          "the picture is not in the table": heic({ item: pitm(9), props: THUMB_THEN_PICTURE, links: ipma([[1, [2]], [2, [1]]]) }),
          "the table is empty": heic({ props: THUMB_THEN_PICTURE, links: ipma([]) }),
          "the table is cut before its count": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, [0, 0, 0]) }),
          "the table has only its count": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, be32(1)) }),
          "the table says two items and holds one": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, be32(2), be16(5), [1, 2]) }),
          "an item's count of properties is missing": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, be32(1), be16(1)) }),
          "a long item number is cut": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 1, 0, be32(1), be16(1), [1]) }),
          "an item says three properties and holds one": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 0, be32(1), be16(1), [3, 2]) }),
          "an item's two-byte property number is cut": heic({ props: THUMB_THEN_PICTURE, links: fullBox("ipma", 0, 1, be32(1), be16(1), [1, 0]) }),
          "the picture has no properties": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, []]]) }),
          "the picture's properties are not sizes": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [3, 4]]]) }),
          "the picture's property numbers are 0 and one past the last": heic({ props: THUMB_THEN_PICTURE, links: ipma([[1, [0, 5]]]) }),
          "the picture's size property is cut short": heic({ props: properties(fullBox("ispe", 0, 0, be32(4032)), ispe(160, 120)), links: ipma([[1, [1]]]) }),
          "the picture's size property is one byte short": heic({ props: properties(fullBox("ispe", 0, 0, be32(4032), [0, 0, 11]), ispe(160, 120)), links: ipma([[1, [1]]]) }),
        },
        image.HeicDimensions.read,
      );
    },
  },
  {
    name: "the first 'ispe' needs sixteen bytes from its first letter, and the first 'irot' one byte after its four",
    run: ({ image }) => {
      const loose = bytes(HEIC_START, letters("ispe"), zeros(4), be32(640), be32(480));
      const withTurn = bytes(loose, letters("irot"), [1]);
      return {
        cutShort: Object.fromEntries([loose.length, loose.length - 1, loose.length - 8, HEIC_START.length + 4, HEIC_START.length + 3, HEIC_START.length].map((length) => [`${length} of ${loose.length} bytes`, image.HeicDimensions.read(cut(loose, length))])),
        turnWhole: image.HeicDimensions.read(withTurn),
        turnWithoutItsByte: image.HeicDimensions.read(cut(withTurn, withTurn.length - 1)),
        turnCutInItsLetters: image.HeicDimensions.read(cut(withTurn, withTurn.length - 2)),
        noSizeAnywhere: image.HeicDimensions.read(bytes(HEIC_START, box("free", zeros(40)))),
        noSizeButATurn: image.HeicDimensions.read(bytes(HEIC_START, irot(1))),
      };
    },
  },
  {
    name: "a HEIC needs twelve bytes with 'ftyp' at the fifth, and a side of nothing gives no size",
    run: ({ image }) => {
      const whole = heic({ props: properties(ispe(4032, 3024)) });
      const start = bytes(be32(12), letters("ftyp"), letters("heic"));
      return {
        cutShort: Object.fromEntries([0, 4, 8, 11, 12, 13].map((length) => [length, image.HeicDimensions.read(cut(whole, length))])),
        twelveBytesAlone: image.HeicDimensions.read(start),
        twelveBytesThenASize: image.HeicDimensions.read(bytes(start, ispe(9, 10))),
        theLettersIspeAsTheFirstFour: image.HeicDimensions.read(bytes(letters("ispe"), letters("ftyp"), be32(9), be32(10))),
        theLettersIspeAsTheFirstFourCutByOne: image.HeicDimensions.read(cut(bytes(letters("ispe"), letters("ftyp"), be32(9), be32(10)), 15)),
        otherStarts: asked(["ftyq", "FTYP", "styp", "moov", "ftyp"], (name) => image.HeicDimensions.read(bytes(box(name, letters("heic"), be32(0), letters("mif1heic")), ispe(640, 480)))),
        ftypElsewhere: image.HeicDimensions.read(bytes([0], HEIC_START, ispe(640, 480))),
        noWidth: image.HeicDimensions.read(heic({ props: properties(ispe(0, 3024)) })),
        noHeight: image.HeicDimensions.read(heic({ props: properties(ispe(4032, 0)) })),
        noWidthTurned: image.HeicDimensions.read(heic({ props: properties(ispe(0, 3024), irot(1)), links: ipma([[1, [1, 2]]]) })),
        noHeightTurned: image.HeicDimensions.read(heic({ props: properties(ispe(4032, 0), irot(3)), links: ipma([[1, [1, 2]]]) })),
        noSizeWhenTheTablesAreNotRead: [image.HeicDimensions.read(bytes(HEIC_START, ispe(0, 480))), image.HeicDimensions.read(bytes(HEIC_START, ispe(640, 0), irot(1)))],
      };
    },
  },
  {
    name: "how a HEIC's boxes are measured: no size runs to the end, a long size is read from its last four bytes, and a size that does not fit stops the walk",
    run: ({ image }) => {
      const inside = [HANDLER, pitm(1), box("iprp", THUMB_THEN_PICTURE, ipma([[1, [2]]]))];
      const meta = [zeros(4), ...inside];
      const loose = ispe(1, 2);
      return cases(
        {
          "the usual sizes": bytes(HEIC_START, box("meta", meta)),
          "the meta box with no size, last in the file": bytes(HEIC_START, openBox("meta", meta)),
          "the meta box with a long size": bytes(HEIC_START, longBox("meta", meta)),
          "the meta box with a long size, another box after": bytes(HEIC_START, longBox("meta", meta), box("mdat", zeros(8))),
          "a long size whose first four bytes are not zero": bytes(HEIC_START, be32(1), letters("meta"), be32(9), be32(16 + flat(meta).length), meta),
          "a long box before the meta box": bytes(HEIC_START, longBox("free", zeros(3)), box("meta", meta)),
          "a box with no size before the meta box hides it": bytes(HEIC_START, openBox("free", zeros(3)), box("meta", meta)),
          "a long size cut before its last four bytes": bytes(HEIC_START, be32(1), letters("meta"), be32(0), [0, 0, 0]),
          "a long size smaller than its own sixteen bytes": bytes(HEIC_START, be32(1), letters("meta"), be32(0), be32(15), meta),
          "a long size of exactly sixteen bytes": bytes(HEIC_START, be32(1), letters("meta"), be32(0), be32(16), meta),
          "a size smaller than its own eight bytes before the meta box": bytes(HEIC_START, sizedBox(7, "free"), box("meta", meta)),
          "a box of exactly eight bytes before the meta box": bytes(HEIC_START, sizedBox(8, "free"), box("meta", meta)),
          "a meta box that says it is one byte longer than the file": bytes(HEIC_START, sizedBox(8 + flat(meta).length + 1, "meta", meta)),
          "a meta box that says it is much longer than the file": bytes(HEIC_START, sizedBox(0xfffffff0, "meta", meta)),
          "a first box that says it is longer than the file": bytes(sizedBox(5000, "ftyp", letters("heic"), be32(0)), box("meta", meta)),
          "fewer than eight bytes after the last box": bytes(HEIC_START, box("meta", meta), [0, 0, 0, 9, 109, 101, 116]),
          "a meta box too short for its version and flags": bytes(HEIC_START, box("meta", [0, 0]), loose),
          "a meta box with only its version and flags": bytes(HEIC_START, box("meta", zeros(4)), loose),
          "two meta boxes: the first is the one": bytes(HEIC_START, box("meta", zeros(4)), box("meta", meta)),
          "inside the meta box, a box with no size before the others hides them": bytes(HEIC_START, box("meta", zeros(4), openBox("free", zeros(2)), inside)),
          "inside the meta box, a box too small stops the walk": bytes(HEIC_START, box("meta", zeros(4), HANDLER, sizedBox(4, "free"), inside.slice(1))),
          "the properties box with a long size, its list with no size": bytes(HEIC_START, box("meta", zeros(4), HANDLER, pitm(1), longBox("iprp", ipma([[1, [2]]]), openBox("ipco", ispe(160, 120), ispe(4032, 3024))))),
          "a property that says it is longer than the list ends the list": bytes(HEIC_START, box("meta", zeros(4), pitm(1), box("iprp", box("ipco", ispe(160, 120), sizedBox(400, "ispe", zeros(4), be32(4032), be32(3024))), ipma([[1, [2]]])))),
          "a property with a long size": bytes(HEIC_START, box("meta", zeros(4), pitm(1), box("iprp", box("ipco", ispe(160, 120), longBox("ispe", zeros(4), be32(4032), be32(3024))), ipma([[1, [2]]])))),
        },
        image.HeicDimensions.read,
      );
    },
  },
  {
    name: "the reader of HEIC sizes is a class with nothing of its own to make",
    run: ({ image }) => {
      const made = new image.HeicDimensions();
      return { made, className: image.HeicDimensions.name, classTakes: image.HeicDimensions.length, readTakes: image.HeicDimensions.read.length, readName: image.HeicDimensions.read.name, onThePrototype: Object.getOwnPropertyNames(image.HeicDimensions.prototype), readIsNotOnWhatIsMade: "read" in made, withoutNew: attempt(() => image.HeicDimensions()) };
    },
  },

  // ----- image-dimensions: the readers together -----------------------------
  {
    name: "a WebP or a HEIC is read by whichever fits, and a file that is neither gives nothing",
    run: ({ image }) =>
      cases(
        {
          "a WebP": webpLossy(640, 480),
          "a HEIC": heic({ props: properties(ispe(4032, 3024), irot(1)), links: ipma([[1, [1, 2]]]) }),
          "a PNG": png(640, 480),
          "a GIF": gif(320, 240),
          "a JPEG": jpeg(frame(800, 600)),
          "a WebP whose first chunk is not known": riff("ALPH", zeros(14)),
          "a lossy WebP with no width": webpLossy(0, 480),
          "a WebP whose length spells 'ftyp', with a size further on": bytes(letters("RIFF"), letters("ftyp"), letters("WEBP"), letters("ALPH"), zeros(14), ispe(640, 480)),
          "a WebP that reads both ways is read as a WebP": bytes(letters("RIFF"), letters("ftyp"), letters("WEBP"), webpLossy(31, 32).subarray(12), ispe(640, 480)),
          "nothing": bytes(),
          "thirty zeros": bytes(zeros(30)),
        },
        image.readWebpOrHeicDimensions,
      ),
  },
  {
    name: "any picture file is read by the first reader that fits: WebP, HEIC, PNG, GIF, then JPEG",
    run: ({ image }) =>
      cases(
        {
          "a WebP, lossy": webpLossy(640, 480),
          "a WebP, lossless": webpLossless(800, 600),
          "a WebP, extended": webpExtended(1920, 1080),
          "a HEIC": heic({ props: properties(ispe(4032, 3024)) }),
          "a HEIC turned": heic({ props: properties(ispe(4032, 3024), irot(3)), links: ipma([[1, [1, 2]]]) }),
          "a PNG": png(640, 480),
          "a GIF": gif(320, 240),
          "a JPEG": jpeg(APP0, QUANT, frame(1024, 768)),
          "a Buffer of a PNG": Buffer.from(png(12, 34)),
          "a window on a JPEG": windowed(jpeg(frame(56, 78))),
          "a PNG with no width": png(0, 480),
          "a GIF cut to nine bytes": cut(gif(320, 240), 9),
          "a JPEG with no frame": jpeg(APP0, QUANT),
          "a BMP": bytes(letters("BM"), le32(70), zeros(4), le32(54), le32(40), le32(4), le32(4), zeros(28)),
          "an SVG": bytes(letters('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>')),
          "a text": bytes(letters("hello, world, this is only a text and no picture at all")),
          "nothing": bytes(),
          "one byte": bytes(255),
          "a JPEG's first two bytes alone": bytes(255, 216),
        },
        image.readImageFileDimensions,
      ),
  },
  {
    name: "every byte of a whole PNG, GIF and JPEG changed in turn to each of its 256 values",
    run: ({ image }) => ({
      png: everyByteChanged(png(640, 480), image.readImageFileDimensions),
      gif: everyByteChanged(gif(320, 240), image.readImageFileDimensions),
      jpeg: everyByteChanged(jpeg(APP0, segment(0xdb, [0], zeros(8)), frame(1024, 768), segment(0xda, zeros(3))), image.readImageFileDimensions),
    }),
  },
  {
    name: "every byte of a whole WebP of each kind changed in turn to each of its 256 values",
    run: ({ image }) => ({
      lossy: everyByteChanged(webpLossy(640, 480), image.readImageFileDimensions),
      lossless: everyByteChanged(webpLossless(800, 600), image.readImageFileDimensions),
      extended: everyByteChanged(webpExtended(1920, 1080), image.readImageFileDimensions),
    }),
  },
  {
    name: "every byte of a whole HEIC changed in turn to each of its 256 values",
    run: ({ image }) => everyByteChanged(heic({ item: pitm(1), props: THUMB_THEN_PICTURE, links: ipma([[2, [1]], [1, [2, 3]]]), after: box("mdat", zeros(4)) }), image.readImageFileDimensions),
  },
  {
    name: "each size given is a new thing with a width then a height",
    run: ({ image }) => {
      const picture = png(640, 480);
      const first = image.readImageFileDimensions(picture);
      const second = image.readImageFileDimensions(picture);
      first.width = 1;
      return { second, fields: Object.keys(second), notTheSame: first !== second, bytesUntouched: Array.from(picture.subarray(16, 24)), frozen: Object.isFrozen(second) };
    },
  },
  {
    name: "a picture's readers given nothing at all fail",
    run: ({ image }) => {
      const readers = { webp: image.readWebpDimensions, webpOrHeic: image.readWebpOrHeicDimensions, heic: image.HeicDimensions.read, png: image.readPngDimensions, gif: image.readGifDimensions, jpeg: image.readJpegDimensions, any: image.readImageFileDimensions };
      return Object.fromEntries(Object.entries(readers).map(([reader, read]) => [reader, [attempt(() => read(null)), attempt(() => read(undefined)), attempt(() => read())]]));
    },
  },

  // ----- video-dimensions ----------------------------------------------------
  {
    name: "a video's size is in the first track header that has one, inside its 'moov' box",
    run: ({ video }) =>
      cases(
        {
          "the usual file": bytes(MP4_START, moov(trak(tkhd()))),
          "the film box first": bytes(moov(trak(tkhd({ width: 1280, height: 720 })))),
          "the film box after the film's data": bytes(MP4_START, box("mdat", zeros(64)), moov(trak(tkhd({ width: 640, height: 360 })))),
          "a sound track before the picture's": bytes(MP4_START, moov(SOUND_TRACK, trak(tkhd({ width: 854, height: 480 })))),
          "two picture tracks: the first": bytes(MP4_START, moov(trak(tkhd({ width: 1, height: 2 })), trak(tkhd({ width: 3, height: 4 })))),
          "a track with two headers, the first with no size": bytes(MP4_START, moov(trak(tkhd({ width: 0, height: 0 }), tkhd({ width: 5, height: 6 })))),
          "the header after other boxes of its track": bytes(MP4_START, moov(trak(box("edts", zeros(12)), box("tref", zeros(4)), tkhd({ width: 7, height: 8 })))),
          "boxes after the track": bytes(MP4_START, moov(trak(tkhd({ width: 9, height: 10 }), box("mdia", zeros(40))), box("udta", zeros(12)))),
          "a header written the long way (version 1)": bytes(MP4_START, moov(trak(tkhd({ version: 1, width: 3840, height: 2160 })))),
          "the largest sides": bytes(MP4_START, moov(trak(tkhd({ width: 65535, height: 65535 })))),
          "each byte of a side different": bytes(MP4_START, moov(trak(tkhd({ width: 0x0102, height: 0x0304 })))),
          "a Buffer": Buffer.from(bytes(MP4_START, moov(trak(tkhd({ width: 11, height: 12 }))))),
          "a window into a larger buffer": windowed(bytes(MP4_START, moov(trak(tkhd({ width: 13, height: 14 }))))),
        },
        video.Mp4Dimensions.read,
      ),
  },
  {
    name: "a video's two sides are swapped when its matrix is a quarter turn: its first and fifth numbers nothing, its second and fourth something",
    run: ({ video }) => {
      const turned = (matrix) => bytes(MP4_START, moov(trak(tkhd({ width: 1920, height: 1080, matrix }))));
      const only = (a, b, c, d) => [a, b, 0, c, d, 0, 0, 0, 0x40000000];
      return cases(
        {
          "upright": turned(UPRIGHT),
          "a quarter turn": turned(TURNED_90),
          "a half turn": turned(TURNED_180),
          "three quarters": turned(TURNED_270),
          "all four numbers nothing": turned(only(0, 0, 0, 0)),
          "only the second": turned(only(0, 1, 0, 0)),
          "only the fourth": turned(only(0, 0, 1, 0)),
          "the second and the fourth, each of one bit": turned(only(0, 1, 1, 0)),
          "the second and the fourth, their top bits": turned(only(0, 0x80000000, 0x80000000, 0)),
          "a quarter turn but the first is something": turned(only(1, 0x00010000, 0xffff0000, 0)),
          "a quarter turn but the fifth is something": turned(only(0, 0x00010000, 0xffff0000, 1)),
          "all four something": turned(only(1, 1, 1, 1)),
          "the third, sixth and later numbers do not count": turned([0, 1, 9, 1, 0, 9, 9, 9, 9]),
          "a quarter turn in a long header": bytes(MP4_START, moov(trak(tkhd({ version: 1, width: 1920, height: 1080, matrix: TURNED_90 })))),
        },
        video.Mp4Dimensions.read,
      );
    },
  },
  {
    name: "only the whole part of each side of a video counts, and a side of nothing gives no size",
    run: ({ video }) => {
      const sized = (options) => bytes(MP4_START, moov(trak(tkhd(options))));
      return cases(
        {
          "a half added to each side": sized({ width: 1920, height: 1080, widthPart: 0x8000, heightPart: 0x8000 }),
          "almost one more on each side": sized({ width: 1920, height: 1080, widthPart: 0xffff, heightPart: 0xffff }),
          "less than one wide": sized({ width: 0, height: 1080, widthPart: 0xffff }),
          "less than one high": sized({ width: 1920, height: 0, heightPart: 0xffff }),
          "no width": sized({ width: 0, height: 1080 }),
          "no height": sized({ width: 1920, height: 0 }),
          "no width, turned": sized({ width: 0, height: 1080, matrix: TURNED_90 }),
          "no height, turned": sized({ width: 1920, height: 0, matrix: TURNED_270 }),
          "only tracks with no size": bytes(MP4_START, moov(SOUND_TRACK, SOUND_TRACK)),
          "one by one": sized({ width: 1, height: 1 }),
        },
        video.Mp4Dimensions.read,
      );
    },
  },
  {
    name: "a track header's version: only version 1 is the long one",
    run: ({ video }) => {
      const short = trackHeader({ width: 320, height: 240 });
      const long = trackHeader({ version: 1, width: 640, height: 480 });
      const withVersion = (inside, version) => bytes(MP4_START, moov(trak(box("tkhd", [version, ...inside.slice(1)]))));
      const versions = Array.from({ length: 256 }, (_, version) => version);
      return {
        versionsThatReadAShortHeader: versions.filter((version) => video.Mp4Dimensions.read(withVersion(short, version)) !== null),
        versionsThatReadALongHeaderAsLong: versions.filter((version) => video.Mp4Dimensions.read(withVersion(long, version))?.width === 640),
        aLongHeaderReadAsShort: video.Mp4Dimensions.read(withVersion(long, 0)),
        aShortHeaderReadAsLong: video.Mp4Dimensions.read(withVersion(short, 1)),
      };
    },
  },
  {
    name: "a track header cut short gives nothing, and one byte more gives the size",
    run: ({ video }) => {
      const short = trackHeader({ width: 320, height: 240 });
      const long = trackHeader({ version: 1, width: 640, height: 480 });
      const holding = (inside, length) => bytes(MP4_START, moov(trak(box("tkhd", inside.slice(0, length)))));
      const lengths = (inside) => Object.fromEntries([0, 1, 4, 40, 76, inside.length - 5, inside.length - 4, inside.length - 1, inside.length].map((length) => [`${length} of ${inside.length} bytes`, video.Mp4Dimensions.read(holding(inside, length))]));
      return {
        short: lengths(short),
        long: lengths(long),
        shortWithMoreAfter: video.Mp4Dimensions.read(bytes(MP4_START, moov(trak(box("tkhd", short, zeros(12)))))),
        cutShortThenAWholeOne: video.Mp4Dimensions.read(bytes(MP4_START, moov(trak(box("tkhd", short.slice(0, 20)), box("tkhd", short))))),
        theFileCutInTheHeader: (() => {
          const whole = bytes(MP4_START, moov(trak(tkhd({ width: 320, height: 240 }))));
          return [whole.length, whole.length - 1, whole.length - 4, whole.length - 5, whole.length - 8, whole.length - 9, whole.length - 50].map((length) => [length, video.Mp4Dimensions.read(cut(whole, length))]);
        })(),
      };
    },
  },
  {
    name: "how a video's boxes are measured: no size runs to the end, a long size is read from its last four bytes, a size too large is cut to what there is, a size too small stops the walk",
    run: ({ video }) => {
      const track = trak(tkhd({ width: 320, height: 240 }));
      const header = tkhd({ width: 320, height: 240 });
      return cases(
        {
          "the film box with no size": bytes(MP4_START, openBox("moov", MVHD, track)),
          "the film box with a long size": bytes(MP4_START, longBox("moov", MVHD, track)),
          "the film box with a long size whose first four bytes are not zero": bytes(MP4_START, be32(1), letters("moov"), be32(7), be32(16 + flat(MVHD, track).length), MVHD, track),
          "the film box with a long size smaller than sixteen": bytes(MP4_START, be32(1), letters("moov"), be32(0), be32(15), MVHD, track),
          "the film box with a long size of exactly sixteen": bytes(MP4_START, be32(1), letters("moov"), be32(0), be32(16), MVHD, track),
          "the film box with a long size, cut before the size ends": bytes(MP4_START, be32(1), letters("moov"), be32(0), [0, 0, 0]),
          "the film box says it is larger than the file": bytes(MP4_START, sizedBox(100000, "moov", MVHD, track)),
          "the film box says it is larger than two thousand million bytes": bytes(MP4_START, sizedBox(0xfffffff0, "moov", MVHD, track)),
          "the film box says it ends before its track": bytes(MP4_START, sizedBox(8 + MVHD.length, "moov", MVHD, track)),
          "the film box says it ends inside its track's header": bytes(MP4_START, sizedBox(8 + MVHD.length + 60, "moov", MVHD, track)),
          "the film box says it is seven bytes": bytes(MP4_START, sizedBox(7, "moov", MVHD, track)),
          "the film box says it is eight bytes": bytes(MP4_START, sizedBox(8, "moov", MVHD, track)),
          "the track with no size": bytes(MP4_START, moov(openBox("trak", header))),
          "the track with no size hides a later track": bytes(MP4_START, moov(openBox("trak", tkhd({ width: 0, height: 0 })), track)),
          "the track with a long size": bytes(MP4_START, moov(longBox("trak", header))),
          "the track says it is larger than the film box": bytes(MP4_START, moov(sizedBox(5000, "trak", header))),
          "the track says it is larger than the film box, a later track is not read": bytes(MP4_START, moov(sizedBox(5000, "trak", tkhd({ width: 0, height: 0 })), track)),
          "a box of another kind says it is larger than the film box, the track after it is not read": bytes(MP4_START, box("moov", sizedBox(5000, "mvhd", zeros(20)), track)),
          "a box too small before the track stops the walk": bytes(MP4_START, box("moov", sizedBox(7, "free"), track)),
          "a box of exactly eight bytes before the track": bytes(MP4_START, box("moov", sizedBox(8, "free"), track)),
          "a long size cut short before the track stops the walk": bytes(MP4_START, box("moov", be32(1), letters("free"), be32(0))),
          "fewer than eight bytes left in the film box after a track with no picture": bytes(MP4_START, box("moov", trak(tkhd({ width: 0, height: 0 })), [0, 0, 0, 92, 116, 114, 97])),
          "the header with no size": bytes(MP4_START, moov(trak(openBox("tkhd", trackHeader({ width: 320, height: 240 }))))),
          "the header with a long size": bytes(MP4_START, moov(trak(longBox("tkhd", trackHeader({ width: 320, height: 240 }))))),
          "the header says it is larger than its track": bytes(MP4_START, moov(trak(sizedBox(5000, "tkhd", trackHeader({ width: 320, height: 240 }))))),
          "the header of exactly eight bytes, then a whole one": bytes(MP4_START, moov(trak(sizedBox(8, "tkhd"), header))),
          "a box too small before the header stops the walk": bytes(MP4_START, moov(trak(sizedBox(3, "free"), header))),
        },
        video.Mp4Dimensions.read,
      );
    },
  },
  {
    name: "the word 'moov' is looked for from the fifth byte on, and again after each one that gives no size",
    run: ({ video }) => {
      const film = moov(trak(tkhd({ width: 320, height: 240 })));
      const soundOnly = moov(SOUND_TRACK);
      return cases(
        {
          "nothing": bytes(),
          "three bytes": bytes(1, 2, 3),
          "the word alone": bytes(letters("moov")),
          "the word at the first byte, then a whole film": bytes(letters("moov"), film),
          "the word at the fourth byte is not seen": bytes([0, 0, 0], letters("moov"), zeros(8)),
          "the word at the fifth byte with nothing after": bytes(be32(8), letters("moov")),
          "the word twice with nothing else": bytes(letters("moovmoov")),
          "seven bytes": bytes(be32(8), letters("moo")),
          "no such word in a long file": bytes(MP4_START, box("mdat", zeros(300))),
          "almost the word": bytes(MP4_START, box("mooV", MVHD), box("moof", MVHD), box("Moov", MVHD)),
          "the word inside the film's data, before the real film box": bytes(MP4_START, box("mdat", zeros(10), letters("moov"), zeros(30)), film),
          "the word as the name of the file's kind, before the real film box": bytes(box("ftyp", letters("moov"), be32(0), letters("moov")), film),
          "a film with only sound, then a film with a picture": bytes(MP4_START, soundOnly, film),
          "a film with a picture, then another": bytes(MP4_START, film, moov(trak(tkhd({ width: 1, height: 2 })))),
          "a film with only sound": bytes(MP4_START, soundOnly),
          "a film with only sound, and the word again at the very end": bytes(MP4_START, soundOnly, be32(8), letters("moov")),
          "a film box with no track": bytes(MP4_START, moov()),
          "a film box inside another box is found by its word": bytes(MP4_START, box("wrap", zeros(5), film)),
          "a film whose track is inside another box is not read": bytes(MP4_START, box("moov", box("wrap", trak(tkhd({ width: 320, height: 240 }))))),
          "a header that is not in a track is not read": bytes(MP4_START, box("moov", tkhd({ width: 320, height: 240 }))),
          "a track inside a track is not read": bytes(MP4_START, box("moov", trak(trak(tkhd({ width: 320, height: 240 }))))),
        },
        video.Mp4Dimensions.read,
      );
    },
  },
  {
    name: "every byte of a whole MP4 changed in turn to each of its 256 values",
    run: ({ video }) => everyByteChanged(bytes(MP4_START, box("moov", box("mvhd", zeros(12)), SOUND_TRACK, trak(box("edts", zeros(4)), tkhd({ width: 1920, height: 1080, matrix: TURNED_90 })))), video.Mp4Dimensions.read),
  },
  {
    name: "the reader of video sizes is a class with nothing of its own to make, and each size it gives is new",
    run: ({ video }) => {
      const made = new video.Mp4Dimensions();
      const file = bytes(MP4_START, moov(trak(tkhd({ width: 320, height: 240 }))));
      const first = video.Mp4Dimensions.read(file);
      const second = video.Mp4Dimensions.read(file);
      first.width = 1;
      return {
        made,
        className: video.Mp4Dimensions.name,
        classTakes: video.Mp4Dimensions.length,
        readTakes: video.Mp4Dimensions.read.length,
        readName: video.Mp4Dimensions.read.name,
        onThePrototype: Object.getOwnPropertyNames(video.Mp4Dimensions.prototype),
        readIsNotOnWhatIsMade: "read" in made,
        withoutNew: attempt(() => video.Mp4Dimensions()),
        second,
        fields: Object.keys(second),
        notTheSame: first !== second,
      };
    },
  },
  {
    name: "a video's reader given nothing at all fails",
    run: ({ video }) => [attempt(() => video.Mp4Dimensions.read(null)), attempt(() => video.Mp4Dimensions.read(undefined)), attempt(() => video.Mp4Dimensions.read())],
  },

  // ----- the whole part -----------------------------------------------------
  {
    name: "what each function of the part is called and how many values it asks for",
    run: (all) =>
      Object.fromEntries(
        Object.keys(modules).map((key) => [
          key,
          Object.fromEntries(
            Object.keys(all[key])
              .sort()
              .filter((name) => typeof all[key][name] === "function")
              .map((name) => [name, { name: all[key][name].name, takes: all[key][name].length }]),
          ),
        ]),
      ),
  },
];

/** A table as it is kept: its entries in their order, and what kind of object holds them. */
function tableOf(table) {
  return {
    entries: Object.entries(table),
    count: Object.keys(table).length,
    isAPlainObject: Object.getPrototypeOf(table) === Object.prototype,
    frozen: Object.isFrozen(table),
    valuesAreTexts: Object.values(table).every((value) => typeof value === "string"),
  };
}

/**
 * What `ask` answers before, while and after the part's tables and its list
 * of text extensions are changed. They are put back as they were, order
 * included, whatever happens.
 */
function whileChanged(all, change, ask) {
  const named = {
    pictures: all.extensions.IMAGE_MIME_FROM_EXTENSION,
    phonePictures: all.extensions.CLIENT_NATIVE_IMAGE_MIME_FROM_EXTENSION,
    byType: all.extensions.EXTENSION_FROM_IMAGE_MIME,
    videos: all.extensions.VIDEO_MIME_FROM_EXTENSION,
    sounds: all.extensions.AUDIO_MIME_FROM_EXTENSION,
  };
  const texts = all.preview.TEXT_PREVIEWABLE_EXTENSIONS;
  const keptTables = Object.values(named).map((table) => [table, Object.entries(table)]);
  const keptTexts = [...texts];
  const before = ask();
  let during;
  try {
    change({ ...named, texts });
    during = ask();
  } finally {
    for (const [table, entries] of keptTables) {
      for (const key of Object.keys(table)) delete table[key];
      for (const [key, value] of entries) table[key] = value;
    }
    texts.clear();
    for (const extension of keptTexts) texts.add(extension);
  }
  return { before, during, after: ask() };
}
