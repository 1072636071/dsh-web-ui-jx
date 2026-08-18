# ADR-0001：独立 DSH Bundle 插件而非皮肤

**状态**: Accepted
**日期**: 2026-08-18

## 背景

目标是在 `dsh-web-ui-jx` 中实现 jiangxiao 角色素材插件的 UI。参考项目 `dsh-web-ui` 将 jiangxiao 实现为「皮肤」（skin，挂 skin-center，通过 `--dsw-*` remap 到唐风色板），并复用 `dsh-pet` 的导入/服务链。本项目参考该做法，但基础设施不齐。

## 决策

本插件采用**独立 DSH Bundle 插件**形态：独立仓库，`package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`（host/client 双半区），通过 `dsh plugin --profile web add link:...` 安装，可独立 npm 发布。复用 DSH 自定义插件加载链路，不复用 `dsh-web-ui` 的任何包（不依赖 dsh-pet / skin-center / dsh-skins）。

## 被否决的替代方案

1. **复用 dsh-pet 已有导入/服务链** — 依赖外部包的宿主链，本项目无法独立测试/发布。
2. **做成皮肤挂 skin-center** — 与独立发布、完全掌控的目标相悖；皮肤层不适合承载导入 API（host 半区）与角色浮层（client chrome）。

## 影响

- 自建 host 半区注册 `/api/dsh-jx/*` 路由（导入 API + 素材服务），client 半区注入管理 UI + 角色浮层 + 设置卡 + 侧边栏入口。
- 素材服务链复用宿主原生 `ctx.webServer.register` + `ctx.storageDomain`，无需扩展宿主。
- 设计令牌继承过来但架构定位为「插件」而非「皮肤」。