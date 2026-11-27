import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const staticAssets = [
  'game_engine.js',
  'three.min.js',
  'telegram-web-app.js',
  'discord-embedded-app-sdk.js',
  'app_icon.png',
  'game_banner.png',
  'robots.txt',
  'sitemap.xml',
];

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [{
    name: 'apex-static-game-assets',
    generateBundle() {
      for (const fileName of staticAssets) {
        const source = readFileSync(new URL(fileName, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
  server: { port: 5173, host: '0.0.0.0' },
});
