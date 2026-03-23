import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export interface GoModule {
  path: string
  version?: string
  indirect?: boolean
  replace?: {
    old: string
    new: string
    version?: string
  }
}

export interface GoModFile {
  module?: string
  go?: string
  require?: GoModule[]
  exclude?: GoModule[]
  replace?: GoModule[]
  retract?: GoModule[]
}

export interface GoModDependencyChange {
  name: string
  modFile: string
  currentVersion?: string
  newVersion?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isIndirect: boolean
  isReplace: boolean
  scope?: string
  line?: number
}
