# 根插件 ClientContext / ISessions / IWorkspaces 类型来源迁移

**Status:** done

**Blocked by:** 01

**构建内容：** 插件浏览器半区与主机半区不再依赖已移除的 dsh-client-runtime；类型来源改从 cordis 与 session/workspace 控制器客户端入口解析，升级后仍可正常编译、渲染。

**验收标准：**

- [ ] ClientContext 改从 @deepseek-ai/cordis 导入
- [ ] ISessions / IWorkspaces 改从对应 controller 的 /client 入口导入，类型正确
- [ ] 保留 ctx.get('sessions'/'workspaces') 数据获取，行为不变
- [ ] 全工程 `npm run typecheck` 通过

## 评论

（机械再类型化：仅变更 import 来源，不改业务逻辑。）