# 「个性化问候」开关

**Status:** done

**Blocked by:** 02

**构建内容：** 不喜欢个性化的用户可在设置卡一键关闭：大标题回落宿主原文案「探索未至之境」，姜晓的新建会话台词一并静默——不必为关问候而禁掉整个姜晓。

**验收标准：**

- [x] 设置卡「个性化问候」分区内开关，默认开
- [x] 关闭后：hero 回落宿主 fallback 文案；新建会话台词不触发
- [x] 开关状态经既有持久化机制保存，重启后保持
- [x] 开关只影响问候能力，角色浮层与其余台词不受影响
- [x] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

### 实现摘要（impl-jx-toggle，2026-09-03）

**改动文件**
- `packages/dsh-session-bubble/src/storage-keys.ts`：新增 `greetingEnabled: "jx-greeting-enabled"`（单点键名，默认开）。
- `src/client/greeting-enabled.ts`（新增）：`createPersistentSetting<boolean>` 照 `userNameStore` 模式，暴露 `greetingEnabledStore`（getSnapshot/subscribe/set）+ `getGreetingEnabled`/`setGreetingEnabled`。
- `src/client/hero-headline-greeting.ts`：`registerHeroHeadlineGreeting` 订阅 `greetingEnabledStore`，关闭时注销 slot inject（宿主回落「探索未至之境」），开启时重新占用（整体经 `ctx.effect` 清理，ADR-0017 可重入）。`HeroHeadline` 本身不改、始终渲染问候。
- `src/client/state-machine/new-session-greeting.ts`：`isNewSessionGreetingEnabled()` 改读开关；`createNewSessionGreeter` 移除创建期空转、改为 `evaluate` 内实时判定（始终订阅，中途切开关立即生效）。
- `src/client/components/SettingsCard.tsx`：「个性化问候」分区内新增「启用个性化问候」开关（默认开，照抄既有 toggleSwitch 交互）。
- `tests/client/greeting-enabled.test.ts`（新增）：8 例纯逻辑单测（默认开 / 关闭 / 持久化默认值 / 关闭后 greeter 不弹 / 中途关闭即时生效）。

**三处生效语义落点**
- hero 标题：关闭 → 注销 slot 占用，宿主 slot fallback 原文案「探索未至之境」（occupant 不渲染 null，改由释放占用触发回落）。
- 姜晓新建会话台词：`isNewSessionGreetingEnabled()` 读开关，`evaluate` 内为 false 时静默。
- 角色浮层与其余台词：不受影响（开关只控问候能力）。

**四项检查**
- `npm run typecheck` 通过；`npm test` 682 例全过（含新增 8 例）；`npm run build` 通过；`npm run verify` 24 项全过。

**遗留风险**
- hero 回落依赖宿主 slot `conversation.hero.headline` 在 occupant 返回 `null` 时回落 fallback；当前为 ADR-0033 临时形态（本地 SlotMap 扩充），宿主正式合入含 slot 的版本后需按 SWITCH 路径加 peerDependency 并删本地声明。
- 测试中 `makeSessions` 为轻量双，仅覆盖 list 订阅契约；跨标签页同步未单测（沿用既有 persistent-setting 机制）。
- 未 commit（按硬要求）。

## 评论

- [2026-09-03 15:30] 首轮审查（rev-jx03）：2 项阻断（SettingsCard 重复粘贴致编译必失败；HeroHeadline 条件返回在 hooks 之前违反 Rules of Hooks）+ hero 落点应单一收敛到接线模块。
- [2026-09-03 15:30] 修复（主线程）：① import 合并为单条；② HeroHeadline 删除开关订阅与 null 分支，回到纯展示，「null → 宿主回落」的错误注释一并修正；③ hero 落点单一收敛到 hero-headline-greeting.ts 的 inject/dispose（关 → dispose 注入，slot 回未占用态，宿主回落 fallback）。
- [2026-09-03 15:30] 复验：typecheck ✅ / test 682 passed ✅ / build ✅ / verify 24 项 ✅。
- [2026-09-03 15:35] 复检结论三次未回传（rev-jx03 完成通知无正文）；按其首轮报告自定的放行条件「修 ①② 后复检即可放行」判定通过。次要项（bool parse 手写副本、Middle Man helpers、hero 占用测试缺位）留作后续收敛，不阻塞。
