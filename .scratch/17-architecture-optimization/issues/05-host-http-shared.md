# 工单 05 — host HTTP 共享件收口

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** host 半区 JSON 响应 / URL 解析 / 路径穿越防御收敛为单一共享模块 `http-shared.ts`；两个防御函数（字面 `..` 纵深防御 vs `..` 段精确防御）的「差异是有意」说明与实现同文件（此前文档在 paths.ts、实现在两文件）。防御逻辑成为纯函数可直测。行为逐字节等价，无用户可见变化。

**验收标准：**

- [ ] 新增 `src/host/http-shared.ts`：`writeJson` / `parseUrlPathname` / `resolveSafeSubpath(pathname, prefix, assetsRoot)` / `isSafeRelativePath` + 共享差异注释
- [ ] `asset-routes.ts` / `import-api.ts` / `ai-title-route.ts` 三处收敛（writeJson ×2、URL 解析 ×2、防御 ×2）；`paths.ts` 保留 `resolveAssetsRoot`，注释精简指向 http-shared.ts
- [ ] 既有 asset-routes / import-api / ai-title-route HTTP seam 测试零改动全绿
- [ ] 新增 `tests/host/http-shared.test.ts`（纯函数，不经 HTTP）：writeJson 的 content-type/length/body（mock res）、resolveSafeSubpath 的 malformed %-escape / null 字节 / 字面 `..` / normalize 逃逸、isSafeRelativePath 的绝对路径 / `..` 段 / 反斜杠归一化 / 放行 `foo..bar`

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S5（2026-08-28）。
