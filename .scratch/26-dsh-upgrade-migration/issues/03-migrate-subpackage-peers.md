# dsh-session-bubble 及 plugin 的类型与 peer 迁移

**Status:** done

**Blocked by:** 02

**构建内容：** 会话气泡子包及其 plugin 的依赖来源同步迁移，使它们在与根插件同构的新依赖下仍可编译、可测试。

**验收标准：**

- [ ] dsh-session-bubble 的类型来源与 peerDependencies 同步到新包
- [ ] dsh-session-bubble-plugin 的 client 入口依赖同步
- [ ] 子包用例 `npm run test` 通过

## 评论

（与 02 同类的机械迁移，按子包独立成批。）