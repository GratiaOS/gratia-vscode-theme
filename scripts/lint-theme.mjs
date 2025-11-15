import fs from 'node:fs';
import path from 'node:path';

const themesDir = path.join(process.cwd(), 'themes');
const files = fs
  .readdirSync(themesDir)
  .filter((file) => file.endsWith('.json') && !file.endsWith('.template.json'));

const deprecatedKeys = [/^quickInput\.list\./];
const requiredKeys = [
  'editor.selectionForeground',
  'terminal.background',
  'terminal.foreground',
  'terminalCursor.foreground',
  'terminal.ansiBlack',
  'terminal.ansiRed',
  'terminal.ansiGreen',
  'terminal.ansiYellow',
  'terminal.ansiBlue',
  'terminal.ansiMagenta',
  'terminal.ansiCyan',
  'terminal.ansiWhite',
  'terminal.ansiBrightBlack',
  'terminal.ansiBrightRed',
  'terminal.ansiBrightGreen',
  'terminal.ansiBrightYellow',
  'terminal.ansiBrightBlue',
  'terminal.ansiBrightMagenta',
  'terminal.ansiBrightCyan',
  'terminal.ansiBrightWhite',
];

let failed = false;

for (const file of files) {
  const fullPath = path.join(themesDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  const json = JSON.parse(source);
  const colors = json.colors || {};
  const keys = Object.keys(colors);

  const foundDeprecated = keys.filter((key) => deprecatedKeys.some((rx) => rx.test(key)));
  if (foundDeprecated.length) {
    failed = true;
    console.error(`✖ ${file} — deprecated keys:\n   - ${foundDeprecated.join('\n   - ')}`);
  }

  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(colors, key));
  if (missing.length) {
    failed = true;
    console.error(`✖ ${file} — missing keys:\n   - ${missing.join('\n   - ')}`);
  }

  const nonHex = keys.filter(
    (key) =>
      typeof colors[key] === 'string' &&
      !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(colors[key]),
  );
  if (nonHex.length) {
    console.warn(
      `! ${file} — non-hex values (ok if intentional):\n   - ${nonHex
        .map((key) => `${key} → ${colors[key]}`)
        .join('\n   - ')}`,
    );
  }
}

if (failed) {
  console.error('Theme lint failed.');
  process.exit(1);
} else {
  console.log('✓ Theme lint passed.');
}
