# 项目上下文

## 项目概述
- 项目名称：oba-live-tool。
- 项目目标：为多直播平台提供直播控制、自动回复、自动发言等 Electron 桌面能力。
- 当前范围：修复自动回复设置更新时的前端运行时异常。

## 技术与架构
- 技术栈：Electron、React 19、TypeScript、Vite、Zustand、Immer、Lodash ES。
- 关键目录：`src/hooks/` 状态逻辑，`src/pages/AutoReply/` 自动回复界面，`electron/` 主进程。
- 核心模块：`src/hooks/useAutoReplyConfig.ts` 管理按账号持久化的自动回复配置。

## 约束与约定
- 仓库约定：默认中文沟通；非简单任务维护 `agent-memory/`；最小改动并执行匹配验证。
- 环境约束：Windows PowerShell；沙箱读取 pnpm 依赖缓存可能触发 EPERM，必要时申请只读执行授权。
- 不可变更项：保留用户现有的 `.npmrc`、`package.json`、`pnpm-workspace.yaml` 未提交改动，不做无关依赖调整。

## 关键决策
- 先通过最小运行时复现确认根因，再修改 Store；不在 UI 事件外层吞错。

## 待确认事项
- 暂无。
