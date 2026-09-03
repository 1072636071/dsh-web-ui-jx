# 本地 0.1.2 源码链接复验

**Status:** ready-for-agent

**Blocked by:** 05

**构建内容：** 把 dsh-web-ui-jx 链接到本地 deepseek-harness 最新源码（0.1.2-rc.1），确认在最新宿主下完整编译、测试通过；作为本地对齐的前瞻复验。

**验收标准：**

- [ ] 本地相关 dsh client 包已 build 出 lib/ 产物
- [ ] 通过 file: 或 alias 链接后，`npm run typecheck` 通过
- [ ] `npm run test` 全绿
- [ ] 复验口径（npm 分发 vs 本地链接）有明确回退边界

## 评论

（两端并存的复验：不把本地链接作为唯一交付；peer 治理在 05 之后成为前提。）