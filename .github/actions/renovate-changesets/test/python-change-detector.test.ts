import {describe, expect, it} from 'vitest'
import {detectPythonChangesFromPR} from '../src/python-change-detector'
import {mockedOctokit} from './setup'

describe('PythonChangeDetector', () => {
  const createMockOctokit = () =>
    mockedOctokit as unknown as Parameters<typeof detectPythonChangesFromPR>[0]

  describe('detectPythonChangesFromPR', () => {
    it('should return empty array when no Python dependency files', async () => {
      const files = [
        {filename: 'package.json', status: 'modified', additions: 1, deletions: 1},
        {filename: 'src/main.ts', status: 'modified', additions: 5, deletions: 2},
      ]

      const result = await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    })

    it('should detect requirements.txt changes', async () => {
      const patch = `@@ -1,3 +1,3 @@
-requests==2.28.0
+requests==2.31.0
 flask==2.0.0`

      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'requirements.txt', patch}]},
      })

      const files = [{filename: 'requirements.txt', status: 'modified', additions: 1, deletions: 1}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect dev-requirements.txt as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'dev-requirements.txt', patch: ''}]},
      })

      const files = [
        {filename: 'dev-requirements.txt', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect test-requirements.txt as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'test-requirements.txt', patch: ''}]},
      })

      const files = [
        {filename: 'test-requirements.txt', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect Pipfile as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'Pipfile', patch: ''}]},
      })

      const files = [{filename: 'Pipfile', status: 'modified', additions: 1, deletions: 1}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect pyproject.toml as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'pyproject.toml', patch: ''}]},
      })

      const files = [{filename: 'pyproject.toml', status: 'modified', additions: 1, deletions: 1}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect setup.py as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'setup.py', patch: ''}]},
      })

      const files = [{filename: 'setup.py', status: 'modified', additions: 1, deletions: 1}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should detect poetry.lock as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'poetry.lock', patch: ''}]},
      })

      const files = [{filename: 'poetry.lock', status: 'modified', additions: 1, deletions: 1}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should handle compare commits API error gracefully', async () => {
      mockedOctokit.rest.repos.compareCommits.mockRejectedValue(new Error('API error'))

      const files = [{filename: 'requirements.txt', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should return empty array when no patch in compare result', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'requirements.txt', patch: undefined}]},
      })

      const files = [{filename: 'requirements.txt', status: 'modified', additions: 1, deletions: 1}]

      const result = await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
    })

    it('should skip non-Python dependency files', async () => {
      const files = [
        {filename: 'requirements.md', status: 'modified', additions: 1, deletions: 0},
        {filename: 'my-requirements', status: 'modified', additions: 1, deletions: 0},
      ]

      const result = await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(result).toEqual([])
      expect(mockedOctokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    })

    it('should detect constraints.txt as a Python dependency file', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'constraints.txt', patch: ''}]},
      })

      const files = [{filename: 'constraints.txt', status: 'modified', additions: 1, deletions: 0}]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })

    it('should handle Python files in subdirectories', async () => {
      mockedOctokit.rest.repos.compareCommits.mockResolvedValue({
        data: {files: [{filename: 'backend/requirements.txt', patch: ''}]},
      })

      const files = [
        {filename: 'backend/requirements.txt', status: 'modified', additions: 1, deletions: 1},
      ]

      await detectPythonChangesFromPR(createMockOctokit(), 'owner', 'repo', 1, files)

      expect(mockedOctokit.rest.repos.compareCommits).toHaveBeenCalled()
    })
  })
})
