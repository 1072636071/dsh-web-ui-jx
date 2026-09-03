# hero 标题采用官方 slot 类型，移除临时声明

**Status:** done

**Blocked by:** 02

**构建内容：** 空态 hero 标题的占用不再依赖本地 declare module 临时形态，改用宿主的真实 slot 类型与注入/注册 API；开关关或插件缺席时仍回落宿主原文案。

**验收标准：**

- [ ] conversation.hero.headline 采用 ui-conversation 官方 slot 类型（owner 类型取自宿主）
- [ ] 移除本地 declare module 临时块
- [ ] 占用/注销随开关即时切换，行为与现状一致
- [ ] `npm run typecheck` 与相关 greeting 用例通过

## 评论

（对应 PRD 的切换条件：宿主发布含该 slot 的版本后，从临时形态切到真实类型。）