# 05 — 薄壳插件

**Status:** ready-for-agent

**Blocked by:** 04

**构建内容：** 朋友的可安装入口：最小 DSH bundle 插件 `dsh-session-bubble-plugin`，`dsh plugin add` 装完即用——极简固定容器承载库的 `SessionBubbleList`，数据注入会话/工作区，深浅主题跟随宿主。无设置卡、无浮层、无素材（最小化）。

**验收标准：**

- [ ] 薄壳可构建出 DSH bundle 双半区产物（host/client），自带挂载配置（单行挂载）
- [ ] 宿主注入会话/工作区数据后，气泡列正常渲染，归组/保留/拖拽/跨刷新留存可用
- [ ] 深浅主题随宿主切换，无 `--jx-*` token 时颜色正常
- [ ] 保留模式默认开启（薄壳无设置入口）
- [ ] host 半区必需性查证完成并记录结论（实施调研项）
- [ ] 通过 `dsh plugin add link:<path>` 本地安装路径验证装完即用

## 评论

（评论与对话历史追加于此，新内容置于最前。）
