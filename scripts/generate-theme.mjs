import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const templatePath = path.join(root, 'themes', 'gratia-garden-dark.template.json');
const defaultOutPath = path.join(root, 'themes', 'gratia-garden-dark.json');
const tokensPath = path.join(root, 'tokens.json');
const fallbackTokensPath = path.join(root, 'tokens.example.json');

const MOOD_STRENGTH = {
  soft: 0.08,
  focused: 0.14,
  celebratory: 0.18,
};
const DEFAULT_MOOD = 'soft';
const ANSI_MOOD_TUNING = {
  soft: { norm: { l: -0.01, c: -0.06 }, bright: { l: -0.02, c: -0.1 } },
  focused: { norm: { l: 0, c: 0 }, bright: { l: 0, c: 0 } },
  celebratory: { norm: { l: 0.01, c: 0.06 }, bright: { l: 0.03, c: 0.12 } },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const component = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length === 8) hex = hex.slice(0, 6);
  return `#${hex.toUpperCase()}`;
};

const toRgb = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
};

const toHex = ([r, g, b]) => `#${component(r)}${component(g)}${component(b)}`;

const mix = (primary, secondary, ratio = 0.5) => {
  const a = toRgb(primary);
  const b = toRgb(secondary);
  if (!a || !b) return normalizeHex(primary) || normalizeHex(secondary) || '#000000';
  const weight = clamp(ratio, 0, 1);
  const blended = [
    a[0] + (b[0] - a[0]) * weight,
    a[1] + (b[1] - a[1]) * weight,
    a[2] + (b[2] - a[2]) * weight,
  ];
  return toHex(blended);
};

const mixHex = (a, b, ratio) => mix(a, b, ratio);

const withAlpha = (hex, alpha) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return '#00000033';
  const value = clamp(Math.round(alpha * 255), 0, 255);
  return `${normalized}${component(value)}`;
};

const srgbToLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (value) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

const hexToOklch = (hex) => {
  const rgb = toRgb(hex);
  if (!rgb) return null;
  const [r8, g8, b8] = rgb;
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(a * a + bVal * bVal);
  const h = (Math.atan2(bVal, a) * 180) / Math.PI;

  return {
    l: clamp(L, 0, 1),
    c: clamp(C, 0, 0.4),
    h: (h + 360) % 360,
  };
};

const oklchToHex = ({ l, c, h }) => {
  const hr = (h / 180) * Math.PI;
  const a = Math.cos(hr) * c;
  const b = Math.sin(hr) * c;

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLinear = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  const toByte = (channel) => {
    const srgb = linearToSrgb(clamp(channel, 0, 1));
    return Math.round(clamp(srgb, 0, 1) * 255);
  };

  return `#${component(toByte(rLinear))}${component(toByte(gLinear))}${component(toByte(bLinear))}`;
};

const mixOklchHex = (aHex, bHex, ratio = 0.5) => {
  const a = hexToOklch(aHex);
  const b = hexToOklch(bHex);
  if (!a || !b) return mix(aHex, bHex, ratio);
  const t = clamp(ratio, 0, 1);
  const hueDelta = (((b.h - a.h + 540) % 360) - 180) * t;
  return oklchToHex({
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: (a.h + hueDelta + 360) % 360,
  });
};

const relativeLuminance = (hex) => {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a, b) => {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
};

const ensureContrast = (foreground, background, ratio) => {
  if (contrastRatio(foreground, background) >= ratio) return foreground;
  for (let i = 1; i <= 10; i += 1) {
    const step = i / 10;
    const lighter = mixHex(foreground, '#FFFFFF', step);
    if (contrastRatio(lighter, background) >= ratio) return lighter;
    const darker = mixHex(foreground, '#000000', step);
    if (contrastRatio(darker, background) >= ratio) return darker;
  }
  return null;
};

const pickSelectionFg = (selectionBg, ink) =>
  ensureContrast(ink, selectionBg, 7) || ensureContrast(ink, selectionBg, 4.5) || '#FFFFFF';

const deriveAnsiPalette = (surface, ink, accent) => {
  const mk = (l, c, h) => oklchToHex({ l: clamp(l, 0, 1), c: clamp(c, 0, 0.4), h: (h + 360) % 360 });
  const Ld = 0.68;
  const Cn = 0.06;
  const br = 0.8;
  const Cb = 0.09;
  const hues = {
    red: 25,
    yellow: 100,
    green: 145,
    cyan: 200,
    blue: 255,
    magenta: 320,
  };

  return {
    background: surface,
    foreground: ink,
    cursor: accent,
    ansi: {
      black: mixHex(surface, ink, 0.65),
      red: mk(Ld, Cn, hues.red),
      green: mk(Ld, Cn, hues.green),
      yellow: mk(Ld, Cn, hues.yellow),
      blue: mk(Ld, Cn, hues.blue),
      magenta: mk(Ld, Cn, hues.magenta),
      cyan: mk(Ld, Cn, hues.cyan),
      white: mixHex(surface, ink, 0.15),
      brightBlack: mixHex(surface, ink, 0.45),
      brightRed: mk(br, Cb, hues.red),
      brightGreen: mk(br, Cb, hues.green),
      brightYellow: mk(br, Cb, hues.yellow),
      brightBlue: mk(br, Cb, hues.blue),
      brightMagenta: mk(br, Cb, hues.magenta),
      brightCyan: mk(br, Cb, hues.cyan),
      brightWhite: mixHex(surface, ink, 0.05),
    },
  };
};

const tuneHexOklch = (hex, { l = 0, c = 0 }) => {
  const color = hexToOklch(hex);
  if (!color) return hex;
  return oklchToHex({
    l: clamp(color.l + l, 0, 1),
    c: clamp(color.c * (1 + c), 0, 0.4),
    h: color.h,
  });
};

const applyAnsiMoodTuning = (colors, mood) => {
  const tuning = ANSI_MOOD_TUNING[mood] ?? ANSI_MOOD_TUNING.focused;
  const baseKeys = [
    'terminalAnsiBlack',
    'terminalAnsiRed',
    'terminalAnsiGreen',
    'terminalAnsiYellow',
    'terminalAnsiBlue',
    'terminalAnsiMagenta',
    'terminalAnsiCyan',
    'terminalAnsiWhite',
  ];
  for (const key of baseKeys) {
    if (colors[key]) {
      colors[key] = tuneHexOklch(colors[key], tuning.norm);
    }
    const brightKey = key.replace('terminalAnsi', 'terminalAnsiBright');
    if (colors[brightKey]) {
      colors[brightKey] = tuneHexOklch(colors[brightKey], tuning.bright);
    }
  }
  return colors;
};

const createMoodPalette = (surface, ink, accent, strength) => {
  const invitation = mixOklchHex(surface, ink, 0.06);
  const invitationActive = mixOklchHex(surface, ink, 0.08);
  const tint = clamp(strength, 0, 0.35);
  const selectionTint = clamp(tint + 0.06, 0, 0.4);
  return {
    moodSurface: mixOklchHex(surface, accent, tint),
    moodHalo: mixOklchHex(accent, surface, 0.2),
    inputBg: invitation,
    inputBgActive: invitationActive,
    selectionBg: mixOklchHex(surface, accent, selectionTint),
  };
};

const derivePalette = (tokens, mood) => {
  const tone = tokens?.tone && typeof tokens.tone === 'object' ? tokens.tone : tokens || {};

  const bg = normalizeHex(tone.surface) || '#0F1317';
  const fg = normalizeHex(tone.ink) || '#E6EDF5';
  const accent = normalizeHex(tone.accent) || '#FFD59E';
  const moodStrength = MOOD_STRENGTH[mood] ?? MOOD_STRENGTH[DEFAULT_MOOD];
  const moodPalette = createMoodPalette(bg, fg, accent, moodStrength);

  const selection = withAlpha(accent, 0.55);
  const selectionMuted = withAlpha(accent, 0.3);
  const accentSoft = withAlpha(accent, 0.4);

  const line = mix(bg, '#000000', 0.15);
  const lineSoft = mix(bg, '#000000', 0.1);
  const chrome = mix(bg, '#000000', 0.25);
  const chromeSoft = mix(bg, '#000000', 0.18);
  const gutter = mix(fg, bg, 0.65);
  const gutterSoft = mix(fg, bg, 0.75);

  const fieldBg = moodPalette.inputBg;
  const fieldBgActive = moodPalette.inputBgActive;
  const fieldBorder = withAlpha(fg, 0.06);
  const fieldPlaceholder = mix(fg, bg, 0.45);
  const focusRing = withAlpha(moodPalette.moodHalo, 0.6);

  const tabActiveBg = moodPalette.moodSurface;
  const tabInactiveBg = bg;
  const tabBorder = withAlpha(fg, 0.04);
  const tabActiveBorder = moodPalette.moodHalo;
  const tabUnfocusedActiveBorder = withAlpha(moodPalette.moodHalo, 0.45);
  const tabActiveFg = fg;
  const tabInactiveFg = mix(fg, bg, 0.35);

  const selectionFg = pickSelectionFg(moodPalette.selectionBg, fg);
  const terminal = deriveAnsiPalette(moodPalette.moodSurface, fg, accent);
  const ansiEntries = Object.entries(terminal.ansi).reduce((acc, [key, value]) => {
    const camel = `terminalAnsi${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    acc[camel] = value;
    return acc;
  }, {});

  const palette = {
    surface: bg,
    ink: fg,
    accent,
    accentSoft,
    caret: normalizeHex(tone.caret) || accent,
    selection,
    selectionMuted,
    line,
    lineSoft,
    chrome,
    chromeSoft,
    gutter,
    gutterSoft,
    tabActiveBg,
    tabInactiveBg,
    tabBorder,
    tabActiveBorder,
    tabUnfocusedActiveBorder,
    tabActiveFg,
    tabInactiveFg,
    fieldBg,
    fieldBgActive,
    fieldBorder,
    fieldPlaceholder,
    focusRing,
    moodSurface: moodPalette.moodSurface,
    moodHalo: moodPalette.moodHalo,
    selectionBg: moodPalette.selectionBg,
    inputBg: moodPalette.inputBg,
    selectionFg,
    terminalBg: terminal.background,
    terminalFg: terminal.foreground,
    terminalCursor: terminal.cursor,
    ...ansiEntries,
  };
  return palette;
};

const replacePlaceholders = (template, palette) =>
  template.replace(/\$\{([\w.]+)\}/g, (match, key) => palette[key] || match);

const readTokens = async () => {
  const source = await fs
    .readFile(tokensPath, 'utf8')
    .catch(() => fs.readFile(fallbackTokensPath, 'utf8'));
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    return {};
  }
};

const run = async () => {
  const [template, tokens] = await Promise.all([
    fs.readFile(templatePath, 'utf8'),
    readTokens(),
  ]);

  const moods = Object.keys(MOOD_STRENGTH);
  for (const mood of moods) {
    const palette = derivePalette(tokens, mood);
    const tunedPalette = applyAnsiMoodTuning(palette, mood);
    if (mood === 'celebratory') {
      const warmBases = ['terminalAnsiRed', 'terminalAnsiMagenta'];
      for (const base of warmBases) {
        if (tunedPalette[base]) {
          tunedPalette[base] = tuneHexOklch(tunedPalette[base], { l: 0.01, c: 0.08 });
        }
        const brightKey = base.replace('terminalAnsi', 'terminalAnsiBright');
        if (tunedPalette[brightKey]) {
          tunedPalette[brightKey] = tuneHexOklch(tunedPalette[brightKey], { l: 0.02, c: 0.16 });
        }
      }
    }
    const themed = replacePlaceholders(template, tunedPalette);
    const filename = `gratia-garden-dark-${mood}.json`;
    const outFile = path.join(root, 'themes', filename);
    await fs.writeFile(outFile, themed, 'utf8');
    console.log(`Theme → ${path.relative(root, outFile)}`);

    if (mood === DEFAULT_MOOD) {
      await fs.writeFile(defaultOutPath, themed, 'utf8');
    }
  }
};

run().catch((error) => {
  console.error('Failed to generate theme:', error);
  process.exitCode = 1;
});
