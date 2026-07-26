import { autoReplyPlatforms } from '@/abilities'

/** 自动启动涉及的任务，按启动顺序排列 */
export const AUTO_START_STEPS = [
  'autoMessage',
  'autoPopUp',
  'commentListener',
  'autoReply',
] as const

export type AutoStartStep = (typeof AUTO_START_STEPS)[number]

export const AUTO_START_STEP_NAMES: Record<AutoStartStep, string> = {
  autoMessage: '自动发言',
  autoPopUp: '自动弹窗',
  commentListener: '评论监听',
  autoReply: '自动回复',
}

/**
 * 该平台是否支持自动启动。
 * 抖音团购（eos）结构上不具备自动回复能力，禁用整个开关（ADR-0007 第 3 条）。
 */
export function supportsAutoStart(platform: LiveControlPlatform): boolean {
  return autoReplyPlatforms.includes(platform)
}

export interface AutoStartStepResult {
  step: AutoStartStep
  ok: boolean
  error?: string
}

export interface AutoStartRunners {
  autoMessage: () => Promise<void>
  autoPopUp: () => Promise<void>
  commentListener: () => Promise<void>
  autoReply: () => Promise<void>
}

/**
 * 依次执行各步骤，互不阻塞：任一步失败仅记录，后续步骤继续。
 * 顺序由 AUTO_START_STEPS 决定，其中评论监听必须先于自动回复（ADR-0007 第 1 条）。
 */
export async function runAutoStart(runners: AutoStartRunners): Promise<AutoStartStepResult[]> {
  const results: AutoStartStepResult[] = []
  for (const step of AUTO_START_STEPS) {
    try {
      await runners[step]()
      results.push({ step, ok: true })
    } catch (error) {
      results.push({
        step,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

/** 汇总提示文案：成功列出任务名，失败单独列出。 */
export function summarizeAutoStart(results: AutoStartStepResult[]): {
  succeeded: string[]
  failed: { name: string; error?: string }[]
} {
  return {
    succeeded: results.filter(r => r.ok).map(r => AUTO_START_STEP_NAMES[r.step]),
    failed: results
      .filter(r => !r.ok)
      .map(r => ({ name: AUTO_START_STEP_NAMES[r.step], error: r.error })),
  }
}
