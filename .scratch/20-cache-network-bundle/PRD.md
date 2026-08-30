# 网络缓存与包体：时长 manifest / inspect 缓存 / 素材减重

Status: ready-for-agent

## 问题陈述

过渡素材时长解析要 `arrayBuffer()` 取**完整文件**再逐 chunk 解析，单个素材 2.37–12.37 MB，首次播放即一次完整下载 + 大 Buffer 分配；`session-messages` 的 inspect 无缓存、无 in-flight 去重，悬浮预览高频打开同一会话时重复全量读日志；AI 动态标题服务端每次请求都调 LLM（无缓存/去重），客户端缓存无界且 TTL 可被最后一次响应全局覆写；`assets/` 总体积 ≈187 MB（单文件最大 12.37 MB）；client 产物关闭压缩且双半区体积无可观测基线。

## 解决方案

构建期生成素材时长 manifest，运行时优先读 manifest 零下载；inspect 加短 TTL 缓存 + in-flight 去重；AI 标题服务端短 TTL 缓存 + 客户端 LRU 上限与按 entry 的 TTL；素材分批压测减重；client 压缩小步验证；体积基线并入发布验收。

## 用户故事

1. 作为用户，我想要过渡动画时长解析不下载整文件，以便首次播放更省流量与内存。
2. 作为用户，我想要悬浮预览高频打开同一会话时不重复全量读日志，以便更跟手。
3. 作为用户，我想要 AI 动态标题不重复发请求，以便不浪费 endpoint 额度。
4. 作为发布者，我想要插件体积显著减小，以便安装更快、分发更轻。
5. 作为发布者，我想要双半区产物体积有可观测基线，以便体积回归无感。

## 实现决策

- **M1（时长 manifest）**：构建期生成 `assets/manifest.json` 固化每素材时长（沿用既有构建链或独立脚本）；`webp-duration` 改为优先读 manifest、无则回落原解析逻辑；同步给 `durationCache` 加清理入口（ADR-0017 可重入约束）。
- **M3（inspect 缓存）**：`session-messages` 按 `sessionId` 加短 TTL 缓存 + in-flight Promise 去重；缓存必须随 archived / retention 变更联动失效（ADR-0028）。
- **M4（ai-title 缓存）**：服务端按 `sessionId + updatedAt` 加短 TTL 缓存 + in-flight 去重；客户端 cache 加 LRU 上限，`ttlMs` 改为按 entry 存储（消除全局覆写）。
- **H2（素材减重）**：先拿 `happy.webp`（12.37 MB）单文件试压（帧数 / 分辨率 / 有损质量三档），确认循环自然三原则（首尾帧对齐）与视觉不受损后，再治理全部 >6 MB 的 13 个文件；中文字体子集化单独立项。触动的资产按 ADR-0012/0021 口径复核。
- **L3（client 压缩）**：评估开启压缩 + 保留顶层变量名（`keep_names`/`reservedNames`）的可行性，先小步验证，再全量；不改则不裸开。
- **L4（体积基线）**：`scripts/verify-release.mjs` 增加双半区产物体积断言，使体积回归在发布前被发现。

## 测试决策

- 复用既有 seam，零新建运行时 seam。
- M1：`webp-duration.test.ts` 扩展 manifest 读取 / 回落逻辑；若走 host 侧校验则复用既有 HTTP seam。
- M3：session-messages 相关测试补缓存命中 / 失效 / in-flight 合并。
- M4：`dynamic-title.test.ts` 补 LRU 上限与按 entry TTL；`ai-title-route.test.ts` 补服务端缓存与去重。
- H2：验收 = 体积阈值断言 + 视觉回归（暗/亮）+ `npm run build && npm run verify` 全绿。
- 先例：`tests/client/webp-duration.test.ts`、`tests/host/session-messages.test.ts`、`tests/host/ai-title-route.test.ts`。

## 超出范围

- C1 / H3 / H4 / H1 / M2 / U2 / M5 / L2 / U1 / U3 / U4 —— 见 18/19/21 号 PRD。

## 补充说明

- 证据见 memorial 017 archived `index.html`（M1 / M3 / M4 / H2 / L3 / L4 卡片）。
- M1 与 H2 是同一主题（素材体积与加载成本）的两面，建议排在同一迭代。

