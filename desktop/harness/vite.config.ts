import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// The harness only. Deliberately none of the app's Electron plugins:
// this renders design components in a plain browser so they can be
// looked at and photographed.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src/renderer'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true },
});
