# 巨量百应直播明细 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变巨量百应中控台主页面的前提下，新增仅百应账号可见的历史直播场次列表，并在同页查看单场基础、交易、核心指标和商品数据。

**Architecture:** `BuyinPlatform` 在现有已登录 `BrowserContext` 中惰性创建独立 Compass Page，通过页面上下文中的 `fetch` 请求官方 JSON 接口；解析器把内部响应转换成稳定、可序列化的共享类型。`AccountSession` 和 typed IPC 只传递标准结果，Renderer hook 负责账号切换、分页、日期范围和竞态控制，页面使用列表加详情侧栏展示。

**Tech Stack:** Electron、Playwright、React 19、TypeScript、Zustand、Tailwind CSS、Node Test Runner、tsx、Biome。

---

## 已确认的官方接口

- 历史列表：`GET /compass_api/content_live/author/live_detail/history_live`
- 单场基础：`GET /compass_api/author/live/live_room_detail/basic_info`
- 单场交易：`GET /compass_api/author/live/live_room_detail/trade_info`
- 单场核心指标：`GET /compass_api/author/live/live_room_detail/core_group_info`
- 单场商品：`GET /compass_api/author/live/live_room_detail/products_card_detail`

历史列表响应使用 `data_head`、`index_selected`、`index_groups`、`data_result`、`page_result.total`；单场接口统一以 `live_room_id` 请求，商品接口还使用 `page_no`、`page_size`、`sort_field=pay_amt`、`is_asc=false`。

### Task 1: 共享类型、请求参数和响应解析器

**Files:**
- Create: `shared/liveDetails.ts`
- Create: `electron/main/platforms/buyin/liveDetailsParser.ts`
- Create: `tests/fixtures/buyin-live-session-list.json`
- Create: `tests/fixtures/buyin-live-session-detail.json`
- Create: `tests/buyinLiveDetailsParser.test.ts`

- [ ] **Step 1: 写历史列表解析失败测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import listFixture from './fixtures/buyin-live-session-list.json'
import { parseLiveSessionPage } from '../electron/main/platforms/buyin/liveDetailsParser'

test('parseLiveSessionPage normalizes rows and pagination', () => {
  const page = parseLiveSessionPage(listFixture)
  assert.equal(page.total, 1)
  assert.equal(page.items[0]?.id, '7345000000000000000')
  assert.equal(page.items[0]?.title, '测试直播间')
  assert.equal(page.items[0]?.viewerCount, '12,345')
})
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsParser.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../electron/main/platforms/buyin/liveDetailsParser'`。

- [ ] **Step 3: 新增稳定共享类型和最小列表解析实现**

```ts
export type LiveMetricValue = string | number | boolean | null

export interface LiveSessionSummary {
  id: string
  liveAppId?: string
  title: string
  coverUrl?: string
  startTime?: string
  duration?: string
  viewerCount?: LiveMetricValue
  avgWatchDuration?: LiveMetricValue
  orderCount?: LiveMetricValue
  gmv?: LiveMetricValue
  metrics: Record<string, LiveMetricValue>
}

export interface LiveSessionPage {
  items: LiveSessionSummary[]
  total: number
  page: number
  pageSize: number
}
```

解析器只接受 `unknown`，检查 `st`、`data_result` 和 `page_result`，从 `operation.live_id`、`operation.live_app_id` 及已知列构造 `LiveSessionSummary`，并保留所有标量列到 `metrics`。

- [ ] **Step 4: 运行列表测试确认通过**

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsParser.test.ts`

Expected: PASS 1 test。

- [ ] **Step 5: 写单场聚合解析失败测试**

```ts
import detailFixture from './fixtures/buyin-live-session-detail.json'
import { parseLiveSessionDetail } from '../electron/main/platforms/buyin/liveDetailsParser'

test('parseLiveSessionDetail keeps core groups and product metrics', () => {
  const detail = parseLiveSessionDetail('7345000000000000000', detailFixture)
  assert.equal(detail.sessionId, '7345000000000000000')
  assert.equal(detail.title, '测试直播间')
  assert.equal(detail.metricGroups[0]?.title, '流量表现')
  assert.equal(detail.products[0]?.title, '测试商品')
})
```

- [ ] **Step 6: 实现单场解析并确认全部测试通过**

解析器从 `basic.data.live_room_base_info`、`trade.data`、`core.data.index_group` 和 `products.data.products_detail` 读取数据；未知标量字段按原 key 保留，数组和对象递归转换为分组，不把原始响应暴露给 Renderer。

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsParser.test.ts`

Expected: PASS 2 tests。

- [ ] **Step 7: 提交共享类型和解析器**

```powershell
git add shared/liveDetails.ts electron/main/platforms/buyin/liveDetailsParser.ts tests/fixtures/buyin-live-session-list.json tests/fixtures/buyin-live-session-detail.json tests/buyinLiveDetailsParser.test.ts
git commit -m "feat: parse buyin live detail data"
```

### Task 2: 百应独立 Compass Page、请求与 30 秒缓存

**Files:**
- Create: `electron/main/platforms/buyin/liveDetails.ts`
- Create: `tests/buyinLiveDetailsSource.test.ts`
- Modify: `electron/main/platforms/buyin/constant.ts`

- [ ] **Step 1: 写查询参数和缓存失败测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHistoryLiveParams, LiveDetailsCache } from '../electron/main/platforms/buyin/liveDetails'

test('buildHistoryLiveParams creates the official list query', () => {
  assert.deepEqual(
    buildHistoryLiveParams({ page: 2, pageSize: 20, rangeDays: 30 }),
    {
      page_no: 2,
      page_size: 20,
      date_type: 30,
      index_selected: '',
      filter_type: '',
      is_asc: false,
    },
  )
})

test('LiveDetailsCache expires entries after ttl', () => {
  let now = 1000
  const cache = new LiveDetailsCache<number>(30_000, () => now)
  cache.set('key', 1)
  assert.equal(cache.get('key'), 1)
  now += 30_001
  assert.equal(cache.get('key'), undefined)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsSource.test.ts`

Expected: FAIL，模块或导出不存在。

- [ ] **Step 3: 实现纯查询构造器、缓存和数据源**

`BuyinLiveDetailsSource` 接收中控台 `Page`，惰性调用 `page.context().newPage()`，进入 `https://compass.jinritemai.com/talent/live-detail?from=baiying_console`。所有接口通过 Compass Page 中的同源 `fetch`、`credentials: 'include'` 和 `AbortController` 请求，超时固定 30 秒；列表缓存 key 包含分页和日期，详情缓存 key 包含 `live_room_id`，TTL 30 秒，`forceRefresh` 绕过缓存。

```ts
const LIVE_DETAILS_URL = 'https://compass.jinritemai.com/talent/live-detail?from=baiying_console'
const HISTORY_LIVE_API = '/compass_api/content_live/author/live_detail/history_live'
const BASIC_INFO_API = '/compass_api/author/live/live_room_detail/basic_info'
const TRADE_INFO_API = '/compass_api/author/live/live_room_detail/trade_info'
const CORE_GROUP_INFO_API = '/compass_api/author/live/live_room_detail/core_group_info'
const PRODUCTS_API = '/compass_api/author/live/live_room_detail/products_card_detail'
```

- [ ] **Step 4: 运行数据源测试确认通过**

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsSource.test.ts`

Expected: PASS 2 tests。

- [ ] **Step 5: 提交数据源**

```powershell
git add electron/main/platforms/buyin/liveDetails.ts electron/main/platforms/buyin/constant.ts tests/buyinLiveDetailsSource.test.ts
git commit -m "feat: add buyin live details source"
```

### Task 3: 平台能力、AccountSession 和 typed IPC

**Files:**
- Modify: `electron/main/platforms/IPlatform.ts`
- Modify: `electron/main/platforms/buyin/index.ts`
- Modify: `electron/main/services/AccountSession.ts`
- Modify: `shared/ipcChannels.ts`
- Modify: `shared/electron-api.d.ts`
- Create: `electron/main/ipc/liveDetails.ts`
- Modify: `electron/main/ipc/index.ts`

- [ ] **Step 1: 在共享类型中定义可序列化 IPC 结果**

```ts
export type LiveDetailsErrorCode =
  | 'NOT_CONNECTED'
  | 'NOT_SUPPORTED'
  | 'LOGIN_EXPIRED'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'SCHEMA_CHANGED'
  | 'UNKNOWN'

export type LiveDetailsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: LiveDetailsErrorCode; message: string } }
```

- [ ] **Step 2: 增加 `ILiveDetailProvider` 能力和 type guard**

```ts
export interface ILiveDetailProvider {
  _isLiveDetailProvider: true
  getLiveSessionList(params: LiveSessionListParams): Promise<LiveSessionPage>
  getLiveSessionDetail(params: LiveSessionDetailParams): Promise<LiveSessionDetail>
  disposeLiveDetails(): Promise<void>
}

export function isLiveDetailProvider(
  platform: IPlatform,
): platform is IPlatform & ILiveDetailProvider {
  return '_isLiveDetailProvider' in platform && platform._isLiveDetailProvider === true
}
```

- [ ] **Step 3: 让 `BuyinPlatform` 委托数据源并在断开时清理独立 Page**

`connect()` 成功后保留 `mainPage`；首次请求时创建 `BuyinLiveDetailsSource`。`disconnect()` 只关闭直播明细 Page、停止评论监听并清空引用，浏览器进程仍由 `AccountSession.disconnect()` 关闭。

- [ ] **Step 4: 在 `AccountSession` 增加能力 guard**

```ts
public getLiveSessionList(params: LiveSessionListParams) {
  if (!isLiveDetailProvider(this.platform)) {
    throw new TaskNotSupportedError({ taskName: '直播明细', targetName: this.platform.platformName })
  }
  return this.platform.getLiveSessionList(params)
}
```

详情方法同样委托 `getLiveSessionDetail`。

- [ ] **Step 5: 注册 typed IPC 并统一错误映射**

新增：

```ts
liveDetails: {
  list: 'tasks:liveDetails:list',
  detail: 'tasks:liveDetails:detail',
}
```

IPC handler 使用 `accountManager.getSession(accountId)`，成功返回 `{ ok: true, data }`；账号不存在、能力不支持、登录失效、403、AbortError、404 和解析异常分别映射为共享错误码，不返回 `Error` 实例或 Playwright 对象。

- [ ] **Step 6: 运行类型检查**

Run: `./node_modules/.bin/tsc.CMD --noEmit`

Expected: exit 0。

- [ ] **Step 7: 提交平台和 IPC**

```powershell
git add electron/main/platforms/IPlatform.ts electron/main/platforms/buyin/index.ts electron/main/services/AccountSession.ts shared/ipcChannels.ts shared/electron-api.d.ts electron/main/ipc/liveDetails.ts electron/main/ipc/index.ts
git commit -m "feat: expose buyin live details ipc"
```

### Task 4: Renderer 数据 hook 与请求竞态保护

**Files:**
- Create: `src/hooks/useLiveDetails.ts`

- [ ] **Step 1: 实现按当前账号隔离的列表和详情状态**

Hook 读取 `useAccounts(state => state.currentAccountId)`、`useCurrentLiveControl` 的平台和连接状态。默认 `rangeDays=30`、`page=1`、`pageSize=20`，列表或详情请求开始时递增 request id；响应返回时只有 accountId 和 request id 仍匹配才写入状态。

```ts
const DEFAULT_RANGE_DAYS = 30
const DEFAULT_PAGE_SIZE = 20

const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveDetails.list, {
  accountId,
  params: { page, pageSize, rangeDays, forceRefresh },
})
```

- [ ] **Step 2: 处理连接、平台和标准错误状态**

未连接时不发 IPC 并返回“请先连接巨量百应中控台”；非 `buyin` 返回“当前平台不支持直播明细”；标准错误码映射为可重试中文消息。

- [ ] **Step 3: 运行类型检查**

Run: `./node_modules/.bin/tsc.CMD --noEmit`

Expected: exit 0。

- [ ] **Step 4: 提交 hook**

```powershell
git add src/hooks/useLiveDetails.ts
git commit -m "feat: manage live details state"
```

### Task 5: 历史列表与同页详情侧栏

**Files:**
- Create: `src/pages/LiveDetails/index.tsx`
- Create: `src/pages/LiveDetails/components/LiveSessionList.tsx`
- Create: `src/pages/LiveDetails/components/LiveSessionDetail.tsx`
- Create: `src/pages/LiveDetails/components/MetricGroup.tsx`
- Modify: `src/router/index.tsx`
- Modify: `src/components/common/Sidebar.tsx`

- [ ] **Step 1: 新增百应专属导航和路由**

Sidebar tab：

```tsx
{
  id: '/live-details',
  name: '直播明细',
  icon: <RadioTower className="w-5 h-5" />,
  platform: ['buyin'],
}
```

Router child：

```tsx
{
  path: '/live-details',
  element: <LiveDetails />,
}
```

- [ ] **Step 2: 实现场次列表状态**

列表必须覆盖：未连接提示、加载 Skeleton、错误 Alert + 重试、空列表、成功表格、上一页/下一页、主动刷新。列显示直播间、开播时间、时长、观看人数、人均观看时长、成交订单数、成交金额；点击行调用 `selectSession(id)`。

- [ ] **Step 3: 实现详情侧栏**

宽屏使用固定右栏，窄屏自然排在列表下方。详情必须覆盖未选择、加载、错误、成功四种状态；成功时显示直播标题、基础信息、交易信息、官方核心指标分组和商品指标，未知标量指标也按 key/value 展示。

- [ ] **Step 4: 运行 Renderer 构建**

Run: `./node_modules/.bin/vite.CMD build --mode=test`

Expected: exit 0，生成 `dist/` 和 `dist-electron/`。

- [ ] **Step 5: 提交页面**

```powershell
git add src/pages/LiveDetails src/router/index.tsx src/components/common/Sidebar.tsx
git commit -m "feat: add buyin live details page"
```

### Task 6: 全量验证、人工验证说明和项目记忆

**Files:**
- Modify: `agent-memory/context.md`
- Modify: `agent-memory/progress.md`
- Modify: `agent-memory/bugs.md`

- [ ] **Step 1: 运行新增测试**

Run: `./node_modules/.bin/tsx.CMD --test tests/buyinLiveDetailsParser.test.ts tests/buyinLiveDetailsSource.test.ts`

Expected: 所有测试 PASS，0 failures。

- [ ] **Step 2: 检查相关文件格式和静态规则**

Run: `./node_modules/.bin/biome.CMD check shared/liveDetails.ts electron/main/platforms/buyin/liveDetailsParser.ts electron/main/platforms/buyin/liveDetails.ts electron/main/platforms/IPlatform.ts electron/main/platforms/buyin/index.ts electron/main/services/AccountSession.ts electron/main/ipc/liveDetails.ts electron/main/ipc/index.ts shared/ipcChannels.ts shared/electron-api.d.ts src/hooks/useLiveDetails.ts src/pages/LiveDetails src/router/index.tsx src/components/common/Sidebar.tsx tests/buyinLiveDetailsParser.test.ts tests/buyinLiveDetailsSource.test.ts`

Expected: exit 0。

- [ ] **Step 3: 运行类型检查和测试模式构建**

Run: `./node_modules/.bin/tsc.CMD --noEmit`

Expected: exit 0。

Run: `./node_modules/.bin/vite.CMD build --mode=test`

Expected: exit 0。

- [ ] **Step 4: 检查补丁质量**

Run: `git diff --check`

Expected: 无输出，exit 0。

Run: `git status --short`

Expected: 仅出现本功能和 `agent-memory/` 的预期文件。

- [ ] **Step 5: 更新项目记忆**

`context.md` 记录正式架构和接口；`progress.md` 记录已完成、验证结果和真实账号人工验证步骤；`bugs.md` 保留内部接口升级、账号权限差异和未在当前会话真实登录账号验证的风险。

- [ ] **Step 6: 最终人工验证**

在应用内连接巨量百应账号，进入“直播明细”：默认显示最近 30 天、每页 20 场；翻页和刷新有效；点击场次显示基础、交易、核心指标和商品；同时启动自动回复，确认中控台主页面没有跳转且任务不中断；切换账号后旧账号数据不再显示。
