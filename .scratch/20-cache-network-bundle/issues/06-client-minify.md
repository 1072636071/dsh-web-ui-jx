# client 产物压缩可行性验证

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** client 产物压缩后仍保持确定性（`module` / `exports` 变量名保留）；若验证不可行，明确记录原因并关闭本单，不裸开压缩。

**验收标准：**

- [x] 开启压缩 + 保留顶层变量名（`keep_names` / `reservedNames`）方案验证
- [x] `lib/client.js` 压缩后体积下降，且 `generateBundle` 整体包裹逻辑正确（`window.__ModuleLoader__.load` 引用完整）
- [x] 若不可行：记录原因并关闭本单
- [x] `npm run build && npm run verify` 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30 实施（M4）：**验证可行，已落地 `minify: true`（esbuild）**。
  磁盘体积 lib/client.js 314948B → 142598B（-55%，gzip 49→34KB）。
  **方案说明（偏差记录）**：验收字面提 `keep_names/reservedNames` 保留顶层变量名，
  实现未用二者，改走「generateBundle 压缩后拼接」论证——`window.__ModuleLoader__.load`
  整体包裹与 `module`/`exports` 注入、CSS 内联均在 generateBundle/closeBundle 作用于
  已压缩的最终文本，属「压缩后拼接」，不参与压缩、变量名确定；实测 wrapper
  （`__ModuleLoader__.load` / `return module.exports`）与 `data-plugin-css` 注入标识均完整。
  **注意**：此结论依赖 vite 的 minify（esbuild 产物无 banner/intro/footer 需重命名），
  若未来换 rollup 压缩需复验；回归护栏由 verify-release.mjs 体积基线承担。
- 来源：PRD 20 候选 L3；证据见 memorial 017 archived `index.html`（vite.config.ts:161 minify:false；:158-161 变量名确定性假设；:36-43 内联 CSS）。
- 这是一致性假设，别裸开压缩。
