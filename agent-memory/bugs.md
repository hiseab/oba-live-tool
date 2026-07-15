# 问题与风险

## 当前问题
- 暂无；自动回复设置的 Proxy invariant 已通过 Store 级回归测试修复。

## 当前风险
- 工作区仍有用户未提交的 `.npmrc`、`package.json`、`pnpm-workspace.yaml` 改动，本次未修改或覆盖其内容。

## 失败尝试
- Node REPL 未能从 pnpm junction 解析 `immer`；改用项目已有 `tsx` 完成只读最小复现。
- 首次 PowerShell 文本替换因 CRLF 不匹配而安全停止，随后使用范围受限的正则替换；并已移除 PowerShell 写入产生的 UTF-8 BOM。

## 已知限制
- 自动化测试覆盖 Store 更新，但未启动真实 Electron 应用执行 UI 点击。
- Vite 构建存在项目既有的单 chunk 大于 500 kB 警告，与本次修复无关。

## 待跟进事项
- 若其他 Store 后续出现相同异常，检查是否也在 Immer producer 内将 draft 传给 Lodash 深合并工具。