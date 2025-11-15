# Gratia — Garden Core (Dark)

A VS Code theme that mirrors Garden tokens. Selection and the active line are authority-tinted, chrome follows mood, and the caret glows softly with accent.

## Install (Marketplace)

- **Marketplace page:** [gratiaos.gratia-vscode-theme](https://marketplace.visualstudio.com/items?itemName=gratiaos.gratia-vscode-theme)
- In VS Code, open the Extensions view and search for “Gratia — Garden Core”.
- Or install via CLI:

  ```bash
  code --install-extension gratiaos.gratia-vscode-theme
  ```

Once installed, choose **Gratia — Garden Core (Dark)** from the Color Theme picker. Density commands (`Gratia Theme: Cozy/Snug/Toggle Density`) remain in the Command Palette.

## Sponsor

If Garden has helped you ship calmer UI, you can support the work here: [github.com/sponsors/GratiaOS](https://github.com/sponsors/GratiaOS).

## Developer setup

1. (Optional) Point `GARDEN_TOKENS` to a Garden CSS token file (defaults try `../garden-core/.../tokens.css`). If none is found, the script falls back to `tokens.example.json`.
2. Build + package:

   ```bash
   npm install
   npm run package
   ```

   This runs the generator, compiles the extension, and produces a `.vsix` via `vsce`.

3. Local smoke test: Extensions → `⋯` → **Install from VSIX...** and pick the generated file.

## Density commands

Use the Command Palette for:

- `Gratia Theme: Cozy Density`
- `Gratia Theme: Snug Density`
- `Gratia Theme: Toggle Density`

These tweak editor font size/line height so the workspace can breathe with the same cozy/snug rhythm as the Garden UI.

## Notes

- `npm run prepublishOnly` pulls tokens (CSS → `tokens.json`) and rewrites `themes/gratia-garden-dark.json`. `npm run package` runs this automatically before compiling + emitting the VSIX.
- Add a light variant by duplicating the template and adjusting surface/ink tones.
- For CI/publish, run `npm run package` and `vsce publish`.
