import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'

export type JVMDependencyType =
  | 'compile'
  | 'runtime'
  | 'test'
  | 'provided'
  | 'system'
  | 'implementation'
  | 'api'
  | 'testImplementation'
  | 'compileOnly'
  | 'runtimeOnly'
  | 'annotationProcessor'
  | 'plugin'
  | 'parent'

export interface MavenCoordinate {
  groupId: string
  artifactId: string
  version?: string
  scope?: string
}

export interface MavenPlugin {
  groupId?: string
  artifactId?: string
  version?: string
}

export interface GradleDependency {
  configuration: string
  group?: string
  name: string
  version?: string
  notation: string
  line?: number
}

export interface MavenPOM {
  groupId?: string
  artifactId?: string
  version?: string
  parent?: MavenCoordinate
  dependencies?: MavenCoordinate[]
  dependencyManagement?: {dependencies?: MavenCoordinate[]}
  build?: {plugins?: MavenPlugin[]}
}

export interface JVMDependencyChange {
  name: string
  buildFile: string
  dependencyType: JVMDependencyType
  currentVersion?: string
  newVersion?: string
  currentCoordinate?: string
  newCoordinate?: string
  manager: RenovateManagerType
  updateType: RenovateUpdateType
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none'
  isSecurityUpdate: boolean
  isPlugin: boolean
  scope?: string
  line?: number
  groupId?: string
  artifactId?: string
  configuration?: string
  isParent: boolean
  isPropertyReference: boolean
}

export interface JVMVersion {
  major?: number
  minor?: number
  patch?: number
  qualifier?: string
}

export interface MavenChangeLoaderOptions {
  filename: string
  prNumber: number
  loadContent: (filename: string, ref: string) => Promise<string | null>
}
