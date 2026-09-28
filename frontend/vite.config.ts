import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
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
