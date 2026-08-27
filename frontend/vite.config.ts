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
  },
})
