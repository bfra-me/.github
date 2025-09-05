import type {Octokit} from '@octokit/rest'
import type {RenovateManagerType, RenovateUpdateType} from './renovate-parser.js'
import {Buffer} from 'node:buffer'
import path from 'node:path'
import {load} from 'js-yaml'

/**
 * Docker image reference structure
 */
export interface DockerImageReference {
  /** Registry URL (e.g., 'docker.io', 'ghcr.io', 'quay.io') */
  registry?: string
  /** Namespace/organization (e.g., 'library', 'actions') */
  namespace?: string
  /** Image name (e.g., 'node', 'ubuntu') */
  name: string
  /** Image tag or digest (e.g., '18-alpine', 'sha256:abc123...') */
  tag?: string
  /** Full image reference string */
  fullReference: string
  /** Line number in the file */
  line?: number
  /** Context (FROM, image, etc.) */
  context?: string
}

/**
 * Dockerfile instruction structure
 */
export interface DockerfileInstruction {
  /** Instruction type (FROM, COPY, RUN, etc.) */
  instruction: string
  /** Arguments to the instruction */
  args: string[]
  /** Line number in Dockerfile */
  line: number
  /** Raw line content */
  content: string
}

/**
 * Docker Compose service structure
 */
export interface DockerComposeService {
  /** Service name */
  name: string
  /** Image reference if specified */
  image?: string
  /** Build context if specified */
  build?: string | {context: string; dockerfile?: string; [key: string]: any}
  /** Other service properties */
  [key: string]: any
}

/**
 * Docker Compose structure for parsing
 */
export interface DockerComposeFile {
  /** Version of docker-compose format */
  version?: string
  /** Services definition */
  services?: Record<string, DockerComposeService>
  [key: string]: any
}

/**
 * Docker dependency change
 */
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

/**
 * Docker version components for semantic versioning
 */
interface DockerVersion {
  major?: number
  minor?: number
  patch?: number
  prerelease?: string
  build?: string
  original: string
  isDigest: boolean
  isLatest: boolean
  isNumeric: boolean
}

/**
 * TASK-016: Docker image update detection
 *
 * This class provides sophisticated analysis of Docker dependency changes by parsing
 * Dockerfile and docker-compose.yml files and performing version impact assessment for image references.
 */
export class DockerChangeDetector {
  /**
   * Detect Docker dependency changes from GitHub PR files
   */
  async detectChangesFromPR(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    files: {filename: string; status: string; additions: number; deletions: number}[],
  ): Promise<DockerDependencyChange[]> {
    const changes: DockerDependencyChange[] = []

    // Find all Docker-related files that changed
    const dockerFiles = files.filter(file => this.isDockerFile(file.filename))

    if (dockerFiles.length === 0) {
      return changes
    }

    // Process each Docker file
    for (const file of dockerFiles) {
      try {
        const fileChanges = await this.analyzeDockerFile(
          octokit,
          owner,
          repo,
          prNumber,
          file.filename,
        )
        changes.push(...fileChanges)
      } catch (error) {
        // Log error but continue processing other files
        console.warn(`Failed to analyze Docker file ${file.filename}: ${error}`)
      }
    }

    // Deduplicate changes based on name, file, and version
    return this.deduplicateChanges(changes)
  }

  /**
   * Check if a file is Docker-related
   */
  private isDockerFile(filename: string): boolean {
    const lowerFilename = filename.toLowerCase()

    // Dockerfile patterns
    if (
      lowerFilename.includes('dockerfile') ||
      lowerFilename.endsWith('.dockerfile') ||
      path.basename(lowerFilename) === 'dockerfile'
    ) {
      return true
    }

    // Docker Compose patterns
    if (
      lowerFilename.includes('docker-compose') ||
      lowerFilename.includes('compose.yaml') ||
      lowerFilename.includes('compose.yml')
    ) {
      return true
    }

    return false
  }

  /**
   * Analyze a single Docker file for dependency changes
   */
  private async analyzeDockerFile(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    filename: string,
  ): Promise<DockerDependencyChange[]> {
    const changes: DockerDependencyChange[] = []

    try {
      // Get file contents from both base and head commits
      const [baseContent, headContent] = await Promise.all([
        this.getFileContent(octokit, owner, repo, filename, 'base', prNumber),
        this.getFileContent(octokit, owner, repo, filename, 'head', prNumber),
      ])

      if (!baseContent || !headContent) {
        // File might be new or deleted, skip analysis
        return changes
      }

      // Determine file type and parse accordingly
      if (this.isDockerfile(filename)) {
        const baseImages = this.parseDockerfile(baseContent)
        const headImages = this.parseDockerfile(headContent)
        changes.push(...this.compareDockerImages(baseImages, headImages, filename, 'dockerfile'))
      } else if (this.isDockerCompose(filename)) {
        const baseImages = this.parseDockerCompose(baseContent)
        const headImages = this.parseDockerCompose(headContent)
        changes.push(
          ...this.compareDockerImages(baseImages, headImages, filename, 'docker-compose'),
        )
      }
    } catch (error) {
      console.warn(`Error analyzing Docker file ${filename}: ${error}`)
    }

    return changes
  }

  /**
   * Get file content from GitHub API
   */
  private async getFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    filename: string,
    ref: 'base' | 'head',
    prNumber: number,
  ): Promise<string | null> {
    try {
      // Get PR details to determine the correct refs
      const {data: pr} = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })

      const sha = ref === 'base' ? pr.base.sha : pr.head.sha

      const {data: fileData} = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filename,
        ref: sha,
      })

      if ('content' in fileData && fileData.content) {
        return Buffer.from(fileData.content, 'base64').toString('utf8')
      }
    } catch {
      // File might not exist in this ref
      return null
    }

    return null
  }

  /**
   * Check if file is a Dockerfile
   */
  private isDockerfile(filename: string): boolean {
    const lowerFilename = filename.toLowerCase()
    return (
      lowerFilename.includes('dockerfile') ||
      lowerFilename.endsWith('.dockerfile') ||
      path.basename(lowerFilename) === 'dockerfile'
    )
  }

  /**
   * Check if file is a Docker Compose file
   */
  private isDockerCompose(filename: string): boolean {
    const lowerFilename = filename.toLowerCase()
    return (
      lowerFilename.includes('docker-compose') ||
      lowerFilename.includes('compose.yaml') ||
      lowerFilename.includes('compose.yml')
    )
  }

  /**
   * Parse Dockerfile content to extract image references
   */
  private parseDockerfile(content: string): DockerImageReference[] {
    const images: DockerImageReference[] = []
    const lines = content.split('\n')

    lines.forEach((lineContent, index) => {
      const line = lineContent.trim()
      const lineNumber = index + 1

      // Skip comments and empty lines
      if (line.startsWith('#') || !line) {
        return
      }

      // Parse FROM instructions - use simple regex
      if (line.toLowerCase().startsWith('from ')) {
        const parts = line.split(/\s+/)
        let imageRef = ''

        // Find the image reference (skip --platform if present)
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i]
          if (part && !part.startsWith('--')) {
            imageRef = part
            break
          }
        }

        // Remove AS clause if present
        const asIndex = imageRef.toLowerCase().indexOf(' as ')
        if (asIndex !== -1) {
          imageRef = imageRef.slice(0, asIndex)
        }

        if (imageRef) {
          const parsedImage = this.parseImageReference(imageRef)
          if (parsedImage) {
            images.push({
              ...parsedImage,
              line: lineNumber,
              context: 'FROM',
            })
          }
        }
      }

      // Parse COPY --from instructions
      if (line.toLowerCase().startsWith('copy ') && line.includes('--from=')) {
        const fromMatch = line.match(/--from=(\S+)/)
        if (fromMatch?.[1]) {
          const imageRef = fromMatch[1]
          // Skip if it's just a stage name (number or simple identifier)
          if (!/^\d+$/.test(imageRef) && imageRef.includes(':')) {
            const parsedImage = this.parseImageReference(imageRef)
            if (parsedImage) {
              images.push({
                ...parsedImage,
                line: lineNumber,
                context: 'COPY --from',
              })
            }
          }
        }
      }
    })

    return images
  }

  /**
   * Parse Docker Compose content to extract image references
   */
  private parseDockerCompose(content: string): DockerImageReference[] {
    const images: DockerImageReference[] = []

    try {
      const compose = load(content) as DockerComposeFile

      if (!compose || !compose.services) {
        return images
      }

      for (const [serviceName, service] of Object.entries(compose.services)) {
        if (service.image) {
          const parsedImage = this.parseImageReference(service.image)
          if (parsedImage) {
            images.push({
              ...parsedImage,
              context: `service:${serviceName}`,
            })
          }
        }
      }
    } catch {
      console.warn('Failed to parse Docker Compose YAML')
    }

    return images
  }

  /**
   * Parse a Docker image reference string
   */
  private parseImageReference(imageRef: string): DockerImageReference | null {
    try {
      // Remove quotes if present
      imageRef = imageRef.replaceAll(/["']/g, '')

      // Handle digest format (image@sha256:...)
      const digestMatch = imageRef.match(/^(.+)@(sha256:[a-f0-9]{64})$/)
      if (digestMatch?.[1] && digestMatch?.[2]) {
        const imagePart = digestMatch[1]
        const digest = digestMatch[2]
        const parsed = this.parseImageName(imagePart)
        return {
          ...parsed,
          tag: digest,
          fullReference: imageRef,
        }
      }

      // Handle tag format (image:tag)
      const tagMatch = imageRef.match(/^(.+):([^:]+)$/)
      if (tagMatch?.[1] && tagMatch?.[2]) {
        const imagePart = tagMatch[1]
        const tag = tagMatch[2]
        const parsed = this.parseImageName(imagePart)
        return {
          ...parsed,
          tag,
          fullReference: imageRef,
        }
      }

      // No tag specified, defaults to 'latest'
      const parsed = this.parseImageName(imageRef)
      return {
        ...parsed,
        tag: 'latest',
        fullReference: `${imageRef}:latest`,
      }
    } catch (error) {
      console.warn(`Failed to parse image reference ${imageRef}: ${error}`)
      return null
    }
  }

  /**
   * Parse image name to extract registry, namespace, and name
   */
  private parseImageName(imageName: string): {registry?: string; namespace?: string; name: string} {
    // Handle registry prefix (registry.com/namespace/image) - simplified to avoid backtracking
    if (imageName.includes('.') && imageName.includes('/')) {
      const parts = imageName.split('/')
      const firstPart = parts[0]
      if (parts.length >= 2 && firstPart?.includes('.')) {
        const registry = firstPart
        const remainder = parts.slice(1).join('/')

        if (remainder.includes('/')) {
          const namespaceParts = remainder.split('/')
          const namespace = namespaceParts[0]
          const name = namespaceParts.slice(1).join('/')
          if (namespace && name) {
            return {
              registry,
              namespace,
              name,
            }
          }
        }
        return {
          registry,
          name: remainder,
        }
      }
    }

    // Handle namespace/image format
    if (imageName.includes('/')) {
      const parts = imageName.split('/')
      const namespace = parts[0]
      const name = parts[1]
      if (parts.length === 2 && namespace && name) {
        return {
          namespace,
          name,
        }
      } else if (parts.length > 2) {
        const namespacePart = parts[0]
        const namePart = parts.slice(1).join('/')
        if (namespacePart && namePart) {
          return {
            namespace: namespacePart,
            name: namePart,
          }
        }
      }
    }

    // Just image name
    return {
      name: imageName,
    }
  }

  /**
   * Compare Docker images between base and head to find changes
   */
  private compareDockerImages(
    baseImages: DockerImageReference[],
    headImages: DockerImageReference[],
    filename: string,
    manager: 'dockerfile' | 'docker-compose',
  ): DockerDependencyChange[] {
    const changes: DockerDependencyChange[] = []

    // Create lookup maps for efficient comparison
    const baseImageMap = new Map<string, DockerImageReference>()
    const headImageMap = new Map<string, DockerImageReference>()

    for (const image of baseImages) {
      const key = this.getImageKey(image)
      baseImageMap.set(key, image)
    }

    for (const image of headImages) {
      const key = this.getImageKey(image)
      headImageMap.set(key, image)
    }

    // Find changes by comparing head images with base images
    for (const [key, headImage] of headImageMap) {
      const baseImage = baseImageMap.get(key)

      if (!baseImage) {
        // New image added
        continue
      }

      // Check if tags are different
      if (baseImage.tag !== headImage.tag) {
        const change = this.createDependencyChange(
          baseImage,
          headImage,
          filename,
          manager as RenovateManagerType,
        )
        if (change) {
          changes.push(change)
        }
      }
    }

    return changes
  }

  /**
   * Create a unique key for image comparison
   */
  private getImageKey(image: DockerImageReference): string {
    const parts: string[] = []
    if (image.registry) parts.push(image.registry)
    if (image.namespace) parts.push(image.namespace)
    parts.push(image.name)
    if (image.context) parts.push(image.context)
    return parts.join('/')
  }

  /**
   * Create a dependency change object
   */
  private createDependencyChange(
    baseImage: DockerImageReference,
    headImage: DockerImageReference,
    filename: string,
    manager: RenovateManagerType,
  ): DockerDependencyChange | null {
    try {
      const isDigestUpdate = this.isDigest(baseImage.tag) || this.isDigest(headImage.tag)
      const semverImpact = this.calculateSemverImpact(baseImage.tag, headImage.tag)
      const updateType = this.determineUpdateType(semverImpact, isDigestUpdate)

      // Determine if this is a security update based on common patterns
      const isSecurityUpdate = this.detectSecurityUpdate(baseImage.tag, headImage.tag)

      // Determine if this is a base image (FROM instruction)
      const isBaseImage = baseImage.context === 'FROM'

      const imageName = this.getFullImageName(headImage)

      return {
        name: imageName,
        dockerFile: filename,
        currentTag: baseImage.tag,
        newTag: headImage.tag,
        currentDigest: this.isDigest(baseImage.tag) ? baseImage.tag : undefined,
        newDigest: this.isDigest(headImage.tag) ? headImage.tag : undefined,
        registry: headImage.registry,
        manager,
        updateType,
        semverImpact,
        isSecurityUpdate,
        scope: headImage.namespace,
        context: headImage.context,
        line: headImage.line,
        isDigestUpdate,
        isBaseImage,
        serviceName: this.extractServiceName(headImage.context),
      }
    } catch (error) {
      console.warn(`Failed to create dependency change: ${error}`)
      return null
    }
  }

  /**
   * Get full image name for display
   */
  private getFullImageName(image: DockerImageReference): string {
    const parts: string[] = []
    if (image.registry && image.registry !== 'docker.io') {
      parts.push(image.registry)
    }
    if (image.namespace) {
      parts.push(image.namespace)
    }
    parts.push(image.name)
    return parts.join('/')
  }

  /**
   * Extract service name from context
   */
  private extractServiceName(context?: string): string | undefined {
    if (context && context.startsWith('service:')) {
      return context.slice(8)
    }
    return undefined
  }

  /**
   * Check if a tag is a digest
   */
  private isDigest(tag?: string): boolean {
    return tag ? tag.startsWith('sha256:') : false
  }

  /**
   * Calculate semantic version impact
   */
  private calculateSemverImpact(
    oldTag?: string,
    newTag?: string,
  ): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
    if (!oldTag || !newTag) {
      return 'none'
    }

    // Handle digest updates
    if (this.isDigest(oldTag) || this.isDigest(newTag)) {
      return 'patch' // Digest updates are typically patch-level
    }

    // Parse version information
    const oldVersion = this.parseDockerVersion(oldTag)
    const newVersion = this.parseDockerVersion(newTag)

    // If we can't parse as semantic versions, use heuristics
    if (!oldVersion.isNumeric || !newVersion.isNumeric) {
      return this.heuristicVersionImpact(oldTag, newTag)
    }

    // Compare semantic versions
    if (
      oldVersion.major !== undefined &&
      newVersion.major !== undefined &&
      newVersion.major > oldVersion.major
    ) {
      return 'major'
    }

    if (
      oldVersion.minor !== undefined &&
      newVersion.minor !== undefined &&
      newVersion.minor > oldVersion.minor
    ) {
      return 'minor'
    }

    if (
      oldVersion.patch !== undefined &&
      newVersion.patch !== undefined &&
      newVersion.patch > oldVersion.patch
    ) {
      return 'patch'
    }

    // Check for prerelease
    if (newVersion.prerelease && !oldVersion.prerelease) return 'prerelease'
    if (!newVersion.prerelease && oldVersion.prerelease) return 'patch'

    return 'none'
  }

  /**
   * Parse Docker tag as version
   */
  private parseDockerVersion(tag: string): DockerVersion {
    // Remove common prefixes/suffixes
    let cleanTag = tag.replace(/^v/, '') // Remove 'v' prefix
    const suffixMatch = cleanTag.match(/^([^-]+)(?:-.*)?$/)
    if (suffixMatch?.[1]) {
      cleanTag = suffixMatch[1]
    }

    // Try to parse as semver - simplified regex to avoid backtracking
    const semverMatch = cleanTag.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?(?:\+(.*))?$/)
    if (semverMatch?.[1]) {
      return {
        major: Number.parseInt(semverMatch[1], 10),
        minor: semverMatch[2] ? Number.parseInt(semverMatch[2], 10) : undefined,
        patch: semverMatch[3] ? Number.parseInt(semverMatch[3], 10) : undefined,
        prerelease: semverMatch[4],
        build: semverMatch[5],
        original: tag,
        isDigest: false,
        isLatest: tag === 'latest',
        isNumeric: true,
      }
    }

    return {
      original: tag,
      isDigest: this.isDigest(tag),
      isLatest: tag === 'latest',
      isNumeric: false,
    }
  }

  /**
   * Heuristic version impact assessment for non-semver tags
   */
  private heuristicVersionImpact(oldTag: string, newTag: string): 'major' | 'minor' | 'patch' {
    // Latest updates are typically minor
    if (newTag === 'latest') return 'minor'

    // Check for obvious major version changes in tag names
    const majorPatterns = [
      /(\d+)$/, // Major version only (e.g., "18" -> "20")
      /-(\d+)$/, // Version suffix (e.g., "alpine-3.18" -> "alpine-3.19")
    ]

    for (const pattern of majorPatterns) {
      const oldMatch = oldTag.match(pattern)
      const newMatch = newTag.match(pattern)
      if (oldMatch && newMatch) {
        const oldVersion = Number.parseInt(oldMatch[1] || oldMatch[0], 10)
        const newVersion = Number.parseInt(newMatch[1] || newMatch[0], 10)
        if (newVersion > oldVersion) {
          return newVersion - oldVersion >= 2 ? 'major' : 'minor'
        }
      }
    }

    // Default to patch for tag changes
    return 'patch'
  }

  /**
   * Determine update type based on semver impact
   */
  private determineUpdateType(
    semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none',
    isDigestUpdate: boolean,
  ): RenovateUpdateType {
    if (isDigestUpdate) return 'digest'
    if (semverImpact === 'major') return 'major'
    if (semverImpact === 'minor') return 'minor'
    if (semverImpact === 'patch') return 'patch'
    return 'patch' // Default fallback
  }

  /**
   * Detect if this is likely a security update
   */
  private detectSecurityUpdate(oldTag?: string, newTag?: string): boolean {
    if (!oldTag || !newTag) return false

    // Security indicators in tag names
    const securityPatterns = [/security/i, /cve/i, /patch/i, /fix/i, /vuln/i]

    const combinedTags = `${oldTag} ${newTag}`.toLowerCase()
    return securityPatterns.some(pattern => pattern.test(combinedTags))
  }

  /**
   * Deduplicate changes to avoid duplicate entries
   */
  private deduplicateChanges(changes: DockerDependencyChange[]): DockerDependencyChange[] {
    const seen = new Set<string>()
    const deduplicated: DockerDependencyChange[] = []

    for (const change of changes) {
      const key = `${change.name}:${change.dockerFile}:${change.currentTag}:${change.newTag}`
      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(change)
      }
    }

    return deduplicated
  }
}
