# 巨量百应直播明细功能设计

## 1. 背景

oba-live-tool 已能连接巨量百应中控台，并在同一 Playwright `BrowserContext` 中打开电商罗盘页面复用登录态。当前项目尚未读取电商罗盘“直播明细”中的历史场次列表和单场完整指标。

本功能为已连接的巨量百应账号增加独立“直播明细”页面，在不影响中控台、自动回复、自动弹窗和自动发言任务的前提下读取账号有权限查看的历史数据。

## 2. 目标

- 在侧边栏增加仅巨量百应平台可见的“直播明细”入口。
- 展示当前账号的历史直播场次列表，支持日期筛选、刷新和分页。
- 点击场次后展示该场直播的完整可用指标。
- 复用现有浏览器登录态，不要求用户重复登录罗盘。
- 对登录失效、未连接、无权限、超时和接口升级提供明确错误提示。

## 3. 非目标

- 第一版不提供 Excel 导出。
- 第一版不长期持久化直播经营数据，只允许短期内存缓存。
- 第一版不支持抖音小店、视频号、淘宝、快手等其他平台。
- 第一版不保证展示账号无权访问或目标接口未返回的指标。
- 不通过 DOM class 抓取作为主要数据源。

## 4. 技术方案选择

### 4.1 采用方案

复用巨量百应中控台 Page 所属的 `BrowserContext`，创建独立电商罗盘 Page。先监听目标页面发出的 XHR/Fetch JSON，确认历史列表和单场详情的真实接口，再由百应平台适配器复用相同登录凭证请求数据。

推荐顺序：

1. 在 response 监听器中记录目标页面的候选 JSON 请求。
2. 确认接口 URL、method、query/body、分页参数、响应结构和错误码。
3. 优先在罗盘页面上下文中重放请求，以继承 Cookie、CSRF 和页面动态参数。
4. 若接口可由 Playwright `APIRequestContext` 稳定调用，再封装为直接请求。

### 4.2 不采用方案

- DOM 抓取：容易受动态 class、虚拟列表和页面改版影响。
- 第一版直接接入开放平台：需要额外应用资质和授权，且不确定是否覆盖罗盘页面全部指标。

## 5. 页面与交互

### 5.1 路由和入口

- 路由：`/live-details`
- 侧边栏名称：`直播明细`
- 可见平台：仅 `buyin`

### 5.2 页面结构

页面包含：

- 当前账号与连接状态。
- 日期范围筛选，默认最近 30 天。
- 刷新按钮。
- 历史场次表格。
- 分页控件，默认每页 20 场。
- 单场详情同页侧栏：桌面宽度下位于列表右侧，窄窗口下排列在列表下方。
- 加载、空数据、错误和重试状态。

若当前账号尚未连接巨量百应中控台，页面只显示连接提示，不发起数据请求。

### 5.3 历史场次列表

优先展示以下字段，最终以真实接口为准：

- 场次 ID。
- 直播标题或场次名称。
- 主播名称。
- 开播时间、结束时间和时长。
- 场次状态。
- 成交金额。
- 成交订单数。
- 观看人数。
- 最高在线人数。
- 新增粉丝数。

接口未返回的字段显示 `--`，不得根据其他字段猜测或伪造。

### 5.4 单场完整数据

详情按以下分组展示：

1. 基础信息：直播间、主播、开始时间、结束时间和时长。
2. 成交指标：成交金额、订单、成交人数、退款及其他成交指标。
3. 流量指标：曝光、观看、进入率、最高在线、平均在线和停留指标。
4. 互动指标：评论、点赞、分享、关注和粉丝团等。
5. 转化指标：商品曝光、点击、点击率、成交转化率等。
6. 商品指标：若详情接口包含商品数据，则按商品展示成交、订单、点击和转化指标。
7. 其他指标：接口返回但未建立固定映射的标量字段，以动态指标卡展示，避免字段升级导致数据静默丢失。

敏感请求信息、Cookie、Token、CSRF 和签名参数不得进入 Renderer，也不得写入日志。

## 6. 主进程架构

### 6.1 平台能力

新增可选平台能力：

```ts
interface ILiveDetailProvider {
  getLiveSessionList(params: LiveSessionListParams): Promise<LiveSessionPage>
  getLiveSessionDetail(sessionId: string): Promise<LiveSessionDetail>
}
```

仅 `BuyinPlatform` 实现该能力。`AccountSession` 负责校验当前会话和平台能力，IPC Handler 只调用 `AccountSession`，不直接访问平台私有字段。

### 6.2 调用链

```text
LiveDetails Renderer
  -> typed IPC
  -> AccountManager.getSession(accountId)
  -> AccountSession.getLiveSessionList/getLiveSessionDetail
  -> BuyinPlatform
  -> 独立 Compass Page / 页面上下文请求
  -> 数据解析与标准化
  -> Renderer
```

### 6.3 页面生命周期

- 从 `mainPage.context()` 创建独立 Page，不改变中控台主页面 URL。
- 同一账号最多保留一个直播明细 Page，避免重复打开。
- Page 关闭或会话断开后清理引用。
- 请求超时后停止等待，但不关闭中控台页面。
- 账号切换时请求必须携带明确的 `accountId`，返回结果不得串号。

## 7. 数据契约

真实字段确认后建立明确类型，第一版至少提供：

```ts
interface LiveSessionListParams {
  startDate: string
  endDate: string
  page: number
  pageSize: number
}

interface LiveSessionSummary {
  id: string
  title?: string
  anchorName?: string
  startedAt?: string
  endedAt?: string
  durationSeconds?: number
  status?: string
  metrics: Record<string, LiveMetricValue>
}

interface LiveSessionPage {
  items: LiveSessionSummary[]
  page: number
  pageSize: number
  total: number
}

interface LiveSessionDetail {
  id: string
  summary: LiveSessionSummary
  metricGroups: LiveMetricGroup[]
  products?: LiveProductMetric[]
}

type LiveMetricValue = string | number | boolean | null
```

解析器只接收接口原始响应并输出标准类型。页面组件不得直接依赖内部接口字段名。

## 8. IPC 设计

新增两个 typed IPC channel：

- `tasks.liveDetails.list`
- `tasks.liveDetails.detail`

请求必须包含 `accountId`。IPC 返回可序列化的成功结果或标准错误，不返回 Playwright 对象、Response、Error 原型或其他不可克隆值。

## 9. 缓存与刷新

- 历史场次列表按账号、日期、页码和页大小短期缓存。
- 单场详情按账号和场次 ID 短期缓存。
- 用户点击“刷新”时绕过缓存。
- 第一版缓存仅存在于内存，会话断开时清理。
- 缓存有效期固定为 30 秒；用户主动刷新时绕过缓存。

## 10. 错误处理

至少区分：

- 账号尚未连接中控台。
- 当前平台不支持直播明细。
- 罗盘登录态失效。
- 账号没有目标页面或数据权限。
- 列表或详情接口超时。
- 场次不存在或已删除。
- 内部接口结构变化，解析器无法识别。

Renderer 提供重试按钮；主进程日志记录错误类别和接口路径，但不记录 Cookie、Token、完整请求头或包含敏感信息的响应体。

## 11. 接口发现策略

实现前必须在真实已登录账号下抓取一次目标页面响应：

- 使用不含临时 `btm_*` 参数的稳定入口进入 `talent/live-detail`。
- 在 `goto` 前注册 response 监听器，避免遗漏首屏请求。
- 仅记录 `xhr`/`fetch` 且响应为 JSON 的候选请求。
- 对候选响应记录 URL path、method、分页参数、顶层字段和脱敏后的结构摘要。
- 手动或自动点击一个场次，确认详情请求与场次 ID 的对应关系。
- 将脱敏后的真实响应整理为测试 fixture；不得提交账号 Cookie、Token、主播真实隐私信息或完整订单信息。

若页面没有独立详情接口，则允许通过页面交互触发详情请求，但仍以接口 JSON 作为数据源，而不是抓取渲染后的 DOM 文本。

## 12. 测试与验证

### 12.1 自动化测试

- 列表响应解析：分页、缺失字段、数值字符串、空列表。
- 详情响应解析：指标分组、未知字段、商品列表、缺失可选字段。
- 平台能力检查：非百应平台返回不支持错误。
- IPC：账号不存在、会话未连接、成功结果可序列化。
- Renderer：未连接、加载、空列表、错误、列表成功和详情成功状态。

### 12.2 构建验证

- Biome 检查相关文件。
- Node/现有测试运行器执行新增测试。
- `tsc --noEmit`。
- `vite build --mode=test`。
- `git diff --check`。

### 12.3 人工验证

- 连接巨量百应后进入“直播明细”。
- 默认日期范围能显示历史场次。
- 翻页、日期筛选和刷新有效。
- 点击场次能显示完整详情。
- 自动回复或其他任务运行时打开直播明细，不导致中控台主页面跳转或任务停止。
- 切换账号后数据不串号。

## 13. 成功标准

- 已连接且有权限的巨量百应账号能够查看历史直播场次列表。
- 点击任一场次能够查看接口返回的全部可用核心指标和扩展标量指标。
- 未连接、无权限和接口升级均有明确错误，不产生未处理 Promise rejection。
- 数据读取不影响现有中控台任务。
- 自动化测试、类型检查和测试模式构建通过。