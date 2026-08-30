# 复核 host 产物不含 React 组件

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 发布者确认 `lib/index.js` 无 React 组件痕迹（`SessionBubbleList` / `useState` / `createElement`），Node 半区保持纯净、体积可控——这是 S7（host 改走库公共入口）的未完成验收项。

**验收标准：**

- [ ] `npm run build` 后核验 `lib/index.js` 无 React 组件痕迹、体积未显著增长
- [ ] 若 tree-shaking 未生效：已给库 `package.json` 加 `"sideEffects": false` 并重跑验证
- [ ] 全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30（审查通过）：`/jxx-code-review` 两轮无发现项（标准/spec 双维度）；工单置 `done`，随 M1 里程碑提交。
- 2026-08-30（实现）：首次构建复核发现 tree-shaking 未生效——host 经库公共入口 `index.ts` 导入 `buildDynamicTitlePrompt`，连带 re-export `detail-data.ts` 的 `@deepseek-ai/dsh-session/surface`（vite inline-safe）副作用导入把 React 拖进 host 产物（221.78 KB，含 react/jsx-runtime、useState、memo、createPortal）。已给库 `packages/dsh-session-bubble/package.json` 加 `"sideEffects": false` 并重跑：host 产物降至 179.79 KB、无任何 react 引用；`buildDynamicTitlePrompt` 提示词内容确认仍在产物中。`scripts/verify-release.mjs` 新增「lib/index.js 无 React 包引用」检查（react 家族包名正则 + 非注释行排除），verify 22 项全绿。
- 来源：PRD 18-perf-hotfix 候选 U5；证据见 memorial 017 archived `index.html`（ai-title-route.ts:30 已走库公共入口；lib/ 被 .gitignore:11 忽略，产物需重新构建核验）。
