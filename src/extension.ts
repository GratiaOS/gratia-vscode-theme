import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

type Density = 'cozy' | 'snug';

type DensitySettings = {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

const DENSITY_PRESETS: Record<Density, DensitySettings> = {
  cozy: { fontSize: 14, lineHeight: 22, letterSpacing: 0.2 },
  snug: { fontSize: 13, lineHeight: 18, letterSpacing: 0.0 },
};

type Mood = 'soft' | 'focused' | 'celebratory';

const MOOD_FILES: Record<Mood, string> = {
  soft: 'themes/gratia-garden-dark-soft.json',
  focused: 'themes/gratia-garden-dark-focused.json',
  celebratory: 'themes/gratia-garden-dark-celebratory.json',
};

const MOOD_COLOR_KEYS = [
  'tab.activeBackground',
  'tab.activeBorder',
  'editor.selectionBackground',
  'list.activeSelectionBackground',
  'quickInput.list.focusBackground',
  'input.background',
  'input.border',
  'focusBorder',
  'quickInput.background',
  'peekViewEditor.background',
  'peekViewResult.background',
] as const;

const moodCache = new Map<Mood, Record<string, string>>();

function applyDensity(kind: Density) {
  const editor = vscode.workspace.getConfiguration('editor');
  const target = vscode.ConfigurationTarget.Global;
  const next = DENSITY_PRESETS[kind];

  editor.update('fontSize', next.fontSize, target);
  editor.update('lineHeight', next.lineHeight, target);
  editor.update('letterSpacing', next.letterSpacing, target);

  vscode.window.setStatusBarMessage(`Gratia: ${kind === 'cozy' ? 'Cozy' : 'Snug'} density applied`, 2000);
}

function toggleDensity() {
  const editor = vscode.workspace.getConfiguration('editor');
  const current = editor.get<number>('lineHeight', DENSITY_PRESETS.cozy.lineHeight);
  const next = current >= DENSITY_PRESETS.cozy.lineHeight ? 'snug' : 'cozy';
  applyDensity(next);
}

async function loadMoodColors(ctx: vscode.ExtensionContext, mood: Mood) {
  if (moodCache.has(mood)) return moodCache.get(mood)!;
  const filePath = path.join(ctx.extensionPath, MOOD_FILES[mood]);
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  const colors = (payload?.colors ?? {}) as Record<string, string>;
  moodCache.set(mood, colors);
  return colors;
}

async function applyMood(ctx: vscode.ExtensionContext, mood: Mood) {
  try {
    const colors = await loadMoodColors(ctx, mood);
    const overlay: Record<string, string> = {};
    for (const key of MOOD_COLOR_KEYS) {
      if (colors[key]) {
        overlay[key] = colors[key];
      }
    }
    const config = vscode.workspace.getConfiguration('workbench');
    const current = config.get<Record<string, string>>('colorCustomizations') ?? {};
    await config.update(
      'colorCustomizations',
      { ...current, ...overlay },
      vscode.ConfigurationTarget.Global,
    );
    const label = mood.charAt(0).toUpperCase() + mood.slice(1);
    vscode.window.setStatusBarMessage(`Gratia mood · ${label}`, 2000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to set Gratia mood: ${message}`);
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('gratiaTheme.setCozy', () => applyDensity('cozy')),
    vscode.commands.registerCommand('gratiaTheme.setSnug', () => applyDensity('snug')),
    vscode.commands.registerCommand('gratiaTheme.toggleDensity', () => toggleDensity()),
    vscode.commands.registerCommand('gratia.setMood.soft', () => applyMood(ctx, 'soft')),
    vscode.commands.registerCommand('gratia.setMood.focused', () => applyMood(ctx, 'focused')),
    vscode.commands.registerCommand('gratia.setMood.celebratory', () => applyMood(ctx, 'celebratory')),
  );
}

export function deactivate() {}
