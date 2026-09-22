/**
 * Simeon's mark: twelve petals in a whirl, thin at the top left and full at
 * the right, as the founder supplied it on 22 September 2026 (a 400×400 PNG,
 * black on transparent). The petals were measured off that file as the
 * moment ellipses of its twelve connected components (centroid, semi-axes
 * from the second moments, orientation), so the drawing is the founder's
 * shape and not an interpretation of it; the check in
 * tests/simeon-logo.test.mjs rasterises this and compares it to the PNG.
 *
 * No picture file is imported anywhere: the mark is drawn from these
 * numbers wherever it is needed (the in-app icon, the Dock icon).
 */
export const SIMEON_LOGO_BOX = 400;

/** Centre, semi-axes and orientation of each petal, in the 400-unit box, sorted by angle about the centre. */
export const SIMEON_PETALS = Object.freeze([
  { cx: 127.06, cy: 199.5, rx: 38.94, ry: 9.89, angle: 0 },
  { cx: 138.75, cy: 164.5, rx: 41.47, ry: 8.54, angle: 29.98 },
  { cx: 165.87, cy: 141.5, rx: 43.86, ry: 6.1, angle: 60.04 },
  { cx: 199.41, cy: 133.85, rx: 44.68, ry: 4.99, angle: 89.97 },
  { cx: 242.28, cy: 125.69, rx: 26.79, ry: 17.83, angle: -60.27 },
  { cx: 273.53, cy: 156.92, rx: 26.75, ry: 17.92, angle: -30.35 },
  { cx: 283, cy: 199.5, rx: 28.54, ry: 17.06, angle: 0 },
  { cx: 270.28, cy: 240.25, rx: 30.36, ry: 15.79, angle: 30.01 },
  { cx: 239.52, cy: 268.84, rx: 31.86, ry: 14.71, angle: 60.03 },
  { cx: 199.89, cy: 277.9, rx: 33.48, ry: 13.46, angle: 89.95 },
  { cx: 161.13, cy: 265.95, rx: 35.31, ry: 12.63, angle: -60.1 },
  { cx: 134.77, cy: 236.79, rx: 37.01, ry: 11.89, angle: -29.92 },
]);

export function simeonPetalsMarkup(ink = "#141414") {
  return SIMEON_PETALS.map((petal) => `<ellipse cx="${petal.cx}" cy="${petal.cy}" rx="${petal.rx}" ry="${petal.ry}" transform="rotate(${petal.angle} ${petal.cx} ${petal.cy})" fill="${ink}"/>`).join("");
}

/** The mark alone, on nothing. */
export function simeonLogoSvg({ size = SIMEON_LOGO_BOX, ink = "#141414" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIMEON_LOGO_BOX} ${SIMEON_LOGO_BOX}">${simeonPetalsMarkup(ink)}</svg>`;
}

/** The app icon: the mark on a rounded paper tile, the shape macOS expects. */
export function simeonAppIconSvg({ size = 512, ink = "#141414", paper = "#fcfcfc" } = {}) {
  const radius = Math.round(size * 114 / 512);
  const scale = 1.25 * size / 512;
  const offset = (size - SIMEON_LOGO_BOX * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${paper}"/>
  <g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})">${simeonPetalsMarkup(ink)}</g>
  <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${radius - 0.5}" fill="none" stroke="${ink}" stroke-opacity="0.14"/>
</svg>`;
}

/** Loads Playwright for the scripts that rasterise the mark: the package, or one named in CAISRA_PLAYWRIGHT. */
export async function loadChromium() {
  const candidates = [process.env.CAISRA_PLAYWRIGHT, "playwright", "playwright-core"].filter((value) => value != null && value.length > 0);
  let lastError;
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith("/") || candidate.startsWith(".") ? (await import("node:url")).pathToFileURL(candidate.endsWith(".js") || candidate.endsWith(".mjs") ? candidate : `${candidate}/index.mjs`).href : candidate;
      const module = await import(specifier);
      if (module.chromium != null) return module.chromium;
    } catch (error) { lastError = error; }
  }
  throw new Error(`Playwright is not installed; set CAISRA_PLAYWRIGHT to a playwright-core package directory. ${lastError?.message ?? ""}`);
}
