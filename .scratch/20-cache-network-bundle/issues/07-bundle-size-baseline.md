# 双半区体积基线入 verify

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 发布前可感知体积回归——`scripts/verify-release.mjs` 增加 `lib/index.js` 与 `lib/client.js` 的体积断言，体积显著增长时 verify 失败。

**验收标准：**

- [x] `verify-release.mjs` 含双半区产物体积断言
- [x] 体积回归时 verify 失败并给出明确提示
- [x] `npm run verify` 全绿（当前产物通过基线）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 2026-08-30 实施（M4）：`verify-release.mjs` 新增 [7] 双半区体积基线——
  `lib/index.js` 与 `lib/client.js` 各自 ≤512KB（阈值取 M4 治理后基线的约 3× 宽裕上限，
  只拦「倍增量级」的显著回归，不因小幅波动作废）；超限打印「体积未回归（≤512KB）」
  失败项并退出码 1。当前产物 index 177.8KB / client 139.3KB（minify=true）均通过。
  基线数值：index ≈178KB、client ≈139KB（含内联 CSS，20-06 压缩后）。
- 来源：PRD 20 候选 L4；证据见 memorial 017 archived `index.html`（lib/index.js 179.77 KB；lib/ 被 .gitignore 忽略；client 产物需 build 后测量）。
- 基线数据建议在 18-04 复核产物后一并固化。
