/** How long a message is, told as one of six sizes. */
export type SandMessageLengthBucket = "empty" | "xs" | "s" | "m" | "l" | "xl";

/** Each size below the largest, with the length a message must stay under to fall into it. Smallest first. */
const SIZES_BY_LIMIT: ReadonlyArray<readonly [limit: number, size: SandMessageLengthBucket]> = [
  [20, "xs"],
  [100, "s"],
  [500, "m"],
  [2_000, "l"],
];

export function sandMessageLengthBucket(length: number): SandMessageLengthBucket {
  if (length <= 0) return "empty";
  for (const [limit, size] of SIZES_BY_LIMIT) {
    if (length < limit) return size;
  }
  return "xl";
}
