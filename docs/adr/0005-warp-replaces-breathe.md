# ADR-0005：用 warp（鼠标光线扭曲）替换 breathe（墨光呼吸背景）

**状态**: Accepted
**日期**: 2026-08-18

## 背景

用户需求：把"背景的波纹动效"换成"鼠标移动过去，光线扭曲的特效"。

经全仓库探索，代码库中无典型波纹/涟漪扩散实现。用户口语中的"波纹动效"实际指
`breathe`（墨光呼吸背景）：全屏 `body[data-dsh-jiangxiao]::before` 伪元素，
`radial-gradient(ellipse at 50% 40%, var(--jx-moon), transparent 70%)` + opacity
0.04↔0.08 呼吸，8s 周期，纯 CSS，自动播放，无鼠标交互
（`src/client/styles/fx.css` L129–L152，`src/client/fx/breathe.ts` noop 占位）。

FX 特效系统共 5 类（shimmer/fall/grain/breathe/micro），由 `src/client/fx/index.ts`
的 `FX_NAMES` + `FX_CLASS`/`FX_START`/`FX_STOP` 映射 + `html` 上 `fx-*` 类 +
`localStorage('jx-fx')` 控制，零动画库依赖，`prefers-reduced-motion` 全关降级。

## 决策

删除 `breathe`，新增 `warp` fx 类型替代其位置。

### warp 特效定义

- **语义**：鼠标光线扭曲特效——鼠标周围局部位移扭曲光圈，"找鼠标的小特效工具"。
- **技术**：SVG `<filter>` 内 `feTurbulence`（生成扰流位移图）+ `feDisplacementMap`
  （像素位移），挂在一个 fixed 定位的圆形元素上。filter 参数固定不重算，鼠标移动只
  更新元素 `transform: translate(x,y)`（GPU 合成层，几乎零成本）。
- **作用范围**：仅鼠标周围局部（默认半径 200px 圆内），用 `mask: radial-gradient`
  限定。非全屏。
- **生命周期**：`pointermove` 时显示并跟手，鼠标停下后 400ms 淡出隐藏。一动即现帮
  定位，停下消失不挡视线。
- **触发**：`pointermove` 监听，rAF coalesce 节流。无 hover 设备
  （`pointer: coarse`）自动关，不消耗性能。
- **美学**：位移扭曲为主 + 极微弱 `--jx-moon` 月色边缘光（opacity ~0.08）让光圈
  可见。符合 DESIGN.md §7（禁霓虹/高饱和渐变，`--jx-moon` 是低饱和氛围族）。
- **参数**：半径 `--jx-warp-radius: 200px`、`feDisplacementMap scale: 15`、淡出
  400ms，用 CSS 自定义属性暴露，可在 fx.css 调。
- **降级**：`prefers-reduced-motion: reduce` 全关，复用现有 `fx/index.ts` 机制。

### FX 系统变更

- `FX_NAMES`: `shimmer/fall/grain/breathe/micro` → `shimmer/fall/grain/warp/micro`
- `FxName` 类型、`FX_CLASS`/`FX_START`/`FX_STOP` 映射相应更新
- 删除 `src/client/fx/breathe.ts`，新增 `src/client/fx/warp.ts`（pointermove 监听 +
  rAF 跟随 + 淡出定时器 + 元素创建/移除）
- `src/client/styles/fx.css`：删除 breathe 段（L122–L152）+ reduced-motion breathe
  段（L205–L209），新增 warp 段 + SVG filter 定义 + reduced-motion warp 段
- `DESIGN.md` §5 FX 表：`breathe` 行 → `warp` 行
- `localStorage('jx-fx')` 旧 `breathe` 字段被忽略（无害，向前兼容）

## 被否决的替代方案

1. **保留 breathe 默认关 + 新增 warp 默认开** — breathe 变死代码，违背"换成"语义，
   且 6 类特效增加维护面。
2. **共存（breathe 不动 + 新增 warp）** — 违背"换成"语义；全屏背景呼吸 + 鼠标局部
   扭曲同时跑可能视觉冲突。
3. **纯 CSS 渐变 + backdrop-filter 模拟扭曲** — 性能最好但做不出真像素位移扭曲，
   只是光斑/透镜跟随，不满足"光线扭曲"语义。
4. **WebGL shader 自写或引入 three.js/pixi.js** — 真扭曲效果最炫，但破坏"零动画库
   依赖"现状，包体积增加，移动端/低端设备风险，与 DESIGN.md §1"沉浸但不扰工"哲学
   冲突。
5. **Canvas 2D getImageData + 像素位移** — 真位移但 CPU 像素操作性能差，全屏每帧
   重绘卡顿风险高。
6. **全屏持续扭曲（鼠标位置驱动扭曲中心）** — 视觉震撼但全屏 SVG filter 每帧重算
   性能开销大，低端设备掉帧。
7. **扭曲光圈无颜色（纯位移）** — 在纯色/低对比背景上看不出光圈边界，"找鼠标"功能
   不醒目。
8. **扭曲光圈用 --jx-gold 鎏金光晕** — 更醒目但偏炫，触碰 DESIGN.md §7 禁霓虹/高
   饱和红线，且与 shimmer 风格重复。

## 影响

- 失去全屏背景呼吸动效（breathe 已删）。如未来需加回全屏背景动效，需重新实现。
- FX 系统从 5 类变 5 类（替换不增容），但 warp 是首个**鼠标交互驱动**的 fx 类型
  （其余皆为自动播放或 hover 微交互），`fx/index.ts` 的"类切换即播放"模式需扩展
  以支持 pointermove 生命周期管理。
- 移动端（`pointer: coarse`）无鼠标，warp 自动关，FX 系统在移动端实际 4 类生效。
- `localStorage('jx-fx')` 旧用户的 `breathe: true` 字段被静默忽略，不报错；新用户
  写入 `warp` 字段。
- 新增 SVG filter 元素需挂载到 DOM（`body` 下一个隐藏 SVG 或 inline filter 定义），
  注意 SSR/宿主兼容。
- 性能预算：pointermove rAF coalesce + transform GPU 合成 + filter 参数固定，预期
  60fps 稳定；唯 SVG filter 首次创建有一次性开销。
