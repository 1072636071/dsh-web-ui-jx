# manifest 与依赖清单与新体系对齐

**Status:** done

**Blocked by:** 02, 04

**构建内容：** 根 package.json 的 dsh 依赖与 dsh.client 清单按新体系重排，使插件能被宿主/构建器正确组装与加载。

**验收标准：**

- [ ] dsh.client.inject 不再指向已移除的 client-runtime，改列实际依赖的 client 插件
- [ ] devDependencies 补齐 session/workspace 控制器、ui-slots、ui-conversation（取类型）与 cordis
- [ ] peerDependency 治理（含 ui-conversation 含 hero slot 的版本）落地
- [ ] 变更后 `npm run typecheck` 通过

## 评论

（依赖与清单为 release 装配门禁；需在多环境可达性上确认版本。具体文件路径见 PRD 与实现。）