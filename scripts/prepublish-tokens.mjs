import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOKENS_JSON = path.join(ROOT, 'tokens.json');
const TOKENS_EXAMPLE = path.join(ROOT, 'tokens.example.json');

const args = process.argv.slice(2);
const WATCH = args.includes('--watch');
const SKIN_RAW = process.env.GARDEN_SKIN;
const SKIN = SKIN_RAW && SKIN_RAW.toLowerCase() !== 'none' ? SKIN_RAW.toUpperCase() : null;
const SKIN_TO_USE =
  SKIN_RAW && SKIN_RAW.toLowerCase() === 'none' ? null : SKIN ?? 'MOON';

const CANDIDATES = [
  process.env.GARDEN_TOKENS,
  path.resolve(ROOT, '..', 'garden-core', 'ui', 'src', 'styles', 'tokens.css'),
  path.resolve(ROOT, '..', 'garden-core', 'packages', 'tokens', 'theme.css'),
  path.resolve(ROOT, '..', 'ui', 'src', 'styles', 'tokens.css'),
  path.resolve(ROOT, '..', '..', 'ui', 'src', 'styles', 'tokens.css'),
].filter(Boolean);

const HEX_RX = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const toHexComponent = (value) => clamp(value, 0, 255).toString(16).padStart(2, '0').toUpperCase();

const extractBlock = (css, selector) => {
  const anchor = css.indexOf(selector);
  if (anchor === -1) return null;
  const braceStart = css.indexOf('{', anchor);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < css.length; i += 1) {
    const char = css[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(braceStart + 1, i);
      }
    }
  }
  return null;
};

const parseOklch = (value) => {
  const match = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg|°)?(?:\s*\/\s*([\d.]+%?))?\s*\)/i);
  if (!match) return null;
  const parseComponent = (input, isPercent) => {
    const raw = parseFloat(input);
    if (Number.isNaN(raw)) return null;
    if (isPercent || input.trim().endsWith('%')) {
      return raw / 100;
    }
    return raw;
  };
  const l = parseComponent(match[1], true);
  const c = parseComponent(match[2], false);
  const h = parseFloat(match[3]);
  if ([l, c, h].some((v) => v === null || Number.isNaN(v))) return null;
  return { l, c, h };
};

const linearToSrgb = (value) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;

const oklchToHex = ({ l, c, h }) => {
  const hr = ((h % 360) * Math.PI) / 180;
  const a = Math.cos(hr) * c;
  const b = Math.sin(hr) * c;

  const L = l;
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

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

  return `#${toHexComponent(toByte(rLinear))}${toHexComponent(toByte(gLinear))}${toHexComponent(
    toByte(bLinear),
  )}`;
};

const colorToHex = (value) => {
  const hex = normalizeHex(value);
  if (hex) return hex;
  const parsed = parseOklch(value);
  if (parsed) return oklchToHex(parsed);
  return null;
};

const log = (message) => {
  const stamp = new Date().toLocaleTimeString();
  console.log(`[prepublish-tokens] ${stamp} ${message}`);
};

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(HEX_RX);
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

const parseSkinTone = (cssText, skin) => {
  const block = extractBlock(cssText, `:root[data-skin-id='${skin}']`);
  if (!block) return null;
  const tone = {};
  const colorRegex = /--color-(surface|text|accent)\s*:\s*([^;]+);/gi;
  let colorMatch;
  while ((colorMatch = colorRegex.exec(block))) {
    const value = colorToHex(colorMatch[2]);
    if (!value) continue;
    const key = colorMatch[1] === 'text' ? 'ink' : colorMatch[1];
    tone[key] = value;
  }
  return tone;
};

const parseCssTone = (cssText) => {
  const tone = {};
  const toneRegex = /--tone-(surface|ink|accent)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = toneRegex.exec(cssText))) {
    const value = colorToHex(match[2]);
    if (value) {
      tone[match[1]] = value;
    }
  }

  const darkBlock = extractBlock(cssText, ":root[data-theme='dark']");
  if (darkBlock) {
    const colorRegex = /--color-(surface|text|accent)\s*:\s*([^;]+);/gi;
    let colorMatch;
    while ((colorMatch = colorRegex.exec(darkBlock))) {
      const value = colorToHex(colorMatch[2]);
      if (!value) continue;
      const key = colorMatch[1] === 'text' ? 'ink' : colorMatch[1];
      tone[key] = value;
    }
  }

  if (SKIN_TO_USE) {
    const skinTone = parseSkinTone(cssText, SKIN_TO_USE);
    if (skinTone) {
      Object.assign(tone, skinTone);
    }
  }

  return tone;
};

const ensureTone = (tone) => ({
  surface: normalizeHex(tone.surface) ?? '#0F1317',
  ink: normalizeHex(tone.ink) ?? '#E6EDF3',
  accent: normalizeHex(tone.accent) ?? '#60D394',
});

const resolveSource = () => {
  for (const candidate of CANDIDATES) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { path: candidate, kind: 'css' };
    }
  }
  if (fs.existsSync(TOKENS_EXAMPLE)) {
    return { path: TOKENS_EXAMPLE, kind: 'json' };
  }
  return null;
};

const writeTokens = async (tone, meta) => {
  const payload = {
    tone: ensureTone(tone),
    meta: {
      source: meta.source,
      generatedAt: new Date().toISOString(),
    },
  };
  await writeFile(TOKENS_JSON, JSON.stringify(payload, null, 2), 'utf8');
  log(`wrote tokens.json ← ${path.relative(ROOT, meta.source)}`);
};

const pullOnce = async () => {
  const source = resolveSource();
  if (!source) {
    log('no token source found; ensure GARDEN_TOKENS or tokens.example.json');
    return;
  }

  if (source.kind === 'css') {
    const css = await readFile(source.path, 'utf8');
    const tone = parseCssTone(css);
    await writeTokens(tone, { source: source.path });
  } else {
    try {
      const json = JSON.parse(await readFile(source.path, 'utf8'));
      const tone = json.tone ?? json;
      await writeTokens(tone, { source: source.path });
    } catch (error) {
      log(`failed to read fallback tokens: ${error.message}`);
    }
  }

  return source;
};

const startWatch = async () => {
  const source = await pullOnce();
  if (!WATCH) return;

  if (!source || source.kind !== 'css') {
    log('watch mode active, but no CSS token source detected. Watching is skipped.');
    return;
  }

  log(`watching ${source.path} for token changes…`);
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pullOnce().catch((error) => log(`watch update failed: ${error.message}`));
    }, 120);
  };

  const watcher = fs.watch(source.path, trigger);
  const shutdown = () => {
    try {
      watcher.close();
    } catch {
      /* noop */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startWatch().catch((error) => {
  console.error('[prepublish-tokens] fatal:', error);
  process.exit(1);
});
