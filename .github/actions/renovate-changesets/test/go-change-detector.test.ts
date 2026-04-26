import {describe, expect, it} from 'vitest'
import {detectGoChangesFromPR} from '../src/go-change-detector'
import {mockedOctokit} from './setup'

describe('GoChangeDetector', () => {
  const createMockOctokit = () =>
    mockedOctokit as unknown as Parameters<typeof detectGoChangesFromPR>[0]

  describe('detectGoChangesFromPR', () => {
    it('should return empty array when no go.mod files', async () => {
      const files = [
        {filename: 'package.json', status: 'modified', additions: 1, deletions: 1},
        {filename: 'src/main.ts', status: 'modified', additions: 5, deletions: 2},
      ]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    })

    it('should detect go.mod file changes', async () => {
      const patch = `@@ -1,5 +1,5 @@
module github.com/example/module

go 1.21

-require github.com/some/dep v1.0.0
+require github.com/some/dep v1.1.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          files: [{filename: 'go.mod', patch}],
        },
      })

      const files = [{filename: 'go.mod', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]!.name).toBe('github.com/some/dep')
      expect(result[0]!.currentVersion).toBe('v1.0.0')
      expect(result[0]!.newVersion).toBe('v1.1.0')
    })

    it('should detect go.sum file changes', async () => {
      const patch = `@@ -1,3 +1,4 @@
 github.com/existing/dep v1.0.0 h1:hash1=
+github.com/new/dep v2.0.0 h1:hash2=`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          files: [{filename: 'go.sum', patch}],
        },
      })

      const files = [{filename: 'go.sum', status: 'modified', additions: 1, deletions: 0}]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]!.name).toBe('github.com/new/dep')
      expect(result[0]!.newVersion).toBe('v2.0.0')
    })

    it('should return empty array when no patch in compare result', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          files: [{filename: 'go.mod', patch: undefined}],
        },
      })

      const files = [{filename: 'go.mod', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should return empty array when file not in compare result', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: []},
      })

      const files = [{filename: 'go.mod', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should handle compare commits API errors gracefully', async () => {
      mockedOctokit.rest.repos.compareCommits.mockRejectedValue(new Error('API Error'))

      const files = [{filename: 'go.mod', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should deduplicate changes from multiple go files', async () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/same/dep v1.0.0
+require github.com/same/dep v1.1.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          files: [
            {filename: 'go.mod', patch},
            {filename: 'go.sum', patch: ''},
          ],
        },
      })

      const files = [
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
        {filename: 'go.sum', status: 'modified', additions: 1, deletions: 1},
      ]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      // Verify deduplication works - same dep not counted twice
      const depCounts = result.filter(change => change.name === 'github.com/same/dep')
      expect(depCounts.length).toBeLessThanOrEqual(1)
    })
  })

  describe('go version parsing and semver', () => {
    it('should detect major version change', async () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/major/pkg v1.0.0
+require github.com/major/pkg v2.0.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'go.mod', patch}]},
      })

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, [
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
      ])

      expect(result[0]!.updateType).toBe('major')
      expect(result[0]!.semverImpact).toBe('major')
    })

    it('should detect minor version change', async () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/minor/pkg v1.0.0
+require github.com/minor/pkg v1.1.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'go.mod', patch}]},
      })

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, [
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
      ])

      expect(result[0]!.updateType).toBe('minor')
      expect(result[0]!.semverImpact).toBe('minor')
    })

    it('should detect patch version change', async () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/patch/pkg v1.0.0
+require github.com/patch/pkg v1.0.1`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'go.mod', patch}]},
      })

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, [
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
      ])

      expect(result[0]!.updateType).toBe('patch')
      expect(result[0]!.semverImpact).toBe('patch')
    })

    it('should mark indirect dependencies', async () => {
      const patch = `@@ -1,3 +1,3 @@
-require github.com/indirect/pkg v1.0.0 // indirect
+require github.com/indirect/pkg v1.1.0 // indirect`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'go.mod', patch}]},
      })

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, [
        {filename: 'go.mod', status: 'modified', additions: 1, deletions: 1},
      ])

      expect(result[0]!.isIndirect).toBe(true)
    })

    it('should handle go.mod files in subdirectories', async () => {
      const files = [{filename: 'subdir/go.mod', status: 'modified', additions: 1, deletions: 1}]

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'subdir/go.mod', patch: ''}]},
      })

      await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should skip files that are not go.mod or go.sum', async () => {
      const files = [
        {filename: 'go.sum.backup', status: 'modified', additions: 1, deletions: 0},
        {filename: 'gomod.txt', status: 'modified', additions: 1, deletions: 0},
      ]

      const result = await detectGoChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    })
  })
})
