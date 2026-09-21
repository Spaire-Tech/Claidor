import apricot from "./cloud-blob-bodies/apricot.png";
import blush from "./cloud-blob-bodies/blush.png";
import chartreuse from "./cloud-blob-bodies/chartreuse.png";
import cream from "./cloud-blob-bodies/cream.png";
import fog from "./cloud-blob-bodies/fog.png";
import iris from "./cloud-blob-bodies/iris.png";
import lilac from "./cloud-blob-bodies/lilac.png";
import mauve from "./cloud-blob-bodies/mauve.png";
import meadow from "./cloud-blob-bodies/meadow.png";
import mist from "./cloud-blob-bodies/mist.png";
import peach from "./cloud-blob-bodies/peach.png";
import periwinkle from "./cloud-blob-bodies/periwinkle.png";
import sage from "./cloud-blob-bodies/sage.png";
import sea from "./cloud-blob-bodies/sea.png";
import sky from "./cloud-blob-bodies/sky.png";
import slate from "./cloud-blob-bodies/slate.png";
import steel from "./cloud-blob-bodies/steel.png";
import tangerine from "./cloud-blob-bodies/tangerine.png";
import violet from "./cloud-blob-bodies/violet.png";

import { CLOUD_BLOB_COLORS, type CloudBlobColorId } from "./cloud-blobs.js";

export const CLOUD_BLOB_BODY_SIZE = 336;

export const CLOUD_BLOB_BODIES = {
  mist,
  meadow,
  lilac,
  peach,
  periwinkle,
  slate,
  apricot,
  sage,
  mauve,
  sky,
  tangerine,
  sea,
  violet,
  cream,
  steel,
  fog,
  iris,
  chartreuse,
  blush,
} as const satisfies Record<CloudBlobColorId, string>;

export function cloudBlobBodyDataUrl(id: CloudBlobColorId): string {
  return CLOUD_BLOB_BODIES[id];
}

export const CLOUD_BLOB_BODY_IDS = CLOUD_BLOB_COLORS.map((color) => color.id);
