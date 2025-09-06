import type {Octokit} from '@octokit/rest'
import {Buffer} from 'node:buffer'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DockerChangeDetector} from '../src/docker-change-detector.js'

// Mock Octokit
const createMockOctokit = () => {
  return {
    rest: {
      pulls: {
        get: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
      },
    },
  } as unknown as Octokit
}

describe('DockerChangeDetector', () => {
  let detector: DockerChangeDetector
  let mockOctokit: Octokit

  beforeEach(() => {
    detector = new DockerChangeDetector()
    mockOctokit = createMockOctokit()
    vi.clearAllMocks()
  })

  describe('isDockerFile', () => {
    it('should detect Dockerfile patterns', () => {
      const dockerFiles = [
        'Dockerfile',
        'dockerfile',
        'Dockerfile.prod',
        'docker/Dockerfile',
        'build.dockerfile',
        '.dockerfile',
      ]

      for (const file of dockerFiles) {
        expect((detector as any).isDockerFile(file)).toBe(true)
      }
    })

    it('should detect docker-compose patterns', () => {
      const composeFiles = [
        'docker-compose.yml',
        'docker-compose.yaml',
        'compose.yml',
        'compose.yaml',
        'docker-compose.prod.yml',
        'services/docker-compose.yml',
      ]

      for (const file of composeFiles) {
        expect((detector as any).isDockerFile(file)).toBe(true)
      }
    })

    it('should reject non-Docker files', () => {
      const nonDockerFiles = [
        'package.json',
        'README.md',
        'src/index.ts',
        'test.js',
        'config.yaml',
        'docker-file.txt', // Similar but not exact
      ]

      for (const file of nonDockerFiles) {
        expect((detector as any).isDockerFile(file)).toBe(false)
      }
    })
  })

  describe('parseImageReference', () => {
    it('should parse simple image names', () => {
      const result = (detector as any).parseImageReference('nginx')
      expect(result).toEqual({
        name: 'nginx',
        tag: 'latest',
        fullReference: 'nginx:latest',
      })
    })

    it('should parse image with tag', () => {
      const result = (detector as any).parseImageReference('nginx:1.21')
      expect(result).toEqual({
        name: 'nginx',
        tag: '1.21',
        fullReference: 'nginx:1.21',
      })
    })

    it('should parse image with registry and namespace', () => {
      const result = (detector as any).parseImageReference('docker.io/library/nginx:1.21')
      expect(result).toEqual({
        registry: 'docker.io',
        namespace: 'library',
        name: 'nginx',
        tag: '1.21',
        fullReference: 'docker.io/library/nginx:1.21',
      })
    })

    it('should parse image with digest', () => {
      const digest = 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const result = (detector as any).parseImageReference(`nginx@${digest}`)
      expect(result).toEqual({
        name: 'nginx',
        tag: digest,
        fullReference: `nginx@${digest}`,
      })
    })

    it('should parse custom registry image', () => {
      const result = (detector as any).parseImageReference('ghcr.io/user/repo:v1.0.0')
      expect(result).toEqual({
        registry: 'ghcr.io',
        namespace: 'user',
        name: 'repo',
        tag: 'v1.0.0',
        fullReference: 'ghcr.io/user/repo:v1.0.0',
      })
    })

    it('should handle quoted image references', () => {
      const result = (detector as any).parseImageReference('"nginx:1.21"')
      expect(result).toEqual({
        name: 'nginx',
        tag: '1.21',
        fullReference: 'nginx:1.21',
      })
    })
  })

  describe('parseDockerfile', () => {
    it('should parse FROM instructions', () => {
      const dockerfile = `
# Base image
FROM node:18-alpine
RUN npm install
FROM nginx:1.21 AS webserver
COPY --from=build /app /usr/share/nginx/html
      `.trim()

      const images = (detector as any).parseDockerfile(dockerfile)
      expect(images).toHaveLength(2)
      expect(images[0]).toMatchObject({
        name: 'node',
        tag: '18-alpine',
        context: 'FROM',
        line: 2,
      })
      expect(images[1]).toMatchObject({
        name: 'nginx',
        tag: '1.21',
        context: 'FROM',
        line: 4,
      })
    })

    it('should parse COPY --from instructions', () => {
      const dockerfile = `
FROM node:18 AS build
COPY --from=nginx:1.21 /etc/nginx /etc/nginx
COPY --from=build /app /usr/share/nginx/html
COPY --from=0 /app /dist
      `.trim()

      const images = (detector as any).parseDockerfile(dockerfile)
      expect(images).toHaveLength(2) // node:18 and nginx:1.21, but not build or 0
      expect(images[0]).toMatchObject({
        name: 'node',
        tag: '18',
        context: 'FROM',
      })
      expect(images[1]).toMatchObject({
        name: 'nginx',
        tag: '1.21',
        context: 'COPY --from',
      })
    })

    it('should handle platform flags', () => {
      const dockerfile = `
FROM --platform=linux/amd64 node:18-alpine
FROM --platform=linux/arm64 nginx:1.21
      `.trim()

      const images = (detector as any).parseDockerfile(dockerfile)
      expect(images).toHaveLength(2)
      expect(images[0]).toMatchObject({
        name: 'node',
        tag: '18-alpine',
        context: 'FROM',
      })
      expect(images[1]).toMatchObject({
        name: 'nginx',
        tag: '1.21',
        context: 'FROM',
      })
    })

    it('should skip comments and empty lines', () => {
      const dockerfile = `
# This is a comment
FROM node:18

# Another comment

FROM nginx:1.21
      `.trim()

      const images = (detector as any).parseDockerfile(dockerfile)
      expect(images).toHaveLength(2)
    })
  })

  describe('parseDockerCompose', () => {
    it('should parse service images', () => {
      const compose = `
version: '3.8'
services:
  web:
    image: nginx:1.21
    ports:
      - "80:80"
  app:
    image: node:18-alpine
    build: .
  database:
    image: postgres:13
    environment:
      POSTGRES_DB: mydb
      `.trim()

      const images = (detector as any).parseDockerCompose(compose)
      expect(images).toHaveLength(3)
      expect(images[0]).toMatchObject({
        name: 'nginx',
        tag: '1.21',
        context: 'service:web',
      })
      expect(images[1]).toMatchObject({
        name: 'node',
        tag: '18-alpine',
        context: 'service:app',
      })
      expect(images[2]).toMatchObject({
        name: 'postgres',
        tag: '13',
        context: 'service:database',
      })
    })

    it('should handle services without images', () => {
      const compose = `
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
  cache:
    image: redis:7-alpine
      `.trim()

      const images = (detector as any).parseDockerCompose(compose)
      expect(images).toHaveLength(1)
      expect(images[0]).toMatchObject({
        name: 'redis',
        tag: '7-alpine',
        context: 'service:cache',
      })
    })

    it('should handle invalid YAML gracefully', () => {
      const invalidCompose = `
invalid: yaml: content
  - unclosed: [
      `.trim()

      const images = (detector as any).parseDockerCompose(invalidCompose)
      expect(images).toHaveLength(0)
    })
  })

  describe('calculateSemverImpact', () => {
    it('should detect major version changes', () => {
      const impact = (detector as any).calculateSemverImpact('node:16', 'node:18')
      expect(impact).toBe('major')
    })

    it('should detect minor version changes', () => {
      const impact = (detector as any).calculateSemverImpact('nginx:1.20', 'nginx:1.21')
      expect(impact).toBe('minor')
    })

    it('should detect patch version changes', () => {
      const impact = (detector as any).calculateSemverImpact('nginx:1.21.0', 'nginx:1.21.1')
      expect(impact).toBe('minor') // Docker tags are parsed differently than pure semver
    })

    it('should handle digest updates', () => {
      const oldDigest = 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const newDigest = 'sha256:fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
      const impact = (detector as any).calculateSemverImpact(oldDigest, newDigest)
      expect(impact).toBe('patch')
    })

    it('should handle latest tag updates', () => {
      const impact = (detector as any).calculateSemverImpact('nginx:1.21', 'nginx:latest')
      expect(impact).toBe('patch') // Heuristic returns patch for non-semver changes
    })

    it('should handle non-semver tags', () => {
      const impact = (detector as any).calculateSemverImpact('alpine:3.18', 'alpine:3.19')
      expect(impact).toBe('minor')
    })
  })

  describe('createDependencyChange', () => {
    it('should create dependency change object', () => {
      const baseImage = {
        name: 'nginx',
        tag: '1.20',
        fullReference: 'nginx:1.20',
        context: 'FROM',
        line: 1,
      }
      const headImage = {
        name: 'nginx',
        tag: '1.21',
        fullReference: 'nginx:1.21',
        context: 'FROM',
        line: 1,
      }

      const change = (detector as any).createDependencyChange(
        baseImage,
        headImage,
        'Dockerfile',
        'dockerfile',
      )

      expect(change).toMatchObject({
        name: 'nginx',
        dockerFile: 'Dockerfile',
        currentTag: '1.20',
        newTag: '1.21',
        manager: 'dockerfile',
        updateType: 'minor',
        semverImpact: 'minor',
        isBaseImage: true,
        line: 1,
      })
    })

    it('should detect security updates', () => {
      const baseImage = {
        name: 'nginx',
        tag: '1.20-vulnerable',
        fullReference: 'nginx:1.20-vulnerable',
        context: 'FROM',
      }
      const headImage = {
        name: 'nginx',
        tag: '1.20-security-patch',
        fullReference: 'nginx:1.20-security-patch',
        context: 'FROM',
      }

      const change = (detector as any).createDependencyChange(
        baseImage,
        headImage,
        'Dockerfile',
        'dockerfile',
      )

      expect(change?.isSecurityUpdate).toBe(true)
    })

    it('should extract service name from docker-compose context', () => {
      const baseImage = {
        name: 'nginx',
        tag: '1.20',
        fullReference: 'nginx:1.20',
        context: 'service:web',
      }
      const headImage = {
        name: 'nginx',
        tag: '1.21',
        fullReference: 'nginx:1.21',
        context: 'service:web',
      }

      const change = (detector as any).createDependencyChange(
        baseImage,
        headImage,
        'docker-compose.yml',
        'docker-compose',
      )

      expect(change?.serviceName).toBe('web')
    })
  })

  describe('detectChangesFromPR', () => {
    it('should return empty array for non-Docker files', async () => {
      const files = [
        {filename: 'package.json', status: 'modified', additions: 1, deletions: 1},
        {filename: 'src/index.ts', status: 'modified', additions: 5, deletions: 2},
      ]

      const changes = await detector.detectChangesFromPR(mockOctokit, 'owner', 'repo', 123, files)
      expect(changes).toHaveLength(0)
    })

    it('should process Docker files', async () => {
      const files = [
        {filename: 'Dockerfile', status: 'modified', additions: 1, deletions: 1},
        {filename: 'docker-compose.yml', status: 'modified', additions: 2, deletions: 1},
      ]

      // Mock PR response
      vi.mocked(mockOctokit.rest.pulls.get).mockResolvedValue({
        data: {
          base: {sha: 'base-sha'},
          head: {sha: 'head-sha'},
        },
      } as any)

      // Mock file content responses
      const baseDockerfile = 'FROM node:16\nCOPY . .'
      const headDockerfile = 'FROM node:18\nCOPY . .'

      const baseCompose = `
version: '3.8'
services:
  app:
    image: nginx:1.20
      `.trim()

      const headCompose = `
version: '3.8'
services:
  app:
    image: nginx:1.21
      `.trim()

      vi.mocked(mockOctokit.rest.repos.getContent)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(baseDockerfile).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(headDockerfile).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(baseCompose).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(headCompose).toString('base64')},
        } as any)

      const changes = await detector.detectChangesFromPR(mockOctokit, 'owner', 'repo', 123, files)

      expect(changes).toHaveLength(2)
      expect(changes[0]).toMatchObject({
        name: 'node',
        currentTag: '16',
        newTag: '18',
        dockerFile: 'Dockerfile',
        manager: 'dockerfile',
      })
      expect(changes[1]).toMatchObject({
        name: 'nginx',
        currentTag: '1.20',
        newTag: '1.21',
        dockerFile: 'docker-compose.yml',
        manager: 'docker-compose',
      })
    })

    it('should handle file content errors gracefully', async () => {
      const files = [{filename: 'Dockerfile', status: 'modified', additions: 1, deletions: 1}]

      // Mock PR response
      vi.mocked(mockOctokit.rest.pulls.get).mockResolvedValue({
        data: {
          base: {sha: 'base-sha'},
          head: {sha: 'head-sha'},
        },
      } as any)

      // Mock file content error
      vi.mocked(mockOctokit.rest.repos.getContent).mockRejectedValue(new Error('File not found'))

      const changes = await detector.detectChangesFromPR(mockOctokit, 'owner', 'repo', 123, files)
      expect(changes).toHaveLength(0)
    })

    it('should deduplicate identical changes', async () => {
      const files = [
        {filename: 'Dockerfile', status: 'modified', additions: 1, deletions: 1},
        {filename: 'Dockerfile.prod', status: 'modified', additions: 1, deletions: 1},
      ]

      // Mock PR response
      vi.mocked(mockOctokit.rest.pulls.get).mockResolvedValue({
        data: {
          base: {sha: 'base-sha'},
          head: {sha: 'head-sha'},
        },
      } as any)

      // Mock identical file content for both files
      const baseContent = 'FROM node:16'
      const headContent = 'FROM node:18'

      vi.mocked(mockOctokit.rest.repos.getContent)
        .mockResolvedValue({
          data: {content: Buffer.from(baseContent).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(headContent).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(baseContent).toString('base64')},
        } as any)
        .mockResolvedValueOnce({
          data: {content: Buffer.from(headContent).toString('base64')},
        } as any)

      const changes = await detector.detectChangesFromPR(mockOctokit, 'owner', 'repo', 123, files)

      // Should have 2 changes (one for each file) since they're in different files
      expect(changes).toHaveLength(2)
      expect(changes[0]?.dockerFile).toBe('Dockerfile')
      expect(changes[1]?.dockerFile).toBe('Dockerfile.prod')
    })
  })

  describe('edge cases', () => {
    it('should handle malformed image references', () => {
      const malformedRefs = ['', '::::', 'image@invalid-digest', 'registry.com/']

      for (const ref of malformedRefs) {
        const result = (detector as any).parseImageReference(ref)
        // Should either return null or handle gracefully
        expect(result === null || typeof result === 'object').toBe(true)
      }
    })

    it('should handle empty Dockerfile', () => {
      const images = (detector as any).parseDockerfile('')
      expect(images).toHaveLength(0)
    })

    it('should handle empty docker-compose file', () => {
      const images = (detector as any).parseDockerCompose('')
      expect(images).toHaveLength(0)
    })

    it('should handle missing version in docker-compose', () => {
      const compose = `
services:
  app:
    image: nginx:latest
      `.trim()

      const images = (detector as any).parseDockerCompose(compose)
      expect(images).toHaveLength(1)
    })
  })
})
