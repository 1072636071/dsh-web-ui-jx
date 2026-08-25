# 区域 alpha 模型（token + 配置 + 运行时 + remap 修正）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 五个可独立面板区（侧栏 / 输入栏 / 用户气泡 / 目标·Todo·Queue 卡 / 附件钮）通过配置文件即可各自设定不透明度；宿主侧栏因修正 remap 真名首度真正被皮肤化。此工单让「各面板独立透明」的底层能力可用（尚未有 UI 滑杆）。

**验收标准：**

- [ ] 配置模块新增五个区域 alpha 项（默认 50，钳制 0–100，localStorage 持久化，订阅通知符合既有模式），读写一致
- [ ] 深/浅两主题各定义五个区域 alpha 变量（`--jx-panel-{sidebar,input,bubble,tip,selector}-alpha` + 对应基准 RGB）
- [ ] host remap 修正：侧栏 remap 真名 `sidebar-fill`（替换 `sidebar-bg`）；删除无效 `assistant-bubble` 映射
- [ ] 运行时「欢迎背景」开启时把五个区域 alpha 写为 body CSS 变量、关闭时移除（区域回不透明）
- [ ] 单元测试（沿用 welcome-backdrop 先例）：config 读写/钳制/订阅、背景开关时五变量正确写/移
- [ ] `npm run build` + `npm run typecheck` 通过

## 评论