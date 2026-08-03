import {execSync} from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

function gitInfo(cmd: string): string | undefined {
  try {
    return execSync(cmd, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const commitHash = gitInfo('git rev-parse --short HEAD');
const commitDate = gitInfo('git log -1 --format=%cd --date=short');

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DATE__: JSON.stringify(commitDate),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  // research/ holds a vendored copy of crystalis-randomizer for reference only.
  // Without these, vite's dep scanner globs every **/*.html in the project and
  // fails parsing that source; the watcher also churns on thousands of files.
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/research/**', '**/dist/**'],
    },
  },
});
