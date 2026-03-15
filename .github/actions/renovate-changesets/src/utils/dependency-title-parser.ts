export function extractDependenciesFromTitle(title: string): string[] {
  const patterns = [
    /update action ([\w\-./@]+)/gi,
    /update (?:dependency )?(?!action\s)([\w\-./@]+)/gi,
    /bump ([\w\-./@]+)/gi,
  ]

  const dependencies: string[] = []
  for (const pattern of patterns) {
    const matches = [...title.matchAll(pattern)]
    for (const match of matches) {
      if (match[1] && !dependencies.includes(match[1])) {
        dependencies.push(match[1])
      }
    }
  }

  return dependencies
}
