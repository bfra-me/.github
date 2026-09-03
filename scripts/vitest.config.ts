import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
  },
})
