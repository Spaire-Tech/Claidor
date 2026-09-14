import {
  color,
  font,
  glass,
  grid,
  line,
  motion,
  radius,
  shadow,
  text,
  tracking,
} from './tokens';

/**
 * The custom properties, written from `tokens.ts`.
 *
 * Two files saying the same thing is how a design system rots, so only
 * one of them is written by hand. This builds the other, and
 * `tokens.test.ts` fails if the checked-in CSS no longer matches what
 * this produces — the same trick a generated file uses, without a build
 * step nobody would remember to run.
 */

const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const px = (value: number): string => `${value}px`;

const group = (title: string, lines: readonly string[]): string =>
  [`  /* ${title} */`, ...lines.map((l) => `  ${l}`)].join('\n');

const vars = (
  prefix: string,
  values: Record<string, string | number>,
  format: (value: string | number) => string = String,
): string[] =>
  Object.entries(values).map(
    ([name, value]) => `--fsr-${prefix}-${kebab(name)}: ${format(value)};`,
  );

export function generateTokensCss(): string {
  const blocks = [
    group('Colour', vars('', color).map((l) => l.replace('--fsr--', '--fsr-'))),
    group('Lines', vars('line', line)),
    group('Shadows', vars('shadow', shadow)),
    group('Glass', vars('glass', glass)),
    group(
      'Type',
      vars('text', text, (v) => px(Number(v))),
    ),
    group('Tracking', vars('tracking', tracking)),
    group(
      'Radii',
      vars('radius', radius, (v) => px(Number(v))),
    ),
    group('Grid', [`--fsr-grid-size: ${px(grid.size)};`]),
    group('Type faces', vars('font', font)),
    group(
      'Motion',
      Object.entries(motion).flatMap(([name, m]) => {
        const base = `--fsr-motion-${kebab(name)}`;
        const out = [
          `${base}-duration: ${m.duration};`,
          `${base}-easing: ${m.easing};`,
        ];
        if ('longer' in m) out.splice(1, 0, `${base}-duration-longer: ${m.longer};`);
        return out;
      }),
    ),
  ];

  return [
    '/*',
    ' * Faiser design tokens.',
    ' *',
    ' * GENERATED from src/renderer/design/tokens.ts by generateTokensCss().',
    ' * Do not edit: tokens.test.ts compares this file against the generator',
    ' * and fails when they disagree. Change tokens.ts and run the test.',
    ' */',
    '',
    ':root {',
    blocks.join('\n\n'),
    '}',
    '',
  ].join('\n');
}
