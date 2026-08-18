# PRD — warp-fx（鼠标光线扭曲特效替换 breathe 墨光呼吸）

Status: ready-for-agent
来源: grill 会话（jxx-grill-with-docs）+ ADR-0005 + CONTEXT.md + DESIGN.md §5/§7

## 问题陈述

DSH 宿主用户在繁杂界面中定位鼠标不便。现有 FX 特效系统的 `breathe`（墨光呼吸背景）是
**自动播放的全屏背景动效**（径向渐变 opacity 0.04↔0.08 呼吸，8s 周期，纯 CSS，挂在
`body::before`，无鼠标交互），不响应鼠标，对"找鼠标"无帮助。用户希望把这段背景波纹动效
换成**鼠标移动过去时鼠标周围出现光线扭曲特效**——像一个"找鼠标的小特效工具"：鼠标一动
就有扭曲光圈跟手出现，停下后光圈淡出消失不挡视线。

## 解决方案

删除 `breathe`，新增 `warp` fx 类型替代其位置（ADR-0005）：

- **技术**：SVG `<filter>` 内 `feTurbulence`（生成扰流位移图）+ `feDisplacementMap`
  （像素位移），挂在一个 fixed 定位的圆形元素上。filter 参数固定不重算，鼠标移动只更新
  元素 `transform: translate(x,y)`（GPU 合成层，几乎零成本）。
- **作用范围**：仅鼠标周围局部（半径 200px 圆内），`mask: radial-gradient` 限定。非全屏。
- **生命周期**：`pointermove` 时显示并跟手，鼠标停下后 400ms 淡出隐藏。
- **美学**：位移扭曲为主 + 极微弱 `--jx-moon` 月色边缘光（opacity ~0.08）让光圈可见。
- **降级**：`prefers-reduced-motion` 全关（复用现有机制）；`pointer: coarse`（移动端
  无鼠标）自动关。
- **控制**：复用现有 FX 控制器（`html.fx-warp` 类 + `localStorage('jx-fx')`），默认开，
  可在设置卡独立关。

## 用户故事

1. 作为 DSH 宿主用户，我想要鼠标移动时鼠标周围出现光线扭曲光圈，以便在繁杂界面中快速定位鼠标位置。
2. 作为 DSH 宿主用户，我想要鼠标停下后扭曲光圈淡出消失，以便静止时不挡视线。
3. 作为 DSH 宿主用户，我想要扭曲光圈跟随鼠标实时移动，以便光圈始终贴着鼠标。
4. 作为 DSH 宿主用户，我想要扭曲是真实的像素位移（直线变弯）而非简单光斑跟随，以便体现"光线扭曲"的物理感。
5. 作为 DSH 宿主用户，我想要扭曲光圈带微弱月色边缘光，以便在纯色/低对比背景上也能看出光圈边界。
6. 作为 DSH 宿主用户，我想要在设置卡中独立开关 warp 特效，以便按性能和偏好定制体验。
7. 作为 DSH 宿主用户，我想要 warp 默认开，以便开箱即有"找鼠标"体验。
8. 作为 DSH 宿主用户，我想要 `prefers-reduced-motion` 下 warp 自动关闭，以便满足可访问性需求。
9. 作为 DSH 宿主用户（移动端/触屏设备），我想要 warp 在无鼠标设备（`pointer: coarse`）上自动关闭，以便不消耗性能且不产生无意义特效。
10. 作为 DSH 宿主用户，我想要扭曲光圈不拦截鼠标指针（`pointer-events: none`），以便能正常点击光圈覆盖区域的 UI。
11. 作为 DSH 宿主用户，我想要原 breathe 墨光呼吸背景被移除，以便背景不再有自动呼吸动效（已被 warp 替代）。
12. 作为 DSH 宿主用户，我想要扭曲光圈配色用 `--jx-moon` 月色氛围族，以便保持墨光美学、不引入霓虹/高饱和渐变（DESIGN.md §7）。
13. 作为 DSH 宿主用户，我想要扭曲光圈半径约 200px，以便光圈足够醒目又不过分遮挡。
14. 作为 DSH 宿主用户，我想要鼠标快速移动时光圈跟手不卡顿，以便体验流畅（60fps）。
15. 作为 DSH 宿主用户，我想要深色主题（墨金卷轴）与浅色主题（宣纸梅花）下扭曲光圈都正常呈现，以便跟随宿主明暗切换。
16. 作为开发者，我想要 warp 的生命周期/coalesce/降级逻辑提取为纯函数，以便用 vitest node 环境单元测试（复用 state-machine 同款 seam）。
17. 作为开发者，我想要 warp 的 DOM 副作用（pointermove 监听、transform 写入、rAF 调度、元素创建/移除）放在薄壳层，以便纯逻辑与 DOM 解耦。
18. 作为开发者，我想要 warp 复用现有 FX 控制器（`fx/index.ts` 的 `FX_NAMES`/类切换/`localStorage`/reduced-motion 机制），以便不重建特效开关基础设施。
19. 作为开发者，我想要 warp 的参数（半径/扭曲强度/淡出时长）用 CSS 自定义属性暴露，以便调参只改 fx.css 一行。
20. 作为开发者，我想要 `localStorage('jx-fx')` 旧 `breathe` 字段被静默忽略，以便老用户升级不报错。
21. 作为维护者，我想要 `FX_NAMES` 从 `breathe` 替换为 `warp`（保持 5 类不增容），以便 FX 系统结构稳定。
22. 作为维护者，我想要 `DESIGN.md` §5 FX 表同步更新 `breathe`→`warp`，以便设计基准与代码一致。
23. 作为维护者，我想要 ADR-0005 记录此替换决策及 8 个被否决替代方案，以便未来读者理解为何移除全屏背景动效。

## 实现决策

1. **FX 系统变更**：`FX_NAMES`: `shimmer/fall/grain/breathe/micro` →
   `shimmer/fall/grain/warp/micro`；`FxName` 类型、`FX_CLASS`/`FX_START`/`FX_STOP`
   映射相应更新。FX 系统仍 5 类，替换不增容。
2. **删除 breathe**：移除 `src/client/fx/breathe.ts`；移除 `src/client/styles/fx.css`
   中 breathe 段（L122–L152）与 reduced-motion breathe 段（L205–L209）。
3. **新增 warp 模块**：`src/client/fx/warp.ts` 导出 `startWarp`/`stopWarp`（与现有
   fx 子模块同接口）。内部结构为"纯逻辑控制器 + DOM 薄壳"：
   - 纯逻辑控制器：给定 pointermove 事件序列 + 当前时间戳 + 设备能力
     （`pointer: coarse` / `prefers-reduced-motion`），返回元素目标状态
     `{ visible, x, y, fadePhase }`。包含 rAF coalesce 逻辑（一帧内多次 move 只取最后位置）
     与淡出状态机（移动→显示；停下累计超 400ms→淡出→隐藏）。
   - DOM 薄壳：`addEventListener('pointermove', ...)`、`requestAnimationFrame` 调度、
     元素创建/移除、`style.transform`/`style.opacity` 写入。薄壳不包含可测逻辑。
4. **warp CSS**：`fx.css` 新增 warp 段——fixed 定位圆形元素 + SVG filter 引用 +
   `mask: radial-gradient` 限定圆形 + `--jx-moon` 边缘光 + reduced-motion 关闭段。
   参数用 CSS 自定义属性暴露：`--jx-warp-radius: 200px`、`feDisplacementMap scale: 15`、
   淡出 400ms。
5. **SVG filter 定义**：`feTurbulence`（生成扰流位移图）+ `feDisplacementMap`（像素
   位移），参数固定不随鼠标重算。filter 元素挂载到 `body` 下隐藏 SVG 或 inline 定义。
6. **触发与生命周期**：`pointermove` 监听（rAF coalesce 节流），鼠标移动时元素
   `transform: translate(x,y)` 跟手（GPU 合成层），停下累计 400ms 后 opacity 淡出至 0
   并隐藏。`pointer: coarse` 设备不挂监听、不创建元素。
7. **美学**：位移扭曲为主 + 极微弱 `--jx-moon` 月色边缘光（opacity ~0.08）。只用
   `--jx-*` 氛围族令牌，不引入高饱和渐变（DESIGN.md §7）。
8. **降级**：`prefers-reduced-motion: reduce` 下 warp 全关，复用 `fx/index.ts` 现有
   机制（不应用 `fx-warp` 类 + reduced-motion 媒体查询监听）。
9. **FX 控制器扩展**：`fx/index.ts` 的"类切换即播放"模式需扩展以支持 warp 的
   pointermove 生命周期——`startWarp` 时挂监听+创建元素，`stopWarp` 时移除监听+销毁
   元素。这是 FX 系统首个鼠标交互驱动的 fx 类型（其余皆自动播放或 hover 微交互）。
10. **localStorage 向前兼容**：`readStoredState` 解析旧 `{breathe: true}` 时静默忽略
    `breathe` 字段（不报错、不影响其他字段），新用户写入 `warp` 字段。
11. **DESIGN.md §5 同步**：FX 表 `breathe` 行 → `warp` 行（效果/实现/关闭后描述）。
12. **ADR-0005**：已创建于 `docs/adr/0005-warp-replaces-breathe.md`，记录决策 + 8 个
    被否决替代方案 + 影响面。

## 测试决策

- **好测试的定义**：只测外部行为（输入事件序列 → 输出元素目标状态），不测实现细节
  （DOM API 调用、CSS 类名、中间变量）。
- **Seam：复用 Seam 2 模式**（client 纯逻辑 + vitest node 环境，与
  `tests/client/state-machine.test.ts` 同款）。新 seam 数 = 0。
- **被测模块**：`src/client/fx/warp.ts` 导出的纯逻辑控制器（或提取到
  `src/client/fx/warp-controller.ts`）。DOM 薄壳不在自动化测试范围。
- **覆盖**：
  - 移动 → `visible=true` + `(x,y)` 跟手等于事件坐标。
  - 停下累计 ≤ 400ms → 仍 `visible=true`；> 400ms → 进入淡出 → `visible=false`。
  - rAF coalesce：一帧内多次 move，控制器只取最后位置。
  - `pointer: coarse` → 永不 `visible=true`（不挂监听）。
  - `prefers-reduced-motion: reduce` → 永不 `visible=true`。
  - 半径/强度参数从 CSS 自定义属性读取后传入控制器生效。
  - `startWarp`/`stopWarp` 幂等：重复调用安全。
- **测试先例**：`tests/client/state-machine.test.ts`（纯逻辑、node 环境、输入意图断言
  输出快照、不依赖 DOM/React）。
- **不自动化部分**：DOM 副作用（pointermove 监听、transform 写入、rAF 调度、SVG filter
  实际渲染、扭曲外观、月色边缘光、跟手流畅度）靠人工视觉验证，沿用 FX 系统 5 类特效皆无
  自动化视觉测试的惯例（PRD-01 测试决策："视觉/令牌正确性以 DESIGN.md 人工审查 + 静态
  原型比对为准，不自动化"）。

## 超出范围

- 引入 WebGL/Canvas/动画库（three.js/pixi.js/gsap/lottie 等）——维持零动画库依赖现状
  （ADR-0005 被否决方案 4）。
- 全屏背景动效的替代品——breathe 已删，不新增其他全屏背景动效。如未来需加回，另立功能。
- warp 参数（半径/强度/淡出）的最终调优值——PRD 给推荐默认值（200px/15/400ms），最终
  值在实现时人工视觉调优后定稿。
- 移动端 `touchmove` 触发扭曲——本期仅 `pointer: coarse` 自动关，触摸触发扭曲留作后续
  扩展（若需要另立功能）。
- warp 之外 4 类特效（shimmer/fall/grain/micro）的任何改动——它们不在本次替换范围。
- 纯 CSS 渐变+backdrop-filter 伪扭曲方案——已否决（做不出真像素位移，ADR-0005 方案 3）。

## 补充说明

- 此需求是 ADR-0005 的实现，grill 会话（jxx-grill-with-docs）已确认 5 项核心决策
  （替换/技术/范围/生命周期/美学）+ 3 项按惯例自定（参数默认值/降级/命名）。
- 领域词汇以 `CONTEXT.md` 为准（`warp` / `breathe` 已移除）；架构决策以 ADR-0005 为准；
  视觉以 `DESIGN.md` §5（FX 表）/§7（禁用项）为准。
- 性能预算：`pointermove` rAF coalesce + `transform` GPU 合成 + filter 参数固定不重算，
  预期 60fps 稳定；唯 SVG filter 首次创建有一次性开销。
- 失去全屏背景呼吸动效（breathe 已删）是已接受的代价（用户明确"换成"语义）。
- FX 系统从"全部自动播放/hover"扩展出首个"鼠标交互驱动"类型，`fx/index.ts` 的控制模式
  需相应扩展（实现决策 9）。
