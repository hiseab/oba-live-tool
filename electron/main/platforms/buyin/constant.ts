import { SELECTORS as DY_SELECTORS } from '../douyin/constant'

export const URLS = {
  LIVE_CONTROL_PAGE: 'https://buyin.jinritemai.com/dashboard/live/control',
  LOGIN_PAGE: 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24',
  /** 百应的电商罗盘主页 */
  COMPASS_INDEX: 'https://compass.jinritemai.com/talent',
  LIVE_DETAILS_PAGE: 'https://compass.jinritemai.com/talent/live-detail?from=baiying_console',
  LIVE_REVIEW_PAGE: 'https://compass.jinritemai.com/talent/live-overview?from=baiying_console',
  COMPASS_SCREEN_WITH_LIVE_ROOM_ID:
    'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=',
} as const

export const REGEXPS = {
  LOGIN_PAGE: /douyinec\.com/,
}

export const SELECTORS = {
  ...DY_SELECTORS,
  LOGGED_IN: '[class^="header"]',
  IN_LIVE_CONTROL: '[class^="goodsPanel"]',
  ACCOUNT_NAME: 'span.btn-item-role-exchange-name__title',
} as const
