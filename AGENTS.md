# AGENTS.md

## 多代理要求

AGENTS.md 和 CODEBUDDY.md 内容必须保持一致。

## Agent skills

### Issue tracker

本地 markdown issue tracker（`.scratch/` 下）。参见 `docs/agents/issue-tracker.md`。

### triage 标签

五个标准 triage 角色，标签字符串与角色名相同（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。参见 `docs/agents/triage-labels.md`。

### 领域文档

单一上下文（仓库根目录 `CONTEXT.md` + `docs/adr/`）。参见 `docs/agents/domain.md`。

### 临时文件

所有临时脚本统一放在仓库 `.temp/scripts/` 下；其他临时文件（脚本输出、日志等）也要分类，放在 `.temp/` 的子目录下（如 `.temp/output/`、`.temp/logs/`），保证仓库根目录干净。
