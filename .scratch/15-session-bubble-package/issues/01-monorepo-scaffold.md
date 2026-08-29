# 01 — monorepo 骨架与库包脚手架

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 当前仓库就地从单包改造为 npm workspaces：库包 `dsh-session-bubble` 以空骨架存在，可独立构建出非空 ESM + CSS 产物；全仓库测试/类型检查在新结构下照常运行。此工单结束后，后续所有迁移工单都有了落点。

**验收标准：**

- [x] 根目录 package.json 增加 workspaces 声明，现有构建/验收/测试脚本行为不变
- [x] 库包骨架可独立 `build` 产出非空 ESM 产物 + CSS 抽取，不报错
- [x] 库包空骨架可独立 `typecheck` 通过
- [x] 全仓库 vitest 配置适配多包后，现有测试全量通过（26 文件 / 447 用例）
- [x] 根插件 files 清单与发布形态不含子包（子包独立发布；npm pack 清单已验证）

## 答案

2026-08-27 完成，commits：`bc33ad9`（feat：workspaces + 库包骨架）、`de576cd`（docs：方案文档）。

- 根 package.json 增 `workspaces: ["packages/*"]`；vitest include 扩展 `packages/**/*.test.ts`
- `packages/dsh-session-bubble/`：package.json（exports 指向 dist，types 指 src）+ vite lib mode（ESM + CSS 抽取）+ 独立 tsconfig（extends 根）+ 占位入口/样式/CSS 声明
- 验证：库 build（`dist/index.js` 非空 + `dist/index.css` 46B 非空）、库 typecheck 通过、根 build（110 host + 47 client 模块）、447 测试全绿、21 项发布验收全绿
- 代码审查：标准轴 0 硬性违规（css-modules.d.ts 重复声明因包自包含优先被抑制）；spec 轴 5 条验收标准全部忠实实现

## 评论

（评论与对话历史追加于此，新内容置于最前。）

