# AGENTS.md

## 多代理要求

AGENTS.md 和 CODEBUDDY.md 内容必须保持一致。

## Agent skills

### Issue tracker

本地 markdown issue tracker（`.scratch/` 下）。参见 `docs/agents/issue-tracker.md`。

### triage 标签

五个标准 triage 角色，标签字符串与角色名相同（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。参见 `docs/agents/triage-labels.md`。

### 领域文档

单一上下文（仓库根目录 `CONTEXT.md` + `docs/adr/`）。参见 `docs/agents/domain.md`。

### 临时文件

所有临时脚本统一放在仓库 `.temp/scripts/` 下；其他临时文件（脚本输出、日志等）也要分类，放在 `.temp/` 的子目录下（如 `.temp/output/`、`.temp/logs/`），保证仓库根目录干净。

### 构建与部署约束

每次修完代码或加入新功能后，必须尝试构建打包并验收（deploy 前验证），不得留到发布时才构建。标准流程：

```bash
npm run build     # 构建 host/client 双半区产物（lib/index.js + lib/client.js）
npm run verify    # 发布前验收（scripts/verify-release.mjs，21 项检查）
```

- `npm run build`：`vite build` 串联两次调用，产出 `lib/index.js`（host 半区）与 `lib/client.js`（client 半区，内联 CSS）。
- `npm run verify`：检查构建产物非空、package.json 字段、`cordis.patch.yml`、assets 素材、`npm pack --dry-run` 清单、素材大小；任一失败退出码 1。
- `prepublishOnly` 钩子会自动执行 `build && verify`，但日常改动应在提交/部署前主动跑一遍，确保改动可正常构建。
- 字体 `*.woff2` 引用在构建期未解析属预期（运行时由宿主 `/api/dsh-jx/fonts/*` 路由服务），非错误。
- 部署方式即发布/安装链路：`npm publish` 或 `dsh plugin --profile web add link:<path>`；验收通过即具备发布条件。
