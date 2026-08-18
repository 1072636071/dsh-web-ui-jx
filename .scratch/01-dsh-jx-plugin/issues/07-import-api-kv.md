# 导入 API 与 KV 元数据

**Status:** ready-for-agent

**Blocked by:** 02

**构建内容：** 用户能通过 API 导入素材 zip 或本地目录；导入进度可查询；导入完成后素材经素材路由可服务，导入状态/路径/manifest 元数据持久化于 KV。

**验收标准：**

- [ ] `ctx.storageDomain`（zod 声明式 domain）定义并记录导入状态 / 路径 / manifest 元数据
- [ ] 导入 API 接收 zip 与本地目录两种来源
- [ ] 导入进度可查询（进行中 / 完成 / 失败及原因）
- [ ] 导入的素材落入文件系统并经 `/api/dsh-jx/*` 素材路由可服务
- [ ] KV 只存元数据，不存素材二进制
- [ ] 测试经 HTTP seam 覆盖导入契约与错误路径；KV 读写经打开的 domain 断言（不测 zod schema 内部）
- [ ] zip 素材包格式契约在实现时定稿并回写 ADR

## 评论
