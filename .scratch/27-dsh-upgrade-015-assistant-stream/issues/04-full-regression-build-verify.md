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
- 静态产物冒烟：`lib/client.js`+`lib/index.js` 已删符号残留均为 0（`assistant/chunk` / `"chunks"` / `isAssistantChunkEvent` / `dsh-client-runtime`），且 `transient` 新逻辑确已编入 client 半区；`node --check lib/index.js` 语法通过。
- **真宿主挂载冒烟（源码起）**：`node E:/work/sp/deepseek-harness/apps/cli/lib/bin.js --profile web --no-open --host 127.0.0.1 --port 3080` 起 dsh web 宿主（v0.9.0）成功；app 首页 HTTP 200；首页预加载清单里 **`dsh-web-ui-jx/client.js` 带解析 `rev` 出现**（= profile 成功挂载本插件、并解析到 0.1.5 运行时），且升级新引入的宿主 peer 客户端均在清单中（`dsh-api-gateway` / `dsh-api-session-controller` / `dsh-client-connection` / `dsh-client-file-upload` / `dsh-client-ui-conversation`）。
- 门禁全绿：typecheck 0 / test 683 / build / verify。

**未做（仅剩浏览器渲染目视，curl 无法执行宿主运行期的模块 federate 加载）**：角色浮层 / 侧边栏 / 气泡列 / hover 详情窗预览 / 生成中 in-flight 占位 / 新建会话问候是否照常画出来。宿主已在本机 `127.0.0.1:3080` 起好（token 见 `.temp/t04-host.log`，不入库），点开即用。逐项目视通过后把上框打勾并转 `done`；或启用 kimi-webbridge 后由我驱动。

**结论**：可自动化部分全绿；`Status` 暂置 `ready-for-human`，待上述目视冒烟通过再转 `done`。

可选优化（不阻塞合入，另开工单）：借 `assistant/attempt` 的 `stream` 让「最后一条助手文本」更稳；接入 `PendingSubmission*Attachment` 做附件预览。
