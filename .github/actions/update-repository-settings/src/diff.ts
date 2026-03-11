export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {...base}
  for (const key of Object.keys(override)) {
    const overrideVal = override[key]
    const baseVal = base[key]

    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      )
    } else {
      result[key] = overrideVal
    }
  }
  return result
}

export interface CollectionDiff<T> {
  add: T[]
  update: T[]
  remove: T[]
}

export function diffCollections<T>(
  current: T[],
  desired: T[],
  keyFn: (item: T) => string,
): CollectionDiff<T> {
  const currentMap = new Map<string, T>(current.map(item => [keyFn(item), item]))
  const desiredMap = new Map<string, T>(desired.map(item => [keyFn(item), item]))

  const add: T[] = []
  const update: T[] = []
  const remove: T[] = []

  for (const [key, desiredItem] of desiredMap) {
    if (currentMap.has(key)) {
      update.push(desiredItem)
    } else {
      add.push(desiredItem)
    }
  }

  for (const [key, currentItem] of currentMap) {
    if (!desiredMap.has(key)) {
      remove.push(currentItem)
    }
  }

  return {add, update, remove}
}
