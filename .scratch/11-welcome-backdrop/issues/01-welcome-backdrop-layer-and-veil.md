# 欢迎背景层落地 + 压暗浓度滑块

**Status:** resolved

**构建内容：** 欢迎背景整页壁纸层（ADR-0024 D1–D4）落地：整页背景层挂载/卸载、宿主画布可见性修复、面板半透明联动、总开关 + 壁纸/面板/压暗三滑杆、深浅主题分纱。

**验收标准：**

- [x] 背景层由 `welcome-backdrop.ts` 随 `ctx.effect` 按「皮肤开 且 背景开」挂载/卸载，`--jx-panel-alpha` 驱动机 surface 半透明
- [x] 壁纸图经 `/api/dsh-jx/welcome/welcome-16-9.webp` 本机服务，实机 naturalWidth=3237 加载成功
- [x] **可见性修复**：背景层 `z-index:0`（原 `-1` 被宿主画布盖住不可见）；base 层透明；宿主 html/body 画布经 `:has(body>[data-jx-backdrop])` 透明化使壁纸透出，卸载即回落
- [x] **压暗浓度滑块（本次新增）**：设置卡皮肤 section 新增「压暗浓度」滑杆；运行时按主题写 veil——深色叠 `rgb(11 9 13 / α)`、浅色叠 `rgb(250 245 238 / α)`，`α = jx-backdrop-veil(%)/100`，默认 25；总开关关闭时禁用
- [x] 深浅双主题各叠暗纱/白纱（D4）
- [x] typecheck 通过；全量 vitest（23 文件 384 测试）绿；`npm run build` 双半区 + `npm run verify` 21 项全过
- [x] 实机走查：3 滑块渲染；运行时闭环实测 `jx-backdrop-veil=10`→veil `0.1`、`=90`→`0.9`，持久化→runtime 应用全通

## 实现要点

- 配置项：`welcome-backdrop-config.ts` 四持久项 `jx-backdrop` / `jx-backdrop-wall` / `jx-backdrop-panel` / `jx-backdrop-veil`（界 0–100，容错读回落默认）。
- 运行时：`welcome-backdrop.ts#syncBackdrop` 写壁纸 opacity、veil 背景（按主题）、`--jx-panel-alpha`；`startWelcomeBackdrop` 随 `ctx.effect` 生命周期，`sweepResidualBackdrops` 兜可重入残留（ADR-0017）。
- 样式：`jiangxiao.css` `[data-jx-backdrop]` fixed 全视口、base 透明、img cover、veil 兜底 0.25 + `html:has`/`body:has` 画布透明门控。
- UI：`SettingsCard.tsx` 皮肤 section「欢迎背景」总开关 + 壁纸/面板/压暗三滑杆，总开关关则滑杆禁用。

## 关键过程记录

- 首版壁纸「不生效」实为可见性/观感双重问题：`z-index:-1` 被宿主不透明画布盖住 + 深色实底与厚重暗纱把浅色壁纸压成灰。修复走 `z-index:0` + base 透明 + 画布 `:has` 透明化 + 暗纱降浓度。
- 用户要求把压暗做成**滑块自调**，遂新增 `jx-backdrop-veil` 持久项与运行时主题分纱注入，默认 25（深暗纱/浅白纱各 0.25）。
- 默认墙/面板不透明度调为 100/50 以最大化壁纸可见度；暗纱 0.45→0.25、白纱 0.5→0.3。
- 实机会话中发现 READ/EDIT 工具对本项目个别已存在文件的写入落在 IDE 缓存层未真正落盘（SettingsCard.tsx 滑块一度未进产物），改为直接写盘+重建产物校验后回归正常。后续改本仓库务必回查磁盘产物。

## 评论

- 2026-08-24：ADR-0024 背景壁纸层落地；修复壁纸被宿主画布盖住与压暗过重观感问题；按用户要求新增压暗浓度滑块。typecheck/build/verify/全量测试绿，实机闭环验证通过。