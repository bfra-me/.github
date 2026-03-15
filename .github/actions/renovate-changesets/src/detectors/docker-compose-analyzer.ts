import type {DockerComposeFile, DockerImageReference} from './docker-detector-types.js'
import {load} from 'js-yaml'
import {parseImageReference} from './docker-file-parser.js'

type ImageReferenceParser = (imageRef: string) => DockerImageReference | null

export function parseDockerCompose(
  content: string,
  parseReference: ImageReferenceParser = parseImageReference,
): DockerImageReference[] {
  const images: DockerImageReference[] = []

  try {
    const compose = load(content) as DockerComposeFile
    if (compose.services == null) {
      return images
    }

    for (const [serviceName, service] of Object.entries(compose.services)) {
      if (typeof service.image !== 'string') {
        continue
      }

      const parsedImage = parseReference(service.image)
      if (parsedImage != null) {
        images.push({...parsedImage, context: `service:${serviceName}`})
      }
    }
  } catch {
    console.warn('Failed to parse Docker Compose YAML')
  }

  return images
}
