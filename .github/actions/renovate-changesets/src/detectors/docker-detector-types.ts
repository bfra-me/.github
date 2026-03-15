import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export interface DockerImageReference {
  registry?: string
  namespace?: string
  name: string
  tag?: string
  fullReference: string
  line?: number
  context?: string
}

export interface DockerfileInstruction {
  instruction: string
  args: string[]
  line: number
  content: string
}

export interface DockerComposeService {
  name: string
  image?: string
  build?: string | {context: string; dockerfile?: string; [key: string]: unknown}
  [key: string]: unknown
}

export interface DockerComposeFile {
  version?: string
  services?: Record<string, DockerComposeService>
  [key: string]: unknown
}

export interface DockerDependencyChange {
  name: string
  dockerFile: string
  currentTag?: string
  newTag?: string
  currentDigest?: string
  newDigest?: string
  registry?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  scope?: string
  context?: string
  line?: number
  isDigestUpdate: boolean
  isBaseImage: boolean
  serviceName?: string
}
