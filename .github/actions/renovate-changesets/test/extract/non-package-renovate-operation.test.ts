import {describe, expect, it} from 'vitest'
import {classifyNoPackageOperation} from '../../src/extract/non-package-renovate-operation'

const configMigrationBody = 'The Renovate config in this repository needs migrating.'

describe('classifyNoPackageOperation', () => {
  it('recognizes config migration only with both signals', () => {
    expect(classifyNoPackageOperation(configMigrationBody, 'renovate/config-migration')).toEqual({
      kind: 'skip',
      reason: 'config-migration',
    })
  })

  it('rejects config migration wording without the branch signal', () => {
    expect(classifyNoPackageOperation(configMigrationBody, 'renovate/dependencies')).toEqual({
      kind: 'unsupported',
    })
  })

  it('rejects a config migration branch without the body signal', () => {
    expect(classifyNoPackageOperation('No dependency table.', 'renovate/config-migration')).toEqual(
      {
        kind: 'unsupported',
      },
    )
  })

  it('recognizes onboarding only with both signals', () => {
    expect(
      classifyNoPackageOperation(
        'Welcome to Renovate. <!-- renovate-config-hash: abc123 -->',
        'renovate/configure',
      ),
    ).toEqual({kind: 'skip', reason: 'onboarding'})
  })

  it.each(['Welcome to Renovate.', 'renovate-config-hash: abc123'])(
    'rejects onboarding with only one body signal: %s',
    body => {
      expect(classifyNoPackageOperation(body, 'renovate/configure')).toEqual({kind: 'unsupported'})
    },
  )

  it('rejects unrelated no-table prose', () => {
    expect(
      classifyNoPackageOperation('A release note without a dependency table.', 'renovate/example'),
    ).toEqual({
      kind: 'unsupported',
    })
  })

  it('honors a configured branch prefix', () => {
    expect(
      classifyNoPackageOperation(configMigrationBody, 'deps/config-migration', 'deps/'),
    ).toEqual({
      kind: 'skip',
      reason: 'config-migration',
    })
  })
})
