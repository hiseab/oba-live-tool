import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_START_STEPS,
  runAutoStart,
  summarizeAutoStart,
  supportsAutoStart,
} from '@/hooks/useAutoStart'

function makeRunners(overrides: Partial<Record<string, () => Promise<void>>> = {}) {
  const order: string[] = []
  const runner = (name: string) => async () => {
    order.push(name)
  }
  return {
    order,
    runners: {
      autoMessage: overrides.autoMessage ?? runner('autoMessage'),
      autoPopUp: overrides.autoPopUp ?? runner('autoPopUp'),
      commentListener: overrides.commentListener ?? runner('commentListener'),
      autoReply: overrides.autoReply ?? runner('autoReply'),
    },
  }
}

describe('自动启动编排', () => {
  it('评论监听必须先于自动回复', () => {
    const listenerIndex = AUTO_START_STEPS.indexOf('commentListener')
    const replyIndex = AUTO_START_STEPS.indexOf('autoReply')
    expect(listenerIndex).toBeGreaterThanOrEqual(0)
    expect(listenerIndex).toBeLessThan(replyIndex)
  })

  it('按既定顺序依次执行', async () => {
    const { order, runners } = makeRunners()
    await runAutoStart(runners)
    expect(order).toEqual(['autoMessage', 'autoPopUp', 'commentListener', 'autoReply'])
  })

  it('某一步失败不阻断后续步骤', async () => {
    const order: string[] = []
    const results = await runAutoStart({
      autoMessage: async () => {
        throw new Error('必须提供至少一条消息')
      },
      autoPopUp: async () => {
        order.push('autoPopUp')
      },
      commentListener: async () => {
        order.push('commentListener')
      },
      autoReply: async () => {
        order.push('autoReply')
      },
    })

    expect(order).toEqual(['autoPopUp', 'commentListener', 'autoReply'])
    expect(results[0]).toEqual({
      step: 'autoMessage',
      ok: false,
      error: '必须提供至少一条消息',
    })
    expect(results.filter(r => r.ok)).toHaveLength(3)
  })

  it('监听失败时自动回复仍会置位', async () => {
    const autoReply = vi.fn(async () => {})
    const results = await runAutoStart({
      autoMessage: async () => {},
      autoPopUp: async () => {},
      commentListener: async () => {
        throw new Error('监听评论失败')
      },
      autoReply,
    })
    expect(autoReply).toHaveBeenCalledOnce()
    expect(results.find(r => r.step === 'commentListener')?.ok).toBe(false)
  })
})

describe('汇总提示', () => {
  it('区分成功与失败并译出任务名', async () => {
    const results = await runAutoStart({
      autoMessage: async () => {
        throw new Error('必须提供至少一条消息')
      },
      autoPopUp: async () => {},
      commentListener: async () => {},
      autoReply: async () => {},
    })
    const { succeeded, failed } = summarizeAutoStart(results)
    expect(succeeded).toEqual(['自动弹窗', '评论监听', '自动回复'])
    expect(failed).toEqual([{ name: '自动发言', error: '必须提供至少一条消息' }])
  })
})

describe('平台支持判定', () => {
  it('抖音团购不支持自动启动', () => {
    expect(supportsAutoStart('eos')).toBe(false)
  })

  it('其余平台支持自动启动', () => {
    for (const platform of [
      'douyin',
      'buyin',
      'kuaishou',
      'wxchannel',
      'xiaohongshu',
      'pgy',
      'taobao',
    ] as LiveControlPlatform[]) {
      expect(supportsAutoStart(platform)).toBe(true)
    }
  })
})
