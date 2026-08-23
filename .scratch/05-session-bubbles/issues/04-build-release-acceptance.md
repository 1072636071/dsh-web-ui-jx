# 04 · 构建与发布验收

**Status:** resolved

**Blocked by:** 02, 03

**构建内容：** 会话气泡列功能全量可构建、可发布：`npm run build`（host/client 双半区）与 `npm run verify`（21 项发布检查）全绿，产物可走 `npm publish` / `dsh plugin add link:<path>` 链路；人工视觉验收清单全部通过，确认双主题、触屏、拖动、溢出、空态等边界行为符合 DESIGN.md §4 与 ADR-0007。

**验收标准：**

- [ ] `npm run build` 成功产出 `lib/index.js` + `lib/client.js`（woff2 引用未解析属预期，非错误）
- [ ] `npm run verify` 全绿（产物非空、package.json 字段、cordis.patch.yml、assets 素材、npm pack 清单、素材大小）
- [ ] 人工视觉验收清单通过：
  - [ ] 深浅双主题（暗=墨金卷轴 / 浅=宣纸梅花）下气泡文字与状态点对比度正常（令牌双值）
  - [ ] 运行中金呼吸点动画流畅；`prefers-reduced-motion` 下静止
  - [ ] 触屏设备点击气泡可跳转；从气泡上拖动不误触发整盒拖动
  - [ ] 气泡列随浮层拖动整体移动；拖动后刷新位置保持
  - [ ] 上限折叠/展开在 5、1、10 三档下正确；无相关会话时气泡列消失
  - [ ] 台词气泡与气泡列并存互不遮挡
- [ ] 溢出边界回归：多会话（> 上限）时无气泡溢出视口、无样式崩坏

## 评论

- 回写（2026-08-23）：清点核实已实施——build/verify 发布链路多轮全绿，后续特性（06–09）均以此基线发布。状态由 ready-for-agent 补记为 resolved。

来源：`.scratch/05-session-bubbles/PRD.md` 测试决策（不自动化部分）+ 补充说明；AGENTS.md 构建与部署约束。