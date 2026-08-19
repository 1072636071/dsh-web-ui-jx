# Map — 04-draggable-character-overlay

来源：`PRD.md`（本目录）+ `docs/adr/0006-draggable-character-overlay.md` + `CONTEXT.md`（角色浮层术语）+ `DESIGN.md` §4（可拖动专规）。

## 工单前沿

- **可立即开始**：01 overlay-position 纯逻辑模块 + 单元测试
- 01 后：02 CharacterOverlay 拖动接线
- 02 后：03 SettingsCard 重置浮层位置入口

## 已做决策

- 交互模型：整个浮层盒可拖，`pointer-events: none → auto`（反转 DESIGN.md §4 穿透原则，ADR-0006）。
- 定位：`left/top + transform: translate3d`（GPU 合成）；默认右下角 = 视口 - 尺寸 - 16px。
- 持久化：`localStorage('jx-overlay-pos')` JSON `{x,y}`，对齐 `jx-fx`/`jx-skin` 模式；缺省/malformed 回落默认，写失败静默。
- 测试 seam：复用 Seam 2（client 纯逻辑 + vitest node，先例 warp-controller.test），新 seam 数 = 0；DOM 薄壳不自动化。
- 位置状态用模块级单例 store（getSnapshot/set/subscribe/reset，镜像 overlayStateMachine），CharacterOverlay 订阅、SettingsCard 调 reset。
- 拖动用 Pointer Events + setPointerCapture 统一鼠标/触控；touch-action:none + user-select:none；交互子元素不触发拖动。
- 视觉/可访问性：cursor grab/grabbing + 拖中提视（opacity 0.85 + scale 1.02）；reduced-motion 无过渡。

## 迷雾

- StateSwitcher 状态切换按钮的构建属未来工单；本期只保证拖动排除交互子元素的机制。
- 重置按钮在设置卡的具体位置/文案未最终定稿，实现时按唐风极简定（设置卡底部或皮肤开关 section 内）。
