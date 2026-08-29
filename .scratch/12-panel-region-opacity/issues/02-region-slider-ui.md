# 设置卡区域滑杆 UI

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户在设置卡「面板不透明度」分组下看到「其余面板」+ 五根区域滑杆的界面，可拖动各滑杆独立调节对应面板区域的透明度，并持久化；「欢迎背景」总开关关闭时全部滑杆置灰禁用。

**验收标准：**

- [ ] 设置卡皮肤 section「面板不透明度」分组呈现「其余面板」全局 + 五根区域滑杆（侧栏/输入栏/用户气泡/目标·Todo·Queue 卡/附件钮）
- [ ] 每根滑杆绑定对应区域配置值，拖动即时改写该区域透明度并持久化（localStorage）
- [ ] 总开关关闭时六根滑杆全部禁用置灰（与现有壁纸/压暗滑杆行为一致）
- [ ] 深/浅主题下滑杆生效（各区域基准色跟随主题）
- [ ] `npm run build` + `npm run typecheck` 通过

## 评论

### 实施记录（回填于 2026-08-27；实施提交 e34ec89，ADR-0025）

- [x] 设置卡皮肤 section「面板不透明度」分组：数据驱动 `REGION_ALPHA_UI`（压暗/侧栏/输入栏/用户气泡/目标·Todo·Queue 卡/附件钮）+「其余面板不透明度」全局滑杆—— `src/client/components/SettingsCard.tsx`
- [x] 统一写入 `handleRegionAlphaChange`：按 key 分派对应 setter，钳制 + localStorage 持久化 + 即时生效
- [x] 总开关关闭时组内滑杆全部 `disabled={!backdropOn}` 置灰（与壁纸/压暗滑杆行为一致）
- [x] 深/浅主题生效：区域基准色随 `--jx-surface-*-rgb` 双主题定义，滑杆透明度改写即生效
- [x] 2026-08-27 复验：`npm run build` ✓、`npm run typecheck` ✓