export function sortChangesetReleases(
  releases: {name: string; type: 'patch' | 'minor' | 'major'}[],
): {name: string; type: 'patch' | 'minor' | 'major'}[] {
  return [...releases].sort((a, b) => a.name.localeCompare(b.name))
}
