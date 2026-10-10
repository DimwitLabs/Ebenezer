import { DynamicScheme, Hct, Variant, argbFromHex, hexFromArgb } from "@material/material-color-utilities";

export type Theme = "system" | "light" | "dark";

const KEY = "ebenezer.theme";
const SEED_KEY = "ebenezer.seed";
export const DEFAULT_SEED = "#006c4b";

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  remember(KEY, t);
}

// Storage can be blocked; the choice still applies for this visit.
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function savedSeed(): string {
  try {
    const s = localStorage.getItem(SEED_KEY);
    return s && /^#[0-9a-f]{6}$/i.test(s) ? s : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

function schemes(hex: string) {
  const source = Hct.fromInt(argbFromHex(hex));
  const scheme = (isDark: boolean) => new DynamicScheme({ sourceColorHct: source, variant: Variant.TONAL_SPOT, isDark, contrastLevel: 0 });
  return { light: scheme(false), dark: scheme(true) };
}

// Three greys from the seed's neutrals, none black; the tones are checked against every surface.
function inks(s: DynamicScheme): [string, number, number][] {
  return [
    ["on-surface", s.neutralPalette.tone(20), s.neutralPalette.tone(88)],
    ["on-surface-variant", s.neutralVariantPalette.tone(35), s.neutralVariantPalette.tone(76)],
    ["on-surface-faint", s.neutralVariantPalette.tone(42), s.neutralVariantPalette.tone(64)],
  ];
}

// No pure white: the lightest cards and text on filled colours take tone 98 of the seed's neutral.
const cream = (s: DynamicScheme) => s.neutralPalette.tone(98);

// Roles hold light-dark(), so the color-scheme switch applyTheme drives needs no second pass.
function paint(hex: string) {
  const { light, dark } = schemes(hex);
  const root = document.documentElement.style;
  const pair = (l: number, d: number) => `light-dark(${hexFromArgb(l)}, ${hexFromArgb(d)})`;
  for (const c of light.colors.allColors) {
    root.setProperty(`--md-sys-color-${c.name.replace(/_/g, "-")}`, pair(c.getArgb(light), c.getArgb(dark)));
  }
  for (const [role, l, d] of inks(light)) root.setProperty(`--md-sys-color-${role}`, pair(l, d));
  const off = cream(light);
  root.setProperty("--md-sys-color-surface-container-lowest", pair(off, dark.surfaceContainerLowest));
  root.setProperty("--md-sys-color-on-swatch", hexFromArgb(off));
  series(hex).forEach(([l, d], i) => root.setProperty(`--series-${i + 1}`, pair(l, d)));
  for (const [role, d] of [
    ["on-primary", dark.onPrimary],
    ["on-secondary", dark.onSecondary],
    ["on-tertiary", dark.onTertiary],
    ["on-error", dark.onError],
  ] as const) {
    root.setProperty(`--md-sys-color-${role}`, pair(off, d));
  }
}

// Seven hues round the wheel: adjacent bars at least two steps apart, wheel neighbours at different tones.
const SPREAD = [0, 3, 5, 1, 4, 2, 6];

function series(hex: string): [number, number][] {
  const hue = Hct.fromInt(argbFromHex(hex)).hue;
  return SPREAD.map((k) => {
    const h = (hue + (k * 360) / 7) % 360;
    const odd = k % 2;
    return [Hct.from(h, 48, odd ? 58 : 42).toInt(), Hct.from(h, 40, odd ? 84 : 72).toInt()];
  });
}

// Mail clients ignore dark-mode styles, so the emailed report gets light colours only.
export function reportPalette(hex: string): Record<string, string> {
  const { light: s } = schemes(hex);
  const [ink, ink2, ink3] = inks(s).map(([, l]) => l);
  const roles: Record<string, number> = {
    primary: s.primary,
    onPrimary: cream(s),
    page: cream(s),
    card: s.surfaceContainer,
    hero: s.primaryContainer,
    onHero: s.onPrimaryContainer,
    tag: s.surfaceContainerHigh,
    rule: s.surfaceContainerHighest,
    line: s.outlineVariant,
    ink,
    ink2,
    ink3,
    chip: s.secondaryContainer,
    onChip: s.onSecondaryContainer,
    note: s.tertiaryContainer,
    onNote: s.onTertiaryContainer,
    error: s.error,
    alert: s.errorContainer,
    onAlert: s.onErrorContainer,
  };
  const out = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, hexFromArgb(v)]));
  out.heroInk2 = mix(s.onPrimaryContainer, s.primaryContainer, 0.78);
  return out;
}

function mix(a: number, b: number, t: number): string {
  const ch = (x: number, sh: number) => (x >> sh) & 255;
  const m = (sh: number) => Math.round(ch(a, sh) * t + ch(b, sh) * (1 - t));
  return hexFromArgb((255 << 24) | (m(16) << 16) | (m(8) << 8) | m(0));
}

export function applySeed(hex: string) {
  paint(hex);
  remember(SEED_KEY, hex);
}

export function restoreSeed() {
  paint(savedSeed());
}
