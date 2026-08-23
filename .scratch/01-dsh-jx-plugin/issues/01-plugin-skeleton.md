# 插件骨架与安装链

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 用户能通过 `dsh plugin --profile web add link:...` 将本仓库安装为 DSH Bundle 插件；宿主正常加载 host/client 双半区，client 半区在页面注入一个可见的最小标记（证明注入链贯通）。这是贯穿构建链、host 半区、client 半区、安装链的追踪弹。

**验收标准：**

- [ ] `package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`（host/client 双半区），符合 DSH 自定义插件加载链路（deepseek-harness `docs/自定义插件/README.md`）
- [ ] 构建链可产出 host/client 两半区产物
- [ ] `dsh plugin --profile web add link:` 安装后宿主启动不报错
- [ ] client 半区注入在宿主页面上产生一个可见标记（最小注入验证）
- [ ] 不依赖 dsh-web-ui 任何包（dsh-pet / skin-center / dsh-skins）

## 评论

- 回写（2026-08-23）：清点核实已实施——插件骨架、双半区构建链（lib/index.js + lib/client.js）与 `dsh plugin add link:` 安装链贯通（初始提交 171368f）。状态由 ready-for-agent 补记为 resolved。
