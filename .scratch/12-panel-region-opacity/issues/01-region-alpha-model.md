# 区域 alpha 模型（token + 配置 + 运行时 + remap 修正）

**Status:** resolved

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

### 实施记录（回填于 2026-08-27；实施提交 e34ec89，ADR-0025）

- [x] 五区域 alpha 配置项：`get/set{Sidebar,Input,Bubble,Tip,Selector}Alpha` ×5（localStorage `jx-backdrop-{sidebar,input,bubble,tip,selector}`，默认 50、钳制 0–100、写穿通知），五区共用同一存储工厂—— `src/client/welcome-backdrop-config.ts`
- [x] 深/浅两主题各定义 `--jx-panel-{sidebar,input,bubble,tip,selector}-alpha` + 对应基准 RGB—— `src/client/styles/jiangxiao.css`（深色/浅色两组）
- [x] remap 修正：`--dsw-specific-sidebar-fill`（宿主真名，替换捏造的 sidebar-bg）；无效 `assistant-bubble` 映射已删除
- [x] 运行时「欢迎背景」开时把五区域 alpha 写为 body CSS 变量、关时移除回不透明—— `welcome-backdrop.ts` 区域 alpha 写入表
- [x] 单测沿用 welcome-backdrop 先例：config 读写/钳制/订阅、开关时五变量写/移—— tests/client/welcome-backdrop.test.ts
- [x] 2026-08-27 复验：`npm run build` ✓、`npm run typecheck` ✓、全量 vitest 447 绿