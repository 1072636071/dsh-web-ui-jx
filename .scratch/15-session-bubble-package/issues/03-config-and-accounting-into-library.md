# 03 — 配置与记账模块迁移入库

**Status:** resolved

**Blocked by:** 01

**构建内容：** 气泡列的可配置性与持久记忆（上限、保留开关、拖拽归档开关、保留/收起/完成记账、localStorage 读写）迁入库并导出配置操作函数；localStorage 键名保留 `jx-*` 前缀并集中到库内单点。根插件 SettingsCard 改从库 import。功能上用户无感知——同宿主下记账数据语义与现状完全一致。

**验收标准：**

- [x] 库导出配置操作函数（上限/保留开关/拖拽归档开关等）与记账读写
- [x] localStorage 键名全部集中单点，键名与现状完全一致（`jx-*` 前缀保留）
- [x] 配置/记账相关测试迁入库并全绿（读写容错、脏数据回落、写失败静默）
- [x] 根插件 SettingsCard 接线改从库 import，构建与测试通过

## 答案

2026-08-27 完成，commit `136af1f`（与工单 02 同批提交）。

- `session-bubbles-config.ts`（上限）、`session-bubble-keep-config.ts`（保留模式记账）、`persistent-setting.ts`（工厂）迁入库包；库 `index.ts` 导出上限操作、开关操作、kept/dismissed/seen 记账全套 + `createPersistentSetting` + `STORAGE_KEYS`
- 新建 `storage-keys.ts` 键名单点（六键 `jx-*` 前缀与现状逐字一致），两配置模块原字面量常量收敛为单点引用
- 测试 `session-bubble-keep-config`（10）/`persistent-setting`（11）随迁库包 `__tests__/`；`session-bubble-list.test.ts`（组件，留根插件）改从库 import
- 根插件消费侧 `SettingsCard`/`skin`/`fx`/`overlay-settings` 改从库公共 API import（createPersistentSetting 供皮肤/特效/设置复用）
- 审查发现测试残留键名字面量副本，已修复为 `STORAGE_KEYS` 引用
- 验证：根+库 typecheck、447 测试、根 build、21 项验收全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）
