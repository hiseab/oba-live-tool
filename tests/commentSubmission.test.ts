import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { comment } from '../electron/main/platforms/helper'
import type { IElementFinder } from '../electron/main/platforms/IElementFinder'

function makeFinder() {
  const textarea = {
    fill: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
  }
  const submitButton = {
    dispatchEvent: vi.fn(async () => {}),
  }
  const getCommentTextarea = vi.fn(async () => Result.succeed(textarea))
  const getClickableSubmitCommentButton = vi.fn(async () => Result.succeed(submitButton))

  const finder = {
    getCommentTextarea,
    getClickableSubmitCommentButton,
    getPinTopLabel: vi.fn(),
  } as unknown as IElementFinder

  return {
    finder,
    textarea,
    submitButton,
    getCommentTextarea,
    getClickableSubmitCommentButton,
  }
}

const page = {} as Page

describe('评论提交方式', () => {
  it('Enter 模式填写后按回车，不点击发送区', async () => {
    const { finder, textarea, submitButton, getCommentTextarea, getClickableSubmitCommentButton } =
      makeFinder()

    const result = await comment(page, finder, '测试消息', false, { submitMethod: 'enter' })

    expect(Result.isSuccess(result)).toBe(true)
    expect(textarea.fill).toHaveBeenCalledWith('测试消息', { timeout: 5000 })
    expect(textarea.press).toHaveBeenCalledWith('Enter')
    expect(getCommentTextarea).toHaveBeenCalledTimes(2)
    expect(getClickableSubmitCommentButton).not.toHaveBeenCalled()
    expect(submitButton.dispatchEvent).not.toHaveBeenCalled()
  })

  it('默认模式仍点击发送按钮', async () => {
    const { finder, textarea, submitButton, getClickableSubmitCommentButton } = makeFinder()

    const result = await comment(page, finder, '测试消息')

    expect(Result.isSuccess(result)).toBe(true)
    expect(textarea.fill).toHaveBeenCalledWith('测试消息', { timeout: 5000 })
    expect(getClickableSubmitCommentButton).toHaveBeenCalledOnce()
    expect(submitButton.dispatchEvent).toHaveBeenCalledWith('click')
    expect(textarea.press).not.toHaveBeenCalled()
  })
})
