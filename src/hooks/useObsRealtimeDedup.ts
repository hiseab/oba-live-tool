import { IPC_CHANNELS } from 'shared/ipcChannels'
import type {
  ObsConnectionSnapshot,
  ObsRealtimeDedupConfig,
  ObsRealtimeDedupState,
  ObsRealtimeDedupStatus,
} from 'shared/obsRealtimeDedup'
import {
  DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
  normalizeObsRealtimeDedupConfig,
} from 'shared/obsRealtimeDedup'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/utils/storage'
import { createSelectors } from '@/utils/zustand'

const INITIAL_RUNTIME_STATE: ObsRealtimeDedupState = {
  phase: 'disconnected',
  connected: false,
  running: false,
  currentScene: null,
  selectedSourceUuid: null,
  capabilities: { colorFilter: false, shaderFilter: false },
  message: null,
}

interface ObsRealtimeDedupStore {
  config: ObsRealtimeDedupConfig
  sourceUuid: string
  snapshot: ObsConnectionSnapshot | null
  runtime: ObsRealtimeDedupState
  status: ObsRealtimeDedupStatus | null
  busy: boolean
  setConfig: (config: ObsRealtimeDedupConfig) => void
  patchConfig: (patch: Partial<ObsRealtimeDedupConfig>) => void
  setSourceUuid: (sourceUuid: string) => void
  setRuntime: (runtime: ObsRealtimeDedupState) => void
  setStatus: (status: ObsRealtimeDedupStatus) => void
  loadRuntime: () => Promise<void>
  connect: () => Promise<ObsConnectionSnapshot>
  refreshSources: () => Promise<ObsConnectionSnapshot>
  start: () => Promise<void>
  stop: () => Promise<void>
  syncConfig: (config?: ObsRealtimeDedupConfig) => Promise<void>
}

const useObsRealtimeDedupStoreBase = create<ObsRealtimeDedupStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
      sourceUuid: '',
      snapshot: null,
      runtime: INITIAL_RUNTIME_STATE,
      status: null,
      busy: false,
      setConfig: config => set({ config: normalizeObsRealtimeDedupConfig(config) }),
      patchConfig: patch =>
        set(state => ({
          config: normalizeObsRealtimeDedupConfig({ ...state.config, ...patch }),
        })),
      setSourceUuid: sourceUuid => set({ sourceUuid }),
      setRuntime: runtime =>
        set(state => ({ runtime, status: runtime.running ? state.status : null })),
      setStatus: status => set({ status }),
      loadRuntime: async () => {
        const runtime = await window.ipcRenderer.invoke(IPC_CHANNELS.obsRealtimeDedup.getState)
        set({ runtime })
      },
      connect: async () => {
        set({ busy: true })
        try {
          const snapshot = await window.ipcRenderer.invoke(IPC_CHANNELS.obsRealtimeDedup.connect)
          set({ snapshot })
          return snapshot
        } finally {
          set({ busy: false })
        }
      },
      refreshSources: async () => {
        set({ busy: true })
        try {
          const snapshot = await window.ipcRenderer.invoke(
            IPC_CHANNELS.obsRealtimeDedup.refreshSources,
          )
          set({ snapshot })
          return snapshot
        } finally {
          set({ busy: false })
        }
      },
      start: async () => {
        const { config, sourceUuid } = get()
        if (!sourceUuid) throw new Error('请选择 OBS 源')
        set({ busy: true })
        try {
          await window.ipcRenderer.invoke(IPC_CHANNELS.obsRealtimeDedup.updateConfig, config)
          const runtime = await window.ipcRenderer.invoke(
            IPC_CHANNELS.obsRealtimeDedup.start,
            sourceUuid,
            config,
          )
          set({ runtime })
        } finally {
          set({ busy: false })
        }
      },
      stop: async () => {
        set({ busy: true })
        try {
          const runtime = await window.ipcRenderer.invoke(IPC_CHANNELS.obsRealtimeDedup.stop)
          set({ runtime })
        } finally {
          set({ busy: false })
        }
      },
      syncConfig: async config => {
        await window.ipcRenderer.invoke(
          IPC_CHANNELS.obsRealtimeDedup.updateConfig,
          config ?? get().config,
        )
      },
    }),
    {
      name: STORAGE_KEYS.OBS_REALTIME_DEDUP,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ config: state.config, sourceUuid: state.sourceUuid }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<ObsRealtimeDedupStore>
        let config = DEFAULT_OBS_REALTIME_DEDUP_CONFIG
        try {
          config = normalizeObsRealtimeDedupConfig({
            ...DEFAULT_OBS_REALTIME_DEDUP_CONFIG,
            ...(saved.config ?? {}),
          })
        } catch {
          config = DEFAULT_OBS_REALTIME_DEDUP_CONFIG
        }
        return {
          ...current,
          config,
          sourceUuid: typeof saved.sourceUuid === 'string' ? saved.sourceUuid : '',
        }
      },
    },
  ),
)

export const useObsRealtimeDedupStore = createSelectors(useObsRealtimeDedupStoreBase)
