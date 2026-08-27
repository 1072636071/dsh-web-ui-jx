# Map — 15-session-bubble-package

来源：PRD `15-session-bubble-package`（memorial 014 → ADR-0029）。

## 工单

- `01-monorepo-scaffold` — monorepo 骨架与库包脚手架（无阻塞）
- `02-data-layer-into-library` — 数据层迁移入库（阻塞 01）
- `03-config-and-accounting-into-library` — 配置与记账迁移入库（阻塞 01）
- `04-component-and-style-into-library` — 组件与样式迁移入库，库 v1 完整（阻塞 02, 03）
- `05-thin-shell-plugin` — 薄壳插件（阻塞 04）
- `06-build-verify-publish` — 构建/验收适配与发布（阻塞 04, 05）

## 已做决策

- 包形态 = 库 + 薄壳两层；monorepo 轻量就地改造（根插件原位不动）
- 唯一新 seam = 气泡主题层（`--jx-*` 默认值作用域），其余复用既有接缝
- 数据层与配置层互不依赖，可并行（02 与 03 均只阻塞于 01）
- localStorage 键保留 `jx-*` 前缀、库内单点
- 薄壳最小化：无设置卡/浮层/素材，保留模式默认开
- 发布：库 access public；薄壳可 npm publish 或 link: 本地安装（朋友开发期）
- 工单 01（骨架）：库包 exports 的 types 指 src（构建期不生成 .d.ts，沿用根包模式）；CSS import 声明包内自包含（独立构建/发布所需）

## 迷雾/待办

- host 半区是否必需（已列入工单 05 实施调研）
- 薄壳挂载位置/锚点细节（已列入工单 05）
- 库包测试文件落点（vitest include 已扩展 `packages/**/*.test.ts`；加测试时需同步库 tsconfig include，见工单 02）
- 工单 04 已完成：组件/样式/主题层/组件测试已迁库，库 v1 完整（`SessionBubbleList` 公共导出 + `bubble-theme.css` 双层 fallback 覆盖机制）
- 工单 05（薄壳插件）承接：库 v1 已就绪，可开始薄壳双半区构建与挂载
