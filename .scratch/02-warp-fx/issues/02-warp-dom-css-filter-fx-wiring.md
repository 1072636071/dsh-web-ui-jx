# warp DOM 薄壳 + CSS + SVG filter + FX 接入 + 移除 breathe

**Status:** resolved

**Blocked by:** 01

**构建内容：** 鼠标移动时鼠标周围出现光线扭曲光圈（SVG `feDisplacementMap` 像素位移 + `--jx-moon` 边缘光）跟手，停下 400ms 淡出；设置卡可独立开关 warp；`prefers-reduced-motion` 与 `pointer: coarse` 下降级关闭；breathe 特效及其代码/CSS 完全移除；FX 系统保持 5 类（warp 替换 breathe 位置）。

**验收标准：**

- [ ] `warp.ts` 实现 `startWarp`/`stopWarp`（DOM 薄壳：创建元素 + `pointermove` 监听 + `requestAnimationFrame` 调度 + `transform`/`opacity` 写入 + 元素移除），调用工单 01 的纯逻辑控制器
- [ ] `fx.css` 新增 warp 段：fixed 圆形元素 + `mask: radial-gradient` 限定圆形 + `--jx-moon` 边缘光 opacity ~0.08 + CSS 自定义属性参数（`--jx-warp-radius: 200px`、`feDisplacementMap scale: 15`、淡出 400ms）+ reduced-motion 关闭段
- [ ] SVG filter 定义（`feTurbulence` + `feDisplacementMap`）挂载到 DOM，参数固定不随鼠标重算
- [ ] `FX_NAMES`: `shimmer/fall/grain/breathe/micro` → `shimmer/fall/grain/warp/micro`；`FxName` 类型 + `FX_CLASS`/`FX_START`/`FX_STOP` 映射更新；`defaultState`/`allOffState` 字段名同步
- [ ] 删除 `src/client/fx/breathe.ts`；删除 `fx.css` 中 breathe 段（L122–L152）+ reduced-motion breathe 段（L205–L209）
- [ ] 鼠标移动时扭曲光圈出现跟手，停下 400ms 淡出隐藏
- [ ] 扭曲光圈 `pointer-events: none`，不拦截指针
- [ ] 设置卡可独立开关 warp（`html.fx-warp` 类 + `localStorage('jx-fx')` 的 `warp` 字段）
- [ ] `prefers-reduced-motion: reduce` 下 warp 全关
- [ ] `pointer: coarse` 设备不挂监听、不创建元素
- [ ] `localStorage` 旧 `breathe` 字段被静默忽略（`readStoredState` 按 `FX_NAMES` 遍历自动忽略，无需额外代码）
- [ ] 深浅双主题下扭曲光圈都正常呈现（`--jx-moon` 双值覆盖）
- [ ] `npm run build` 通过；`npm run verify` 通过（AGENTS.md 构建与部署约束）
- [ ] `DESIGN.md` §5 FX 表 breathe→warp 无回归（grill 阶段已更新）

## 评论

- 回写（2026-08-23）：清点核实已实施——warp DOM/CSS/SVG filter 接线完成，breathe 移除、FX 保持 5 类（提交 d17a098「warp 特效替换 breathe」）。状态由 ready-for-agent 补记为 resolved。

来源：`.scratch/02-warp-fx/PRD.md`（实现决策 1–11）+ ADR-0005。
预重构确认：`fx/index.ts` 的 `syncJsEffects` 已自动调度 `FX_START`/`FX_STOP`，warp 的 start/stop 会被调用，控制器无需结构性改造；`readStoredState` 按 `FX_NAMES` 遍历，旧 `breathe` 字段自动忽略。
