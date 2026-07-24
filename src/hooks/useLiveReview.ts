import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  getLiveReviewTransportErrorMessage,
  LIVE_REVIEW_DATE_TYPES,
  type LiveReviewDateType,
  type LiveReviewErrorCode,
  type LiveReviewOverview,
  type LiveReviewParams,
} from 'shared/liveReview'
import { useAccounts } from './useAccounts'
import { useCurrentLiveControl } from './useLiveControl'

export interface LiveReviewError {
  code: LiveReviewErrorCode
  message: string
}

export function useLiveReview() {
  const accountId = useAccounts(state => state.currentAccountId)
  const connectionStatus = useCurrentLiveControl(context => context.isConnected)
  const platform = useCurrentLiveControl(context => context.platform)
  const [data, setData] = useState<LiveReviewOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<LiveReviewError | null>(null)
  const [dateType, setDateType] = useState<LiveReviewDateType>(LIVE_REVIEW_DATE_TYPES.sevenDays)
  const [beginDate, setBeginDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activityId, setActivityId] = useState('')
  const [trendIndexCode, setTrendIndexCode] = useState('')
  const requestId = useRef(0)

  const connected = connectionStatus === 'connected'
  const supported = platform === 'buyin'
  const sessionKey = [accountId, connectionStatus, platform].join(':')

  const requestOverview = useCallback(
    async (nextParams: LiveReviewParams) => {
      if (!connected || !supported) return
      const currentRequestId = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const result = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.liveReview.overview,
          accountId,
          nextParams,
        )
        if (currentRequestId !== requestId.current) return
        if (!result.ok) {
          setError({ code: result.code, message: result.message })
          return
        }
        setData(result.data)
        const selectedIndex = result.data.problems?.selectedIndex
        if (selectedIndex) setTrendIndexCode(selectedIndex)
        if (result.data.range.activityId) setActivityId(result.data.range.activityId)
      } catch (cause) {
        if (currentRequestId !== requestId.current) return
        setError({ code: 'UNKNOWN', message: getLiveReviewTransportErrorMessage(cause) })
      } finally {
        if (currentRequestId === requestId.current) setLoading(false)
      }
    },
    [accountId, connected, supported],
  )

  const load = useCallback(
    async (overrides: Partial<LiveReviewParams> = {}) => {
      await requestOverview({
        dateType,
        beginDate: beginDate || undefined,
        endDate: endDate || undefined,
        activityId: activityId || undefined,
        trendIndexCode: trendIndexCode || undefined,
        ...overrides,
      })
    },
    [activityId, beginDate, dateType, endDate, requestOverview, trendIndexCode],
  )

  useEffect(() => {
    void sessionKey
    requestId.current += 1
    setData(null)
    setError(null)
    setLoading(false)
    setDateType(LIVE_REVIEW_DATE_TYPES.sevenDays)
    setBeginDate('')
    setEndDate('')
    setActivityId('')
    setTrendIndexCode('')
  }, [sessionKey])

  useEffect(() => {
    if (connected && supported) {
      void requestOverview({ dateType: LIVE_REVIEW_DATE_TYPES.sevenDays })
    }
  }, [connected, requestOverview, supported])

  const selectDateType = useCallback(
    (nextDateType: LiveReviewDateType) => {
      setDateType(nextDateType)
      if (nextDateType !== LIVE_REVIEW_DATE_TYPES.custom) {
        void load({ dateType: nextDateType })
      }
    },
    [load],
  )

  const selectTrendIndex = useCallback(
    (code: string) => {
      setTrendIndexCode(code)
      void load({ trendIndexCode: code })
    },
    [load],
  )

  return {
    activityId,
    beginDate,
    connected,
    data,
    dateType,
    endDate,
    error,
    loading,
    supported,
    trendIndexCode,
    load,
    selectDateType,
    selectTrendIndex,
    setActivityId,
    setBeginDate,
    setEndDate,
  }
}
