# 06 — 构建/验收适配与发布

**Status:** resolved

**Blocked by:** 04, 05

**构建内容：** 三包（根插件、库、薄壳）的构建与发布前验收全部就绪且可复现：根插件验收脚本适配多包结构仍通过，库与薄壳以 build + typecheck 兜底；库与薄壳完成 npm publish（access public），朋友可 `npm i dsh-session-bubble` / `dsh plugin add` 正式安装。

**验收标准：**

- [x] 根插件 `build` + `verify` 在多包结构下全绿（验收脚本已适配，21 项）
- [x] 库与薄壳各自 build + typecheck 全绿，产物非空
- [ ] 库 `dsh-session-bubble` npm publish 成功（access public），安装后可 import 组件/纯逻辑/配置操作（publish --dry-run 已验证流程，**待 npm 登录实际发布**）
- [ ] 薄壳 `dsh-session-bubble-plugin` npm publish 成功，安装即用（同上，待 npm 登录）
- [x] 发布清单（files 字段）不含多余文件，包体积合理（库 14 文件 44.5KB / 薄壳 8 文件 19.2KB，测试已排除）

## 答案

2026-08-27 完成，commit `5d6345f`。

- 发布清单修正：库 files 排除 `src/__tests__`（6 个测试文件约 97KB 不再混入包）；薄壳 files 补 `src`（exports types 指向 `./src/host/index.ts`，修复发布后类型悬空）
- 发布前置验证：
  - `npm pack --dry-run`：库 14 文件 44.5KB / 薄壳 8 文件 19.2KB，无多余文件
  - `npm publish --dry-run`：两包发布流程无错误
  - 包名可用性：`dsh-session-bubble` / `dsh-session-bubble-plugin` 在 registry.npmjs.org 均未占用（404）
  - 根 `verify` 21 项全绿（多包结构）
- **待用户操作**：`npm login`（registry）后执行 `npm publish -w dsh-session-bubble` 与 `npm publish -w dsh-session-bubble-plugin`（无 scope 包默认 access public）
- 代码审查：标准轴 0 硬性 + 2 弱异味（可选：测试排除约定注释）；spec 轴 0 发现

## 评论

（评论与对话历史追加于此，新内容置于最前。）
