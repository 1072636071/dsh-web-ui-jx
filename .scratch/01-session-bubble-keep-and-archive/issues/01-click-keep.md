# 01 — 单击保留：总开关 + kept 记账端到端

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 打开设置卡「查看后保留气泡」后，单击气泡照旧跳转但气泡留存（含跨页面刷新）；关闭开关即完全回到现状。本片一次性定下投影上下文的完整形状（开关态 + kept/dismissed/archived 参数位），后续工单只填内容不改签名。

**验收标准：**

- [ ] 回归护栏先行：投影纯函数扩展可选参数后，不传参时现有全部行为基准逐条目保持绿色
- [ ] 开关开：点击已完成气泡跳转后气泡仍在列；刷新页面后仍保留（kept 集合持久化生效）
- [ ] 开关关：行为与现状全等，无记账、无配置副作用
- [ ] kept 集合惰性裁剪：id 不在宿主列表时过滤忽略、写入时清除，集合不膨胀
- [ ] 配置模块容错对齐既有模式：读失败回落默认（开关默认开）、写失败静默、轻量 store 订阅即时生效
- [ ] 设置卡角色 section 出现开关①（复用既有 switch 样式与键盘激活），变更即时生效
- [ ] 当前会话气泡点击仍是 no-op（沿用 ADR-0007 D9，不记账不跳转）
- [ ] `npm run build` + `npm run verify` 通过

## 答案

### 变更文件清单

- **新增 `src/client/state-machine/session-bubble-keep-config.ts`**：保留模式配置模块（C1）。localStorage 键 `jx-bubble-keep-enabled`（开关①默认 true）/ `jx-bubble-keep-archive-enabled`（开关②默认 true，本片只存取未接线 UI）/ `jx-bubble-keep-kept` / `jx-bubble-keep-dismissed`（集合存 JSON string[]）。API：get/setKeepEnabled、get/setArchiveDragEnabled（各配 subscribe*/get*Snapshot）；addKept/deleteKept/pruneKept、addDismissed/clearDismissed/pruneDismissed、getKeptSnapshot/getDismissedSnapshot（ReadonlySet，变更即换新 Set 引用再通知）。容错对齐 skin.ts / session-bubbles-config.ts：读失败回落默认、写失败静默；prune 仅确有删除才写盘并通知（防写循环）。
- **`src/client/state-machine/session-bubbles.ts`**：新增 `BubbleKeepContext` 接口——一次性定形投影上下文完整形状（keepEnabled 必填 + kept/dismissed/archived 三个可选参数位，后续工单只填内容不改签名）；buildBubbleGroups 向后兼容扩展可选第 4 参；范围过滤统一为 passesRange 谓词并应用于函数内部两处硬编码点（根入选 + 成员过滤）：入选 = (running || completed || kept.has(id)) 且不被 dismissed/archived 隐藏；豁免规则钉死——running 或 pendingInteraction 条目不被记账隐藏（ADR-0020 精神），豁免不放宽入选资格；context 缺省或 keepEnabled=false ⇒ 谓词逐字面退化为现状语义。
- **`tests/client/session-bubbles.test.ts`**：TDD 红→绿，新增 6 组共 24 个断言（既有测试零改动）：①扩展回归护栏（不传参/显式 undefined/keepEnabled=false/仅开关无集合 = legacyFlatSelect 基准逐条目全等，含归组输入场景）②kept 记账保留（completed 位被清后的 idle 形态仍可见、投影透明性、kept 后代计徽标、kept 根使空闲组入选）③dismissed 隐藏（优先于 kept）④archived 排除（优先于 kept，直接构造上下文断言排除语义）⑤活动/紧急豁免（running/pending 不被隐藏、kept 冗余无害、豁免不放宽入选）⑥惰性忽略 + 上限折叠/pending 豁免在保留输入下语义不变。
- **`src/client/components/SessionBubbleList.tsx`**（C4/C5）：useSyncExternalStore 订阅总开关 + kept/dismissed 快照；useMemo 组装 BubbleKeepContext 恒传两处 buildBubbleGroups（folded + expanded）；handleOpen = sessions.open(id) + （keepEnabled 且 id≠current 时 addKept(id)）；useEffect 监听 items 变化调 pruneKept/pruneDismissed。
- **`src/client/components/SettingsCard.tsx`**（C6）：角色 section 追加开关①「查看后保留气泡」（desc「单击气泡跳转后保留提醒，直到拖入收起区或归档区」），复用既有 role="switch" button + toggleSwitch/toggleOn 样式与键盘激活模式；初始 getKeepEnabled()，切换 setKeepEnabled 即时生效。

### 验收标准核对

- [x] **回归护栏先行**：先写护栏断言与行为断言跑出红态（12 failed | 54 passed），实现后单文件 66/66 全绿；既有 42 测试零改动全程绿。
- [x] **开关开：点击留存含跨刷新**：点击路径 open + addKept 写 localStorage('jx-bubble-keep-kept')，模块加载时读回恢复（刷新后 kept 记账仍在）；投影层 kept 使 completed 位被 SDK 清除的条目持续可见。按 PRD 测试决策不测 localStorage 包装与组件渲染，持久化由配置模块存取逻辑 + seam 行为断言共同覆盖。
- [x] **开关关全等无副作用**：投影 keepEnabled=false 忽略全部集合（断言与不传参输出 toEqual 全等，含携带脏集合的场景）；handleOpen 零记账零配置写入。
- [x] **kept 惰性裁剪**：不在宿主列表的 id 投影中 has() 天然忽略（双保险之一），prune 仅确有删除才写 localStorage 并通知（集合不膨胀、无写循环）。
- [x] **配置模块容错对齐既有模式**：try/catch + typeof window 守卫，读失败回落默认（开关默认开）、写失败静默；轻量 store 订阅即时生效（快照稳定引用语义）。
- [x] **设置卡开关①**：角色 section 复用既有 switch 样式与键盘激活，变更即时生效（store notify → SessionBubbleList 重投影）。
- [x] **当前会话 no-op 不记账**：上游 GroupBubble/ChildBubble isCurrent 早退（ADR-0007 D9 原样）+ handleOpen 内 id !== current 双保险。
- [x] **npm run build + npm run verify 通过**：见下方验证结果。
- 判定矩阵未引入（02 的活）；本片点击路径维持「立即跳转 + 记账」现状语义，无手势代码。

### 验证命令结果

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/client/session-bubbles.test.ts` | ✅ 66/66（42 既有 + 24 新增） |
| `npm test` | ✅ 293/293（14 文件全绿） |
| `npm run build` | ✅ lib/index.js 172.09 kB + lib/client.js 132.42 kB（woff2 构建期未解析属预期） |
| `npm run verify` | ✅ 21/21 检查通过，exit 0 |
| `npm run typecheck` | ⚠️ 本片全部变更/新增文件 0 错误；仓库存量 5 处类型错误位于与本片无关的 4 个既有测试文件（character-overlay-crossfade / overlay-session-runtime / state-machine / variant-rotation 的 .test.ts），HEAD 上即存在且不含任何 session-bubble 引用，未越界修复 |

### 实施注记（无设计偏离）

1. SessionBubbleList **恒传** context（含 keepEnabled=false 形态）而非条件省略第 4 参——让总开关退化路径常驻生产代码执行面，与其测试护栏互为印证。
2. 裁剪 effect 以 rawState !== undefined 为前置守卫：挂载早期 sessions.list 快照缺省时 items 为空数组，此时裁剪会误清持久化记忆；真实空列表（rawState 存在且 ids 空）仍正常裁剪。
3. 开关②键位已定形可存取（setArchiveDragEnabled 等），UI 接线与 archived 数据源按分工留给 03；dismissed 手势接线留给 02。

### 审查修复轮（t6）

- **N7（已修）**：删除零调用方 `deleteKept`（Speculative Generality）——kept 的移除路径只有惰性裁剪 pruneKept；留注释说明按需重引入原则。
- **N8（已修）**：kept/dismissed 两套平行「快照+订阅+add/remove+prune」四件套泛化为 `makeIdSetStore(key)` 工厂（单一实现两实例），导出面不变、行为逐路径等价；原 deleteKept 未随迁入（与 N7 一致）。
- **N2（已修）**：全仓 grep「ADR-0007 D9」共 7 处 → 全部修正为「ADR-0007 决策4」（ADR-0007 无决策 9）：组件 handleClick 注释 + 组件头动效引用（该处改指可验证的 DESIGN.md §6）+ ADR-0022 正文 ×2 + memorial 副本 ×3。
- **N6（已修）**：session-bubbles.ts ×2 + tests ×2「ADR-0020 精神」→「ADR-0020 pending-interaction-bubble-effect」（docs/adr 双 0020 并存消歧：豁免语义指 pending-interaction-bubble-effect 而非 despill-first-alpha）。
- **N12（已修）**：.gitignore 追加 `.agent-teams/`（AgentTeams 运行时目录不进 git）。

## 评论

（新内容置于最前。）

- 上下文指针：同目录 `PRD.md`（实现决策 §可见性判定 / §新配置模块）、ADR-0022 决策 1/6/8、memorial 010 D1/D5/D7/D10/D11。
- 注意：判定矩阵是 02 的活——本片点击路径维持现状语义（立即跳转 + 记账），不引入手势。
