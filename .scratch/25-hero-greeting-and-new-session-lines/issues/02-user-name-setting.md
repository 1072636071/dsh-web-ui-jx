# 用户名设置 + 带名问候

**Status:** pending-review

**Blocked by:** 01

**构建内容：** 用户在设置卡填写自己的名字后，大标题问候变为「上午好，{name}，有什么需要我搞定的么？」；没填或清空时回到不带名问候。

**验收标准：**

- [ ] 设置卡新增「个性化问候」分区，含名字输入
- [ ] 名字经 `createPersistentSetting` 持久化（localStorage），键名进 `STORAGE_KEYS` 单点
- [ ] 校验：trim 后非空才有效；上限 16 字符；剥离控制字符与换行；非法输入行内提示且不写入
- [ ] 名字有效 → hero 显示带名问候（带名/不带名是两套完整文案，不跨 key 拼接）
- [ ] 未填 / 全空白 → hero 显示不带名问候
- [ ] 宿主 settings memory 模式（远端浏览器）下名字照常可用
- [ ] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **实现摘要（impl-jx-username）**：用户名设置 + 带名问候已落地，未 commit。
  - 改动文件：`packages/dsh-session-bubble/src/storage-keys.ts`（增 `userName: "jx-user-name"`）、`src/client/user-name-setting.ts`（新增：校验纯函数 `sanitizeUserName`/`validateUserName` + 响应式 `userNameStore` 快照 store，底层 `createPersistentSetting`）、`src/client/components/HeroHeadline.tsx`（挂 `useSyncExternalStore` 订阅名字，带名/不带名走两套完整文案）、`src/client/components/SettingsCard.tsx`（新增「个性化问候」section + 受控名字输入，失焦/回车提交、行内错误提示）、`src/client/styles/sidebar-settings.module.css`（`.textInput`/`.inputError`/`.inputErrorBorder`）、`tests/client/user-name-validation.test.ts`（新增）。
  - 存储键：`jx-user-name`（STORAGE_KEYS 单点，client 侧 localStorage，不走 host settings，绕开 memory 模式不可写；空串=无名）。
  - 校验规则（ADR-0034 D4，纯函数可测）：先剥离控制字符与换行（`/[\x00-\x1F\x7F]/g`）+ trim；空→清空（回落不带名，不报错）；超 16 字→`too-long`（行内提示、不写入）；否则 valid 写入净化值。
  - 接线：名字变化经 `userNameStore` 响应式反映到 hero；时段仍挂载算一次（不挂 timer）；姜晓台词仍一律「大人」，不沾用户名。
  - 检查：`typecheck`/`test`(656 通过)/`build`/`verify`(24 项) 全绿。
  - 遗留风险：设置卡输入未做跨标签页草稿同步（仅已保存值跨标签页同步，符合现状）；IME 组字中回车不提交已在 `isComposing` 守卫。`maxLength` 宽松（16+8）仅 UI 软限，硬校验仍由 `validateUserName` 兜底。
