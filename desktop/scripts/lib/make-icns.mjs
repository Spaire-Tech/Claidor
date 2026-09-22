/**
 * An Apple icon file from PNGs, in plain Node: no iconutil, so it can be
 * made anywhere. Every entry type here takes PNG data (icp4 and up).
 */
export const ICNS_TYPES = Object.freeze({ 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ascii(text) { return Buffer.from(text, "ascii"); }
function be32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value, 0); return buffer; }

/** `sizes` maps a pixel size to that size's PNG bytes. */
export function packIcns(sizes) {
  const entries = [];
  for (const [size, png] of Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const type = ICNS_TYPES[size];
    if (type == null) throw new Error(`No icns entry type for ${size}px`);
    if (!Buffer.isBuffer(png) || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${size}px entry is not a PNG`);
    entries.push(Buffer.concat([ascii(type), be32(png.length + 8), png]));
  }
  if (entries.length === 0) throw new Error("An icns needs at least one size");
  const body = Buffer.concat(entries);
  return Buffer.concat([ascii("icns"), be32(body.length + 8), body]);
}

/** Reads the table of contents back: [{ type, size, bytes }]. */
export function readIcnsEntries(buffer) {
  if (buffer.subarray(0, 4).toString("ascii") !== "icns") throw new Error("Not an icns file");
  const total = buffer.readUInt32BE(4);
  if (total !== buffer.length) throw new Error(`icns length ${total} does not match ${buffer.length} bytes`);
  const entries = [];
  let offset = 8;
  while (offset < buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32BE(offset + 4);
    const size = Number(Object.entries(ICNS_TYPES).find(([, value]) => value === type)?.[0] ?? 0);
    entries.push({ type, size, bytes: length - 8 });
    offset += length;
  }
  return entries;
}
