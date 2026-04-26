import type {EnhancedTemplateContext} from '../src/changeset-template-engine'
import {describe, expect, it} from 'vitest'
import {ChangesetTemplateEngine} from '../src/changeset-template-engine'

function makeContext(overrides: Partial<EnhancedTemplateContext> = {}): EnhancedTemplateContext {
  return {
    updateType: 'npm',
    manager: 'npm',
    dependencies: ['lodash', 'react'],
    dependencyCount: 2,
    isSecurityUpdate: false,
    isGroupedUpdate: false,
    hasBreakingChanges: false,
    primaryVersion: '2.0.0',
    riskLevel: 'low',
    primaryCategory: 'major',
    emoji: '📦',
    timestamp: '2025-01-01T00:00:00Z',
    date: '2025-01-01',
    packageManager: 'npm',
    ecosystem: 'node',
    updateScope: 'major',
    dependencyList: [
      {
        name: 'lodash',
        currentVersion: '4.0.0',
        newVersion: '5.0.0',
        isBreaking: true,
        isSecurity: false,
      },
      {
        name: 'react',
        currentVersion: '18.0.0',
        newVersion: '19.0.0',
        isBreaking: true,
        isSecurity: false,
      },
    ],
    impact: {
      overall: 'major',
      score: 75,
      confidence: 0.9,
      hasBreaking: true,
      hasSecurity: false,
    },
    helpers: {
      formatDate: date => String(date),
      capitalize: text => text.charAt(0).toUpperCase() + text.slice(1),
      pluralize: (word, count) => (count === 1 ? word : `${word}s`),
      truncate: (text, length) => text.slice(0, length),
      joinWithAnd: items => items.join(' and '),
      formatVersion: version => `v${version}`,
      formatSemverBump: (current, next) => `${current} -> ${next}`,
    },
    ...overrides,
  }
}

function makeEngine(
  errorHandling: 'strict' | 'fallback' | 'silent' = 'fallback',
): ChangesetTemplateEngine {
  return new ChangesetTemplateEngine({
    workingDirectory: '/tmp/test',
    errorHandling,
  })
}

describe('ChangesetTemplateEngine', () => {
  describe('renderTemplate with simple format', () => {
    it('should render simple variable substitution', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        'Update {manager} dependencies',
        makeContext({manager: 'npm'}),
      )
      expect(result).toBe('Update npm dependencies')
    })

    it('should substitute multiple variables', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        '{emoji} Update {manager}: {dependencies}',
        makeContext(),
      )
      expect(result).toContain('📦')
      expect(result).toContain('npm')
    })

    it('should remove unreplaced variables', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate('Update {unknownVar} dependency', makeContext())
      expect(result).not.toContain('{unknownVar}')
    })

    it('should handle {dependencies} list', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        'Updates: {dependencies}',
        makeContext({dependencies: ['lodash', 'react']}),
      )
      expect(result).toContain('lodash')
      expect(result).toContain('react')
    })

    it('should handle {dependencyList} list', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate('Packages: {dependencyList}', makeContext())
      expect(result).toContain('lodash')
    })

    it('should handle boolean variables', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        'Security: {isSecurityUpdate}',
        makeContext({isSecurityUpdate: true}),
      )
      expect(result).toBe('Security: true')
    })
  })

  describe('renderTemplate with handlebars format', () => {
    it('should render {{variable}} substitution', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: 'Update {{manager}} deps', format: 'handlebars'},
        makeContext(),
      )
      expect(result).toContain('npm')
    })

    it('should support {{#if condition}} blocks', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: '{{#if isSecurityUpdate}}Security!{{/if}} Update deps', format: 'handlebars'},
        makeContext({isSecurityUpdate: true}),
      )
      expect(result).toContain('Security!')
    })

    it('should hide {{#if condition}} block when false', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: '{{#if isSecurityUpdate}}Security!{{/if}} Update deps', format: 'handlebars'},
        makeContext({isSecurityUpdate: false}),
      )
      expect(result).not.toContain('Security!')
    })

    it('should render {{#each array}} loops', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: '{{#each dependencies}}{{this}},{{/each}}', format: 'handlebars'},
        makeContext({dependencies: ['lodash', 'react']}),
      )
      expect(result).toContain('lodash')
      expect(result).toContain('react')
    })

    it('should render {{#each}} with object properties', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: '{{#each dependencyList}}{{name}};{{/each}}', format: 'handlebars'},
        makeContext(),
      )
      expect(result).toContain('lodash')
    })

    it('should handle empty array in {{#each}}', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: 'Deps: {{#each dependencies}}{{this}}{{/each}}', format: 'handlebars'},
        makeContext({dependencies: []}),
      )
      expect(result).toBe('Deps:')
    })
  })

  describe('renderTemplate with mustache format', () => {
    it('should render mustache template same as handlebars', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate(
        {content: 'Update {{manager}}', format: 'mustache'},
        makeContext(),
      )
      expect(result).toContain('npm')
    })
  })

  describe('renderTemplate error handling', () => {
    it('should return fallback on error in fallback mode', async () => {
      const engine = makeEngine('fallback')
      const result = await engine.renderTemplate({content: '', format: 'simple'}, makeContext())
      expect(result).toContain('npm')
    })

    it('should throw in strict mode when template is empty', async () => {
      const engine = makeEngine('strict')
      await expect(
        engine.renderTemplate({content: '', format: 'simple'}, makeContext()),
      ).rejects.toThrow('No template content provided')
    })

    it('should return empty string in silent mode on error', async () => {
      const engine = makeEngine('silent')
      const result = await engine.renderTemplate({content: '', format: 'simple'}, makeContext())
      expect(result).toBe('')
    })

    it('should use content directly when provided as string', async () => {
      const engine = makeEngine()
      const result = await engine.renderTemplate('Update {manager}', makeContext())
      expect(result).toContain('npm')
    })
  })

  describe('validateTemplate', () => {
    it('should return valid for template with content', () => {
      const engine = makeEngine()
      const result = engine.validateTemplate({content: 'Update {manager}', format: 'simple'})
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return invalid for template without content or filePath', () => {
      const engine = makeEngine()
      const result = engine.validateTemplate({format: 'simple'})
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Template must have either content or filePath')
    })

    it('should return invalid for bad version in metadata', () => {
      const engine = makeEngine()
      const result = engine.validateTemplate({
        content: 'test',
        format: 'simple',
        metadata: {name: 'test', version: 'bad-version'},
      })
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('version')
    })

    it('should allow filePath when file inclusion is enabled', () => {
      const engine = makeEngine()
      const result = engine.validateTemplate({filePath: 'template.tpl', format: 'simple'})
      expect(result.errors).not.toContain('File inclusion is disabled in security settings')
    })

    it('should disallow filePath when file inclusion is disabled', () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'strict',
        security: {
          allowFileInclusion: false,
          allowCodeExecution: false,
          maxTemplateSize: 50000,
          maxRenderTime: 5000,
        },
      })
      const result = engine.validateTemplate({filePath: 'template.tpl', format: 'simple'})
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('File inclusion is disabled in security settings')
    })
  })

  describe('createFromOrganization', () => {
    it('should return empty string when no org templates configured', async () => {
      const engine = makeEngine()
      const result = await engine.createFromOrganization('npm', 'major', makeContext())
      expect(result).toBe('')
    })

    it('should use manager-specific template when available', async () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'fallback',
        organizationTemplates: {
          managers: {
            npm: {content: 'NPM update: {manager}', format: 'simple'},
          },
        },
      })
      const result = await engine.createFromOrganization('npm', 'major', makeContext())
      expect(result).toContain('NPM update')
    })

    it('should fall back to updateType template when no manager template', async () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'fallback',
        organizationTemplates: {
          updateTypes: {
            major: {content: 'Major update via {manager}', format: 'simple'},
          },
        },
      })
      const result = await engine.createFromOrganization('docker', 'major', makeContext())
      expect(result).toContain('Major update')
    })

    it('should fall back to base template when no manager or updateType template', async () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'fallback',
        organizationTemplates: {
          base: {
            default: {content: 'Base template', format: 'simple'},
          },
        },
      })
      const result = await engine.createFromOrganization('docker', 'major', makeContext())
      expect(result).toContain('Base template')
    })

    it('should fall back to fallback template as last resort', async () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'fallback',
        organizationTemplates: {
          fallback: {content: 'Fallback: {manager}', format: 'simple'},
        },
      })
      const result = await engine.createFromOrganization('docker', 'major', makeContext())
      expect(result).toContain('Fallback')
    })

    it('should render fallback template when no org templates match', async () => {
      const engine = new ChangesetTemplateEngine({
        workingDirectory: '/tmp/test',
        errorHandling: 'fallback',
        organizationTemplates: {},
      })
      const result = await engine.createFromOrganization('npm', 'major', makeContext())
      expect(result).toContain('npm')
    })
  })
})
