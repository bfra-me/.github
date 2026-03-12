import {describe, expect, it} from 'vitest'

import {deepMerge, diffCollections} from '../diff.js'

describe('deepMerge', () => {
  it('merges nested objects recursively', () => {
    const base = {a: {b: 1, c: 2}, d: 3}
    const override = {a: {b: 10}, e: 4}
    const result = deepMerge(base, override)

    expect(result).toEqual({a: {b: 10, c: 2}, d: 3, e: 4})
  })

  it('replaces arrays instead of concatenating', () => {
    const base = {items: [1, 2, 3]}
    const override = {items: [4, 5]}
    const result = deepMerge(base, override)

    expect(result).toEqual({items: [4, 5]})
  })

  it('override wins for scalar values', () => {
    const base = {name: 'old', count: 5}
    const override = {name: 'new'}
    const result = deepMerge(base, override)

    expect(result).toEqual({name: 'new', count: 5})
  })

  it('preserves keys only in base', () => {
    const base = {a: 1, b: 2, c: 3}
    const override = {a: 10}
    const result = deepMerge(base, override)

    expect(result).toEqual({a: 10, b: 2, c: 3})
  })

  it('handles undefined value in override', () => {
    const base = {a: 1, b: 2}
    const override = {a: undefined}
    const result = deepMerge(base, override)

    expect(result).toEqual({a: undefined, b: 2})
  })
})

describe('diffCollections', () => {
  it('identifies new items in desired', () => {
    const current = [{id: '1', name: 'a'}]
    const desired = [
      {id: '1', name: 'a'},
      {id: '2', name: 'b'},
    ]
    const result = diffCollections(current, desired, item => item.id)

    expect(result.add).toEqual([{id: '2', name: 'b'}])
    expect(result.update).toEqual([{id: '1', name: 'a'}])
    expect(result.remove).toEqual([])
  })

  it('identifies items to remove', () => {
    const current = [
      {id: '1', name: 'a'},
      {id: '2', name: 'b'},
    ]
    const desired = [{id: '1', name: 'a'}]
    const result = diffCollections(current, desired, item => item.id)

    expect(result.add).toEqual([])
    expect(result.update).toEqual([{id: '1', name: 'a'}])
    expect(result.remove).toEqual([{id: '2', name: 'b'}])
  })

  it('identifies items in both as update', () => {
    const current = [{id: '1', name: 'a'}]
    const desired = [{id: '1', name: 'a'}]
    const result = diffCollections(current, desired, item => item.id)

    expect(result.add).toEqual([])
    expect(result.update).toEqual([{id: '1', name: 'a'}])
    expect(result.remove).toEqual([])
  })

  it('handles empty current with non-empty desired', () => {
    const current: {id: string}[] = []
    const desired = [{id: '1'}, {id: '2'}]
    const result = diffCollections(current, desired, item => item.id)

    expect(result.add).toEqual([{id: '1'}, {id: '2'}])
    expect(result.update).toEqual([])
    expect(result.remove).toEqual([])
  })

  it('handles non-empty current with empty desired', () => {
    const current = [{id: '1'}, {id: '2'}]
    const desired: {id: string}[] = []
    const result = diffCollections(current, desired, item => item.id)

    expect(result.add).toEqual([])
    expect(result.update).toEqual([])
    expect(result.remove).toEqual([{id: '1'}, {id: '2'}])
  })
})
