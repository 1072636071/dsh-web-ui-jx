# 05 — 薄壳插件

**Status:** resolved

**Blocked by:** 04

**构建内容：** 朋友的可安装入口：最小 DSH bundle 插件 `dsh-session-bubble-plugin`，`dsh plugin add` 装完即用——极简固定容器承载库的 `SessionBubbleList`，数据注入会话/工作区，深浅主题跟随宿主。无设置卡、无浮层、无素材（最小化）。

**验收标准：**

- [x] 薄壳可构建出 DSH bundle 双半区产物（host/client），自带挂载配置（单行挂载）
- [ ] 宿主注入会话/工作区数据后，气泡列正常渲染，归组/保留/拖拽/跨刷新留存可用（代码就绪，待真实 DSH 宿主验证）
- [x] 深浅主题随宿主切换，无 `--jx-*` token 时颜色正常（库 bubble-theme 默认层随薄壳 client 内联分发）
- [x] 保留模式默认开启（薄壳无设置入口，库 keep-config 默认 true）
- [x] host 半区必需性查证完成并记录结论（实施调研项）
- [ ] 通过 `dsh plugin add link:<path>` 本地安装路径验证装完即用（待真实 DSH 宿主环境验证）

## 答案

2026-08-27 完成，commit `a2db569`。

- 新建 `packages/dsh-session-bubble-plugin/`：host 半区最小空实现（name/inject/apply，与 cordis.patch.yml insert id 一致）+ client 半区极简 fixed 容器（`data-dsh-bubble-shell`）承载库 `SessionBubbleList`，`inject: ["sessions", "workspaces"]` + `ctx.get(...)` 接线
- 双半区构建复用根插件模式（`__ModuleLoader__.load` 包裹 + CSS 内联，CLIENT_ID 换名 `dsh-session-bubble-plugin`）；产物 host 118B + client 33.64KB（含 22KB 内联 CSS：module + bubble-theme + root.css）
- 库以相对路径源码打包（ADR-0029 D11 零发布依赖）；`files: ["dist", "cordis.patch.yml"]`
- **调研结论（host 半区必需性）**：DSH bundle 插件经 cordis 以 `exports "."` 加载 host 半区（profile bundle 层 insert），去掉 host 半区则 cordis 无 bundle 加载入口、插件无法挂载——故保留最小 host 空实现
- ADR-0017 D2 可重入约束：清扫先 unmount 再移除（try/catch 失败不阻断，对齐根插件 root-lifecycle 先例）
- 验证：薄壳 typecheck + build 全绿；根链路 447 测试 + 21 项验收无回归
- **待宿主环境验证**：验收②（注入渲染）、⑥（dsh plugin add link: 装完即用）需真实 DSH 宿主执行

## 评论

（评论与对话历史追加于此，新内容置于最前。）
