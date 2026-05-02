import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    serializer: 'src/serializer.ts',
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  external: ['metro', '@react-native/metro-config'],
  banner(ctx) {
    if (ctx.format === 'cjs' && ctx.entry?.includes('cli')) {
      return { js: '#!/usr/bin/env node' };
    }
  },
  async onSuccess() {
    // Copy UI assets to dist/ui/
    const uiSrc = resolve('src/ui');
    const uiDest = resolve('dist/ui');
    mkdirSync(uiDest, { recursive: true });

    for (const file of ['template.html', 'styles.css', 'treemap.js']) {
      const src = join(uiSrc, file);
      if (existsSync(src)) {
        copyFileSync(src, join(uiDest, file));
      }
    }

    // Copy D3 from node_modules to dist/ui/
    const d3Src = resolve('node_modules/d3/dist/d3.min.js');
    if (existsSync(d3Src)) {
      copyFileSync(d3Src, join(uiDest, 'd3.min.js'));
    }
  },
});
