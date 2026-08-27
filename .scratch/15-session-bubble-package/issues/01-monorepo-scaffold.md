# 01 — monorepo 骨架与库包脚手架

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 当前仓库就地从单包改造为 npm workspaces：库包 `dsh-session-bubble` 以空骨架存在，可独立构建出非空 ESM + CSS 产物；全仓库测试/类型检查在新结构下照常运行。此工单结束后，后续所有迁移工单都有了落点。

**验收标准：**

- [ ] 根目录 package.json 增加 workspaces 声明，现有构建/验收/测试脚本行为不变
- [ ] 库包骨架可独立 `build` 产出非空 ESM 产物 + CSS 抽取，不报错
- [ ] 库包空骨架可独立 `typecheck` 通过
- [ ] 全仓库 vitest 配置适配多包后，现有测试全量通过
- [ ] 根插件 files 清单与发布形态不含子包（子包独立发布）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
