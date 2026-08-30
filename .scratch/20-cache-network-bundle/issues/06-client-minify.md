# client 产物压缩可行性验证

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** client 产物压缩后仍保持确定性（`module` / `exports` 变量名保留）；若验证不可行，明确记录原因并关闭本单，不裸开压缩。

**验收标准：**

- [ ] 开启压缩 + 保留顶层变量名（`keep_names` / `reservedNames`）方案验证
- [ ] `lib/client.js` 压缩后体积下降，且 `generateBundle` 整体包裹逻辑正确（`window.__ModuleLoader__.load` 引用完整）
- [ ] 若不可行：记录原因并关闭本单
- [ ] `npm run build && npm run verify` 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 来源：PRD 20 候选 L3；证据见 memorial 017 archived `index.html`（vite.config.ts:161 minify:false；:158-161 变量名确定性假设；:36-43 内联 CSS）。
- 这是一致性假设，别裸开压缩。
