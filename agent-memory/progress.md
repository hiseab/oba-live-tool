# 当前任务进度

## 当前目标
- 扩展百应历史直播场次列表，新增显示直播间成交金额、直播间成交订单数、单小时 GMV、预估佣金收入。

## 成功标准
- 列表每行在原有“直播间 + 六项核心指标”基础上新增上述四项指标，空值统一显示 `--`，数值 `0` 保持显示。
- 解析器使用官方真实字段 `pay_gmv`、`pay_order_cnt`、`avg_hour_pay_amt`、`predict_commission`。
- 请求参数、缓存、详情接口和场次选择行为保持不变。
- 定向测试、类型检查、测试模式构建、格式与差异检查通过。

## 范围边界
- 包含：列表共享类型、列表响应解析、历史场次表格列、对应 fixture/test。
- 不包含：列表配置交互、导出、详情页重构、其他平台、动态安全参数处理。

## 当前状态
- 状态：新增四项指标的字段确认、实现与自动化验证已完成，等待真实应用重新启动后验收。
- 当前阶段：TDD RED → GREEN 与构建验证完成。

## 已完成
- 使用已登录官方页面“配置列表项”确认四项真实字段：`pay_gmv`、`pay_order_cnt`、`avg_hour_pay_amt`、`predict_commission`。
- 为 `LiveSessionSummary` 增加 `hourlyGmv`、`estimatedCommission`，复用已有 `gmv`、`orderCount`。
- 列表解析器增加四项语义字段映射，原始标量仍保留在 `metrics` 中。
- 历史列表扩展为“直播间 + 十项指标”，Skeleton 跨列和横向滚动最小宽度同步调整。`r`n- 根因确认：官方“配置列表项”会把勾选字段以逗号分隔写入 `index_selected`；应用此前固定发送空字符串，动态指标不会稳定进入 `data_result`。`r`n- `buildHistoryLiveParams` 现显式请求 `watch_ucnt,avg_watch_duration,acu,product_click_rate,pay_gmv,pay_order_cnt,avg_hour_pay_amt,predict_commission`。`r`n- 已生成修复版：`release/1.6.1-metrics-fix/win-unpacked/oba-live-tool.exe`，并确认 app.asar 同时包含完整请求字段和四个新增列标签。
- 新增解析器与 React SSR 回归断言，覆盖四项新增字段、表头和值为 `0` 的显示。

## 下一步
- 用户在已启动的独立修复版中进入“直播明细”并点击刷新，确认开播时间、开播时长和 8 个动态指标均显示；本轮 Windows 自动操作被用户按 Escape 停止，后续由用户手工验收。

## 验证情况
- RED 验证：新增解析器字段和 UI 表头测试在实现前按预期失败。
- 定向测试：12 项通过，0 失败。
- TypeScript：`.\node_modules\.bin\tsc.CMD --noEmit` 通过。
- Biome：6 个本轮文件检查通过，无需修复。
- 测试模式构建：Renderer、Main、Preload 均成功；仅有项目既有的大 chunk 警告。
- 差异与编码检查：`git -c core.whitespace=cr-at-eol diff --check` 通过，本轮文件无 UTF-8 BOM。

## 待确认事项
- 真实应用中确认四项新增指标在有值、0 值和缺失值场景下均正确显示，点击场次仍可打开右侧详情。
