import type {Config} from '../action-config'
import type {RenovateParser} from '../renovate-parser'
import {matchesPatterns} from './file-pattern-matcher'

export function isValidBranch(
  branchName: string,
  branchPrefix: string,
  skipBranchPrefixCheck: boolean,
  parser: RenovateParser,
): boolean {
  if (skipBranchPrefixCheck) {
    return true
  }

  return parser.isRenovateBranch(branchName) || branchName.startsWith(branchPrefix)
}

export function detectUpdateType(changedFiles: string[], config: Config): string | undefined {
  for (const [updateType, settings] of Object.entries(config.updateTypes)) {
    if (changedFiles.some(file => matchesPatterns(file, settings.filePatterns))) {
      return updateType
    }
  }
  return undefined
}
