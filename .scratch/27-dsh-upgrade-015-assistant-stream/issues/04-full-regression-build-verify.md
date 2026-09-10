# 0.1.5 升级全量回归与构建验收

**Status:** ready-for-agent

**Blocked by:** 02, 03

**构建内容：** 作为发布者，我希望这次 0.1.5 同步在构建门禁与运行时都无可回归，方可合入（依 `AGENTS.md` 的「修完即构建验收」约束）。

**验收标准：**

- [ ] `npm run build`（host/client 双半区）与 `npm run verify`（21 项发布前检查）全绿
- [ ] `npm run test` 全量通过（既有套件 + 工单 02/03 更新的 detail 用例）
- [ ] 起 web 宿主冒烟：角色浮层、侧边栏入口、会话气泡列、气泡 hover 详情窗预览、新建会话问候运行时表现与升级前一致，无可见回归
- [ ] 回滚安全：升级只在依赖与 detail 数据层落地，未改产品文案与角色资产

## 评论

可选优化（不阻塞合入，若要做另开工单）：
- 借 `assistant/attempt` 的 `stream: AssistantStreamRecord[]` 让「最后一条助手文本」提取比现在只读 `assistant/message` 更稳。
- 新导出 `PendingSubmission*Attachment`（文件上传）与 `SessionTransientEventEntry`，若产品想让气泡预览显示附件 / 流式打字效果可接入。
