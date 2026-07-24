import assert from 'node:assert/strict'
import test from 'node:test'
// biome-ignore lint/correctness/noUnusedImports: tsx 当前测试执行模式需要 React 位于 JSX 作用域
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LiveSessionSummary } from '../shared/liveDetails'
import LiveSessionList from '../src/pages/LiveDetails/components/LiveSessionList'

test('LiveSessionList renders the ten official core metrics', () => {
  const item = {
    id: 'session-1',
    title: '测试直播间',
    startTime: '2026/07/15 19:30',
    duration: '2小时15分30秒',
    viewerCount: '12,345',
    avgWatchDuration: '1分28秒',
    avgOnlineCount: '678',
    productClickRate: '23.45%',
    gmv: '¥45,678.90',
    orderCount: 321,
    hourlyGmv: '¥20,301.73',
    estimatedCommission: '¥3,456.78',
    metrics: {},
  } as LiveSessionSummary

  const markup = renderToStaticMarkup(
    <LiveSessionList
      items={[item]}
      total={1}
      page={1}
      pageSize={10}
      selectedSessionId={null}
      loading={false}
      onSelect={() => undefined}
      onPageChange={() => undefined}
    />,
  )

  for (const text of [
    '开播时间',
    '开播时长',
    '直播间观看人数',
    '人均观看时长',
    '平均在线人数',
    '商品点击率(人数)',
    '直播间成交金额',
    '直播间成交订单数',
    '单小时GMV',
    '预估佣金收入',
    '2026/07/15 19:30',
    '2小时15分30秒',
    '12,345',
    '1分28秒',
    '678',
    '23.45%',
    '¥45,678.90',
    '321',
    '¥20,301.73',
    '¥3,456.78',
  ]) {
    assert.match(markup, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('LiveSessionList preserves numeric zero metrics', () => {
  const item = {
    id: 'session-zero',
    title: '零值直播间',
    startTime: '2026/07/16 01:40',
    duration: '37秒',
    viewerCount: 0,
    avgWatchDuration: 0,
    avgOnlineCount: 0,
    productClickRate: 0,
    gmv: 0,
    orderCount: 0,
    hourlyGmv: 0,
    estimatedCommission: 0,
    metrics: {},
  } as LiveSessionSummary

  const markup = renderToStaticMarkup(
    <LiveSessionList
      items={[item]}
      total={1}
      page={1}
      pageSize={10}
      selectedSessionId={null}
      loading={false}
      onSelect={() => undefined}
      onPageChange={() => undefined}
    />,
  )

  assert.equal((markup.match(/>0<\/td>/g) ?? []).length, 8)
  assert.doesNotMatch(markup, />--<\/td>/)
})
