import type {Options} from 'tsup'
import packageJson from './package.json' with {type: 'json'}

const config: Options = {
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  target: 'node24',
  noExternal: Object.keys(packageJson.dependencies),
  splitting: false,
}

export default config
