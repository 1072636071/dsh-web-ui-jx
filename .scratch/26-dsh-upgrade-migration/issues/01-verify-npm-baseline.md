# 确认 npm 0.1.1 升级后的基线全绿

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 确认把 dsh-* 依赖升到 npm 0.1.1-rc.2 后，插件从用户视角仍可编译、可测试，作为后续迁移的验证基线。

**验收标准：**

- [ ] `npm run typecheck` 通过（tsc --noEmit，无错误）
- [ ] `npm run test` 全绿（现有全套用例）
- [ ] `dsh-client-ui-slots` 已作为直接类型依赖落位
- [ ] dsh-session-bubble 及其 plugin 的 dsh peer 已同步到 0.1.1-rc.2

## 评论

（升级依赖、重建 lockfile、跑通类型与测试的基线动作。）