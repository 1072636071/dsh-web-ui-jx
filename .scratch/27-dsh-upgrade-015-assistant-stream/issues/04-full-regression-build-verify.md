# 0.1.5 升级全量回归与构建验收

**Status:** ready-for-human

**Blocked by:** 02, 03

**构建内容：** 作为发布者，我希望这次 0.1.5 同步在构建门禁与运行时都无可回归，方可合入（依 `AGENTS.md` 的「修完即构建验收」约束）。

**验收标准：**

- [x] `npm run build`（host/client 双半区）与 `npm run verify`（发布前检查）全绿 —— 于 HEAD `107411d` 复跑：build=0、verify 全项通过（lib/index.js 206.9KB、lib/client.js 147.9KB 未回归）
- [x] `npm run test` 全量通过（既有套件 + 工单 02/03 更新的 detail 用例）—— vitest 42 文件 / 683 用例全过；`npm run typecheck` 0 错
- [ ] 起 web 宿主目视冒烟：角色浮层、侧边栏入口、会话气泡列、气泡 hover 详情窗预览、新建会话问候运行时表现与升级前一致 —— **环境所阻，见评论**（本会话无 `dsh` CLI / 无在跑的 web 宿主 / 无浏览器自动化工具，`:5173` 经确认是无关 SPA dev server），不做无据打勾
- [x] 回滚安全：升级只在依赖与 detail 数据层落地，未改产品文案与角色资产 —— 升级提交 `ff693a5` 改动面 = `package.json`/`package-lock.json`/`dsh-session-bubble/package.json` + `detail-data.ts` + 其测试 + 本工单文件，`assets/`、文案零触碰

## 评论

**已做的可自动化核验（部分替代冒烟）**：
- 静态产物冒烟：`lib/client.js`+`lib/index.js` 已删符号残留均为 0（`assistant/chunk` / `"chunks"` / `isAssistantChunkEvent` / `dsh-client-runtime`），且 `transient` 新逻辑确已编入 client 半区；`node --check lib/index.js` 语法通过；`npm run build` 成功即证 client 半区可被宿主加载。
- 门禁全绿：typecheck 0 / test 683 / build / verify。

**未做的（需人工或浏览器桥）**：活宿主目视回归。复现路径（任一即可，做完把本框打勾并转 `done`）：
1. 起宿主：`cd ~/.dsh/profiles/web` → 用 dsh 起 web profile（本项目已以 `link:E:/work/sp/dsh-web-ui-jx` 登记）；源码若改先 `npm run build` 再让宿主拉 `/plugins/dsh-web-ui-jx/client.js`。
2. 逐项看：① 角色浮层挂载/拖拽/切换；② 侧边栏入口出现；③ 会话气泡列渲染与点击跳转；④ hover 气泡弹详情窗、尾页预览有内容（关键——走改过的 `extractPreview` + `createDshPreviewTransport`）；⑤ 模型正在生成时详情窗 in-flight 占位出现（现由 `transient`/`assistant/live-chunk` 触发）；⑥ 新建会话问候台词照常。
3. 或：用户启用浏览器自动化桥（kimi-webbridge）后由我驱动冒烟。

**结论**：可自动化部分全绿；`Status` 暂置 `ready-for-human`，待上述目视冒烟通过再转 `done`。

可选优化（不阻塞合入，另开工单）：借 `assistant/attempt` 的 `stream` 让「最后一条助手文本」更稳；接入 `PendingSubmission*Attachment` 做附件预览。
