import {fileURLToPath} from 'node:url'
import {defineProject} from 'vitest/config'

export default defineProject({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    name: 'renovate-changesets-contract',
    environment: 'node',
    globals: true,
    include: ['test/contract/**/*.contract.test.ts'],
    setupFiles: ['./test/contract/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
