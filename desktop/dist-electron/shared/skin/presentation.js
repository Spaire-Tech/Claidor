"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSkinPresentation = exports.getSkinColorContrast = exports.inferSkinPreferredAppearance = void 0;
const constants_1 = require("./constants");
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value) => (typeof value === 'object' && value !== null && !Array.isArray(value));
const hasOnlyKeys = (record, allowedKeys) => {
    const allowed = new Set(allowedKeys);
    return Object.keys(record).every(key => allowed.has(key));
};
const normalizeHexColor = (value) => (typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : null);
const parseRgb = (color) => [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
];
const linearizeChannel = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const relativeLuminance = (color) => {
    const [red, green, blue] = parseRgb(color).map(linearizeChannel);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const inferSkinPreferredAppearance = (palette) => {
    const surfaceLuminance = [
        palette.canvas,
        palette.panel,
        palette.panelRaised,
    ].reduce((total, color) => total + relativeLuminance(color), 0) / 3;
    return relativeLuminance(palette.foreground) > surfaceLuminance
        ? constants_1.SkinPreferredAppearance.Dark
        : constants_1.SkinPreferredAppearance.Light;
};
exports.inferSkinPreferredAppearance = inferSkinPreferredAppearance;
const getSkinColorContrast = (left, right) => {
    const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
    const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
    return (lighter + 0.05) / (darker + 0.05);
};
exports.getSkinColorContrast = getSkinColorContrast;
const hasAccessiblePalette = (palette) => {
    const surfaces = [palette.canvas, palette.panel, palette.panelRaised];
    return surfaces.every(surface => (0, exports.getSkinColorContrast)(palette.foreground, surface) >= 4.5)
        && surfaces.every(surface => (0, exports.getSkinColorContrast)(palette.muted, surface) >= 3)
        && surfaces.every(surface => (0, exports.getSkinColorContrast)(palette.accent, surface) >= 3)
        && (0, exports.getSkinColorContrast)(palette.accentForeground, palette.accent) >= 4.5;
};
const parsePalette = (value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'canvas',
        'panel',
        'panelRaised',
        'accent',
        'accentForeground',
        'accentAlt',
        'foreground',
        'muted',
        'border',
    ])) {
        return null;
    }
    const palette = {
        canvas: normalizeHexColor(value.canvas),
        panel: normalizeHexColor(value.panel),
        panelRaised: normalizeHexColor(value.panelRaised),
        accent: normalizeHexColor(value.accent),
        accentForeground: normalizeHexColor(value.accentForeground),
        accentAlt: normalizeHexColor(value.accentAlt),
        foreground: normalizeHexColor(value.foreground),
        muted: normalizeHexColor(value.muted),
        border: normalizeHexColor(value.border),
    };
    if (Object.values(palette).some(color => color === null))
        return null;
    const normalized = palette;
    return hasAccessiblePalette(normalized) ? normalized : null;
};
const parseArt = (value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['focusX', 'focusY']))
        return null;
    if (typeof value.focusX !== 'number'
        || !Number.isFinite(value.focusX)
        || value.focusX < 0
        || value.focusX > 1
        || typeof value.focusY !== 'number'
        || !Number.isFinite(value.focusY)
        || value.focusY < 0
        || value.focusY > 1) {
        return null;
    }
    return { focusX: value.focusX, focusY: value.focusY };
};
const parseEffects = (value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['particleDensity']))
        return null;
    if (!Object.values(constants_1.SkinParticleDensity).includes(value.particleDensity)) {
        return null;
    }
    return { particleDensity: value.particleDensity };
};
const parseSkinPresentation = (value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'mode',
        'preferredAppearance',
        'palette',
        'art',
        'effects',
    ])) {
        return null;
    }
    if (value.mode !== constants_1.SkinPresentationMode.ImmersiveShell)
        return null;
    const palette = parsePalette(value.palette);
    if (!palette)
        return null;
    const preferredAppearance = (0, exports.inferSkinPreferredAppearance)(palette);
    if (value.preferredAppearance !== undefined
        && value.preferredAppearance !== preferredAppearance) {
        return null;
    }
    const art = value.art === undefined ? undefined : parseArt(value.art);
    if (value.art !== undefined && !art)
        return null;
    const effects = value.effects === undefined ? undefined : parseEffects(value.effects);
    if (value.effects !== undefined && !effects)
        return null;
    return {
        mode: constants_1.SkinPresentationMode.ImmersiveShell,
        preferredAppearance,
        palette,
        ...(art ? { art } : {}),
        ...(effects ? { effects } : {}),
    };
};
exports.parseSkinPresentation = parseSkinPresentation;
//# sourceMappingURL=presentation.js.map