import { execSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { assertMainnetEnv } from './src/config/networkEnv.js'
import { handleMetadataRequest, memoryBackend } from './src/lib/metadataStore.js'

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

// `npm run dev` has no Vercel functions, so serve the metadata store from
// memory with the same handler as `api/metadata.ts`. Documents last until the
// dev server stops.
function devMetadataStore(): Plugin {
  const backend = memoryBackend()
  return {
    name: 'milepost-dev-metadata-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/metadata', (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', async () => {
          const body = req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
          const request = new Request(`http://localhost${req.originalUrl ?? req.url ?? '/api/metadata'}`, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
            body,
          })
          const response = await handleMetadataRequest(request, backend)
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
          res.end(await response.text())
        })
      })
    },
  }
}

// A mainnet build has no defaults: fail it up front, naming every variable
// that is missing, rather than ship an app pointed at nothing.
function requireMainnetEnv(): Plugin {
  return {
    name: 'milepost-require-mainnet-env',
    apply: 'build',
    config(_, { mode }) {
      assertMainnetEnv({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devMetadataStore(), requireMainnetEnv()],
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
