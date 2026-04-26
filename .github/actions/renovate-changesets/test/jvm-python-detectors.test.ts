import {describe, expect, it} from 'vitest'
import {parseMavenPOM} from '../src/detectors/jvm-maven-parser'
import {parsePackageManagerChanges} from '../src/detectors/python-package-manager-analyzer'

describe('jvm-maven-parser', () => {
  describe('parseMavenPOM', () => {
    it('should parse empty POM', () => {
      const result = parseMavenPOM('<project></project>')
      expect(result.dependencies).toHaveLength(0)
      expect(result.build?.plugins).toHaveLength(0)
    })

    it('should parse groupId and artifactId', () => {
      const content = `
<project>
  <groupId>com.example</groupId>
  <artifactId>my-app</artifactId>
  <version>1.0.0</version>
</project>`
      const result = parseMavenPOM(content)
      expect(result.groupId).toBe('com.example')
      expect(result.artifactId).toBe('my-app')
      expect(result.version).toBe('1.0.0')
    })

    it('should parse dependencies', () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.0</version>
    </dependency>
  </dependencies>
</project>`
      const result = parseMavenPOM(content)
      expect(result.dependencies).toHaveLength(1)
      expect(result.dependencies?.[0]?.groupId).toBe('org.springframework')
      expect(result.dependencies?.[0]?.artifactId).toBe('spring-core')
      expect(result.dependencies?.[0]?.version).toBe('5.3.0')
    })

    it('should parse parent section', () => {
      const content = `
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.0</version>
  </parent>
</project>`
      const result = parseMavenPOM(content)
      expect(result.parent?.groupId).toBe('org.springframework.boot')
      expect(result.parent?.version).toBe('2.7.0')
    })

    it('should parse plugins', () => {
      const content = `
<project>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.10.0</version>
      </plugin>
    </plugins>
  </build>
</project>`
      const result = parseMavenPOM(content)
      expect(result.build?.plugins).toHaveLength(1)
      expect(result.build?.plugins?.[0]?.artifactId).toBe('maven-compiler-plugin')
      expect(result.build?.plugins?.[0]?.version).toBe('3.10.0')
    })

    it('should parse dependency scope', () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`
      const result = parseMavenPOM(content)
      expect(result.dependencies?.[0]?.scope).toBe('test')
    })

    it('should handle missing version', () => {
      const content = `
<project>
  <dependencies>
    <dependency>
      <groupId>org.example</groupId>
      <artifactId>my-dep</artifactId>
    </dependency>
  </dependencies>
</project>`
      const result = parseMavenPOM(content)
      expect(result.dependencies?.[0]?.version).toBeUndefined()
    })
  })
})

describe('python-package-manager-analyzer', () => {
  describe('parsePackageManagerChanges', () => {
    it('should return empty when content is null', async () => {
      const result = await parsePackageManagerChanges({
        filename: 'Pipfile.lock',
        prNumber: 1,
        loadContent: async () => null,
      })
      expect(result).toHaveLength(0)
    })

    it('should parse Pipfile.lock changes', async () => {
      const baseLock = JSON.stringify({
        default: {
          requests: {version: '==2.28.0', extras: []},
        },
        develop: {},
      })
      const headLock = JSON.stringify({
        default: {
          requests: {version: '==2.31.0', extras: []},
        },
        develop: {},
      })

      const result = await parsePackageManagerChanges({
        filename: 'Pipfile.lock',
        prNumber: 1,
        loadContent: async (_filename, ref) => (ref.includes('base') ? baseLock : headLock),
      })

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('requests')
      expect(result[0]!.currentVersion).toContain('2.28.0')
      expect(result[0]!.newVersion).toContain('2.31.0')
    })

    it('should return empty for unchanged Pipfile.lock', async () => {
      const lock = JSON.stringify({
        default: {requests: {version: '==2.28.0', extras: []}},
        develop: {},
      })

      const result = await parsePackageManagerChanges({
        filename: 'Pipfile.lock',
        prNumber: 1,
        loadContent: async () => lock,
      })

      expect(result).toHaveLength(0)
    })

    it('should parse Pipfile changes', async () => {
      const basePipfile = `[packages]
requests = "==2.28.0"

[dev-packages]
pytest = "==7.0.0"
`
      const headPipfile = `[packages]
requests = "==2.31.0"

[dev-packages]
pytest = "==7.4.0"
`

      const result = await parsePackageManagerChanges({
        filename: 'Pipfile',
        prNumber: 1,
        loadContent: async (_filename, ref) => (ref.includes('base') ? basePipfile : headPipfile),
      })

      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle Pipfile.lock with develop dependencies', async () => {
      const baseLock = JSON.stringify({
        default: {},
        develop: {pytest: {version: '==7.0.0', extras: []}},
      })
      const headLock = JSON.stringify({
        default: {},
        develop: {pytest: {version: '==7.4.0', extras: []}},
      })

      const result = await parsePackageManagerChanges({
        filename: 'Pipfile.lock',
        prNumber: 1,
        loadContent: async (_filename, ref) => (ref.includes('base') ? baseLock : headLock),
      })

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('pytest')
    })

    it('should handle JSON parse error gracefully', async () => {
      const result = await parsePackageManagerChanges({
        filename: 'Pipfile.lock',
        prNumber: 1,
        loadContent: async () => 'invalid json',
      })

      expect(result).toHaveLength(0)
    })

    it('should return empty for unsupported file type', async () => {
      const result = await parsePackageManagerChanges({
        filename: 'setup.py',
        prNumber: 1,
        loadContent: async () => 'some content',
      })

      expect(result).toHaveLength(0)
    })
  })
})
