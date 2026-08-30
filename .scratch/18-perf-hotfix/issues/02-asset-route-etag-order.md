# 素材路由先 stat 判 304 再读盘

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 浏览器命中 304 的素材请求不再触发整文件磁盘读——先 `stat` 得到 ETag 所需的 size/mtime，命中 `if-none-match` 直接 304 返回；未命中时行为与现状逐字节等价。明确不启用强缓存。

**验收标准：**

- [ ] 素材路由读取顺序改为「先 stat → 判定 if-none-match → 命中直接 304，不 readFile」
- [ ] 未命中路径响应头（content-type / content-length / cache-control / etag）与现状逐字节等价
- [ ] 明确无 `immutable` 强缓存（既有 2026-08-22 强缓存事故护栏，不得回退）
- [ ] `tests/host/asset-routes.test.ts` 回归全绿；全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮无发现项（标准/spec 双维度）；工单置 `done`，随 M1 里程碑提交。
- 2026-08-30（实现）：`asset-routes.ts` 读取顺序改为「先 `stat` 得到 size/mtime → 计算 ETag → 命中 `if-none-match` 直接 304 返回（不 `readFile`）→ 未命中才 `readFile`」。未命中路径响应头（content-type / content-length / cache-control / etag）与现状逐字节等价，`cache-control` 仍为 `public, max-age=0, must-revalidate`、无 `immutable` 强缓存。`asset-routes.test.ts` 14 项回归全绿。
- 来源：PRD 18-perf-hotfix 候选 H3；证据见 memorial 017 archived `index.html`（asset-routes.ts:91 readFile 早于 :97 ETag 判定；:87-90 强缓存事故记录）。
