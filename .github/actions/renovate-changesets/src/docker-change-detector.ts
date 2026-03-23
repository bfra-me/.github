import type {Octokit} from '@octokit/rest'
import type {
  DockerDependencyChange,
  DockerImageReference,
} from './detectors/docker-detector-types.js'
import type {RenovateManagerType} from './renovate-parser.js'
import {Buffer} from 'node:buffer'
import path from 'node:path'
import {parseDockerCompose} from './detectors/docker-compose-analyzer.js'
import {parseDockerfile, parseImageReference} from './detectors/docker-file-parser.js'
import {
  compareDockerImages,
  deduplicateChanges,
  detectSecurityUpdate,
  determineUpdateType,
  extractServiceName,
  getFullImageName,
} from './detectors/docker-image-comparator.js'
import {calculateSemverImpact, isDigest} from './detectors/docker-version-comparator.js'

export type {
  DockerComposeFile,
  DockerComposeService,
  DockerDependencyChange,
  DockerfileInstruction,
  DockerImageReference,
} from './detectors/docker-detector-types.js'

export async function detectDockerChangesFromPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  files: {filename: string; status: string; additions: number; deletions: number}[],
): Promise<DockerDependencyChange[]> {
  const changes: DockerDependencyChange[] = []
  for (const file of files.filter(candidate => isDockerFile(candidate.filename))) {
    try {
      changes.push(...(await analyzeDockerFile(octokit, owner, repo, prNumber, file.filename)))
    } catch (error) {
      console.warn(`Failed to analyze Docker file ${file.filename}: ${error}`)
    }
  }

  return deduplicateChanges(changes)
}

function isDockerFile(filename: string): boolean {
  return isDockerfile(filename) || isDockerCompose(filename)
}

async function analyzeDockerFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
): Promise<DockerDependencyChange[]> {
  try {
    const [baseContent, headContent] = await Promise.all([
      getFileContent(octokit, owner, repo, filename, 'base', prNumber),
      getFileContent(octokit, owner, repo, filename, 'head', prNumber),
    ])
    if (baseContent == null || headContent == null) return []
    if (isDockerfile(filename)) {
      return compareDockerImageSets(
        parseDockerfileContent(baseContent),
        parseDockerfileContent(headContent),
        filename,
        'dockerfile',
      )
    }

    if (isDockerCompose(filename)) {
      return compareDockerImageSets(
        parseDockerComposeContent(baseContent),
        parseDockerComposeContent(headContent),
        filename,
        'docker-compose',
      )
    }

    return []
  } catch (error) {
    console.warn(`Error analyzing Docker file ${filename}: ${error}`)
    return []
  }
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  filename: string,
  ref: 'base' | 'head',
  prNumber: number,
): Promise<string | null> {
  try {
    const {data: pr} = await octokit.rest.pulls.get({owner, repo, pull_number: prNumber})
    const sha = ref === 'base' ? pr.base.sha : pr.head.sha
    const {data: fileData} = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filename,
      ref: sha,
    })
    return 'content' in fileData && fileData.content != null
      ? Buffer.from(fileData.content, 'base64').toString('utf8')
      : null
  } catch {
    return null
  }
}

function isDockerfile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase()
  return (
    lowerFilename.includes('dockerfile') ||
    lowerFilename.endsWith('.dockerfile') ||
    path.basename(lowerFilename) === 'dockerfile'
  )
}

function isDockerCompose(filename: string): boolean {
  const lowerFilename = filename.toLowerCase()
  return (
    lowerFilename.includes('docker-compose') ||
    lowerFilename.includes('compose.yaml') ||
    lowerFilename.includes('compose.yml')
  )
}

function parseDockerfileContent(content: string): DockerImageReference[] {
  return parseDockerfile(content, imageRef => parseImageReferenceValue(imageRef))
}

function parseDockerComposeContent(content: string): DockerImageReference[] {
  return parseDockerCompose(content, imageRef => parseImageReferenceValue(imageRef))
}

function parseImageReferenceValue(imageRef: string): DockerImageReference | null {
  return parseImageReference(imageRef)
}

function calculateDockerSemverImpact(
  oldTag?: string,
  newTag?: string,
): DockerDependencyChange['semverImpact'] {
  return calculateSemverImpact(oldTag, newTag)
}

function createDependencyChange(
  baseImage: DockerImageReference,
  headImage: DockerImageReference,
  filename: string,
  manager: RenovateManagerType,
): DockerDependencyChange | null {
  try {
    const isDigestUpdate = isDigest(baseImage.tag) || isDigest(headImage.tag)
    const semverImpact = calculateDockerSemverImpact(baseImage.tag, headImage.tag)
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

function compareDockerImageSets(
  baseImages: DockerImageReference[],
  headImages: DockerImageReference[],
  filename: string,
  manager: 'dockerfile' | 'docker-compose',
): DockerDependencyChange[] {
  return compareDockerImages(baseImages, headImages, filename, manager, (baseImage, headImage) =>
    createDependencyChange(baseImage, headImage, filename, manager),
  )
}

export const dockerInternals = {
  isDockerFile,
  parseImageReference: parseImageReferenceValue,
  parseDockerfile: parseDockerfileContent,
  parseDockerCompose: parseDockerComposeContent,
  calculateSemverImpact: calculateDockerSemverImpact,
  createDependencyChange,
}
