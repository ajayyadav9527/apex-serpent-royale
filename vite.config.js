import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  publicDir: '../public/assets',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: '../src/main.js' },
      output: {
        manualChunks: {
          three:  ['three'],
          howler: ['howler'],
          nipple: ['nipplejs'],
          socketio: ['socket.io-client'],
        },
      },
    },
    target: 'es2020',
    minify: 'terser',
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  define: {
    'import.meta.env.VITE_GAME_SERVER_URL': JSON.stringify(
      process.env.VITE_GAME_SERVER_URL || 'ws://localhost:3000'
    ),
  },
});
