import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  getLiveDetailsTransportErrorMessage,
  type LiveDetailsErrorCode,
  type LiveSessionDetail,
  type LiveSessionPage,
  type LiveSessionSummary,
} from 'shared/liveDetails'
import { useAccounts } from './useAccounts'
import { useCurrentLiveControl } from './useLiveControl'

export interface LiveDetailsError {
  code: LiveDetailsErrorCode
  message: string
}

interface ListOptions {
  page?: number
  pageSize?: number
  dateType?: number
  query?: string
  forceRefresh?: boolean
}

export function useLiveDetails() {
  const accountId = useAccounts(state => state.currentAccountId)
  const connectionStatus = useCurrentLiveControl(context => context.isConnected)
  const platform = useCurrentLiveControl(context => context.platform)
  const [pageData, setPageData] = useState<LiveSessionPage | null>(null)
  const [detail, setDetail] = useState<LiveSessionDetail | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [dateType, setDateType] = useState(30)
  const [query, setQuery] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState<LiveDetailsError | null>(null)
  const [detailError, setDetailError] = useState<LiveDetailsError | null>(null)
  const listRequestId = useRef(0)
  const detailRequestId = useRef(0)

  const supported = platform === 'buyin'
  const connected = connectionStatus === 'connected'
  const sessionKey = [accountId, connectionStatus, platform].join(':')

  const loadList = useCallback(
    async (options: ListOptions = {}) => {
      if (!connected || !supported) return
      const requestId = ++listRequestId.current
      setListLoading(true)
      setListError(null)
      try {
        const result = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.liveDetails.list,
          accountId,
          {
            page: options.page ?? page,
            pageSize: options.pageSize ?? pageSize,
            dateType: options.dateType ?? dateType,
            query: options.query ?? query,
            forceRefresh: options.forceRefresh,
          },
        )
        if (requestId !== listRequestId.current) return
        if (!result.ok) {
          setPageData(null)
          setListError({ code: result.code, message: result.message })
          return
        }

        setPageData(result.data)
        setSelectedSessionId(current =>
          current && result.data.items.some(item => item.id === current)
            ? current
            : (result.data.items[0]?.id ?? null),
        )
      } catch (error) {
        if (requestId !== listRequestId.current) return
        setPageData(null)
        setListError({ code: 'UNKNOWN', message: getLiveDetailsTransportErrorMessage(error) })
      } finally {
        if (requestId === listRequestId.current) setListLoading(false)
      }
    },
    [accountId, connected, dateType, page, pageSize, query, supported],
  )

  const loadDetail = useCallback(
    async (sessionId: string, forceRefresh = false) => {
      if (!connected || !supported) return
      const requestId = ++detailRequestId.current
      setDetailLoading(true)
      setDetailError(null)
      try {
        const result = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.liveDetails.detail,
          accountId,
          { sessionId, productPage: 1, productPageSize: 20, forceRefresh },
        )
        if (requestId !== detailRequestId.current) return
        if (!result.ok) {
          setDetail(null)
          setDetailError({ code: result.code, message: result.message })
          return
        }
        setDetail(result.data)
      } catch (error) {
        if (requestId !== detailRequestId.current) return
        setDetail(null)
        setDetailError({ code: 'UNKNOWN', message: getLiveDetailsTransportErrorMessage(error) })
      } finally {
        if (requestId === detailRequestId.current) setDetailLoading(false)
      }
    },
    [accountId, connected, supported],
  )

  useEffect(() => {
    void sessionKey
    listRequestId.current += 1
    detailRequestId.current += 1
    setPageData(null)
    setDetail(null)
    setSelectedSessionId(null)
    setListError(null)
    setDetailError(null)
    setListLoading(false)
    setDetailLoading(false)
    setPage(1)
  }, [sessionKey])

  useEffect(() => {
    if (connected && supported) void loadList()
  }, [connected, loadList, supported])

  useEffect(() => {
    if (selectedSessionId) {
      void loadDetail(selectedSessionId)
    } else {
      detailRequestId.current += 1
      setDetail(null)
    }
  }, [loadDetail, selectedSessionId])

  const selectSession = useCallback((session: LiveSessionSummary) => {
    setSelectedSessionId(session.id)
  }, [])

  const changePage = useCallback((nextPage: number) => {
    setPage(Math.max(1, nextPage))
  }, [])

  const changeDateType = useCallback((nextDateType: number) => {
    setDateType(nextDateType)
    setPage(1)
  }, [])

  const search = useCallback((nextQuery: string) => {
    setQuery(nextQuery.trim())
    setPage(1)
  }, [])

  const refresh = useCallback(async () => {
    await loadList({ forceRefresh: true })
    if (selectedSessionId) await loadDetail(selectedSessionId, true)
  }, [loadDetail, loadList, selectedSessionId])

  return {
    supported,
    connected,
    connectionStatus,
    pageData,
    detail,
    selectedSessionId,
    page,
    pageSize,
    dateType,
    query,
    listLoading,
    detailLoading,
    listError,
    detailError,
    selectSession,
    changePage,
    changeDateType,
    search,
    refresh,
  }
}
