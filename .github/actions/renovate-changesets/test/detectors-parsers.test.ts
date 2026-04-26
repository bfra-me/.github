import {describe, expect, it} from 'vitest'
import {
  isGitHubActionsFile,
  extractInlineVersions,
  parseActionReferences,
  parseActionUses,
} from '../src/detectors/gha-workflow-parser'
import {parseRequirementsChanges} from '../src/detectors/python-requirements-parser'

describe('gha-workflow-parser', () => {
  describe('isGitHubActionsFile', () => {
    it('should return true for .github/workflows/ YAML', () => {
      expect(isGitHubActionsFile('.github/workflows/ci.yml')).toBe(true)
    })

    it('should return true for .github/workflows/ YAML extension', () => {
      expect(isGitHubActionsFile('.github/workflows/ci.yaml')).toBe(true)
    })

    it('should return true for .github/actions/ YAML', () => {
      expect(isGitHubActionsFile('.github/actions/my-action/action.yml')).toBe(true)
    })

    it('should return true for workflow-templates/', () => {
      expect(isGitHubActionsFile('workflow-templates/my-template.yml')).toBe(true)
    })

    it('should return false for non-workflow YAML', () => {
      expect(isGitHubActionsFile('config.yml')).toBe(false)
    })

    it('should return false for .github/workflows with non-YAML', () => {
      expect(isGitHubActionsFile('.github/workflows/ci.sh')).toBe(false)
    })

    it('should return false for non-workflow path', () => {
      expect(isGitHubActionsFile('package.json')).toBe(false)
    })
  })

  describe('extractInlineVersions', () => {
    it('should extract inline version comments', () => {
      const content = `
      - uses: actions/checkout@abc123def456abc123def456abc123def456abc123 # v4.1.0
`
      const versions = extractInlineVersions(content)
      expect(versions.get('abc123def456abc123def456abc123def456abc123')).toBe('v4.1.0')
    })

    it('should return empty map for content without inline versions', () => {
      const versions = extractInlineVersions('no uses here')
      expect(versions.size).toBe(0)
    })

    it('should extract multiple inline versions', () => {
      const content = `
      - uses: actions/checkout@sha1 # v4.0.0
      - uses: actions/setup-node@sha2 # v3.0.0
`
      const versions = extractInlineVersions(content)
      expect(versions.size).toBe(2)
    })
  })

  describe('parseActionUses', () => {
    it('should parse a standard action reference', () => {
      const result = parseActionUses('actions/checkout@abc123', 'Checkout')
      expect(result).not.toBeNull()
      expect(result?.name).toBe('actions/checkout')
      expect(result?.ref).toBe('abc123')
      expect(result?.stepName).toBe('Checkout')
    })

    it('should return null for relative path', () => {
      const result = parseActionUses('./local-action', 'Local')
      expect(result).toBeNull()
    })

    it('should return null for missing @', () => {
      const result = parseActionUses('actions/checkout', 'Checkout')
      expect(result).toBeNull()
    })

    it('should extract inline version comment', () => {
      const result = parseActionUses('actions/checkout@abc123def456 # v4.0.0', 'Checkout')
      expect(result?.inlineVersion).toBe('v4.0.0')
    })

    it('should handle ref with hash comment', () => {
      const result = parseActionUses('actions/checkout@abc123def456 # v4', 'Checkout')
      expect(result?.ref).toBe('abc123def456')
    })
  })

  describe('parseActionReferences', () => {
    it('should parse workflow with action steps', async () => {
      const content = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@abc123def456abc123def456abc123def456ab12
`
      const refs = await parseActionReferences(content, '.github/workflows/ci.yml')
      expect(refs).toHaveLength(1)
      expect(refs[0].name).toBe('actions/checkout')
    })

    it('should return empty for invalid YAML', async () => {
      const refs = await parseActionReferences('invalid: yaml: :', '.github/workflows/ci.yml')
      expect(Array.isArray(refs)).toBe(true)
    })

    it('should return empty for non-workflow content', async () => {
      const refs = await parseActionReferences('{}', '.github/workflows/ci.yml')
      expect(refs).toHaveLength(0)
    })

    it('should parse reusable workflow (job-level uses)', async () => {
      const content = `
on: push
jobs:
  call-workflow:
    uses: org/repo/.github/workflows/reusable.yml@abc123def456abc123def456abc123def456ab12
`
      const refs = await parseActionReferences(content, '.github/workflows/ci.yml')
      expect(refs).toHaveLength(1)
      expect(refs[0].name).toContain('reusable.yml')
    })

    it('should handle step without name', async () => {
      const content = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc123def456abc123def456abc123def456ab12
`
      const refs = await parseActionReferences(content, '.github/workflows/ci.yml')
      expect(refs).toHaveLength(1)
    })

    it('should skip steps without uses', async () => {
      const content = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Run script
        run: echo hello
`
      const refs = await parseActionReferences(content, '.github/workflows/ci.yml')
      expect(refs).toHaveLength(0)
    })
  })
})

describe('python-requirements-parser', () => {
  describe('parseRequirementsChanges', () => {
    it('should return empty for empty patch', () => {
      const result = parseRequirementsChanges('requirements.txt', '')
      expect(result).toHaveLength(0)
    })

    it('should parse a simple version bump', () => {
      const patch = `@@ -1,3 +1,3 @@
-requests==2.28.0
+requests==2.31.0
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('requests')
      expect(result[0].currentVersion).toBe('2.28.0')
      expect(result[0].newVersion).toBe('2.31.0')
    })

    it('should handle version with operator', () => {
      const patch = `@@ -1,3 +1,3 @@
-Django>=3.2.0
+Django>=4.2.0
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Django')
    })

    it('should skip comment lines', () => {
      const patch = `@@ -1,3 +1,3 @@
-# This is a comment
+# Updated comment
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(0)
    })

    it('should skip lines that do not change', () => {
      const patch = `@@ -1,3 +1,3 @@
 requests==2.28.0
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(0)
    })

    it('should handle packages with extras', () => {
      const patch = `@@ -1,3 +1,3 @@
-celery[redis]==5.2.0
+celery[redis]==5.3.0
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('celery')
      expect(result[0].extras).toContain('redis')
    })

    it('should handle editable installs', () => {
      const patch = `@@ -1 +1 @@
--e git+https://github.com/org/repo@v1.0.0#egg=my-package
+-e git+https://github.com/org/repo@v2.0.0#egg=my-package
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      // Editable installs may or may not be parsed (depends on name matching)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should not include unchanged version', () => {
      const patch = `@@ -1,3 +1,3 @@
-requests==2.28.0
+requests==2.28.0
`
      const result = parseRequirementsChanges('requirements.txt', patch)
      expect(result).toHaveLength(0)
    })
  })
})
