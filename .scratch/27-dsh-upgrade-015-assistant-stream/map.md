# Map：dsh 0.1.2-rc.1 → 0.1.5-rc.1 同步（assistant-stream 重构）

## 背景 / 触发

上游 deepseek-harness 发布 `dsh-v0.1.5-rc.1`（本仓库 E:\work\sp\deepseek-harness）。本项目仍钉 `^0.1.2-rc.1`。承前 `26-dsh-upgrade-migration`（升到 0.1.2-rc.1 + 迁移 off `dsh-client-runtime`）的下一段增量。

## 已做决策（调研结论）

- **版本范围**：`^0.1.2-rc.1` 不会跨预发布 tuple 自动到 0.1.5-rc.1，须显式改范围并按精确版本安装（`latest` dist-tag 停在 0.0.1-rc.1）。
- **破坏面**：harness 0.1.3→0.1.5 的 assistant-stream 重构移除 `assistant/chunk`、`ChunkRowEvent` / `'chunks'` 条目，重构 `SessionEventStream`（→ `RemoteJournalStream`，无 `open/dispose`）。试装 0.1.5-rc.1 跑 `tsc --noEmit`：**7 个错误全在** `packages/dsh-session-bubble/src/detail/detail-data.ts`，其余模块 0 错。
- **无需改动**：`ISessions` 契约（`list`/`binding`/`open`）、`SessionSummary`/`SessionListState`、`ContentBlock`、`cordis` 4.0.2、storage-domain、workspace-controller 均兼容。

## 拆解（tracer-bullet 垂直切片）

- `01` 依赖 bump + 固化破坏面（可立即开始）
- `02` 预览提取适配事件重构（blocked by 01）
- `03` 详情 transport 对接新 stream 生命周期（blocked by 01, 02；与 02 同文件不同段故后置）
- `04` 全量回归 build+verify+宿主冒烟（blocked by 02, 03）

## 迷雾 / 待观察

- 新 `RemoteJournalStream` 的取尾页/退订运行时行为未对活宿主实跑，工单 03/04 需在真机验证一次。
- 可选采纳面（`assistant/attempt.stream`、附件预览类型）暂列 04 评论，不并入同步主线。
