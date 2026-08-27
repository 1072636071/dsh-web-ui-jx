# 06 — 构建/验收适配与发布

**Status:** ready-for-agent

**Blocked by:** 04, 05

**构建内容：** 三包（根插件、库、薄壳）的构建与发布前验收全部就绪且可复现：根插件验收脚本适配多包结构仍通过，库与薄壳以 build + typecheck 兜底；库与薄壳完成 npm publish（access public），朋友可 `npm i dsh-session-bubble` / `dsh plugin add` 正式安装。

**验收标准：**

- [ ] 根插件 `build` + `verify` 在多包结构下全绿（验收脚本已适配）
- [ ] 库与薄壳各自 build + typecheck 全绿，产物非空
- [ ] 库 `dsh-session-bubble` npm publish 成功（access public），安装后可 import 组件/纯逻辑/配置操作
- [ ] 薄壳 `dsh-session-bubble-plugin` npm publish 成功，安装即用
- [ ] 发布清单（files 字段）不含多余文件，包体积合理

## 评论

（评论与对话历史追加于此，新内容置于最前。）
