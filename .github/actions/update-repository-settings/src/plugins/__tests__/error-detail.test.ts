import {describe, expect, it} from 'vitest'
import {describeError} from '../error-detail.js'

describe('describeError', () => {
  it('produces a string containing status, request ID, and body for a full RequestError shape', () => {
    const error = {
      status: 500,
      message: 'Internal Server Error',
      response: {
        headers: {'x-github-request-id': 'ABCD:1234:5678'},
        data: {message: 'something broke'},
      },
    }

    const result = describeError(error)

    expect(result).toContain('500')
    expect(result).toContain('ABCD:1234:5678')
    expect(result).toContain('something broke')
  })

  it('names status and request ID for an empty response body, and never renders empty', () => {
    const error = {
      status: 500,
      message: '',
      response: {
        headers: {'x-github-request-id': 'EEEE:0000:1111'},
        data: '',
      },
    }

    const result = describeError(error)

    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('500')
    expect(result).toContain('EEEE:0000:1111')
  })

  it('names status and request ID for a response with no data at all', () => {
    const error = {
      status: 502,
      message: '',
      response: {
        headers: {'x-github-request-id': 'FFFF:2222:3333'},
      },
    }

    const result = describeError(error)

    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('502')
    expect(result).toContain('FFFF:2222:3333')
  })

  it('returns the message for a plain Error with no response', () => {
    const error = new Error('plain failure')

    expect(describeError(error)).toBe('plain failure')
  })

  it('produces a usable string for a thrown non-Error value, not [object Object]', () => {
    const result = describeError({code: 'ERR_WEIRD', detail: 'nope'})

    expect(result).not.toBe('[object Object]')
    expect(result).toContain('ERR_WEIRD')
  })

  it('produces a usable string for a thrown primitive', () => {
    expect(describeError('boom')).toBe('boom')
    expect(describeError(42)).not.toBe('[object Object]')
  })

  it('truncates a response body longer than the bound, visibly', () => {
    const longValue = 'x'.repeat(3000)
    const error = {
      status: 500,
      response: {
        headers: {},
        data: {message: longValue},
      },
    }

    const result = describeError(error)

    expect(result.length).toBeLessThan(3000)
    expect(result).toContain('[truncated]')
  })

  it('redacts a denylisted key in the body', () => {
    const error = {
      status: 422,
      response: {
        headers: {},
        data: {restrictions: {teams: [{slug: 'org-admins', name: 'Org Admins'}]}},
      },
    }

    const result = describeError(error)

    expect(result).not.toContain('org-admins')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts a denylisted value beyond the truncation bound instead of merely cutting it off', () => {
    const secretSlug = `secret-team-slug-${'z'.repeat(3000)}`
    const error = {
      status: 500,
      response: {
        headers: {},
        data: {restrictions: {teams: [{slug: secretSlug}]}},
      },
    }

    const result = describeError(error)

    expect(result).not.toContain('secret-team-slug')
  })

  it('preserves branch and repository names through redaction', () => {
    const error = {
      status: 500,
      response: {
        headers: {},
        data: {branch: 'main', repository: 'bfra-me/ha-addon-repository', name: 'main'},
      },
    }

    const result = describeError(error)

    expect(result).toContain('main')
    expect(result).toContain('bfra-me/ha-addon-repository')
  })

  it('surfaces only x-github-request-id from response headers, never authorization', () => {
    const error = {
      status: 401,
      response: {
        headers: {
          'x-github-request-id': 'GGGG:4444:5555',
          authorization: 'Bearer super-secret-token',
        },
        data: {},
      },
    }

    const result = describeError(error)

    expect(result).toContain('GGGG:4444:5555')
    expect(result).not.toContain('super-secret-token')
    expect(result).not.toContain('Bearer')
  })

  it('redacts a denylisted key nested inside an array under restrictions', () => {
    const error = {
      status: 403,
      response: {
        headers: {},
        data: {
          restrictions: {
            users: [
              {login: 'alice', id: 1},
              {login: 'bob', id: 2},
            ],
          },
        },
      },
    }

    const result = describeError(error)

    expect(result).not.toContain('alice')
    expect(result).not.toContain('bob')
  })

  it('redacts bypass_pull_request_allowances and dismissal_restrictions wholesale', () => {
    const error = {
      status: 403,
      response: {
        headers: {},
        data: {
          required_pull_request_reviews: {
            dismissal_restrictions: {users: [{login: 'carol'}]},
            bypass_pull_request_allowances: {teams: [{slug: 'release-managers'}]},
          },
        },
      },
    }

    const result = describeError(error)

    expect(result).not.toContain('carol')
    expect(result).not.toContain('release-managers')
  })
})
