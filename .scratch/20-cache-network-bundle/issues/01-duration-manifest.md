# 构建期时长 manifest

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 过渡动画时长解析零整文件下载——构建期生成素材时长 manifest，运行时优先读 manifest、无则回落原解析逻辑；`durationCache` 同步获得清理入口。

**验收标准：**

- [x] 构建产物含素材时长 manifest（沿用既有构建链或独立脚本）
- [x] `webp-duration` 优先读 manifest，缺项回落原解析逻辑，行为一致
- [x] `durationCache` 有清理入口（ADR-0017 可重入约束，dispose 时清空）
- [x] `webp-duration.test.ts` 扩展 manifest 读取/回落；全量测试 + build + verify 全绿

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 实施（2026-08-30，工单 20-01，M3）：`scripts/generate-duration-manifest.mjs` 扫描 `assets/character/*.webp` 生成 `assets/manifest.json`（34 素材，键 `character/<file>.webp` → 时长 ms）；`npm run build` 前置该脚本。`src/client/webp-duration.ts` 内联 import manifest，`loadWebpDurationMs` 优先查 manifest（零整文件下载）、缺项回落原解析；新增 `clearDurationCache()` 并在 `src/client/index.ts` root lifecycle disposer 调用（ADR-0017）。测试：manifest 命中零 fetch、缺项回落、绕过 manifest 的 URL 回落、manifest 与运行时解析一一一致、LRU 覆盖 34 素材、`clearDurationCache` 后重新请求。webp-duration.test.ts 21 项全绿；全量 596 项 + build + verify 22 项全绿。
- 来源：PRD 20 候选 M1；证据见 memorial 017 archived `index.html`（CharacterOverlay.tsx:448；webp-duration.ts:76-80 arrayBuffer 整文件；:73 durationCache 无清理入口）。
- 零运行时新 seam（不新建 host 路由；manifest 走 client bundle 内联）。
