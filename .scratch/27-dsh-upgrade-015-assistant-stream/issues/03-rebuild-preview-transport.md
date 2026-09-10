# 详情 transport 与 SessionEventStream 类型兼容核验（0.1.5）

**Status:** done

**Blocked by:** 01, 02

**构建内容：** 作为 GUI 用户，我希望详情窗预览仍能打开会话尾页取到历史数据。核验后修正了工单原假设：`SessionEventStream` 的 `open({ maxMessages })` / `dispose()` / `'replace'|'prepend'` 快照入口在 0.1.5 **依旧存在且语义兼容**——升级后残留的 3 条 `TS2339`（open/dispose 不存在）并非 API 移除，而是 `SessionEventStream` 现继承自 `@deepseek-ai/dsh-api-gateway/client` 的 `RemoteJournalStream`，该 peer 在 `--legacy-peer-deps` 安装口径下不自动装、导致基类成员在类型层不可见。故本工单实际交付＝声明该 peer 依赖并核验 transport 段无需改源码。

**验收标准：**

- [x] 定位并消除 3 条 transport `TS2339`：声明 `@deepseek-ai/dsh-api-gateway@^0.1.5-rc.1` 为 devDependency（build-time 类型来源，不进 bundle 运行时）
- [x] `createDshPreviewTransport` 的 `new SessionEventStream(remote, address, {publish,failed})` + `open({maxMessages})` + 读首个 `replace`/`prepend` 快照 `entries` + `finally dispose()` 与 0.1.5 契约一致，**源码零改动即通过 typecheck**
- [x] `npm run typecheck` 全绿；`npm test` 全量绿（683）
- [ ] 对活宿主起一次 web profile，hover 会话气泡取一次真实尾页预览非空（运行时冒烟，留待工单 04）

## 评论

**假设修正（重要）**：建单时（研究阶段）判读 `assistant-stream` 重构「移除 open/dispose」不准确——那 3 条错只是 `skipLibCheck:true` 下基类 peer 未装、继承成员不可见的类型假象。用「临时装 gateway → typecheck 立绿、transport 段一行未改」实验定案。真正需要动的是 `extractPreview` 的 in-flight 逻辑（工单 02），transport 层本身兼容。

**为何显式声明 gateway peer**：本项目 `--legacy-peer-deps` 安装（严格全新解析触发 npm `edgesOut null` bug、增量装撞 `dsh-agent` peer 冲突），peers 不自动装；而 detail 层直接 `import type` 了 `SessionEventStream`/`SessionJournalChange`，其类型闭包要求基类来源在 node_modules 可解析。声明为 devDep 是最小且正确的处理（`dsh-client-store` 经核验非必需，未声明）。

原证据（已被本工单修正解读）：`SessionEventStream` 现 `extends RemoteJournalStream`（`packages/api/gateway/src/client/journal-stream.ts`），基类公开 `open`/`prepend`/`restart`/`dispose`。
