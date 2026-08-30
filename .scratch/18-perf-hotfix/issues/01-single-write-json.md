# 收敛 writeJson 单一实现

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** host 半区只剩一份 JSON 响应写入实现——`session-messages` 与 `import-api` 统一从 `http-shared` 导入 `writeJson`，`import-api` 不再同时绑定两个同名 `writeJson`；改动 writeJson 行为可一处生效。

**验收标准：**

- [ ] `json-response.ts` 已删除，全仓无第二份 `writeJson` 实现
- [ ] `import-api` 无重复同名导入绑定，`session-messages` 改用 `http-shared` 导入
- [ ] `tests/host/` 全量测试零改动全绿
- [ ] `npm run build && npm run verify` 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮无发现项（标准/spec 双维度）；工单置 `done`，随 M1 里程碑提交。
- 2026-08-30（实现）：删除 `src/host/json-response.ts`；`import-api.ts` 删除 `./json-response.ts` 重复同名导入绑定；`session-messages.ts` 改从 `./http-shared.ts` 导入 `writeJson`。`tests/host/` 84 项零改动全绿；`typecheck` / `build` / `verify` 全绿。
- 来源：PRD 18-perf-hotfix 候选 C1；证据见 memorial 017 archived `index.html`（http-shared.ts:29-40 与 json-response.ts:13-20 逐字等价；import-api.ts:34-38/:47；session-messages.ts:32）。
