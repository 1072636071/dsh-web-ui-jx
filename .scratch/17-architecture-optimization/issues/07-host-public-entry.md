# 工单 07 — host 改走库公共入口

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** host 半区唯一深路径 import（`ai-title-route.ts` 直接 import 组件库内部 `src/detail/dynamic-title.ts`）改走库公共入口 `src/index.ts`（已导出 `buildDynamicTitlePrompt`）；构建验证 host bundle 不拖入 React 组件代码。无用户可见行为变化（部署更安全——host 不再耦合库内部布局）。

**验收标准：**

- [ ] `ai-title-route.ts` 移除对 `src/detail/dynamic-title.ts` 的深路径 import，改走库公共入口
- [ ] grep 确认 host 半区（`src/host/`）无任何库内部路径 import
- [ ] `npm run build` 后检查 `lib/index.js`：不含 React 组件代码（`SessionBubbleList` / `useState` / `createElement`），体积无显著增长
- [ ] 若 tree-shaking 未生效（组件被拖入）：`packages/dsh-session-bubble/package.json` 加 `"sideEffects": false` 并复验
- [ ] `ai-title-route.test.ts` 零改动回归；`npm run build && npm run verify` 全绿

## 评论

- 来源：架构优化方案 `docs/architecture-optimization-plan.md` S7（2026-08-28）。
- 注意：库 package.json 无 `sideEffects: false`；走 index.ts 时需构建门禁验证。
