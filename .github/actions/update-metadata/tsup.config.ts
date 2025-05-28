import type {Options} from 'tsup'
import packageJson from './package.json' assert {type: 'json'}

const config: Options = {
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  noExternal: Object.keys(packageJson.dependencies),
}

export default config
