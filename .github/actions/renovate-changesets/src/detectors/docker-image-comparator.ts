import type {RenovateManagerType, RenovateUpdateType} from '../renovate-parser.js'
import type {DockerDependencyChange, DockerImageReference} from './docker-detector-types.js'
import {calculateSemverImpact, isDigest} from './docker-version-comparator.js'

type ChangeFactory = (
  baseImage: DockerImageReference,
  headImage: DockerImageReference,
  filename: string,
  manager: RenovateManagerType,
) => DockerDependencyChange | null

export function compareDockerImages(
  baseImages: DockerImageReference[],
  headImages: DockerImageReference[],
  filename: string,
  manager: 'dockerfile' | 'docker-compose',
  createChange: ChangeFactory = createDependencyChange,
): DockerDependencyChange[] {
  const changes: DockerDependencyChange[] = []
  const baseImageMap = new Map(baseImages.map(image => [getImageKey(image), image]))
  const headImageMap = new Map(headImages.map(image => [getImageKey(image), image]))

  for (const [key, headImage] of headImageMap) {
    const baseImage = baseImageMap.get(key)
    if (baseImage == null || baseImage.tag === headImage.tag) {
      continue
    }

    const change = createChange(baseImage, headImage, filename, manager)
    if (change != null) {
      changes.push(change)
    }
  }

  return changes
}

export function createDependencyChange(
  baseImage: DockerImageReference,
  headImage: DockerImageReference,
  filename: string,
  manager: RenovateManagerType,
): DockerDependencyChange | null {
  try {
    const isDigestUpdate = isDigest(baseImage.tag) || isDigest(headImage.tag)
    const semverImpact = calculateSemverImpact(baseImage.tag, headImage.tag)

    return {
      name: getFullImageName(headImage),
      dockerFile: filename,
      currentTag: baseImage.tag,
      newTag: headImage.tag,
      currentDigest: isDigest(baseImage.tag) ? baseImage.tag : undefined,
      newDigest: isDigest(headImage.tag) ? headImage.tag : undefined,
      registry: headImage.registry,
      manager,
      updateType: determineUpdateType(semverImpact, isDigestUpdate),
      semverImpact,
      isSecurityUpdate: detectSecurityUpdate(baseImage.tag, headImage.tag),
      scope: headImage.namespace,
      context: headImage.context,
      line: headImage.line,
      isDigestUpdate,
      isBaseImage: baseImage.context === 'FROM',
      serviceName: extractServiceName(headImage.context),
    }
  } catch (error) {
    console.warn(`Failed to create dependency change: ${error}`)
    return null
  }
}

export function deduplicateChanges(changes: DockerDependencyChange[]): DockerDependencyChange[] {
  const seen = new Set<string>()
  return changes.filter(change => {
    const key = `${change.name}:${change.dockerFile}:${change.currentTag}:${change.newTag}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function getImageKey(image: DockerImageReference): string {
  return [image.registry, image.namespace, image.name, image.context]
    .filter(part => part != null)
    .join('/')
}

export function getFullImageName(image: DockerImageReference): string {
  return [image.registry === 'docker.io' ? undefined : image.registry, image.namespace, image.name]
    .filter(part => part != null)
    .join('/')
}

export function extractServiceName(context?: string): string | undefined {
  return context?.startsWith('service:') === true ? context.slice(8) : undefined
}

export function determineUpdateType(
  semverImpact: DockerDependencyChange['semverImpact'],
  isDigestUpdate: boolean,
): RenovateUpdateType {
  if (isDigestUpdate) return 'digest'
  if (semverImpact === 'major') return 'major'
  if (semverImpact === 'minor') return 'minor'
  return 'patch'
}

export function detectSecurityUpdate(oldTag?: string, newTag?: string): boolean {
  if (oldTag == null || newTag == null) {
    return false
  }

  const combinedTags = `${oldTag} ${newTag}`.toLowerCase()
  return [/security/i, /cve/i, /patch/i, /fix/i, /vuln/i].some(pattern =>
    pattern.test(combinedTags),
  )
}
