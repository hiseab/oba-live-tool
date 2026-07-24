import assert from 'node:assert/strict'
import { test } from 'vitest'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  },
})

const { useAutoReplyConfigStore } = await import('../src/hooks/useAutoReplyConfig')

test('updateConfig can update an existing Immer-managed auto-reply config', () => {
  const accountId = 'proxy-regression'
  const store = useAutoReplyConfigStore.getState()

  store.updateConfig(accountId, { hideUsername: false })

  assert.doesNotThrow(() => {
    useAutoReplyConfigStore.getState().updateConfig(accountId, { hideUsername: true })
  })

  const config = useAutoReplyConfigStore.getState().contexts[accountId]?.config
  assert.equal(config?.hideUsername, true)
  assert.equal(config?.entry, 'control')
  assert.deepEqual(config?.comment.keywordReply.rules, [])
})
