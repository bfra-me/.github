import {minimatch} from 'minimatch'

export function matchesPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(filePath, pattern, {dot: true}))
}
