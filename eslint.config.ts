import {defineConfig, type Config} from '@bfra.me/eslint-config'

const config: ReturnType<typeof defineConfig> = defineConfig({
  name: '@bfra.me/.github',
  ignores: ['.github/instructions/**', '.github/copilot-instructions.md', '.ai/'],
})

export default config as Config
