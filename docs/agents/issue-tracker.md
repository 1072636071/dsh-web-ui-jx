# Issue 跟踪器：本地 Markdown

此仓库的 issue 和 PRD 以 markdown 文件形式存放在 `.scratch/` 中。

## 约定

- 每个功能一个目录：`.scratch/<NN>-<feature-slug>/`，`<NN>` 为从 `01` 起的全局递增顺序号，按创建先后排列（如 `01-login`、`02-checkout`）
- PRD 是 `.scratch/<NN>-<feature-slug>/PRD.md`
- 实现 issue 是 `.scratch/<NN>-<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 编号
- Triage 状态记录为每个 issue 文件顶部附近的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加到文件底部，在 `## 评论` 标题下

## 当技能说"发布到 issue tracker"时

在 `.scratch/<NN>-<feature-slug>/` 下创建新文件（如需要则创建目录；目录名带从 `01` 起的全局递增顺序号）。

## 当技能说"获取相关工单"时

读取引用路径的文件。用户通常会直接传递路径或 issue 编号。

## Wayfinding 操作

由 `/jxx-wayfinder` 使用。**地图**是一个文件，每个工单有一个**子**文件。

- **地图**：`.scratch/<NN>-<effort>/map.md` — 笔记/已做决策/迷雾正文。
- **子工单**：`.scratch/<NN>-<effort>/issues/NN-<slug>.md`，从 `01` 编号，问题在正文中。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：顶部附近的 `Blocked by: NN, NN` 行。当其列出的所有文件都 `resolved` 时，工单解除阻塞。
- **前沿**：扫描 `.scratch/<NN>-<effort>/issues/` 中开放、未阻塞、未认领的文件；按编号优先，第一个胜出。
- **认领**：设置 `Status: claimed` 并在任何工作前保存。
- **解决**：在 `## 答案` 标题下追加答案，设置 `Status: resolved`，然后将上下文指针（gist + 链接）追加到 `map.md` 中地图的已做决策中。
