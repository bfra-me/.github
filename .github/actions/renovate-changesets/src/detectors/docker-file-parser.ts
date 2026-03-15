import type {DockerImageReference} from './docker-detector-types.js'

type ImageReferenceParser = (imageRef: string) => DockerImageReference | null

export function parseDockerfile(
  content: string,
  parseReference: ImageReferenceParser = parseImageReference,
): DockerImageReference[] {
  const images: DockerImageReference[] = []

  content.split('\n').forEach((lineContent, index) => {
    const line = lineContent.trim()
    const lineNumber = index + 1

    if (line.length === 0 || line.startsWith('#')) {
      return
    }

    if (line.toLowerCase().startsWith('from ')) {
      const imageRef = extractFromImageReference(line)
      if (imageRef != null) {
        const parsedImage = parseReference(imageRef)
        if (parsedImage != null) {
          images.push({...parsedImage, line: lineNumber, context: 'FROM'})
        }
      }
    }

    if (line.toLowerCase().startsWith('copy ') && line.includes('--from=')) {
      const fromMatch = line.match(/--from=(\S+)/)
      const imageRef = fromMatch?.[1]
      if (imageRef != null && !/^\d+$/.test(imageRef) && imageRef.includes(':')) {
        const parsedImage = parseReference(imageRef)
        if (parsedImage != null) {
          images.push({...parsedImage, line: lineNumber, context: 'COPY --from'})
        }
      }
    }
  })

  return images
}

export function parseImageReference(imageRef: string): DockerImageReference | null {
  try {
    const normalizedReference = imageRef.replaceAll(/["']/g, '')
    const digestMatch = normalizedReference.match(/^(.+)@(sha256:[a-f0-9]{64})$/)
    if (digestMatch?.[1] != null && digestMatch[2] != null) {
      return {
        ...parseImageName(digestMatch[1]),
        tag: digestMatch[2],
        fullReference: normalizedReference,
      }
    }

    const tagMatch = normalizedReference.match(/^(.+):([^:]+)$/)
    if (tagMatch?.[1] != null && tagMatch[2] != null) {
      return {
        ...parseImageName(tagMatch[1]),
        tag: tagMatch[2],
        fullReference: normalizedReference,
      }
    }

    return {
      ...parseImageName(normalizedReference),
      tag: 'latest',
      fullReference: `${normalizedReference}:latest`,
    }
  } catch (error) {
    console.warn(`Failed to parse image reference ${imageRef}: ${error}`)
    return null
  }
}

function extractFromImageReference(line: string): string | null {
  const parts = line.split(/\s+/)
  let imageRef: string | null = null

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index]
    if (part != null && !part.startsWith('--')) {
      imageRef = part
      break
    }
  }

  if (imageRef == null) {
    return null
  }

  const asIndex = imageRef.toLowerCase().indexOf(' as ')
  return asIndex === -1 ? imageRef : imageRef.slice(0, asIndex)
}

function parseImageName(imageName: string): {registry?: string; namespace?: string; name: string} {
  if (imageName.includes('.') && imageName.includes('/')) {
    const parts = imageName.split('/')
    const firstPart = parts[0]
    if (parts.length >= 2 && firstPart?.includes('.') === true) {
      const registry = firstPart
      const remainder = parts.slice(1).join('/')

      if (remainder.includes('/')) {
        const namespaceParts = remainder.split('/')
        const namespace = namespaceParts[0]
        const name = namespaceParts.slice(1).join('/')
        if (namespace != null && name.length > 0) {
          return {registry, namespace, name}
        }
      }

      return {registry, name: remainder}
    }
  }

  if (imageName.includes('/')) {
    const parts = imageName.split('/')
    const namespace = parts[0]
    const name = parts[1]
    if (parts.length === 2 && namespace != null && name != null) {
      return {namespace, name}
    }

    if (parts.length > 2) {
      const namespacePart = parts[0]
      const namePart = parts.slice(1).join('/')
      if (namespacePart != null && namePart.length > 0) {
        return {namespace: namespacePart, name: namePart}
      }
    }
  }

  return {name: imageName}
}
