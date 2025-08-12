import {composeConfig, type Config} from '@bfra.me/eslint-config'
import config from '../../../eslint.config'

export default composeConfig(config as Config).insertAfter('@bfra.me/ignores', {
  name: '@bfra.me/eslint-config/ignores',
  ignores: ['dist'],
})
