# 项目上下文

## 项目概述
- Electron + React 直播工具；主进程位于 `electron/main`，共享类型位于 `shared/`，Renderer 位于 `src/`。
- 百应直播明细通过 `BuyinLiveDetailsSource` 复用已登录 `BrowserContext`，惰性创建独立 Compass Page，不改变中控台主页面。
- 主进程通过 `tasks.liveDetails.list` 和 `tasks.liveDetails.detail` typed IPC 返回标准可序列化数据；列表和详情各缓存 30 秒，主动刷新绕过缓存。
- Renderer 路由为 `/live-details`，仅 `buyin` 平台显示侧边栏入口，默认最近 30 天、每页 10 场，与官方页面一致。

## 约束与约定
- 仓库约定：默认中文沟通；非简单任务维护 `agent-memory/`；最小改动并执行匹配验证。
- 环境约束：Windows PowerShell；页面内部接口需要用已登录账号做最终人工验证。
- 安全约束：不向 Renderer、日志或项目文件暴露 Cookie、Token、Authorization、动态安全参数、真实直播间 ID 或完整敏感响应体。
- 不可变更项：不做无关依赖调整，不覆盖用户或其他任务已有修改。

## 已确认接口契约
- 历史列表接口：`/compass_api/content_live/author/live_detail/history_live`。
- 官方近 7/30/90 天的 `date_type` 分别为 `21/23/24`。
- 历史列表必须携带：`begin_date`（北京时间开始日 00:00 的秒级时间戳）、`begin_date_format`（`YYYY-MM-DDT00:00:00+08:00`）、`filter_type=0`；`index_selected` 必须显式传入应用表格使用的 8 个动态指标，不能依赖官方页面的“配置列表项”本地状态。
- 开始日按包含当天的自然日范围计算：7/30/90 天分别回退 6/29/89 天。
- 列表默认 `page_size=10`，与官方页面一致；显式分页参数仍由调用方传入。
- 单场详情聚合接口：`basic_info`、`trade_info`、`core_group_info`、`products_card_detail`。
- 官方商品卡请求会携带 `live_room_id`、`page_no`、`page_size`、`sort_field`、`is_asc`，现有分页与排序方向应保留。
- 官方请求层会追加动态安全参数；禁止复制、固化或记录这些参数。
- 历史列表核心字段已由官方页面确认：`watch_ucnt`（直播间观看人数）、`avg_watch_duration`（人均观看时长）、`acu`（平均在线人数）、`product_click_rate`（商品点击率〔人数〕）、`pay_gmv`（直播间成交金额）、`pay_order_cnt`（直播间成交订单数）、`avg_hour_pay_amt`（单小时 GMV）、`predict_commission`（预估佣金收入）。
- 开播时间列是组合字段：行级 `start_time` 为对象，其中 `start_time.start_time` 是开播时间，`start_time.live_duration` 是开播时长；解析器同时兼容旧的行级扁平 `start_time` / `live_duration`。

## 关键决策
- 使用巨量百应页面同源官方 JSON 接口，不依赖易变 DOM class。
- 新建 Compass Page 时先等待官方页面自身首个历史列表响应，再执行应用的同源请求，避免在页面请求环境尚未初始化时抢跑。
- 官方空字符串查询参数必须保留；数字 0 也必须保留。
- 商品 `products_card` 中的 `index_name/index_display/index_value` 会合并到商品指标并保留中文标签。
- Compass 页面跳转到其他域名或同域登录路径时按登录状态失效处理。

## 待确认事项
- 修复后需要在应用自身已连接的真实百应账号下确认：同源原生请求是否能复用页面安全环境、真实字段兼容性和历史数据可见范围。
