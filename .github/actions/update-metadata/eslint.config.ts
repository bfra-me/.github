import {composeConfig} from '@bfra.me/eslint-config'
import config from '../../../eslint.config'

export default composeConfig(config).insertAfter('@bfra.me/ignores', {
  name: '@bfra.me/eslint-config/ignores',
  ignores: ['dist'],
})
