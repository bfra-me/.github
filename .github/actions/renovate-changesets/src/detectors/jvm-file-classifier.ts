import path from 'node:path'

const JVM_FILE_PATTERNS = [
  /^build\.gradle$/i,
  /^build\.gradle\.kts$/i,
  /^settings\.gradle$/i,
  /^settings\.gradle\.kts$/i,
  /^gradle\.properties$/i,
  /^pom\.xml$/i,
  /gradle\/wrapper\/gradle-wrapper\.properties$/i,
  /.*\.gradle$/i,
  /.*\.gradle\.kts$/i,
  /.*pom.*\.xml$/i,
] as const

export function isJVMBuildFile(filename: string): boolean {
  return JVM_FILE_PATTERNS.some(pattern => pattern.test(filename))
}

export function isGradleFile(filename: string): boolean {
  return /\.gradle(?:\.kts)?$/i.test(filename) || filename.includes('gradle')
}

export function isMavenFile(filename: string): boolean {
  return /pom.*\.xml$/i.test(path.basename(filename))
}

export function isPropertiesFile(filename: string): boolean {
  return filename.endsWith('.properties')
}
