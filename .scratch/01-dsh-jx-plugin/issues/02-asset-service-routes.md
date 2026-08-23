# 素材服务路由

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户（及后续 client 半区）能通过 HTTP 请求从 `/api/dsh-jx/*` 路由取到仓库内的真实素材——46 个角色 webp、2 个 woff2 字体、2 张预览图；请求不存在的素材或非法文件名时得到明确的错误响应。

**验收标准：**

- [ ] host 半区用 `ctx.webServer.register` 注册 `/api/dsh-jx/*` 素材路由（prefix 路由读本地文件）
- [ ] GET 素材返回正确字节流与响应头（Content-Type 按 webp/woff2/png 区分）
- [ ] 素材缺失返回 404；非法文件名（路径穿越等）被拒绝
- [ ] 测试以真实 HTTP 请求打路由（seam 1：不 mock webServer），覆盖成功与错误路径
- [ ] KV 不存素材二进制（素材本体只走文件系统 + 路由）

## 评论

- 回写（2026-08-23）：清点核实已实施——`src/host/asset-routes.ts` 提供 `/api/dsh-jx/*` 素材路由并持续演进（缓存头等）。状态由 ready-for-agent 补记为 resolved。
