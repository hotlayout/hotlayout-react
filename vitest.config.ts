import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The README examples import the package by its name; here the name is the sources.
  resolve: { alias: { '@hotlayout/react': fileURLToPath(new URL('./src/index.ts', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Generous on purpose: a few tests walk every contract fixture, and the
    // limit is not a statement about speed.
    testTimeout: 15_000,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
})
