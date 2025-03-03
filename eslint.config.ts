import {defineConfig, type Config} from '@bfra.me/eslint-config'

const config: ReturnType<typeof defineConfig> = defineConfig({
  name: '@bfra.me/.github',
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
})

export default config as Config
