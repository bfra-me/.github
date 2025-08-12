import {defineConfig, type Config} from '@bfra.me/eslint-config'

const config: ReturnType<typeof defineConfig> = defineConfig({
  name: '@bfra.me/.github',
  ignores: ['.github/instructions/**', '.github/copilot-instructions.md'],
})

export default config as Config
