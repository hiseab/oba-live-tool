import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { SoftwareUpdateError, SoftwareUpdateVersionInfo } from 'shared/softwareUpdate'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSelectors } from '@/utils/zustand'

export type UpdateStatus =
  | 'idle' // 空闲
  | 'checking' // 读取服务器 update.json
  | 'available' // 有可用更新 (已获取到信息，等待用户确认)
  | 'preparing' // 用户点击更新后，正在准备安装包下载
  | 'downloading' // 正在下载
  | 'ready' // 下载完成，等待重启
  | 'error' // 发生错误

export type VersionState = SoftwareUpdateVersionInfo

interface UpdateState {
  status: UpdateStatus
  versionInfo: VersionState | null
  progress: number
  error: SoftwareUpdateError | null
}

interface UpdateAction {
  checkUpdateManually: () => Promise<{ upToDate: boolean } | undefined>
  startDownload: () => void
  installUpdate: () => void
  setProgress: (progress: number) => void
  setStatus: (status: UpdateStatus) => void
  reset: () => void
  handleError: (error: SoftwareUpdateError) => void
  handleUpdate: (info: VersionState) => void
}

type UpdateStore = UpdateState & UpdateAction

const useUpdateStoreBase = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  versionInfo: null,
  progress: 0,
  error: null,

  checkUpdateManually: async () => {
    set({ status: 'checking', error: null })
    try {
      // 这里只比较内部版本号，不下载安装包
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.updater.checkUpdate)
      if (result) {
        set({ status: 'available', versionInfo: result })
      } else {
        set({ status: 'idle' })
        return { upToDate: true }
      }
    } catch (e) {
      set({ status: 'error', error: { message: (e as Error).message || '检查更新失败' } })
    }
  },
  startDownload: () => {
    set({ status: 'preparing', progress: 0, error: null })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.startDownload)
  },
  installUpdate: () => {
    set({ status: 'ready' })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.quitAndInstall)
  },
  setStatus: (status: UpdateStatus) => set({ status }),
  setProgress: (progress: number) => set({ progress }),
  reset: () => set({ status: 'idle', progress: 0, versionInfo: null, error: null }),
  handleError: (error: SoftwareUpdateError) => set({ status: 'error', error }),
  handleUpdate: (info: VersionState) => {
    if (get().status === 'idle') {
      set({ status: 'available', versionInfo: info })
    }
  },
}))

export const useUpdateStore = createSelectors(useUpdateStoreBase)
interface UpdateConfigStore {
  enableAutoCheckUpdate: boolean
  setEnableAutoCheckUpdate: (enabled: boolean) => void
}

export const useUpdateConfigStore = create<UpdateConfigStore>()(
  persist(
    set => ({
      enableAutoCheckUpdate: true,
      setEnableAutoCheckUpdate: enabled => set({ enableAutoCheckUpdate: enabled }),
    }),
    {
      name: 'update-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
