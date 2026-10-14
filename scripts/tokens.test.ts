import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCss, parseDesign, resolveRef, resolvedComponents } from './tokens';

const design = readFileSync(resolve(__dirname, '../DESIGN.md'), 'utf8');
const tokens = parseDesign(design);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('DESIGN.md tokens', () => {
  it('parses colours, type, radii, spacing and four elevation levels', () => {
    expect(tokens.colors.primary).toBe('#0F4C5C');
    expect(tokens.typography['price-xl']?.fontSize).toBe('2rem');
    expect(tokens.rounded.lg).toBe('12px');
    expect(tokens.spacing.section).toBe('80px');
    expect(Object.keys(tokens.shadows)).toEqual(['1', '2', '3']);
  });

  it('every {group.name} reference in components resolves', () => {
    expect(() => resolvedComponents(tokens)).not.toThrow();
    expect(resolvedComponents(tokens)['button-primary']?.backgroundColor).toBe('#BD5418');
  });

  it('throws on an unknown reference', () => {
    expect(() => resolveRef(tokens, '{colors.nope}')).toThrow(/Unresolved/);
  });

  it('emits a Tailwind @theme block that clears default colours', () => {
    const css = buildCss(tokens);
    expect(css).toContain('@theme static {');
    expect(css).toContain('--color-*: initial;');
    expect(css).toContain('--color-action: #BD5418;');
    expect(css).toContain('--text-h1--line-height: 2.375rem;');
  });

  // DESIGN.md makes these contrast claims; hold the palette to them.
  it.each([
    ['on-action', 'action', 4.5],
    ['on-primary', 'primary', 4.5],
    ['text-secondary', 'surface', 4.5],
    ['text-secondary', 'canvas', 4.5],
    ['text-secondary', 'surface-muted', 4.5],
    ['on-trust-evidence', 'trust-evidence', 4.5],
    ['on-trust-declared', 'trust-declared', 4.5],
    ['on-action-container', 'action-container', 4.5],
    ['success', 'success-container', 4.5],
    ['warning', 'warning-container', 4.5],
    ['danger', 'danger-container', 4.5],
    ['border-control', 'surface', 3],
  ])('%s on %s meets %s:1', (fg, bg, min) => {
    expect(contrast(tokens.colors[fg]!, tokens.colors[bg]!)).toBeGreaterThanOrEqual(min);
  });

  it('action-accent is too light for text (why DESIGN.md forbids it)', () => {
    expect(contrast(tokens.colors['action-accent']!, tokens.colors.surface!)).toBeLessThan(4.5);
  });
});
