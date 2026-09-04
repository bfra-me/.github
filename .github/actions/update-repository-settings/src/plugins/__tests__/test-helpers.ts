import type {Plugin} from '../index.js'
import {PLUGIN_REGISTRY} from '../index.js'

export async function withMockedPlugins(
  mocks: Record<string, Plugin>,
  callback: () => Promise<void>,
): Promise<void> {
  const originals = new Map<string, Plugin>()

  try {
    for (const [key, mock] of Object.entries(mocks)) {
      const original = PLUGIN_REGISTRY[key]
      if (original === undefined) {
        throw new Error(`Unknown plugin key: ${key}`)
      }

      originals.set(key, original)
      PLUGIN_REGISTRY[key] = mock
    }

    await callback()
  } finally {
    for (const [key, original] of originals) {
      PLUGIN_REGISTRY[key] = original
    }
  }
}
