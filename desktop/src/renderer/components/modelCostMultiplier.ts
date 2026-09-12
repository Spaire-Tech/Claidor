/**
 * How a model's cost multiplier is written where a person reads it.
 *
 * The server computes the multiplier as a division so its provenance stays
 * visible — two thirds of the price of the default model is `2 / 3`. What
 * comes over the wire is therefore `0.6666666666666666`, and printing that
 * is what turned the model list into a column of arithmetic with the names
 * truncated to « G… » beside it.
 *
 * It is a hint about price, not an amount anybody is charged, so it is
 * rounded to what a person can actually weigh: one decimal at or above one,
 * two significant figures below, and never a trailing zero.
 */
export const formatCostMultiplier = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = value >= 1
    ? Math.round(value * 10) / 10
    : Number(value.toPrecision(2));
  // `String` of a rounded number already drops trailing zeros: 3.0 → "3".
  return String(rounded);
};
