import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { generateTokensCss } from './generateTokensCss';
import { color, ORB_PALETTES, radius, text } from './tokens';

describe('tokens.css', () => {
  test('the checked-in file is the generated properties, then the keyframes', async () => {
    // tokens.css is generated custom properties followed by hand-written
    // keyframes, which CSS cannot express as values. This is what holds
    // the file and tokens.ts in agreement: change tokens.ts, re-run this,
    // and paste what it says. Never edit the generated half by hand.
    const onDisk = await readFile(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(onDisk.startsWith(generateTokensCss())).toBe(true);
    expect(onDisk).toContain('@keyframes fsr-orb-idle');
    expect(onDisk).toContain('prefers-reduced-motion');
  });

  test('every value the design uses reaches CSS', () => {
    const css = generateTokensCss();
    for (const value of Object.values(color)) expect(css).toContain(value);
    for (const size of Object.values(text)) expect(css).toContain(`${size}px`);
    for (const r of Object.values(radius)) expect(css).toContain(`${r}px`);
  });

  test('names are kebab-cased custom properties under one prefix', () => {
    const names = generateTokensCss().match(/--[\w-]+(?=:)/g) ?? [];
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) {
      expect(name).toMatch(/^--fsr-[a-z0-9-]+$/);
      expect(name).not.toMatch(/--fsr--/);
    }
  });
});

describe('orb palettes', () => {
  test('there are four, and they are the canvas\'s', () => {
    // There were fifteen: the canvas's four and eleven I wrote. Every
    // agent wore one of mine, chosen by a hash. The founder: "I want
    // exactly what I designed. Exactly."
    expect(ORB_PALETTES).toHaveLength(4);
  });

  test('each carries the seed the canvas pairs with it', () => {
    expect(ORB_PALETTES.map(p => p.seed)).toEqual([11, 22, 33, 44]);
  });

  test('the four are the canvas\'s, exactly', () => {
    expect(ORB_PALETTES.map(p => p.colors.join(','))).toEqual([
      '#4f9a2e,#2a7fa8,#c9b755,#e8f0d8,#4f9c7a',
      '#2f6ab8,#3f93ad,#6a56b0,#dbe6f5,#4a7fc4',
      '#6d4bb8,#3f66b8,#a85fa0,#e2d8f2,#7d5cc4',
      '#bf4a86,#c07a28,#8f5cad,#f2dae5,#c45f92',
    ]);
  });

  test('each is five colours the shader can read', () => {
    for (const palette of ORB_PALETTES) {
      expect(palette.colors, palette.id).toHaveLength(5);
      for (const c of palette.colors) expect(c, palette.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('ids are unique, so one can be stored and read back', () => {
    const ids = ORB_PALETTES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no two palettes are the same colours', () => {
    const signatures = ORB_PALETTES.map(p => p.colors.join(','));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  test('the fourth colour is the pale one that lights the orb', () => {
    // The shader ramps from near-white at the top to the base hue at the
    // bottom, and colors[3] is the top of that ramp. A palette whose
    // fourth colour is not the lightest renders as mud.
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const { id, colors } of ORB_PALETTES) {
      const pale = luminance(colors[3]);
      const others = [colors[0], colors[1], colors[2], colors[4]].map(luminance);
      expect(pale, id).toBeGreaterThan(Math.max(...others));
    }
  });
});
