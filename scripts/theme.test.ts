// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const colour = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`--color-${name} is not defined`);
  return m[1]!.toLowerCase();
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('the theme colours are the approved palette', () => {
  expect({
    page: colour('page'),
    card: colour('card'),
    raised: colour('raised'),
    line: colour('line'),
    'line-strong': colour('line-strong'),
    fg: colour('fg'),
    muted: colour('muted'),
    faint: colour('faint'),
    accent: colour('accent'),
    'accent-soft': colour('accent-soft'),
    'on-accent': colour('on-accent'),
    warn: colour('warn'),
    danger: colour('danger'),
    good: colour('good'),
  }).toEqual({
    page: '#18181b',
    card: '#27272a',
    raised: '#3f3f46',
    line: '#3f3f46',
    'line-strong': '#52525b',
    fg: '#f4f4f5',
    muted: '#a1a1aa',
    faint: '#71717a',
    accent: '#3b82f6',
    'accent-soft': '#60a5fa',
    'on-accent': '#09090b',
    warn: '#fbbf24',
    danger: '#f87171',
    good: '#4ade80',
  });
  expect(css).toMatch(/color-scheme:\s*dark/);
});

test('text is readable on the dark cards and on the blue buttons', () => {
  const card = colour('card');
  expect(contrast(colour('fg'), card)).toBeGreaterThanOrEqual(7);
  expect(contrast(colour('muted'), card)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colour('on-accent'), colour('accent'))).toBeGreaterThanOrEqual(4.5);
  for (const role of ['warn', 'danger', 'good', 'accent-soft']) expect(contrast(colour(role), card)).toBeGreaterThanOrEqual(4.5);
});

test("the iPhone's status bar, launch colour and icon are dark", () => {
  const html = readFileSync('index.html', 'utf8');
  expect(html).toContain('<meta name="theme-color" content="#18181b" />');
  expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black" />');
  const config = readFileSync('vite.config.ts', 'utf8');
  expect(config).toContain("background_color: '#18181b'");
  expect(config).toContain("theme_color: '#18181b'");
  const icon = readFileSync('public/icon.svg', 'utf8');
  expect(icon).toContain('#18181b');
  expect(icon).toContain('#3b82f6');
});

test('no screen uses the light palette', () => {
  // The camera view keeps its black and white (text over the video); nothing else is exempt.
  const cameraOnly = /^(?:bg|text|ring|border)-(?:black|white)(?:\/\d+)?$/;
  const camera = 'src/ui/screens/ScanScreen.tsx';
  const light = /\b(?:bg|text|ring|border|divide|fill|stroke|accent|placeholder|from|to)-(?:white|black|zinc|emerald|green|amber|red|sky|gray|slate|neutral)(?:-\d+)?\b/g;
  const hits: string[] = [];
  for (const file of readdirSync('src', { recursive: true, withFileTypes: false }) as string[]) {
    const path = `src/${file}`;
    if (!/\.(ts|tsx)$/.test(path) || /\.test\./.test(path)) continue;
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of line.matchAll(light)) if (!(path === camera && cameraOnly.test(m[0]))) hits.push(`${path}:${i + 1} ${m[0]}`);
      });
  }
  expect(hits).toEqual([]);
});

test('delete buttons are readable on the background they sit on', () => {
  const styles = readFileSync('src/ui/styles.ts', 'utf8');
  const danger = /export const btnDanger = `\$\{btn\} ([^`]*)`/.exec(styles)?.[1] ?? '';
  const bg = /\bbg-([a-z-]+)\b/.exec(danger)?.[1] ?? 'card';
  const text = /\btext-([a-z-]+)\b/.exec(danger)?.[1];
  expect(text).toBe('danger');
  expect(contrast(colour(text!), colour(bg))).toBeGreaterThanOrEqual(4.5);
});

test('the "left after this" line is not in the success green', () => {
  const preview = readFileSync('src/ui/components/NutrientPreview.tsx', 'utf8');
  const line = preview.split('\n').find((l) => l.includes('{left}'))!;
  expect(line).not.toMatch(/\btext-good\b/);
});
