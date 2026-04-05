import {describe, expect, it} from 'vitest'
import {detectJVMChangesFromPR} from '../src/jvm-change-detector'
import {mockedOctokit} from './setup'

describe('JVMChangeDetector', () => {
  const createMockOctokit = () =>
    mockedOctokit as unknown as Parameters<typeof detectJVMChangesFromPR>[0]

  describe('detectJVMChangesFromPR', () => {
    it('should return empty array when no JVM build files', async () => {
      const files = [
        {filename: 'package.json', status: 'modified', additions: 1, deletions: 1},
        {filename: 'requirements.txt', status: 'modified', additions: 1, deletions: 1},
      ]

      const result = await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    })

    it('should detect build.gradle changes', async () => {
      const patch = `@@ -5,5 +5,5 @@
-    implementation 'com.example:library:1.0.0'
+    implementation 'com.example:library:1.1.0'`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'build.gradle', patch}]},
      })

      const files = [{filename: 'build.gradle', status: 'modified', additions: 1, deletions: 1}]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        base: 'refs/pull/1/base',
        head: 'refs/pull/1/head',
      })
    })

    it('should detect build.gradle.kts changes', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'build.gradle.kts', patch: ''}]},
      })

      const files = [
        {filename: 'build.gradle.kts', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect pom.xml changes', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'pom.xml', patch: ''}]},
      })
      mockedOctokit.rest.repos.getContent.mockResolvedValue({
        data: {content: Buffer.from('<project></project>').toString('base64')},
      })

      const files = [{filename: 'pom.xml', status: 'modified', additions: 1, deletions: 1}]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect gradle.properties changes', async () => {
      const patch = `@@ -1,3 +1,3 @@
-dependencyVersion=1.0.0
+dependencyVersion=1.1.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'gradle.properties', patch}]},
      })

      const files = [
        {filename: 'gradle.properties', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should handle API errors gracefully', async () => {
      mockedOctokit.rest.repos.compareCommits.mockRejectedValue(new Error('API error'))

      const files = [{filename: 'build.gradle', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should return empty array when no patch found for file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'build.gradle', patch: undefined}]},
      })

      const files = [{filename: 'build.gradle', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should handle multiple JVM files in a single PR', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {
          files: [
            {filename: 'build.gradle', patch: ''},
            {filename: 'pom.xml', patch: ''},
          ],
        },
      })
      mockedOctokit.rest.repos.getContent.mockResolvedValue({
        data: {content: Buffer.from('<project></project>').toString('base64')},
      })

      const files = [
        {filename: 'build.gradle', status: 'modified', additions: 1, deletions: 1},
        {filename: 'pom.xml', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalledTimes(2)
    })

    it('should detect settings.gradle as JVM build file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'settings.gradle', patch: ''}]},
      })

      const files = [
        {filename: 'settings.gradle', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect build.sbt as JVM build file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'build.sbt', patch: ''}]},
      })

      const files = [{filename: 'build.sbt', status: 'modified', additions: 1, deletions: 1}]

      await detectJVMChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })
  })
})
