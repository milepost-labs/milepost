import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The commit the app was built from, shown on /about. CI sets GITHUB_SHA;
// a local build asks git, and falls back to "dev" outside a checkout.
function buildVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION
  let sha = process.env.GITHUB_SHA ?? ''
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      sha = ''
    }
  }
  return sha ? sha.slice(0, 7) : 'dev'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion()),
  },
  test: {
    environment: 'jsdom',
    // App tests only. scripts/*.test.mjs use node:test and run through
    // `npm run test:design-system`.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Tests mock the contract clients; nothing should touch the network.
    // Fail loudly if something tries.
    restoreMocks: true,
    // Only collected with `npm run test:coverage`; see CONTRIBUTING.md.
    coverage: {
      provider: 'v8',
      // Listing every source file is the point. Without `include`, only files
      // some test imports are reported, so a screen with no test at all would
      // not appear in the report.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // Stand-in data, not logic; counting it would inflate the figure.
        'src/fixtures/**',
        // Mounts the app into the real DOM; nothing to exercise under jsdom.
        'src/main.tsx',
        'src/**/*.d.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Vitest skips the report when a test fails, which is exactly when the
      // CI summary is most worth reading.
      reportOnFailure: true,
      // Floors sit just under the figures measured when they were introduced,
      // so coverage cannot fall. Raise them when coverage rises; do not lower
      // them to make a PR pass.
      // Measured: statements 46.17%, branches 42.21%, functions 40.67%,
      // lines 46.82%.
      thresholds: {
        statements: 46,
        branches: 42,
        functions: 40,
        lines: 46,
      },
    },
  },
})
