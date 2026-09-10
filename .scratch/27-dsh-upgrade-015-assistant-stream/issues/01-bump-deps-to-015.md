# 依赖显式升级到 0.1.5-rc.1 并固化破坏面

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 作为维护者，我希望把插件所有 `@deepseek-ai/dsh-*` 依赖显式升到 `0.1.5-rc.1`（旧 `^0.1.2-rc.1` 因 npm 预发布语义不会跨 tuple 自动升级，`npm update` 也停在 0.1.2），让工程在新 SDK 下解析依赖，并把已核实的编译破坏面固化成后续修复的靶子。

**验收标准：**

- [x] 根 `package.json` 与 `dsh-session-bubble` 的 `dsh-*` 范围改为 `^0.1.5-rc.1`；`npm install` 刷新 lockfile（`dsh-*` 的 `latest` dist-tag 仍停留在 0.0.1-rc.1，须按精确/范围版本安装）
- [x] 实测修正：`dsh-credentials` / `dsh-settings` 并非"传递解析"可得——harness 0.1.5 把它们（及 session-controller 的 29 项依赖）都表达为 `peerDependencies`，干净安装不会自动装 peer，已将其显式补为 `devDependencies@^0.1.5-rc.1`
- [x] `npm run typecheck` 报错收敛到已核实的一组（7 条，全部落在 `dsh-session-bubble/src/detail/detail-data.ts`，assistant-stream 重构所致），无其它模块新增破坏
- [x] 记录经核实无需改动的面：`ISessions` 契约（`sessions.list` / `binding` / `open`）、`SessionSummary` / `SessionListState`、`ContentBlock`、`@deepseek-ai/cordis`（保持 `^4.0.1`，已解析 4.0.2）、storage-domain / workspace-controller

## 评论

**实现记录（本轮）**：改动仅三个受版本控制的文件——`package.json`、`packages/dsh-session-bubble/package.json`、`package-lock.json`（未动任何运行态源码；工作树里 `SessionBubbleList.tsx`/其测试/`vite.config.ts` 的改动是本工单之前就存在的，非本次引入）。

安装口径：先试严格全新解析触发 npm 内部 bug（`Cannot read properties of null (reading 'edgesOut')`），增量安装又因残留 0.1.2 树撞上 `dsh-agent` peer 冲突；最终用「清空 `node_modules` + `package-lock.json` → `npm install --legacy-peer-deps`」得到全 0.1.5-rc.1 一致树。`--legacy-peer-deps` 在此安全：所有 peer 均由同版本 0.1.5-rc.1 兄弟满足。已备份原 0.1.2 lock 至 `.temp/lock-012-pre01.bak`。

**⚠ 合入前须知**：本工单按设计不追求 `typecheck` 绿——它把破坏面固化成靶子。全绿在工单 02（detail 预览逻辑适配）+ 03（transport 适配新 stream 生命周期）完成；建议 01→02→03 作为一个可绿批次再提交，勿把红构建单独合入 main。

原始证据：本仓库试装 0.1.5-rc.1 跑 `tsc --noEmit`，7 个错误全在 `packages/dsh-session-bubble/src/detail/detail-data.ts`。根因为 harness 0.1.3→0.1.5 移除 `assistant/chunk` 事件类型、`ChunkRowEvent` / `'chunks'` 条目，并重构 `SessionEventStream`。承前 26-dsh-upgrade-migration（升到 0.1.2-rc.1）的下一段增量。
