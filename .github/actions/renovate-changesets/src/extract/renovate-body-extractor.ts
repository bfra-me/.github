import type {RenovateManagerType} from '../parser/renovate-parser-types.js'

// Commit SHAs must be matched before the version pattern. The version pattern is unanchored, so
// against a 40-char hex SHA it happily matches stray digit runs — `3d3c42e5...` -> `08c6903c...`
// extracted as `1` -> `08`, which then classified as a major bump. Every action in this repo is
// SHA-pinned, so that mis-parse would hit on every Action digest refresh. The broad hex candidate is
// narrowed by isHexDigestTransition when Renovate does not provide an Update column; that fallback
// excludes pure-digit short values because Docker CalVer tags such as `20240101` -> `20250101` are
// versions. A digest Update column overrides the heuristic, including for all-digit short SHAs.
const HEX_TRANSITION_PATTERN = /`?([0-9a-f]{7,40})`?\s*(?:→|->)\s*`?([0-9a-f]{7,40})`?/iu
const VERSION_TRANSITION_PATTERN =
  /`?v?(\d+(?:\.\d+){0,2}(?:-[\w.]+)?(?:\+[\w.]+)?)`?(?![\dA-Z.-])\s*(?:→|->)\s*`?v?(\d+(?:\.\d+){0,2}(?:-[\w.]+)?(?:\+[\w.]+)?)`?(?![\dA-Z.-])/iu
const MARKDOWN_CONTROL_PATTERN = /([\\`*_[\]()>#!|])/gu
const TABLE_SEPARATOR_PATTERN = /^:?-{3,}:?$/u

const PACKAGE_HEADINGS = new Set(['package', 'package name', 'dependency', 'name'])
const CHANGE_HEADINGS = new Set(['change', 'version', 'version change', 'from/to'])
const UPDATE_HEADINGS = new Set(['update', 'update type'])

export type ExtractedManager = Extract<RenovateManagerType, 'npm' | 'docker' | 'github-actions'>

export interface ExtractedUpdate {
  packageName: string
  currentVersion: string
  newVersion: string
  manager: ExtractedManager
  /** True when both versions are commit SHAs, i.e. a digest pin refresh rather than a release. */
  isDigest: boolean
}

export interface ExtractRenovateUpdatesOptions {
  prNumber: number
  body: string
  branchName: string
  commitMessage?: string
  labels?: string[]
}

export interface ExtractedRenovateUpdates {
  prNumber: number
  branchName: string
  manager: ExtractedManager
  commitMessage?: string
  labels: string[]
  updates: ExtractedUpdate[]
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionError'
  }
}

interface ParsedTable {
  headers: string[]
  rows: string[][]
}

export function extractRenovateUpdates(
  options: ExtractRenovateUpdatesOptions,
): ExtractedRenovateUpdates {
  const manager = inferManagerFromBranch(options.branchName, options.prNumber)
  const table = findDependencyTable(options.body, options.prNumber)
  const packageIndex = findHeadingIndex(table.headers, PACKAGE_HEADINGS)
  const changeIndex = findHeadingIndex(table.headers, CHANGE_HEADINGS)
  const updateIndex = findHeadingIndex(table.headers, UPDATE_HEADINGS)

  if (packageIndex == null || changeIndex == null) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${options.prNumber}: dependency table requires Package and Change headings`,
    )
  }

  if (table.rows.length === 0) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${options.prNumber}: dependency table has no rows`,
    )
  }

  const updates = table.rows.map((row, rowIndex) =>
    parseUpdateRow(
      row,
      rowIndex + 1,
      packageIndex,
      changeIndex,
      updateIndex,
      manager,
      options.prNumber,
    ),
  )

  const extracted: ExtractedRenovateUpdates = {
    prNumber: options.prNumber,
    branchName: options.branchName,
    manager,
    labels: options.labels ?? [],
    updates,
  }

  if (options.commitMessage != null) extracted.commitMessage = options.commitMessage

  return extracted
}

function findDependencyTable(body: string, prNumber: number): ParsedTable {
  const lines = body.replaceAll('\r\n', '\n').split('\n')

  for (let index = 0; index < lines.length - 1; index++) {
    const headerLine = lines[index]
    const separatorLine = lines[index + 1]
    if (headerLine == null || separatorLine == null) continue

    const headers = splitTableRow(headerLine)
    const separator = splitTableRow(separatorLine)

    if (headers == null || separator == null || !isSeparatorRow(separator)) continue

    const rows: string[][] = []
    for (let rowLine = index + 2; rowLine < lines.length; rowLine++) {
      const rowText = lines[rowLine]
      if (rowText == null) break

      const row = splitTableRow(rowText)
      if (row == null) break
      if (!isSeparatorRow(row)) rows.push(row)
    }

    return {headers, rows}
  }

  throw new ExtractionError(
    `Failed to parse Renovate PR #${prNumber}: no recognizable dependency table found`,
  )
}

function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null

  const content = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1)
  return content.split('|').map(cell => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => TABLE_SEPARATOR_PATTERN.test(cell))
}

function findHeadingIndex(headers: string[], expectedHeadings: Set<string>): number | undefined {
  const index = headers.findIndex(header => expectedHeadings.has(normalizeHeading(header)))
  return index === -1 ? undefined : index
}

function normalizeHeading(value: string): string {
  return value.replaceAll(/[`*_]/gu, '').trim().toLowerCase().replaceAll(/\s+/gu, ' ')
}

function parseUpdateRow(
  row: string[],
  rowNumber: number,
  packageIndex: number,
  changeIndex: number,
  updateIndex: number | undefined,
  manager: ExtractedManager,
  prNumber: number,
): ExtractedUpdate {
  const rawPackageName = row[packageIndex]
  const rawChange = row[changeIndex]
  const rawUpdateType = updateIndex == null ? undefined : row[updateIndex]

  if (rawPackageName == null || rawChange == null) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${prNumber} row ${rowNumber}: required cell is missing`,
    )
  }

  const packageName = normalizePackageName(rawPackageName, prNumber, rowNumber)
  const hexTransition = rawChange.match(HEX_TRANSITION_PATTERN)
  const updateType = rawUpdateType?.trim().toLowerCase()
  const digestByUpdateType = updateType === 'digest'
  const hasUsableUpdateType = updateType != null && updateType.length > 0
  const digestByFallback =
    !hasUsableUpdateType && hexTransition != null && isHexDigestTransition(hexTransition)
  const transition = digestByUpdateType
    ? hexTransition
    : digestByFallback
      ? hexTransition
      : rawChange.match(VERSION_TRANSITION_PATTERN)

  if (transition?.[1] == null || transition[2] == null) {
    throw new ExtractionError(`PR #${prNumber} row ${rowNumber} has no valid version transition`)
  }

  return {
    packageName,
    currentVersion: normalizeBodyValue(transition[1], prNumber, rowNumber),
    newVersion: normalizeBodyValue(transition[2], prNumber, rowNumber),
    manager,
    isDigest: digestByUpdateType || digestByFallback,
  }
}

function isHexDigestTransition(transition: RegExpMatchArray): boolean {
  const currentVersion = transition[1]
  const newVersion = transition[2]
  if (currentVersion == null || newVersion == null) return false

  // Without Renovate's Update column, pure-digit pairs are deliberately left as versions: they
  // are indistinguishable from CalVer tags. A full 40-character pair is the exception because a
  // 40-digit version is not credible; otherwise at least one side must contain an a-f letter.
  return (
    (currentVersion.length === 40 && newVersion.length === 40) ||
    /[a-f]/iu.test(`${currentVersion}${newVersion}`)
  )
}

function normalizePackageName(value: string, prNumber: number, rowNumber: number): string {
  const linkMatch = value.trim().match(/^\[([^\]]+)\]\([^)]*\)$/u)
  const unwrapped = linkMatch?.[1] ?? value
  return normalizeBodyValue(unwrapped, prNumber, rowNumber)
}

// Validates but deliberately does not escape. Package names are identifiers first — they are matched
// against workspace package names downstream — so escaping here would corrupt `lint_staged` into
// `lint\_staged` and break that match. Markdown escaping belongs at format time, against the rendered
// string. What this rejects is anything that cannot appear in a legitimate identifier: control
// characters, newlines, absolute paths, traversal sequences, and backslashes.
function normalizeBodyValue(value: string, prNumber: number, rowNumber: number): string {
  const normalized = value.trim()

  if (normalized.length === 0 || hasUnsafeControlCharacters(normalized)) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${prNumber} row ${rowNumber}: value is unsafe`,
    )
  }

  if (normalized.startsWith('/') || normalized.includes('..') || normalized.includes('\\')) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${prNumber} row ${rowNumber}: value is unsafe`,
    )
  }

  return normalized
}

// Escapes a body-derived value for safe interpolation into changeset markdown. Applied at render
// time by the formatter, never at extraction.
export function escapeForMarkdown(value: string): string {
  return value.replaceAll(MARKDOWN_CONTROL_PATTERN, String.raw`\$1`)
}

function hasUnsafeControlCharacters(value: string): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function inferManagerFromBranch(branchName: string, prNumber: number): ExtractedManager {
  const normalizedBranch = branchName.trim().toLowerCase()
  if (!normalizedBranch.startsWith('renovate/')) {
    throw new ExtractionError(
      `Failed to parse Renovate PR #${prNumber}: branch does not identify Renovate`,
    )
  }

  const branchTokens = normalizedBranch.split(/[/_-]+/u)
  if (branchTokens.includes('docker') || branchTokens.includes('container')) return 'docker'
  if (branchTokens.includes('action') || branchTokens.includes('actions')) return 'github-actions'
  return 'npm'
}
